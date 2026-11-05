/**
 * t9-coats — Forming a coated vesicle: receptor → adaptor → GEF → GTPase-GTP → coat → bud; then the coat types.
 *
 * World: donor-compartment membrane at y = 0 (LUMEN = +y, CYTOSOL = −y), organelle-scale smooth sheet; the bud
 * hangs into the cytosol (BudModel, as in t10-clathrin-ldl). Each cargo receptor is drawn in its own frame whose
 * +y points to the lumen (flat: world +y; on the bud: towards the bud centre), so ligand (lumen side) and adaptor
 * (cytosolic side) ride along as the membrane bends. Below (y = −6) a row of finished vesicles: clathrin, COPI,
 * COPII, naked; under three of them the GTPase / adaptor / coat set each one uses.
 */
import { Quaternion, Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { lerp, lerp3, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, ClathrinCage, EdgeTag, MembraneProtein, PALETTE, Protein, Triskelion, Vesicle, useStageCamera, type CamKey } from '@/three/kit';
import { BudSheet, useBudModel } from '../t10/parts/bud';
import { HoledSheet } from '../t10/parts/Membranes';
import { Capsule } from '../t7/parts/molecules';

export const P = [0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.86] as const;

const R = 1.5;
const RHO = 0.45;
const EDGE = 3.6;
const REC = '#ff6b6b';
const LIG = '#ffd43b';
const ADA = '#4dabf7';
const GTPASE = '#ff922b';
const GTP_C = '#51cf66';
const GDP_C = '#adb5bd';
const N = 4;
const T = {
  bind: [0.03, 0.11],
  cluster: [0.1, 0.4],
  adaptor: [0.16, 0.25],
  toGef: [0.29, 0.325],
  swap: [0.33, 0.36],
  insert: [0.37, 0.41],
  coat1: [0.43, 0.52],
  pit: [0.44, 0.52],
  tri: [0.57, 0.65],
  invag: [0.52, 0.66],
  cut: 0.67,
  travel: [0.705, 0.76],
} as const;
const ROW_Y = -6.2;
const ROW_X = [-5.7, -1.9, 1.9, 5.7];
const GEF_P: V3 = [-2.7, 0, 0.6];

/** receptor slots: azimuth + polar angle on the bud (θ from the bottom), and the flat starting position */
const SLOTS = Array.from({ length: N }, (_, i) => {
  const a = (i / N) * Math.PI * 2 + 0.5;
  return { a, th: 0.75 + 0.25 * (i % 2), flat: [Math.cos(a) * (2.4 + (i % 2) * 0.6), 0, Math.sin(a) * 1.6 + 0.4] as V3 };
});
const GTP_SLOT = { a: 2.9, th: 1.15 };

const _q = new Quaternion();
const _up = new Vector3(0, 1, 0);
const _d = new Vector3();
function frame(flat: V3, slot: { a: number; th: number }, c: V3, cluster: number, k: number) {
  const near: V3 = [flat[0] * 0.35, 0, flat[2] * 0.35];
  const start = lerp3(flat, near, cluster);
  const onBud: V3 = [c[0] + R * Math.sin(slot.th) * Math.cos(slot.a), c[1] - R * Math.cos(slot.th), c[2] + R * Math.sin(slot.th) * Math.sin(slot.a)];
  const pos = lerp3(start, onBud, k);
  const dir = lerp3([0, 1, 0], [c[0] - onBud[0], c[1] - onBud[1], c[2] - onBud[2]], k);
  _d.set(...dir).normalize();
  return { pos, q: _q.setFromUnitVectors(_up, _d).clone(), dir: [_d.x, _d.y, _d.z] as V3 };
}

const SETS = [
  { x: ROW_X[0], gtp: 'ARF', ada: 'AP1/AP2', coat: 'clathrin', col: PALETTE.clathrin, tri: true },
  { x: ROW_X[1], gtp: 'ARF', ada: 'coatomer', coat: 'COPI coat', col: PALETTE.copi, tri: false },
  { x: ROW_X[2], gtp: 'Sar1', ada: 'Sec23/24', coat: 'Sec13/31', col: PALETTE.copii, tri: false },
];

const CAM: CamKey[] = [
  { at: 0, pos: [0.5, 1.6, 10.5], target: [0, 0.2, 0], fov: 38 },
  { at: 0.12, pos: [0.5, 1.4, 10.2], target: [0, 0.2, 0], fov: 38 },
  { at: 0.17, pos: [0.6, -1.4, 9.0], target: [0, -0.4, 0], fov: 38 },
  { at: 0.27, pos: [0.6, -1.4, 8.8], target: [0, -0.4, 0], fov: 38 },
  { at: 0.31, pos: [-1.4, -1.2, 8.0], target: [-1.6, -0.6, 0], fov: 38 },
  { at: 0.41, pos: [-1.2, -1.2, 7.8], target: [-1.3, -0.6, 0], fov: 38 },
  { at: 0.45, pos: [0.5, -1.2, 10.0], target: [0, -1.3, 0], fov: 38 },
  { at: 0.55, pos: [0.5, -1.3, 9.8], target: [0, -1.5, 0], fov: 38 },
  { at: 0.59, pos: [1.0, -1.6, 11.0], target: [0, -2.0, 0], fov: 38 },
  { at: 0.69, pos: [1.0, -1.8, 10.8], target: [0, -2.2, 0], fov: 38 },
  { at: 0.74, pos: [0, -4.4, 15.0], target: [0, -5.6, 0], fov: 40 },
  { at: 0.85, pos: [0, -4.4, 14.8], target: [0, -5.6, 0], fov: 40 },
  { at: 0.89, pos: [0, -7.0, 16.0], target: [0, -7.6, 0], fov: 40 },
  { at: 1, pos: [0, -7.0, 15.8], target: [0, -7.6, 0], fov: 40 },
];

export default function CoatsScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const m = useBudModel();
  const bind = smooth(seg(t, T.bind[0], T.bind[1]));
  const cluster = smooth(seg(t, T.cluster[0], T.cluster[1]));
  const pit = smooth(seg(t, T.pit[0], T.pit[1]));
  const invag = smooth(seg(t, T.invag[0], T.invag[1]));
  const cut = t >= T.cut;
  const travel = smooth(seg(t, T.travel[0], T.travel[1]));

  const info = cut
    ? m.update({ R, rho: RHO, edge: EDGE, cut: true, vesY: -1000, dimple: RHO * (1 - seg(t, T.cut, T.cut + 0.04)) })
    : invag > 0
      ? m.update({ R, rho: RHO, edge: EDGE, neckR: lerp(1.4, 0.3, invag), neck: 0.4 * seg(t, 0.62, 0.66) })
      : m.update({ R, rho: RHO, edge: EDGE, h: lerp(-R + 0.01, 0, pit) });
  const budC: V3 = [0, cut ? -RHO - 0.5 - R : info.cy, 0];
  const c = cut ? lerp3(budC, [ROW_X[0], ROW_Y, 0], travel) : budC;
  // how far the receptors have moved onto the bud surface
  const onBud = cut ? 1 : Math.max(pit * 0.6, invag);

  const coat = 0.55 * smooth(seg(t, T.coat1[0], T.coat1[1])) + 0.35 * smooth(seg(t, T.tri[0], T.tri[1]));
  const adaptorO = smooth(seg(t, T.adaptor[0], T.adaptor[1]));
  const gefGlow = 0.6 * vis(t, 0.28, 0.37, 0.01);

  // GTPase: free (GDP) → GEF (swap to GTP) → inserts next to the cluster → rides on the bud
  const free: V3 = [-4.2 + 0.2 * Math.sin(t * 50), -2.6 + 0.15 * Math.cos(t * 41), 0.8];
  const atGef: V3 = [GEF_P[0] + 0.45, -0.75, GEF_P[2]];
  const gSlot = frame([-1.2, 0, 0.5], GTP_SLOT, c, 0, onBud);
  const gInMem: V3 = [gSlot.pos[0] - gSlot.dir[0] * 0.32, gSlot.pos[1] - gSlot.dir[1] * 0.32, gSlot.pos[2] - gSlot.dir[2] * 0.32];
  let gtpase = lerp3(free, atGef, smooth(seg(t, T.toGef[0], T.toGef[1])));
  gtpase = lerp3(gtpase, gInMem, smooth(seg(t, T.insert[0], T.insert[1])));
  const swap = smooth(seg(t, T.swap[0], T.swap[1]));
  const gdpPos = lerp3([gtpase[0] + 0.28, gtpase[1] - 0.18, gtpase[2] + 0.1], [-4.6, -3.4, 0.8], swap);
  const gtpPos = lerp3([-1.8, -3.4, 0.8], [gtpase[0] + 0.28, gtpase[1] - 0.18, gtpase[2] + 0.1], swap);
  const gtpO = vis(t, 0.3, 2, 0.015);

  const recs = SLOTS.map((s) => frame(s.flat, s, c, cluster, onBud));
  const rowO = vis(t, 0.71, 2, 0.02);
  const setO = vis(t, 0.86, 2, 0.02);

  return (
    <group>
      <EdgeTag side="top" text="LUMEN of the donor compartment" />
      <EdgeTag side="bottom" text="CYTOSOL" />
      <HoledSheet id="donor-compartment" width={30} depth={14} holes={[{ x: 0, z: 0, r: EDGE }]} thickness={0.14} color={PALETTE.golgiMembrane} />
      <BudSheet model={m} id="donor-compartment" budId="transport-vesicle" thickness={0.14} color={PALETTE.golgiMembrane} />
      <Anchor id="donor-compartment" position={[-6.0, 0.1, 1.5]} />

      {/* the free coated vesicle (after scission) */}
      {cut && (
        <group position={c}>
          <Vesicle radius={R} color={PALETTE.golgiMembrane} lumenColor={PALETTE.golgiLumen} id="transport-vesicle" />
        </group>
      )}
      <group position={c}>
        <ClathrinCage radius={R * 1.32} amount={coat} from={[0, -1, 0]} id={['coat', 'clathrin', 'triskelion']} />
      </group>
      <Anchor id="coat" position={[c[0] + R * 0.9, c[1] - R * 0.9, R * 0.8]} show={vis(t, 0.45, 0.56, 0.02)} />
      <Anchor id="clathrin" position={[c[0] + R * 0.9, c[1] - R * 0.9, R * 0.8]} show={vis(t, 0.57, 2, 0.02)} />
      <Anchor id="transport-vesicle" position={[c[0] - R * 0.8, c[1] + 0.2, R * 0.8]} show={vis(t, T.cut, 0.86, 0.02)} />

      {/* triskelions joining the lattice */}
      {Array.from({ length: 6 }, (_, k) => {
        const a = (k / 6) * Math.PI * 2 + 0.3;
        const dir: V3 = [Math.cos(a) * 0.8, -0.55 - 0.1 * (k % 2), Math.sin(a) * 0.5 + 0.35];
        const u = smooth(seg(t, T.tri[0] + k * 0.008, T.tri[0] + k * 0.008 + 0.04));
        const o = vis(t, T.tri[0] + k * 0.008 - 0.01, T.tri[0] + k * 0.008 + 0.045, 0.008);
        if (o <= 0.01) return null;
        const far = 4.6;
        const near = R * 1.4;
        const d = lerp(far, near, u);
        return <Triskelion key={k} id="triskelion" size={0.42} color={PALETTE.clathrin} position={[c[0] + dir[0] * d, c[1] + dir[1] * d, c[2] + dir[2] * d]} rotation={[0.4 + k, k * 1.3, 0.2]} opacity={o} />;
      })}
      <Anchor id="triskelion" position={[c[0] + 1.9, c[1] - 2.2, 1.6]} show={vis(t, T.tri[0], T.tri[1] + 0.03, 0.01)} />

      {/* cargo receptors with ligand (lumen side) and adaptor (cytosolic side) */}
      {recs.map((r, i) => (
        <group key={i} position={r.pos} quaternion={r.q}>
          <Capsule id="cargo-receptor" a={[0, -0.34, 0]} b={[0, 0.3, 0]} r={0.08} color={REC} />
          <Protein id="cargo-receptor" shape="y" color={REC} size={0.5} position={[0, 0.42, 0]} />
          <Protein id="ligand" shape="blob" color={LIG} size={0.42} seed={i + 2} position={[0, lerp(3.2, 0.84, bind), 0]} opacity={vis(t, 0.0, 2, 0.02)} />
          <Protein id="adaptor" shape="blob" color={ADA} size={0.5} seed={i + 9} position={[0, lerp(-2.6, -0.58, adaptorO), 0]} opacity={vis(t, T.adaptor[0] - 0.01, 2, 0.015)} glow={0.5 * vis(t, 0.27, 0.31, 0.01)} />
        </group>
      ))}
      <Anchor id="cargo-receptor" position={recs[0].pos} show={vis(t, 0, 0.7, 0.02)} />
      <Anchor id="ligand" position={[recs[1].pos[0] + recs[1].dir[0] * 0.84, recs[1].pos[1] + recs[1].dir[1] * 0.84, recs[1].pos[2] + recs[1].dir[2] * 0.84]} show={vis(t, 0.02, 0.7, 0.02)} />
      <Anchor id="adaptor" position={[recs[2].pos[0] - recs[2].dir[0] * 0.6, recs[2].pos[1] - recs[2].dir[1] * 0.6, recs[2].pos[2] - recs[2].dir[2] * 0.6]} show={vis(t, T.adaptor[0] + 0.02, 0.7, 0.02)} />

      {/* GEF in the membrane; GTPase with its GDP / GTP */}
      <MembraneProtein id="gef" side="cytosol" color="#e599f7" size={0.5} position={GEF_P} glow={gefGlow} opacity={vis(t, 0.27, 0.56, 0.02)} />
      <Anchor id="gef" position={[GEF_P[0] - 0.2, -0.65, GEF_P[2] + 0.3]} show={vis(t, 0.28, 0.56, 0.02)} />
      <Protein id="gtpase" shape="blob" color={GTPASE} size={0.48} seed={4} position={gtpase} opacity={vis(t, 0.28, 0.7, 0.02)} glow={0.4 * vis(t, 0.36, 0.42, 0.01)} />
      <Anchor id="gtpase" position={[gtpase[0] - 0.2, gtpase[1] - 0.3, gtpase[2] + 0.2]} show={vis(t, 0.29, 0.56, 0.02)} />
      <mesh position={gdpPos} visible={vis(t, 0.28, 0.4, 0.015) > 0.02}>
        <sphereGeometry args={[0.13, 14, 10]} />
        <meshStandardMaterial color={GDP_C} transparent opacity={vis(t, 0.28, 0.4, 0.015)} />
      </mesh>
      <Protein id="gtp" shape="blob" color={GTP_C} size={0.26} seed={1} position={gtpPos} opacity={gtpO * vis(t, 0, 0.7, 0.02)} />
      <Anchor id="gtp" position={gtpPos} show={vis(t, 0.32, 0.56, 0.02)} />

      {/* the coat types, side by side */}
      {rowO > 0.01 && (
        <group>
          <Vesicle radius={R} color={PALETTE.copi} lumenColor={PALETTE.golgiLumen} coat="copi" coatId="copi" position={[ROW_X[1], ROW_Y, 0]} opacity={rowO} />
          <Vesicle radius={R} color={PALETTE.erMembrane} lumenColor={PALETTE.erLumen} coat="copii" coatId="copii" position={[ROW_X[2], ROW_Y, 0]} opacity={rowO} />
          <Vesicle radius={R} color={PALETTE.golgiMembrane} lumenColor={PALETTE.golgiLumen} id="transport-vesicle" position={[ROW_X[3], ROW_Y, 0]} opacity={rowO} />
        </group>
      )}
      <Anchor id="copi" position={[ROW_X[1] + 0.8, ROW_Y + 1.5, 0.8]} show={rowO} />
      <Anchor id="copii" position={[ROW_X[2] + 0.8, ROW_Y + 1.5, 0.8]} show={rowO} />
      <Anchor id="transport-vesicle" text="Naked vesicle (constitutive)" position={[ROW_X[3] + 0.8, ROW_Y + 1.3, 0.8]} show={rowO} />

      {/* sets recruited by each donor compartment: GTPase, adaptor, coat monomer */}
      {setO > 0.01 &&
        SETS.map((s, k) => (
          <group key={k} position={[s.x, ROW_Y - 2.4, 0.4]}>
            <Protein id="gtpase" shape="blob" color={GTPASE} size={0.5} seed={4 + k} position={[0, 0, 0]} opacity={setO} />
            <Protein id="adaptor" shape="blob" color={ADA} size={0.6} seed={9 + k} position={[0, -1.1, 0]} opacity={setO} />
            {s.tri ? <Triskelion id="coat" size={0.42} color={s.col} position={[0, -2.25, 0]} rotation={[1.2, 0, 0]} opacity={setO} /> : <Protein id="coat" shape="blob" color={s.col} size={0.65} seed={20 + k} position={[0, -2.25, 0]} opacity={setO} />}
            {k === 0 && <Anchor id="gtpase" position={[-0.3, 0.1, 0.3]} show={setO} />}
            {k === 0 && <Anchor id="adaptor" position={[-0.35, -1.0, 0.3]} show={setO} />}
            <Anchor id="coat" text={`${s.gtp} · ${s.ada} · ${s.coat}`} position={[0.1, -2.6, 0.3]} show={setO} />
          </group>
        ))}
    </group>
  );
}
