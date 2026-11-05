/**
 * t9-snare — SNAREs and the whole sequence.
 *
 * Steps 1–4, molecular close-up (lipid scale, 1 ≈ 5 nm). World: target membrane mid-plane at y = 0, CYTOSOL above
 * (+y), TARGET LUMEN below. The membrane is one BudModel profile (rendered in lipids, rotated so the "bud" points up
 * into the cytosol) whose bud is the vesicle: before fusion it is a separate sphere above the flat target; at fusion
 * the model switches to a bud joined by a pore that widens until the vesicle collapses into the target membrane —
 * the vesicle's lumen becomes the target lumen. The front is cut away so the bilayers are seen in section.
 *   v-SNARE (red, one helix, TM in the vesicle) and t-SNAREs (purple, three helices, TM in the target) splay apart;
 *   on the trigger they zip from their membrane-distal ends towards the membranes into 4-helix bundles, pulling the
 *   vesicle down onto the target; fusion-complex proteins arrive; hemifusion → pore → collapse; cargo enters the lumen.
 * Steps 5–7, organelle scale (parts/SnareCycle): donor + target in one frame, the full cycle, then the recap.
 */
import { useMemo } from 'react';
import { Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { clamp, lerp, lerp3, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, Bilayer, EdgeTag, LumenTint, PALETTE, Protein, useStageCamera, type CamKey } from '@/three/kit';
import { useBudModel } from '../t10/parts/bud';
import { LipidRevolution } from '../t10/parts/Membranes';
import { hForNeck } from '../t10/parts/profile';
import { Capsule } from '../t7/parts/molecules';
import { helixPoint, SnareHelices, type SnareState } from './parts/SnareHelices';
import { SnareCycle } from './parts/SnareCycle';

export const P = [0, 0.14, 0.28, 0.43, 0.57, 0.71, 0.86] as const;

const R = 2.6;
const RHO = 1.0;
const EDGE = 11;
const CY_TOUCH = hForNeck(R, RHO, 0.02); // vesicle centre when the two bilayers touch (hemifusion)
const CY_FAR = 8.8;
const CY_NEAR = 7.9;
const CY_DOCK = CY_TOUCH + 2.25;
const CY_ZIP = CY_TOUCH + 0.32;
const PHIS = [0, Math.PI, -Math.PI / 2]; // SNARE complexes: right, left, back (the front is cut away)
const RAB_PHI = [-0.6, Math.PI + 0.6]; // back-right / back-left (clear of the SNAREs and the cut)
const RAB_POLAR = 0.95; // angle from the vesicle's lowest point
const REC_R = 3.15;
const REC_C = '#339af0'; // rab-receptor (structures table colour)
const FUS_C = '#b197fc'; // fusion-complex (structures table colour)
const CUT = { center: -Math.PI / 2, width: 1.8 }; // local θ; the model is rotated by π about x → faces +z

const T = {
  approach: [0.0, 0.09],
  recUp: [0.15, 0.19],
  dock: [0.185, 0.25],
  trigger: [0.29, 0.32],
  zip: [0.315, 0.405],
  pull: [0.345, 0.41],
  fcIn: [0.435, 0.46],
  hemi: [0.455, 0.47],
  pore: [0.47, 0.495],
  collapse: [0.495, 0.545],
  spill: [0.478, 0.55],
  out: [0.553, 0.583],
} as const;

const CAM: CamKey[] = [
  { at: 0, pos: [2, 6.0, 23], target: [0, 4.2, 0], fov: 36 },
  { at: 0.1, pos: [2, 5.8, 22.5], target: [0, 4.0, 0], fov: 36 },
  { at: 0.155, pos: [5, 5.4, 20.5], target: [0.5, 3.7, 0], fov: 36 },
  { at: 0.27, pos: [4.6, 5.2, 20], target: [0.5, 3.5, 0], fov: 36 },
  { at: 0.3, pos: [0.4, 3.6, 17], target: [0, 2.6, 0], fov: 36 },
  { at: 0.42, pos: [0.4, 3.4, 16.5], target: [0, 2.4, 0], fov: 36 },
  { at: 0.45, pos: [1.0, 2.6, 16.5], target: [0, 1.2, 0], fov: 36 },
  { at: 0.548, pos: [1.0, 2.4, 16], target: [0, 1.0, 0], fov: 36 },
  // pull back to the organelle-scale view: donor + target in frame
  { at: 0.588, pos: [0, 4.6, 20.5], target: [0, 3.5, 0], fov: 38 },
  { at: 0.6, pos: [-3.3, 5.6, 10.5], target: [-4.3, 5.7, 0], fov: 38 },
  { at: 0.648, pos: [-3.3, 5.4, 10.2], target: [-4.2, 5.5, 0], fov: 38 },
  { at: 0.668, pos: [-2.0, 5.0, 11.5], target: [-2.6, 4.7, 0], fov: 38 },
  { at: 0.69, pos: [-1.6, 4.8, 11.5], target: [-1.8, 4.4, 0], fov: 38 },
  { at: 0.708, pos: [1.0, 3.6, 14.5], target: [1.0, 2.6, 0], fov: 38 },
  { at: 0.728, pos: [2.5, 3.0, 13], target: [3.0, 1.8, 0], fov: 38 },
  { at: 0.745, pos: [4.6, 2.4, 9], target: [4.4, 1.1, 0], fov: 38 },
  { at: 0.8, pos: [4.6, 2.2, 8.8], target: [4.4, 0.9, 0], fov: 38 },
  { at: 0.822, pos: [0, 4.6, 20.5], target: [0, 3.5, 0], fov: 38 },
  { at: 0.86, pos: [0, 4.6, 20.2], target: [0, 3.5, 0], fov: 38 },
  { at: 1, pos: [1.2, 4.8, 20.2], target: [0, 3.5, 0], fov: 38 },
];

/** cargo inside the vesicle (offsets from its centre) and its spot in the target lumen */
const CARGO = Array.from({ length: 9 }, (_, i) => {
  const a = i * 2.39996;
  const b = Math.acos(1 - (2 * (i + 0.5)) / 9);
  const r = 0.9 + 0.35 * ((i * 5) % 3);
  return {
    o: [Math.cos(a) * Math.sin(b) * r, Math.cos(b) * r * 0.8, Math.sin(a) * Math.sin(b) * r * 0.6 + 0.4] as V3,
    end: [Math.cos(a) * (1.6 + 0.45 * i), -1.6 - 0.5 * (i % 3), 0.6 + Math.sin(a) * 1.2] as V3,
  };
});
const quad = (a: V3, b: V3, c: V3, k: number): V3 => lerp3(lerp3(a, b, k), lerp3(b, c, k), k);
const _p = new Vector3();
const hp = (phi: number, h: number, u: number, s: SnareState): V3 => {
  helixPoint(phi, h, u, s, _p);
  return [_p.x, _p.y, _p.z];
};

export default function SnareScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const m = useBudModel();

  // ———————— vesicle height, zipping, fusion ————————
  const zip = smooth(seg(t, T.zip[0], T.zip[1]));
  let cy = lerp(CY_FAR, CY_NEAR, smooth(seg(t, T.approach[0], T.approach[1])));
  cy = lerp(cy, CY_DOCK, smooth(seg(t, T.dock[0], T.dock[1])));
  cy = lerp(cy, CY_ZIP, smooth(seg(t, T.pull[0], T.pull[1])));
  cy = lerp(cy, CY_TOUCH, smooth(seg(t, T.hemi[0], T.hemi[1])));
  const fused = t >= T.pore[0];
  const pore = smooth(seg(t, T.pore[0], T.pore[1]));
  const collapse = smooth(seg(t, T.collapse[0], T.collapse[1]));
  if (fused) {
    m.update(collapse > 0 ? { R, rho: RHO, edge: EDGE, h: lerp(hForNeck(R, RHO, 1.4), -R + 0.01, collapse) } : { R, rho: RHO, edge: EDGE, neckR: lerp(0.02, 1.4, pore) });
  } else {
    m.update({ R, rho: RHO, edge: EDGE, cut: true, vesY: -cy, dimple: RHO * 0.9 * smooth(seg(t, T.hemi[0], T.hemi[1])) });
  }
  const vesC: V3 = [0, fused ? -m.info.cy : cy, 0];
  const spread = smooth(seg(t, T.pore[1], T.collapse[1]));
  const snState = useMemo<SnareState>(() => ({ cy: fused ? CY_TOUCH : cy, R, zip, spread }), [fused, cy, zip, spread]);
  const pulse = 0.9 * vis(t, T.trigger[0], T.trigger[1] + 0.01, 0.01);

  const o = 1 - seg(t, T.out[0], T.out[1]);
  const on = o > 0.01;
  const sideTags = t < 0.555;

  // ———————— Rab on the vesicle + Rab receptor in the target (docking) ————————
  const recUp = smooth(seg(t, T.recUp[0], T.recUp[1]));
  const rabRelease = smooth(seg(t, T.collapse[0], T.collapse[1]));
  const rabs = RAB_PHI.map((phi) => {
    const dir: V3 = [Math.sin(RAB_POLAR) * Math.cos(phi), -Math.cos(RAB_POLAR), Math.sin(RAB_POLAR) * Math.sin(phi)];
    const cyR = fused ? CY_TOUCH : cy;
    const seat: V3 = [dir[0] * (R + 0.95), cyR + dir[1] * (R + 0.95), dir[2] * (R + 0.95)];
    const memb: V3 = [dir[0] * (R + 0.2), cyR + dir[1] * (R + 0.2), dir[2] * (R + 0.2)];
    const away: V3 = [seat[0] * 1.3, seat[1] + 2.2, seat[2] * 1.2];
    const rab = lerp3(seat, away, rabRelease);
    const base: V3 = [REC_R * Math.cos(phi), 0.6, REC_R * Math.sin(phi)];
    const rest: V3 = [base[0] * 1.05, 1.9, base[2] * 1.05];
    const grip: V3 = lerp3(seat, base, 0.18);
    const head = lerp3(lerp3(rest, grip, recUp), lerp3(base, [base[0] * 1.1, 1.4, base[2] * 1.1], 0.7), rabRelease);
    return { rab, memb, base, head, phi };
  });
  const rabO = 1 - seg(t, T.collapse[0] + 0.02, T.collapse[1]);

  // ———————— fusion complex ————————
  const fcIn = smooth(seg(t, T.fcIn[0], T.fcIn[1]));
  const fcO = vis(t, T.fcIn[0] - 0.005, 0.552, 0.01);
  const fc = PHIS.map((phi, i) => {
    const site = hp(phi, 1, 0.34, snState);
    const s: V3 = [site[0] + Math.cos(phi) * 0.5, site[1] + 0.75, site[2] + Math.sin(phi) * 0.5 + (i === 2 ? 0 : 0.55)];
    const from: V3 = [Math.cos(phi) * 8, 7.5, Math.sin(phi) * 5 + 2];
    return lerp3(from, s, fcIn);
  });

  // ———————— cargo ————————
  const cargo = CARGO.map((c, i) => {
    const k = smooth(clamp((t - T.spill[0] - i * 0.004) / (T.spill[1] - T.spill[0] - 0.035)));
    const inside: V3 = [vesC[0] + c.o[0], (fused ? CY_TOUCH : cy) + c.o[1], c.o[2]];
    return k > 0 ? quad(inside, [c.o[0] * 0.25, 0.2, c.o[2] * 0.25 + 0.3], c.end, k) : inside;
  });

  return (
    <group>
      {sideTags ? (
        <>
          <EdgeTag side="top" text="CYTOSOL" />
          <EdgeTag side="bottom" text="TARGET COMPARTMENT LUMEN" />
        </>
      ) : null}

      {on && (
        <group>
          {/* target membrane: far region (kit bilayer) + the fusion disc and vesicle (BudModel, cut open in front) */}
          <Bilayer id="target-compartment" width={36} depth={18} holes={[{ x: 0, z: 0, r: EDGE + 0.05 }]} seed={5} opacity={o} />
          <group rotation={[Math.PI, 0, 0]}>
            <LipidRevolution profile={m.parent} sig={m.sigParent} flip id="target-compartment" opacity={o} cut={CUT} spacing={0.26} thickness={1} seed={3} capacity={13000} />
            <LipidRevolution profile={m.bud} sig={m.sigBud} id="transport-vesicle" opacity={o} cut={CUT} spacing={0.26} thickness={1} seed={14} capacity={7000} />
          </group>
          <LumenTint box={[-18, 18, -7, -0.6, -9, 9]} color={PALETTE.golgiLumen} strength={0.22} opacity={o} />
          <Anchor id="target-compartment" position={[-7.5, 0, -2.5]} show={o} />
          <Anchor id="transport-vesicle" position={[-1.75, vesC[1] + 1.75, 0.9]} show={o * (1 - seg(t, T.pore[1], T.collapse[0] + 0.02))} />

          {/* SNARE helices */}
          <SnareHelices state={snState} phis={PHIS} pulse={pulse} opacity={o} />
          <Anchor id="v-snare" position={hp(0, 0, 0.62, snState)} show={o} />
          <Anchor id="t-snare" position={hp(Math.PI, 2, 0.62, snState)} show={o} />

          {/* Rab (on the vesicle, prenyl-anchored) bound by the Rab receptor of the target */}
          {rabs.map((r, i) => (
            <group key={i}>
              <Protein id="rab" shape="blob" color={PALETTE.rab} size={0.85} seed={5 + i} position={r.rab} opacity={o * rabO} />
              <Capsule id="rab" a={r.rab} b={lerp3(r.memb, r.rab, rabRelease)} r={0.07} color={PALETTE.lipidTail} opacity={o * (1 - rabRelease)} />
              <Capsule id="rab-receptor" a={[r.base[0], -0.5, r.base[2]]} b={r.base} r={0.13} color={REC_C} opacity={o} />
              <Capsule id="rab-receptor" a={r.base} b={r.head} r={0.1} color={REC_C} opacity={o} />
              <Protein id="rab-receptor" shape="blob" color={REC_C} size={0.6} seed={9 + i} position={r.head} opacity={o} />
            </group>
          ))}
          <Anchor id="rab" position={rabs[0].rab} show={o * rabO} />
          <Anchor id="rab-receptor" position={lerp3(rabs[0].base, rabs[0].head, 0.5)} show={o} />

          {/* membrane fusion complex, recruited once the SNAREs are zipped */}
          {fc.map((p, i) => (
            <Protein key={i} id="fusion-complex" shape="blob" color={FUS_C} size={0.85} seed={30 + i} position={p} opacity={o * fcO} />
          ))}
          <Anchor id="fusion-complex" position={fc[0]} show={o * fcO} />

          {/* cargo: inside the vesicle, then through the pore into the target lumen */}
          {cargo.map((p, i) => (
            <Protein key={i} shape="blob" color={PALETTE.cargo} size={0.55} seed={40 + i} position={p} opacity={o} />
          ))}
        </group>
      )}

      {/* steps 5–7: the whole cycle at organelle scale */}
      <SnareCycle t={t} />
    </group>
  );
}
