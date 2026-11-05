/**
 * t8-glyco — Glycosylation in the Golgi (molecular scale) + GAGs, proteoglycans and hyaluronic acid.
 *
 * World: Golgi lumen. Glycoprotein A (secretory) at x = −2.4, lysosomal hydrolase B at x = +2.6, each with its
 * N-glycan on an Asn (blue bead); the Golgi stack far behind. Sugars are SNFG symbols (GlcNAc blue cube, Man green
 * sphere, Glc blue sphere, Gal yellow sphere, Sia purple diamond, GalNAc yellow cube). Further right (x ≈ 7–12) a
 * proteoglycan core protein grows its GAG chains; at x ≈ 15.5 hyaluronic acid is spun out at the plasma membrane.
 *
 *  0  A arrives with the 14-sugar oligosaccharide on Asn
 *  1  trimmed down to the 5-sugar core (2 GlcNAc + 3 Man)
 *  2  complex glycosylation: glycosyltransferases add GlcNAc, Gal, sialic acid
 *  3  B (hydrolase): mannoses added, one phosphorylated → M6P
 *  4  N-linked (Asn) vs O-linked (Ser/Thr, Golgi only)
 *  5  GAGs: long repeating-disaccharide chains, negatively charged
 *  6  proteoglycans (core protein + many GAGs, lots of water); hyaluronic acid made at the plasma membrane
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, Matrix4, SphereGeometry } from 'three';
import type { SceneProps } from '@/content/types';
import { clamp, lerp, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, Bilayer, EdgeTag, Protein, Sugar, proteinMaterial, useDisposable, useKitHighlight, useStageCamera, type CamKey, type SugarKind } from '@/three/kit';
import { Capsule } from '../t7/parts/molecules';
import { GolgiStack } from './parts/stack';

export const P = [0, 0.14, 0.28, 0.43, 0.57, 0.71, 0.86] as const;

const A: V3 = [-2.4, -1.5, 0];
const B: V3 = [2.6, -1.5, 0];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const ASN_A = add(A, [0, 0.72, 0.2]);
const ASN_B = add(B, [0, 0.72, 0.2]);
const ROOT_A = add(ASN_A, [0, 0.3, 0]);
const ROOT_B = add(ASN_B, [0, 0.3, 0]);
const SER = add(A, [0.82, 0.32, 0.3]);
const G = 0.42;

type Kind = SugarKind | 'GalNAc';
interface Node {
  kind: Kind;
  pos: V3; // relative to the root
  parent: number;
  on: number;
  off: number;
  ids: string[];
}
const KIND_ID: Partial<Record<Kind, string[]>> = { GlcNAc: ['glcnac'], Man: ['mannose'], Gal: ['galactose'], Sia: ['sialic-acid'], Man6P: ['m6p', 'mannose'] };
const node = (kind: Kind, pos: V3, parent: number, on = -1, off = 2, ids: string[] = []): Node => ({ kind, pos, parent, on, off, ids: [...ids, ...(KIND_ID[kind] ?? [])] });

const TRIM = [0.16, 0.26] as const;
/** trimming order of the 9 extra sugars (13 → 5), glucoses first */
const trimAt = (i: number) => TRIM[0] + ((13 - i) / 9) * (TRIM[1] - TRIM[0]);
const CPLX = [0.31, 0.335, 0.355, 0.375, 0.395, 0.415];
const OLI = ['oligosaccharide'];
const CORE = ['oligosaccharide', 'core-glycan'];

