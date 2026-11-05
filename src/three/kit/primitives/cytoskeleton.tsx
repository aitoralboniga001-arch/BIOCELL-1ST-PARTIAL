import { useLayoutEffect, useMemo, useRef } from 'react';
import { BufferAttribute, CatmullRomCurve3, InstancedMesh, Object3D, SphereGeometry, TubeGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { V3 } from '@/engine/anim';
import { groupProps, useDisposable, type KitProps } from '../common';
import { curveFrom } from '../geom';
import { useKitHighlight } from '../hooks';
import { proteinMaterial } from '../materials';
import { PALETTE } from '../palette';

export interface FilamentProps extends KitProps {
  /** path (≥ 2 points) */
  points: V3[];
  radius?: number;
  color?: string;
}

/** Microtubule: thick hollow-looking tube with 13 protofilament ridges (#8ce99a). */
export function Microtubule(p: FilamentProps) {
  const r = p.radius ?? 0.14;
  const key = JSON.stringify(p.points);
  const geo = useDisposable(() => {
    const curve = curveFrom(p.points);
    const RAD = 52;
    const segs = Math.max(24, Math.round(curve.getLength() * 16));
    const g = new TubeGeometry(curve, segs, r, RAD, false);
    const pos = g.getAttribute('position') as BufferAttribute;
    const nrm = g.getAttribute('normal') as BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const j = i % (RAD + 1);
      const k = 0.08 * r * Math.cos((13 * 2 * Math.PI * j) / RAD);
      pos.setXYZ(i, pos.getX(i) + nrm.getX(i) * k, pos.getY(i) + nrm.getY(i) * k, pos.getZ(i) + nrm.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  }, [key, r]);
  const mats = useDisposable(() => [proteinMaterial(p.color ?? PALETTE.microtubule, { roughness: 0.45 })], [p.color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  return (
    <group {...groupProps(p)}>
      <mesh geometry={geo} material={mats[0]} />
    </group>
  );
}

/** Actin microfilament: two twisted strands of globular actin (#ff8787). */
export function Actin(p: FilamentProps) {
  const r = p.radius ?? 0.05;
  const key = JSON.stringify(p.points);
  const curve = useMemo(() => curveFrom(p.points), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const L = curve.getLength();
  const n = Math.max(4, Math.round(L / (r * 1.7)));
  const geo = useDisposable(() => new SphereGeometry(r, 10, 8), [r]);
  const mats = useDisposable(() => [proteinMaterial(p.color ?? PALETTE.actin)], [p.color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const frames = curve.computeFrenetFrames(n, false);
    const o = new Object3D();
    const pt = new Vector3();
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      curve.getPointAt(u, pt);
      const strand = i % 2;
      const a = (i / n) * L * 2.2 + strand * Math.PI;
      const nn = frames.normals[i];
      const bb = frames.binormals[i];
      o.position.copy(pt).addScaledVector(nn, Math.cos(a) * r * 0.9).addScaledVector(bb, Math.sin(a) * r * 0.9);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [curve, n, L, r]);
  return (
    <group {...groupProps(p)}>
      <instancedMesh ref={ref} args={[geo, mats[0], n]} key={n} />
    </group>
  );
}

/** Intermediate filament: a rope of four twisted strands (#ffd8a8). */
export function IntermediateFilament(p: FilamentProps) {
  const r = p.radius ?? 0.08;
  const key = JSON.stringify(p.points);
  const geo = useDisposable(() => {
    const curve = curveFrom(p.points);
    const L = curve.getLength();
    const N = Math.max(40, Math.round(L * 30));
    const frames = curve.computeFrenetFrames(N, false);
    const strands = [0, 1, 2, 3].map((s) => {
      const pts: Vector3[] = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const a = u * L * 3 + (s * Math.PI) / 2;
        pts.push(curve.getPointAt(u).addScaledVector(frames.normals[i], Math.cos(a) * r * 0.55).addScaledVector(frames.binormals[i], Math.sin(a) * r * 0.55));
      }
      const g = new TubeGeometry(new CatmullRomCurve3(pts), N, r * 0.42, 6, false);
      g.deleteAttribute('uv');
      return g;
    });
    const m = mergeGeometries(strands)!;
    strands.forEach((g) => g.dispose());
    return m;
  }, [key, r]);
  const mats = useDisposable(() => [proteinMaterial(p.color ?? PALETTE.intermediateFilament)], [p.color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  return (
    <group {...groupProps(p)}>
      <mesh geometry={geo} material={mats[0]} />
    </group>
  );
}
