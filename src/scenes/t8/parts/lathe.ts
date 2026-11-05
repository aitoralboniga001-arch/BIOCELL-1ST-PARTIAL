/**
 * Surface-of-revolution toolkit for the Golgi / trafficking scenes.
 *
 *  - Profile: a 2D polyline in (ρ, y) with analytic normals and arc length (no allocation once built).
 *  - budProfile(): a flat membrane disc that smoothly grows a spherical bud (flat → pit → Ω → pinched).
 *    The same curve played backwards is a vesicle fusing with a membrane.
 *  - DynamicLathe: a fixed-topology lathe geometry whose vertices are rewritten in place from a Profile
 *    every frame (no per-frame allocation, smooth analytic normals, optional RGBA edge fade).
 *  - cisternaProfile(): closed profile of a Golgi cisterna (thin centre, dilated rim).
 */
import { BufferAttribute, BufferGeometry } from 'three';
import { clamp, smooth } from '@/engine/anim';

export class Profile {
  readonly cap: number;
  n = 0;
  r: Float32Array;
  y: Float32Array;
  nr: Float32Array;
  ny: Float32Array;
  s: Float32Array;
  length = 0;
  constructor(cap = 256) {
    this.cap = cap;
    this.r = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.nr = new Float32Array(cap);
    this.ny = new Float32Array(cap);
    this.s = new Float32Array(cap);
  }
  clear() {
    this.n = 0;
    this.length = 0;
    return this;
  }
  /** add a point with its unit normal (pointing to the "outer"/cytosolic side) */
  push(r: number, y: number, nr: number, ny: number) {
    if (this.n >= this.cap) return this;
    const i = this.n++;
    this.r[i] = Math.max(0, r);
    this.y[i] = y;
    this.nr[i] = nr;
    this.ny[i] = ny;
    if (i === 0) this.s[0] = 0;
    else {
      const dr = this.r[i] - this.r[i - 1];
      const dy = y - this.y[i - 1];
      this.s[i] = this.s[i - 1] + Math.sqrt(dr * dr + dy * dy);
    }
    this.length = this.s[i];
    return this;
  }
  /** sample at arc length d (from the first point) */
  at(d: number, out: ProfilePoint): ProfilePoint {
    const n = this.n;
    if (n === 0) return out;
    if (d <= 0 || n === 1) return this.copyTo(0, out);
    if (d >= this.length) return this.copyTo(n - 1, out);
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.s[mid] <= d) lo = mid;
      else hi = mid;
    }
    const seg = this.s[hi] - this.s[lo] || 1;
    const k = (d - this.s[lo]) / seg;
    out.r = this.r[lo] + (this.r[hi] - this.r[lo]) * k;
    out.y = this.y[lo] + (this.y[hi] - this.y[lo]) * k;
    let nr = this.nr[lo] + (this.nr[hi] - this.nr[lo]) * k;
    let ny = this.ny[lo] + (this.ny[hi] - this.ny[lo]) * k;
    const l = Math.hypot(nr, ny) || 1;
    nr /= l;
    ny /= l;
    out.nr = nr;
    out.ny = ny;
    return out;
  }
  /** sample at arc length measured from the LAST point (e.g. from the bud apex) */
  fromEnd(d: number, out: ProfilePoint) {
    return this.at(this.length - d, out);
  }
  private copyTo(i: number, out: ProfilePoint) {
    out.r = this.r[i];
    out.y = this.y[i];
    out.nr = this.nr[i];
    out.ny = this.ny[i];
    return out;
  }
}

export interface ProfilePoint {
  r: number;
  y: number;
  nr: number;
  ny: number;
}
export const pp = (): ProfilePoint => ({ r: 0, y: 0, nr: 0, ny: 1 });

// ———————————————————————————————————————— bud ————————————————————————————————————————

export interface BudShape {
  /** patch radius */
  R: number;
  /** bud (vesicle) radius, measured on the membrane mid-plane */
  r: number;
  /** neck fillet radius */
  f: number;
}

/** Sphere-centre height range: c0 (flat) … c1 (neck closed). */
export function budRange(b: BudShape) {
  const c0 = -b.r;
  const c1 = b.f + Math.sqrt((b.r + b.f) ** 2 - b.f ** 2);
  return { c0, c1 };
}

