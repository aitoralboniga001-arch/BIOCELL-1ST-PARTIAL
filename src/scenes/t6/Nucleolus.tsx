/**
 * t6-nucleolus — The nucleolus and ribosome assembly.
 *
 * World: a cut-open nucleus (R = 4.5, cap removed for z > 1.2). The nucleolus sits in the middle and is cut by the
 * same plane, showing its layers: pale fibrillar centres (FC) with rDNA loops, each wrapped by a dark dense fibrillar
 * component (DFC), all inside the granular component (GC). Chromatin threads from three chromosome territories bring
 * their NORs into it. Two nuclear pores on the upper right are used for import and export.
 *
 *  0  the nucleolus: an electron-dense factory inside the nucleus
 *  1  NORs of different chromosomes come together in it
 *  2  FC: pale cores with the active rDNA
 *  3  DFC: pre-rRNA strands grow from the rDNA into the dense shell
 *  4  GC: rRNA + ribosomal proteins assemble into pre-ribosomal subunits (the granules)
 *  5  import: a ribosomal protein (NLS) enters through a pore with importin
 *  6  export: a pre-ribosomal subunit (NES) leaves with exportin and becomes a ribosome in the cytoplasm
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { CatmullRomCurve3, DoubleSide, InstancedMesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { rand, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, lumpySphere, NuclearPore, Protein, proteinMaterial, Ribosome, useDisposable, useKitHighlight, useStageCamera, type CamKey } from '@/three/kit';
import { cutPlane, LocalClipping, NucleusShell, randomWalk, threadGeometry } from './parts/nucleus';

export const P = [0, 0.14, 0.28, 0.43, 0.57, 0.72, 0.86] as const;

const R = 4.5;
const CUT = 1.2;
const C: V3 = [0, -0.2, 0.3];
const GC_R = 1.9;
const FCS: V3[] = [
  [-0.6, 0.35, 0.95],
  [0.55, 0.25, 0.9],
  [-0.05, -0.6, 0.95],
].map((o) => [C[0] + o[0], C[1] + o[1], o[2]] as V3);
const FC_R = 0.36;
const DFC_R = 0.62;
const COL = { nucleolus: '#ff922b', fc: '#ffe8cc', dfc: '#e8590c', gc: '#ffb066', rdna: '#9fd0ff', pre: '#74c0fc', nor: '#ffa94d', rp: '#b9a7e6', pre60: '#8e7cc3', importin: '#74c0fc', exportin: '#ff8787', nls: '#ffd43b', nes: '#ffa8a8', rrna: '#4fa3ff' };
const T = {
  nor: [0.15, 0.25],
  pre: [0.45, 0.55],
  assemble: [0.59, 0.67],
  imp: [0.735, 0.83],
  exp: [0.875, 0.95],
  ribo: [0.95, 0.98],
} as const;

const norm = (v: V3) => new Vector3(...v).normalize();
const N_IMP = norm([0.62, 0.77, 0.12]);
const N_EXP = norm([0.88, 0.45, 0.1]);
const ASSEMBLY: V3 = [C[0] + 1.25, C[1] - 0.55, 0.95];

/** rDNA loops inside each FC */
const RDNA: V3[][] = FCS.map((f, k) => randomWalk(70 + k, 16, f, FC_R * 1.4, 0.11));
/** NOR-bearing chromatin threads from three territories into the FCs */
const NOR_THREADS: V3[][] = [
  { from: [-3.0, 2.2, -0.6] as V3, fc: 0 },
  { from: [2.9, 2.0, -0.9] as V3, fc: 1 },
  { from: [-2.4, -2.8, -0.5] as V3, fc: 2 },
].map(({ from, fc }, k) => {
  const walk = randomWalk(90 + k, 10, from, 1.2, 0.3, from);
  const end = walk[walk.length - 1];
  const f = FCS[fc];
  return [...walk, [(end[0] + f[0]) / 2, (end[1] + f[1]) / 2, (end[2] + f[2]) / 2 - 0.2] as V3, f];
});
const NOR_SEG: V3[][] = NOR_THREADS.map((th) => th.slice(-3));
/** pre-rRNA strands (Christmas trees) along the rDNA */
const STRANDS = RDNA.flatMap((loop, k) =>
  loop.filter((_, i) => i % 2 === 0).map((p, i) => {
    const d = new Vector3(p[0] - FCS[k][0], p[1] - FCS[k][1], p[2] - FCS[k][2]).normalize();
    return { p: new Vector3(...p), d, len: 0.12 + 0.18 * rand(k * 31 + i), i };
  }),
);

