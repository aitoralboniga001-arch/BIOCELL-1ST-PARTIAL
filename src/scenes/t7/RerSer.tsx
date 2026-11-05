/**
 * t7-rer-ser — Rough and smooth ER (organelle scale).
 * Parallel ribosome-studded RER cisternae (left) whose far edge continues into twisted SER tubules (right);
 * the lumen is shared (particles flow from the cisternae into the tubules). Last step: two small cells
 * side by side — a protein-secreting cell (big RER) and a hepatocyte / adrenal cell (big SER).
 */
import { useMemo } from 'react';
import type { SceneProps } from '@/content/types';
import { vis, type V3 } from '@/engine/anim';
import { Anchor, Flow, PALETTE, useStageCamera, type CamKey } from '@/three/kit';
import { CellShell, Nucleus, RibosomeDots, Sac, Tubules, sacRibosomes, serNetwork } from './parts/cell';
import type { SacSpec } from './parts/geo';

export const P = [0, 0.17, 0.34, 0.52, 0.69, 0.86] as const;

const SHEETS: SacSpec[] = [0, 1, 2, 3].map((i) => ({ a: 3.2, b: 1.9, h: 0.16, n: 4, wave: 0.12, seed: i + 1 }));
const SHEET_Y = (i: number) => (i - 1.5) * 0.95;
const SER_PATHS: V3[][] = [
  ...[0, 1, 2, 3].map((i): V3[] => [
    [2.9, SHEET_Y(i), (i - 1.5) * 0.5],
    [3.8, SHEET_Y(i) + 0.3, (i - 1.5) * 0.9],
    [4.7, SHEET_Y(i) - 0.4 * ((i % 2) * 2 - 1), (i - 1.5) * 0.4 + 0.6],
    [5.6, SHEET_Y(i) * 0.6 + 0.2, (i - 1.5) * 1.1 - 0.3],
    [6.3, SHEET_Y(i) * 0.4 - 0.3, (i - 1.5) * 0.6 + 0.5],
  ]),
  ...serNetwork([5.0, 0, 0], [2.6, 2.4, 2.6], 5, 7, 6),
];
const FLOW: V3[] = [[-1.5, SHEET_Y(2), 0.2], [1.0, SHEET_Y(2), 0.2], [2.9, SHEET_Y(2), 0.25], [3.8, SHEET_Y(2) + 0.3, 0.45], [4.7, SHEET_Y(2) + 0.4, 0.8], [5.6, SHEET_Y(2) * 0.6 + 0.2, 0.25]];

const CELL_A: V3 = [-6, 0, -14];
const CELL_B: V3 = [6, 0, -14];

const CAM: CamKey[] = [
  { at: 0, pos: [1.5, 6.5, 13], target: [1.2, 0, 0], fov: 38 },
  { at: 0.16, pos: [0.5, 6.0, 12], target: [1.0, 0, 0], fov: 38 },
  { at: 0.2, pos: [-3.5, 3.2, 7.2], target: [-1.2, 0, 0.3], fov: 36 },
  { at: 0.5, pos: [-3.0, 3.0, 7.0], target: [-1.0, 0, 0.3], fov: 36 },
  { at: 0.55, pos: [6.5, 3.6, 7.8], target: [4.6, 0, 0], fov: 36 },
  { at: 0.67, pos: [6.8, 3.4, 7.6], target: [4.6, 0, 0], fov: 36 },
  { at: 0.72, pos: [3.0, 3.6, 8.0], target: [2.9, 0, 0], fov: 36 },
  { at: 0.84, pos: [3.2, 3.4, 7.8], target: [2.9, 0, 0], fov: 36 },
  { at: 0.9, pos: [0, 9, 9], target: [0, -0.5, -12], fov: 40 },
  { at: 1, pos: [0, 9.5, 8.5], target: [0, -0.5, -12], fov: 40 },
];

/** Small cell for the ratio comparison: big RER (secretory) or big SER (hepatocyte / adrenal). */
function MiniCell({ pos, kind, opacity }: { pos: V3; kind: 'rer' | 'ser'; opacity: number }) {
  const sheets = useMemo<SacSpec[]>(() => (kind === 'rer' ? [0, 1, 2, 3, 4] : [0]).map((i) => ({ a: 2.4, b: 1.4, h: 0.12, n: 4, wave: 0.1, seed: i + 9 })), [kind]);
  const ribs = useMemo(() => sheets.map((s, i) => sacRibosomes(s, 70, i + 20)), [sheets]);
  const tubes = useMemo(() => serNetwork([1.2, 0, 0], kind === 'ser' ? [4.5, 2.4, 3.5] : [1.4, 0.8, 1.2], kind === 'ser' ? 10 : 2, kind === 'ser' ? 3 : 5, 6), [kind]);
  return (
    <group position={pos}>
      <CellShell id="er" size={[5.2, 3.0, 4.2]} cutTheta={1.0} surfaceOpacity={0.18} opacity={opacity * 0.7} />
      <Nucleus position={[-2.6, -0.3, -0.6]} radius={1.1} pores={24} ribosomes={40} opacity={opacity} />
      {sheets.map((s, i) => (
        <group key={i} position={[-0.6, (i - (sheets.length - 1) / 2) * 0.5, 0.3]} scale={0.55}>
          <Sac spec={s} id="rer" opacity={opacity} />
          <RibosomeDots places={ribs[i]} size={0.08} id="rer" opacity={opacity} />
        </group>
      ))}
      <Tubules paths={tubes} radius={0.13} id="ser" opacity={opacity} />
      <Anchor id={kind} position={kind === 'rer' ? [-0.6, 0, 0.3] : [1.2, 0, 0]} show={opacity} />
    </group>
  );
}

export default function RerSerScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const ribs = useMemo(() => SHEETS.map((s, i) => sacRibosomes(s, 170, i + 1)), []);
  const lumenFlow = vis(t, P[2] + 0.01, P[3], 0.02) + vis(t, P[4] + 0.01, P[5], 0.02);
  const mini = vis(t, P[5] - 0.005, 1.1, 0.03);
  const main = 1 - 0.75 * mini;
  return (
    <group>
      {SHEETS.map((s, i) => (
        <group key={i} position={[-0.3, SHEET_Y(i), 0]}>
          <Sac spec={s} id="rer" opacity={main} />
          <RibosomeDots places={ribs[i]} size={0.065} id="ribosome" opacity={main} />
        </group>
      ))}
      <Tubules paths={SER_PATHS} radius={0.2} id="ser" flareStart opacity={main} />
      {lumenFlow > 0.01 && <Flow points={FLOW} t={t} speed={6} count={16} size={0.06} color="#7ff3e6" opacity={Math.min(1, lumenFlow) * main} glow={1} />}
      <Anchor id="rer" position={[-1.6, SHEET_Y(3), 0.6]} show={main} />
      <Anchor id="er" position={[2.9, SHEET_Y(1), 0.2]} show={main} />
      <Anchor id="er-lumen" position={[-2.2, SHEET_Y(1), -0.4]} show={main} />
      <Anchor id="ribosome" position={[-0.8, SHEET_Y(3) + 0.3, 1.1]} show={main} />
      <Anchor id="ser" position={[5.2, 0.2, 0.3]} show={main} />
      {mini > 0.01 && (
        <>
          <MiniCell pos={CELL_A} kind="rer" opacity={mini} />
          <MiniCell pos={CELL_B} kind="ser" opacity={mini} />
        </>
      )}
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0.01, 0.01, 0.01]} />
          <meshBasicMaterial color={PALETTE.erLumen} />
        </mesh>
      </group>
    </group>
  );
}