/** Centre height of the bud sphere at progress k ∈ [0,1] (0 = flat, 1 = neck just closed). */
export function budCentre(b: BudShape, k: number) {
  const { c0, c1 } = budRange(b);
  return c0 + (c1 - c0) * clamp(k);
}

export const BUD_POINTS = { flat: 46, fillet: 26, sphere: 70 } as const;
export const BUD_N = BUD_POINTS.flat + BUD_POINTS.fillet + BUD_POINTS.sphere;

/**
 * Mid-plane profile of a flat membrane (y = 0, cytosol = +y) growing a bud of radius r into +y.
 * Points run from the patch edge (ρ = R) to the bud apex; always BUD_N points (fixed topology).
 * `k` = 0 flat … 1 pinched. Normals point to the cytosolic (+y / outside-of-bud) side.
 */
export function budProfile(out: Profile, b: BudShape, k: number): Profile {
  const { r, f, R } = b;
  const c = budCentre(b, Math.min(k, 0.9995));
  const rf = Math.sqrt(Math.max(0, (r + f) ** 2 - (f - c) ** 2));
  out.clear();
  // flat part: ρ from R down to rf, points concentrated near the bud
  const NF = BUD_POINTS.flat;
  for (let i = 0; i < NF; i++) {
    const u = 1 - i / (NF - 1);
    out.push(rf + (R - rf) * u * u, 0, 0, 1);
  }
  // fillet: centre (rf, f); angle from −π/2 decreasing to the tangent point with the sphere
  let phiT = Math.atan2(c - f, -rf);
  if (phiT > -Math.PI / 2) phiT -= Math.PI * 2;
  const NL = BUD_POINTS.fillet;
  for (let i = 1; i <= NL; i++) {
    const phi = -Math.PI / 2 + (phiT + Math.PI / 2) * (i / NL);
    const x = rf + f * Math.cos(phi);
    const y = f + f * Math.sin(phi);
    out.push(x, y, -Math.cos(phi), -Math.sin(phi));
  }
  // sphere: centre (0, c); from the tangent point (direction −u) up to the apex (π/2)
  const ux = -rf;
  const uy = c - f;
  const ul = Math.hypot(ux, uy) || 1;
  const aT = Math.atan2(-uy / ul, -ux / ul);
  const NS = BUD_POINTS.sphere;
  for (let i = 1; i <= NS; i++) {
    const a = aT + (Math.PI / 2 - aT) * (i / NS);
    out.push(r * Math.cos(a), c + r * Math.sin(a), Math.cos(a), Math.sin(a));
  }
  return out;
}

/** Offset a profile along its normals (leaflet surfaces). */
export function offsetProfile(src: Profile, d: number, out: Profile): Profile {
  out.clear();
  for (let i = 0; i < src.n; i++) out.push(src.r[i] + src.nr[i] * d, src.y[i] + src.ny[i] * d, src.nr[i], src.ny[i]);
  return out;
}

// ———————————————————————————————————————— dynamic lathe ————————————————————————————————————————

/**
 * Lathe geometry with fixed topology (M profile points × S segments) that can be rewritten in place.
 * Axis = y. phi ∈ [phi0, phi0 + phiLen]; x = ρ·cos φ, z = ρ·sin φ.
 */
