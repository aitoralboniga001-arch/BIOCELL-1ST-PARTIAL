/**
 * t9-overview — the whole idea of vesicular transport in one film.
 *
 * World (see parts/OverviewPlan): donor membrane on top (DONOR LUMEN above, teal, with cargo), target membrane at the
 * bottom (TARGET LUMEN below), cytosol in between. Both membranes are real deformable patches (t10 BudModel).
 *  Step 1  the two compartments; cargo waits in the donor lumen.
 *  Step 2  vesicle A does the whole journey briefly: coat → bud → pinch off → travel → fuse → cargo delivered.
 *          Other vesicles drift through the cytosol at the same time.
 *  Step 3  close-up on the donor: coat subunits arrive from the cytosol, polymerise on the cytosolic face, the
 *          membrane bends into a bud (cargo moves in) and pinches off as vesicle B; the coat then sheds.
 *  Step 4  a Rab GTPase inserts into vesicle B and guides it across the cytosol to the target, where it binds its
 *          complementary receptor.
 *  Step 5  close-up on the target: v-SNARE (vesicle) and t-SNAREs (target) find each other, zip, pull the
 *          membranes together; a fusion pore opens, the vesicle collapses into the target and the cargo enters
 *          the target lumen.
 */
import type { SceneProps } from '@/content/types';
import { lerp, lerp3, rand, seg, vis, type V3 } from '@/engine/anim';
import { Anchor, ClathrinCage, EdgeTag, LumenTint, MembraneProtein, PALETTE, Protein, Triskelion, Vesicle, useStageCamera, type CamKey } from '@/three/kit';
import { BudSheet, useBudModel } from '../t10/parts/bud';
import { HoledSheet } from '../t10/parts/Membranes';
import { A, B, B_DOCK, B_REACH, COAT_R, EDGE, R, RHO_D, RHO_T, vesState, XD, XT, YD, YT, type VesPlan, type VesState } from './parts/OverviewPlan';
import { SnarePair } from './parts/OverviewSnare';

export const P = [0, 0.2, 0.4, 0.6, 0.8] as const;

const CAM: CamKey[] = [
  { at: 0, pos: [-5.0, 2.6, 12.4], target: [0, 0, 0], fov: 40 },
  { at: 0.15, pos: [0, 0.5, 13.8], target: [0, 0, 0], fov: 40 },
  { at: 0.355, pos: [0.3, 0.4, 13.6], target: [0, 0, 0], fov: 40 },
  { at: 0.4, pos: [XD + 1.4, YD - 2.5, 7.4], target: [XD, YD - 1.3, 0], fov: 38 },
  { at: 0.565, pos: [XD + 1.2, YD - 2.6, 7.3], target: [XD, YD - 1.45, 0], fov: 38 },
  { at: 0.6, pos: [XD + 1.0, YD - 2.6, 8.0], target: [XD + 0.6, YD - 1.9, 0], fov: 38 },
  { at: 0.64, pos: [XD + 1.0, YD - 2.6, 7.9], target: [XD + 0.6, YD - 1.9, 0], fov: 38 },
  { at: 0.68, pos: [0.4, 0.3, 12.0], target: [0.2, -0.3, 0], fov: 40 },
  { at: 0.74, pos: [0.7, 0.1, 11.6], target: [0.6, -0.6, 0], fov: 40 },
  { at: 0.795, pos: [XT + 1.1, YT + 3.0, 6.4], target: [XT, YT + 0.9, 0], fov: 38 },
  { at: 0.885, pos: [XT + 1.0, YT + 2.9, 6.3], target: [XT, YT + 0.85, 0], fov: 38 },
  { at: 0.93, pos: [XT + 0.9, YT + 1.1, 7.8], target: [XT, YT - 0.5, 0], fov: 38 },
  { at: 1, pos: [XT + 0.9, YT + 1.1, 7.7], target: [XT, YT - 0.5, 0], fov: 38 },
];

const SURF = 0.32;

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const add = (a: V3, d: V3, k = 1): V3 => [a[0] + d[0] * k, a[1] + d[1] * k, a[2] + d[2] * k];