function poseOnSphere(n: Vector3, r: number) {
  return { pos: n.clone().multiplyScalar(r).toArray() as V3, q: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), n) };
}
const PORE_IMP = poseOnSphere(N_IMP, R);
const PORE_EXP = poseOnSphere(N_EXP, R);
const pathThrough = (n: Vector3, side: V3, inner: V3, outward: boolean) => {
  const outer = n.clone().multiplyScalar(R + 2.4).add(new Vector3(...side));
  const pts = [outer, n.clone().multiplyScalar(R + 0.6), n.clone().multiplyScalar(R - 0.6), new Vector3(...inner)];
  return new CatmullRomCurve3(outward ? pts.reverse() : pts);
};
const IMP_PATH = pathThrough(N_IMP, [-0.6, 0.4, 0.4], [C[0] + 0.9, C[1] + 1.55, 0.7], false);
const EXP_PATH = pathThrough(N_EXP, [0.4, 0.9, 0.5], ASSEMBLY, true);

const CAM: CamKey[] = [
  { at: 0, pos: [3.2, 2.2, 13.5], target: [0, 0, 0], fov: 38 },
  { at: 0.12, pos: [3.0, 2.1, 13.2], target: [0, 0, 0], fov: 38 },
  { at: 0.17, pos: [0.4, 1.2, 12.6], target: [0, 0.1, -0.3], fov: 38 },
  { at: 0.26, pos: [0.4, 1.1, 12.4], target: [0, 0.1, -0.3], fov: 38 },
  { at: 0.31, pos: [0.5, 0.3, 6.4], target: [0, -0.1, 0.6], fov: 38 },
  { at: 0.55, pos: [0.4, 0.2, 6.2], target: [0, -0.15, 0.6], fov: 38 },
  { at: 0.6, pos: [2.2, -0.3, 6.2], target: [0.8, -0.4, 0.6], fov: 38 },
  { at: 0.7, pos: [2.2, -0.3, 6.0], target: [0.8, -0.4, 0.6], fov: 38 },
  { at: 0.76, pos: [4.8, 4.4, 8.8], target: [2.2, 2.1, 0.4], fov: 40 },
  { at: 0.85, pos: [4.7, 4.3, 8.6], target: [2.2, 2.1, 0.4], fov: 40 },
  { at: 0.9, pos: [8.2, 4.0, 11.0], target: [3.6, 1.6, 0.2], fov: 40 },
  { at: 1, pos: [8.4, 4.0, 10.8], target: [3.8, 1.7, 0.2], fov: 40 },
];

const GRANULES = (() => {
  const out: V3[] = [];
  let k = 0;
  while (out.length < 260 && k < 5000) {
    k++;
    const v = new Vector3(rand(k * 3.1) * 2 - 1, rand(k * 5.7) * 2 - 1, rand(k * 7.3) * 2 - 1);
    const L = v.length();
    if (L > 1 || L < 0.05) continue;
    const p = v.multiplyScalar(GC_R * 0.95).add(new Vector3(...C));
    if (FCS.some((f) => p.distanceTo(new Vector3(...f)) < DFC_R + 0.1)) continue;
    out.push(p.toArray() as V3);
  }
  return out;
})();

