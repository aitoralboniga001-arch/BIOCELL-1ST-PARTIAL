/**
 * Organelle-scale nucleus parts for Topic 6 (candidates for the kit's <Nucleus>):
 *  - <NucleusShell>: double nuclear envelope (ONM + INM) cut open towards +z (a cap removed at z > cutZ),
 *    lips at the cut showing the perinuclear space, instanced nuclear pores, optional lamina meshwork.
 *  - <LocalClipping>: enables renderer.localClippingEnabled while mounted (for clipped interior content).
 *  - cutPlane(): the clipping plane that keeps z ≤ cutZ.
 *  - randomWalk(), threadGeometry(): static chromatin threads (merged tubes).
 *  - fibPoints(): Fibonacci sphere points.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { BufferGeometry, CylinderGeometry, InstancedMesh, Matrix4, Object3D, Plane, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rand, type V3 } from '@/engine/anim';
import { lumpySphere, membraneMaterial, PALETTE, proteinMaterial, tintMaterial, useDisposable, useKitHighlight } from '@/three/kit';
import { staticTubePath, TubeBuilder } from './tube';

/** Turn local clipping on while the scene is mounted. */
export function LocalClipping() {
  const gl = useThree((s) => s.gl);
  useLayoutEffect(() => {
    const prev = gl.localClippingEnabled;
    gl.localClippingEnabled = true;
    return () => {
      gl.localClippingEnabled = prev;
    };
  }, [gl]);
  return null;
}

/** Plane keeping z ≤ cutZ (in world space; keep nucleus groups unrotated or pass a transformed plane). */
export const cutPlane = (cutZ: number) => new Plane(new Vector3(0, 0, -1), cutZ);

export function fibPoints(n: number, seed = 0): Vector3[] {
  const out: Vector3[] = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const a = ga * i + seed;
    out.push(new Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  return out;
}

const UP = new Vector3(0, 1, 0);

// ———————————————————————————————————————— pores ————————————————————————————————————————

let poreGeo: BufferGeometry | null = null;
/** Pore complex at organelle scale (axis y, radius 1): ring + 8 cytoplasmic and 8 nuclear subunits + central plug. */
export function poreLiteGeometry(): BufferGeometry {
  if (poreGeo) return poreGeo;
  const parts: BufferGeometry[] = [];
  parts.push(new TorusGeometry(1, 0.34, 14, 40).rotateX(Math.PI / 2));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    for (const y of [0.32, -0.32]) {
      const k = lumpySphere({ detail: 3, scale: [0.3, 0.24, 0.3], noise: 0.06, seed: 7 + i }).translate(Math.cos(a) * 1.02, y, Math.sin(a) * 1.02);
      parts.push(k);
    }
  }
  parts.push(lumpySphere({ detail: 4, scale: [0.42, 0.3, 0.42], noise: 0.08, seed: 3 }));
  const clean = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    return n;
  });
  poreGeo = mergeGeometries(clean)!;
  return poreGeo;
}

export interface PoresProps {
  /** pore centres (on the envelope) and outward normals */
  points: Vector3[];
  normals?: Vector3[];
  size: number;
  id?: string | string[];
  opacity?: number;
  glow?: number;
}

/** Instanced organelle-scale nuclear pores. */
export function Pores(p: PoresProps) {
  const geo = poreLiteGeometry();
  const mat = useDisposable(() => proteinMaterial(PALETTE.nuclearPore, { roughness: 0.5 }), []);
  const mats = useMemo(() => [mat], [mat]);
  useKitHighlight(mats, p.id, { opacity: p.opacity, glow: p.glow, strength: 0.6 });
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    const o = new Object3D();
    p.points.forEach((pt, i) => {
      o.position.copy(pt);
      o.quaternion.setFromUnitVectors(UP, (p.normals?.[i] ?? pt.clone().normalize()).clone().normalize());
      o.scale.setScalar(p.size);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
    });
    im.count = p.points.length;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }, [p.points, p.normals, p.size]);
  return <instancedMesh ref={ref} args={[geo, mat, Math.max(1, p.points.length)]} visible={(p.opacity ?? 1) > 0.002} />;
}

// ———————————————————————————————————————— lamina meshwork ————————————————————————————————————————

export interface LaminaProps {
  radius: number;
  /** keep z ≤ cutZ */
  cutZ?: number;
  n?: number;
  thickness?: number;
  id?: string | string[];
  opacity?: number;
  glow?: number;
  color?: string;
}