/** Rab sits on the lower-left flank of the vesicle; its receptor stands on the target right under it at docking */
const RAB_DIR = norm([-0.8, -0.5, 0.33]);
const RAB_OFF = R + 0.17;
const RECEPTOR: V3 = [XT + RAB_DIR[0] * RAB_OFF, YT, RAB_DIR[2] * RAB_OFF];
/** SNARE pairs: one facing the camera, one on the right flank */
const SN_DIRS: V3[] = [norm([0.12, -0.62, 0.78]), norm([0.82, -0.55, 0.12])];

/** donor-lumen cargo: 0–3 leave in vesicle A, 4–7 in vesicle B, the rest stay */
const CARGO = Array.from({ length: 13 }, (_, i) => {
  const near = i < 8;
  const lumen: V3 = near
    ? [XD + (rand(i * 3 + 1) - 0.5) * 2.6, YD + 0.45 + rand(i * 5 + 2) * 0.9, (rand(i * 7 + 3) - 0.5) * 2.0]
    : [-7 + (i - 8) * 3.1 + rand(i) * 1.2, YD + 0.5 + rand(i * 5 + 2) * 1.4, (rand(i * 7 + 3) - 0.5) * 3.5];
  const a = i * 2.39996;
  const k = 0.18 + 0.28 * rand(i * 11);
  const slot: V3 = [Math.cos(a) * R * k * 1.4, (rand(i * 13) - 0.5) * R * 0.7, Math.sin(a) * R * k * 1.4];
  const out: V3 = [XT + (rand(i * 17) - 0.5) * 3.6, YT - 0.55 - rand(i * 19) * 1.2, (rand(i * 23) - 0.5) * 2.2];
  return { lumen, slot, out, ves: i < 4 ? A : i < 8 ? B : null };
});

/** other vesicles in the cytosol at the same time (step 2 text) */
const OTHERS = [
  { p: [-7.4, -0.4, -4.6] as V3, r: 0.42, c: PALETTE.membrane, ph: 0.3, sx: 1.6 },
  { p: [5.8, 1.5, -3.6] as V3, r: 0.36, c: PALETTE.plasmaMembrane, ph: 1.9, sx: -1.3 },
  { p: [-4.6, -1.6, -3.2] as V3, r: 0.38, c: PALETTE.golgiMembrane, ph: 3.1, sx: 1.2 },
  { p: [6.6, -1.2, -2.2] as V3, r: 0.32, c: PALETTE.membrane, ph: 4.4, sx: -1.5 },
  { p: [0.4, 2.0, -4.4] as V3, r: 0.34, c: PALETTE.plasmaMembrane, ph: 5.2, sx: 1.1 },
];

function cargoPos(t: number, i: number, sA: VesState, sB: VesState): V3 {
  const c = CARGO[i];
  if (!c.ves) return [c.lumen[0] + 0.08 * Math.sin(t * 90 + i), c.lumen[1] + 0.06 * Math.cos(t * 70 + i * 2), c.lumen[2]];
  const p: VesPlan = c.ves;
  const s = p === A ? sA : sB;
  const load = seg(t, p.pit[0], p.invag[1] - 0.01);
  const inVes = add(s.c, c.slot);
  const rel = seg(t, p.release[0], p.release[1]);
  if (rel > 0) return lerp3(inVes, c.out, rel);
  return lerp3(c.lumen, inVes, load);
}

