/**
 * t10-phago — Phagocytosis of an opsonised bacterium by a phagocyte.
 *
 * World: a patch of the phagocyte's plasma membrane at y = 0 (EXTRACELLULAR = +y, CYTOSOL = −y) with many
 * lysosomes in the cytoplasm below. A bacterium coated with antibodies comes down onto Fc receptors and Toll-like
 * receptors; actin-filled pseudopods (arcs around the bacterium) close over it into a phagosome, which sinks into
 * the cytoplasm and fuses with two lysosomes (hydrolases pour in) → phagolysosome; the bacterium is digested and
 * its wall comes apart. A TEM-style pass then shows the lysosomes electron-dense.
 */
import { useMemo } from 'react';
import { Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { clamp, lerp, lerp3, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, EdgeTag, MembraneSheet, PALETTE, Protein, Vesicle, proteinMaterial, useDisposable, useStageCamera, type CamKey } from '@/three/kit';
import { Capsule } from '../t7/parts/molecules';
import { DynTube, PathBuf } from '../t6/parts/tube';

export const P = [0, 0.14, 0.28, 0.43, 0.57, 0.71, 0.86] as const;

const C0: V3 = [0.6, 4.6, 0];
const C1: V3 = [0, 1.75, 0];
const PH: V3 = [0, -3.4, 0];
const ARM_R = 1.95;
const BACT = '#94d82d';
const AB = '#4dabf7';
const FCR = '#ff922b';
const TLR = '#e599f7';
const ENZ = PALETTE.hydrolase;
const T = {
  descend: [0.15, 0.24],
  arms: [0.3, 0.46],
  close: 0.465,
  sink: [0.47, 0.55],
  lyso: [0.58, 0.64],
  enz: [0.62, 0.68],
  digest: [0.66, 0.84],
  tem: [0.71, 0.74],
} as const;

const LYSO: V3[] = [
  [-3.3, -2.1, 0.3],
  [3.1, -2.5, 0.4],
  [-2.4, -5.3, -0.3],
  [2.7, -5.6, 0],
  [-5.2, -4.0, 0.6],
  [5.0, -3.8, -0.4],
  [-6.0, -1.6, -0.8],
  [6.2, -1.7, -0.6],
];
const FUSE_TO: V3[] = [
  [-1.6, -2.6, 0.4],
  [1.6, -2.8, 0.4],
];
const rnd = (i: number, k: number) => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
const ENZ_IN: V3[] = Array.from({ length: 16 }, (_, i) => [PH[0] + (rnd(i, 1) - 0.5) * 2.4, PH[1] + (rnd(i, 2) - 0.5) * 2.0, (rnd(i, 3) - 0.5) * 1.6]);
const AB_ANG = Array.from({ length: 9 }, (_, i) => (i / 9) * Math.PI * 2 + 0.2);
const RECEPTORS_X = [-1.4, -0.7, 0, 0.7, 1.4];

function Arm({ c, side, prog, radius, mat, id, glow }: { c: V3; side: -1 | 1; prog: number; radius: number; mat: ReturnType<typeof proteinMaterial>; id: string | string[]; glow?: number }) {
  const buf = useMemo(() => new PathBuf(48), []);
  const v = useMemo(() => new Vector3(), []);
  const base = Math.asin(clamp(-c[1] / ARM_R, -1, 1));
  const a0 = side > 0 ? base : Math.PI - base;
  const a1 = lerp(a0, Math.PI / 2 + side * 0.04, prog);
  buf.clear();
  const n = 40;
  for (let i = 0; i < n; i++) {
    const a = lerp(a0, a1, i / (n - 1));
    buf.pushV(v.set(c[0] + Math.cos(a) * ARM_R, c[1] + Math.sin(a) * ARM_R, 0.25));
  }
  if (prog <= 0.02) return null;
  return <DynTube path={buf.a} n={n} cap={48} radius={radius} material={mat} id={id} glow={glow} />;
}

const CAM: CamKey[] = [
  { at: 0, pos: [0, 0.4, 16.5], target: [0, -1.2, 0], fov: 40 },
  { at: 0.12, pos: [0, 0.4, 16.2], target: [0, -1.2, 0], fov: 40 },
  { at: 0.17, pos: [0.6, 2.4, 8.8], target: [0, 1.6, 0], fov: 40 },
  { at: 0.27, pos: [0.6, 2.4, 8.6], target: [0, 1.5, 0], fov: 40 },
  { at: 0.31, pos: [0, 1.4, 11.0], target: [0, 1.0, 0], fov: 40 },
  { at: 0.46, pos: [0, 1.2, 10.6], target: [0, 0.8, 0], fov: 40 },
  { at: 0.5, pos: [0, -0.6, 12.0], target: [0, -1.4, 0], fov: 40 },
  { at: 0.56, pos: [0, -0.8, 11.6], target: [0, -1.8, 0], fov: 40 },
  { at: 0.6, pos: [0, -2.4, 10.0], target: [0, -3.4, 0], fov: 40 },
  { at: 0.84, pos: [0, -2.4, 9.6], target: [0, -3.4, 0], fov: 40 },
  { at: 0.89, pos: [0, 0.0, 16.5], target: [0, -1.4, 0], fov: 40 },
  { at: 1, pos: [0, 0.0, 16.8], target: [0, -1.4, 0], fov: 40 },
];

export default function PhagoScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const armMat = useDisposable(() => [proteinMaterial(PALETTE.plasmaMembrane, { roughness: 0.6 }), proteinMaterial('#ff6b6b', { roughness: 0.5, emissive: 0.2 })], []);
  const descend = smooth(seg(t, T.descend[0], T.descend[1]));
  const arms = smooth(seg(t, T.arms[0], T.arms[1]));
  const closed = t >= T.close;
  const sink = smooth(seg(t, T.sink[0], T.sink[1]));
  const lyso = smooth(seg(t, T.lyso[0], T.lyso[1]));
  const enz = smooth(seg(t, T.enz[0], T.enz[1]));
  const digest = smooth(seg(t, T.digest[0], T.digest[1]));
  const tem = t >= T.tem[0] && t < 0.86;
  const bind = vis(t, 0.2, 0.3, 0.015);

  const c = closed ? lerp3(C1, PH, sink) : lerp3(C0, C1, descend);
  const phagoO = closed ? 1 : 0;
  const lumen = lyso > 0.5 ? (tem ? '#5c3a1e' : '#ffc078') : '#e9fac8';
  const wallOff = 0.9 * digest;

  return (
    <group>
      <EdgeTag side="top" text="EXTRACELLULAR" />
      <EdgeTag side="bottom" text="PHAGOCYTE CYTOPLASM" />
      <MembraneSheet id={['phagocyte', 'phagocytic-receptor']} shape="plane" width={26} depth={10} position={[0, 0, -2]} color={PALETTE.plasmaMembrane} thickness={0.14} />
      <Anchor id="phagocyte" position={[-8.0, 0.1, 1.0]} />

      {/* lysosomes (many: phagocytes are rich in them); two fuse with the phagosome */}
      {LYSO.map((p, i) => {
        const fusing = i < 2;
        const pos = fusing ? lerp3(p, FUSE_TO[i], lyso) : p;
        const s = fusing ? 1 - 0.9 * smooth(seg(t, T.lyso[1] - 0.01, T.enz[1])) : 1;
        return <Vesicle key={i} id="lysosome" radius={0.7} position={pos} scale={s} color={tem ? '#1a1a1a' : PALETTE.lysosome} lumenColor={tem ? '#111111' : PALETTE.lysosome} cargo={{ count: 8, color: tem ? '#333333' : ENZ, seed: i }} opacity={fusing ? clamp(s * 1.4) : 1} />;
      })}
      <Anchor id="lysosome" position={[LYSO[3][0] + 0.5, LYSO[3][1] - 0.5, 0.6]} />

      {/* bacterium (wall separates during digestion) with antibodies */}
      <group position={c}>
        <group scale={1 - 0.45 * digest}>
          <Capsule id="bacterium" a={[-1.0, 0, 0]} b={[1.0, 0, 0]} r={0.62} color={BACT} opacity={1 - 0.6 * smooth(seg(t, 0.78, 0.86))} />
        </group>
        <group position={[0, wallOff * 0.4, 0]} scale={1 + 0.25 * digest}>
          <Capsule id="bacterium" a={[-1.02, 0, 0]} b={[1.02, 0, 0]} r={0.66} color="#d8f5a2" opacity={0.25 * vis(t, T.digest[0], 2, 0.02)} />
        </group>
        {AB_ANG.map((a, i) => (
          <Protein key={i} id="antibody" shape="y" color={AB} size={0.42} position={[Math.cos(a) * 1.25, Math.sin(a) * 0.95, 0.3]} rotation={[0, 0, a + Math.PI / 2]} opacity={1 - enz} glow={0.5 * bind} />
        ))}
        {closed && <Vesicle id={lyso > 0.5 ? ['phagolysosome', 'phagosome'] : 'phagosome'} radius={ARM_R + 0.12} color={PALETTE.plasmaMembrane} lumenColor={lumen} opacity={phagoO} />}
      </group>
      <Anchor id="bacterium" position={[c[0] + 0.7, c[1] + 0.35, 0.6]} />
      <Anchor id="antibody" position={[c[0] + Math.cos(AB_ANG[1]) * 1.25, c[1] + Math.sin(AB_ANG[1]) * 0.95, 0.4]} show={vis(t, 0.14, 0.44, 0.02)} />

      {/* receptors on the phagocyte: Fc / complement receptors and Toll-like receptors */}
      {RECEPTORS_X.map((x, i) => (
        <Protein key={i} id="phagocytic-receptor" shape="y" color={FCR} size={0.5} position={[x, 0.3, 0.3]} rotation={[0, 0, Math.PI]} glow={0.5 * bind} opacity={closed ? 1 - sink : 1} />
      ))}
      {[-2.4, 2.4].map((x, i) => (
        <Protein key={i} id="toll-like-receptor" shape="ring" color={TLR} size={0.55} seed={i} position={[x, 0.32, 0.3]} glow={0.4 * bind} opacity={closed ? 1 - sink : 1} />
      ))}
      <Anchor id="phagocytic-receptor" position={[RECEPTORS_X[4], 0.35, 0.4]} show={vis(t, 0.14, 0.44, 0.02)} />
      <Anchor id="toll-like-receptor" position={[-2.4, 0.35, 0.4]} show={vis(t, 0.14, 0.44, 0.02)} />

      {/* pseudopods with actin cores */}
      {!closed &&
        ([-1, 1] as const).map((s) => (
          <group key={s}>
            <Arm c={c} side={s} prog={arms} radius={0.36} mat={armMat[0]} id={['pseudopod', 'phagocyte']} />
            <Arm c={c} side={s} prog={arms * 0.97} radius={0.11} mat={armMat[1]} id="actin-filaments" glow={0.6 * vis(t, 0.28, 0.44, 0.015)} />
          </group>
        ))}
      <Anchor id="pseudopod" position={[c[0] + ARM_R * 0.95, c[1] + 0.4, 0.5]} show={vis(t, 0.31, T.close, 0.01)} />
      <Anchor id="actin-filaments" position={[c[0] - ARM_R * 0.95, c[1] + 0.2, 0.5]} show={vis(t, 0.31, T.close, 0.01)} />
      <Anchor id="phagosome" position={[c[0] - ARM_R * 0.75, c[1] + ARM_R * 0.6, 0.6]} show={closed ? vis(t, T.close, 0.62, 0.015) + vis(t, 0.86, 2, 0.02) : 0} />
      <Anchor id="phagolysosome" position={[c[0] + ARM_R * 0.75, c[1] - ARM_R * 0.55, 0.6]} show={vis(t, 0.64, 2, 0.02)} />

      {/* hydrolytic enzymes pour in from the lysosomes */}
      {ENZ_IN.map((p, i) => {
        const from = FUSE_TO[i % 2];
        const q = lerp3(from, p, enz);
        const o = vis(t, T.enz[0], 2, 0.015);
        return <Protein key={i} id="hydrolytic-enzyme" shape="blob" color={tem ? '#333333' : ENZ} size={0.2} seed={i} position={q} opacity={o} />;
      })}
      <Anchor id="hydrolytic-enzyme" position={ENZ_IN[3]} show={vis(t, T.enz[0] + 0.02, 0.86, 0.02)} />
      <Anchor id="phagocyte" text="Neutrophil / macrophage (TEM look)" position={[-7.0, -1.2, 0.8]} show={tem ? 1 : 0} />
    </group>
  );
}
