/** Geometry helpers shared by the primitives (all deterministic; build once, memoise). */
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, IcosahedronGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { V3 } from '@/engine/anim';

/** Smooth deterministic 3D noise in ≈[-1,1] (sum of rotated sines; cheap, seamless, no tables). */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const s = seed * 1.618;
  return (
    0.5 * Math.sin(x * 1.7 + y * 0.9 + s) * Math.cos(z * 1.3 - y * 0.5 + s * 0.7) +
    0.3 * Math.sin(y * 2.9 - z * 1.7 + x * 0.4 + s * 1.3) +
    0.2 * Math.sin(z * 4.3 + x * 3.1 - s * 0.4) * Math.cos(y * 3.7 + s)
  );
}

export interface Bump {
  /** direction (normalised internally) on the unit sphere */
  dir: V3;
  /** radial gain (e.g. 0.3 = +30% radius at the centre; negative = dimple) */
  amp: number;
  /** angular width in radians */
  width: number;
}

export interface LumpyOpts {
  detail?: number;
  scale?: V3;
  bumps?: Bump[];
  /** amplitude of the surface noise (fraction of radius) */
  noise?: number;
  /** spatial frequency of the noise */
  freq?: number;
  seed?: number;
  /** flatten below this y (unit sphere coordinates), e.g. for a flat face */
  flattenY?: { above?: number; below?: number; k?: number };
}

/**
 * A smooth "molecular" blob: icosphere (welded, so no seams) displaced radially by gaussian bumps and
 * low-frequency noise, then scaled. Normals are recomputed (smooth shading).
 */
export function lumpySphere(o: LumpyOpts = {}): BufferGeometry {
  const g0 = new IcosahedronGeometry(1, o.detail ?? 10);
  g0.deleteAttribute('normal');
  g0.deleteAttribute('uv');
  const g = mergeVertices(g0);
  g0.dispose();
  const pos = g.getAttribute('position') as BufferAttribute;
  const v = new Vector3();
  const bumps = (o.bumps ?? []).map((b) => ({ ...b, d: new Vector3(...b.dir).normalize() }));
  const [sx, sy, sz] = o.scale ?? [1, 1, 1];
  const noise = o.noise ?? 0.04;
  const freq = o.freq ?? 2.2;
  const seed = o.seed ?? 1;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let r = 1;
    for (const b of bumps) {
      const ang = Math.acos(Math.min(1, Math.max(-1, v.dot(b.d))));
      r += b.amp * Math.exp(-(ang * ang) / (b.width * b.width));
    }
    r += noise * noise3(v.x * freq, v.y * freq, v.z * freq, seed);
    let x = v.x * r * sx;
    let y = v.y * r * sy;
    let z = v.z * r * sz;
    if (o.flattenY) {
      const k = o.flattenY.k ?? 0.85;
      if (o.flattenY.above !== undefined && y > o.flattenY.above) y = o.flattenY.above + (y - o.flattenY.above) * (1 - k);
      if (o.flattenY.below !== undefined && y < o.flattenY.below) y = o.flattenY.below + (y - o.flattenY.below) * (1 - k);
    }
    pos.setXYZ(i, x, y, z);
    x = y = z = 0;
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Evenly spread points on a unit sphere (Fibonacci lattice). */
export function fibonacciSphere(n: number): Vector3[] {
  const out: Vector3[] = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    out.push(new Vector3(Math.cos(ga * i) * r, y, Math.sin(ga * i) * r));
  }
  return out;
}

const UP = new Vector3(0, 1, 0);
const _q = new Quaternion();
const _d = new Vector3();
const _s = new Vector3();
const _m = new Vector3();

/**
 * Matrix placing a unit Y-axis primitive (height 1, centred) between a and b with thickness `r`
 * (scale x/z = r). Writes into `out`.
 */