export default function Overview({ t }: SceneProps) {
  useStageCamera(CAM);
  const donor = useBudModel();
  const target = useBudModel();
  const sA = vesState(t, A);
  const sB = vesState(t, B);

  // donor patch: vesicle A buds in step 2, vesicle B in step 3 (the patch heals flat in between)
  const dp = t < 0.38 ? A : B;
  const ds = dp === A ? sA : sB;
  if (t >= dp.cut) donor.update({ R, rho: RHO_D, edge: EDGE, cut: true, vesY: -1000, dimple: RHO_D * (1 - seg(t, dp.cut, dp.cut + 0.025)) });
  else donor.update({ R, rho: RHO_D, edge: EDGE, h: ds.donorH });
  // target patch: vesicle A fuses in step 2, vesicle B in step 5
  const tp = t < 0.6 ? A : B;
  const ts = tp === A ? sA : sB;
  target.update({ R, rho: RHO_T, edge: EDGE, h: ts.phase === 'fused' ? ts.targetH : -R + 0.01 });

  // ——— vesicle B extras ———
  const rabIn = seg(t, B.rab[0], B.rab[1]);
  const rabFree: V3 = [sB.c[0] - 2.3 + 0.12 * Math.sin(t * 60), sB.c[1] - 0.6 + 0.1 * Math.cos(t * 47), 1.3];
  const rabB = lerp3(rabFree, add(sB.c, RAB_DIR, RAB_OFF), rabIn);
  const rabBO = vis(t, B.rab[0] - 0.012, B.zip[0] + 0.022, 0.012);
  const dockGlow = 0.7 * vis(t, B_DOCK[0], B_DOCK[1] + 0.03, 0.012);
  const rabA = add(sA.c, RAB_DIR, RAB_OFF);
  const rabAO = vis(t, A.rab[0], A.pore[0] + 0.004, 0.008);

  const snO = vis(t, 0.776, B.pore[0] + 0.012, 0.018);
  const reach = seg(t, B_REACH[0], B_REACH[1]);
  const zip = seg(t, B.zip[0], B.zip[1]);
  const pairs = SN_DIRS.map((d) => {
    const vRoot = add(sB.c, d, R);
    const tRoot: V3 = [XT + d[0] * R * 1.02, YT + 0.04, d[2] * R * 1.02];
    return { vRoot, tRoot };
  });

  // coat subunits arriving from the cytosol (step 3)
  const tris = Array.from({ length: 6 }, (_, k) => {
    const a = (k / 6) * Math.PI * 2 + 0.4;
    const dir = norm([Math.cos(a), -0.9, Math.sin(a) * 0.8 + 0.25]);
    const t0 = B.coat[0] - 0.006 + k * 0.009;
    const u = seg(t, t0, t0 + 0.035);
    const o = vis(t, t0 - 0.008, t0 + 0.04, 0.008);
    const d = lerp(4.2, COAT_R + 0.1, u);
    return { pos: add(sB.c, dir, d), o, rot: [0.5 + k, k * 1.3, 0.2] as V3 };
  });

  const wide = t < 0.37 || (t >= 0.585 && t < 0.775);
  const vesAShow = sA.phase === 'bud' ? seg(t, A.invag[0], A.invag[0] + 0.01) : sA.phase === 'free' ? 1 : sA.phase === 'fused' ? 1 - seg(t, A.flatten[0], A.flatten[1]) : 0;
  const vesBShow = sB.phase === 'bud' ? seg(t, B.invag[0], B.invag[0] + 0.02) : sB.phase === 'free' ? 1 : sB.phase === 'fused' ? 1 - seg(t, B.flatten[0], B.flatten[1]) : 0;
  const othersO = 0.85 * seg(t, 0.2, 0.225);

  return (
    <group>
      <EdgeTag side="top" text={t >= 0.775 ? 'CYTOSOL' : 'DONOR COMPARTMENT · LUMEN'} />
      <EdgeTag side="bottom" text={wide || t >= 0.775 ? 'TARGET COMPARTMENT · LUMEN' : 'CYTOSOL'} />
      {wide && <EdgeTag side="left" text="CYTOSOL" />}

      {/* ——— donor compartment (top) ——— */}
      <LumenTint id="donor-compartment" box={[-16, 16, YD + 0.08, YD + 7, -8, 8]} color={PALETTE.erLumen} strength={0.45} />
      <HoledSheet id="donor-compartment" width={32} depth={16} holes={[{ x: XD, z: 0, r: EDGE }]} thickness={0.14} color={PALETTE.erMembrane} surfaceOpacity={SURF} position={[0, YD, 0]} />
      <BudSheet model={donor} id="donor-compartment" budId="transport-vesicle" thickness={0.14} color={PALETTE.erMembrane} surfaceOpacity={SURF} position={[XD, YD, 0]} />
      <Anchor id="donor-compartment" position={[XD - 2.6, YD + 0.9, 0.6]} />

      {/* ——— target compartment (bottom) ——— */}
      <LumenTint id="target-compartment" box={[-16, 16, YT - 7, YT - 0.08, -8, 8]} color={PALETTE.golgiLumen} strength={0.5} />
      {/* rotated like the target patch so the two leaflet layers line up (no seam at the patch edge) */}
      <HoledSheet id="target-compartment" width={32} depth={16} holes={[{ x: XT, z: 0, r: EDGE }]} thickness={0.14} color={PALETTE.golgiMembrane} surfaceOpacity={SURF} position={[0, YT, 0]} rotation={[Math.PI, 0, 0]} />
      <BudSheet model={target} id="target-compartment" budId="transport-vesicle" thickness={0.14} color={PALETTE.golgiMembrane} budColor={PALETTE.erMembrane} surfaceOpacity={SURF} position={[XT, YT, 0]} rotation={[Math.PI, 0, 0]} />
      <Anchor id="target-compartment" position={[XT + 2.6, YT - 0.9, 0.6]} />
      {/* complementary receptor of the Rab (unlabelled here; stage "Rab GTPases" names it) */}
      <MembraneProtein color="#339af0" side="cytosol" size={0.62} seed={7} position={RECEPTOR} glow={dockGlow} opacity={1 - seg(t, B.pore[0], B.flatten[0])} />

      {/* ——— cargo ——— */}
      {CARGO.map((_, i) => (
        <Protein key={i} shape="blob" color={PALETTE.cargo} size={0.26} seed={i + 3} position={cargoPos(t, i, sA, sB)} />
      ))}

      {/* ——— vesicle A (step 2: the whole journey) ——— */}
      {sA.phase === 'free' && <Vesicle id="transport-vesicle" radius={R} color={PALETTE.erMembrane} lumenColor={PALETTE.erLumen} position={sA.c} />}
      {sA.coatO > 0.01 && <ClathrinCage id="coat" radius={COAT_R} amount={sA.coat} from={[0, -1, 0]} position={sA.c} opacity={sA.coatO} />}
      <Protein id="rab" shape="blob" color={PALETTE.rab} size={0.36} seed={5} position={rabA} opacity={rabAO} />
      <Anchor id="transport-vesicle" position={add(sA.c, [-0.3 * R, 0.15 * R, 0.5 * R])} show={vesAShow} />

      {/* ——— vesicle B (steps 3–5) ——— */}
      {sB.phase === 'free' && <Vesicle id="transport-vesicle" radius={R} color={PALETTE.erMembrane} lumenColor={PALETTE.erLumen} position={sB.c} />}
      {sB.coatO > 0.01 && <ClathrinCage id="coat" radius={COAT_R} amount={sB.coat} from={[0, -1, 0]} position={sB.c} opacity={sB.coatO} />}
      {tris.map((k, i) =>
        k.o > 0.01 ? <Triskelion key={i} id="coat" size={0.42} color={PALETTE.clathrin} position={k.pos} rotation={k.rot} opacity={k.o} /> : null,
      )}
      <Anchor id="coat" position={add(sB.c, norm([0.5, -0.62, 0.6]), COAT_R)} show={sB.coatO * seg(sB.coat, 0.2, 0.3) * vis(t, 0.4, 2)} />
      <Anchor id="transport-vesicle" position={add(sB.c, [-0.3 * R, 0.15 * R, 0.5 * R])} show={vesBShow} />
      <Protein id="rab" shape="blob" color={PALETTE.rab} size={0.42} seed={5} position={rabB} opacity={rabBO} glow={dockGlow} />
      <Anchor id="rab" position={rabB} show={rabBO} />

      {/* SNAREs: v on the vesicle, t on the target; they find each other, zip and pull the membranes together */}
      {snO > 0.01 && pairs.map((p, i) => <SnarePair key={i} vRoot={p.vRoot} tRoot={p.tRoot} reach={reach} zip={zip} opacity={snO} />)}
      <Anchor id="v-snare" position={lerp3(pairs[0].vRoot, pairs[0].tRoot, 0.14)} show={snO} />
      <Anchor id="t-snare" position={lerp3(pairs[1].tRoot, pairs[1].vRoot, 0.16)} show={snO} />

      {/* many vesicles travel through the cytoplasm at the same time */}
      {othersO > 0.01 &&
        OTHERS.map((o, i) => {
          const w = t * 40 + o.ph;
          const pos: V3 = [o.p[0] + o.sx * Math.sin(w * 0.5), o.p[1] + 0.5 * Math.sin(w * 0.37 + 1), o.p[2] + 0.4 * Math.cos(w * 0.3)];
          return <Vesicle key={i} id="transport-vesicle" radius={o.r} color={o.c} lumenColor={PALETTE.erLumen} cargo={{ count: 3, color: PALETTE.cargo, seed: i }} position={pos} opacity={othersO} />;
        })}
    </group>
  );
}
