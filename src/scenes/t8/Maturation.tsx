/**
 * t8-maturation — Movement across the stack: cisternal maturation + vesicle transport (organelle scale).
 *
 * World: stack axis +x (cis left → trans right), the ER sheet at x = −5.2. Cisternae are a conveyor: cisterna k sits
 * at stack position p = k + shift(t) (slot x = X0 + p·GAP). For p ∈ (−1, 0) it is being assembled from ER-derived
 * vesicles in front of the cis face; for p ∈ (4, 5) the TGN breaks up into secretory vesicles. A cisterna's colour
 * and enzymes follow its slot (cis → trans). Vesicles run between fixed slots: retrograde over the top (carrying
 * each slot's enzymes back), anterograde under the bottom.
 *
 *  0  ER-derived vesicles assemble a new cisterna at the cis face
 *  1  the cisternae move forward and mature
 *  2  their resident enzymes go backwards in retrograde vesicles
 *  3  vesicle transport model: vesicles bud at the rims, both directions
 *  4  why the shuttle is needed: enzymes stay put while membranes advance
 *  5  both models together
 */
import type { SceneProps } from '@/content/types';
import { clamp, lerp, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, EdgeTag, PALETTE, Protein, Vesicle, useStageCamera, type CamKey } from '@/three/kit';
import { Cisterna, STACK_ROT } from './parts/Cisterna';
import { STACK, X0, along, curve, loop } from './parts/stack';

export const P = [0, 0.17, 0.34, 0.52, 0.69, 0.86] as const;

const ER_X = -5.2;
const N = STACK.N;
const ENZ = ['#69db7c', '#38d9a9', '#4dabf7', '#9775fa', '#e599f7'];
const SEC = PALETTE.signalPeptide;
/** shift(t): how many slots the conveyor has advanced */
const SHIFT: [number, number, number, number][] = [
  [0.03, 0.15, 0, 1],
  [0.19, 0.32, 1, 3],
  [0.37, 0.5, 3, 4],
  [0.71, 0.84, 4, 5],
  [0.88, 0.99, 5, 6],
];
function shiftAt(t: number) {
  let s = 0;
  for (const [a, b, from, to] of SHIFT) if (t >= a) s = lerp(from, to, smooth(seg(t, a, b)));
  return s;
}
const slotX = (p: number) => X0 + p * STACK.GAP;
const radiusAt = (p: number) => {
  const q = clamp(p, 0, N - 1);
  const i = Math.min(N - 2, Math.floor(q));
  return lerp(STACK.R[i], STACK.R[i + 1], q - i);
};
const zone = (p: number) => Math.round(clamp(p, 0, N - 1));

const ENZ_Y = [-1.15, -0.45, 0.45, 1.15];
const TOP = 2.05;
const BOT = -2.05;
const RETRO = Array.from({ length: N - 1 }, (_, j) =>
  curve([
    [slotX(j + 1), TOP, 0.25],
    [slotX(j + 0.5), TOP + 0.55, 0.45],
    [slotX(j), TOP, 0.25],
  ]),
);
const ANTERO = Array.from({ length: N - 1 }, (_, j) =>
  curve([
    [slotX(j), BOT, 0.25],
    [slotX(j + 0.5), BOT - 0.55, 0.45],
    [slotX(j + 1), BOT, 0.25],
  ]),
);
/** ER-derived vesicles that build the new cisterna */
const ERGIC = [-1.1, -0.4, 0.3, 1.0, 0.0].map((y, k) =>
  curve([
    [ER_X + 0.45, y * 1.3, 0.3],
    [lerp(ER_X, slotX(-1), 0.5), y * 1.1 + 0.25 * Math.sin(k * 2), 0.6],
    [slotX(-1), y, 0.2],
  ]),
);

const CAM: CamKey[] = [
  { at: 0, pos: [-2.6, 1.0, 8.2], target: [-2.8, 0, 0], fov: 40 },
  { at: 0.15, pos: [-2.5, 1.0, 8.0], target: [-2.7, 0, 0], fov: 40 },
  { at: 0.2, pos: [-0.6, 1.6, 9.0], target: [-0.8, 0, 0], fov: 40 },
  { at: 0.33, pos: [-0.6, 1.6, 8.8], target: [-0.8, 0, 0], fov: 40 },
  { at: 0.38, pos: [1.2, 3.2, 6.2], target: [0, 1.3, 0], fov: 40 },
  { at: 0.5, pos: [1.1, 3.1, 6.0], target: [0, 1.3, 0], fov: 40 },
  { at: 0.55, pos: [2.2, 0.6, 7.0], target: [0.2, 0, 0], fov: 40 },
  { at: 0.67, pos: [2.1, 0.6, 6.8], target: [0.2, 0, 0], fov: 40 },
  { at: 0.72, pos: [0.9, 3.0, 6.6], target: [0, 1.1, 0], fov: 40 },
  { at: 0.84, pos: [0.9, 2.9, 6.4], target: [0, 1.1, 0], fov: 40 },
  { at: 0.89, pos: [-1.0, 1.4, 9.6], target: [-1.2, 0, 0], fov: 40 },
  { at: 1, pos: [-1.0, 1.4, 9.8], target: [-1.2, 0, 0], fov: 40 },
];

