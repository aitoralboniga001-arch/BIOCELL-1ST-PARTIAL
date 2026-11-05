/**
 * t9-copii — GTPase switch + COPII coat formation at the ER (molecular close-up, lipid bilayer).
 *
 * World: ER membrane mid-plane y = 0, CYTOSOL = +y, ER LUMEN = −y. The budding site is the axis x = z = 0:
 * a t10 BudModel (lipids that really bend) rendered upside down (rotation π about z) so the bud bulges
 * INTO the cytosol and its lumen is continuous with the ER lumen. Everything that rides the membrane is
 * placed by (arc distance from the bud tip d, azimuth θ) → `surf()`, so it follows the bending bilayer.
 *
 *  0  switch concept: Sar1-GDP (OFF) docks on the GEF → GDP out, GTP in → lobe closes + tail swings out (ON)
 *     → GTP hydrolysed (GDP + Pi) → OFF again
 *  1  Sar1-GDP drifts in the cytosol (soluble, not in the membrane)
 *  2  Sar1-GDP docks on the transmembrane GEF: GDP leaves, GTP enters (ON)
 *  3  conformational change: the hydrophobic tail swings out and inserts into the cytosolic leaflet at the
 *     budding site (other Sar1s are switched on by GEFs nearby, in the background)
 *  4  Sec23/24 (dark-green bow-ties: Sec23 on Sar1, Sec24 grabs the receptor tail) arrive; cargo receptors
 *     (cargo held on the LUMEN side) slide in under them
 *  5  Sec13/31 rods polymerise into the outer cage while the bilayer bends into a bud (cargo inside)
 *  6  GTP → GDP + Pi on every Sar1 (OFF); the vesicle closes off; Sar1-GDP leaves the membrane and the
 *     coat comes apart (rods and adaptors drift away) → naked vesicle with its cargo
 */
