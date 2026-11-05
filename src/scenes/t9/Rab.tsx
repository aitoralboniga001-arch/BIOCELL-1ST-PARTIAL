/**
 * t9-rab — Rab GTPases: guiding the vesicle.
 *
 * World (1 unit ≈ 5 nm, kit lipids): the TARGET membrane is a lipid bilayer in the xz plane at y = 0
 * (cytosol = +y, target lumen = −y). A naked transport vesicle (lipid bilayer sphere, R = 3.2) waits in the
 * cytosol above it. Long coiled-coil tethering proteins rise from the target membrane; a Rab receptor sits in it.
 *
 *  0  Rab-GDP (red GDP token, prenyl tail tucked into the protein) tumbles in the cytosol among other Rabs
 *     (other shades = other Rab family members)
 *  1  it binds the GEF in the vesicle membrane; GDP leaves, GTP (green, 3 phosphates) enters
 *  2  conformational change: the prenyl chains swing out and dip into the vesicle's cytosolic leaflet (close-up)
 *  3  pull back: tethers fish in the cytosol; one catches the Rab and reels the vesicle down
 *  4  the Rab receptor takes the Rab: the vesicle docks, nearly touching the target membrane
 *  5  wide: a second vesicle with a DIFFERENT Rab (indigo) drifts by; a tether probes it and lets it go — no docking
 *  6  GTP → GDP (Pi leaves); prenyls pull out, Rab-GDP detaches and drifts back to the cytosol (recycled)
 */