export class DynamicLathe {
  readonly geometry: BufferGeometry;
  readonly M: number;
  readonly S: number;
  private pos: Float32Array;
  private nrm: Float32Array;
  private col: Float32Array | null;
  private cos: Float32Array;
  private sin: Float32Array;
  constructor(M: number, S: number, phi0 = 0, phiLen = Math.PI * 2, fade = false, flip = false) {
    this.M = M;
    this.S = S;
    const nv = M * (S + 1);
    this.pos = new Float32Array(nv * 3);
    this.nrm = new Float32Array(nv * 3);
    this.col = fade ? new Float32Array(nv * 4).fill(1) : null;
    this.cos = new Float32Array(S + 1);
    this.sin = new Float32Array(S + 1);
    for (let j = 0; j <= S; j++) {
      const a = phi0 + (phiLen * j) / S;
      this.cos[j] = Math.cos(a);
      this.sin[j] = Math.sin(a);
    }
    const idx: number[] = [];
    for (let i = 0; i < M - 1; i++)
      for (let j = 0; j < S; j++) {
        const a = i * (S + 1) + j;
        const b = a + S + 1;
        if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1);
        else idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const g = new BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new BufferAttribute(this.nrm, 3));
    if (this.col) g.setAttribute('color', new BufferAttribute(this.col, 4));
    this.geometry = g;
  }
  /**
   * Write the profile (must have exactly M points). `fadeFrom`/`fadeTo`: ρ range over which alpha goes 1 → 0.
   */
  update(p: Profile, fadeFrom = Infinity, fadeTo = Infinity) {
    const { M, S, pos, nrm, col } = this;
    const n = Math.min(M, p.n);
    for (let i = 0; i < M; i++) {
      const k = Math.min(i, n - 1);
      const r = p.r[k];
      const y = p.y[k];
      const nr = p.nr[k];
      const ny = p.ny[k];
      const alpha = fadeFrom === Infinity ? 1 : 1 - smooth(clamp((r - fadeFrom) / (fadeTo - fadeFrom)));
      for (let j = 0; j <= S; j++) {
        const v = i * (S + 1) + j;
        pos[v * 3] = r * this.cos[j];
        pos[v * 3 + 1] = y;
        pos[v * 3 + 2] = r * this.sin[j];
        nrm[v * 3] = nr * this.cos[j];
        nrm[v * 3 + 1] = ny;
        nrm[v * 3 + 2] = nr * this.sin[j];
        if (col) col[v * 4 + 3] = alpha;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    if (col) this.geometry.attributes.color.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }
  dispose() {
    this.geometry.dispose();
  }
}

// ———————————————————————————————————————— cisterna ————————————————————————————————————————

/**
 * Closed profile of a cisterna (mid-plane y = 0): runs from the top centre (0, +h0) out along the
 * thin sheet, around the dilated rim (radius hr, outermost at ρ = R) and back along the bottom to (0, −h0).
 * `inset` shrinks it inward along the normals (inner leaflet / lumen surface).
 */
export function cisternaProfile(R: number, h0: number, hr: number, inset = 0, n = 120): { r: number; y: number }[] {
  const out: { r: number; y: number }[] = [];
  const rc = R - hr;
  const h = (rho: number) => h0 + (hr - h0) * smooth(clamp((rho - rc * 0.55) / (rc * 0.45)));
  const nTop = Math.floor(n * 0.36);
  const nRim = n - 2 * nTop;
  const top: { r: number; y: number }[] = [];
  for (let i = 0; i <= nTop; i++) {
    const u = i / nTop;
    const rho = rc * (1 - (1 - u) * (1 - u) * 0.0) * u;
    top.push({ r: rho, y: h(rho) });
  }
  // numerical normals for the sheet part
  const norm = (a: { r: number; y: number }, b: { r: number; y: number }) => {
    const dr = b.r - a.r;
    const dy = b.y - a.y;
    const l = Math.hypot(dr, dy) || 1;
    return { nr: -dy / l, ny: dr / l };
  };
  for (let i = 0; i < top.length; i++) {
    const a = top[Math.max(0, i - 1)];
    const b = top[Math.min(top.length - 1, i + 1)];
    const nn = norm(a, b);
    out.push({ r: Math.max(0, top[i].r - nn.nr * inset), y: top[i].y - nn.ny * inset });
  }
  for (let i = 1; i < nRim; i++) {
    const a = Math.PI / 2 - (Math.PI * i) / nRim;
    out.push({ r: rc + (hr - inset) * Math.cos(a), y: (hr - inset) * Math.sin(a) });
  }
  for (let i = top.length - 1; i >= 0; i--) {
    const a = top[Math.max(0, i - 1)];
    const b = top[Math.min(top.length - 1, i + 1)];
    const nn = norm(a, b);
    out.push({ r: Math.max(0, top[i].r - nn.nr * inset), y: -(top[i].y - nn.ny * inset) });
  }
  return out;
}
