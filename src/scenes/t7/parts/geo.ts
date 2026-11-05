/**
 * Topic-7 geometry builders (organelle scale). All deterministic, built once and memoised by callers.
 *  - sac: a flattened cisterna ("pita bread" superellipsoid) that can be warped / wrapped round a sphere
 *  - shellPatch: a thick spherical / ellipsoidal shell with an opening and side walls (cut-away organelles)
 *  - varTube: a tube with a radius profile (rounded closed ends, flared joints)
 */
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Vector3 } from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { noise3 } from '@/three/kit';
import type { V3 } from '@/engine/anim';

// ——————————————————————————————————————— sac (cisterna) ———————————————————————————————————————

export interface SacSpec {
  /** half-size along x / z */
  a: number;
  b: number;
  /** half-thickness */
  h: number;
  /** superellipse exponent of the outline (2 = ellipse, 4 = rounded rectangle) */
  n?: number;
  /** rim dilation (Golgi-like swollen rims): thickness × (1 + rim·ρ⁶) */
  rim?: number;
  /** y += bend·(x² + z²) */
  bend?: number;
  /** gentle organic waviness amplitude */
  wave?: number;
  seed?: number;
  /** wrap the flat sac round a sphere of this radius (x → azimuth, z → elevation, y → radial) */
  wrapR?: number;
}

const sgnPow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);

/** Mid-surface offset of a sac at (x, z) (bend + wave), before wrapping. */
export function sacMid(s: SacSpec, x: number, z: number): number {
  let y = (s.bend ?? 0) * (x * x + z * z);
  if (s.wave) y += s.wave * noise3(x * 0.55, 0.3, z * 0.55, s.seed ?? 1);
  return y;
}

/** Map a flat sac point (x, y, z) to its final position (wrap). */
export function sacMap(s: SacSpec, x: number, y: number, z: number, out: Vector3): Vector3 {
  const yy = y + sacMid(s, x, z);
  if (!s.wrapR) return out.set(x, yy, z);
  const R = s.wrapR + yy;
  const az = x / s.wrapR;
  const el = z / s.wrapR;
  // sphere centred at the origin; the sac's "up" (+y) points away from the centre along +x at az = el = 0
  return out.set(R * Math.cos(el) * Math.cos(az), R * Math.cos(el) * Math.sin(az), R * Math.sin(el));
}

/** Thickness profile at normalised outline radius ρ ∈ [0,1] (0 at the rim). */
function sacThick(s: SacSpec, rho: number) {
  const n = s.n ?? 4;
  const core = Math.pow(Math.max(0, 1 - Math.pow(rho, n)), 1 / n);
  return core * (1 + (s.rim ?? 0) * Math.pow(rho, 6));
}

/**
 * Closed flattened sac. `inset` shrinks it uniformly (for the inner leaflet / lumen layers).
 * Built from a UV sphere: the equator becomes the rounded rim.
 */
