/**
 * t8-sorting — Sorting at the TGN (organelle scale). Stack axis +x (cis left, TGN right).
 *  0 mixed cargo in the TGN, sorted by sugar pattern     1 three routes: lysosome, plasma membrane, back to ER
 *  2 M6P cargo (yellow) in clathrin vesicles → lysosome   3 constitutive (green) vesicles fuse continuously
 *  4 glycoproteins' sugars end up outside the PM          5 regulated (pink) vesicles wait, then fuse together;
 *                                                           COPI retrograde vesicles return to the ER
 */
import type { SceneProps } from '@/content/types';
import { clamp, seg, type V3 } from '@/engine/anim';
import { Anchor, EdgeTag, MembraneSheet, PALETTE, Protein, Sugar, Vesicle, useStageCamera, type CamKey } from '@/three/kit';
import { Cisterna } from './parts/Cisterna';
import { GolgiStack, X0, along, curve, loop } from './parts/stack';

export const P = [0, 0.17, 0.34, 0.52, 0.69, 0.86] as const;

const TGN_X = -X0;
const ER_X = -6.4;
const LYSO: V3 = [5.0, -2.8, 0];
const PM_X = 8.5;

const CAM: CamKey[] = [
  { at: 0, pos: [2.2, 1.2, 6.2], target: [0.9, 0, 0], fov: 38 },
  { at: 0.15, pos: [2.2, 1.2, 6.2], target: [0.9, 0, 0], fov: 38 },
  { at: 0.21, pos: [1.2, 2.6, 17], target: [1.2, -0.4, 0], fov: 40 },
  { at: 0.33, pos: [1.2, 2.6, 17], target: [1.2, -0.4, 0], fov: 40 },
  { at: 0.38, pos: [2.6, 0.4, 12.8], target: [2.3, -0.9, 0], fov: 40 },
  { at: 0.5, pos: [2.6, 0.4, 12.8], target: [2.3, -0.9, 0], fov: 40 },
  { at: 0.56, pos: [5.5, 2.0, 10.5], target: [4.8, 0.6, 0], fov: 38 },
  { at: 0.68, pos: [5.5, 2.0, 10.5], target: [4.8, 0.6, 0], fov: 38 },
  { at: 0.73, pos: [5.6, 0.8, 4.4], target: [PM_X, 0.4, 0], fov: 36 },
  { at: 0.84, pos: [5.6, 0.8, 4.4], target: [PM_X, 0.4, 0], fov: 36 },
  { at: 0.9, pos: [1.0, 2.8, 18], target: [1.0, 0, 0], fov: 40 },
  { at: 1, pos: [1.0, 2.8, 18], target: [1.0, 0, 0], fov: 40 },
];

const TO_LYSO = curve([[TGN_X + 0.4, -0.8, 0.4], [3, -2.2, 0.8], [LYSO[0] - 0.55, LYSO[1] + 0.2, 0.3]]);
const TO_PM = [0, 1, 2].map((i) => curve([[TGN_X + 0.4, 0.4 + i * 0.4, 0.4], [4.5, 0.6 + i * 0.6, 0.9], [PM_X - 0.25, -0.2 + i * 0.9, 0.3]]));
const TO_ER = curve([[X0 - 0.1, 2.3, 0.2], [-3.5, 2.8, 0.9], [ER_X + 0.4, 1.4, 0.3]]);
const REG_PARK: V3[] = [[7.2, 1.8, 0.6], [7.5, 0.9, -0.3], [7.1, 0.1, 0.8], [7.6, -0.8, 0.1], [7.0, -1.5, -0.5]];

const CARGO = [
  { col: PALETTE.signalPeptide, id: 'm6p' }, // yellow: M6P lysosomal enzymes
  { col: '#51cf66', id: 'secretory-vesicle' }, // green: constitutive
  { col: '#f783ac', id: 'secretory-vesicle' }, // pink: regulated
];

