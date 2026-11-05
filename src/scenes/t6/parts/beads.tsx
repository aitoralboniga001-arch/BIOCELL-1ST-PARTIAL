/** Instanced spheres at moving positions (lysines, chemical marks…). Positions are read every render. */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, Object3D, SphereGeometry, Vector3 } from 'three';
import { proteinMaterial, useDisposable, useKitHighlight } from '@/three/kit';

export interface BeadsProps {
  points: Vector3[];
  /** per-bead scale (0 hides); default 1 */
  scales?: ArrayLike<number>;
  count?: number;
  radius: number;
  color: string;
  id?: string | string[];
  opacity?: number;
  glow?: number;
  emissive?: number;
}

const _o = new Object3D();

export function Beads(p: BeadsProps) {
  const geo = useDisposable(() => new SphereGeometry(1, 20, 14), []);
  const mat = useDisposable(() => proteinMaterial(p.color, { roughness: 0.38, emissive: p.emissive ?? 0.12 }), [p.color, p.emissive]);
  const mats = useMemo(() => [mat], [mat]);
  useKitHighlight(mats, p.id, { opacity: p.opacity, glow: p.glow, strength: 0.7 });
  const ref = useRef<InstancedMesh>(null);
  const cap = p.points.length;
  const n = Math.min(cap, p.count ?? cap);
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    for (let i = 0; i < n; i++) {
      _o.position.copy(p.points[i]);
      _o.scale.setScalar(p.radius * (p.scales ? p.scales[i] : 1));
      _o.updateMatrix();
      im.setMatrixAt(i, _o.matrix);
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  });
  return <instancedMesh ref={ref} args={[geo, mat, Math.max(1, cap)]} frustumCulled={false} visible={(p.opacity ?? 1) > 0.002 && n > 0} />;
}
