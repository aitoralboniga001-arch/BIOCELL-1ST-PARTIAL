/**
 * t6-domains — Chromatin domains and compartments inside the nucleus.
 *
 * World: the same cut-open nucleus as t6-eu-hetero (R = 4, cap removed for z > 1.2): envelope + lamina at the
 * periphery, a lilac nuclear-matrix meshwork inside. Four chromosome territories (tinted volumes with their own
 * chromatin thread). LADs lie flat on the lamina, with telomeres at their ends. One territory (upper left) holds a
 * gene segment that moves from the periphery (B) towards the interior (A) without leaving its territory.
 *
 *  0  the nucleus and its skeleton (lamina + matrix)
 *  1  chromosome territories; a domain wobbles inside its own territory
 *  2  two attachment sites: the lamina (silent) and the matrix (active); S/MARs tie the DNA to the matrix
 *  3  LADs: silent heterochromatin flat on the lamina, telomeres anchored there
 *  4  compartment B (periphery) and compartment A (interior)
 *  5  the gene segment moves from B to A, still inside its territory
 */
import { useMemo } from 'react';
import { DoubleSide, MeshStandardMaterial, Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { lerp, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, lumpySphere, proteinMaterial, useDisposable, useKitHighlight, useStageCamera, type CamKey } from '@/three/kit';
import { cutPlane, LocalClipping, NucleusShell, randomWalk, threadGeometry } from './parts/nucleus';

export const P = [0, 0.17, 0.34, 0.51, 0.69, 0.86] as const;

const R = 4;
const CUT = 1.2;
const TERR = [
  { c: [-1.6, 1.3, -0.8] as V3, r: 1.45, color: '#ffa8a8', seed: 3 },
  { c: [1.6, 1.4, -1.0] as V3, r: 1.35, color: '#b2f2bb', seed: 7 },
  { c: [-1.3, -1.5, -0.7] as V3, r: 1.45, color: '#ffd8a8', seed: 11 },
  { c: [1.6, -1.3, -0.9] as V3, r: 1.35, color: '#d0bfff', seed: 13 },
];
const GENE_B: V3 = [-2.45, 2.2, -0.5];
const GENE_A: V3 = [-1.0, 0.75, -0.3];
const T = {
  wobble: [0.19, 0.32],
  smar: [0.38, 0.45],
  lad: [0.53, 0.58],
  comp: [0.71, 0.77],
  move: [0.88, 0.96],
} as const;

/** LAD arcs lying on the inner face of the lamina (behind the cut) */
const LADS: V3[][] = [
  [0.5, 1.2, 2.0, 2.8],
  [2.4, 3.0, 3.6],
  [3.9, 4.5, 5.2, 5.8],
].map((angles, k) =>
  angles.map((a, j) => {
    const r = R * 0.9;
    const el = -0.25 - 0.18 * k + 0.05 * j;
    return [Math.cos(a) * Math.cos(el) * r, Math.sin(a) * Math.cos(el) * r, Math.sin(el) * r - 0.4] as V3;
  }),
);
const MATRIX: V3[][] = Array.from({ length: 12 }, (_, i) => randomWalk(50 + i, 14, [0, 0, -0.6], 2.6, 0.45));
const SMARS: V3[] = [MATRIX[0][6], MATRIX[2][4], MATRIX[5][8], MATRIX[7][5], MATRIX[9][9], MATRIX[11][3]];

const CAM: CamKey[] = [
  { at: 0, pos: [3.0, 2.5, 11.5], target: [0, 0, 0], fov: 38 },
  { at: 0.15, pos: [2.8, 2.4, 11.2], target: [0, 0, 0], fov: 38 },
  { at: 0.21, pos: [-0.4, 2.4, 8.6], target: [-1.4, 1.0, -0.6], fov: 38 },
  { at: 0.32, pos: [-0.5, 2.3, 8.4], target: [-1.4, 1.0, -0.6], fov: 38 },
  { at: 0.38, pos: [1.0, 1.0, 10.6], target: [0, 0, -0.3], fov: 38 },
  { at: 0.49, pos: [1.0, 1.0, 10.4], target: [0, 0, -0.3], fov: 38 },
  { at: 0.55, pos: [-2.6, -0.4, 9.0], target: [-1.8, -0.6, -0.8], fov: 38 },
  { at: 0.67, pos: [-2.6, -0.5, 8.8], target: [-1.8, -0.6, -0.8], fov: 38 },
  { at: 0.73, pos: [0.6, 1.5, 12.0], target: [0, 0, 0], fov: 38 },
  { at: 0.84, pos: [0.6, 1.5, 11.8], target: [0, 0, 0], fov: 38 },
  { at: 0.89, pos: [-0.6, 2.4, 8.4], target: [-1.6, 1.3, -0.5], fov: 38 },
  { at: 1, pos: [-0.7, 2.4, 8.2], target: [-1.6, 1.3, -0.5], fov: 38 },
];

function Volume({ id, color, pos, r, o, seed, strength = 0.22 }: { id: string | string[]; color: string; pos: V3; r: number; o: number; seed: number; strength?: number }) {
  const geo = useDisposable(() => lumpySphere({ detail: 6, noise: 0.14, freq: 2.2, seed }), [seed]);
  const mats = useDisposable(() => [new MeshStandardMaterial({ color, transparent: true, opacity: strength, roughness: 0.8, depthWrite: false, side: DoubleSide, emissive: color, emissiveIntensity: 0.12 })], [color]);
  useKitHighlight(mats, id, { opacity: o * strength });
  if (o <= 0.002) return null;
  return <mesh geometry={geo} material={mats[0]} position={pos} scale={r} renderOrder={3} />;
}

export default function DomainsScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const plane = useMemo(() => cutPlane(CUT), []);
  const geos = useDisposable(
    () => [
      ...TERR.map((tr) => threadGeometry([randomWalk(tr.seed, 46, tr.c, tr.r * 1.25, 0.22)], 0.07, 8, 6)),
      threadGeometry(MATRIX, 0.028, 8, 5),
      threadGeometry(LADS, 0.09, 10, 8),
    ],
    [],
  );
  const mats = useDisposable(() => {
    const ms = [...TERR.map((tr) => proteinMaterial(tr.color, { roughness: 0.6 })), proteinMaterial('#b197fc', { roughness: 0.6 }), proteinMaterial('#868e96', { roughness: 0.7 })];
    ms.forEach((m) => (m.clippingPlanes = [plane]));
    return ms;
  }, [plane]);
  const chromMats = useMemo(() => mats.slice(0, 4), [mats]);
  const matrixMats = useMemo(() => [mats[4]], [mats]);
  const ladMats = useMemo(() => [mats[5]], [mats]);
  useKitHighlight(chromMats, ['dna', 'chromosome-territory'], { strength: 0.5 });
  useKitHighlight(matrixMats, ['nuclear-matrix', 'nucleoskeleton'], {});
  useKitHighlight(ladMats, ['lad', 'compartment-b'], {});
  const smarMat = useDisposable(() => [proteinMaterial('#e599f7', { emissive: 0.3 })], []);
  const teloMat = useDisposable(() => [proteinMaterial('#ffa94d', { emissive: 0.3 })], []);
  const geneMat = useDisposable(() => [proteinMaterial('#ffd43b', { emissive: 0.35 })], []);
  const smarO = smooth(seg(t, T.smar[0], T.smar[1]));
  useKitHighlight(smarMat, 'smar', { opacity: smarO });
  useKitHighlight(teloMat, 'telomere', {});
  useKitHighlight(geneMat, 'gene-segment', {});

  const wob = Math.sin(Math.PI * seg(t, T.wobble[0], T.wobble[1]));
  const mv = smooth(seg(t, T.move[0], T.move[1]));
  const gene: V3 = [lerp(GENE_B[0], GENE_A[0], mv) + 0.25 * wob * Math.sin(t * 90), lerp(GENE_B[1], GENE_A[1], mv) + 0.2 * wob * Math.cos(t * 70), lerp(GENE_B[2], GENE_A[2], mv)];
  const comp = vis(t, T.comp[0], 2, 0.03);
  const terrShow = vis(t, 0.17, 2, 0.03);
  const geneShow = vis(t, 0.18, 2, 0.02);

  return (
    <group>
      <LocalClipping />
      <NucleusShell radius={R} cutZ={CUT} pores={60} poreSize={0.16} lamina={1} laminaN={900} onmId="nucleus" inmId="nucleus" poreId="nucleus" laminaId={['nuclear-lamina', 'nucleoskeleton']} />
      <Anchor id="nucleus" position={[2.6, 2.9, 0.6]} />
      <Anchor id="nuclear-lamina" position={[2.9, -2.3, 0.6]} />
      <Anchor id="nucleoskeleton" position={[0.3, -0.2, -0.4]} />

      {/* chromosome territories: each its own thread inside its own volume */}
      {TERR.map((tr, k) => (
        <group key={k}>
          <mesh geometry={geos[k]} material={mats[k]} />
          <Volume id="chromosome-territory" color={tr.color} pos={tr.c} r={tr.r} o={terrShow} seed={tr.seed} />
        </group>
      ))}
      <Anchor id="chromosome-territory" position={[TERR[1].c[0] + 0.6, TERR[1].c[1] + 0.6, TERR[1].c[2] + 0.9]} show={terrShow} />
      <Anchor id="dna" position={[TERR[3].c[0] - 0.2, TERR[3].c[1] - 0.4, TERR[3].c[2] + 0.6]} />

      {/* nuclear matrix + S/MARs */}
      <mesh geometry={geos[4]} material={mats[4]} />
      <Anchor id="nuclear-matrix" position={MATRIX[3][7]} />
      {SMARS.map((p, k) => (
        <mesh key={k} position={p} material={smarMat[0]} scale={0.15 * smarO} visible={smarO > 0.01}>
          <sphereGeometry args={[1, 14, 10]} />
        </mesh>
      ))}
      <Anchor id="smar" position={SMARS[2]} show={smarO} />

      {/* LADs on the lamina, telomeres at their ends */}
      <mesh geometry={geos[5]} material={mats[5]} />
      {LADS.flatMap((l, k) => [l[0], l[l.length - 1]].map((p, j) => (
        <mesh key={`${k}-${j}`} position={p} material={teloMat[0]} scale={0.17}>
          <sphereGeometry args={[1, 14, 10]} />
        </mesh>
      )))}
      <Anchor id="lad" position={LADS[2][1]} />
      <Anchor id="telomere" position={LADS[2][0]} />

      {/* compartments: B = periphery shell, A = interior */}
      <Volume id="compartment-b" color="#3b5bdb" pos={[0, 0, 0]} r={R * 0.88} o={comp} seed={2} strength={0.07} />
      <Volume id="compartment-a" color="#9fd0ff" pos={[-0.2, 0.1, -0.5]} r={1.7} o={comp} seed={4} strength={0.16} />
      <Anchor id="compartment-a" position={[0.1, 0.4, 0.4]} show={comp} />
      <Anchor id="compartment-b" position={[-3.0, 1.6, 0.4]} show={comp} />

      {/* the gene segment (B → A inside its territory) */}
      <mesh position={gene} material={geneMat[0]} scale={0.26 * geneShow} visible={geneShow > 0.01}>
        <sphereGeometry args={[1, 18, 14]} />
      </mesh>
      <Anchor id="gene-segment" position={gene} show={geneShow} />
    </group>
  );
}
