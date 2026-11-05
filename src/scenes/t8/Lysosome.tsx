/**
 * t8-lysosome — Lysosome biogenesis (organelle scale; stack axis +x, CGN left, TGN right, lysosome lower right).
 *  0 M6P tag added to hydrolases in the CGN   1 tagged enzymes reach the TGN and bind M6P receptors
 *  2 clathrin coat assembles, vesicle buds     3 vesicles fuse into a primary lysosome with proton pumps
 *  4 H⁺ acidify: enzymes released              5 receptors return to the TGN
 *  6 I-cell disease: untagged enzymes are secreted at the plasma membrane
 */
import type { SceneProps } from '@/content/types';
import { lerp, seg, type V3 } from '@/engine/anim';
import { Anchor, EdgeTag, Ion, MembraneSheet, PALETTE, Protein, Sugar, Vesicle, useStageCamera, type CamKey } from '@/three/kit';
import { GolgiStack, X0, along, curve } from './parts/stack';

export const P = [0, 0.14, 0.29, 0.43, 0.57, 0.71, 0.86] as const;

const TGN_X = -X0;
const LYSO: V3 = [4.2, -2.2, 0];
const PM_X = 8.5;
const BUD: V3 = [TGN_X + 0.45, -1.0, 0.3];

const CAM: CamKey[] = [
  { at: 0, pos: [-1.2, 0.6, 6.5], target: [-0.6, 0, 0], fov: 38 },
  { at: 0.12, pos: [-1.2, 0.6, 6.5], target: [-0.6, 0, 0], fov: 38 },
  { at: 0.18, pos: [1.6, 0.2, 6.8], target: [0.9, -0.6, 0], fov: 38 },
  { at: 0.4, pos: [1.6, 0.2, 6.8], target: [0.9, -0.6, 0], fov: 38 },
  { at: 0.47, pos: [3.4, -0.6, 8.0], target: [3.2, -1.8, 0], fov: 38 },
  { at: 0.68, pos: [3.4, -0.6, 8.0], target: [3.2, -1.8, 0], fov: 38 },
  { at: 0.74, pos: [2.6, -0.2, 10.5], target: [2.2, -1.2, 0], fov: 40 },
  { at: 0.84, pos: [2.6, -0.2, 10.5], target: [2.2, -1.2, 0], fov: 40 },
  { at: 0.9, pos: [3.5, 1.5, 17], target: [3.5, -0.2, 0], fov: 40 },
  { at: 1, pos: [3.5, 1.5, 17], target: [3.5, -0.2, 0], fov: 40 },
];

const TO_LYSO = curve([BUD, [2.4, -1.9, 0.6], [LYSO[0] - 0.4, LYSO[1] + 0.2, 0.2]]);
const BACK = curve([[LYSO[0] - 0.3, LYSO[1] + 0.6, 0.2], [2.6, 0.2, 0.7], [TGN_X + 0.4, 0.5, 0.3]]);
const OUT = curve([[TGN_X + 0.4, 0.8, 0.3], [4.5, 1.6, 0.8], [PM_X - 0.2, 1.0, 0.3]]);