import { Euler, Quaternion, Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { lerp, lerp3, seg, type V3 } from '@/engine/anim';
import { Anchor, Bilayer, EdgeTag, LumenTint, MembraneProtein, PALETTE, useStageCamera, type CamKey } from '@/three/kit';
import { Nucleotide } from '../t10/parts/Machinery';
import { LipidVesicle, RAB, RabGTPase, Tether, tetherPoint } from './parts/RabParts';

export const P = [0, 0.14, 0.28, 0.43, 0.57, 0.71, 0.86] as const;

const CAM: CamKey[] = [
  { at: 0, pos: [4.6, 12.6, 18], target: [2.6, 11.8, 0], fov: 36 },
  { at: 0.14, pos: [4.6, 12.6, 18], target: [2.6, 11.8, 0], fov: 36 },
  { at: 0.17, pos: [6.6, 11.6, 13.5], target: [4.2, 11.0, 0], fov: 36 },
  { at: 0.28, pos: [6.6, 11.6, 13.5], target: [4.2, 11.0, 0], fov: 36 },
  { at: 0.305, pos: [3.6, 9.6, 9.2], target: [3.0, 9.2, 0], fov: 36 },
  { at: 0.43, pos: [3.6, 9.6, 9.2], target: [3.0, 9.2, 0], fov: 36 },
  { at: 0.465, pos: [4.5, 9.5, 27], target: [1.8, 6.4, 0], fov: 36 },
  { at: 0.57, pos: [4.5, 9.5, 27], target: [1.8, 6.4, 0], fov: 36 },
  { at: 0.6, pos: [4.6, 3.6, 12], target: [2.6, 2.8, 0], fov: 36 },
  { at: 0.71, pos: [4.6, 3.6, 12], target: [2.6, 2.8, 0], fov: 36 },
  { at: 0.745, pos: [-1.5, 9.2, 26], target: [-2.6, 6.0, 0], fov: 36 },
  { at: 0.86, pos: [-1.5, 9.2, 26], target: [-2.6, 6.0, 0], fov: 36 },
  { at: 0.89, pos: [5.5, 7.6, 19], target: [3.0, 5.4, 0], fov: 36 },
  { at: 1, pos: [5.5, 7.6, 19], target: [3.0, 5.4, 0], fov: 36 },
];

// ——— geometry ———
const R = 3.2; // vesicle mid-membrane radius
const RS = 1.2; // Rab scale
const D_BOUND = R + 0.1 - RAB.tip * RS; // Rab centre when its prenyls sit in the outer leaflet
const D_GEF = R + 1.34 + 0.62; // Rab centre while it sits on the GEF's cytosolic domain
const AG = (-6 * Math.PI) / 180; // GEF direction on the vesicle
const AB = (-35 * Math.PI) / 180; // Rab's binding site (faces the target)
const VC0: V3 = [-1.6, 11.6, 0];
const VCP: V3 = [0.6, 7.0, 0]; // reeled in by the tether
const VCD: V3 = [0, 4.84, 0]; // docked
const REC_X = 3.95;
const TETHER_COLOR = '#a5d8ff';
const RECEPTOR_COLOR = '#339af0';
const OTHER_RAB = '#5c7cfa';

const R2 = 2.6; // second vesicle (other Rab)
const V2_FAR: V3 = [-21, 11, -2];
const V2_NEAR: V3 = [-9.4, 8.4, 0.3];
const V2_AWAY: V3 = [-19.5, 14, -3];
const A2 = (-38 * Math.PI) / 180;

const T1_BASE: V3 = [6.6, 0.62, -0.2];
const T2_BASE: V3 = [-4.4, 0.62, -0.2];
const T3_BASE: V3 = [11, 0.62, -1.6];
const T4_BASE: V3 = [-10.5, 0.62, -1.2];
const T1_SWAY: V3 = [-1.2, 0, 0.3];
const T2_SWAY: V3 = [0.9, 0, 0.2];

/** the target bilayer is drawn in section too: its front edge sits just in front of the docking plane (z = 0) */
const MEM_FRONT = 0.35;
const MEM_DEPTH = 15;
const MEM_Z = MEM_FRONT - MEM_DEPTH / 2;
const HOLES = [
  { x: REC_X, z: -0.1, r: 0.6 },
  { x: T1_BASE[0], z: T1_BASE[2], r: 0.3 },
  { x: T2_BASE[0], z: T2_BASE[2], r: 0.3 },
  { x: T3_BASE[0], z: T3_BASE[2], r: 0.3 },
  { x: T4_BASE[0], z: T4_BASE[2], r: 0.3 },
].map((h) => ({ ...h, z: h.z - MEM_Z }));

const OTHERS: { off: V3; color: string; seed: number }[] = [
  { off: [-5.8, 3.2, -1.5], color: OTHER_RAB, seed: 11 },
  { off: [-6.4, -2.6, 1.2], color: '#22b8cf', seed: 17 },
  { off: [4.6, 4.6, -2.4], color: '#91a7ff', seed: 23 },
];

// scratch
const _q = new Quaternion();
const _qf = new Quaternion();
const _e = new Euler();
const _v = new Vector3();
const Zax = new Vector3(0, 0, 1);

const dir = (a: number): V3 => [Math.cos(a), Math.sin(a), 0];
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const qArr = (q: Quaternion): [number, number, number, number] => [q.x, q.y, q.z, q.w];

/** gentle tumbling of a free cytosolic protein (pure function of t) */
function tumble(t: number, ph: number, out: Quaternion) {
  _e.set(0.45 * Math.sin(t * 41 + ph), 0.6 * Math.sin(t * 27 + ph * 2), 0.35 * Math.cos(t * 33 + ph));
  return out.setFromEuler(_e);
}
/** local point of the Rab frame → world, for a Rab at `pos` with quaternion `q` */
function rabPoint(pos: V3, q: Quaternion, local: V3): V3 {
  _v.set(local[0] * RS, local[1] * RS, local[2] * RS).applyQuaternion(q);
  return [pos[0] + _v.x, pos[1] + _v.y, pos[2] + _v.z];
}

export default function Rab({ t }: SceneProps) {
  useStageCamera(CAM);

  // ——— vesicle ———
  const reel = seg(t, 0.5, 0.56);
  const dock = seg(t, 0.585, 0.64);
  const vc = lerp3(lerp3(VC0, VCP, reel), VCD, dock);

  // ——— main Rab ———
  const free: V3 = add(VC0, [6.4 + 0.35 * Math.sin(t * 37), 1.7 + 0.3 * Math.cos(t * 29), 1.3 + 0.25 * Math.sin(t * 23)]);
  const toGef = seg(t, 0.15, 0.18);
  const slide = seg(t, 0.315, 0.345);
  const insert = seg(t, 0.345, 0.375);
  const unbind = seg(t, 0.905, 0.93);
  const leave = seg(t, 0.93, 0.985);
  const open = seg(t, 0.295, 0.325) * (1 - unbind);
  const ang = lerp(AG, AB, slide);
  const dist = lerp(lerp(D_GEF, D_BOUND, insert), D_GEF + 0.3, unbind);
  const bound = add(vc, dir(ang), dist);
  const ret: V3 = add(VCD, [6.6 + 0.35 * Math.sin(t * 37), 5.6 + 0.3 * Math.cos(t * 29), 1.4]);
  const rabPos = lerp3(lerp3(free, bound, toGef), ret, leave);
  tumble(t, 0.3, _qf);
  _q.setFromAxisAngle(Zax, ang - Math.PI / 2);
  _q.slerp(_qf, 1 - toGef * (1 - leave));
  const rabQ = qArr(_q);
  const pocket = rabPoint(rabPos, _q, RAB.pocket);
  const prenylMid = rabPoint(rabPos, _q, [0, -1.12, 0]);
  const outward = dir(ang);

  // ——— nucleotides ———
  const gdpOut = seg(t, 0.185, 0.21);
  const gdp1Pos = add(pocket, [1.6, 1.5, 1.0], gdpOut);
  const gdp1Show = 1 - seg(t, 0.21, 0.24);
  const gtpFree: V3 = add(VC0, [7.6 + 0.2 * Math.sin(t * 41), -0.8 + 0.2 * Math.cos(t * 31), 1.8]);
  const gtpPos = lerp3(gtpFree, pocket, seg(t, 0.205, 0.24));
  const gtpShow = seg(t, 0.14, 0.16);
  const hydro = seg(t, 0.875, 0.9);
  const isGdp = t > 0.893;
  const exchangeGlow = seg(t, 0.18, 0.2) * (1 - seg(t, 0.24, 0.27));

  // ——— tethers ———
  const grip = add(rabPos, outward, 1.04 * RS);
  const catchK = seg(t, 0.47, 0.495);
  const releaseK = seg(t, 0.625, 0.66);
  // before step 4 the tethers lie low; they rise into the cytosol and "fish" from t = .435
  const rise = seg(t, 0.435, 0.47);
  const t1Free: V3 = [5.8 + 0.45 * Math.sin(t * 43), lerp(3.2, 7.9, rise) + 0.3 * Math.cos(t * 37), 0.2 + 0.3 * Math.sin(t * 29)];
  const t1Rest: V3 = [7.2 + 0.35 * Math.sin(t * 43), 5.8 + 0.25 * Math.cos(t * 37), 0.2];
  const t1Tip = lerp3(lerp3(t1Free, grip, catchK), t1Rest, releaseK);

  // second vesicle (a different Rab) and the tether that checks it
  const v2 = lerp3(lerp3(V2_FAR, V2_NEAR, seg(t, 0.72, 0.77)), V2_AWAY, seg(t, 0.82, 0.86));
  v2[1] += 0.15 * Math.sin(t * 40);
  const v2Show = t > 0.69 && t < 0.875 ? 1 : 0;
  const rab2 = add(v2, dir(A2), R2 + 0.1 - RAB.tip * RS);
  const probe = seg(t, 0.77, 0.79) * (1 - seg(t, 0.8, 0.82));
  const t2Free: V3 = [-4.9 + 0.45 * Math.sin(t * 39 + 1), lerp(3.0, 7.3, rise) + 0.3 * Math.cos(t * 31 + 2), 0.2];
  const t2Tip = lerp3(t2Free, add(rab2, dir(A2), 1.2 * RS), probe);
  const t3Tip: V3 = [10.4 + 0.4 * Math.sin(t * 35 + 3), lerp(2.8, 7.0, rise) + 0.3 * Math.cos(t * 41), -1.4];
  const t4Tip: V3 = [-11 + 0.4 * Math.sin(t * 33 + 5), lerp(2.6, 6.6, rise) + 0.3 * Math.cos(t * 37 + 1), -1.0];

  const lumenTag = t > 0.43;
  const dockGlow = seg(t, 0.62, 0.64) * (1 - seg(t, 0.66, 0.69));

  return (
    <>
      <EdgeTag side="top" text="CYTOSOL" />
      {lumenTag && <EdgeTag side="bottom" text="TARGET LUMEN" />}

      {/* target membrane */}
      <Bilayer id="target-compartment" width={36} depth={MEM_DEPTH} holes={HOLES} seed={7} position={[0, 0, MEM_Z]} />
      <LumenTint box={[-18, 18, -7, -0.66, MEM_Z - MEM_DEPTH / 2, MEM_FRONT]} color={PALETTE.golgiLumen} strength={0.22} />
      <Anchor id="target-compartment" position={[-8.5, 0, -1]} />

      {/* Rab receptor (transmembrane, cytosolic binding domain) */}
      <MembraneProtein id="rab-receptor" color={RECEPTOR_COLOR} side="cytosol" size={1} position={[REC_X, 0, -0.1]} seed={71} glow={dockGlow} />
      <Anchor id="rab-receptor" position={[REC_X + 0.1, 0.95, 0.2]} />

      {/* the transport vesicle with its GEF */}
      <group position={vc}>
        <LipidVesicle id="transport-vesicle" radius={R} seed={3} />
        <Anchor id="transport-vesicle" position={[-2.45, 2.06, 0]} />
        <MembraneProtein id="gef" color={PALETTE.gef} side="cytosol" size={1} position={add([0, 0, 0], dir(AG), R)} rotation={[0, 0, AG - Math.PI / 2]} seed={33} glow={exchangeGlow} />
        <Anchor id="gef" position={add([0, 0, 0.15], dir(AG), R + 0.98)} />
      </group>

      {/* the Rab */}
      <RabGTPase id="rab" prenylId="prenyl-group" open={open} position={rabPos} quaternion={rabQ} scale={RS} seed={5} />
      <Anchor id="rab" position={rabPos} />
      <Anchor id="prenyl-group" position={prenylMid} show={open > 0.5 ? 1 : 0} />

      {/* GDP (leaves at the GEF) and GTP (enters; hydrolysed to GDP at the end) */}
      <Nucleotide id="gdp" hydrolysed={1} show={gdp1Show} position={gdp1Pos} size={1.25} />
      <Nucleotide id={isGdp ? 'gdp' : 'gtp'} hydrolysed={hydro} show={gtpShow} position={gtpPos} size={1.25} glow={exchangeGlow} />
      <Anchor id="gdp" position={isGdp ? gtpPos : gdp1Pos} show={isGdp ? 1 : gdp1Show > 0.5 ? 1 : 0} />
      <Anchor id="gtp" position={gtpPos} show={!isGdp && gtpShow > 0.5 ? 1 : 0} />

      {/* other Rab family members (other shades), inactive in the cytosol */}
      {OTHERS.map((o, i) => (
        <RabGTPase key={i} open={0} color={o.color} seed={o.seed} scale={RS} position={add(VC0, [o.off[0] + 0.3 * Math.sin(t * 31 + i), o.off[1] + 0.3 * Math.cos(t * 27 + i * 2), o.off[2]])} quaternion={qArr(tumble(t, i * 1.7 + 1, _qf))} />
      ))}

      {/* tethering proteins ("Rab fishing lines") */}
      <Tether id="tethering-protein" base={T1_BASE} tip={t1Tip} sway={T1_SWAY} seed={3} />
      <Anchor id="tethering-protein" position={tetherPoint(T1_BASE, t1Tip, T1_SWAY, 0.5)} show={rise} />
      <Tether id="tethering-protein" base={T2_BASE} tip={t2Tip} sway={T2_SWAY} seed={5} />
      <Tether id="tethering-protein" base={T3_BASE} tip={t3Tip} sway={[0.9, 0, 0]} seed={7} />
      <Tether id="tethering-protein" base={T4_BASE} tip={t4Tip} sway={[-0.8, 0, 0]} seed={9} />

      {/* a second vesicle carrying a different Rab: no matching effector, so it is not caught */}
      {v2Show > 0 && (
        <>
          <LipidVesicle radius={R2} position={v2} seed={8} cargo={5} />
          <RabGTPase open={1} color={OTHER_RAB} seed={11} scale={RS} position={rab2} quaternion={qArr(_q.setFromAxisAngle(Zax, A2 - Math.PI / 2))} />
        </>
      )}
    </>
  );
}
