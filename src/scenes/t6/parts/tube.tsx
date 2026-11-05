/**
 * Dynamic tubes for Topic 6 (candidate for the kit): a tube whose centreline changes every frame
 * (DNA wrapping, loops being extruded, tails waving) without re-allocating geometry.
 *  - TubeBuilder: fixed-capacity BufferGeometry, rebuilt in place from a Float32Array path
 *    (parallel-transport frames → no twisting, smooth normals, rounded ends).
 *  - <DynTube>: React wrapper; the parent fills `path` (xyz floats) and `n` during render.
 *  - PathBuf: tiny helper to fill a path without allocations.
 */
import { useLayoutEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, DynamicDrawUsage, Material, Vector3 } from 'three';
import type { V3 } from '@/engine/anim';
import { useDisposable, useKitHighlight } from '@/three/kit';

const _t = new Vector3();
const _n = new Vector3();
const _b = new Vector3();
const _p = new Vector3();
const _q = new Vector3();
const _prevT = new Vector3();
const _tmp = new Vector3();

export class TubeBuilder {
  readonly cap: number;
  readonly radial: number;
  readonly endRings: number;
  geo: BufferGeometry;
  private pos: Float32Array;
  private nrm: Float32Array;
  constructor(cap: number, radial = 12, endRings = 4) {
    this.cap = cap;
    this.radial = radial;
    this.endRings = endRings;
    const rings = cap + endRings * 2;
    const verts = rings * radial;
    this.pos = new Float32Array(verts * 3);
    this.nrm = new Float32Array(verts * 3);
    const idx = new Uint32Array((rings - 1) * radial * 6);
    let k = 0;
    for (let i = 0; i < rings - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * radial + j;
        const b = i * radial + ((j + 1) % radial);
        const c = (i + 1) * radial + j;
        const d = (i + 1) * radial + ((j + 1) % radial);
        idx[k++] = a;
        idx[k++] = c;
        idx[k++] = b;
        idx[k++] = b;
        idx[k++] = c;
        idx[k++] = d;
      }
    }
    this.geo = new BufferGeometry();
    const pa = new BufferAttribute(this.pos, 3);
    pa.setUsage(DynamicDrawUsage);
    const na = new BufferAttribute(this.nrm, 3);
    na.setUsage(DynamicDrawUsage);
    this.geo.setAttribute('position', pa);
    this.geo.setAttribute('normal', na);
    this.geo.setIndex(new BufferAttribute(idx, 1));
    this.geo.setDrawRange(0, 0);
  }

  /**
   * Rebuild from `n` points (xyz in `path`). `radius` = constant or per-point array (length ≥ n).
   * Ends are rounded (hemispherical caps made of `endRings` shrinking rings).
   */
  update(path: Float32Array, n: number, radius: number | Float32Array) {
    n = Math.min(n, this.cap);
    if (n < 2) {
      this.geo.setDrawRange(0, 0);
      return;
    }
    const R = this.radial;
    const E = this.endRings;
    const pos = this.pos;
    const nrm = this.nrm;
    const rad = (i: number) => (typeof radius === 'number' ? radius : radius[i]);
    // initial normal: any vector ⟂ first tangent
    _t.set(path[3] - path[0], path[4] - path[1], path[5] - path[2]).normalize();
    if (Math.abs(_t.y) < 0.9) _n.set(0, 1, 0);
    else _n.set(1, 0, 0);
    _n.sub(_tmp.copy(_t).multiplyScalar(_n.dot(_t))).normalize();
    _prevT.copy(_t);
    let v = 0;
    const ring = (cx: number, cy: number, cz: number, r: number, nx: Vector3, bx: Vector3, tilt: number) => {
      // tilt: normal leans along tangent for the caps (cos/sin blend)
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);
      for (let j = 0; j < R; j++) {
        const a = (j / R) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const ox = nx.x * ca + bx.x * sa;
        const oy = nx.y * ca + bx.y * sa;
        const oz = nx.z * ca + bx.z * sa;
        pos[v * 3] = cx + ox * r;
        pos[v * 3 + 1] = cy + oy * r;
        pos[v * 3 + 2] = cz + oz * r;
        nrm[v * 3] = ox * ct + _t.x * st;
        nrm[v * 3 + 1] = oy * ct + _t.y * st;
        nrm[v * 3 + 2] = oz * ct + _t.z * st;
        v++;
      }
    };
    // start cap
    _b.crossVectors(_t, _n).normalize();
    const r0 = rad(0);
    for (let e = 0; e < E; e++) {
      const ang = (Math.PI / 2) * (1 - e / E); // 90° (tip) → small
      const off = -Math.sin(ang) * r0;
      ring(path[0] + _t.x * off, path[1] + _t.y * off, path[2] + _t.z * off, Math.max(1e-4, Math.cos(ang) * r0), _n, _b, -ang);
    }
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(n - 1, i + 1);
      _t.set(path[i1 * 3] - path[i0 * 3], path[i1 * 3 + 1] - path[i0 * 3 + 1], path[i1 * 3 + 2] - path[i0 * 3 + 2]);
      if (_t.lengthSq() < 1e-12) _t.copy(_prevT);
      else _t.normalize();
      // parallel transport the normal
      _n.sub(_tmp.copy(_t).multiplyScalar(_n.dot(_t)));
      if (_n.lengthSq() < 1e-10) _n.set(_t.y, -_t.x, 0);
      _n.normalize();
      _b.crossVectors(_t, _n).normalize();
      _prevT.copy(_t);
      ring(path[i * 3], path[i * 3 + 1], path[i * 3 + 2], rad(i), _n, _b, 0);
    }
    // end cap
    const rl = rad(n - 1);
    _p.set(path[(n - 1) * 3], path[(n - 1) * 3 + 1], path[(n - 1) * 3 + 2]);
    for (let e = 1; e <= E; e++) {
      const ang = (Math.PI / 2) * (e / E);
      const off = Math.sin(ang) * rl;
      _q.copy(_p).addScaledVector(_t, off);
      ring(_q.x, _q.y, _q.z, Math.max(1e-4, Math.cos(ang) * rl), _n, _b, ang);
    }
    const rings = n + E * 2;
    (this.geo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('normal') as BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, (rings - 1) * R * 6);
    this.geo.computeBoundingSphere();
  }

  dispose() {
    this.geo.dispose();
  }
}