const GLY_A: Node[] = [
  node('GlcNAc', [0, 0, 0], -1, -1, 2, CORE),
  node('GlcNAc', [0, G, 0], 0, -1, 2, CORE),
  node('Man', [0, 2 * G, 0], 1, -1, 2, CORE),
  node('Man', [-G, 3 * G, 0], 2, -1, 2, CORE),
  node('Man', [G, 3 * G, 0], 2, -1, 2, CORE),
  node('Man', [-0.75, 4 * G, 0], 3, -1, trimAt(5), OLI),
  node('Man', [-0.75, 5 * G, 0], 5, -1, trimAt(6), OLI),
  node('Man', [-0.2, 4 * G, 0], 3, -1, trimAt(7), OLI),
  node('Man', [-0.2, 5 * G, 0], 7, -1, trimAt(8), OLI),
  node('Man', [0.55, 4 * G, 0], 4, -1, trimAt(9), OLI),
  node('Man', [0.55, 5 * G, 0], 9, -1, trimAt(10), OLI),
  node('Glc', [0.55, 6 * G, 0], 10, -1, trimAt(11), OLI),
  node('Glc', [0.55, 7 * G, 0], 11, -1, trimAt(12), OLI),
  node('Glc', [0.55, 8 * G, 0], 12, -1, trimAt(13), OLI),
  // complex glycosylation: two antennae GlcNAc–Gal–Sia
  node('GlcNAc', [-0.6, 4 * G, 0.05], 3, CPLX[0]),
  node('GlcNAc', [0.6, 4 * G, 0.05], 4, CPLX[1]),
  node('Gal', [-0.6, 5 * G, 0.05], 14, CPLX[2]),
  node('Gal', [0.6, 5 * G, 0.05], 15, CPLX[3]),
  node('Sia', [-0.6, 6 * G, 0.05], 16, CPLX[4]),
  node('Sia', [0.6, 6 * G, 0.05], 17, CPLX[5]),
];
const MAN = [0.465, 0.485, 0.505];
const M6P = 0.525;
const GLY_B: Node[] = [
  node('GlcNAc', [0, 0, 0], -1, -1, 2, ['core-glycan']),
  node('GlcNAc', [0, G, 0], 0, -1, 2, ['core-glycan']),
  node('Man', [0, 2 * G, 0], 1, -1, 2, ['core-glycan']),
  node('Man', [-G, 3 * G, 0], 2, -1, 2, ['core-glycan']),
  node('Man', [G, 3 * G, 0], 2, -1, 2, ['core-glycan']),
  node('Man', [-0.6, 4 * G, 0], 3, MAN[0]),
  node('Man', [0.6, 4 * G, 0], 4, MAN[1], M6P),
  node('Man6P', [0.6, 4 * G, 0], 4, M6P),
  node('Man', [0.6, 5 * G, 0], 6, MAN[2]),
];
const OGLY_T = [0.6, 0.625, 0.65];
const O_GLY: Node[] = [
  node('GalNAc', [0.32, 0.3, 0], -1, OGLY_T[0], 2, ['serine-threonine']),
  node('Gal', [0.64, 0.6, 0], 0, OGLY_T[1]),
  node('Sia', [0.96, 0.9, 0], 1, OGLY_T[2]),
];

/** enzyme visits: [time it is there, position] */
const ENZ_PATH: [number, V3][] = [
  [0.29, add(ROOT_A, [-1.6, 0.6, 0.6])],
  ...CPLX.map((tt, i): [number, V3] => [tt, add(add(ROOT_A, GLY_A[14 + i].pos), [i % 2 ? 0.48 : -0.48, 0.05, 0.4])]),
  [0.44, add(ROOT_B, [-1.4, 1.6, 0.6])],
  ...MAN.map((tt, i): [number, V3] => [tt, add(add(ROOT_B, GLY_B[[5, 6, 8][i]].pos), [i === 0 ? -0.48 : 0.48, 0.05, 0.4])]),
  [M6P, add(add(ROOT_B, GLY_B[7].pos), [0.48, 0.05, 0.4])],
  [0.56, add(ROOT_B, [1.4, 2.4, 0.6])],
];
function enzymeAt(t: number): V3 {
  if (t <= ENZ_PATH[0][0]) return ENZ_PATH[0][1];
  for (let i = 1; i < ENZ_PATH.length; i++) {
    const [t1, p1] = ENZ_PATH[i];
    const [t0, p0] = ENZ_PATH[i - 1];
    if (t <= t1) {
      const k = smooth(clamp((t - t0) / Math.max(0.006, t1 - t0 - 0.006)));
      return [lerp(p0[0], p1[0], k), lerp(p0[1], p1[1], k), lerp(p0[2], p1[2], k)];
    }
  }
  return ENZ_PATH[ENZ_PATH.length - 1][1];
}