/** Fibrous lamina: a quasi-regular meshwork of lamin filaments just under the INM. */
export function Lamina(p: LaminaProps) {
  const n = p.n ?? 700;
  const cutZ = p.cutZ ?? Infinity;
  const segs = useMemo(() => {
    const pts = fibPoints(n, 0.3).map((v, i) => v.multiplyScalar(p.radius * (1 + (rand(i * 3.3) - 0.5) * 0.012)));
    const out: [Vector3, Vector3][] = [];
    const seen = new Set<string>();
    for (let i = 0; i < pts.length; i++) {
      // 3 nearest neighbours
      const d = pts.map((q, j) => ({ j, d: j === i ? Infinity : q.distanceToSquared(pts[i]) })).sort((a, b) => a.d - b.d);
      for (let k = 0; k < 3; k++) {
        const j = d[k].j;
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (pts[i].z > cutZ - 0.02 || pts[j].z > cutZ - 0.02) continue;
        out.push([pts[i], pts[j]]);
      }
    }
    return out;
  }, [n, p.radius, cutZ]);
  const geo = useDisposable(() => new CylinderGeometry(1, 1, 1, 6, 1), []);
  const mat = useDisposable(() => proteinMaterial(p.color ?? PALETTE.lamina, { roughness: 0.6 }), [p.color]);
  const mats = useMemo(() => [mat], [mat]);
  useKitHighlight(mats, p.id, { opacity: p.opacity, glow: p.glow, strength: 0.7 });
  const ref = useRef<InstancedMesh>(null);
  const th = p.thickness ?? p.radius * 0.006;
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const d = new Vector3();
    const mid = new Vector3();
    const s = new Vector3();
    segs.forEach(([a, b], i) => {
      d.subVectors(b, a);
      const L = d.length();
      q.setFromUnitVectors(UP, d.divideScalar(L));
      mid.addVectors(a, b).multiplyScalar(0.5);
      s.set(th, L * 1.04, th);
      im.setMatrixAt(i, m.compose(mid, q, s));
    });
    im.count = segs.length;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }, [segs, th]);
  return <instancedMesh ref={ref} args={[geo, mat, Math.max(1, segs.length)]} visible={(p.opacity ?? 1) > 0.002} />;
}

// ———————————————————————————————————————— envelope ————————————————————————————————————————

export interface NucleusShellProps {
  radius: number;
  /** perinuclear gap (ONM–INM distance) */
  gap?: number;
  /** cap removed for z > cutZ (undefined = closed) */
  cutZ?: number;
  pores?: number;
  poreSize?: number;
  lamina?: number;
  laminaN?: number;
  opacity?: number;
  /** membrane surface opacity */
  surface?: number;
  onmId?: string | string[];
  inmId?: string | string[];
  poreId?: string | string[];
  laminaId?: string | string[];
  /** extra id(s) the whole envelope glows for (e.g. 'nucleus') */
  envelopeId?: string;
}

/** Double nuclear envelope (ONM + INM) optionally cut open towards the camera (+z). */
export function NucleusShell(p: NucleusShellProps) {
  const R = p.radius;
  const gap = p.gap ?? R * 0.035;
  const Ri = R - gap;
  const cutZ = p.cutZ;
  const op = p.opacity ?? 1;
  const theta = cutZ === undefined ? 0 : Math.acos(Math.max(-1, Math.min(1, cutZ / R)));
  const thetaI = cutZ === undefined ? 0 : Math.acos(Math.max(-1, Math.min(1, cutZ / Ri)));
  const geos = useDisposable(() => {
    // pole along +z: build around +y then rotate x by +90° (y → z)
    const o = new SphereGeometry(R, 96, 64, 0, Math.PI * 2, theta, Math.PI - theta).rotateX(Math.PI / 2);
    const i = new SphereGeometry(Ri, 96, 64, 0, Math.PI * 2, thetaI, Math.PI - thetaI).rotateX(Math.PI / 2);
    const lumen = new SphereGeometry(R - gap / 2, 72, 48, 0, Math.PI * 2, (theta + thetaI) / 2, Math.PI - (theta + thetaI) / 2).rotateX(Math.PI / 2);
    const lipO = new TorusGeometry(R * Math.sin(theta), gap * 0.22, 10, 128);
    const lipI = new TorusGeometry(Ri * Math.sin(thetaI), gap * 0.22, 10, 128);
    return [o, i, lumen, lipO, lipI];
  }, [R, Ri, theta, thetaI, gap]);
  const mats = useDisposable(
    () => [
      membraneMaterial(PALETTE.nuclearEnvelope, p.surface ?? 0.5),
      membraneMaterial('#d9b38c', (p.surface ?? 0.5) * 0.8),
      tintMaterial(PALETTE.erLumen, 0.35),
      membraneMaterial(PALETTE.nuclearEnvelope, 0.95),
      membraneMaterial('#d9b38c', 0.95),
    ],
    [p.surface],
  );
  const onm = useMemo(() => [mats[0], mats[3]], [mats]);
  const inm = useMemo(() => [mats[1], mats[4]], [mats]);
  const lum = useMemo(() => [mats[2]], [mats]);
  const env = p.envelopeId ? [p.envelopeId] : [];
  useKitHighlight(onm, [...asArr(p.onmId), ...env], { opacity: op, strength: 0.45 });
  useKitHighlight(inm, [...asArr(p.inmId), ...env], { opacity: op, strength: 0.45 });
  useKitHighlight(lum, env.length ? env : undefined, { opacity: op });
  const pts = useMemo(() => {
    const n = p.pores ?? 0;
    const pts: Vector3[] = [];
    fibPoints(n, 1.1).forEach((v, i) => {
      const q = v.clone().multiplyScalar(R - gap / 2);
      if (cutZ !== undefined && q.z > cutZ - (p.poreSize ?? R * 0.04) * 1.6) return;
      if (rand(i * 7.7) < 0.12) return;
      pts.push(q);
    });
    return pts;
  }, [p.pores, R, gap, cutZ, p.poreSize]);
  const lipZo = cutZ ?? 0;
  return (
    <group visible={op > 0.002}>
      <mesh geometry={geos[2]} material={mats[2]} renderOrder={1} />
      <mesh geometry={geos[1]} material={mats[1]} renderOrder={2} />
      <mesh geometry={geos[0]} material={mats[0]} renderOrder={3} />
      {cutZ !== undefined && (
        <>
          <mesh geometry={geos[3]} material={mats[3]} position={[0, 0, R * Math.cos(theta)]} />
          <mesh geometry={geos[4]} material={mats[4]} position={[0, 0, Ri * Math.cos(thetaI)]} />
          <CutRim inner={Ri * Math.sin(thetaI)} outer={R * Math.sin(theta)} z={lipZo} opacity={op} />
        </>
      )}
      {(p.pores ?? 0) > 0 && <Pores points={pts} size={p.poreSize ?? R * 0.04} id={p.poreId} opacity={op} />}
      {(p.lamina ?? 0) > 0.002 && <Lamina radius={Ri - gap * 0.45} cutZ={cutZ} n={p.laminaN} id={p.laminaId} opacity={op * (p.lamina ?? 0)} thickness={gap * 0.16} />}
    </group>
  );
}