import { useMemo } from 'react';
import { Quaternion, Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { clamp, lerp, lerp3, rand, seg, smooth, type V3 } from '@/engine/anim';
import { Anchor, Bilayer, EdgeTag, LumenTint, MembraneProtein, PALETTE, useStageCamera, type CamKey } from '@/three/kit';
import { BudLipids, useBudModel, type BudModel } from '../t10/parts/bud';
import { hForNeck } from '../t10/parts/profile';
import { Nucleotide } from '../t10/parts/Machinery';
import { CargoReceptor, CopiiCage, makeCageLattice, Sar1, SAR1_POCKET, Sec2324 } from './parts/CopiiParts';

export const P = [0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.86] as const;

// ———————————————————————————————————————— geometry ————————————————————————————————————————
const R = 2.6;
const RHO = 0.8;
const EDGE = 7.4;
const NECK_END = 1.0;
const H_END = hForNeck(R, RHO, NECK_END);
const H_CUT = hForNeck(R, RHO, 0.32);
const CUT = 0.902;
const SEAT = 1.12; // Sar1 body centre above the mid-plane
const ADA = 2.1; // adaptor lobes
const CAGE_H = 3.2; // Sec13/31 lattice
const CAGE_MAXA = 2.1;
const DEG = Math.PI / 180;

const GEFS = [150, 30, 270].map((deg) => {
  const th = deg * DEG;
  const p: V3 = [5.6 * Math.cos(th), 0, 5.6 * Math.sin(th)];
  const u: V3 = [-Math.cos(th), 0, -Math.sin(th)];
  const dock: V3 = [p[0] + u[0] * 1.45, 1.6, p[2] + u[2] * 1.45];
  return { th, p, dock };
});

/** slots: Sar1 (d, θ) + its receptor's final (d, θ) and starting (d, θ). Slot 0 = the protagonist. */
const SLOTS = [
  { s: [2.6, 125], r: [2.6, 93], r0: [5.4, 100], gef: 0, at: 0 },
  { s: [2.6, 5], r: [2.6, -27], r0: [5.8, -40], gef: 1, at: 0.435 },
  { s: [2.6, 245], r: [2.6, 213], r0: [6.0, 205], gef: 2, at: 0.45 },
  { s: [4.3, 65], r: [4.3, 45], r0: [6.4, 52], gef: 1, at: 0.475 },
  { s: [4.3, 185], r: [4.3, 165], r0: [6.2, 172], gef: 0, at: 0.47 },
  { s: [4.3, 305], r: [4.3, 285], r0: [6.3, 300], gef: 2, at: 0.49 },
  { s: [0.6, 0], r: [0.85, 180], r0: [5.0, 150], gef: 1, at: 0.515 },
].map((o) => ({ ...o, s: [o.s[0], o.s[1] * DEG], r: [o.r[0], o.r[1] * DEG], r0: [o.r0[0], o.r0[1] * DEG] }));

// ———————————————————————————————————————— timing ————————————————————————————————————————
const T = {
  // step 1: the switch demo
  dock1: [0.02, 0.04],
  gdpOut1: [0.04, 0.058],
  gtpIn1: [0.058, 0.076],
  on1: [0.074, 0.088],
  tail1: [0.076, 0.092],
  lift1: [0.078, 0.094],
  hyd1: [0.096, 0.114],
  off1: [0.1, 0.114],
  untail1: [0.106, 0.122],
  away1: [0.12, 0.14],
  // step 2-3
  drift: [0.15, 0.27],
  dock: [0.29, 0.315],
  gdpOut: [0.318, 0.34],
  gtpIn: [0.343, 0.365],
  on: [0.355, 0.37],
  // step 4
  tail: [0.425, 0.452],
  toSite: [0.452, 0.487],
  insert: [0.49, 0.522],
  // step 5
  adaptor: [0.565, 0.6],
  gather: [0.6, 0.64],
  // step 6
  cage: [0.705, 0.8],
  bend: [0.715, 0.84],
  // step 7
  hyd: [0.866, 0.894],
  off: [0.884, 0.9],
  close: [0.878, 0.9],
  rise: [CUT, 0.93],
  untail: [0.915, 0.94],
  release: [0.918, 0.97],
  uncoat: [0.93, 0.99],
} as const;
const s2 = (r: readonly [number, number] | readonly number[], t: number) => seg(t, r[0], r[1]);

// ———————————————————————————————————————— helpers ————————————————————————————————————————
const S4 = new Float32Array(4);
/** World point on the membrane (arc distance d from the bud tip, azimuth θ), lifted by `lift` along the cytosolic normal. */
function surf(m: BudModel, d: number, th: number, lift: number): { p: V3; n: V3 } {
  const b = m.bud;
  let nr: number;
  let ny: number;
  if (d <= b.length) {
    b.at(d, S4);
    nr = S4[2];
    ny = S4[3];
  } else {
    const pa = m.parent;
    pa.at(Math.max(0, pa.length - (d - b.length)), S4);
    nr = -S4[2];
    ny = -S4[3];
  }
  const r = S4[0];
  const y = S4[1];
  const c = Math.cos(th);
  const s = Math.sin(th);
  const n: V3 = [-nr * c, ny, -nr * s];
  return { p: [r * c + n[0] * lift, -y + n[1] * lift, r * s + n[2] * lift], n };
}

const _q = new Quaternion();
const _qs = new Quaternion();
const _v = new Vector3();
const _n = new Vector3();
const Y = new Vector3(0, 1, 0);
function upQuat(n: V3, spin: number): [number, number, number, number] {
  _n.set(...n).normalize();
  _q.setFromUnitVectors(Y, _n);
  _qs.setFromAxisAngle(Y, spin);
  _q.multiply(_qs);
  return [_q.x, _q.y, _q.z, _q.w];
}
function local(pos: V3, q: [number, number, number, number], off: V3): V3 {
  _q.set(...q);
  _v.set(...off).applyQuaternion(_q);
  return [pos[0] + _v.x, pos[1] + _v.y, pos[2] + _v.z];
}
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const nlerp = (a: V3, b: V3, k: number): V3 => {
  const v = lerp3(a, b, k);
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const wob = (t: number, i: number, a = 0.15): V3 => [a * Math.sin(t * 47 + i * 1.7), a * 0.7 * Math.cos(t * 39 + i * 2.3), a * 0.6 * Math.sin(t * 31 + i)];

// ———————————————————————————————————————— camera ————————————————————————————————————————
const CAM: CamKey[] = [
  { at: 0, pos: [-1.6, 3.4, 11.2], target: [-3.0, 2.0, 2.0], fov: 34 },
  { at: 0.12, pos: [-1.4, 3.4, 11.0], target: [-2.9, 2.1, 2.0], fov: 34 },
  { at: 0.17, pos: [-0.6, 5.0, 16.5], target: [-2.4, 1.8, 1.0], fov: 36 },
  { at: 0.27, pos: [-0.8, 5.0, 16.2], target: [-2.5, 1.8, 1.0], fov: 36 },
  { at: 0.31, pos: [-1.8, 3.0, 10.6], target: [-3.2, 1.8, 2.0], fov: 34 },
  { at: 0.41, pos: [-1.8, 3.0, 10.4], target: [-3.2, 1.8, 2.0], fov: 34 },
  { at: 0.455, pos: [-1.2, 2.3, 11.2], target: [-2.5, 1.2, 2.0], fov: 34 },
  { at: 0.55, pos: [-1.0, 2.3, 11.0], target: [-2.3, 1.2, 2.0], fov: 34 },
  { at: 0.59, pos: [0.2, 4.6, 14.0], target: [-1.0, 1.6, 1.6], fov: 36 },
  { at: 0.69, pos: [0.2, 4.8, 14.0], target: [-1.0, 1.8, 1.6], fov: 36 },
  { at: 0.745, pos: [3.0, 8.5, 25.5], target: [0, 3.8, 0], fov: 36 },
  { at: 0.85, pos: [3.0, 8.5, 25.0], target: [0, 4.0, 0], fov: 36 },
  { at: 0.875, pos: [-7.0, 8.0, 12.5], target: [-1.6, 5.6, 2.2], fov: 34 },
  { at: 0.91, pos: [-7.0, 8.4, 12.5], target: [-1.6, 6.0, 2.2], fov: 34 },
  { at: 0.945, pos: [2.0, 10.5, 27.0], target: [0, 6.0, 0], fov: 36 },
  { at: 1, pos: [2.0, 10.5, 26.5], target: [0, 6.2, 0], fov: 36 },
];

// ———————————————————————————————————————— scene ————————————————————————————————————————
export default function Copii({ t }: SceneProps) {
  useStageCamera(CAM);
  const m = useBudModel();
  const lattice = useMemo(() => makeCageLattice(CAGE_MAXA), []);
  const nodes = useMemo(() => new Float32Array(lattice.dirs.length * 3), [lattice]);
  const shown = useMemo(() => new Float32Array(lattice.dirs.length), [lattice]);
  const edgeRel = useMemo(() => new Float32Array(lattice.edges.length), [lattice]);
  const anchorNodes = useMemo(() => {
    const near = (d: V3) => {
      let best = 0;
      let bd = -2;
      lattice.dirs.forEach((v, i) => {
        const k = v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
        if (k > bd) {
          bd = k;
          best = i;
        }
      });
      return best;
    };
    const l = (v: V3) => {
      const n = Math.hypot(...v);
      return [v[0] / n, v[1] / n, v[2] / n] as V3;
    };
    return { sec: near(l([0.55, 0.5, 0.67])), coat: near(l([-0.35, 0.85, 0.4])) };
  }, [lattice]);

  // —— membrane shape ——
  if (t < CUT) {
    const close = s2(T.close, t);
    const h = close > 0 ? hForNeck(R, RHO, lerp(NECK_END, 0.32, close)) : lerp(-R + 0.01, H_END, s2(T.bend, t));
    m.update({ R, rho: RHO, edge: EDGE, h });
  } else {
    m.update({ R, rho: RHO, edge: EDGE, cut: true, vesY: -H_CUT - 1.4 * s2(T.rise, t), dimple: RHO * 0.9 * (1 - seg(t, CUT, CUT + 0.035)) });
  }
  const budCentre: V3 = [0, -m.info.cy, 0];

  // —— Sar1 molecules ——
  const hydAll = s2(T.hyd, t);
  const offAll = s2(T.off, t);
  const sars = SLOTS.map((sl, i) => {
    const seat = surf(m, sl.s[0], sl.s[1], SEAT);
    const above = surf(m, sl.s[0], sl.s[1], 2.8);
    const leave = s2(T.release, t);
    let pos: V3;
    let up: V3;
    let tail: number;
    let on: number;
    let opacity = 1;
    let toks: { pos: V3; show: number; hyd: number }[];
    const g = GEFS[sl.gef];
    if (i === 0) {
      // protagonist
      const F0 = add(g.dock, [0.9, 1.7, 0.5]);
      const ONP = add(g.dock, [0.45, 0.9, 0.25]);
      const F1 = add(g.dock, [1.5, 2.3, 0.4]);
      const F2 = add(g.dock, [-0.4, 2.7, 0.9]);
      pos = add(F0, wob(t, 1), 1 - s2(T.dock1, t));
      pos = lerp3(pos, g.dock, s2(T.dock1, t));
      pos = lerp3(pos, ONP, s2(T.lift1, t));
      pos = lerp3(pos, add(F1, wob(t, 2), 0.8), s2(T.away1, t));
      pos = lerp3(pos, add(F2, wob(t, 3), 1), s2(T.drift, t));
      pos = lerp3(pos, g.dock, s2(T.dock, t));
      pos = lerp3(pos, above.p, s2(T.toSite, t));
      pos = lerp3(pos, seat.p, s2(T.insert, t));
      up = nlerp([0.1 * Math.sin(t * 23), 1, 0.12 * Math.cos(t * 19)], seat.n, s2(T.toSite, t));
      tail = s2(T.tail1, t) - s2(T.untail1, t) + s2(T.tail, t) - s2(T.untail, t);
      on = s2(T.on1, t) - s2(T.off1, t) + s2(T.on, t) - offAll;
    } else {
      // background Sar1s: cytosol → their GEF (exchange) → their slot
      const a = sl.at;
      const start = add(g.dock, [0, 3.2, 0]);
      const kDock = seg(t, a, a + 0.02);
      const kSwap = seg(t, a + 0.02, a + 0.035);
      pos = lerp3(add(start, wob(t, i + 5), 1), g.dock, kDock);
      pos = lerp3(pos, above.p, seg(t, a + 0.035, a + 0.055));
      pos = lerp3(pos, seat.p, seg(t, a + 0.055, a + 0.067));
      up = nlerp([0, 1, 0], seat.n, seg(t, a + 0.035, a + 0.055));
      tail = seg(t, a + 0.035, a + 0.047) - s2(T.untail, t);
      on = (kSwap > 0.5 ? 1 : 0) * (1 - offAll);
      opacity = seg(t, a - 0.012, a + 0.004);
      if (opacity <= 0.001) return null;
    }
    // release (step 7): tail retracts, Sar1-GDP leaves the membrane into the cytosol
    if (leave > 0) {
      pos = add(pos, add(seat.n, [Math.sin(i * 2.1) * 0.5, 0.2, Math.cos(i * 1.7) * 0.5]), (i === 0 ? 3.2 : 5.5) * smooth(leave));
      if (i > 0) opacity *= 1 - seg(t, 0.95, 0.985);
    }
    const q = upQuat(up, i === 0 ? 0 : i * 1.3);
    const pk = local(pos, q, SAR1_POCKET);
    if (i === 0) {
      // protagonist's nucleotides: GDP (initial) · GTP (step 1 demo, hydrolysed) · GTP (step 3, hydrolysed in step 7)
      const away1 = add(pk, [-0.7, 2.2, 1.3]);
      const in2 = add(pk, [1.7, 2.2, 1.1]);
      const in3 = add(pk, [1.6, 2.4, 1.2]);
      toks = [
        { pos: lerp3(pk, away1, s2(T.gdpOut1, t)), show: 1 - seg(t, 0.05, 0.06), hyd: 1 },
        { pos: lerp3(lerp3(in2, pk, s2(T.gtpIn1, t)), away1, s2(T.gdpOut, t)), show: seg(t, 0.055, 0.063) * (1 - seg(t, 0.332, 0.342)), hyd: s2(T.hyd1, t) },
        { pos: lerp3(in3, pk, s2(T.gtpIn, t)), show: seg(t, 0.34, 0.348), hyd: hydAll },
      ];
    } else {
      const kSwap = seg(t, sl.at + 0.02, sl.at + 0.035);
      const out = Math.sin(Math.PI * kSwap);
      toks = [{ pos: add(pk, [0.5, 1.5, 0.6], out), show: 1 - 0.95 * out, hyd: kSwap < 0.5 ? 1 : hydAll }];
    }
    return { pos, q, tail, on, opacity, toks, pk, seat, i };
  });
  const main = sars[0]!;

  // —— labels for the protagonist's state ——
  const gtpOn = (t > 0.068 && t < 0.104) || (t > 0.358 && t < 0.88);
  const sarText = gtpOn ? 'Sar1-GTP · ON (active)' : 'Sar1-GDP · OFF (inactive)';
  const gtpaseText = gtpOn ? 'GTPase · ON (GTP-bound)' : 'GTPase · OFF (GDP-bound)';
  const tk = main.toks;
  const gdpTok = t < 0.06 ? tk[0] : t < 0.345 ? tk[1] : tk[2];
  const gdpShow = t < 0.06 ? tk[0].show : t > 0.104 && t < 0.345 ? tk[1].show : t > 0.882 ? 1 : 0;
  const gtpTok = t < 0.2 ? tk[1] : tk[2];
  const gtpShow = t > 0.056 && t < 0.104 ? tk[1].show : t > 0.342 && t < 0.882 ? tk[2].show : 0;

  // —— cargo receptors ——
  const recs = SLOTS.map((sl, i) => {
    const k = i === 0 ? s2(T.gather, t) : seg(t, 0.615 + i * 0.008, 0.655 + i * 0.008);
    const d = lerp(sl.r0[0], sl.r[0], k);
    let dth = sl.r[1] - sl.r0[1];
    dth = ((dth + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const th = sl.r0[1] + dth * k;
    const s = surf(m, d, th, 0);
    return { pos: s.p, n: s.n, q: upQuat(s.n, i * 0.9) };
  });

  // —— Sec23/24 adaptors (over Sar1 + the receptor's final place) ——
  const uncoat = (i: number) => seg(t, T.uncoat[0] + 0.006 * i, T.uncoat[0] + 0.045 + 0.006 * i);
  const adas = SLOTS.map((sl, i) => {
    const k = i === 0 ? s2(T.adaptor, t) : seg(t, 0.6 + i * 0.008, 0.635 + i * 0.008);
    if (k <= 0.001) return null;
    const sa = surf(m, sl.s[0], sl.s[1], ADA);
    const sb = surf(m, sl.r[0], sl.r[1], ADA);
    const mid = lerp3(sa.p, sb.p, 0.5);
    const dir: V3 = [sb.p[0] - sa.p[0], sb.p[1] - sa.p[1], sb.p[2] - sa.p[2]];
    const dl = Math.hypot(...dir) || 1;
    const half: V3 = [(dir[0] / dl) * 0.5, (dir[1] / dl) * 0.5, (dir[2] / dl) * 0.5];
    const n = nlerp(sa.n, sb.n, 0.5);
    const fly = (1 - smooth(k)) * 5 + smooth(uncoat(i)) * 6;
    const side = wob(t, i + 11, (1 - smooth(k)) * 1.5);
    const c = add(add(mid, n, fly), side);
    return { a: add(c, half, -1), b: add(c, half), opacity: Math.min(1, k * 2.5) * (1 - seg(t, T.uncoat[0] + 0.03 + 0.006 * i, T.uncoat[1])) };
  });

  // —— Sec13/31 cage nodes ——
  const asm = s2(T.cage, t);
  for (let i = 0; i < lattice.dirs.length; i++) {
    const v = lattice.dirs[i];
    const al = Math.acos(clamp(v[1], -1, 1));
    const th = Math.atan2(v[2], v[0]);
    const s = surf(m, al * R, th, CAGE_H);
    const k = smooth(clamp((asm * 1.25 - al / CAGE_MAXA) / 0.25));
    shown[i] = k;
    const fly = (1 - k) * 4;
    nodes[i * 3] = s.p[0] + s.n[0] * fly;
    nodes[i * 3 + 1] = s.p[1] + s.n[1] * fly;
    nodes[i * 3 + 2] = s.p[2] + s.n[2] * fly;
  }
  for (let e = 0; e < lattice.edges.length; e++) {
    const st = T.uncoat[0] + 0.035 * rand(e * 7 + 3);
    edgeRel[e] = smooth(clamp((t - st) / 0.03));
  }
  const nodeAt = (i: number): V3 => [nodes[i * 3], nodes[i * 3 + 1], nodes[i * 3 + 2]];
  const cageShow = asm > 0.02 && t < T.uncoat[1] ? 1 : 0;

  const gefGlow = 0.7 * (seg(t, 0.035, 0.045) - seg(t, 0.072, 0.082) + seg(t, 0.312, 0.322) - seg(t, 0.362, 0.372));
  const tailGlow = 0.9 * (seg(t, 0.076, 0.084) - seg(t, 0.11, 0.12) + seg(t, 0.425, 0.435) - seg(t, 0.53, 0.55));
  const g0 = GEFS[0];

  return (
    <group>
      <EdgeTag side="top" text="CYTOSOL" />
      <EdgeTag side="bottom" text="ER LUMEN" />

      {/* ER membrane: far patch (kit bilayer) + the budding disc (lipids that bend) */}
      <Bilayer id="er-membrane" width={34} depth={22} holes={[{ x: 0, z: 0, r: EDGE + 0.05 }]} seed={5} />
      <BudLipids model={m} id="er-membrane" rotation={[0, 0, Math.PI]} seed={7} />
      <LumenTint box={[-17, 17, -9, -0.66, -11, 11]} color={PALETTE.erLumen} strength={0.16} />
      <Anchor id="er-membrane" position={[-8.6, 0.3, 4.2]} />

      {/* GEFs: transmembrane, cytosolic domain */}
      {GEFS.map((g, i) => (
        <MembraneProtein key={i} id="gef" color={PALETTE.gef} side="cytosol" size={1.5} seed={61} position={g.p} rotation={[0, -g.th + Math.PI, 0]} glow={i === 0 ? gefGlow : 0} />
      ))}
      <Anchor id="gef" position={[g0.p[0] + 0.25, 1.45, g0.p[2] + 0.3]} />

      {/* Sar1 molecules + their nucleotides */}
      {sars.map((s, i) =>
        s ? (
          <group key={i}>
            <Sar1 id={['sar1', 'gtpase']} tailId={['sar1', 'gtpase']} position={s.pos} quaternion={s.q} on={clamp(s.on)} tail={clamp(s.tail)} opacity={s.opacity} tailGlow={i === 0 ? tailGlow : 0} />
            {s.toks.map((k, j) =>
              k.show > 0.02 ? <Nucleotide key={j} id={k.hyd > 0.5 ? 'gdp' : 'gtp'} hydrolysed={k.hyd} show={k.show} size={1.15} position={k.pos} opacity={s.opacity} glow={i === 0 && j === 2 ? 0.6 * seg(t, 0.862, 0.87) * (1 - seg(t, 0.89, 0.9)) : 0} /> : null,
            )}
          </group>
        ) : null,
      )}
      <Anchor id="sar1" text={sarText} position={add(main.pos, [0, 0.05, 0.3])} />
      <Anchor id="gtpase" text={gtpaseText} position={add(main.pos, [-0.1, -0.1, 0.3])} show={t < 0.145 ? 1 : 0} />
      <Anchor id="gdp" position={gdpTok.pos} show={gdpShow} />
      <Anchor id="gtp" position={gtpTok.pos} show={gtpShow} />

      {/* cargo receptors (cargo on the lumen side) */}
      {recs.map((r, i) => (
        <CargoReceptor key={i} id="cargo-receptor" position={r.pos} quaternion={r.q} cargoSeed={3 + i} />
      ))}
      <Anchor id="cargo-receptor" position={add(recs[0].pos, recs[0].n, 0.2)} />

      {/* Sec23/24 adaptors (inner layer) */}
      {adas.map((a, i) => (a && a.opacity > 0.01 ? <Sec2324 key={i} id={['sec23-24', 'copii']} a={a.a} b={a.b} opacity={a.opacity} /> : null))}
      {adas[0] && <Anchor id="sec23-24" position={lerp3(adas[0].a, adas[0].b, 0.5)} show={adas[0].opacity} />}

      {/* Sec13/31 outer cage */}
      {cageShow > 0 && <CopiiCage id={['sec13-31', 'copii']} lattice={lattice} nodes={nodes} shown={shown} edgeRelease={edgeRel} centre={budCentre} />}
      <Anchor id="sec13-31" position={nodeAt(anchorNodes.sec)} show={cageShow * shown[anchorNodes.sec] * (1 - seg(t, T.uncoat[0], T.uncoat[0] + 0.02))} />
      <Anchor id="copii" text="COPII coat (Sec23/24 + Sec13/31)" position={nodeAt(anchorNodes.coat)} show={cageShow * shown[anchorNodes.coat] * (1 - seg(t, T.uncoat[0], T.uncoat[0] + 0.02))} />
    </group>
  );
}
