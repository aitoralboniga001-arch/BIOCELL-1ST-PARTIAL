/**
 * t9-snare, steps 5–7: the whole vesicle cycle at organelle scale, donor AND target in one frame.
 *
 * World: target membrane at y = 0 (CYTOSOL above, TARGET LUMEN below); donor membrane at y = YD (DONOR LUMEN above,
 * CYTOSOL below). The cytosol is the band between them. A clathrin-coated bud forms on the donor at x = DX, dynamin
 * cuts it, the coat falls off, a Rab tags it, a tethering protein from the target catches it and reels it in, a
 * Rab receptor docks it at x = FX, v/t-SNAREs zip, it fuses (BudModel in the fusion direction) and the cargo enters
 * the target lumen; then the Rab and the v-SNARE (in a small recycling vesicle) return to the donor.
 * Step 7: the four stations of the figure in the notes appear in order along the same route.
 */
import { useMemo } from 'react';
import { clamp, lerp, lerp3, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, Bond, ClathrinCage, EdgeTag, fibonacciSphere, LumenTint, MembraneProtein, PALETTE, Protein, Vesicle } from '@/three/kit';
import { BudSheet, useBudModel } from '../../t10/parts/bud';
import { DynaminCollar, TriskelionCloud } from '../../t10/parts/Machinery';
import { HoledSheet } from '../../t10/parts/Membranes';
import { hForNeck } from '../../t10/parts/profile';
import { Capsule } from '../../t7/parts/molecules';

export const YD = 7.2;
export const DX = -4.5;
export const FX = 4.5;
const R = 1.0;
const RHO = 0.35;
const EDGE = 2.6;
const CAGE = R * 1.32;
const NECK = 0.35;
const TH = 0.14;
const REC_C = '#339af0'; // rab-receptor (structures table colour)
const TETHER_C = '#a5d8ff'; // tethering-protein (structures table colour)
const FUS_C = '#b197fc'; // fusion-complex (structures table colour)
const DOCK_H = hForNeck(R, RHO, 0.02); // vesicle centre when the membranes touch
const DOCK0 = DOCK_H + 0.32; // docked, before the SNAREs zip

/** Event windows (stage time). Duration 115 s → 1.5 s ≈ 0.013. */
export const T2 = {
  in: [0.555, 0.59],
  coat: [0.588, 0.618],
  pit: [0.588, 0.616],
  invag: [0.616, 0.63],
  dyn: [0.618, 0.633],
  con: [0.633, 0.646],
  cut: 0.647,
  drop: [0.647, 0.662],
  uncoat: [0.652, 0.674],
  drift: [0.656, 0.7],
  rab: [0.668, 0.688],
  prenyl: [0.686, 0.694],
  tether: [0.69, 0.706],
  reel: [0.708, 0.73],
  receptor: [0.722, 0.738],
  zip: [0.742, 0.764],
  dimple: [0.756, 0.768],
  pore: [0.768, 0.779],
  collapse: [0.779, 0.802],
  spill: [0.772, 0.808],
  recycle: [0.808, 0.852],
  // step 7 stations
  sA: [0.868, 0.888],
  sB: [0.893, 0.913],
  sC: [0.918, 0.938],
  sD: [0.943, 0.963],
} as const;

const SB: V3 = [-1.2, 4.0, 0]; // station B (delivery) and the point where Rab tags the vesicle
const SC_X = 1.4; // station C (docked) x
const TETHER_BASE: V3 = [2.4, 0.07, 0.25];
const REC_P: V3 = [FX + 0.62, 0, 0.35];
const RAB_DIR: V3 = [0.62, -0.62, 0.48]; // where the Rab sits on the vesicle (towards the target / receptor side)
const rabOn = (c: V3, k = R + 0.2): V3 => {
  const l = Math.hypot(...RAB_DIR);
  return [c[0] + (RAB_DIR[0] / l) * k, c[1] + (RAB_DIR[1] / l) * k, c[2] + (RAB_DIR[2] / l) * k];
};
const quad = (a: V3, b: V3, c: V3, k: number): V3 => lerp3(lerp3(a, b, k), lerp3(b, c, k), k);

/** cargo offsets inside the vesicle + their final spot in the target lumen */
const CARGO = Array.from({ length: 7 }, (_, i) => {
  const a = i * 2.39996;
  const r = 0.28 + 0.3 * ((i * 37) % 7) / 7;
  const y = -0.35 + 0.7 * ((i * 3) % 7) / 7;
  return { o: [Math.cos(a) * r, y, Math.sin(a) * r] as V3, end: [FX + Math.cos(a) * (0.6 + 0.25 * i), -0.75 - 0.18 * (i % 4), Math.sin(a) * 0.9] as V3 };
});

