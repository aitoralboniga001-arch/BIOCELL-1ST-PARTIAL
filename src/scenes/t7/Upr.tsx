/**
 * t7-upr — ER stress and the unfolded protein response.
 *
 * World: ER membrane patch at y = 0 (lumen below, cytosol above) with the three stress sensors PERK, IRE1 and
 * ATF6 at x = −3.2 / 0 / +3.2; the nucleus floats behind and above in the cytosol.
 *
 *  0  a few unfolded proteins in the lumen: more than the chaperones can fold
 *  1  each sensor has a BiP bound to its lumenal domain: inactive
 *  2  heat: many unfolded proteins appear; the BiPs leave the sensors to bind them
 *  3  the freed sensors light up; transcription factors travel from them to the nucleus
 *  4  the nucleus answers: messages go out, new chaperones (BiP) appear in the lumen; an autophagosome forms
 *  5  if the stress persists: unfolded proteins keep piling up and the cell commits suicide (nucleus condenses)
 */
import { useMemo } from 'react';
import { CatmullRomCurve3, Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { lerp, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, Bilayer, EdgeTag, Flow, LumenTint, MembraneProtein, Nucleus, PALETTE, Polypeptide, Protein, useStageCamera, Vesicle, type CamKey } from '@/three/kit';
import { coilPoint } from './parts/molecules';

export const P = [0, 0.17, 0.34, 0.52, 0.69, 0.86] as const;

const T = {
  few: [0.03, 0.1],
  heat: [0.35, 0.4],
  many: [0.36, 0.44],
  bipGo: [0.41, 0.49],
  active: [0.53, 0.57],
  tf: [0.56, 0.68],
  mrna: [0.71, 0.8],
  newBip: [0.76, 0.84],
  auto: [0.74, 0.8],
  death: [0.88, 0.97],
} as const;

const SENSORS = [
  { id: 'perk', x: -3.2, color: '#ff922b', seed: 21 },
  { id: 'ire1', x: 0, color: '#fcc419', seed: 23 },
  { id: 'atf6', x: 3.2, color: '#ff6b9d', seed: 25 },
] as const;
const SZ = 0.4;
const NUC: V3 = [-2.0, 5.4, -4.0];
const NUC_R = 2.2;
const TF_COL = '#b197fc';
const AUTO_COL = '#9775fa';

/** unfolded proteins: [centre, appears at] (the first three are there from the start) */
const UNF: { c: V3; at: number }[] = [
  { c: [-1.6, -2.6, 0.9], at: T.few[0] },
  { c: [2.0, -3.1, 0.6], at: T.few[0] + 0.03 },
  { c: [-4.6, -3.4, 0.2], at: T.few[0] + 0.05 },
  { c: [0.4, -4.2, 1.2], at: T.many[0] },
  { c: [-3.2, -4.8, 1.0], at: T.many[0] + 0.015 },
  { c: [4.6, -2.4, 0.9], at: T.many[0] + 0.03 },
  { c: [3.4, -4.6, 0.2], at: T.many[0] + 0.045 },
  { c: [-6.2, -2.2, 0.4], at: T.many[0] + 0.06 },
  // step 5: the pile keeps growing
  { c: [-0.8, -5.4, 0.4], at: T.death[0] },
  { c: [1.8, -1.8, 1.8], at: T.death[0] + 0.015 },
  { c: [5.8, -4.0, 1.2], at: T.death[0] + 0.03 },
  { c: [-5.4, -5.6, 1.4], at: T.death[0] + 0.045 },
];
/** where each sensor's BiP goes when the unfolded proteins pile up */
const BIP_TO = [UNF[2].c, UNF[0].c, UNF[1].c];
const NEW_BIP: V3[] = [
  [-2.4, -1.5, 1.4],
  [1.0, -1.6, 1.6],
  [4.2, -1.4, 1.3],
  [-5.2, -1.5, 1.0],
];

const tfCurve = (x: number) =>
  new CatmullRomCurve3([new Vector3(x, 1.25, SZ), new Vector3(x * 0.6 - 0.8, 2.8, -1.2), new Vector3(NUC[0] + x * 0.15, NUC[1] - NUC_R + 0.2, NUC[2] + 0.9), new Vector3(NUC[0] + x * 0.1, NUC[1] - 0.6, NUC[2])]);
const MRNA_PATHS: V3[][] = [
  [
    [NUC[0] + 0.6, NUC[1] - NUC_R + 0.1, NUC[2] + 0.6],
    [-1.0, 2.6, -1.4],
    [-2.0, 0.9, -0.6],
  ],
  [
    [NUC[0] + 1.2, NUC[1] - NUC_R + 0.4, NUC[2] + 0.5],
    [1.6, 2.4, -1.2],
    [2.6, 0.9, -0.4],
  ],
];

const CAM: CamKey[] = [
  { at: 0, pos: [0.4, -1.4, 10.6], target: [-0.6, -3.0, 0.3], fov: 40 },
  { at: 0.15, pos: [0.3, -1.3, 10.4], target: [-0.6, -3.0, 0.3], fov: 40 },
  { at: 0.2, pos: [0.6, 0.8, 10.4], target: [0, -0.7, 0.3], fov: 40 },
  { at: 0.33, pos: [0.6, 0.7, 10.2], target: [0, -0.8, 0.3], fov: 40 },
  { at: 0.38, pos: [0.4, -0.2, 12.4], target: [-0.2, -2.0, 0.3], fov: 40 },
  { at: 0.5, pos: [0.4, -0.2, 12.2], target: [-0.2, -2.0, 0.3], fov: 40 },
  { at: 0.56, pos: [1.2, 3.0, 16.0], target: [-0.4, 1.8, -0.8], fov: 42 },
  { at: 0.68, pos: [1.0, 3.0, 15.8], target: [-0.4, 1.9, -0.8], fov: 42 },
  { at: 0.73, pos: [2.4, 2.4, 16.2], target: [0.6, 1.0, -0.6], fov: 42 },
  { at: 0.85, pos: [2.2, 2.4, 16.0], target: [0.6, 1.0, -0.6], fov: 42 },
  { at: 0.9, pos: [0.6, 2.2, 17.4], target: [-0.2, 0.9, -0.8], fov: 42 },
  { at: 1, pos: [0.6, 2.2, 17.8], target: [-0.2, 0.9, -0.8], fov: 42 },
];

const _v = new Vector3();
const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

export default function UprScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const curves = useMemo(() => SENSORS.map((s) => tfCurve(s.x)), []);

  const heat = seg(t, T.heat[0], T.heat[1]);
  const bipGo = smooth(seg(t, T.bipGo[0], T.bipGo[1]));
  const active = seg(t, T.active[0], T.active[1]);
  const death = seg(t, T.death[0], T.death[1]);
  const nucGlow = vis(t, T.tf[1] - 0.02, T.newBip[1], 0.02) * 0.6;

  return (
    <group>
      <EdgeTag side="top" text="CYTOSOL" />
      <EdgeTag side="bottom" text="ER LUMEN" />
      <Bilayer id="er-membrane" width={24} depth={9} position={[0, 0, -4.0]} holes={SENSORS.map((s) => ({ x: s.x, z: SZ + 4.0, r: 0.42 }))} seed={4} />
      <LumenTint id="er-lumen" box={[-30, 30, -0.68, -26, -30, 30]} color={PALETTE.erLumen} strength={0.16} />
      {/* heat: a warm cast over the lumen while the temperature is high */}
      <LumenTint box={[-30, 30, -0.68, -26, -30, 30]} color="#ff6b3d" strength={0.1 * heat * (1 - 0.5 * seg(t, T.newBip[0], T.newBip[1])) + 0.08 * death} />
      <Anchor id="er-lumen" position={[-6.4, -4.0, 0.2]} />

      {/* sensors (transmembrane): lumenal domain binds BiP, cytosolic domain relays the signal */}
      {SENSORS.map((s, k) => {
        const g = active * (0.55 + 0.25 * Math.sin(t * 120 + k)) * (1 - 0.6 * death);
        return (
          <group key={s.id} position={[s.x, 0, SZ]}>
            <MembraneProtein id={s.id} color={s.color} side="lumen" seed={s.seed} glow={g} />
            <Protein id={s.id} shape="blob" color={s.color} size={0.62} seed={s.seed + 1} position={[0.1, 0.98, 0]} glow={g} />
            <Anchor id={s.id} position={[0.12, 1.0, 0.2]} />
          </group>
        );
      })}

      {/* BiP: bound to the sensors, then pulled away by the unfolded proteins */}
      {SENSORS.map((s, k) => {
        const from: V3 = [s.x + 0.1, -1.75, SZ + 0.1];
        const to: V3 = [BIP_TO[k][0] + 0.55, BIP_TO[k][1] + 0.45, BIP_TO[k][2] + 0.3];
        const pos = lerp3(from, to, bipGo);
        pos[1] += Math.sin(Math.PI * bipGo) * 0.6;
        return <Protein key={k} id="bip" shape="blob" color={PALETTE.bip} size={0.55} seed={40 + k} position={pos} />;
      })}
      <Anchor id="bip" position={lerp3([SENSORS[1].x + 0.1, -1.7, SZ + 0.35], [BIP_TO[1][0] + 0.55, BIP_TO[1][1] + 0.5, BIP_TO[1][2] + 0.55], bipGo)} />

      {/* unfolded proteins */}
      {UNF.map((u, k) => {
        const o = seg(t, u.at, u.at + 0.03);
        return o > 0.002 ? (
          <Polypeptide key={k} id="unfolded-protein" count={24} made={24} spacing={0.2} color="#e8a26a" opacity={o} glow={0.25 * death} layout={(i, _m, out) => (coilPoint(i, 24, u.c, t, 3 + k * 2, out, 1.7), true)} />
        ) : null;
      })}
      <Anchor id="unfolded-protein" position={[UNF[0].c[0] - 0.5, UNF[0].c[1], UNF[0].c[2] + 0.3]} show={seg(t, UNF[0].at, UNF[0].at + 0.03)} />

      {/* transcription factors travel from the active sensors to the nucleus */}
      {SENSORS.map((s, k) => {
        const a = T.tf[0] + k * 0.012;
        const u = smooth(seg(t, a, a + 0.09));
        const o = vis(t, a, a + 0.1, 0.012);
        if (o <= 0.002) return null;
        curves[k].getPointAt(u, _v);
        return <Protein key={k} id="transcription-factor" shape="blob" color={TF_COL} size={0.62} seed={60 + k} opacity={o} position={_v.toArray() as V3} />;
      })}
      <Anchor
        id="transcription-factor"
        position={curves[1].getPointAt(smooth(seg(t, T.tf[0] + 0.012, T.tf[0] + 0.102))).toArray() as V3}
        show={vis(t, T.tf[0] + 0.01, T.tf[1] + 0.03, 0.015)}
      />

      {/* nucleus: receives the signal, makes more chaperones; condenses in apoptosis */}
      <group position={NUC} scale={1 - 0.22 * death}>
        <Nucleus id="nucleus" radius={NUC_R} pores={24} glow={nucGlow} />
      </group>
      <Anchor id="nucleus" position={[NUC[0] - 1.0, NUC[1] + 0.4, NUC[2] + 1.6]} />

      {/* messages for new chaperones leave the nucleus towards the ER */}
      {MRNA_PATHS.map((p, k) => (
        <Flow key={k} points={p} t={t} speed={14} count={10} color={PALETTE.mrna} size={0.15} opacity={vis(t, T.mrna[0], T.mrna[1], 0.02)} />
      ))}
      {NEW_BIP.map((p, k) => {
        const g = seg(t, T.newBip[0] + k * 0.01, T.newBip[0] + k * 0.01 + 0.035);
        return g > 0.002 ? <Protein key={k} id="bip" shape="blob" color={PALETTE.bip} size={0.5 * (0.4 + 0.6 * g)} seed={70 + k} opacity={g} position={[p[0], p[1] - 0.6 * g, p[2]]} /> : null;
      })}

      {/* autophagy */}
      {(() => {
        const a = seg(t, T.auto[0], T.auto[1]);
        return a > 0.002 ? (
          <group position={[6.2, 2.4, 0.2]}>
            <Vesicle id="autophagosome" radius={0.95 * (0.5 + 0.5 * a)} color={AUTO_COL} opacity={a} cargo={{ count: 6, color: '#e8a26a', seed: 3 }} />
            <Anchor id="autophagosome" position={[0, 0.2, 0.5]} show={a} />
          </group>
        ) : null;
      })()}

      {/* background chaperones in the lumen */}
      {[
        [-7.4, -3.6, -2.0],
        [6.6, -3.0, -2.4],
        [-1.2, -5.6, -2.6],
      ].map((p, k) => (
        <Protein key={k} shape="blob" color={PALETTE.bip} size={0.45} seed={80 + k} position={[p[0], p[1] + 0.08 * Math.sin(t * 20 + k), p[2]]} />
      ))}
    </group>
  );
}