export default function LysosomeScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const tag = seg(t, 0.03, 0.11);
  const toTgn = seg(t, 0.15, 0.24);
  const bind = seg(t, 0.24, 0.28);
  const coat = seg(t, 0.3, 0.38);
  const leave = seg(t, 0.38, 0.42);
  const travel = seg(t, 0.44, 0.52);
  const lyso = seg(t, 0.5, 0.55);
  const acid = seg(t, 0.58, 0.64);
  const release = seg(t, 0.62, 0.68);
  const back = seg(t, 0.72, 0.84);
  const icell = seg(t, 0.87, 0.97);

  // the transport vesicle: buds at the TGN, travels, fuses into the lysosome
  const v = along(TO_LYSO, travel, 0.001);
  const vesPos: V3 = travel > 0 ? v.pos : [BUD[0] + 0.25 * leave, BUD[1] - 0.2 * leave, BUD[2]];
  const vesShow = coat > 0 && lyso < 1 ? 1 - lyso : 0;

  return (
    <group>
      <EdgeTag side="left" text="CIS (CGN)" />
      <EdgeTag side="right" text="TRANS (TGN) → lysosome" />
      <GolgiStack ids={(i) => (i === 0 ? ['cgn'] : i === 4 ? ['tgn'] : ['golgi'])} />
      <Anchor id="cgn" position={[X0, 1.3, -0.3]} />
      <Anchor id="tgn" position={[TGN_X, 1.3, -0.3]} show={seg(t, 0.14, 0.17)} />

      {/* hydrolases: tagged in the CGN, carried to the TGN */}
      {t < 0.3 &&
        [0, 1, 2].map((k) => {
          const x = lerp(X0 + 0.02, TGN_X - 0.25, toTgn);
          const y = lerp(-0.5 + k * 0.5, -1.25 + k * 0.25, toTgn);
          return (
            <group key={k} position={[x + 0.2 * bind, y, 0.05]}>
              <Protein color={PALETTE.hydrolase} size={0.2} seed={k + 2} id="hydrolytic-enzyme" />
              <Sugar kind="Man6P" size={0.45 * tag} position={[0.1, 0.1, 0.05]} id="m6p" />
            </group>
          );
        })}
      <Anchor id="hydrolytic-enzyme" position={[lerp(X0, TGN_X - 0.2, toTgn), lerp(0, -1.0, toTgn), 0.05]} show={t < 0.3 ? 1 : 0} />
      <Anchor id="m6p" position={[lerp(X0 + 0.1, TGN_X - 0.1, toTgn), lerp(0.6, -0.7, toTgn), 0.05]} show={tag * (t < 0.3 ? 1 : 0)} />

      {/* M6P receptors clustered at one site of the TGN */}
      {t < 0.3 &&
        [0, 1, 2].map((k) => <Protein key={k} shape="y" color="#ffa94d" size={0.4} glow={0.3} position={[TGN_X + 0.1, -1.3 + k * 0.25, 0.1]} rotation={[0, 0, Math.PI / 2]} id="m6p-receptor" opacity={seg(t, 0.12, 0.16)} />)}
      <Anchor id="m6p-receptor" position={[TGN_X + 0.15, -1.05, 0.1]} show={seg(t, 0.12, 0.16) * (t < 0.3 ? 1 : 0)} />

      {/* clathrin-coated vesicle with receptor–enzyme pairs inside */}
      {vesShow > 0.01 && (
        <group position={vesPos} scale={0.6 + 0.4 * coat}>
          <Vesicle radius={0.34} coat="clathrin" coatAmount={coat * (1 - seg(t, 0.44, 0.47))} coatFrom={[1, 0, 0]} coatId="clathrin" lumenColor={PALETTE.golgiLumen} id="transport-vesicle" opacity={vesShow} />
          {[0, 1, 2].map((k) => (
            <group key={k} position={[Math.cos(k * 2.1) * 0.15, Math.sin(k * 2.1) * 0.15, 0]}>
              <Protein color={PALETTE.hydrolase} size={0.11} seed={k + 2} id="hydrolytic-enzyme" opacity={vesShow} />
              <Protein shape="y" color="#ffa94d" size={0.16} seed={k} position={[0.06, 0.06, 0]} id="m6p-receptor" opacity={vesShow} />
            </group>
          ))}
        </group>
      )}
      <Anchor id="clathrin" position={[vesPos[0], vesPos[1] + 0.35, vesPos[2]]} show={vesShow * coat * (1 - seg(t, 0.44, 0.47))} />

      {/* primary lysosome: proton pumps, H⁺, released enzymes, receptors leaving */}
      <MembraneSheet shape="sphere" radius={0.95} position={LYSO} color={PALETTE.lysosome} lumenColor={PALETTE.lysosome} id="lysosome" opacity={lyso} surfaceOpacity={0.35} />
      <Anchor id="lysosome" position={[LYSO[0] + 0.5, LYSO[1] - 0.5, 0.2]} show={lyso} />
      {[0, 1, 2, 3, 4].map((k) => {
        const a = (k / 5) * Math.PI * 2 + 0.4;
        return <Protein key={k} shape="barrel" color={PALETTE.proton} size={0.22} position={[LYSO[0] + Math.cos(a) * 0.95, LYSO[1] + Math.sin(a) * 0.95, 0.15]} rotation={[0, 0, a - Math.PI / 2]} id="proton-pump" opacity={lyso} />;
      })}
      <Anchor id="proton-pump" position={[LYSO[0] + Math.cos(0.4) * 0.95, LYSO[1] + Math.sin(0.4) * 0.95, 0.15]} show={lyso} />
      <Ion kind="H" count={26} t={t} region={{ center: LYSO, size: [1.1, 1.1, 0.8] }} id="h-ion" opacity={acid} />
      <Anchor id="h-ion" position={[LYSO[0] - 0.3, LYSO[1] + 0.3, 0.3]} show={acid} />
      {lyso > 0.01 &&
        [0, 1, 2, 3, 4, 5].map((k) => {
          const a = k * 1.05;
          const r = lerp(0.62, 0.3 + 0.15 * (k % 2), release);
          return <Protein key={k} color={PALETTE.hydrolase} size={0.16} seed={k} position={[LYSO[0] + Math.cos(a) * r, LYSO[1] + Math.sin(a) * r, 0.05]} id="hydrolytic-enzyme" opacity={lyso} />;
        })}
      {lyso > 0.01 &&
        back < 0.02 &&
        [0, 1, 2].map((k) => {
          const a = 0.9 + k * 0.5;
          return <Protein key={k} shape="y" color="#ffa94d" size={0.2} position={[LYSO[0] + Math.cos(a) * 0.82, LYSO[1] + Math.sin(a) * 0.82, 0.1]} rotation={[0, 0, a + Math.PI / 2]} id="m6p-receptor" opacity={lyso} />;
        })}

      {/* receptors recycled to the TGN */}
      {back > 0.01 && back < 0.99 && (
        <group position={along(BACK, back, 0.001).pos}>
          <Vesicle radius={0.26} lumenColor={PALETTE.golgiLumen} id="retrograde-vesicle" />
          {[0, 1, 2].map((k) => (
            <Protein key={k} shape="y" color="#ffa94d" size={0.16} position={[Math.cos(k * 2.1) * 0.2, Math.sin(k * 2.1) * 0.2, 0]} rotation={[0, 0, k * 2.1 - Math.PI / 2]} id="m6p-receptor" />
          ))}
        </group>
      )}
      <Anchor id="retrograde-vesicle" position={BACK.getPointAt(0.5).toArray() as V3} show={back > 0.01 && back < 0.99 ? 1 : 0} />

      {/* I-cell disease: no M6P → enzymes leave by the default route and are secreted */}
      <MembraneSheet shape="plane" width={9} depth={5} position={[PM_X, 0, 0]} rotation={[0, 0, Math.PI / 2]} color={PALETTE.plasmaMembrane} opacity={seg(t, 0.84, 0.88) * 0.85} id="plasma-membrane" />
      <Anchor id="plasma-membrane" position={[PM_X, 2.4, 0.3]} show={seg(t, 0.84, 0.88)} />
      {icell > 0.01 &&
        [0, 1].map((k) => {
          const u = Math.min(1, Math.max(0, icell * 1.3 - k * 0.3));
          const a = along(OUT, u, 0.001);
          const out = u >= 0.98;
          return (
            <group key={k} position={out ? [PM_X + 0.6 + k * 0.3, 1.0 - k * 0.4, 0.3] : a.pos}>
              {!out && <Vesicle radius={0.26} lumenColor={PALETTE.golgiLumen} />}
              <Protein color={PALETTE.hydrolase} size={0.16} seed={k + 9} id="hydrolytic-enzyme" />
            </group>
          );
        })}
    </group>
  );
}