export default function SortingScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const routes = seg(t, 0.17, 0.2);
  const sortK = seg(t, 0.03, 0.14);
  const lysoOn = t >= 0.17;
  const consOn = t >= 0.17;
  const fire = seg(t, 0.93, 0.97);

  return (
    <group>
      <EdgeTag side="left" text="CIS" />
      <EdgeTag side="right" text={t > 0.69 && t < 0.86 ? 'EXTRACELLULAR →' : 'TRANS → destinations'} />

      <GolgiStack ids={(i) => (i === 4 ? ['tgn'] : ['golgi'])} />
      <Anchor id="tgn" position={[TGN_X, 1.3, -0.3]} />

      {/* step 0: mixed cargo in the TGN lumen segregates into three groups */}
      {[0, 1, 2].map((g) =>
        [0, 1, 2, 3].map((k) => {
          const mixY = -1.2 + ((k * 3 + g) * 0.23) % 2.4;
          const sortY = [-1.1, 0.0, 1.0][g] + (k - 1.5) * 0.14;
          const y = mixY + (sortY - mixY) * sortK;
          return (
            <group key={`${g}${k}`} position={[TGN_X + 0.02, y, -0.15]}>
              <Protein color={CARGO[g].col} size={0.13} seed={g * 5 + k} id={g === 0 ? 'hydrolytic-enzyme' : CARGO[g].id} />
              <Sugar kind={g === 0 ? 'Man6P' : 'Gal'} size={0.28} position={[0.05, 0.07, 0.05]} id="oligosaccharide" />
            </group>
          );
        }),
      )}
      <Anchor id="oligosaccharide" position={[TGN_X + 0.05, 0.1, -0.1]} show={seg(t, 0, 0.03) * (1 - seg(t, 0.17, 0.2))} />

      {/* ER (retrograde target) */}
      <group position={[ER_X, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <Cisterna R={3.2} seed={9} fen={0} bend={0.04} color={PALETTE.erMembrane} lumenColor={PALETTE.erLumen} opacity={routes} id="er" />
      </group>
      <Anchor id="er" position={[ER_X, -1.6, 0.3]} show={routes} />

      {/* lysosome route: clathrin-coated M6P vesicles */}
      <MembraneSheet shape="sphere" radius={0.8} position={LYSO} color={PALETTE.lysosome} lumenColor={PALETTE.lysosome} id="lysosome" opacity={routes} />
      <Anchor id="lysosome" position={[LYSO[0] + 0.2, LYSO[1] - 0.2, 0.2]} show={routes} />
      {lysoOn &&
        [0, 1].map((i) => {
          const a = along(TO_LYSO, loop((t - 0.17) * 22, i, 2));
          return (
            <group key={i} position={a.pos} scale={a.s}>
              <Vesicle radius={0.24} coat="clathrin" coatAmount={1 - seg(a.s < 1 && a.pos[0] > 3.5 ? 1 : 0, 0, 1)} coatId="clathrin" lumenColor={PALETTE.golgiLumen} cargo={{ count: 5, color: PALETTE.signalPeptide, seed: i }} id="transport-vesicle" />
            </group>
          );
        })}
      <Anchor id="clathrin" position={TO_LYSO.getPointAt(0.45).toArray() as V3} show={seg(t, 0.34, 0.37)} />
      <Anchor id="m6p-receptor" position={[TGN_X + 0.1, -1.1, -0.1]} show={seg(t, 0.34, 0.37)} />
      <Anchor id="m6p" position={[TGN_X + 0.05, -0.85, -0.1]} show={seg(t, 0.34, 0.37)} />
      <Anchor id="hydrolytic-enzyme" position={[LYSO[0], LYSO[1] + 0.3, 0.1]} show={seg(t, 0.34, 0.37)} />
      {/* M6P receptors on the TGN membrane */}
      {[0, 1, 2].map((k) => (
        <Protein key={k} shape="y" color="#ffa94d" size={0.42} glow={0.35} position={[TGN_X - 0.02, -1.45 + k * 0.32, 0.12]} rotation={[0, 0, Math.PI / 2]} id="m6p-receptor" opacity={seg(t, 0.3, 0.36)} />
      ))}

      {/* plasma membrane */}
      <MembraneSheet shape="plane" width={9} depth={5} position={[PM_X, 0, 0]} rotation={[0, 0, Math.PI / 2]} color={PALETTE.plasmaMembrane} opacity={routes * 0.85} id="plasma-membrane" />
      <Anchor id="plasma-membrane" position={[PM_X, 2.6, 0.3]} show={routes} />

      {/* constitutive: continuous green stream that fuses */}
      {consOn &&
        TO_PM.map((c, i) => {
          const a = along(c, loop((t - 0.17) * 26, i, 3), 0.08);
          return <Vesicle key={i} position={a.pos} radius={0.22 * a.s} lumenColor={PALETTE.golgiLumen} cargo={{ count: 4, color: '#51cf66', seed: i + 3 }} id="secretory-vesicle" />;
        })}
      <Anchor id="secretory-vesicle" position={TO_PM[1].getPointAt(0.55).toArray() as V3} show={routes} />

      {/* sugars of membrane glycoproteins on the extracellular face */}
      {[0, 1, 2, 3, 4].map((k) => (
        <group key={k} position={[PM_X + 0.12, -1.6 + k * 0.8, 0.2]} rotation={[0, 0, -Math.PI / 2]} scale={0.5 + 0.5 * seg(t, 0.69, 0.75)}>
          <Protein color="#adb5bd" size={0.18} seed={k} />
          <Sugar kind="GlcNAc" size={0.5} position={[0, 0.2, 0]} id="oligosaccharide" />
          <Sugar kind="Gal" size={0.5} position={[0, 0.36, 0]} id="oligosaccharide" />
          <Sugar kind="Sia" size={0.5} position={[0, 0.52, 0]} id="oligosaccharide" />
        </group>
      ))}

      {/* regulated: pink vesicles stored near the PM, fuse all at once on the signal */}
      {REG_PARK.map((p, i) => {
        const arrive = seg(t, 0.86 + i * 0.008, 0.9 + i * 0.008);
        const x = 3 + (p[0] - 3) * arrive + (PM_X - 0.1 - p[0]) * fire;
        const s = (1 - fire) * seg(t, 0.85, 0.87);
        return s > 0.01 ? <Vesicle key={i} position={[x, p[1], p[2]]} radius={0.24 * s} lumenColor={PALETTE.golgiLumen} cargo={{ count: 5, color: '#f783ac', seed: i + 8 }} id="secretory-vesicle" /> : null;
      })}
      {/* Ca²⁺-like release signal flash at the PM */}
      {fire > 0.01 && fire < 0.99 && (
        <mesh position={[PM_X - 0.2, 0.2, 0.3]} scale={0.6 + 1.6 * fire}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshBasicMaterial color="#fff3c4" transparent opacity={0.35 * (1 - fire)} depthWrite={false} toneMapped={false} />
        </mesh>
      )}

      {/* retrograde COPI vesicle back to the ER (chaperone cargo) */}
      {(t >= 0.17 && t < 0.34) || t >= 0.86
        ? (() => {
            const a = along(TO_ER, clamp(((t - (t >= 0.86 ? 0.86 : 0.17)) * 12) % 1));
            return <Vesicle position={a.pos} radius={0.22 * a.s} coat="copi" coatId="retrograde-vesicle" id="retrograde-vesicle" cargo={{ count: 4, color: PALETTE.bip, seed: 2 }} />;
          })()
        : null}
      <Anchor id="retrograde-vesicle" position={TO_ER.getPointAt(0.5).toArray() as V3} show={(t >= 0.17 && t < 0.34) || t >= 0.86 ? 1 : 0} />
    </group>
  );
}