export function SnareCycle({ t }: { t: number }) {
  const don = useBudModel();
  const tgt = useBudModel();
  const recap = useBudModel(); // station A (re-budding donor, step 7)
  const fusD = useBudModel(); // station D (fusion pore, step 7)
  const o = seg(t, T2.in[0], T2.in[1]);
  const on = o > 0.01;

  // ———————————— donor: coat + bud + dynamin + scission ————————————
  const pit = smooth(seg(t, T2.pit[0], T2.pit[1]));
  const invag = smooth(seg(t, T2.invag[0], T2.invag[1]));
  const dynA = seg(t, T2.dyn[0], T2.dyn[1]);
  const con = seg(t, T2.con[0], T2.con[1]);
  const cut = t >= T2.cut;
  const hNeck = (rn: number) => hForNeck(R, RHO, rn);
  let hD = lerp(-R + 0.01, RHO, pit);
  if (invag > 0) hD = lerp(RHO, hNeck(0.5), invag);
  if (con > 0) hD = lerp(hNeck(0.5), hNeck(0.2), con);
  const dInfo = cut
    ? don.update({ R, rho: RHO, edge: EDGE, cut: true, vesY: -1000, dimple: RHO * 0.9 * (1 - seg(t, T2.cut, T2.cut + 0.03)) })
    : don.update({ R, rho: RHO, edge: EDGE, h: hD, neck: NECK * dynA });
  const cutC = -hNeck(0.2) - NECK; // local centre at the cut
  const budC: V3 = [DX, YD + (cut ? cutC : dInfo.cy), 0];
  const neckR = Number.isFinite(dInfo.neckR) ? dInfo.neckR : 0.5;
  const coat = 0.9 * smooth(seg(t, T2.coat[0], T2.coat[1])) * (1 - smooth(seg(t, T2.uncoat[0], T2.uncoat[1])));

  // ———————————— the travelling vesicle ————————————
  const afterDrop: V3 = [DX + 0.15, YD + cutC - 0.45, 0];
  const drop = smooth(seg(t, T2.drop[0], T2.drop[1]));
  const drift = smooth(seg(t, T2.drift[0], T2.drift[1]));
  const reel = smooth(seg(t, T2.reel[0], T2.reel[1]));
  const zip = smooth(seg(t, T2.zip[0], T2.zip[1]));
  const dockC: V3 = [FX, lerp(DOCK0, DOCK_H, zip), 0];
  let vc: V3 = budC;
  if (cut) {
    if (t < T2.reel[0]) vc = lerp3(lerp3(budC, afterDrop, drop), SB, drift);
    else if (t < T2.zip[0]) vc = quad(SB, [SB[0] + 4.2, SB[1] + 0.2, 0], [FX, DOCK0, 0], reel);
    else vc = dockC;
  }
  const docked = t >= T2.receptor[1]; // from here the vesicle is drawn by the target's BudModel (on its axis)
  const fusing = t >= T2.pore[0];
  const pore = seg(t, T2.pore[0], T2.pore[1]);
  const collapse = smooth(seg(t, T2.collapse[0], T2.collapse[1]));
  const dimple = smooth(seg(t, T2.dimple[0], T2.dimple[1]));
  if (fusing) {
    tgt.update(collapse > 0 ? { R, rho: RHO, edge: EDGE, h: lerp(hForNeck(R, RHO, 0.55), -R + 0.01, collapse) } : { R, rho: RHO, edge: EDGE, neckR: lerp(0.02, 0.55, pore) });
  } else {
    tgt.update({ R, rho: RHO, edge: EDGE, cut: true, vesY: docked ? -vc[1] : -1000, dimple: RHO * 0.9 * dimple });
  }
  const vesicleFree = cut && !docked; // kit Vesicle drawn while it travels

  // Rab: free in the cytosol → onto the vesicle (prenyl) → stays until fusion → recycled
  const rabIn = smooth(seg(t, T2.rab[0], T2.rab[1]));
  const prenyl = seg(t, T2.prenyl[0], T2.prenyl[1]);
  const rec = smooth(seg(t, T2.recycle[0], T2.recycle[1]));
  const rabFree: V3 = [-0.6 + 0.2 * Math.sin(t * 70), 6.0 + 0.15 * Math.cos(t * 53), 0.6];
  const rabSeat = rabOn(vc, lerp(R + 0.45, R + 0.2, prenyl));
  const fusedRab: V3 = [FX + 0.75, 0.45, 0.45];
  let rabP = lerp3(rabFree, rabSeat, rabIn);
  if (t >= T2.collapse[0]) rabP = lerp3(rabOn([FX, DOCK_H, 0]), fusedRab, collapse);
  if (rec > 0) rabP = quad(fusedRab, [FX - 1.5, 4.5, 0.8], [DX + 2.6, YD - 1.6, 0.6], rec);
  const rabShow = vis(t, T2.rab[0] - 0.01, T2.recycle[1] + 0.004, 0.006);

  // tethering protein: rises from the target membrane, catches the Rab, reels the vesicle in
  const tetherUp = smooth(seg(t, T2.tether[0], T2.tether[1]));
  const tetherIdle: V3 = [TETHER_BASE[0] - 0.4, 2.2, 0.3];
  const tetherTip = t < T2.reel[0] ? lerp3(tetherIdle, rabP, tetherUp) : rabP;
  const tetherShow = vis(t, T2.tether[0] - 0.012, T2.receptor[1] + 0.006, 0.006);

  // Rab receptor in the target membrane: its head reaches the Rab (docking)
  const recIn = smooth(seg(t, T2.receptor[0], T2.receptor[1]));
  const recShow = vis(t, T2.reel[0], T2.recycle[0] + 0.01, 0.01);

  // SNAREs at the docking site (organelle scale: one v / t pair each side)
  const snShow = vis(t, T2.reel[1] - 0.004, T2.recycle[0] + 0.01, 0.008);
  const vBot = vc[1] - R;
  const snares = [-1, 1].map((s) => {
    const x = FX + s * 0.42;
    const vA: V3 = [x, vBot + 0.1 + (1 - Math.sqrt(1 - 0.18)) * R, 0.25];
    const tA: V3 = [x + s * 0.32, 0.06, 0.25];
    const mid: V3 = [x + s * 0.2, (vA[1] + 0.06) / 2, 0.25];
    const vEnd = lerp3([x + s * 0.75, vA[1] - 0.2, 0.3], mid, zip);
    const tEnd = lerp3([x + s * 0.75, 0.55, 0.2], [mid[0] + 0.03, mid[1] + 0.03, 0.27], zip);
    return { vA, tA, vEnd, tEnd };
  });
  const fusO = vis(t, T2.zip[1] - 0.008, T2.collapse[1], 0.008);

  // recycling vesicle carrying the v-SNARE back to the donor
  const rv = quad([FX - 0.8, 0.55, 0.5], [FX - 2.5, 5.5, 0.8], [DX + 1.6, YD - 0.6, 0.4], rec);
  const rvO = vis(t, T2.recycle[0] - 0.002, T2.recycle[1] + 0.006, 0.01);

  // ———————————— step 7: the stations, in order ————————————
  const sA = smooth(seg(t, T2.sA[0], T2.sA[1]));
  const sB = smooth(seg(t, T2.sB[0], T2.sB[1]));
  const sC = smooth(seg(t, T2.sC[0], T2.sC[1]));
  const sD = smooth(seg(t, T2.sD[0], T2.sD[1]));
  const recapOn = t >= T2.sA[0];
  recap.update({ R, rho: RHO, edge: EDGE, h: lerp(-R + 0.01, hNeck(0.32), sA), neck: NECK * sA });
  fusD.update({ R, rho: RHO, edge: EDGE, h: lerp(-R + 0.01, hNeck(0.6), sD) });
  const sACy = YD + recap.info.cy;
  const sANeck = Number.isFinite(recap.info.neckR) ? recap.info.neckR : 0.5;
  const scC: V3 = [SC_X, DOCK0 - 0.1, 0];

  const triStarts = useMemo(() => fibonacciSphere(18).filter((v) => v.y < 0.5).map((v) => [v.x * CAGE, v.y * CAGE, v.z * CAGE] as V3), []);
  const triRel = (i: number) => {
    const s = triStarts[i];
    const when = lerp(T2.uncoat[0], T2.uncoat[1] - 0.012, clamp((s[1] / CAGE + 1) / 1.5));
    return smooth(clamp((t - when) / 0.03));
  };

  if (!on) return null;
  // the donor bud is replaced by the recap bud during step 7 (the healed donor re-buds)
  const donorModel = recapOn ? recap : don;
  const showDonorCage = !cut || t < T2.uncoat[1] + 0.01;

  return (
    <group>
      <EdgeTag side="top" text="DONOR COMPARTMENT LUMEN" />
      <EdgeTag side="bottom" text="TARGET COMPARTMENT LUMEN" />
      <EdgeTag side="left" text="CYTOSOL" />

      {/* ———————— donor membrane (lumen above) ———————— */}
      <group position={[0, YD, 0]}>
        <HoledSheet id="donor-compartment" width={24} depth={12} holes={[{ x: DX, z: 0, r: EDGE }]} thickness={TH} color={PALETTE.erMembrane} opacity={o} />
        <BudSheet model={donorModel} position={[DX, 0, 0]} id="donor-compartment" budId="transport-vesicle" thickness={TH} color={PALETTE.erMembrane} budColor={PALETTE.membrane} opacity={o} />
        <LumenTint box={[-12, 12, 0.1, 3.5, -6, 6]} color={PALETTE.erLumen} strength={0.16} opacity={o} />
      </group>
      <Anchor id="donor-compartment" position={[-8.2, YD + 0.05, 1.5]} show={o} />

      {/* coat polymerising on the bud, then falling apart into triskelions */}
      {showDonorCage && (
        <group position={cut ? vc : budC}>
          <ClathrinCage radius={CAGE} amount={coat} from={[0, -1, 0]} id="coat" opacity={o} />
          {cut && <TriskelionCloud starts={triStarts} release={triRel} centre={[0, 0, 0]} size={0.32} drift={2.6} id="coat" />}
        </group>
      )}
      <Anchor id="coat" position={[(cut ? vc : budC)[0] + 0.55, (cut ? vc : budC)[1] - 0.85, 0.9]} show={o * (coat > 0.25 ? 1 : 0)} />

      {/* dynamin collar on the neck */}
      {t >= T2.dyn[0] && t < T2.cut + 0.02 && (
        <DynaminCollar id="dynamin" position={[DX, YD, 0]} neckR={neckR} y0={-RHO - 0.04} y1={-RHO - Math.max(0.12, NECK * dynA) + 0.04} turns={2} perTurn={11} size={0.26} assembled={dynA} release={seg(t, T2.cut, T2.cut + 0.02)} hydrolysis={con} twist={0.8 * con} seed={6} opacity={o} />
      )}
      <Anchor id="dynamin" position={[DX + 0.2, YD - RHO - 0.2, 0.75]} show={vis(t, T2.dyn[0] + 0.006, T2.cut + 0.004, 0.004)} />

      {/* the free vesicle (kit vesicle while it travels) */}
      {vesicleFree && <Vesicle id="transport-vesicle" radius={R} position={vc} color={PALETTE.membrane} lumenColor={PALETTE.golgiLumen} opacity={o} />}
      <Anchor id="transport-vesicle" position={[vc[0] - 0.35, vc[1] + 0.15, 0.75]} show={o * vis(t, T2.cut, T2.collapse[0] + 0.004, 0.006)} />

      {/* cargo: inside the vesicle, then into the target lumen */}
      {CARGO.map((c, i) => {
        const k = smooth(clamp((t - T2.spill[0] - i * 0.003) / (T2.spill[1] - T2.spill[0] - 0.02)));
        const inside: V3 = [vc[0] + c.o[0], vc[1] + c.o[1], vc[2] + c.o[2]];
        const p = k > 0 ? quad(inside, [FX + c.o[0] * 0.3, 0.05, c.o[2] * 0.3], c.end, k) : inside;
        return <Protein key={i} shape="blob" color={PALETTE.cargo} size={0.2} seed={i + 3} position={p} opacity={o * (cut ? 1 : 0) * (1 - seg(t, 0.855, 0.866))} />;
      })}

      {/* ———————— target membrane (lumen below) ———————— */}
      <HoledSheet id="target-compartment" width={24} depth={12} holes={[{ x: FX, z: 0, r: EDGE }]} thickness={TH} color={PALETTE.golgiMembrane} opacity={o} />
      <BudSheet model={tgt} position={[FX, 0, 0]} rotation={[Math.PI, 0, 0]} id="target-compartment" budId="transport-vesicle" thickness={TH} color={PALETTE.golgiMembrane} budColor={PALETTE.membrane} opacity={o * (sD > 0 ? 0 : 1)} />
      {sD > 0 && <BudSheet model={fusD} position={[FX, 0, 0]} rotation={[Math.PI, 0, 0]} id="target-compartment" budId="transport-vesicle" thickness={TH} color={PALETTE.golgiMembrane} budColor={PALETTE.membrane} opacity={o} />}
      <LumenTint box={[-12, 12, -3.5, -0.1, -6, 6]} color={PALETTE.golgiLumen} strength={0.22} opacity={o} />
      <Anchor id="target-compartment" position={[8.2, 0.02, 1.5]} show={o} />

      {/* Rab GTPase */}
      <Protein id="rab" shape="blob" color={PALETTE.rab} size={0.42} seed={5} position={rabP} opacity={o * rabShow} />
      <Bond id="rab" a={rabP} b={rabOn(vc, R - 0.05)} radius={0.035} color={PALETTE.lipidTail} show={o * prenyl * (t < T2.collapse[0] ? 1 : 0)} />
      <Anchor id="rab" position={rabP} show={o * rabShow * (t < T2.sA[0] ? 1 : 0)} />

      {/* tethering protein ("fishing line") */}
      <Bond id="tethering-protein" a={TETHER_BASE} b={tetherTip} radius={0.05} color={TETHER_C} show={o * tetherShow} />
      <Protein shape="blob" color={TETHER_C} size={0.3} seed={12} position={TETHER_BASE} opacity={o * tetherShow} id="tethering-protein" />
      <Anchor id="tethering-protein" position={lerp3(TETHER_BASE, tetherTip, 0.45)} show={o * tetherShow * (t < T2.sA[0] ? 1 : 0)} />

      {/* Rab receptor (docking) */}
      <MembraneProtein id="rab-receptor" color={REC_C} side="cytosol" size={0.42} position={REC_P} opacity={o * recShow} />
      <Bond id="rab-receptor" a={[REC_P[0], 0.42, REC_P[2]]} b={lerp3([REC_P[0], 0.5, REC_P[2]], rabP, recIn)} radius={0.07} color={REC_C} show={o * recShow * (recIn > 0.02 ? 1 : 0)} />
      <Anchor id="rab-receptor" position={[REC_P[0] + 0.05, 0.3, REC_P[2] + 0.1]} show={o * recShow * (t < T2.sA[0] ? 1 : 0)} />

      {/* v / t SNAREs pairing at the docking site */}
      {snShow > 0.01 &&
        snares.map((s, i) => (
          <group key={i}>
            <Capsule id="v-snare" a={s.vA} b={s.vEnd} r={0.055} color={PALETTE.vSnare} opacity={o * snShow} />
            <Capsule id="t-snare" a={s.tA} b={s.tEnd} r={0.055} color={PALETTE.tSnare} opacity={o * snShow} />
          </group>
        ))}
      <Anchor id="v-snare" position={lerp3(snares[1].vA, snares[1].vEnd, 0.5)} show={o * snShow * (t < T2.sA[0] ? 1 : 0)} />
      <Anchor id="t-snare" position={lerp3(snares[0].tA, snares[0].tEnd, 0.5)} show={o * snShow * (t < T2.sA[0] ? 1 : 0)} />

      {/* membrane fusion complex at the contact site */}
      {[0, 1, 2].map((i) => (
        <Protein key={i} id="fusion-complex" shape="blob" color={FUS_C} size={0.26} seed={i + 5} position={[FX + (i - 1) * 0.75, 0.35, 0.55 + (i === 1 ? 0.25 : 0)]} opacity={o * fusO} />
      ))}
      <Anchor id="fusion-complex" position={[FX, 0.35, 0.8]} show={o * fusO} />

      {/* recycling: the v-SNARE returns to the donor in a small vesicle */}
      {rvO > 0.01 && (
        <group position={rv}>
          <Vesicle radius={0.42} color={PALETTE.membrane} lumenColor={PALETTE.golgiLumen} opacity={o * rvO} id="transport-vesicle" />
          <Capsule id="v-snare" a={[0.2, -0.3, 0.2]} b={[0.42, -0.58, 0.3]} r={0.05} color={PALETTE.vSnare} opacity={o * rvO} />
          <Capsule id="v-snare" a={[-0.25, -0.28, 0.2]} b={[-0.46, -0.55, 0.3]} r={0.05} color={PALETTE.vSnare} opacity={o * rvO} />
        </group>
      )}
      <Anchor id="v-snare" text="v-SNARE · recycled to the donor" position={[rv[0] + 0.3, rv[1] - 0.45, rv[2] + 0.3]} show={o * rvO} />

      {/* ———————— step 7 stations ———————— */}
      {recapOn && (
        <>
          {/* A: formation + cut on the donor (the bud above is the re-budding donor) */}
          <group position={[DX, sACy, 0]}>
            <ClathrinCage radius={CAGE} amount={0.85 * sA} from={[0, -1, 0]} id="coat" />
          </group>
          <DynaminCollar id="dynamin" position={[DX, YD, 0]} neckR={sANeck} y0={-RHO - 0.04} y1={-RHO - Math.max(0.12, NECK * sA) + 0.04} turns={2} perTurn={11} size={0.26} assembled={sA} seed={8} />
          <Anchor id="coat" position={[DX + 0.55, sACy - 0.85, 0.9]} show={sA} />
          <Anchor id="dynamin" position={[DX + 0.2, YD - RHO - 0.2, 0.75]} show={sA} />

          {/* B: delivery — naked vesicle tagged by Rab, caught by a tethering protein */}
          <Vesicle id="transport-vesicle" radius={R} position={SB} color={PALETTE.membrane} lumenColor={PALETTE.golgiLumen} cargo={{ count: 6, color: PALETTE.cargo, seed: 2 }} opacity={sB} />
          <Protein id="rab" shape="blob" color={PALETTE.rab} size={0.42} seed={5} position={rabOn(SB)} opacity={sB} />
          <Bond id="tethering-protein" a={[SB[0] + 2.0, 0.07, 0.25]} b={rabOn(SB)} radius={0.05} color={TETHER_C} show={sB} />
          <Protein shape="blob" color={TETHER_C} size={0.3} seed={12} position={[SB[0] + 2.0, 0.07, 0.25]} opacity={sB} id="tethering-protein" />
          <Anchor id="transport-vesicle" position={[SB[0] - 0.35, SB[1] + 0.15, 0.75]} show={sB} />
          <Anchor id="rab" position={rabOn(SB)} show={sB} />
          <Anchor id="tethering-protein" position={lerp3([SB[0] + 2.0, 0.07, 0.25], rabOn(SB), 0.4)} show={sB} />

          {/* C: docking by the Rab receptor + SNAREs zipped */}
          <Vesicle radius={R} position={scC} color={PALETTE.membrane} lumenColor={PALETTE.golgiLumen} cargo={{ count: 6, color: PALETTE.cargo, seed: 4 }} opacity={sC} id="transport-vesicle" />
          <Protein id="rab" shape="blob" color={PALETTE.rab} size={0.42} seed={5} position={rabOn(scC)} opacity={sC} />
          <MembraneProtein id="rab-receptor" color={REC_C} side="cytosol" size={0.42} position={[SC_X + 0.62, 0, 0.35]} opacity={sC} />
          <Bond id="rab-receptor" a={[SC_X + 0.62, 0.42, 0.35]} b={rabOn(scC)} radius={0.07} color={REC_C} show={sC} />
          {[-1, 1].map((s) => {
            const x = SC_X + s * 0.42;
            const vy = scC[1] - R + 0.12;
            const mid: V3 = [x + s * 0.2, (vy + 0.06) / 2, 0.25];
            return (
              <group key={s}>
                <Capsule id="v-snare" a={[x, vy, 0.25]} b={mid} r={0.055} color={PALETTE.vSnare} opacity={sC} />
                <Capsule id="t-snare" a={[x + s * 0.32, 0.06, 0.25]} b={[mid[0] + 0.03, mid[1] + 0.03, 0.27]} r={0.055} color={PALETTE.tSnare} opacity={sC} />
              </group>
            );
          })}
          <Anchor id="rab-receptor" position={[SC_X + 0.67, 0.3, 0.45]} show={sC} />
          <Anchor id="v-snare" position={[SC_X + 0.52, scC[1] - R - 0.12, 0.3]} show={sC} />
          <Anchor id="t-snare" position={[SC_X - 0.6, 0.25, 0.3]} show={sC} />

          {/* D: fusion — pore open, cargo entering the target lumen */}
          {[0, 1, 2, 3].map((i) => (
            <Protein key={i} shape="blob" color={PALETTE.cargo} size={0.2} seed={i + 21} position={[FX + (i - 1.5) * 0.45, -0.5 - 0.35 * sD * (i % 2), 0.2]} opacity={sD} />
          ))}
          <Anchor id="transport-vesicle" text="Fusion: content delivered" position={[FX, DOCK_H - 0.1, 0.6]} show={sD} />
        </>
      )}
    </group>
  );
}