// ---- GAG / proteoglycan / hyaluronic acid ----------------------------------------------------------------------
const PG_A: V3 = [7.0, -2.4, 0];
const PG_B: V3 = [12.0, -2.4, 0];
const PG_N = 9;
const PG_BEADS = 26;
const HA_X = 16.0;
const PM_Y = -3.2;
const HA_BEADS = 64;
const UPR = '#4dabf7';
const HEX = '#ffe066';
const CHARGE = '#ff6b6b';
function gagPath(base: V3, n: number, lean: number, seed: number): V3[] {
  return Array.from({ length: n }, (_, i) => [
    base[0] + lean * i * 0.07 + 0.16 * Math.sin(i * 0.7 + seed),
    base[1] + 0.18 + i * 0.205,
    base[2] + 0.18 * Math.cos(i * 0.55 + seed) + (seed % 2 ? 1 : -1) * i * 0.035,
  ]);
}
const PG_CHAINS = Array.from({ length: PG_N }, (_, k) => gagPath([lerp(PG_A[0] + 0.4, PG_B[0] - 0.4, k / (PG_N - 1)), PG_A[1] + 0.12, (k % 2 ? 0.25 : -0.25)], PG_BEADS, (k - (PG_N - 1) / 2) * 0.35, k + 1));
const HERO = 2; // the chain that grows first (step 5)
const HA_PATH: V3[] = Array.from({ length: HA_BEADS }, (_, i) => {
  const u = i / (HA_BEADS - 1);
  return [HA_X + 1.6 * Math.sin(u * 5.2) * u, PM_Y + 0.55 + i * 0.13, 0.4 + 1.1 * Math.sin(u * 3.4 + 1) * u];
});
const WATER: V3[] = Array.from({ length: 160 }, (_, i) => {
  const r = (k: number) => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
  return [lerp(6.2, 17.6, r(1)), lerp(-2.2, 4.4, r(2)), lerp(-1.6, 1.8, r(3))];
});

