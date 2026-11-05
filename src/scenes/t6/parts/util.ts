import { useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { clamp, easeInOut, lerp, type V3 } from '@/engine/anim';

/**
 * A value that follows `target` smoothly when the target JUMPS (step buttons / scrubbing), but tracks it
 * exactly while it changes continuously (playback). Snaps on mount (deterministic screenshots).
 * `log` = interpolate in log space (zoom factors).
 */
export function useFollow(target: number, opts: { log?: boolean; dur?: number; jump?: number } = {}): number {
  const dur = opts.dur ?? 1.1;
  const jump = opts.jump ?? 0.08;
  const toS = (v: number) => (opts.log ? Math.log(v) : v);
  const fromS = (v: number) => (opts.log ? Math.exp(v) : v);
  const st = useRef<{ cur: number; from: number; to: number; k: number; last: number } | null>(null);
  const [, force] = useState(0);
  const invalidate = useThree((s) => s.invalidate);
  const T = toS(target);
  if (!st.current) st.current = { cur: T, from: T, to: T, k: 1, last: T };
  const s = st.current;
  if (T !== s.last) {
    const big = Math.abs(T - s.last) > jump * (opts.log ? 1 : Math.max(1, Math.abs(s.last)));
    if (big) {
      s.from = s.cur;
      s.k = 0;
    } else if (s.k >= 1) s.cur = T;
    s.to = T;
    s.last = T;
  }
  if (s.k >= 1) s.cur = T;
  useFrame((_, dt) => {
    if (s.k >= 1) return;
    s.k = Math.min(1, s.k + Math.min(dt, 0.05) / dur);
    s.cur = lerp(s.from, s.to, easeInOut(s.k));
    force((x) => x + 1);
    invalidate();
  });
  return fromS(s.k >= 1 ? T : s.cur);
}

/** Piecewise keyframes of numbers: [[t, v], …] sorted; eased between keys. */
export function keyed(t: number, keys: [number, number][], ease = easeInOut): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      return lerp(v0, v1, ease(clamp((t - t0) / (t1 - t0 || 1))));
    }
  }
  return keys[keys.length - 1][1];
}

/** Keyed in log space (for zoom factors). */
export function keyedLog(t: number, keys: [number, number][], ease = easeInOut): number {
  return Math.exp(keyed(t, keys.map(([a, b]) => [a, Math.log(b)] as [number, number]), ease));
}

/** Keyed V3. */
export function keyed3(t: number, keys: [number, V3][], out: V3 = [0, 0, 0], ease = easeInOut): V3 {
  for (let c = 0; c < 3; c++) out[c] = keyed(t, keys.map(([a, v]) => [a, v[c]] as [number, number]), ease);
  return out;
}

export const v3 = (v: Vector3): V3 => [v.x, v.y, v.z];