export default function MaturationScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const shift = shiftAt(t);
  const enzO = vis(t, 0.34, 2, 0.02);
  const retroOn = vis(t, 0.36, 2, 0.02);
  const anteroOn = vis(t, 0.53, 2, 0.02);
  const retroGlow = 0.5 * vis(t, 0.7, 0.86, 0.02);
  const clock = t * 16;

  const cis = [];
  let forming: number | null = null;
  for (let k = -8; k < N; k++) {
    const p = k + shift;
    if (p <= -1 || p >= N) continue;
    const f = p + 1; // 0..1 while forming
    const grow = p < 0 ? smooth(clamp((f - 0.35) / 0.65)) : 1;
    const fade = p > N - 1 ? 1 - smooth(p - (N - 1)) : 1;
    if (p < 0) forming = p;
    const z = zone(p);
    const ids = p < 0 ? ['new-cisterna', 'cisterna'] : z === 0 ? ['cgn', 'cisterna'] : z === N - 1 ? ['tgn', 'cisterna'] : ['cisterna'];
    const sc = (radiusAt(p) / 2) * Math.max(grow, 0.001);
    cis.push(
      <group key={k} position={[slotX(p), 0, 0]}>
        {grow > 0.01 && fade > 0.01 && (
          <group rotation={STACK_ROT} scale={sc}>
            <Cisterna R={2} seed={((k % 5) + 5) % 5 + 1} half fen={10} id={ids} color={STACK.COL[z]} opacity={Math.min(fade, 0.3 + 0.7 * grow)} />
          </group>
        )}
        {/* resident enzymes of the slot it is in (cut face) */}
        {p >= -0.2 &&
          ENZ_Y.map((y, j) => (
            <Protein key={j} id="resident-enzyme" shape="blob" color={ENZ[z]} size={0.17} seed={j + 3 * z} position={[0.02, y * (radiusAt(p) / 2), 0.06]} opacity={enzO * fade * clamp((p + 0.2) / 0.2)} glow={retroGlow * 0.6} />
          ))}
        {/* the TGN breaks up into secretory vesicles */}
        {p > N - 1 &&
          [0, 1, 2, 3].map((j) => {
            const g = p - (N - 1);
            const y = ENZ_Y[j] * 1.2;
            return <Vesicle key={j} radius={0.16} lumenColor={PALETTE.golgiLumen} cargo={{ count: 2, color: SEC, seed: j }} position={[0.3 + g * (1.2 + 0.25 * j), y, 0.2]} opacity={vis(g, 0.1, 0.95, 0.1)} />;
          })}
      </group>,
    );
  }
  const f = forming === null ? 0 : forming + 1;
  const ergicO = forming === null ? 0 : 1;

  return (
    <group>
      <EdgeTag side="left" text="← ER" />
      <EdgeTag side="right" text="trans → secretion" />

      <group position={[ER_X, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <Cisterna R={3.0} seed={9} fen={0} bend={0.04} color={PALETTE.erMembrane} lumenColor={PALETTE.erLumen} id="er" />
      </group>
      <Anchor id="er" position={[ER_X, -1.9, 0.3]} />

      {cis}
      {/* ER-derived vesicles converge and fuse into the new cis cisterna */}
      {ergicO > 0 &&
        ERGIC.map((c, k) => {
          const u = clamp(f * 1.7 - k * 0.12);
          if (u <= 0 || u >= 1) return null;
          const a = along(c, u, 0.08);
          return <Vesicle key={k} radius={0.22} coat="copii" coatAmount={1 - clamp((u - 0.55) / 0.25)} lumenColor={PALETTE.erLumen} position={a.pos} scale={a.s} id="new-cisterna" />;
        })}
      <Anchor id="new-cisterna" position={[slotX(forming ?? -1), -0.9, 0.2]} show={ergicO * clamp(f * 4)} />

      {/* retrograde: over the top, each carrying a slot's enzymes back one cisterna */}
      {retroOn > 0.01 &&
        RETRO.map((c, j) => {
          const u = loop(clock, j, N - 1);
          const a = along(c, u, 0.18);
          return <Vesicle key={j} radius={0.17} coat="copi" lumenColor={PALETTE.golgiLumen} cargo={{ count: 2, color: ENZ[j], seed: j }} position={a.pos} scale={a.s} opacity={retroOn} id="retrograde-vesicle" glow={retroGlow} />;
        })}
      <Anchor id="retrograde-vesicle" position={[slotX(1.5), TOP + 0.8, 0.4]} show={retroOn} />

      {/* anterograde: under the bottom */}
      {anteroOn > 0.01 &&
        ANTERO.map((c, j) => {
          const u = loop(clock + 0.5, j, N - 1);
          const a = along(c, u, 0.18);
          return <Vesicle key={j} radius={0.17} coat="copi" lumenColor={PALETTE.golgiLumen} cargo={{ count: 2, color: SEC, seed: j + 4 }} position={a.pos} scale={a.s} opacity={anteroOn} id="anterograde-vesicle" />;
        })}
      <Anchor id="anterograde-vesicle" position={[slotX(2.5), BOT - 0.8, 0.4]} show={anteroOn} />

      <Anchor id="cgn" position={[slotX(0), -1.75, 0.3]} />
      <Anchor id="tgn" position={[slotX(N - 1), -1.6, 0.3]} />
      <Anchor id="cisterna" position={[slotX(2), 0.9, 0.2]} />
      <Anchor id="resident-enzyme" position={[slotX(2), ENZ_Y[1] * (radiusAt(2) / 2), 0.15]} show={enzO} />
    </group>
  );
}
