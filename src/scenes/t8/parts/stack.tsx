/** Shared Golgi-stack layout + vesicle-along-a-path helpers for the t8 organelle-scale scenes. */
import { CatmullRomCurve3, Vector3 } from 'three';
import { clamp, type V3 } from '@/engine/anim';
import { PALETTE } from '@/three/kit';
import { Cisterna, STACK_ROT } from './Cisterna';

export const STACK = {
  N: 5,
  R: [1.8, 2.1, 2.25, 2.15, 1.95],
  COL: ['#f2b84b', '#eaae5e', PALETTE.golgiMembrane, '#d48f52', '#c9763a'],
  GAP: 0.42,
};
export const X0 = -((STACK.N - 1) * STACK.GAP) / 2;

export function GolgiStack({ half = true, offset = [0, 0, 0] as V3, opacity = 1, ids = (_i: number) => ['golgi'] as string[] }) {
  return (
    <group position={offset}>
      {STACK.R.map((r, i) => (
        <group key={i} position={[X0 + i * STACK.GAP, 0, 0]} rotation={STACK_ROT}>
          <Cisterna R={r} seed={i + 1} half={half} fen={10} id={ids(i)} color={STACK.COL[i]} opacity={opacity} />
        </group>
      ))}
    </group>
  );
}

export const curve = (pts: V3[]) => new CatmullRomCurve3(pts.map((p) => new Vector3(...p)), false, 'centripetal');
const _p = new Vector3();
/** Position along a curve at progress u (clamped) + a fade-in/out scale factor. */
export function along(c: CatmullRomCurve3, u: number, edge = 0.1): { pos: V3; s: number } {
  const k = clamp(u);
  c.getPointAt(k, _p);
  return { pos: [_p.x, _p.y, _p.z], s: clamp(Math.min(k / edge, (1 - k) / edge)) };
}
/** Looping progress for item i of n at clock c. */
export const loop = (c: number, i: number, n: number) => (((c + i / n) % 1) + 1) % 1;