export function sacGeometry(s: SacSpec, inset = 0, wSeg = 96, hSeg = 40): BufferGeometry {
  const n = s.n ?? 4;
  const pos: number[] = [];
  const idx: number[] = [];
  const v = new Vector3();
  const a = Math.max(0.01, s.a - inset);
  const b = Math.max(0.01, s.b - inset);
  const h = Math.max(0.004, s.h - inset);
  for (let j = 0; j <= hSeg; j++) {
    const th = (j / hSeg) * Math.PI; // 0 top … π bottom
    const st = Math.sin(th);
    const ct = Math.cos(th);
    for (let i = 0; i <= wSeg; i++) {
      const ph = (i / wSeg) * Math.PI * 2;
      // superellipse outline
      const ox = sgnPow(Math.cos(ph), 2 / n);
      const oz = sgnPow(Math.sin(ph), 2 / n);
      const rho = sgnPow(st, 2 / n); // 0 at the poles, 1 at the rim
      const x = a * ox * rho;
      const z = b * oz * rho;
      const yk = sgnPow(ct, 2 / n);
      const y = h * yk * (1 + (s.rim ?? 0) * Math.pow(Math.abs(rho), 6));
      sacMap(s, x, y, z, v);
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let j = 0; j < hSeg; j++)
    for (let i = 0; i < wSeg; i++) {
      const a0 = j * (wSeg + 1) + i;
      const b0 = a0 + wSeg + 1;
      idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  const w = mergeVertices(g, 1e-5);
  g.dispose();
  w.computeVertexNormals();
  w.computeBoundingSphere();
  return w;
}

/** Point on the top (+1) or bottom (−1) face of a sac at outline coords (u, v) ∈ unit disc; also the normal. */
export function sacSurface(s: SacSpec, u: number, v: number, side: 1 | -1, out: Vector3, nrm?: Vector3): Vector3 {
  const n = s.n ?? 4;
  const rho = Math.min(0.999, Math.pow(Math.pow(Math.abs(u), n) + Math.pow(Math.abs(v), n), 1 / n));
  const x = u * s.a;
  const z = v * s.b;
  const y = side * s.h * sacThick(s, rho);
  sacMap(s, x, y, z, out);
  if (nrm) {
    const e = 0.02;
    const p1 = sacMap(s, x + e, side * s.h * sacThick(s, rho), z, new Vector3());
    const p2 = sacMap(s, x, side * s.h * sacThick(s, rho), z + e, new Vector3());
    nrm.subVectors(p1, out).cross(p2.sub(out)).normalize();
    if (side === -1) nrm.negate();
    // make sure it points away from the mid-surface
    const mid = sacMap(s, x, 0, z, new Vector3());
    if (nrm.dot(out.clone().sub(mid)) < 0) nrm.negate();
  }
  return out;
}

// ——————————————————————————————————————— shell patch (cut-away) ———————————————————————————————————————

export interface ShellSpec {
  /** inner and outer radius (unit-sphere scale); rIn = 0 gives a solid */
  rIn: number;
  rOut: number;
  /** ellipsoid scale */
  scale?: V3;
  /** kept azimuth range (radians, around +y, measured from +x towards −z… three's SphereGeometry convention) */
  phi?: [number, number];
  /** kept polar range (0 = top) */
  theta?: [number, number];
  wSeg?: number;
  hSeg?: number;
}

function dirOf(th: number, ph: number, out: Vector3) {
  // same convention as THREE.SphereGeometry: x = −cos φ sin θ, y = cos θ, z = sin φ sin θ
  return out.set(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th));
}

/**
 * A thick shell (outer surface, inner surface, and flat walls closing the cut) — e.g. a nuclear
 * envelope or a nucleoplasm with a wedge cut away to show the section. Smooth inside each part.
 */
export function shellPatch(s: ShellSpec): BufferGeometry {
  const [p0, p1] = s.phi ?? [0, Math.PI * 2];
  const [t0, t1] = s.theta ?? [0, Math.PI];
  const [sx, sy, sz] = s.scale ?? [1, 1, 1];
  const W = s.wSeg ?? 96;
  const H = s.hSeg ?? 64;
  const parts: BufferGeometry[] = [];
  const d = new Vector3();
  const surf = (r: number, flip: boolean) => {
    const pos: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= H; j++) {
      const th = t0 + ((t1 - t0) * j) / H;
      for (let i = 0; i <= W; i++) {
        const ph = p0 + ((p1 - p0) * i) / W;
        dirOf(th, ph, d);
        pos.push(d.x * r * sx, d.y * r * sy, d.z * r * sz);
      }
    }
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const a = j * (W + 1) + i;
        const b = a + W + 1;
        if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1);
        else idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setIndex(idx);
    const w = mergeVertices(g, 1e-6);
    g.dispose();
    w.computeVertexNormals();
    parts.push(w);
  };
  surf(s.rOut, false);
  if (s.rIn > 0) surf(s.rIn, true);
  // walls: at φ = p0 and φ = p1 (if the azimuth range is not full)
  const full = Math.abs(p1 - p0 - Math.PI * 2) < 1e-4;
  const wall = (ph: number, flip: boolean) => {
    const pos: number[] = [];
    const idx: number[] = [];
    const R = 8;
    for (let j = 0; j <= H; j++) {
      const th = t0 + ((t1 - t0) * j) / H;
      dirOf(th, ph, d);
      for (let k = 0; k <= R; k++) {
        const r = s.rIn + ((s.rOut - s.rIn) * k) / R;
        pos.push(d.x * r * sx, d.y * r * sy, d.z * r * sz);
      }
    }
    for (let j = 0; j < H; j++)
      for (let k = 0; k < R; k++) {
        const a = j * (R + 1) + k;
        const b = a + R + 1;
        if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1);
        else idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
  };
  if (!full) {
    wall(p0, true);
    wall(p1, false);
  }
  // ring walls at the θ cut (if the polar range is not full)
  const ring = (th: number, flip: boolean) => {
    const pos: number[] = [];
    const idx: number[] = [];
    const R = 8;
    for (let i = 0; i <= W; i++) {
      const ph = p0 + ((p1 - p0) * i) / W;
      dirOf(th, ph, d);
      for (let k = 0; k <= R; k++) {
        const r = s.rIn + ((s.rOut - s.rIn) * k) / R;
        pos.push(d.x * r * sx, d.y * r * sy, d.z * r * sz);
      }
    }
    for (let i = 0; i < W; i++)
      for (let k = 0; k < R; k++) {
        const a = i * (R + 1) + k;
        const b = a + R + 1;
        if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1);
        else idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
  };
  if (t0 > 1e-4) ring(t0, false);
  if (t1 < Math.PI - 1e-4) ring(t1, true);
  const m = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
  parts.forEach((g) => g.dispose());
  m.computeBoundingSphere();
  return m;
}