function Granules({ plane }: { plane: ReturnType<typeof cutPlane> }) {
  const ref = useRef<InstancedMesh>(null);
  const mats = useDisposable(() => {
    const m = proteinMaterial(COL.pre60, { roughness: 0.5 });
    m.clippingPlanes = [plane];
    return [m];
  }, [plane]);
  useKitHighlight(mats, ['gc', 'pre-ribosomal-subunit'], {});
  useLayoutEffect(() => {
    const o = new Object3D();
    GRANULES.forEach((p, i) => {
      o.position.set(...p);
      o.scale.setScalar(0.07 + 0.03 * rand(i * 1.7));
      o.updateMatrix();
      ref.current!.setMatrixAt(i, o.matrix);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, GRANULES.length]} material={mats[0]}>
      <sphereGeometry args={[1, 10, 8]} />
    </instancedMesh>
  );
}

function Layer({ id, color, pos, r, plane, seed, opacity = 1 }: { id: string | string[]; color: string; pos: V3; r: number; plane: ReturnType<typeof cutPlane>; seed: number; opacity?: number }) {
  const geo = useDisposable(() => lumpySphere({ detail: 6, noise: 0.1, freq: 2.6, seed }), [seed]);
  const mats = useDisposable(() => {
    const m = new MeshStandardMaterial({ color, roughness: 0.75, side: DoubleSide, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    m.clippingPlanes = [plane];
    return [m];
  }, [color, plane, opacity]);
  useKitHighlight(mats, id, { opacity });
  return <mesh geometry={geo} material={mats[0]} position={pos} scale={r} />;
}

const lerp3 = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

export default function NucleolusScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const plane = useMemo(() => cutPlane(CUT), []);
  const geos = useDisposable(() => [threadGeometry(RDNA, 0.035, 8, 6), threadGeometry(NOR_THREADS, 0.07, 8, 6), threadGeometry(NOR_SEG, 0.09, 8, 6)], []);
  const mats = useDisposable(() => {
    const ms = [proteinMaterial(COL.rdna, { emissive: 0.2 }), proteinMaterial('#5c7cfa', { roughness: 0.6 }), proteinMaterial(COL.nor, { emissive: 0.25 }), proteinMaterial(COL.pre, { emissive: 0.25 })];
    ms.forEach((m) => (m.clippingPlanes = [plane]));
    return ms;
  }, [plane]);
  const rdnaM = useMemo(() => [mats[0]], [mats]);
  const chromM = useMemo(() => [mats[1]], [mats]);
  const norM = useMemo(() => [mats[2]], [mats]);
  const preM = useMemo(() => [mats[3]], [mats]);
  const norGlow = vis(t, T.nor[0], T.nor[1], 0.02) * 0.6;
  useKitHighlight(rdnaM, ['euchromatin', 'fc', 'rrna'], {});
  useKitHighlight(chromM, 'chromosome-territory', {});
  useKitHighlight(norM, 'nor', { glow: norGlow });
  const pre = seg(t, T.pre[0], T.pre[1]);
  useKitHighlight(preM, 'pre-rrna', { opacity: pre > 0.01 ? 1 : 0 });

  // assembly in the GC
  const asm = smooth(seg(t, T.assemble[0], T.assemble[1]));
  const asmShow = vis(t, T.assemble[0] - 0.015, 2, 0.015);
  // import
  const imp = smooth(seg(t, T.imp[0], T.imp[1]));
  const impShow = vis(t, T.imp[0] - 0.012, T.imp[1] + 0.04, 0.012);
  const impPos = IMP_PATH.getPointAt(imp).toArray() as V3;
  const importinOff = smooth(seg(t, T.imp[1] - 0.01, T.imp[1] + 0.025));
  // export
  const exp = smooth(seg(t, T.exp[0], T.exp[1]));
  const expPos = EXP_PATH.getPointAt(exp).toArray() as V3;
  const ribo = smooth(seg(t, T.ribo[0], T.ribo[1]));
  const subunitPos: V3 = t < T.exp[0] ? ASSEMBLY : expPos;

  return (
    <group>
      <LocalClipping />
      <NucleusShell radius={R} cutZ={CUT} pores={60} poreSize={0.17} lamina={0.6} laminaN={700} onmId="nucleus" inmId="nucleus" poreId="nuclear-pore" laminaId="nucleus" />

      {/* nucleolus: GC (outer, granular) ⊃ DFC (dense shells) ⊃ FC (pale cores) */}
      <Layer id={['nucleolus', 'gc']} color={COL.gc} pos={C} r={GC_R} plane={plane} seed={21} opacity={0.55} />
      <Granules plane={plane} />
      {FCS.map((f, k) => (
        <group key={k}>
          <Layer id="dfc" color={COL.dfc} pos={f} r={DFC_R} plane={plane} seed={30 + k} />
          <Layer id="fc" color={COL.fc} pos={f} r={FC_R} plane={plane} seed={40 + k} />
        </group>
      ))}
      <mesh geometry={geos[0]} material={mats[0]} />
      <Anchor id="nucleolus" position={[C[0] - 1.3, C[1] + 1.1, 0.6]} />
      <Anchor id="gc" position={[C[0] - 1.25, C[1] - 0.6, 1.0]} />
      <Anchor id="dfc" position={[FCS[1][0] + 0.45, FCS[1][1] + 0.2, 1.1]} />
      <Anchor id="fc" position={[FCS[0][0], FCS[0][1], 1.15]} />
      <Anchor id="euchromatin" position={[FCS[2][0] + 0.1, FCS[2][1] - 0.1, 1.15]} />

      {/* NOR-bearing chromatin from several chromosomes */}
      <mesh geometry={geos[1]} material={mats[1]} />
      <mesh geometry={geos[2]} material={mats[2]} />
      <Anchor id="chromosome-territory" position={NOR_THREADS[0][3]} />
      <Anchor id="nor" position={NOR_SEG[1][0]} />

      {/* pre-rRNA strands growing from the rDNA into the DFC */}
      {STRANDS.map((s, k) => {
        const g = pre * (0.6 + 0.4 * rand(k));
        if (g <= 0.01) return null;
        const b = s.p.clone().addScaledVector(s.d, s.len * g + 0.04);
        const mid = s.p.clone().lerp(b, 0.5);
        return (
          <mesh key={k} position={mid} material={mats[3]} quaternion={new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), s.d)} scale={[1, s.len * g + 0.04, 1]}>
            <cylinderGeometry args={[0.022, 0.022, 1, 6]} />
          </mesh>
        );
      })}
      <Anchor id="pre-rrna" position={STRANDS[3].p.clone().addScaledVector(STRANDS[3].d, 0.2).toArray() as V3} show={pre} />

      {/* assembly: rRNA + ribosomal proteins → pre-ribosomal subunit */}
      {Array.from({ length: 6 }, (_, k) => {
        const a = (k / 6) * Math.PI * 2;
        const from: V3 = [ASSEMBLY[0] + Math.cos(a) * 0.9, ASSEMBLY[1] + Math.sin(a) * 0.7, ASSEMBLY[2] - 0.2 + 0.2 * Math.sin(a * 2)];
        const to: V3 = [ASSEMBLY[0] + Math.cos(a) * 0.2, ASSEMBLY[1] + Math.sin(a) * 0.16, ASSEMBLY[2]];
        return <Protein key={k} id="ribosomal-proteins" shape="blob" color={COL.rp} size={0.17} seed={60 + k} position={lerp3(from, to, asm)} opacity={asmShow * (1 - smooth(seg(t, T.assemble[1], T.assemble[1] + 0.02)))} />;
      })}
      <mesh position={ASSEMBLY} material={mats[0]} scale={0.18 * asmShow * (1 - asm * 0.6)} visible={asmShow > 0.01}>
        <torusKnotGeometry args={[1, 0.25, 48, 6, 2, 3]} />
      </mesh>
      <Anchor id="rrna" position={[ASSEMBLY[0] - 0.25, ASSEMBLY[1] + 0.25, ASSEMBLY[2] + 0.1]} show={asmShow * (1 - asm)} />
      <Anchor id="ribosomal-proteins" position={[ASSEMBLY[0] + 0.7, ASSEMBLY[1] + 0.3, ASSEMBLY[2]]} show={asmShow * (1 - asm)} />
      {(() => {
        const o = smooth(seg(t, T.assemble[1] - 0.02, T.assemble[1] + 0.01)) * (1 - ribo);
        return o > 0.01 ? (
          <group position={subunitPos}>
            <Protein id="pre-ribosomal-subunit" shape="blob" color={COL.pre60} size={0.42} seed={71} opacity={o} />
            <Protein id="pre-ribosomal-subunit" shape="blob" color={COL.rp} size={0.3} seed={73} position={[0.16, 0.2, 0.05]} opacity={o} />
            {t > T.exp[0] - 0.02 && <Protein id="exportin" shape="blob" color={COL.exportin} size={0.32} seed={75} position={[-0.24, -0.12, 0.14]} opacity={o} />}
            {t > T.exp[0] - 0.02 && (
              <mesh position={[-0.05, -0.26, 0.18]}>
                <sphereGeometry args={[0.07, 12, 8]} />
                <meshStandardMaterial color={COL.nes} emissive={COL.nes} emissiveIntensity={0.4} />
              </mesh>
            )}
            <Anchor id="pre-ribosomal-subunit" position={[0.05, 0.05, 0.2]} show={o} />
            <Anchor id="exportin" position={[-0.3, -0.15, 0.2]} show={t > T.exp[0] - 0.02 ? o : 0} />
            <Anchor id="nes" position={[-0.05, -0.26, 0.2]} show={t > T.exp[0] - 0.02 ? o : 0} />
          </group>
        ) : null;
      })()}
      {ribo > 0.01 && (
        <group position={EXP_PATH.getPointAt(1).toArray() as V3}>
          <Ribosome id="ribosome" size={0.45} opacity={ribo} />
          <Anchor id="ribosome" position={[0, 0.1, 0.4]} show={ribo} />
        </group>
      )}

      {/* import of a ribosomal protein (NLS) with importin */}
      {impShow > 0.01 && (
        <group position={impPos}>
          <Protein id="ribosomal-proteins" shape="blob" color={COL.rp} size={0.3} seed={81} opacity={impShow} />
          <mesh position={[0.15, 0.12, 0.1]}>
            <sphereGeometry args={[0.07, 12, 8]} />
            <meshStandardMaterial color={COL.nls} emissive={COL.nls} emissiveIntensity={0.4} transparent opacity={impShow} />
          </mesh>
          <Protein id="importin" shape="blob" color={COL.importin} size={0.36} seed={83} position={[0.3 + importinOff * 0.8, 0.18 + importinOff * 0.4, 0.05]} opacity={impShow * (1 - importinOff)} />
          <Anchor id="nls" position={[0.15, 0.12, 0.15]} show={impShow} />
          <Anchor id="importin" position={[0.32, 0.2, 0.1]} show={impShow * (1 - importinOff)} />
        </group>
      )}

      {/* the two pores used */}
      <group position={PORE_IMP.pos} quaternion={PORE_IMP.q}>
        <NuclearPore id="nuclear-pore" size={0.55} />
      </group>
      <group position={PORE_EXP.pos} quaternion={PORE_EXP.q}>
        <NuclearPore id="nuclear-pore" size={0.55} />
      </group>
      <Anchor id="nuclear-pore" position={PORE_IMP.pos} />
    </group>
  );
}
