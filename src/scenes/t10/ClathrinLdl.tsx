/**
 * t10-clathrin-ldl — Receptor-mediated endocytosis of LDL.
 * World: plasma membrane at y = 0 (EXTRACELLULAR = +y, CYTOSOL = −y), smooth organelle-scale membrane.
 *  0 LDL particles drift down and bind their receptors
 *  1 receptor–LDL complexes gather into a patch; clathrin polymerises underneath (coated pit)
 *  2 the pit invaginates into a clathrin-coated vesicle
 *  3 dynamin cuts the neck; the clathrin coat comes off
 *  4 the vesicle fuses with the early endosome; H⁺ pumped in, pH 7 → 6; LDL and receptor separate
 *  5 receptors leave in a recycling vesicle back to the plasma membrane
 *  6 LDL goes on: late endosome → lysosome (pH 5 → 4.5); cholesterol released
 */
import type { SceneProps } from '@/content/types';
import { lerp, lerp3, seg, vis, type V3 } from '@/engine/anim';
import { Anchor, ClathrinCage, EdgeTag, Endosome, Ion, Lysosome, MembraneProtein, PALETTE, Protein, Vesicle, useStageCamera, type CamKey } from '@/three/kit';
import { BudSheet, useBudModel } from './parts/bud';
import { HoledSheet } from './parts/Membranes';
import { DynaminCollar } from './parts/Machinery';

export const P = [0, 0.14, 0.28, 0.43, 0.57, 0.71, 0.86] as const;

const R = 1.5;
const RHO = 0.45;
const EDGE = 3.6;
const LDL_C = '#ffd43b';
const CHOL_C = '#fab005';
const REC_C = '#ff6b6b';
const N = 5;
const EE: V3 = [-3.2, -7.2, 0];
const LE: V3 = [1.2, -10.2, -0.5];
const LY: V3 = [3.6, -11.2, -0.3];

const CAM: CamKey[] = [
  { at: 0, pos: [0, 3.5, 15], target: [0, 0, 0], fov: 38 },
  { at: 0.13, pos: [0, 2.5, 14], target: [0, -0.5, 0], fov: 38 },
  { at: 0.27, pos: [2, -0.5, 12], target: [0, -1.2, 0], fov: 38 },
  { at: 0.42, pos: [2.5, -1.5, 12], target: [0, -2, 0], fov: 38 },
  { at: 0.56, pos: [1, -3.5, 15], target: [-1.5, -4.5, 0], fov: 38 },
  { at: 0.7, pos: [-1, -5, 15], target: [-2.5, -6.5, 0], fov: 38 },
  { at: 0.85, pos: [0, -3.5, 19], target: [0, -5, 0], fov: 40 },
  { at: 1, pos: [2, -7, 18], target: [1, -9, 0], fov: 40 },
];