/** Fixed-capacity xyz buffer you can refill every frame. */
export class PathBuf {
  readonly a: Float32Array;
  n = 0;
  constructor(readonly cap: number) {
    this.a = new Float32Array(cap * 3);
  }
  clear() {
    this.n = 0;
    return this;
  }
  push(x: number, y: number, z: number) {
    if (this.n >= this.cap) return this;
    const i = this.n++ * 3;
    this.a[i] = x;
    this.a[i + 1] = y;
    this.a[i + 2] = z;
    return this;
  }
  pushV(v: Vector3) {
    return this.push(v.x, v.y, v.z);
  }
  get(i: number, out: Vector3) {
    return out.set(this.a[i * 3], this.a[i * 3 + 1], this.a[i * 3 + 2]);
  }
  /** total polyline length */
  length() {
    let L = 0;
    for (let i = 1; i < this.n; i++) {
      const dx = this.a[i * 3] - this.a[i * 3 - 3];
      const dy = this.a[i * 3 + 1] - this.a[i * 3 - 2];
      const dz = this.a[i * 3 + 2] - this.a[i * 3 - 1];
      L += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return L;
  }
}

export interface DynTubeProps {
  path: Float32Array;
  n: number;
  radius: number | Float32Array;
  material: Material;
  cap: number;
  radial?: number;
  /** structure id(s) for glow; pass null when the material's highlight is driven elsewhere */
  id?: string | string[] | null;
  opacity?: number;
  glow?: number;
  strength?: number;
  renderOrder?: number;
  castShadow?: boolean;
}

/** A tube rebuilt in place whenever the parent re-renders (pure function of t). */
export function DynTube(p: DynTubeProps) {
  const tb = useDisposable(() => new TubeBuilder(p.cap, p.radial ?? 12), [p.cap, p.radial]);
  const mats = useMemo(() => (p.id === null ? [] : [p.material]), [p.material, p.id === null]); // eslint-disable-line react-hooks/exhaustive-deps
  useKitHighlight(mats, p.id === null ? undefined : p.id, { glow: p.glow, opacity: p.opacity, strength: p.strength });
  useLayoutEffect(() => {
    tb.update(p.path, p.n, p.radius);
  });
  return <mesh geometry={tb.geo} material={p.material} renderOrder={p.renderOrder} frustumCulled={false} visible={(p.opacity ?? 1) > 0.002 && p.n > 1} />;
}

/** Static smooth tube along V3 points (Catmull-Rom), built once. */
export function staticTubePath(points: V3[], samples: number, closed = false): Float32Array {
  const c = new CatmullRomCurve3(points.map((q) => new Vector3(...q)), closed, 'centripetal');
  const out = new Float32Array(samples * 3);
  for (let i = 0; i < samples; i++) {
    c.getPointAt(i / (samples - 1), _tmp);
    out[i * 3] = _tmp.x;
    out[i * 3 + 1] = _tmp.y;
    out[i * 3 + 2] = _tmp.z;
  }
  return out;
}

/** Build a static tube geometry (rounded ends) from a path. */
export function tubeGeometry(path: Float32Array, n: number, radius: number | Float32Array, radial = 10): BufferGeometry {
  const tb = new TubeBuilder(n, radial);
  tb.update(path, n, radius);
  return tb.geo;
}