export function segmentMatrix(a: Vector3, b: Vector3, r: number, out: Matrix4): Matrix4 {
  _d.subVectors(b, a);
  const len = _d.length();
  if (len < 1e-6) return out.makeScale(0, 0, 0);
  _q.setFromUnitVectors(UP, _d.divideScalar(len));
  _m.addVectors(a, b).multiplyScalar(0.5);
  _s.set(r, len, r);
  return out.compose(_m, _q, _s);
}

/** CatmullRom curve from V3 points (centripetal, no overshoot). */
export function curveFrom(points: V3[], closed = false): CatmullRomCurve3 {
  return new CatmullRomCurve3(points.map((p) => new Vector3(...p)), closed, 'centripetal');
}

/**
 * A polyline you can rebuild every frame without allocating (fixed capacity), then sample by arc length.
 * Used for chains whose path changes with t (e.g. a polypeptide threading a translocon).
 */
export class Polyline {
  readonly cap: number;
  n = 0;
  private xyz: Float32Array;
  private acc: Float32Array;
  length = 0;
  constructor(cap = 256) {
    this.cap = cap;
    this.xyz = new Float32Array(cap * 3);
    this.acc = new Float32Array(cap);
  }
  clear() {
    this.n = 0;
    this.length = 0;
    return this;
  }
  push(x: number, y: number, z: number) {
    if (this.n >= this.cap) return this;
    const i = this.n++;
    this.xyz[i * 3] = x;
    this.xyz[i * 3 + 1] = y;
    this.xyz[i * 3 + 2] = z;
    if (i === 0) this.acc[0] = 0;
    else {
      const dx = x - this.xyz[i * 3 - 3];
      const dy = y - this.xyz[i * 3 - 2];
      const dz = z - this.xyz[i * 3 - 1];
      this.acc[i] = this.acc[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    this.length = this.acc[i];
    return this;
  }
  pushV(v: Vector3) {
    return this.push(v.x, v.y, v.z);
  }
  /** Point at arc distance d (clamped; beyond the end it extrapolates along the last segment). */
  at(d: number, out: Vector3): Vector3 {
    const n = this.n;
    if (n === 0) return out.set(0, 0, 0);
    if (n === 1 || d <= 0) {
      if (n > 1 && d < 0) {
        // extrapolate backwards along the first segment
        const l = this.acc[1] || 1;
        const k = d / l;
        return out.set(this.xyz[0] + (this.xyz[3] - this.xyz[0]) * k, this.xyz[1] + (this.xyz[4] - this.xyz[1]) * k, this.xyz[2] + (this.xyz[5] - this.xyz[2]) * k);
      }
      return out.set(this.xyz[0], this.xyz[1], this.xyz[2]);
    }
    let lo = 0;
    let hi = n - 1;
    if (d >= this.acc[hi]) {
      lo = n - 2;
    } else {
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (this.acc[mid] <= d) lo = mid;
        else hi = mid;
      }
    }
    const seg = this.acc[lo + 1] - this.acc[lo] || 1;
    const k = (d - this.acc[lo]) / seg;
    const a = lo * 3;
    const b = a + 3;
    return out.set(this.xyz[a] + (this.xyz[b] - this.xyz[a]) * k, this.xyz[a + 1] + (this.xyz[b + 1] - this.xyz[a + 1]) * k, this.xyz[a + 2] + (this.xyz[b + 2] - this.xyz[a + 2]) * k);
  }
}

/** Build a lathe-like ring of `n` points around Y. */
export function ringPoints(n: number, r: number, y = 0, phase = 0): Vector3[] {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2;
    return new Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  });
}

/** Smoothly bend a geometry around the Y axis: y += bend * (x² + z²) (for cisternae, sheets). */
export function bendGeometry(g: BufferGeometry, bend: number): BufferGeometry {
  if (!bend) return g;
  const p = g.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    p.setY(i, p.getY(i) + bend * (x * x + z * z));
  }
  g.computeVertexNormals();
  return g;
}