function CutRim({ inner, outer, z, opacity }: { inner: number; outer: number; z: number; opacity: number }) {
  const geo = useDisposable(() => {
    const g = new TorusGeometry((inner + outer) / 2, Math.max(0.001, (outer - inner) / 2) * 0.7, 8, 128);
    g.scale(1, 1, 0.25);
    return g;
  }, [inner, outer]);
  const mat = useDisposable(() => tintMaterial(PALETTE.erLumen, 0.55), []);
  mat.opacity = 0.55 * opacity;
  return <mesh geometry={geo} material={mat} position={[0, 0, z]} />;
}

const asArr = (id: string | string[] | undefined) => (id === undefined ? [] : Array.isArray(id) ? id : [id]);

// ———————————————————————————————————————— chromatin threads ————————————————————————————————————————

/**
 * Smooth random walk confined to a sphere (centre c, radius r): control points every `step`.
 * Deterministic from `seed`. `bias` pulls the walk toward a direction (e.g. outward for peripheral threads).
 */
export function randomWalk(seed: number, n: number, c: V3, r: number, step: number, start?: V3): V3[] {
  const pts: V3[] = [];
  let x = start ? start[0] : c[0] + (rand(seed * 3.1) - 0.5) * r;
  let y = start ? start[1] : c[1] + (rand(seed * 5.3) - 0.5) * r;
  let z = start ? start[2] : c[2] + (rand(seed * 7.9) - 0.5) * r;
  let dx = rand(seed * 11.1) - 0.5;
  let dy = rand(seed * 13.7) - 0.5;
  let dz = rand(seed * 17.3) - 0.5;
  for (let i = 0; i < n; i++) {
    pts.push([x, y, z]);
    dx += (rand(seed * 19 + i * 1.3) - 0.5) * 1.1;
    dy += (rand(seed * 23 + i * 1.7) - 0.5) * 1.1;
    dz += (rand(seed * 29 + i * 2.1) - 0.5) * 1.1;
    // pull back inside
    const ox = x - c[0];
    const oy = y - c[1];
    const oz = z - c[2];
    const d = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (d > r * 0.75) {
      const k = ((d - r * 0.75) / (r * 0.25)) * 1.4;
      dx -= (ox / d) * k;
      dy -= (oy / d) * k;
      dz -= (oz / d) * k;
    }
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= L;
    dy /= L;
    dz /= L;
    x += dx * step;
    y += dy * step;
    z += dz * step;
  }
  return pts;
}

/** Merge many static threads (each a list of control points) into one tube geometry. */
export function threadGeometry(paths: V3[][], radius: number, samplesPer = 8, radial = 8): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const pts of paths) {
    if (pts.length < 2) continue;
    const n = Math.max(4, (pts.length - 1) * samplesPer);
    const path = staticTubePath(pts, n);
    const tb = new TubeBuilder(n, radial, 3);
    tb.update(path, n, radius);
    const g = tb.geo;
    const idx = g.getIndex()!;
    const count = g.drawRange.count;
    const out = new BufferGeometry();
    out.setAttribute('position', g.getAttribute('position').clone());
    out.setAttribute('normal', g.getAttribute('normal').clone());
    out.setIndex(Array.from((idx.array as Uint32Array).slice(0, count)));
    parts.push(out);
    tb.dispose();
  }
  const m = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  m.computeBoundingSphere();
  return m;
}
