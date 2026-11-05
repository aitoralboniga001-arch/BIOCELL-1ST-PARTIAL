/**
 * t6-histone-marks — Acetylation, methylation and phosphorylation of histone tails.
 *
 * World: one large nucleosome at the origin with its H3 N-terminal tail drawn out towards +x as a string of
 * residues (lysines K4, K9, K14, K27 in pink, serine S10). Enzymes come in, write or erase a mark on the tail and
 * leave. Then the camera visits an open 10 nm fibre (euchromatin, x ≈ −7.5) and a 30 nm fibre (heterochromatin,
 * x ≈ +7.5) with their typical marks and bound proteins.
 *
 *  0  the tails stick out of the octamer; marks go on their residues
 *  1  HAT brings acetyl-CoA and moves acetyl groups onto lysines; the DNA loosens around the octamer
 *  2  HDAC takes the acetyl groups off; the DNA wraps tight again
 *  3  HMT adds methyl groups (K4, K9); HDM removes one again (reversible)
 *  4  a kinase adds a phosphate (S10); a phosphatase removes it
 *  5  euchromatin: 10 nm fibre, acetylated, H3K4me, coactivators bound
 *  6  heterochromatin: 30 nm fibre, H3K9me / H3K27me, repressors and HDAC bound
 */
import { useMemo } from 'react';
import { CatmullRomCurve3, Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { clamp, lerp, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, ChromatinFiber, Nucleosome, PALETTE, Protein, proteinMaterial, useDisposable, useKitHighlight, useStageCamera, type CamKey } from '@/three/kit';

export const P = [0, 0.14, 0.29, 0.43, 0.57, 0.71, 0.86] as const;

const COL = {
  tail: '#ffe8a3',
  lys: '#ffa8a8',
  acetyl: PALETTE.acetyl,
  acCoA: '#63e6be',
  methyl: PALETTE.methyl,
  hdm: '#f783ac',
  phos: PALETTE.phosphate,
  pase: '#ffe066',
  hdac: '#12a594',
  k9: '#d6336c',
  k27: '#a61e4d',
  coact: '#69db7c',
  repr: '#868e96',
};

const T = {
  tail: [0.02, 0.09],
  hatIn: 0.155,
  acOn: [0.195, 0.24],
  hatOut: 0.27,
  hdacIn: 0.3,
  acOff: [0.335, 0.385],
  hdacOut: 0.415,
  hmtIn: 0.445,
  meOn: [0.47, 0.5],
  hmtOut: 0.505,
  hdmIn: 0.51,
  meOff: [0.53, 0.55],
  hdmOut: 0.565,
  kinIn: 0.58,
  phOn: [0.605, 0.63],
  kinOut: 0.64,
  paseIn: 0.645,
  phOff: [0.665, 0.69],
  paseOut: 0.705,
} as const;

const NS = 2.4; // hero nucleosome size
const NT = 28; // tail residues drawn
const LYS = { K4: 3, K9: 8, K14: 13, K27: 26 };
const S10 = 9;
const TAIL = new CatmullRomCurve3([
  new Vector3(0.72, 0.42, 0.2),
  new Vector3(1.3, 0.75, 0.45),
  new Vector3(2.0, 0.9, 0.7),
  new Vector3(2.7, 0.75, 0.85),
  new Vector3(3.3, 1.05, 0.7),
  new Vector3(3.8, 1.5, 0.55),
  new Vector3(4.1, 2.0, 0.5),
]);
/** residue i (0 = N-terminal end, far out) → position; the tail is laid from the octamer outwards */
const RES = Array.from({ length: NT }, (_, i) => TAIL.getPointAt(1 - i / (NT - 1)));
const OUT = new Vector3(0, 0.26, 0.16);
const markAt = (i: number) => RES[i].clone().add(OUT);
const ACK = [LYS.K9, LYS.K14, LYS.K27];

/** an enzyme that comes in, docks next to the tail and leaves */
function visit(t: number, tin: number, tout: number, from: V3, dock: V3, to: V3) {
  const a = smooth(seg(t, tin, tin + 0.03));
  const b = smooth(seg(t, tout - 0.03, tout));
  const p: V3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) p[k] = lerp(lerp(from[k], dock[k], a), to[k], b);
  return { p, o: vis(t, tin, tout, 0.012) };
}
const dockNear = (i: number, up = 0.95): V3 => [RES[i].x + 0.15, RES[i].y + up, RES[i].z + 0.55];