export default function ClathrinLdlScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const m = useBudModel();

  const bind = seg(t, 0.02, 0.12);
  const cluster = seg(t, 0.15, 0.25);
  const pit = seg(t, 0.17, 0.26);
  const invag = seg(t, 0.29, 0.4);
  const con = seg(t, 0.45, 0.52);
  const CUT = 0.525;
  const cut = t >= CUT;
  const travel = seg(t, 0.53, 0.6);
  const fuse = seg(t, 0.58, 0.63);
  const acid = seg(t, 0.6, 0.68);
  const split = seg(t, 0.64, 0.7);
  const recyc = seg(t, 0.72, 0.84);
  const toLate = seg(t, 0.87, 0.93);
  const toLys = seg(t, 0.93, 0.97);
  const chol = seg(t, 0.96, 1);

  let info;
  if (!cut) {
    const h = invag > 0 ? undefined : lerp(-R + 0.01, 0, pit);
    info = m.update({ R, rho: RHO, edge: EDGE, h, neckR: invag > 0 ? lerp(1.4, 0.35, invag * 0.7 + con * 0.3) : undefined, neck: 0.5 * seg(t, 0.44, 0.5) });
  } else {
    info = m.update({ R, rho: RHO, edge: EDGE, cut: true, vesY: -RHO - 0.5 - R - 0.9, dimple: RHO * (1 - seg(t, CUT, CUT + 0.04)) });
  }
  // vesicle centre: on the bud, then travelling to the early endosome
  const budC: V3 = [0, info.cy, 0];
  const vesC = lerp3(budC, EE, travel);
  const vesOpacity = 1 - fuse;

  const coat = cut ? 0.82 * (1 - seg(t, CUT + 0.005, 0.56)) : 0.35 * seg(t, 0.15, 0.26) + 0.47 * invag;
  const ph = lerp(lerp(7, 6, acid), 5, toLate);

  // receptor / LDL positions
  const recs: V3[] = [];
  const ldls: V3[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.4;
    const r0 = 4.5 + (i % 2) * 1.6;
    const flat: V3 = [Math.cos(a) * r0, 0.55, Math.sin(a) * r0 * 0.6];
    const pitP: V3 = [Math.cos(a) * 0.9, 0.55, Math.sin(a) * 0.9];
    let rp = lerp3(flat, pitP, cluster);
    let lp: V3 = [rp[0], rp[1] + 0.55 + 4 * (1 - bind), rp[2]];
    if (t > 0.27) {
      // inside the bud / vesicle lumen, on its inner wall (receptors) with LDL bound
      const ang = a;
      const inV: V3 = [Math.cos(ang) * R * 0.62, -R * 0.35, Math.sin(ang) * R * 0.62];
      const c = cut ? vesC : budC;
      const k = cut ? 1 : invag;
      rp = lerp3(rp, [c[0] + inV[0], c[1] + inV[1], c[2] + inV[2]], k);
      lp = lerp3(lp, [c[0] + inV[0] * 0.45, c[1] + 0.2, c[2] + inV[2] * 0.45], k);
    }
    if (fuse > 0) {
      // in the early endosome: receptors to one side (recycling), LDL to the centre
      const rIn: V3 = [EE[0] + 0.9 + 0.25 * Math.cos(a), EE[1] + 0.2 + 0.35 * Math.sin(a), EE[2] + 0.3];
      const lIn: V3 = [EE[0] - 0.5 + 0.35 * Math.cos(a * 2), EE[1] - 0.2 + 0.3 * Math.sin(a), EE[2]];
      rp = lerp3(rp, rIn, split);
      lp = lerp3(lp, lIn, Math.max(fuse * 0.6, split));
      if (recyc > 0) rp = lerp3(rIn, [3.2 + 0.25 * Math.cos(a), -0.9 + 0.25 * Math.sin(a), 0.4], recyc);
      if (toLate > 0) lp = lerp3(lIn, [LE[0] + 0.3 * Math.cos(a), LE[1] + 0.3 * Math.sin(a), LE[2]], toLate);
      if (toLys > 0) lp = lerp3([LE[0] + 0.3 * Math.cos(a), LE[1] + 0.3 * Math.sin(a), LE[2]], [LY[0] + 0.25 * Math.cos(a), LY[1] + 0.2 * Math.sin(a), LY[2]], toLys);
    }
    recs.push(rp);
    ldls.push(lp);
  }
  const recVesC: V3 = lerp3([EE[0] + 0.9, EE[1] + 0.2, EE[2] + 0.3], [3.2, -0.9, 0.4], recyc);
  const recVesShow = vis(t, 0.71, 0.86, 0.02);
  const ldlShow = 1 - chol;

  return (
    <group>
      <EdgeTag side="top" text="EXTRACELLULAR" />
      <EdgeTag side="bottom" text="CYTOSOL" />

      <HoledSheet id="plasma-membrane" width={34} depth={16} holes={[{ x: 0, z: 0, r: EDGE }]} thickness={0.14} />
      <BudSheet model={m} id="plasma-membrane" budId="coated-vesicle" thickness={0.14} color={PALETTE.plasmaMembrane} opacity={cut ? vesOpacity : 1} />
      <Anchor id="plasma-membrane" position={[-8, 0, 2]} />

      {/* clathrin coat (cytosolic side, under the pit / around the vesicle) */}
      <group position={cut ? vesC : budC}>
        <ClathrinCage radius={R * 1.32} amount={coat} from={[0, -1, 0]} id={['clathrin', 'triskelion', 'coated-vesicle']} />
        <Anchor id="clathrin" position={[R * 0.6, -R * 0.9, R * 0.9]} show={coat > 0.1 ? 1 : 0} />
        <Anchor id="triskelion" position={[-R * 0.7, -R * 1.0, R * 0.7]} show={coat > 0.1 ? 1 : 0} />
        <Anchor id="coated-vesicle" position={[0, -R * 0.2, R * 0.9]} show={t > 0.3 && vesOpacity > 0.3 ? 1 : 0} />
      </group>

      {/* dynamin collar */}
      {t > 0.43 && t < 0.56 && (
        <DynaminCollar id="dynamin" neckR={cut ? 0.35 : Number.isFinite(info.neckR) ? info.neckR : 0.35} y0={-RHO - 0.05} y1={-RHO - 0.45} turns={1.6} perTurn={12} size={0.42} assembled={seg(t, 0.435, 0.47)} release={seg(t, CUT, 0.555)} twist={0.6 * con} />
      )}
      <Anchor id="dynamin" position={[0, -RHO - 0.25, 1.1]} show={vis(t, 0.44, 0.55, 0.01)} />

      {/* receptors (transmembrane) and LDL particles */}
      {recs.map((p, i) => (
        <Protein key={`r${i}`} shape="y" color={REC_C} size={0.7} position={p} rotation={t > 0.27 ? [Math.PI, 0, 0] : [0, 0, 0]} id="ldl-receptor" />
      ))}
      {ldls.map((p, i) => (
        <group key={`l${i}`} position={p}>
          <Protein shape="blob" color={LDL_C} size={0.62} seed={i + 3} id={['ldl', 'cholesterol']} opacity={ldlShow} />
        </group>
      ))}
      <Anchor id="ldl-receptor" position={recs[1]} show={recVesShow > 0 || t < 0.6 ? 1 : 0} />
      <Anchor id="ldl" position={ldls[0]} show={ldlShow} />
      <Anchor id="cholesterol" position={ldls[2]} show={t < 0.12 || t > 0.86 ? 1 : 0} />

      {/* the free vesicle (naked after uncoating) is the bud model's sphere; early endosome */}
      <group position={EE}>
        <Endosome kind="early" radius={1.9} id="early-endosome" opacity={vis(t, 0.5, 1.01, 0.03)} />
        <Anchor id="early-endosome" position={[-1.0, 0.6, 1.2]} text={`Early endosome · pH ${ph.toFixed(1)}`} show={vis(t, 0.5, 1.01, 0.03)} />
        <MembraneProtein id="proton-pump" color={PALETTE.proton} side="cytosol" position={[0, 1.9, 0.4]} rotation={[0, 0, 0]} size={0.55} opacity={vis(t, 0.55, 1.01, 0.03)} />
        <Anchor id="proton-pump" position={[0, 2.35, 0.4]} show={vis(t, 0.55, 1.01, 0.03)} />
        <Ion kind="H" count={Math.round(6 + 34 * acid)} region={{ center: [0, 0, 0], size: [2.4, 2.0, 2.0] }} t={t} id="h-ion" opacity={vis(t, 0.58, 1.01, 0.03)} />
        <Anchor id="h-ion" position={[-0.6, -0.5, 0.6]} show={acid > 0.1 ? 1 : 0} />
      </group>

      {/* recycling vesicle back to the plasma membrane */}
      <group position={recVesC}>
        <Vesicle radius={0.75} color={PALETTE.recyclingEndosome} lumenColor={PALETTE.recyclingEndosome} id="recycling-endosome" opacity={recVesShow} />
        <Anchor id="recycling-endosome" position={[0, 0, 0.6]} show={recVesShow} />
      </group>

      {/* late endosome and lysosome */}
      <group position={LE}>
        <Endosome kind="late" radius={1.4} ilv={0.8} id="late-endosome" opacity={vis(t, 0.84, 1.01, 0.03)} />
        <Anchor id="late-endosome" position={[-0.6, 0.4, 1]} text={`Late endosome · pH ${lerp(5.5, 5, toLate).toFixed(1)}`} show={vis(t, 0.84, 1.01, 0.03)} />
      </group>
      <group position={LY}>
        <Lysosome radius={1.0} id="lysosome" opacity={vis(t, 0.84, 1.01, 0.03)} />
        <Anchor id="lysosome" position={[0.3, 0.3, 0.7]} text="Lysosome · pH 4.5" show={vis(t, 0.84, 1.01, 0.03)} />
      </group>
      {/* cholesterol released from the degraded lipoprotein */}
      {chol > 0 &&
        Array.from({ length: 14 }, (_, i) => (
          <Protein key={`c${i}`} shape="blob" color={CHOL_C} size={0.22} seed={i} id="cholesterol" position={[LY[0] + Math.cos(i * 2.4) * (0.3 + 2.4 * chol), LY[1] + Math.sin(i * 1.7) * (0.3 + 1.6 * chol), LY[2] + Math.sin(i * 3.1) * chol]} />
        ))}
    </group>
  );
}
