/**
 * t9-dynamin — Dynamin: pinching off the vesicle.
 *
 * World: molecular close-up of a donor membrane (lipid bilayer, centre plane y = 0; DONOR LUMEN = +y,
 * CYTOSOL = −y). A clathrin-coated bud hangs into the cytosol at the origin, still joined by a neck.
 * Units ≈ 5 nm (kit lipid size).
 *
 *  0  the coated bud deepens a little: the coat has shaped it, the neck still joins it to the membrane
 *  1  cytosolic dynamin subunits fly in and assemble a helical collar around the neck (neck elongates)
 *  2  GTP on every GTPase head is hydrolysed (green → red, Pi leaves); the helix twists and constricts the
 *     neck until the membranes meet → scission; the vesicle drops free, the donor membrane heals,
 *     dynamin falls apart
 *  3  pull back: the same collar pinches a COPI bud and a COPII bud (separate donor membranes, left/right)
 *  4  back on the clathrin vesicle: the coat falls apart into triskelions that drift away → naked vesicle
 */
import { useMemo } from 'react';
import type { SceneProps } from '@/content/types';
import { clamp, lerp, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, Bilayer, ClathrinCage, EdgeTag, fibonacciSphere, PALETTE, useStageCamera, type CamKey } from '@/three/kit';
import { BudLipids, useBudModel, type BudModel } from '../t10/parts/bud';
import { BlobShell, DynaminCollar, TriskelionCloud } from '../t10/parts/Machinery';

/** Step starts (content `at`s must match). */
export const P = [0, 0.2, 0.4, 0.6, 0.8] as const;

const T = {
  deepen: [0.02, 0.14],
  dynIn: [0.21, 0.36],
  neckGrow: [0.22, 0.36],
  gtp: [0.41, 0.5],
  constrict: [0.44, 0.535],
  cut: 0.537,
  drop: [0.54, 0.6],
  heal: [0.54, 0.585],
  dynOut: [0.545, 0.6],
  side: [0.61, 0.66], // side collars assemble
  sideCon: [0.665, 0.735],
  sideCut: 0.737,
  sideDrop: [0.74, 0.79],
  uncoat: [0.82, 0.92],
  drift: [0.82, 0.99],
} as const;

const R = 3.2;
const RHO = 1.0;
const EDGE = 6.6;
const NECK_LEN = 1.5;
const CAGE = R * 1.42;
const SIDE_X = 17;
const RS = 2.7; // side buds

const CAM: CamKey[] = [
  { at: 0, pos: [-5, -2.6, 21], target: [0, -4.8, 0], fov: 36 },
  { at: 0.16, pos: [-3.5, -3.2, 20], target: [0, -5.0, 0], fov: 36 },
  { at: 0.235, pos: [7, -0.2, 19], target: [0, -3.0, 0], fov: 36 },
  { at: 0.38, pos: [6.5, -0.4, 18.5], target: [0, -3.0, 0], fov: 36 },
  { at: 0.43, pos: [5.5, -0.8, 17], target: [0, -3.2, 0], fov: 36 },
  { at: 0.535, pos: [5, -1.0, 16.5], target: [0, -3.4, 0], fov: 36 },
  { at: 0.58, pos: [2.5, -3.4, 18], target: [0, -5.8, 0], fov: 36 },
  { at: 0.6, pos: [2.5, -3.4, 18], target: [0, -5.8, 0], fov: 36 },
  { at: 0.64, pos: [0, -3.5, 47], target: [0, -5.0, 0], fov: 38 },
  { at: 0.78, pos: [2, -4.0, 46], target: [0, -5.0, 0], fov: 38 },
  { at: 0.83, pos: [-4, -6.5, 21], target: [0, -8.5, 0], fov: 36 },
  { at: 1, pos: [4.5, -6.0, 22], target: [0, -9.0, 0], fov: 36 },
];

/** State of a bud that is constricted and cut by a collar during [con] and pinches at `cut`. */
function budAt(m: BudModel, t: number, o: { R: number; neck0: number; neckLen: number; grow: readonly number[]; con: readonly number[]; cut: number; drop: readonly number[]; edge: number; deepen?: readonly number[] }) {
  const deep = o.deepen ? seg(t, o.deepen[0], o.deepen[1]) : 1;
  const nk0 = lerp(o.neck0 + 1.1, o.neck0, deep);
  if (t < o.cut) {
    const neckR = lerp(nk0, 0.52, seg(t, o.con[0], o.con[1]));
    const neck = o.neckLen * seg(t, o.grow[0], o.grow[1]);
    return m.update({ R: o.R, rho: RHO, edge: o.edge, neckR, neck });
  }
  // just before the cut: centre of the bud sphere
  const hCut = budCentre(o.R, o.neckLen);
  const k = seg(t, o.drop[0], o.drop[1]);
  return m.update({ R: o.R, rho: RHO, edge: o.edge, cut: true, vesY: hCut - 1.6 * k, dimple: RHO * 0.9 * (1 - seg(t, o.cut, o.cut + 0.05)) });
}
function budCentre(Rb: number, neckLen: number) {
  // sphere centre when neckR = 0.52 (see hForNeck)
  const rf = 0.52 + RHO;
  return -(RHO + Math.sqrt((Rb + RHO) ** 2 - rf * rf)) - neckLen;
}

