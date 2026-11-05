/**
 * t9-overview choreography: world layout + one pure function that, for a vesicle's timetable, says where the
 * vesicle is and what shape the donor / target membrane patches have at time t.
 *
 * World: donor membrane at y = YD (DONOR LUMEN above, +y), target membrane at y = YT (TARGET LUMEN below, −y),
 * cytosol in between. The bud forms at x = XD and hangs into the cytosol; it fuses at x = XT.
 * Membrane patches are BudModels (t10/parts): donor in its natural frame (bud into −y); target rotated by π about x,
 * so its "bud" (the fusing vesicle) points up into the cytosol and its lumen is −y.
 */
import { clamp, lerp, seg, type V3 } from '@/engine/anim';
import { hForNeck } from '../../t10/parts/profile';

export const YD = 3.2;
export const YT = -3.2;
export const XD = -2.4;
export const XT = 2.4;
export const R = 0.85;
export const RHO_D = 0.32;
export const RHO_T = 0.16;
export const EDGE = 2.4;
export const COAT_R = R * 1.28;

/** donor: bud centre depth when the neck closes (scission) */
export const H_CUT = hForNeck(R, RHO_D, 0.06);
/** target: vesicle centre height when Rab is docked on its receptor */
export const H_DOCK = R + 0.7;
/** target: vesicle centre height when the SNAREs have pulled the membranes together (pore opens) */
const N0 = 0.05;
const NMAX = 0.6;
export const H_FUSE = hForNeck(R, RHO_T, N0);
const H_OPEN = hForNeck(R, RHO_T, NMAX);
const H_FLAT = -R + 0.01;

export type Win = readonly [number, number];
export interface VesPlan {
  coat: Win;
  pit: Win;
  invag: Win;
  cut: number;
  uncoat: Win;
  rab: Win;
  travel: Win;
  zip: Win;
  pore: Win;
  flatten: Win;
  release: Win;
}

/** vesicle A: the whole journey, briefly (step 2) */
export const A: VesPlan = {
  coat: [0.203, 0.236],
  pit: [0.205, 0.224],
  invag: [0.221, 0.25],
  cut: 0.252,
  uncoat: [0.256, 0.27],
  rab: [0.262, 0.274],
  travel: [0.258, 0.305],
  zip: [0.305, 0.318],
  pore: [0.318, 0.324],
  flatten: [0.324, 0.342],
  release: [0.32, 0.352],
};

/** vesicle B: followed control by control (steps 3–5) */
export const B: VesPlan = {
  coat: [0.41, 0.5],
  pit: [0.418, 0.468],
  invag: [0.466, 0.528],
  cut: 0.532,
  uncoat: [0.552, 0.585],
  rab: [0.608, 0.645],
  travel: [0.655, 0.738],
  zip: [0.846, 0.884],
  pore: [0.886, 0.895],
  flatten: [0.895, 0.93],
  release: [0.89, 0.965],
};
/** B: SNAREs find each other before they zip */
export const B_REACH: Win = [0.81, 0.844];
/** B: Rab meets its receptor on the target */
export const B_DOCK: Win = [0.738, 0.768];

export type Phase = 'none' | 'bud' | 'free' | 'fused' | 'gone';

export interface VesState {
  phase: Phase;
  /** world centre of the vesicle sphere */
  c: V3;
  /** donor patch: sphere depth h (BudModel) while budding */
  donorH: number;
  /** target patch: h while fusing */
  targetH: number;
  /** ClathrinCage amount (already clipped so it never pokes into the lumen) */
  coat: number;
  coatO: number;
}

const _hang = (t: number, p: VesPlan) => YD - H_CUT - 0.35 * seg(t, p.cut, p.cut + 0.03);

/** quadratic Bézier from the hang point to the dock point, bowing toward the camera */
function path(u: number, y0: number): V3 {
  const a: V3 = [XD, y0, 0];
  const b: V3 = [XT, YT + H_DOCK, 0];
  const k: V3 = [0, (y0 + YT + H_DOCK) / 2 + 0.3, 1.1];
  const w0 = (1 - u) * (1 - u);
  const w1 = 2 * u * (1 - u);
  const w2 = u * u;
  return [a[0] * w0 + k[0] * w1 + b[0] * w2, a[1] * w0 + k[1] * w1 + b[1] * w2, a[2] * w0 + k[2] * w1 + b[2] * w2];
}

export function vesState(t: number, p: VesPlan): VesState {
  const s: VesState = { phase: 'none', c: [XD, YD + R, 0], donorH: H_FLAT, targetH: H_FLAT, coat: 0, coatO: 0 };
  const coatGrow = 0.12 + 0.76 * seg(t, p.coat[0], p.coat[1]);
  s.coatO = t >= p.coat[0] ? 1 - seg(t, p.uncoat[0], p.uncoat[1]) : 0;
  if (t < p.cut) {
    const pit = seg(t, p.pit[0], p.pit[1]);
    const invag = seg(t, p.invag[0], p.invag[1]);
    const h = invag > 0 ? hForNeck(R, RHO_D, lerp(R, 0.06, invag)) : lerp(H_FLAT, RHO_D, pit);
    s.donorH = h;
    s.phase = t >= p.pit[0] ? 'bud' : 'none';
    s.c = [XD, YD - h, 0];
    // the coat lives on the cytosolic face only: clip the cap at the membrane plane
    const cosMax = clamp((-h + 0.14) / COAT_R, -1, 1);
    s.coat = Math.min(coatGrow, Math.acos(cosMax) / Math.PI);
    return s;
  }
  s.coat = coatGrow;
  if (t < p.pore[0]) {
    s.phase = 'free';
    const u = seg(t, p.travel[0], p.travel[1]);
    const y0 = _hang(t, p);
    s.c = u > 0 ? path(u, y0) : [XD, y0, 0];
    if (t >= p.travel[1]) s.c = [XT, YT + lerp(H_DOCK, H_FUSE, seg(t, p.zip[0], p.zip[1])), 0];
    return s;
  }
  s.phase = t >= p.flatten[1] ? 'gone' : 'fused';
  const pore = seg(t, p.pore[0], p.pore[1]);
  const flat = seg(t, p.flatten[0], p.flatten[1]);
  const h = flat > 0 ? lerp(H_OPEN, H_FLAT, flat) : hForNeck(R, RHO_T, lerp(N0, NMAX, pore));
  s.targetH = h;
  s.c = [XT, YT + h, 0];
  return s;
}
