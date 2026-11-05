/**
 * t7-folding — Chaperones of the ER lumen and quality control.
 *
 * World: the lumen under a patch of ER membrane (bilayer at y = 0, CYTOSOL above, ER LUMEN below).
 * Regions: centre = unfolded vs folded protein (and later the retained misfolded one); left (x ≈ −4) = IgG
 * assembly with BiP; right (x ≈ +4) = calnexin (membrane) and calreticulin (soluble) holding glycoproteins by
 * their oligosaccharides; low centre = PDI making a disulfide bond.
 *
 *  0  a new chain folds into its 3D shape next to one that stays unfolded; the lumen is full of chaperones
 *  1  BiP holds two heavy chains; they pair, then the light chains join gradually and BiP lets go
 *  2  calnexin and calreticulin grip the glycan of a folding glycoprotein; the last glucose is trimmed, release
 *  3  PDI brings two cysteines together and the S–S bond forms
 *  4  the misfolded protein is held by chaperones (retained); more misfolded proteins pile up (ER stress)
 *  5  overview of the four chaperones
 */
import { useMemo } from 'react';
import { Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { clamp, lerp, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, Bilayer, Bond, EdgeTag, foldedPositions, Glycan, LumenTint, MembraneProtein, PALETTE, Polypeptide, Protein, useStageCamera, type CamKey } from '@/three/kit';
import { Capsule, coilPoint, foldedBead, OLIGO_GLC3, sugars } from './parts/molecules';

export const P = [0, 0.17, 0.34, 0.52, 0.69, 0.86] as const;

const HEAVY = '#c7a0ff';
const LIGHT = '#a5d8ff';
const SS = '#ffe066';
const SP = 0.2;

const T = {
  fold: [0.035, 0.13],
  heavy: [0.19, 0.25],
  light: [0.255, 0.305],
  bipOff: [0.295, 0.335],
  gpIn: [0.355, 0.395],
  gpFold: [0.395, 0.47],
  trim: [0.462, 0.48],
  gpOut: [0.482, 0.515],
  pdiIn: [0.53, 0.565],
  pdiFold: [0.565, 0.625],
  ss: [0.62, 0.64],
  pdiOut: [0.645, 0.685],
  hold: [0.705, 0.755],
  pile: [0.765, 0.84],
} as const;

// ——— centre: unfolded vs folded ———
const UNF_C: V3 = [-1.0, -2.3, 0.6];
const FOLD_C: V3 = [1.5, -2.45, 0.45];
const NCH = 34;

// ——— IgG (left) ———
const IGG: V3 = [-4.4, -2.6, 0.4];
const H1 = { from: { p: [-2.1, 0.5, -0.3] as V3, r: 0.7 }, a: [[-0.13, -1.0, 0], [-0.13, 0, 0]] as [V3, V3], b: [[-0.13, 0, 0], [-0.85, 0.85, 0]] as [V3, V3] };
const H2 = { from: { p: [2.0, -0.7, -0.2] as V3, r: -0.6 }, a: [[0.13, -1.0, 0], [0.13, 0, 0]] as [V3, V3], b: [[0.13, 0, 0], [0.85, 0.85, 0]] as [V3, V3] };
const L1 = { from: { p: [-2.5, 1.9, 0.3] as V3, r: 0.9 }, a: [[-0.45, -0.07, 0.06], [-1.08, 0.67, 0.06]] as [V3, V3] };
const L2 = { from: { p: [2.4, 1.7, 0.2] as V3, r: -0.9 }, a: [[0.45, -0.07, 0.06], [1.08, 0.67, 0.06]] as [V3, V3] };

// ——— calnexin / calreticulin (right) ———
const CNX: V3 = [3.3, 0, 0.35];
const CNX_SITE: V3 = [3.4, -1.25, 0.4]; // under its lumenal lectin domain
const CRT: V3 = [5.6, -2.0, 0.0];
const GP = 26; // glycoprotein chain
const GLY_SIZE = 0.42;
const GLY_H = 6 * 0.42 * GLY_SIZE; // root → tip

// ——— PDI (low centre) ———
const PDI_C: V3 = [0.4, -4.3, 0.6];
const NPD = 30;
const PD_FOLD = foldedPositions(NPD, SP * 0.95, 41);
/** the two cysteines: the closest pair in the folded globule at least 10 residues apart */
const [CYS_A, CYS_B] = (() => {
  let best: [number, number] = [4, 24];
  let d = 1e9;
  for (let i = 0; i < NPD; i++)
    for (let j = i + 10; j < NPD; j++) {
      const dd = PD_FOLD[i].distanceTo(PD_FOLD[j]);
      if (dd < d && dd > 0.18) {
        d = dd;
        best = [i, j];
      }
    }
  return best;
})();

const CAM: CamKey[] = [
  { at: 0, pos: [0.4, -1.0, 8.4], target: [0.3, -2.4, 0.4], fov: 38 },
  { at: 0.15, pos: [0.2, -1.1, 8.2], target: [0.3, -2.45, 0.4], fov: 38 },
  { at: 0.205, pos: [-3.4, -1.4, 7.8], target: [-4.3, -2.4, 0.3], fov: 38 },
  { at: 0.33, pos: [-3.6, -1.5, 7.6], target: [-4.4, -2.4, 0.3], fov: 38 },
  { at: 0.375, pos: [5.6, -1.0, 8.4], target: [4.3, -2.0, 0.2], fov: 38 },
  { at: 0.51, pos: [5.4, -1.1, 8.2], target: [4.3, -2.1, 0.2], fov: 38 },
  { at: 0.55, pos: [1.2, -2.6, 6.8], target: [0.4, -4.0, 0.5], fov: 38 },
  { at: 0.68, pos: [1.0, -2.7, 6.6], target: [0.4, -4.05, 0.5], fov: 38 },
  { at: 0.72, pos: [1.6, -0.8, 10.2], target: [0.8, -2.4, 0.3], fov: 40 },
  { at: 0.845, pos: [1.4, -0.9, 10.0], target: [0.8, -2.5, 0.3], fov: 40 },
  { at: 0.9, pos: [0.4, -0.4, 15.2], target: [0.4, -2.7, 0], fov: 40 },
  { at: 1, pos: [0.4, -0.3, 15.6], target: [0.4, -2.7, 0], fov: 40 },
];

/** background chaperones: the lumen is full of them (no labels) */
const CROWD: { p: V3; c: string; s: number }[] = [
  { p: [-7.2, -1.8, -2.4], c: PALETTE.bip, s: 0.5 },
  { p: [-2.4, -4.6, -2.0], c: PALETTE.pdi, s: 0.42 },
  { p: [2.6, -4.9, -2.6], c: PALETTE.bip, s: 0.5 },
  { p: [7.4, -3.6, -2.2], c: PALETTE.calreticulin, s: 0.45 },
  { p: [-5.6, -4.8, -1.2], c: PALETTE.pdi, s: 0.4 },
  { p: [0.2, -1.4, -2.8], c: PALETTE.bip, s: 0.48 },
  { p: [5.0, -4.4, 1.6], c: PALETTE.bip, s: 0.45 },
  { p: [-1.8, -5.8, 0.9], c: PALETTE.calreticulin, s: 0.42 },
];
/** misfolded proteins that pile up in step 4 */
const PILE: V3[] = [
  [-2.6, -3.6, 1.4],
  [2.4, -3.3, 1.6],
  [-0.2, -3.9, 2.2],
  [0.9, -1.5, 1.8],
];
const _p = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

function Chain({ k, from, children }: { k: number; from: { p: V3; r: number }; children: React.ReactNode }) {
  const e = smooth(clamp(k));
  return (
    <group position={_p(from.p, [0, 0, 0], e)} rotation={[0, 0, from.r * (1 - e)]}>
      {children}
    </group>
  );
}

export default function FoldingScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const v = useMemo(() => Array.from({ length: 4 }, () => new Vector3()), []);

  // centre
  const fold = seg(t, T.fold[0], T.fold[1]);
  const unfLayout = (i: number, _m: number, out: Vector3) => (coilPoint(i, NCH, UNF_C, t, 3, out), true);
  const foldLayout = (i: number, _m: number, out: Vector3) => (coilPoint(i, NCH, FOLD_C, t, 7, out, 2.2), true);

  // IgG
  const hK = seg(t, T.heavy[0], T.heavy[1]);
  const lK = seg(t, T.light[0], T.light[1]);
  const bipOff = smooth(seg(t, T.bipOff[0], T.bipOff[1]));

  // glycoprotein on calnexin
  const gpIn = smooth(seg(t, T.gpIn[0], T.gpIn[1]));
  const gpOut = smooth(seg(t, T.gpOut[0], T.gpOut[1]));
  const gpFold = 0.45 + 0.55 * seg(t, T.gpFold[0], T.gpFold[1]);
  const trim = seg(t, T.trim[0], T.trim[1]);
  const gpBound: V3 = [CNX_SITE[0], CNX_SITE[1] - GLY_H - 0.45, CNX_SITE[2]];
  const gpPos = _p(_p([1.6, -3.6, 1.2], gpBound, gpIn), [3.0, -4.4, 1.4], gpOut);
  const crtPos = _p([6.6, -0.8, 0.6], CRT, gpIn);
  const gp2: V3 = [CRT[0] - 0.1, CRT[1] - GLY_H - 0.75, CRT[2] + 0.1];
  const gp2Pos = _p(gp2, [6.4, -4.6, 1.0], gpOut);
  const gpLayout = (c: V3, seed: number) => (i: number, _m: number, out: Vector3) => (coilPoint(i, GP, c, t, seed, out, 1.6), true);

  // PDI
  const pdIn = smooth(seg(t, T.pdiIn[0], T.pdiIn[1]));
  const pdOut = smooth(seg(t, T.pdiOut[0], T.pdiOut[1]));
  const pdFold = 0.3 + 0.7 * seg(t, T.pdiFold[0], T.pdiFold[1]);
  const ssK = seg(t, T.ss[0], T.ss[1]);
  const pdiPos = _p(_p([2.8, -3.2, -0.6], [PDI_C[0] + 0.75, PDI_C[1] + 0.25, PDI_C[2] - 0.45], pdIn), [3.2, -5.4, -1.0], pdOut);
  const pdLayout = (i: number, _m: number, out: Vector3) => (coilPoint(i, NPD, PDI_C, t, 11, out, 2.0), true);
  coilPoint(CYS_A, NPD, PDI_C, t, 11, v[0], 2.0);
  coilPoint(CYS_B, NPD, PDI_C, t, 11, v[1], 2.0);
  const cysA = foldedBead(v[0], PD_FOLD[CYS_A], PDI_C, pdFold, v[2]);
  const cysB = foldedBead(v[1], PD_FOLD[CYS_B], PDI_C, pdFold, v[3]);
  const ssFlash = vis(t, T.ss[0], T.ss[0] + 0.03, 0.01);

  // quality control
  const holdK = smooth(seg(t, T.hold[0], T.hold[1]));
  const bipA = _p([-2.8, -0.9, -1.0], [UNF_C[0] - 0.7, UNF_C[1] + 0.45, UNF_C[2] + 0.2], holdK);
  const bipB = _p([1.0, -4.2, -0.8], [UNF_C[0] + 0.8, UNF_C[1] - 0.4, UNF_C[2] + 0.1], holdK);
  const bad = vis(t, T.hold[0], 1.2, 0.03) * (0.35 + 0.25 * Math.sin(t * 90));

  const cysSeg: [number, number, string][] = [
    [CYS_A / NPD, (CYS_A + 1) / NPD, SS],
    [CYS_B / NPD, (CYS_B + 1) / NPD, SS],
  ];

  return (
    <group>
      <EdgeTag side="top" text="CYTOSOL" />
      <EdgeTag side="bottom" text="ER LUMEN" />
      <Bilayer id="er-membrane" width={22} depth={8} position={[0, 0, -3.2]} holes={[{ x: CNX[0], z: CNX[2] + 3.2, r: 0.4 }]} seed={5} />
      <LumenTint id="er-lumen" box={[-30, 30, -0.68, -26, -30, 30]} color={PALETTE.erLumen} strength={0.16} />
      <Anchor id="er-lumen" position={[-2.6, -4.9, 0.4]} />

      {/* step 0: one chain folds, one stays unfolded */}
      <Polypeptide id="unfolded-protein" count={NCH} made={NCH} spacing={SP} layout={unfLayout} color="#e8a26a" glow={bad} />
      <Polypeptide id="folded-protein" count={NCH} made={NCH} spacing={SP} layout={foldLayout} folded={fold} foldCenter={FOLD_C} seed={9} />
      <Anchor id="unfolded-protein" position={[UNF_C[0] - 0.4, UNF_C[1] + 0.1, UNF_C[2] + 0.3]} />
      <Anchor id="folded-protein" position={FOLD_C} />

      {/* step 1: IgG assembly (2 heavy + 2 light chains) with BiP */}
      <group position={IGG}>
        <Chain k={hK} from={H1.from}>
          <Capsule id="heavy-chain" a={H1.a[0]} b={H1.a[1]} r={0.17} color={HEAVY} />
          <Capsule id="heavy-chain" a={H1.b[0]} b={H1.b[1]} r={0.17} color={HEAVY} />
          <Protein id="bip" shape="blob" color={PALETTE.bip} size={0.55} seed={4} position={_p([-0.5, -0.6, 0.25], [-1.6, -1.4, 0.9], bipOff)} />
          <Anchor id="bip" position={_p([-0.5, -0.6, 0.35], [-1.6, -1.4, 1.0], bipOff)} />
          <Anchor id="heavy-chain" position={[-0.13, -0.55, 0.1]} />
        </Chain>
        <Chain k={hK} from={H2.from}>
          <Capsule id="heavy-chain" a={H2.a[0]} b={H2.a[1]} r={0.17} color={HEAVY} />
          <Capsule id="heavy-chain" a={H2.b[0]} b={H2.b[1]} r={0.17} color={HEAVY} />
          <Protein id="bip" shape="blob" color={PALETTE.bip} size={0.55} seed={6} position={_p([0.5, -0.6, 0.25], [1.6, -1.5, 0.8], bipOff)} />
        </Chain>
        <Chain k={lK} from={L1.from}>
          <Capsule id="light-chain" a={L1.a[0]} b={L1.a[1]} r={0.15} color={LIGHT} />
          <Anchor id="light-chain" position={[-0.8, 0.33, 0.1]} />
        </Chain>
        <Chain k={lK} from={L2.from}>
          <Capsule id="light-chain" a={L2.a[0]} b={L2.a[1]} r={0.15} color={LIGHT} />
        </Chain>
      </group>

      {/* step 2: calnexin (membrane) and calreticulin (soluble) hold glycoproteins by their glycans */}
      <group position={CNX}>
        <MembraneProtein id="calnexin" color={PALETTE.calnexin} side="lumen" seed={12} />
        <Anchor id="calnexin" position={[0.25, -0.95, 0.25]} />
      </group>
      <Protein id="calreticulin" shape="blob" color={PALETTE.calreticulin} size={0.7} seed={8} position={crtPos} />
      <Anchor id="calreticulin" position={[crtPos[0] + 0.15, crtPos[1] + 0.05, crtPos[2] + 0.25]} />
      <Polypeptide id="unfolded-protein" count={GP} made={GP} spacing={SP} layout={gpLayout(gpPos, 5)} folded={gpFold} foldCenter={gpPos} seed={13} />
      <Glycan id="oligosaccharide" tree={OLIGO_GLC3} size={GLY_SIZE} amount={sugars(12 - trim)} position={[gpPos[0], gpPos[1] + 0.42, gpPos[2]]} />
      <Polypeptide count={GP} made={GP} spacing={SP} layout={gpLayout(gp2Pos, 9)} folded={gpFold} foldCenter={gp2Pos} seed={15} />
      <Glycan id="oligosaccharide" tree={OLIGO_GLC3} size={GLY_SIZE} amount={sugars(12 - trim)} position={[gp2Pos[0], gp2Pos[1] + 0.42, gp2Pos[2]]} />
      <Anchor id="oligosaccharide" position={[gpPos[0] - 0.15, gpPos[1] + 0.42 + GLY_H * 0.45, gpPos[2] + 0.1]} show={vis(t, 0.3, 1.2, 0.02)} />

      {/* step 3: PDI makes a disulfide bond */}
      <Polypeptide id={['folded-protein']} count={NPD} made={NPD} spacing={SP} layout={pdLayout} folded={pdFold} foldCenter={PDI_C} seed={41} segments={cysSeg} surface={false} />
      <Protein id="pdi" shape="blob" color={PALETTE.pdi} size={0.62} seed={14} position={pdiPos} />
      <Anchor id="pdi" position={[pdiPos[0] + 0.1, pdiPos[1] + 0.1, pdiPos[2] + 0.3]} />
      <Bond id="disulfide-bond" a={cysA} b={cysB} radius={0.06} color={SS} show={ssK} glow={ssFlash} />
      <Anchor id="disulfide-bond" position={cysA.clone().lerp(cysB, 0.5).toArray() as V3} show={ssK} />

      {/* step 4: chaperones hold the misfolded protein; more misfolded proteins accumulate */}
      <Protein id="bip" shape="blob" color={PALETTE.bip} size={0.5} seed={17} position={bipA} />
      <Protein id="bip" shape="blob" color={PALETTE.bip} size={0.5} seed={19} position={bipB} />
      {PILE.map((p, k) => {
        const o = seg(t, T.pile[0] + k * 0.015, T.pile[0] + k * 0.015 + 0.03);
        return o > 0.002 ? <Polypeptide key={k} id="unfolded-protein" count={24} made={24} spacing={SP} opacity={o} color="#e8a26a" layout={(i, _m, out) => (coilPoint(i, 24, p, t, 20 + k, out, 1.7), true)} glow={bad} /> : null;
      })}

      {CROWD.map((c, k) => (
        <Protein key={k} shape="blob" color={c.c} size={c.s} seed={30 + k} position={[c.p[0], c.p[1] + 0.08 * Math.sin(t * 20 + k), c.p[2]]} />
      ))}
    </group>
  );
}