export default function DynaminScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const main = useBudModel();
  const left = useBudModel();
  const right = useBudModel();

  const info = budAt(main, t, { R, neck0: 1.75, neckLen: NECK_LEN, grow: T.neckGrow, con: T.constrict, cut: T.cut, drop: T.drop, edge: EDGE, deepen: T.deepen });
  const cy = info.cy;
  const neckR = Number.isFinite(info.neckR) ? info.neckR : 0.52;

  const sideOpts = { R: RS, neck0: 1.5, neckLen: 1.2, grow: T.side, con: T.sideCon, cut: T.sideCut, drop: T.sideDrop, edge: 5.4 };
  const showSide = vis(t, 0.585, 1.01, 0.03);
  const li = budAt(left, t, sideOpts);
  budAt(right, t, sideOpts);
  const sNeck = Number.isFinite(li.neckR) ? li.neckR : 0.52;

  // dynamin (main)
  const assembled = seg(t, T.dynIn[0], T.dynIn[1]);
  const release = seg(t, T.dynOut[0], T.dynOut[1]);
  const hyd = seg(t, T.gtp[0], T.gtp[1]);
  const twist = 0.9 * seg(t, T.constrict[0], T.constrict[1]);
  const dynShow = t < T.dynOut[1] + 0.01 ? 1 : 0;
  const neckLenNow = NECK_LEN * seg(t, T.neckGrow[0], T.neckGrow[1]);
  const y0 = -RHO - 0.15;
  const y1 = -RHO - Math.max(0.3, neckLenNow) + 0.15;

  // side collars
  const sAsm = seg(t, T.side[0], T.side[1]);
  const sRel = seg(t, T.sideCut + 0.005, T.sideCut + 0.05);
  const sHyd = seg(t, T.sideCon[0] - 0.01, T.sideCon[0] + 0.04);
  const sLen = 1.2 * seg(t, T.side[0], T.side[1]);

  // coat
  const coat = 0.8 * (1 - seg(t, T.uncoat[0], T.uncoat[1]));
  const triStarts = useMemo(() => {
    const pts = fibonacciSphere(26).filter((v) => v.y < 0.55);
    return pts.map((v) => [v.x * CAGE, v.y * CAGE, v.z * CAGE] as V3);
  }, []);
  const vesY = cy;
  const release3 = (i: number) => {
    const ang = Math.acos(clamp(-triStarts[i][1] / CAGE, -1, 1)) / Math.PI; // 0 at the bottom
    // the cage shrinks from the top (far from `from`): top triskelions leave first
    const when = lerp(T.drift[0], T.uncoat[1] - 0.02, 1 - ang / 0.8);
    return smooth(clamp((t - when) / (T.drift[1] - when)));
  };

  const scissionFlash = vis(t, T.cut - 0.012, T.cut + 0.02, 0.01);

  return (
    <group>
      <EdgeTag side="top" text="DONOR COMPARTMENT LUMEN" />
      <EdgeTag side="bottom" text="CYTOSOL" />

      {/* donor membrane: far region (kit bilayer) + the budding disc */}
      <Bilayer id="donor-compartment" width={30} depth={18} holes={[{ x: 0, z: 0, r: EDGE + 0.05 }]} seed={5} />
      <BudLipids model={main} id="donor-compartment" budId="transport-vesicle" seed={7} />
      <Anchor id="donor-compartment" position={[-9.5, 0.35, 2.2]} />

      {/* clathrin coat on the main bud */}
      <group position={[0, vesY, 0]}>
        <ClathrinCage radius={CAGE} amount={coat} from={[0, -1, 0]} id={['coat', 'clathrin']} />
        <Anchor id="coat" position={[CAGE * 0.42, -CAGE * 0.5, CAGE * 0.72]} show={coat > 0.05 ? 1 : 0} />
        <Anchor id="clathrin" position={[-CAGE * 0.55, -CAGE * 0.55, CAGE * 0.58]} show={t > 0.58 && coat > 0.05 ? 1 : 0} />
        <Anchor id="transport-vesicle" position={[R * 0.15, -R * 0.2, R * 0.97]} />
        <TriskelionCloud starts={triStarts} release={release3} centre={[0, 0, 0]} size={1.4} drift={7} id="triskelion" />
        <Anchor id="triskelion" position={trisAnchor(triStarts, release3)} show={t > T.uncoat[0] + 0.03 ? 1 : 0} />
      </group>

      {/* dynamin collar on the main neck */}
      {dynShow > 0 && (
        <DynaminCollar id="dynamin" gtpId="gtp" neckR={neckR} y0={y0} y1={y1} assembled={assembled} release={release} hydrolysis={hyd} twist={twist} nucleotides seed={4} />
      )}
      <Anchor id="dynamin" position={[0.6, (y0 + y1) / 2, neckR + 1.6]} show={dynShow * (1 - release)} />
      <Anchor id="gtp" position={[-1.2, (y0 + y1) / 2 + 0.3, neckR + 1.9]} show={t > T.dynIn[0] + 0.05 && t < T.dynOut[1] ? 1 : 0} />

      {/* scission: the two membranes meet and part (a brief flash at the cut) */}
      {scissionFlash > 0.01 && (
        <mesh position={[0, -RHO - NECK_LEN * 0.5, 0]} scale={0.4 + 0.5 * scissionFlash}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshBasicMaterial color="#fff1d6" transparent opacity={0.5 * scissionFlash} depthWrite={false} toneMapped={false} />
        </mesh>
      )}

      {/* step 3: COPI (left) and COPII (right) buds on their own donor membranes, same dynamin job */}
      {showSide > 0.01 && (
        <>
          <group position={[-SIDE_X, 0, -2]}>
            <BudLipids model={left} id="donor-compartment" budId="transport-vesicle" seed={13} opacity={showSide} />
            <group position={[0, li.cy, 0]}>
              <BlobShell radius={RS + 0.95} color={PALETTE.copi} count={80} blob={1.25} amount={0.8 * (1 - seg(t, T.uncoat[0], T.uncoat[1]))} from={[0, -1, 0]} id={['copi', 'coat']} opacity={showSide} />
              <Anchor id="copi" position={[RS * 0.5, -RS * 0.6, RS + 0.9]} show={showSide * (t < T.uncoat[0] + 0.04 ? 1 : 0)} />
            </group>
            {t < T.sideCut + 0.06 && <DynaminCollar id="dynamin" neckR={sNeck} y0={-RHO - 0.15} y1={-RHO - Math.max(0.3, sLen) + 0.15} turns={2} assembled={sAsm} release={sRel} hydrolysis={sHyd} twist={0.7 * seg(t, T.sideCon[0], T.sideCon[1])} seed={8} opacity={showSide} />}
            <Anchor id="dynamin" position={[0.3, -RHO - 0.6, sNeck + 1.6]} show={showSide * vis(t, T.side[0] + 0.02, T.sideCut, 0.01)} />
          </group>
          <group position={[SIDE_X, 0, -2]}>
            <BudLipids model={right} id="donor-compartment" budId="transport-vesicle" seed={17} opacity={showSide} />
            <group position={[0, li.cy, 0]}>
              <BlobShell radius={RS + 0.75} color="#74c69d" count={60} blob={0.8} amount={0.8 * (1 - seg(t, T.uncoat[0], T.uncoat[1]))} from={[0, -1, 0]} id={['copii', 'coat']} opacity={showSide} seed={21} />
              <BlobShell radius={RS + 1.35} color={PALETTE.copii} count={80} blob={1.1} amount={0.8 * (1 - seg(t, T.uncoat[0], T.uncoat[1]))} from={[0, -1, 0]} id={['copii', 'coat']} opacity={showSide} />
              <Anchor id="copii" position={[-RS * 0.5, -RS * 0.6, RS + 1.3]} show={showSide * (t < T.uncoat[0] + 0.04 ? 1 : 0)} />
            </group>
            {t < T.sideCut + 0.06 && <DynaminCollar id="dynamin" neckR={sNeck} y0={-RHO - 0.15} y1={-RHO - Math.max(0.3, sLen) + 0.15} turns={2} assembled={sAsm} release={sRel} hydrolysis={sHyd} twist={0.7 * seg(t, T.sideCon[0], T.sideCon[1])} seed={9} opacity={showSide} />}
          </group>
        </>
      )}
    </group>
  );
}

function trisAnchor(starts: V3[], rel: (i: number) => number): V3 {
  // follow the first released triskelion that is well on its way
  let best = 0;
  let bk = -1;
  for (let i = 0; i < starts.length; i++) {
    const k = rel(i);
    if (k > bk && k < 0.7) {
      bk = k;
      best = i;
    }
  }
  const s = starts[best];
  const l = Math.hypot(...s) || 1;
  const d = 7 * Math.max(0, bk);
  return [s[0] + (s[0] / l) * d + Math.sin(best * 1.7) * bk, s[1] + (s[1] / l) * d + Math.cos(best * 2.3) * bk * 0.6, s[2] + (s[2] / l) * d];
}
