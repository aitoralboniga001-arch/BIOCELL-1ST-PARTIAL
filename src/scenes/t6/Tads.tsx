/**
 * t6-tads — Chromatin loops, cohesin, CTCF, TADs and S/MAR anchoring.
 *
 * World: one chromatin fibre laid along x (arc-length s ∈ [−14, 14]). Loops are extruded at three places: the
 * central one (s = 0) is built on camera by a cohesin ring until it meets CTCF; the B loop (s = −8.5, dark,
 * hangs down) and the A loop (s = +8.5, light, points up) appear when TADs and compartments are explained. Below
 * runs the nuclear matrix; S/MARs tether the loop bases to it, and a second chromosome docks next to the A loop.
 *
 *  0  a straight fibre: two distant sites (yellow) far apart along the DNA
 *  1  cohesin threads onto the fibre and extrudes a loop: the two sites come together at its base
 *  2  the ring stops at the CTCF sites: the loop is a TAD
 *  3  more TADs: B (inactive) and A (active) compartments within one chromosome territory
 *  4  S/MARs anchor the loop bases to the nuclear matrix; another chromosome docks at the same spot
 *  5  coactivators gather where the active loops meet: a co-regulated gene network
 */
import { useMemo } from 'react';
import { DoubleSide, MeshStandardMaterial, Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { clamp, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, Protein, proteinMaterial, useDisposable, useKitHighlight, useStageCamera, type CamKey } from '@/three/kit';
import { threadGeometry } from './parts/nucleus';
import { DynTube, PathBuf, staticTubePath, tubeGeometry } from './parts/tube';

export const P = [0, 0.17, 0.34, 0.51, 0.69, 0.86] as const;

const COL = {
  fibre: '#4fa3ff',
  a: '#9fd0ff',
  b: '#3b5bdb',
  cohesin: '#f783ac',
  ctcf: '#ff922b',
  tad: '#4dabf7',
  terr: '#74c0fc',
  matrix: '#b197fc',
  smar: '#e599f7',
  coact: '#69db7c',
  site: '#ffd43b',
  other: '#ffc078',
};

const T = {
  load: [0.18, 0.215],
  extrude: [0.215, 0.33],
  reach: [0.345, 0.39],
  tad: [0.395, 0.44],
  side: [0.525, 0.6],
  comp: [0.56, 0.62],
  terr: [0.58, 0.64],
  matrix: [0.695, 0.73],
  tether: [0.73, 0.775],
  other: [0.765, 0.82],
  coact: [0.875, 0.94],
} as const;

const S0 = -14;
const S1 = 14;
const WMAX = 3.0;
const SIDE_W = 2.4;
const SITES = [-2.75, 2.75];
const CTCF_S = [-3.2, 3.2];
const SPLIT = [-4.2, 4.2];
const MATRIX_Y = -2.7;

interface Loop {
  c: number;
  w: number;
  dir: number;
}
function loopsAt(t: number): Loop[] {
  const w = 2.6 * smooth(seg(t, T.extrude[0], T.extrude[1])) + (WMAX - 2.6) * smooth(seg(t, T.reach[0], T.reach[1]));
  const ws = SIDE_W * smooth(seg(t, T.side[0], T.side[1]));
  return [
    { c: -8.5, w: ws, dir: -1 },
    { c: 0, w, dir: 1 },
    { c: 8.5, w: ws, dir: 1 },
  ];
}
/** x of each loop base (centre loop base pinned at x = 0) */
function bases(loops: Loop[]) {
  const xb: number[] = [];
  let acc = 0;
  for (const l of loops) {
    xb.push(l.c - l.w - acc);
    acc += 2 * l.w;
  }
  const shift = -xb[1];
  return xb.map((x) => x + shift);
}
const loopR = (w: number) => ((2 * w) / (2 * Math.PI)) * 1.25;
function posAt(s: number, loops: Loop[], xb: number[], out: Vector3) {
  let acc = 0;
  for (let k = 0; k < loops.length; k++) {
    const l = loops[k];
    if (l.w > 0.01 && s >= l.c - l.w && s <= l.c + l.w) {
      const u = (s - (l.c - l.w)) / (2 * l.w);
      const th = u * Math.PI * 2;
      const R = loopR(l.w);
      return out.set(xb[k] - R * Math.sin(th) * 0.9, l.dir * R * (1 - Math.cos(th)) + 0.05 * Math.sin(s * 3), 0.16 * (1 - 2 * u) * Math.exp(-((Math.min(u, 1 - u) * 8) ** 2)) + 0.22 * Math.sin(th) * (k === 1 ? 1 : 0.5));
    }
    if (s > l.c + l.w) acc += 2 * l.w;
  }
  const shift = -(loops[1].c - loops[1].w - 2 * loops[0].w);
  return out.set(s - acc + shift, 0.07 * Math.sin(s * 2.6), 0.12 * Math.sin(s * 1.7));
}

const NSEG = 3;
const CAP = 220;
function fillPaths(loops: Loop[], xb: number[], bufs: PathBuf[], v: Vector3) {
  const ranges: [number, number][] = [
    [S0, SPLIT[0]],
    [SPLIT[0], SPLIT[1]],
    [SPLIT[1], S1],
  ];
  ranges.forEach(([a, b], k) => {
    const buf = bufs[k].clear();
    for (let i = 0; i < CAP; i++) buf.pushV(posAt(a + ((b - a) * i) / (CAP - 1), loops, xb, v));
  });
}

// final layout (for the static matrix / tethers / second chromosome)
const FINAL = loopsAt(1);
const FINAL_XB = bases(FINAL);

const CAM: CamKey[] = [
  { at: 0, pos: [0.4, 1.8, 10.5], target: [0, 0.4, 0], fov: 38 },
  { at: 0.15, pos: [0.3, 1.8, 10.2], target: [0, 0.5, 0], fov: 38 },
  { at: 0.21, pos: [1.2, 1.8, 8.4], target: [0, 0.8, 0], fov: 38 },
  { at: 0.33, pos: [1.0, 2.0, 8.6], target: [0, 1.0, 0], fov: 38 },
  { at: 0.5, pos: [0.8, 2.0, 8.8], target: [0, 1.0, 0], fov: 38 },
  { at: 0.56, pos: [0.4, 2.6, 18.5], target: [0, 0.2, 0], fov: 40 },
  { at: 0.68, pos: [0.4, 2.6, 18.2], target: [0, 0.2, 0], fov: 40 },
  { at: 0.74, pos: [2.0, -0.2, 17.0], target: [0.6, -0.9, -0.6], fov: 40 },
  { at: 0.85, pos: [2.0, -0.2, 16.6], target: [0.6, -0.9, -0.6], fov: 40 },
  { at: 0.9, pos: [5.4, 1.6, 9.6], target: [3.4, 0.4, -1.0], fov: 40 },
  { at: 1, pos: [5.6, 1.6, 9.4], target: [3.4, 0.4, -1.0], fov: 40 },
];

function Shell({ id, color, pos, scale, o }: { id: string; color: string; pos: V3; scale: V3; o: number }) {
  const mats = useDisposable(() => [new MeshStandardMaterial({ color, transparent: true, opacity: 0.16, roughness: 0.8, depthWrite: false, side: DoubleSide, emissive: color, emissiveIntensity: 0.15 })], [color]);
  useKitHighlight(mats, id, { opacity: o * 0.16 });
  if (o <= 0.002) return null;
  return (
    <mesh position={pos} scale={scale} material={mats[0]} renderOrder={2}>
      <sphereGeometry args={[1, 40, 24]} />
    </mesh>
  );
}

function Tether({ from, k }: { from: Vector3; k: number }) {
  const mats = useDisposable(() => [proteinMaterial(COL.smar, { emissive: 0.2 })], []);
  useKitHighlight(mats, 'smar', { opacity: k > 0.01 ? 1 : 0 });
  const len = (from.y - MATRIX_Y) * k;
  if (k <= 0.01) return null;
  return (
    <group position={[from.x, from.y, from.z]}>
      <mesh material={mats[0]}>
        <sphereGeometry args={[0.17, 16, 12]} />
      </mesh>
      <mesh material={mats[0]} position={[0, -len / 2, 0]} scale={[1, len, 1]}>
        <cylinderGeometry args={[0.045, 0.045, 1, 8]} />
      </mesh>
    </group>
  );
}

const MATRIX_PATHS: V3[][] = Array.from({ length: 16 }, (_, i) => {
  const z = -2.6 + (i % 8) * 0.6;
  const horizontal = i < 8;
  return Array.from({ length: 9 }, (_, k) =>
    horizontal ? ([-10 + k * 2.5, MATRIX_Y + 0.12 * Math.sin(i * 3 + k), z + 0.15 * Math.sin(k * 1.7 + i)] as V3) : ([-9 + (i - 8) * 2.6 + 0.3 * Math.sin(k + i), MATRIX_Y + 0.1 * Math.sin(k * 2 + i), -2.8 + k * 0.6] as V3),
  );
});
const OTHER_PATH: V3[] = [
  [-1, 0.1, -2.8],
  [1.2, 0.0, -2.8],
  [FINAL_XB[2] + 0.4, -0.2, -2.0],
  [FINAL_XB[2] + 0.2, 0.9, -2.1],
  [FINAL_XB[2] + 1.1, 1.8, -2.4],
  [FINAL_XB[2] + 1.8, 0.8, -2.5],
  [FINAL_XB[2] + 0.9, -0.15, -2.1],
  [FINAL_XB[2] + 2.8, 0.1, -2.9],
  [12, 0.3, -3.2],
];
const OTHER_BASE = new Vector3(FINAL_XB[2] + 0.6, -0.2, -2.0);

export default function TadsScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const bufs = useMemo(() => Array.from({ length: NSEG }, () => new PathBuf(CAP)), []);
  const v = useMemo(() => new Vector3(), []);
  const mats = useDisposable(() => [proteinMaterial(COL.b, { roughness: 0.55 }), proteinMaterial(COL.fibre, { roughness: 0.55 }), proteinMaterial(COL.a, { roughness: 0.55 }), proteinMaterial(COL.other, { roughness: 0.55 })], []);
  const ringMat = useDisposable(() => [proteinMaterial(COL.cohesin, { roughness: 0.4, emissive: 0.15 })], []);
  useKitHighlight(ringMat, 'cohesin', {});
  const matrixMat = useDisposable(() => [proteinMaterial(COL.matrix, { roughness: 0.6 })], []);
  const matrixGeo = useDisposable(() => threadGeometry(MATRIX_PATHS, 0.035, 8, 6), []);
  const otherGeo = useDisposable(() => tubeGeometry(staticTubePath(OTHER_PATH, 160), 160, 0.12, 10), []);
  const otherMats = useMemo(() => [mats[3]], [mats]);
  const matrixO = vis(t, T.matrix[0], 2, 0.03);
  const otherO = vis(t, T.other[0], 2, 0.04);
  useKitHighlight(matrixMat, 'nuclear-matrix', { opacity: matrixO });
  useKitHighlight(otherMats, 'chromosome-territory', { opacity: otherO });

  const loops = loopsAt(t);
  const xb = bases(loops);
  fillPaths(loops, xb, bufs, v);

  const load = smooth(seg(t, T.load[0], T.load[1]));
  const ringPos = (k: number): V3 => [xb[k], 0.02, 0];
  const mainRing: V3 = [xb[1] + (1 - load) * 1.6, (1 - load) * 2.4, (1 - load) * 1.2];
  const sideO = seg(t, T.side[0], T.side[0] + 0.03);
  const ctcfGlow = vis(t, T.reach[1] - 0.01, T.tad[1], 0.015) * 0.7;
  const R1 = loopR(loops[1].w);
  const tadO = vis(t, T.tad[0], 2, 0.03);
  const compO = vis(t, T.comp[0], 2, 0.03);
  const terrO = vis(t, T.terr[0], 2, 0.03);
  const tether = smooth(seg(t, T.tether[0], T.tether[1]));
  const coact = seg(t, T.coact[0], T.coact[1]);
  const meet = new Vector3((FINAL_XB[2] + OTHER_BASE.x) / 2 + 0.2, 1.2, -1.0);

  const site = (s: number) => posAt(s, loops, xb, new Vector3()).toArray() as V3;
  const ctcf = (s: number): V3 => {
    const p = posAt(s, loops, xb, new Vector3());
    return [p.x, p.y + 0.18, p.z + 0.12];
  };

  return (
    <group>
      {/* the fibre: B region | central region | A region */}
      <DynTube path={bufs[0].a} n={CAP} cap={CAP} radius={0.13} material={mats[0]} id={['chromatin-loop', 'compartment-b', 'dna']} />
      <DynTube path={bufs[1].a} n={CAP} cap={CAP} radius={0.13} material={mats[1]} id={['chromatin-loop', 'dna']} />
      <DynTube path={bufs[2].a} n={CAP} cap={CAP} radius={0.13} material={mats[2]} id={['chromatin-loop', 'compartment-a', 'dna']} />
      <Anchor id="dna" position={site(-6)} />
      <Anchor id="chromatin-loop" position={[xb[1] - R1 * 0.9, R1 * 1.05, 0.1]} show={clamp(loops[1].w - 0.8)} />

      {/* the two distant sites brought together */}
      {SITES.map((s, k) => (
        <mesh key={k} position={site(s)}>
          <sphereGeometry args={[0.22, 18, 14]} />
          <meshStandardMaterial color={COL.site} emissive={COL.site} emissiveIntensity={0.35} roughness={0.4} />
        </mesh>
      ))}

      {/* cohesin rings (the fibre passes through them) */}
      <mesh position={mainRing} rotation={[0, Math.PI / 2, 0]} material={ringMat[0]}>
        <torusGeometry args={[0.36, 0.08, 12, 32]} />
      </mesh>
      {[0, 2].map((k) => (
        <mesh key={k} position={ringPos(k)} rotation={[0, Math.PI / 2, 0]} material={ringMat[0]} visible={sideO > 0.02} scale={sideO}>
          <torusGeometry args={[0.36, 0.08, 12, 32]} />
        </mesh>
      ))}
      <Anchor id="cohesin" position={[mainRing[0], mainRing[1] - 0.3, mainRing[2] + 0.2]} />

      {/* CTCF at the loop boundaries */}
      {CTCF_S.map((s, k) => (
        <Protein key={k} id="ctcf" shape="blob" color={COL.ctcf} size={0.42} seed={5 + k} position={ctcf(s)} glow={ctcfGlow} />
      ))}
      {[-8.5 - SIDE_W - 0.2, -8.5 + SIDE_W + 0.2, 8.5 - SIDE_W - 0.2, 8.5 + SIDE_W + 0.2].map((s, k) => (
        <Protein key={k} id="ctcf" shape="blob" color={COL.ctcf} size={0.38} seed={9 + k} position={ctcf(s)} opacity={sideO} />
      ))}
      <Anchor id="ctcf" position={ctcf(CTCF_S[1])} />

      {/* TAD, compartments, territory */}
      <Shell id="tad" color={COL.tad} pos={[xb[1], R1 * 1.05, 0]} scale={[R1 * 1.25 + 0.4, R1 * 1.25 + 0.4, 1.1]} o={tadO} />
      <Anchor id="tad" position={[xb[1] + R1 * 0.9, R1 * 1.6, 0.4]} show={tadO} />
      <Shell id="compartment-b" color={COL.b} pos={[xb[0], -loopR(loops[0].w) * 1.05, 0]} scale={[loopR(SIDE_W) * 1.3 + 0.4, loopR(SIDE_W) * 1.3 + 0.4, 1.1]} o={compO} />
      <Shell id="compartment-a" color={COL.a} pos={[xb[2], loopR(loops[2].w) * 1.05, 0]} scale={[loopR(SIDE_W) * 1.3 + 0.4, loopR(SIDE_W) * 1.3 + 0.4, 1.1]} o={compO} />
      <Anchor id="compartment-b" position={[xb[0] + 0.3, -loopR(loops[0].w) * 1.6, 0.6]} show={compO} />
      <Anchor id="compartment-a" position={[xb[2] - 0.3, loopR(loops[2].w) * 1.7, 0.6]} show={compO} />
      <Shell id="chromosome-territory" color={COL.terr} pos={[0, 0.2, 0]} scale={[10.5, 3.6, 2.6]} o={terrO * 0.6} />
      <Anchor id="chromosome-territory" position={[-7.6, 1.9, 0.6]} show={terrO} />

      {/* nuclear matrix + S/MAR tethers + a second chromosome docking at the same spot */}
      <mesh geometry={matrixGeo} material={matrixMat[0]} visible={matrixO > 0.002} />
      <Anchor id="nuclear-matrix" position={[-5.5, MATRIX_Y, 0.8]} show={matrixO} />
      {[0, 1, 2].map((k) => (
        <Tether key={k} from={new Vector3(xb[k], k === 0 ? 0.05 : -0.1, 0.05)} k={tether} />
      ))}
      <Tether from={OTHER_BASE} k={tether * otherO} />
      <Anchor id="smar" position={[xb[2], -1.2, 0.1]} show={tether} />
      <mesh geometry={otherGeo} material={mats[3]} visible={otherO > 0.002} />

      {/* coactivators gather where the active loops meet */}
      {Array.from({ length: 6 }, (_, k) => {
        const a = (k / 6) * Math.PI * 2;
        const from: V3 = [meet.x + Math.cos(a) * 3.2, meet.y + 1.6 + Math.sin(a * 2) * 0.6, meet.z + Math.sin(a) * 2.2];
        const to: V3 = [meet.x + Math.cos(a) * 0.55, meet.y + Math.sin(a) * 0.35, meet.z + Math.sin(a) * 0.5];
        const e = smooth(clamp(coact * 1.2 - k * 0.04));
        return <Protein key={k} id="coactivator" shape="blob" color={COL.coact} size={0.42} seed={40 + k} opacity={vis(t, T.coact[0], 2, 0.02)} position={[from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e, from[2] + (to[2] - from[2]) * e]} />;
      })}
      <Anchor id="coactivator" position={[meet.x + 0.55, meet.y, meet.z + 0.3]} show={coact} />
    </group>
  );
}