const CAM: CamKey[] = [
  { at: 0, pos: [2.0, 2.0, 10.0], target: [1.4, 0.6, 0.2], fov: 38 },
  { at: 0.12, pos: [2.4, 2.2, 9.4], target: [1.8, 0.9, 0.3], fov: 38 },
  { at: 0.17, pos: [2.8, 2.6, 9.0], target: [2.0, 1.1, 0.4], fov: 38 },
  { at: 0.42, pos: [2.6, 2.4, 9.2], target: [2.0, 1.0, 0.4], fov: 38 },
  { at: 0.46, pos: [3.4, 2.8, 8.6], target: [2.4, 1.3, 0.5], fov: 38 },
  { at: 0.69, pos: [3.2, 2.6, 8.8], target: [2.4, 1.2, 0.5], fov: 38 },
  { at: 0.75, pos: [-7.2, 1.8, 8.6], target: [-7.5, 0.1, -1.0], fov: 38 },
  { at: 0.845, pos: [-7.0, 1.6, 8.4], target: [-7.5, 0.1, -1.0], fov: 38 },
  { at: 0.9, pos: [7.4, 1.8, 8.6], target: [7.5, 0.0, -1.0], fov: 38 },
  { at: 1, pos: [7.6, 1.7, 8.4], target: [7.5, 0.0, -1.0], fov: 38 },
];

// ——— fibres ———
const EU: V3 = [-7.5, 0, -1];
const HET: V3 = [7.5, 0, -1];
const EU_N = 6;
const EU_S = 0.62;
const euNuc = (i: number): V3 => [EU[0] + (i - (EU_N - 1) / 2) * 1.9 * EU_S, EU[1] + Math.sin(i * 1.3) * 0.35 * EU_S, EU[2] + Math.cos(i * 0.9) * 0.3 * EU_S];
const HET_N = 12;
const HET_S = 0.95;
const hetNuc = (i: number, r = 1.05): V3 => {
  const a = (i / 6) * Math.PI * 2;
  return [HET[0] + Math.cos(a) * r * HET_S, HET[1] + (i - (HET_N - 1) / 2) * 0.36 * HET_S, HET[2] + Math.sin(a) * r * HET_S];
};

function Mark({ id, color, pos, o, r = 0.12 }: { id: string | string[]; color: string; pos: V3; o: number; r?: number }) {
  const mats = useDisposable(() => [proteinMaterial(color, { emissive: 0.25 })], [color]);
  useKitHighlight(mats, id, { opacity: o });
  if (o <= 0.002) return null;
  return (
    <mesh position={pos} material={mats[0]} scale={r * (0.5 + 0.5 * clamp(o * 1.5))}>
      <sphereGeometry args={[1, 16, 12]} />
    </mesh>
  );
}