/** chain of beads (one instanced mesh per colour) with a repeating colour pattern; `shown` beads visible from the base */
function BeadChain({ points, pattern, radius = 0.1, shown, id, glow, opacity = 1 }: { points: V3[]; pattern: string[]; radius?: number; shown: number; id?: string | string[]; glow?: number; opacity?: number }) {
  const colors = useMemo(() => [...new Set(pattern)], [pattern]);
  return (
    <group visible={shown >= 1 && opacity > 0.002}>
      {colors.map((c) => (
        <BeadSet key={c} points={points} pattern={pattern} color={c} radius={radius * (c === CHARGE ? 0.55 : 1)} offset={c === CHARGE ? 0.09 : 0} shown={shown} id={id} glow={glow} opacity={opacity} />
      ))}
    </group>
  );
}
function BeadSet({ points, pattern, color, radius, offset, shown, id, glow, opacity }: { points: V3[]; pattern: string[]; color: string; radius: number; offset: number; shown: number; id?: string | string[]; glow?: number; opacity: number }) {
  const ref = useRef<InstancedMesh>(null);
  const idx = useMemo(() => points.map((_, i) => i).filter((i) => pattern[i % pattern.length] === color), [points, pattern, color]);
  const geo = useDisposable(() => new SphereGeometry(1, 12, 9), []);
  const mats = useDisposable(() => [proteinMaterial(color, { roughness: 0.45 })], [color]);
  useKitHighlight(mats, id, { glow, opacity });
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    idx.forEach((i, k) => {
      const p = points[i];
      m.makeScale(radius, radius, radius);
      m.setPosition(p[0] + offset, p[1], p[2] + offset);
      mesh.setMatrixAt(k, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [idx, points, radius, offset]);
  let n = 0;
  while (n < idx.length && idx[n] < Math.floor(shown)) n++;
  useLayoutEffect(() => {
    if (ref.current) ref.current.count = n;
  });
  return <instancedMesh ref={ref} args={[geo, mats[0], idx.length]} frustumCulled={false} />;
}
/** GAG pattern: uronic acid + hexosamine, with a sulfate/carboxyl negative charge every disaccharide */
const GAG_PATTERN = [UPR, CHARGE, HEX, UPR, HEX, CHARGE];
const HA_PATTERN = [UPR, HEX];

function GalNAc({ position, size, ids }: { position: V3; size: number; ids: string[] }) {
  const mats = useDisposable(() => [proteinMaterial('#ffd43b', { roughness: 0.4 })], []);
  useKitHighlight(mats, ids, {});
  return (
    <mesh position={position} scale={size * 0.24} material={mats[0]}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}

function GlycanTree({ nodes, root, t }: { nodes: Node[]; root: V3; t: number }) {
  return (
    <group position={root}>
      {nodes.map((n, i) => {
        const o = (n.on < 0 ? 1 : smooth(seg(t, n.on, n.on + 0.012))) * (1 - smooth(seg(t, n.off, n.off + 0.01)));
        if (o <= 0.01) return null;
        const from = n.parent >= 0 ? nodes[n.parent].pos : ([0, -0.3, 0] as V3);
        const pop = 1 + 0.35 * Math.sin(Math.PI * seg(t, n.on, n.on + 0.012));
        return (
          <group key={i}>
            {n.kind === 'GalNAc' ? <GalNAc position={n.pos} size={o * pop} ids={n.ids} /> : <Sugar kind={n.kind} position={n.pos} size={o * pop} id={n.ids} />}
            {o > 0.6 && <Capsule a={from} b={n.pos} r={0.028} color="#d7dbe0" />}
          </group>
        );
      })}
    </group>
  );
}

const CAM: CamKey[] = [
  { at: 0, pos: [-4.0, 1.8, 11.0], target: [-4.6, 0.8, -3.0], fov: 40 },
  { at: 0.1, pos: [-1.6, 0.8, 7.4], target: [-2.2, 0.4, 0], fov: 40 },
  { at: 0.27, pos: [-1.6, 0.8, 7.2], target: [-2.2, 0.4, 0], fov: 40 },
  { at: 0.42, pos: [-1.5, 0.8, 7.0], target: [-2.2, 0.5, 0], fov: 40 },
  { at: 0.46, pos: [3.2, 0.8, 7.0], target: [2.6, 0.3, 0], fov: 40 },
  { at: 0.56, pos: [3.2, 0.8, 6.8], target: [2.6, 0.3, 0], fov: 40 },
  { at: 0.6, pos: [-0.8, 0.5, 6.8], target: [-1.8, -0.2, 0], fov: 40 },
  { at: 0.7, pos: [-0.8, 0.5, 6.6], target: [-1.8, -0.2, 0], fov: 40 },
  { at: 0.74, pos: [8.6, 1.0, 9.6], target: [8.6, 0.6, 0], fov: 40 },
  { at: 0.85, pos: [8.8, 1.0, 9.4], target: [8.8, 0.6, 0], fov: 40 },
  { at: 0.89, pos: [11.6, 1.6, 15.0], target: [11.6, 0.8, 0], fov: 40 },
  { at: 1, pos: [11.6, 1.6, 15.2], target: [11.6, 0.8, 0], fov: 40 },
];

export default function GlycoScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const arriveA = smooth(seg(t, 0.01, 0.08));
  const offA: V3 = [lerp(-3.5, 0, arriveA), 0, 0];
  const bShow = vis(t, 0.425, 2, 0.015);
  const enzO = vis(t, 0.285, 0.565, 0.012);
  const enz = enzymeAt(t);
  const nGlow = 0.6 * vis(t, 0.58, 0.7, 0.015) * (0.5 + 0.5 * Math.sin(t * 300));
  const oGlow = 0.6 * vis(t, 0.58, 0.7, 0.015) * (0.5 - 0.5 * Math.sin(t * 300));
  const pgO = vis(t, 0.72, 2, 0.015);
  const hero = (PG_BEADS + 1) * smooth(seg(t, 0.74, 0.84));
  const rest = (PG_BEADS + 1) * smooth(seg(t, 0.87, 0.93));
  const ha = (HA_BEADS + 1) * smooth(seg(t, 0.9, 0.99));
  const water = vis(t, 0.88, 2, 0.02);
  const pmO = vis(t, 0.87, 2, 0.02);

  return (
    <group>
      <EdgeTag side="top" text={t < 0.71 ? 'GOLGI LUMEN' : 'EXTRACELLULAR MATRIX'} />
      <GolgiStack offset={[-9.5, 3.2, -9]} opacity={0.55} ids={(i) => (i === 0 ? ['cgn', 'golgi'] : ['golgi'])} />
      <Anchor id="cgn" position={[-10.4, 4.4, -9]} show={vis(t, 0, 0.71, 0.02)} />
      <Anchor id="golgi" position={[-8.0, 2.0, -9]} show={vis(t, 0, 0.71, 0.02)} />

      {/* glycoprotein A (secretory) */}
      <group position={offA}>
        <Protein shape="blob" color="#ced4da" size={1.5} seed={21} position={A} />
        <mesh position={ASN_A}>
          <sphereGeometry args={[0.15, 16, 12]} />
          <meshStandardMaterial color="#3b5bdb" emissive="#3b5bdb" emissiveIntensity={0.25 + nGlow} />
        </mesh>
        <mesh position={SER}>
          <sphereGeometry args={[0.15, 16, 12]} />
          <meshStandardMaterial color="#e8590c" emissive="#e8590c" emissiveIntensity={0.25 + oGlow} transparent opacity={vis(t, 0.575, 2, 0.015)} />
        </mesh>
        <GlycanTree nodes={GLY_A} root={ROOT_A} t={t} />
        <GlycanTree nodes={O_GLY} root={SER} t={t} />
      </group>
      <Anchor id="asparagine" position={add(ASN_A, offA)} show={vis(t, 0, 0.71, 0.02)} />
      <Anchor id="oligosaccharide" position={add(ROOT_A, [0.6, 8 * G, 0.1])} show={vis(t, 0, 0.27, 0.02)} />
      <Anchor id="core-glycan" position={add(ROOT_A, [-0.45, 2 * G, 0.1])} show={vis(t, 0.25, 0.43, 0.02)} />
      <Anchor id="glcnac" position={add(ROOT_A, [0.05, 0, 0.15])} show={vis(t, 0.14, 0.43, 0.02)} />
      <Anchor id="mannose" position={add(ROOT_A, [G, 3 * G, 0.15])} show={vis(t, 0.14, 0.43, 0.02)} />
      <Anchor id="galactose" position={add(ROOT_A, [-0.6, 5 * G, 0.15])} show={vis(t, 0.355, 0.43, 0.02)} />
      <Anchor id="sialic-acid" position={add(ROOT_A, [0.6, 6 * G, 0.15])} show={vis(t, 0.415, 0.43, 0.01)} />
      <Anchor id="serine-threonine" position={SER} show={vis(t, 0.575, 0.71, 0.015)} />

      {/* the glycosyltransferase that adds the sugars */}
      <Protein id="glycosyltransferase" shape="blob" color="#20c997" size={0.55} seed={5} position={enz} opacity={enzO} />
      <Anchor id="glycosyltransferase" position={add(enz, [0, 0.25, 0.1])} show={enzO} />

      {/* lysosomal hydrolase B: mannose path → M6P */}
      <group scale={Math.max(0.001, bShow)} position={[B[0] * (1 - bShow), 0, 0]}>
        <Protein id="hydrolytic-enzyme" shape="blob" color="#ff8787" size={1.5} seed={23} position={B} opacity={bShow} />
        <mesh position={ASN_B}>
          <sphereGeometry args={[0.15, 16, 12]} />
          <meshStandardMaterial color="#3b5bdb" emissive="#3b5bdb" emissiveIntensity={0.25} />
        </mesh>
        <GlycanTree nodes={GLY_B} root={ROOT_B} t={t} />
      </group>
      <Anchor id="hydrolytic-enzyme" position={add(B, [0.4, -0.3, 0.6])} show={bShow * vis(t, 0, 0.71, 0.02)} />
      <Anchor id="m6p" position={add(ROOT_B, [0.75, 4 * G + 0.1, 0.15])} show={vis(t, M6P, 0.71, 0.015)} />

      {/* GAGs → proteoglycan (core protein + many GAG chains) */}
      <Capsule id="proteoglycan" a={PG_A} b={PG_B} r={0.24} color="#e599f7" opacity={pgO} />
      {PG_CHAINS.map((pts, k) => (
        <BeadChain key={k} points={pts} pattern={GAG_PATTERN} radius={0.11} shown={k === HERO ? hero : rest} id={['gag', 'proteoglycan', 'extracellular-matrix']} />
      ))}
      <Anchor id="gag" position={PG_CHAINS[HERO][Math.min(PG_BEADS - 1, Math.max(0, Math.floor(hero) - 3))]} show={hero > 3 ? 1 : 0} />
      <Anchor id="proteoglycan" position={add(PG_B, [-0.6, -0.15, 0.3])} show={pgO} />

      {/* water drawn in by the polar chains */}
      <BeadChain points={WATER} pattern={['#a5d8ff']} radius={0.05} shown={water > 0.02 ? WATER.length : 0} id="extracellular-matrix" opacity={water} />
      <Anchor id="extracellular-matrix" position={[7.4, 3.6, 0.5]} show={water} />

      {/* hyaluronic acid: spun out at the plasma membrane, no core protein */}
      <Bilayer id="plasma-membrane" width={9} depth={5} position={[HA_X, PM_Y, -1.5]} holes={[{ x: 0, z: 1.9, r: 0.42 }]} seed={8} opacity={pmO} />
      <Protein shape="barrel" color="#63e6be" size={0.85} seed={3} position={[HA_X, PM_Y, 0.4]} opacity={pmO} />
      <BeadChain points={HA_PATH} pattern={HA_PATTERN} radius={0.11} shown={ha} id="hyaluronic-acid" />
      <Anchor id="hyaluronic-acid" position={HA_PATH[Math.min(HA_BEADS - 1, Math.max(0, Math.floor(ha) - 4))]} show={ha > 4 ? 1 : 0} />
      <Anchor id="plasma-membrane" position={[HA_X + 3.0, PM_Y + 0.5, 0.6]} show={pmO} />
    </group>
  );
}
