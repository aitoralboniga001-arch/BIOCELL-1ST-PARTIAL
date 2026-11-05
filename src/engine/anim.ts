/** Pure animation helpers. Scenes are functions of stage time t ∈ [0,1]; use these to choreograph. */

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const smooth = (k: number) => k * k * (3 - 2 * k);
export const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/** 0 before a, 1 after b, eased in between. */
export function seg(t: number, a: number, b: number): number {
  if (b <= a) return t >= a ? 1 : 0;
  return smooth(clamp((t - a) / (b - a)));
}

/** Visible window: fades in over `fade` after `from`, out over `fade` before `to`. */
export function vis(t: number, from: number, to: number, fade = 0.02): number {
  return Math.min(seg(t, from, from + fade), 1 - seg(t, to - fade, to));
}

/** Linear 0..1 progress inside [a,b] (no easing) — for things moving along a path at constant speed. */
export const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

export type V3 = [number, number, number];
export const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

/** Index of the step active at t, given sorted step starts. */
export function stepAt(starts: number[], t: number): number {
  let i = 0;
  for (let j = 0; j < starts.length; j++) if (t >= starts[j] - 1e-9) i = j;
  return i;
}

/** Deterministic pseudo-random in [0,1) from an integer seed (stable layouts, no Math.random in scenes). */
export function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
