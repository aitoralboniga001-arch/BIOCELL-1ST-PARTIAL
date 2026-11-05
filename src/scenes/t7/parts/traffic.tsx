/**
 * Vesicle traffic helpers: a vesicle that buds at the start of a route, travels, and fuses at its end.
 * Pure functions of a progress u ∈ [0,1] the scene computes from t (one-shot window or a loop).
 */
import { useMemo } from 'react';
import { Vector3 } from 'three';
import { clamp, smooth, type V3 } from '@/engine/anim';
import { Vesicle, curveFrom, type KitProps } from '@/three/kit';

/** Loop progress: the route repeats `rate` times per unit of t (always in the same direction). */
export const loopU = (t: number, rate: number, phase = 0) => {
  const x = t * rate + phase;
  return x - Math.floor(x);
};

/** Bud (grow in the first 15%), travel, fuse (shrink into the target in the last 15%). */
export const budFuseScale = (u: number) => Math.min(smooth(clamp(u / 0.15)), smooth(clamp((1 - u) / 0.15)));

const _p = new Vector3();

export interface RouteVesicleProps extends KitProps {
  points: V3[];
  /** 0..1 along the route (< 0 or > 1 hides it) */
  u: number;
  radius?: number;
  cargo?: string;
  cargoCount?: number;
  lumenColor?: string;
  color?: string;
  /** keep full size at the ends (no bud / fuse scaling) */
  noScale?: boolean;
}

/** One transport vesicle on a route. */
export function RouteVesicle(p: RouteVesicleProps) {
  const key = JSON.stringify(p.points);
  const curve = useMemo(() => curveFrom(p.points), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (p.u < 0 || p.u > 1) return null;
  curve.getPointAt(clamp(p.u), _p);
  const s = p.noScale ? 1 : budFuseScale(p.u);
  if (s < 0.01) return null;
  return (
    <group position={[_p.x, _p.y, _p.z]} scale={s}>
      <Vesicle
        radius={p.radius ?? 0.22}
        id={p.id}
        glow={p.glow}
        opacity={p.opacity}
        color={p.color}
        lumenColor={p.lumenColor}
        cargo={p.cargo ? { count: p.cargoCount ?? 5, color: p.cargo } : undefined}
      />
    </group>
  );
}

/** Position along a route (for anchors that follow a vesicle). */
const curveCache = new WeakMap<V3[], ReturnType<typeof curveFrom>>();
export function routePoint(points: V3[], u: number): V3 {
  let c = curveCache.get(points);
  if (!c) {
    c = curveFrom(points);
    curveCache.set(points, c);
  }
  c.getPointAt(clamp(u), _p);
  return [_p.x, _p.y, _p.z];
}