// ——————————————————————————————————————— tube with a radius profile ———————————————————————————————————————

export interface VarTubeOpts {
  points: V3[];
  radius: number;
  /** radius multiplier along the tube, u ∈ [0,1] */
  profile?: (u: number) => number;
  /** round off the ends (default both) */
  capStart?: boolean;
  capEnd?: boolean;
  segments?: number;
  radial?: number;
  closed?: boolean;
}

/** Smooth tube along a centripetal Catmull–Rom curve with a radius profile and rounded ends. */
export function varTube(o: VarTubeOpts): BufferGeometry {
  const curve = new CatmullRomCurve3(o.points.map((p) => new Vector3(...p)), !!o.closed, 'centripetal');
  const S = o.segments ?? Math.max(24, Math.round(curve.getLength() * 10));
  const R = o.radial ?? 20;
  const frames = curve.computeFrenetFrames(S, !!o.closed);
  const L = curve.getLength();
  const capLen = Math.min(o.radius * 1.0, L * 0.25);
  const pos: number[] = [];
  const idx: number[] = [];
  const p = new Vector3();
  for (let i = 0; i <= S; i++) {
    const u = i / S;
    curve.getPointAt(u, p);
    let r = o.radius * (o.profile ? o.profile(u) : 1);
    const dS = u * L;
    const dE = (1 - u) * L;
    if (!o.closed && (o.capStart ?? true) && dS < capLen) r *= Math.sqrt(Math.max(0, 1 - Math.pow(1 - dS / capLen, 2)));
    if (!o.closed && (o.capEnd ?? true) && dE < capLen) r *= Math.sqrt(Math.max(0, 1 - Math.pow(1 - dE / capLen, 2)));
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let k = 0; k <= R; k++) {
      const a = (k / R) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(p.x + r * (c * N.x + s * B.x), p.y + r * (c * N.y + s * B.y), p.z + r * (c * N.z + s * B.z));
    }
  }
  for (let i = 0; i < S; i++)
    for (let k = 0; k < R; k++) {
      const a = i * (R + 1) + k;
      const b = a + R + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  const w = mergeVertices(g, 1e-6);
  g.dispose();
  w.computeVertexNormals();
  w.computeBoundingSphere();
  return w;
}

/** Merge several geometries (non-indexed, position+normal only). */
export function mergeAll(parts: BufferGeometry[]): BufferGeometry {
  const clean = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    return n;
  });
  const m = mergeGeometries(clean)!;
  parts.forEach((g) => g.dispose());
  clean.forEach((g) => g.dispose());
  m.computeBoundingSphere();
  return m;
}