function Tail({ show }: { show: number }) {
  const mats = useDisposable(() => [proteinMaterial(COL.tail, { roughness: 0.5 }), proteinMaterial(COL.lys, { roughness: 0.45 })], []);
  const tailMats = useMemo(() => [mats[0]], [mats]);
  const lysMats = useMemo(() => [mats[1]], [mats]);
  useKitHighlight(tailMats, 'histone-tail', { opacity: 1 });
  useKitHighlight(lysMats, ['lysine', 'histone-tail'], { opacity: 1 });
  const lys = new Set(Object.values(LYS));
  // the tail grows out from the octamer (residue NT-1 first)
  const shown = show * NT;
  return (
    <group>
      {RES.map((p, i) => {
        const v = clamp(shown - (NT - 1 - i));
        if (v <= 0.01) return null;
        const isK = lys.has(i);
        return (
          <mesh key={i} position={p} material={isK ? mats[1] : mats[0]} scale={(isK ? 0.13 : 0.1) * v}>
            <sphereGeometry args={[1, 14, 10]} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function HistoneMarksScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const tail = seg(t, T.tail[0], T.tail[1]);

  // acetylation: on (from HAT's acetyl-CoA) then off (by HDAC)
  const hat = visit(t, T.hatIn, T.hatOut, [5.6, 3.6, 1.6], dockNear(LYS.K14), [6.2, 3.8, -0.6]);
  const hdac = visit(t, T.hdacIn, T.hdacOut, [5.8, -0.6, 1.8], dockNear(LYS.K14, -0.85), [6.0, -1.2, -0.4]);
  const coa: V3 = [hat.p[0] + 0.55, hat.p[1] + 0.05, hat.p[2] + 0.3];
  const acetylLoad = ACK.map((_, k) => smooth(seg(t, T.acOn[0] + k * 0.012, T.acOn[0] + k * 0.012 + 0.02)));
  const acetylOff = ACK.map((_, k) => smooth(seg(t, T.acOff[0] + k * 0.012, T.acOff[0] + k * 0.012 + 0.025)));
  const acLevel = acetylLoad.reduce((a, v, k) => a + v * (1 - acetylOff[k]), 0) / ACK.length;

  // methylation
  const hmt = visit(t, T.hmtIn, T.hmtOut, [5.4, 3.8, 1.2], dockNear(LYS.K9), [5.8, 4.0, -0.8]);
  const hdm = visit(t, T.hdmIn, T.hdmOut, [5.6, -0.8, 1.6], dockNear(LYS.K9, -0.85), [6.0, -1.2, -0.6]);
  const meK4 = smooth(seg(t, T.meOn[0], T.meOn[0] + 0.02));
  const meK9 = smooth(seg(t, T.meOn[0] + 0.01, T.meOn[1])) * (1 - smooth(seg(t, T.meOff[0], T.meOff[1])));

  // phosphorylation
  const kin = visit(t, T.kinIn, T.kinOut, [5.4, 3.8, 1.4], dockNear(S10), [6.0, 4.0, -0.6]);
  const pase = visit(t, T.paseIn, T.paseOut, [5.6, -0.8, 1.6], dockNear(S10, -0.85), [6.0, -1.2, -0.6]);
  const ph = smooth(seg(t, T.phOn[0], T.phOn[1])) * (1 - smooth(seg(t, T.phOff[0], T.phOff[1])));

  const between = (a: V3, b: Vector3, k: number): V3 => [lerp(a[0], b.x, k), lerp(a[1], b.y, k) + Math.sin(Math.PI * k) * 0.3, lerp(a[2], b.z, k)];
  const away = (b: Vector3, k: number): V3 => [b.x + 0.9 * k, b.y - 0.6 * k, b.z + 0.8 * k];
  const fiberIn = vis(t, 0.68, 2, 0.03);

  return (
    <group>
      {/* the hero nucleosome (DNA loosens while acetylated) */}
      <Nucleosome id="nucleosome" dnaId="dna" histoneId="nucleosome" size={NS} tails={0.7 * tail} acetyl={acLevel} loosen={acLevel} rotation={[0.25, 0.4, 0]} />
      <Anchor id="nucleosome" position={[-0.5, -0.2, 0.6]} />
      <Anchor id="dna" position={[-1.6, 0.4, 0.4]} />
      <Tail show={tail} />
      <Anchor id="histone-tail" position={RES[18].toArray() as V3} show={tail} />
      <Anchor id="lysine" position={RES[LYS.K14].toArray() as V3} show={tail} />

      {/* HAT + acetyl-CoA → acetyl groups on lysines */}
      <Protein id="hat" shape="blob" color={COL.acetyl} size={0.8} seed={3} position={hat.p} opacity={hat.o} />
      <Anchor id="hat" position={hat.p} show={hat.o} />
      <Protein id="acetyl-coa" shape="blob" color={COL.acCoA} size={0.32} seed={8} position={coa} opacity={hat.o * (1 - seg(t, T.acOn[1], T.acOn[1] + 0.02))} />
      <Anchor id="acetyl-coa" position={coa} show={hat.o * (1 - seg(t, T.acOn[1], T.acOn[1] + 0.02))} />
      {ACK.map((i, k) => {
        const on = acetylLoad[k];
        const off = acetylOff[k];
        const pos = off > 0 ? away(markAt(i), off) : between(coa, markAt(i), on);
        return <Mark key={k} id="acetyl-group" color={COL.acetyl} pos={pos} o={vis(t, T.acOn[0] + k * 0.012 - 0.004, T.acOff[0] + k * 0.012 + 0.025, 0.006)} />;
      })}
      <Anchor id="acetyl-group" position={markAt(LYS.K9).toArray() as V3} show={acLevel > 0.05 ? 1 : 0} />

      {/* HDAC removes them */}
      <Protein id="hdac" shape="blob" color={COL.hdac} size={0.85} seed={5} position={hdac.p} opacity={hdac.o} />
      <Anchor id="hdac" position={hdac.p} show={hdac.o} />

      {/* methylation: HMT writes, HDM erases */}
      <Protein id="hmt" shape="blob" color={COL.methyl} size={0.8} seed={11} position={hmt.p} opacity={hmt.o} />
      <Anchor id="hmt" position={hmt.p} show={hmt.o} />
      <Protein id="hdm" shape="blob" color={COL.hdm} size={0.78} seed={13} position={hdm.p} opacity={hdm.o} />
      <Anchor id="hdm" position={hdm.p} show={hdm.o} />
      <Mark id={['methyl-group', 'methylation']} color={COL.methyl} pos={between(hmt.p, markAt(LYS.K4), meK4)} o={meK4 > 0 ? vis(t, T.meOn[0], T.paseOut, 0.01) : 0} />
      <Mark id={['methyl-group', 'methylation']} color={COL.methyl} pos={meK9 < 1 && t > T.meOff[0] ? away(markAt(LYS.K9), 1 - meK9) : between(hmt.p, markAt(LYS.K9), meK9)} o={vis(t, T.meOn[0] + 0.01, T.meOff[1], 0.008)} />
      <Anchor id="methyl-group" position={markAt(LYS.K4).toArray() as V3} show={meK4 * vis(t, T.meOn[0], T.paseOut, 0.01)} />
      <Anchor id="methylation" position={RES[LYS.K4].toArray() as V3} show={vis(t, T.hmtIn, T.meOff[1], 0.01)} />

      {/* phosphorylation: kinase writes, phosphatase erases */}
      <Protein id="kinase" shape="blob" color={COL.phos} size={0.8} seed={17} position={kin.p} opacity={kin.o} />
      <Anchor id="kinase" position={kin.p} show={kin.o} />
      <Protein id="phosphatase" shape="blob" color={COL.pase} size={0.78} seed={19} position={pase.p} opacity={pase.o} />
      <Anchor id="phosphatase" position={pase.p} show={pase.o} />
      <Mark
        id="phosphate-group"
        color={COL.phos}
        r={0.14}
        pos={t > T.phOff[0] ? away(markAt(S10).add(new Vector3(0, -0.5, 0)), 1 - ph) : between(kin.p, markAt(S10).add(new Vector3(0, -0.5, 0)), ph)}
        o={vis(t, T.phOn[0], T.phOff[1], 0.008)}
      />
      <Anchor id="phosphate-group" position={markAt(S10).add(new Vector3(0, -0.5, 0)).toArray() as V3} show={ph} />

      {/* euchromatin: open 10 nm fibre, acetylated, H3K4me, coactivators */}
      <group position={EU} scale={EU_S}>
        <ChromatinFiber id={['fiber-10nm', 'euchromatin']} kind="10nm" count={EU_N} opacity={fiberIn} />
      </group>
      {Array.from({ length: EU_N }, (_, i) => {
        const c = euNuc(i);
        return (
          <group key={i}>
            <Mark id="acetyl-group" color={COL.acetyl} pos={[c[0] - 0.15, c[1] + 0.45, c[2] + 0.2]} o={fiberIn} r={0.1} />
            {i % 2 === 0 && <Mark id="h3k4me" color={COL.methyl} pos={[c[0] + 0.2, c[1] + 0.42, c[2] + 0.1]} o={fiberIn} r={0.1} />}
          </group>
        );
      })}
      {[1, 4].map((i, k) => {
        const c = euNuc(i);
        return <Protein key={k} id="coactivator" shape="blob" color={COL.coact} size={0.55} seed={23 + k} position={[c[0], c[1] + 0.95, c[2] + 0.1]} opacity={fiberIn} />;
      })}
      <Anchor id="fiber-10nm" position={euNuc(2)} />
      <Anchor id="euchromatin" position={[EU[0] - 2.2, EU[1] - 0.5, EU[2]]} />
      <Anchor id="h3k4me" position={[euNuc(2)[0] + 0.2, euNuc(2)[1] + 0.42, euNuc(2)[2] + 0.1]} show={fiberIn} />
      <Anchor id="coactivator" position={[euNuc(4)[0], euNuc(4)[1] + 0.95, euNuc(4)[2] + 0.1]} show={fiberIn} />

      {/* heterochromatin: compact 30 nm fibre, repressive methylation, repressors + HDAC */}
      <group position={HET} scale={HET_S}>
        <ChromatinFiber id={['fiber-30nm', 'heterochromatin']} kind="30nm" count={HET_N} compact={1} opacity={fiberIn} />
      </group>
      {Array.from({ length: HET_N }, (_, i) => (
        <Mark key={i} id={i % 2 ? 'h3k27me' : 'h3k9me'} color={i % 2 ? COL.k27 : COL.k9} pos={hetNuc(i, 1.55)} o={fiberIn} r={0.11} />
      ))}
      {[2, 7, 10].map((i, k) => (
        <Protein key={k} id="repressor" shape="blob" color={COL.repr} size={0.6} seed={29 + k} position={hetNuc(i + 0.5, 2.05)} opacity={fiberIn} />
      ))}
      <Protein id="hdac" shape="blob" color={COL.hdac} size={0.6} seed={37} position={hetNuc(4.5, 2.05)} opacity={fiberIn} />
      <Anchor id="fiber-30nm" position={hetNuc(5, 0.6)} />
      <Anchor id="heterochromatin" position={[HET[0] + 0.3, HET[1] - 1.6, HET[2] + 0.6]} />
      <Anchor id="h3k9me" position={hetNuc(6, 1.55)} show={fiberIn} />
      <Anchor id="h3k27me" position={hetNuc(9, 1.55)} show={fiberIn} />
      <Anchor id="repressor" position={hetNuc(7.5, 2.05)} show={fiberIn} />
    </group>
  );
}
