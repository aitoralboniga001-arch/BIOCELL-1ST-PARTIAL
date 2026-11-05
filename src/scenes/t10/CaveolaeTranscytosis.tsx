/**
 * t10-caveolae-transcytosis — Caveolae (caveolin oligomers, naked, dynamin) and transcytosis in an endothelial
 * cell and an enterocyte.
 *
 * World: left, a thin endothelial cell (x ≈ −6) between the capillary lumen (top, y > 1.8) and the tissue
 * (bottom, y < −1.8); its luminal membrane holds a close-up caveola built with the bud model (caveolin oligomers on
 * the cytosolic face, dynamin collar at the neck) and, beside it, a clathrin-coated pit for comparison. Many small
 * caveolae line both of its membranes. Right, a tall enterocyte (x = 8) with microvilli on its apical side (gut
 * lumen above) and the basolateral side below. Transcytotic vesicles carry nutrients (yellow) across both cells.
 */
import type { SceneProps } from '@/content/types';
import { lerp, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, ClathrinCage, EdgeTag, fibonacciSphere, LumenTint, MembraneSheet, PALETTE, Protein, Vesicle, useStageCamera, type CamKey } from '@/three/kit';
import { BudSheet, useBudModel } from './parts/bud';
import { HoledSheet } from './parts/Membranes';
import { Capsule } from '../t7/parts/molecules';
import { along, curve, loop } from '../t8/parts/stack';

export const P = [0, 0.17, 0.34, 0.51, 0.69, 0.86] as const;

const XE = -6;
const EL = 1.8;
const XN = 8;
const NH = 3.6; // enterocyte half height
const NW = 2.4; // enterocyte half width
const R = 0.9;
const RHO = 0.3;
const EDGE = 2.0;
const NUT = '#ffd43b';
const CAV = PALETTE.caveolin;
const T = {
  olig: [0.02, 0.12],
  pit: [0.06, 0.14],
  invag: [0.14, 0.27],
  dyn: [0.2, 0.3],
  cut: 0.3,
} as const;

const OLIGO = fibonacciSphere(40)
  .map((v) => v.toArray() as V3)
  .filter((d) => d[1] < 0.35);
const CAVEOLAE: { p: V3; up: boolean }[] = [
  ...Array.from({ length: 11 }, (_, i) => ({ p: [XE - 5 + i * 0.95 + (i > 4 ? 0.6 : 0), EL - 0.35, 0.3] as V3, up: true })),
  ...Array.from({ length: 11 }, (_, i) => ({ p: [XE - 4.6 + i * 0.95, -EL + 0.35, 0.3] as V3, up: false })),
].filter((c) => Math.abs(c.p[0] - XE) > 0.9 || !c.up);
const E_ROUTES = [-4.2, -2.0, 1.6, 3.6].map((dx) => curve([[XE + dx, EL - 0.3, 0.3], [XE + dx + 0.3, 0, 0.6], [XE + dx - 0.1, -EL + 0.3, 0.3]]));
const N_ROUTES = [-1.4, 0, 1.4].map((dx) => curve([[XN + dx, NH - 0.4, 0.3], [XN + dx * 0.6 + 0.5, 0.8, 0.8], [XN + dx * 0.8 - 0.4, -1.4, 0.6], [XN + dx, -NH + 0.4, 0.3]]));

const CAM: CamKey[] = [
  { at: 0, pos: [XE, EL + 0.2, 6.4], target: [XE, EL - 0.9, 0], fov: 40 },
  { at: 0.14, pos: [XE, EL + 0.1, 6.2], target: [XE, EL - 0.9, 0], fov: 40 },
  { at: 0.19, pos: [XE + 1.7, EL - 0.2, 8.4], target: [XE + 1.7, EL - 0.8, 0], fov: 40 },
  { at: 0.32, pos: [XE + 1.7, EL - 0.3, 8.2], target: [XE + 1.7, EL - 0.9, 0], fov: 40 },
  { at: 0.37, pos: [XE, 0.6, 14.5], target: [XE, 0.2, 0], fov: 40 },
  { at: 0.5, pos: [XE, 0.6, 14.2], target: [XE, 0.2, 0], fov: 40 },
  { at: 0.54, pos: [XE, 0.4, 11.5], target: [XE, 0, 0], fov: 40 },
  { at: 0.67, pos: [XE, 0.4, 11.2], target: [XE, 0, 0], fov: 40 },
  { at: 0.72, pos: [XE, 0.8, 14.5], target: [XE, 0.4, 0], fov: 40 },
  { at: 0.84, pos: [XE, 0.8, 14.2], target: [XE, 0.4, 0], fov: 40 },
  { at: 0.89, pos: [XN, 0.6, 15.0], target: [XN, 0.2, 0], fov: 40 },
  { at: 1, pos: [XN, 0.6, 14.8], target: [XN, 0.2, 0], fov: 40 },
];

export default function CaveolaeTranscytosisScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const m = useBudModel();
  const pit = smooth(seg(t, T.pit[0], T.pit[1]));
  const invag = smooth(seg(t, T.invag[0], T.invag[1]));
  const cut = t >= T.cut;
  const info = cut
    ? m.update({ R, rho: RHO, edge: EDGE, cut: true, vesY: -RHO - 0.4 - R, dimple: RHO * (1 - seg(t, T.cut, T.cut + 0.03)) })
    : invag > 0
      ? m.update({ R, rho: RHO, edge: EDGE, neckR: lerp(0.8, 0.18, invag), neck: 0.25 * seg(t, 0.24, 0.28) })
      : m.update({ R, rho: RHO, edge: EDGE, h: lerp(-R + 0.01, -0.2, pit) });
  const cy = info.cy;
  const onBud = cut ? 1 : Math.max(pit * 0.5, invag);
  const closeO = vis(t, -1, 0.35, 0.03);
  const dynO = vis(t, T.dyn[0], T.cut + 0.015, 0.01);
  const olig = smooth(seg(t, T.olig[0], T.olig[1]));
  const clO = vis(t, 0.17, 0.34, 0.02);

  const flowE = vis(t, 0.51, 0.86, 0.02);
  const nutE = vis(t, 0.69, 0.86, 0.02);
  const flowN = vis(t, 0.86, 2, 0.02);
  const manyO = vis(t, 0.33, 0.86, 0.03);

  return (
    <group>
      <EdgeTag side="top" text={t < 0.86 ? 'CAPILLARY LUMEN (blood)' : 'GUT LUMEN'} />
      <EdgeTag side="bottom" text={t < 0.86 ? 'TISSUE' : 'BASOLATERAL → tissue / blood'} />

      {/* --- endothelial cell --- */}
      <group position={[XE, EL, 0]}>
        <HoledSheet id={['plasma-membrane', 'endothelial-cell']} width={13} depth={6} holes={closeO > 0.01 ? [{ x: 0, z: 0, r: EDGE }] : []} thickness={0.12} color={PALETTE.plasmaMembrane} />
        {closeO > 0.01 && <BudSheet model={m} id={['plasma-membrane', 'endothelial-cell']} budId="caveola" thickness={0.12} color={PALETTE.plasmaMembrane} opacity={closeO} />}
        {/* caveolin oligomers on the cytosolic face of the bud */}
        {OLIGO.map((d, i) => {
          const flat: V3 = [d[0] * 1.4, -0.14, d[2] * 1.4];
          const on: V3 = [d[0] * (R + 0.1), cy + d[1] * (R + 0.1), d[2] * (R + 0.1)];
          const p: V3 = [lerp(flat[0], on[0], onBud), lerp(flat[1], on[1], onBud), lerp(flat[2], on[2], onBud)];
          const o = smooth(seg(olig, i / OLIGO.length / 1.3, i / OLIGO.length / 1.3 + 0.2)) * closeO;
          return <Protein key={i} id="caveolin" shape="blob" color={CAV} size={0.18} seed={i} position={p} opacity={o} />;
        })}
        {/* dynamin collar at the neck */}
        <mesh position={[0, -RHO - 0.12, 0]} rotation={[Math.PI / 2, 0, 0]} scale={1 - 0.35 * smooth(seg(t, 0.25, T.cut))} visible={dynO > 0.01}>
          <torusGeometry args={[0.24, 0.07, 8, 22]} />
          <meshStandardMaterial color={PALETTE.dynamin} emissive={PALETTE.dynamin} emissiveIntensity={0.3} transparent opacity={dynO} />
        </mesh>
        {/* clathrin-coated pit beside it, for comparison */}
        <group position={[3.4, -0.75, 0]}>
          <Vesicle id="clathrin" radius={0.7} color={PALETTE.plasmaMembrane} lumenColor={PALETTE.erLumen} opacity={clO} />
          <ClathrinCage radius={0.92} amount={0.85} from={[0, -1, 0]} id="clathrin" opacity={clO} />
          <mesh position={[0, 0.66, 0]} rotation={[Math.PI / 2, 0, 0]} visible={clO > 0.01}>
            <torusGeometry args={[0.24, 0.07, 8, 22]} />
            <meshStandardMaterial color={PALETTE.dynamin} emissive={PALETTE.dynamin} emissiveIntensity={0.3} transparent opacity={clO} />
          </mesh>
        </group>
      </group>
      <Anchor id="caveola" text={t > 0.17 && t < 0.34 ? 'Caveola · naked (no coat)' : undefined} position={[XE - 0.9, EL + cy - 0.2, 0.7]} show={closeO} />
      <Anchor id="caveolin" position={[XE + 0.75, EL + cy - 0.45, 0.6]} show={closeO * vis(t, 0.03, 2, 0.02)} />
      <Anchor id="dynamin" position={[XE + 0.3, EL - RHO - 0.12, 0.3]} show={dynO} />
      <Anchor id="clathrin" text="Clathrin-coated vesicle · coat" position={[XE + 3.4 + 0.8, EL - 1.3, 0.6]} show={clO} />
      <Anchor id="plasma-membrane" position={[XE - 3.6, EL + 0.05, 1.2]} show={vis(t, 0, 0.17, 0.02)} />

      <MembraneSheet id={['plasma-membrane', 'endothelial-cell']} shape="plane" width={13} depth={6} position={[XE, -EL, 0]} color={PALETTE.plasmaMembrane} thickness={0.12} />
      <LumenTint box={[XE - 6.5, XE + 6.5, 8, EL + 0.1, -3, 3]} color="#ffc9c9" strength={0.1} />
      <mesh position={[XE - 3.2, EL + 1.7, -0.6]} rotation={[0.5, 0.3, 0.2]} scale={[1.2, 0.42, 1.2]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial color="#c92a2a" roughness={0.5} />
      </mesh>
      <Anchor id="endothelial-cell" position={[XE + 5.0, 0.0, 0.6]} show={vis(t, 0.3, 0.86, 0.02)} />

      {/* many caveolae on both faces of the endothelial cell */}
      {CAVEOLAE.map((c, i) => (
        <Vesicle key={i} id="caveola" radius={0.27} coat="caveolin" color={PALETTE.plasmaMembrane} lumenColor="#ffe3e3" position={c.p} opacity={manyO} />
      ))}

      {/* transcytosis across the endothelial cell (luminal → abluminal) */}
      {flowE > 0.01 &&
        E_ROUTES.map((c, i) => {
          const u = loop(t * 16, i, E_ROUTES.length);
          const a = along(c, u, 0.12);
          return <Vesicle key={i} id="transcytotic-vesicle" radius={0.3} coat="caveolin" coatAmount={1 - seg(u, 0.2, 0.5)} position={a.pos} scale={a.s} color={PALETTE.plasmaMembrane} lumenColor="#ffe3e3" cargo={{ count: 3, color: NUT, seed: i }} opacity={flowE} />;
        })}
      <Anchor id="transcytotic-vesicle" position={E_ROUTES[1].getPointAt(0.5).toArray() as V3} show={flowE} />
      {/* nutrients: in the lumen, then released into the tissue */}
      {nutE > 0.01 &&
        Array.from({ length: 24 }, (_, i) => {
          const r = (k: number) => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
          const below = i % 2 === 0;
          const ph = (t * 10 + r(1)) % 1;
          const p: V3 = below ? [XE - 4.5 + r(2) * 9, -EL - 0.3 - ph * 2.4, 0.4 + r(3)] : [XE - 4.5 + r(2) * 9, EL + 0.4 + r(4) * 2.4, 0.4 + r(3)];
          return <Protein key={i} shape="blob" color={NUT} size={0.14} seed={i} position={p} opacity={nutE * (below ? 1 - ph : 1)} />;
        })}

      {/* --- enterocyte: microvilli on top, basolateral below --- */}
      <MembraneSheet id={['plasma-membrane', 'enterocyte']} shape="plane" width={NW * 2} depth={4} position={[XN, NH, 0]} color={PALETTE.plasmaMembrane} thickness={0.12} />
      <MembraneSheet id={['plasma-membrane', 'enterocyte']} shape="plane" width={NW * 2} depth={4} position={[XN, -NH, 0]} color={PALETTE.plasmaMembrane} thickness={0.12} />
      {[-1, 1].map((s) => (
        <MembraneSheet key={s} id={['plasma-membrane', 'enterocyte']} shape="plane" width={NH * 2} depth={4} position={[XN + s * NW, 0, 0]} rotation={[0, 0, Math.PI / 2]} color={PALETTE.plasmaMembrane} thickness={0.12} />
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <Capsule key={i} id="enterocyte" a={[XN - NW + 0.3 + i * 0.53, NH, 0.2]} b={[XN - NW + 0.3 + i * 0.53, NH + 1.1, 0.2]} r={0.14} color={PALETTE.plasmaMembrane} />
      ))}
      <Anchor id="enterocyte" position={[XN + NW + 0.1, 0.6, 0.6]} show={vis(t, 0.3, 2, 0.02)} />
      {flowN > 0.01 &&
        N_ROUTES.map((c, i) => {
          const u = loop(t * 14, i, N_ROUTES.length);
          const a = along(c, u, 0.1);
          return <Vesicle key={i} id="transcytotic-vesicle" radius={0.32} position={a.pos} scale={a.s} color={PALETTE.plasmaMembrane} lumenColor="#fff3bf" cargo={{ count: 3, color: NUT, seed: i + 5 }} opacity={flowN} />;
        })}
      <Anchor id="transcytotic-vesicle" position={N_ROUTES[1].getPointAt(0.45).toArray() as V3} show={flowN} />
      {flowN > 0.01 &&
        Array.from({ length: 14 }, (_, i) => {
          const ph = (t * 9 + i / 14) % 1;
          const above = i % 2 === 0;
          const p: V3 = above ? [XN - 2 + (i % 7) * 0.65, NH + 1.6 + 0.4 * Math.sin(i), 0.4] : [XN - 2 + (i % 7) * 0.65, -NH - 0.3 - ph * 1.8, 0.4];
          return <Protein key={i} shape="blob" color={NUT} size={0.14} seed={i} position={p} opacity={flowN * (above ? 1 : 1 - ph)} />;
        })}
    </group>
  );
}
