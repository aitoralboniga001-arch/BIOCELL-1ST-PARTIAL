/**
 * Membrane profiles: a 2D curve in the (r, y) half-plane, revolved around the y axis, describes a
 * membrane that pits, buds, constricts, pinches off or fuses (all axisymmetric).
 *
 * Convention: a profile is traversed from the axis / bud tip OUTWARDS. Its unit normal (−dy, dr)
 * points to the "positive" side: +y over a flat membrane, and into the lumen of a downward bud
 * (the bud lumen is continuous with the +y space). Leaflet +1 sits on the +normal side.
 *
 * Builders write into a fixed-capacity Profile (no allocations per frame).
 */

export class Profile {
  readonly cap: number;
  n = 0;
  r: Float32Array;
  y: Float32Array;
  /** unit normal (−dy, dr) */
  nr: Float32Array;
  ny: Float32Array;
  /** cumulative arc length */
  s: Float32Array;
  length = 0;
  constructor(cap = 512) {
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
  /** append a point (skips points closer than 1e-4 to the previous one) */
  push(r: number, y: number) {
    if (this.n >= this.cap) return this;
    if (this.n > 0) {
      const dr = r - this.r[this.n - 1];
      const dy = y - this.y[this.n - 1];
      if (dr * dr + dy * dy < 1e-8) return this;
    }
    this.r[this.n] = r;
    this.y[this.n] = y;
    this.n++;
    return this;
  }
  /** straight segment to (r, y) with points every `step` */
  lineTo(r: number, y: number, step = 0.08) {
    if (this.n === 0) return this.push(r, y);
    const r0 = this.r[this.n - 1];
    const y0 = this.y[this.n - 1];
    const L = Math.hypot(r - r0, y - y0);
    const k = Math.max(1, Math.ceil(L / step));
    for (let i = 1; i <= k; i++) this.push(r0 + ((r - r0) * i) / k, y0 + ((y - y0) * i) / k);
    return this;
  }
  /** circular arc around (cr, cy), radius R, from angle a0 to a1 (radians, either direction) */
  arc(cr: number, cy: number, R: number, a0: number, a1: number, step = 0.06) {
    const L = Math.abs(a1 - a0) * R;
    const k = Math.max(1, Math.ceil(L / step));
    for (let i = 0; i <= k; i++) {
      const a = a0 + ((a1 - a0) * i) / k;
      this.push(cr + Math.cos(a) * R, cy + Math.sin(a) * R);
    }
    return this;
  }
  /** compute arc length + normals (call after building) */
  finish() {
    const n = this.n;
    if (n === 0) return this;
    this.s[0] = 0;
    for (let i = 1; i < n; i++) this.s[i] = this.s[i - 1] + Math.hypot(this.r[i] - this.r[i - 1], this.y[i] - this.y[i - 1]);
    this.length = this.s[n - 1];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      let dr = this.r[b] - this.r[a];
      let dy = this.y[b] - this.y[a];
      const l = Math.hypot(dr, dy) || 1;
      dr /= l;
      dy /= l;
      this.nr[i] = -dy;
      this.ny[i] = dr;
    }
    return this;
  }
  /** sample at arc length d → writes into out[0..3] = r, y, nr, ny */
  at(d: number, out: Float32Array | number[]) {
    const n = this.n;
    if (n === 0) {
      out[0] = out[1] = out[2] = 0;
      out[3] = 1;
      return out;
    }
    if (d <= 0 || n === 1) {
      out[0] = this.r[0];
      out[1] = this.y[0];
      out[2] = this.nr[0];
      out[3] = this.ny[0];
      return out;
    }
    if (d >= this.length) {
      out[0] = this.r[n - 1];
      out[1] = this.y[n - 1];
      out[2] = this.nr[n - 1];
      out[3] = this.ny[n - 1];
      return out;
    }
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.s[m] <= d) lo = m;
      else hi = m;
    }
    const k = (d - this.s[lo]) / (this.s[hi] - this.s[lo] || 1);
    out[0] = this.r[lo] + (this.r[hi] - this.r[lo]) * k;
    out[1] = this.y[lo] + (this.y[hi] - this.y[lo]) * k;
    let nr = this.nr[lo] + (this.nr[hi] - this.nr[lo]) * k;
    let ny = this.ny[lo] + (this.ny[hi] - this.ny[lo]) * k;
    const l = Math.hypot(nr, ny) || 1;
    nr /= l;
    ny /= l;
    out[2] = nr;
    out[3] = ny;
    return out;
  }
  /** copy another profile, reversed (so traversal starts at the other end); normals flip sign */
  copyReversed(src: Profile) {
    this.clear();
    for (let i = src.n - 1; i >= 0; i--) this.push(src.r[i], src.y[i]);
    return this.finish();
  }
  /** a stable signature (cheap) to detect changes */
  sig() {
    const n = this.n;
    if (!n) return 0;
    let h = n * 7.13 + this.length * 31.7;
    for (let i = 0; i < n; i += 7) h += this.r[i] * (i + 1.3) + this.y[i] * (i + 2.7);
    return h;
  }
}

// ———————————————————————————————————————— bud geometry ————————————————————————————————————————

export interface BudParams {
  /** mid-surface radius of the bud sphere */
  R: number;
  /**
   * depth of the sphere centre below the flat membrane (y = 0). −R → flat; 0 → hemispherical pit;
   * larger → omega; the neck closes at hClose(R, rho).
   */
  h: number;
  /** radius of the rounded lip (fillet) joining the bud to the flat membrane */
  rho: number;
  /** extra straight neck (tube) length inserted at the narrowest point (dynamin collar) */
  neck?: number;
  /** radius of the flat disc that the profile reaches */
  edge: number;
  /** sampling step */
  step?: number;
}

/** h at which the neck mid-surface radius reaches `rn` (rn = 0: fully closed). */
export function hForNeck(R: number, rho: number, rn: number) {
  const rf = rn + rho;
  return rho + Math.sqrt(Math.max(0, (R + rho) ** 2 - rf * rf));
}

/** Neck mid-surface radius for a bud (Infinity while the lip has no vertical tangent yet). */
export function neckRadius(R: number, h: number, rho: number) {
  if (h <= rho) return Infinity;
  const rf = Math.sqrt(Math.max(0, (R + rho) ** 2 - (h - rho) ** 2));
  return rf - rho;
}

/**
 * Build a bud as TWO profiles:
 *  - `bud`: from the bud tip (bottom, r = 0) up to the narrowest point of the neck (or the lip top if
 *    there is no neck yet) — rings index from the tip, so the vesicle part is stable;
 *  - `parent`: from the flat edge INWARDS to the same point (built from the edge, so the flat part is stable).
 * The direction of `parent` is edge → neck; its normals are therefore flipped (side −1 = +y side). Use
 * `flip` in renderers for it.
 * `dir` = −1 buds downwards (into −y); +1 upwards.
 */
export function buildBud(p: BudParams, bud: Profile, parent: Profile) {
  const { R, rho, edge } = p;
  const step = p.step ?? 0.07;
  const h = Math.max(-R + 1e-3, p.h);
  const neck = Math.max(0, p.neck ?? 0);
  const rf = Math.sqrt(Math.max(1e-6, (R + rho) ** 2 - (h - rho) ** 2));
  // C = (0, −h), F = (rf, −rho)
  const ux = rf;
  const uy = -rho + h;
  const ul = Math.hypot(ux, uy) || 1;
  const aT = Math.atan2(uy / ul, ux / ul); // tangent point angle on the sphere
  const b0 = aT + Math.PI; // same point on the fillet circle
  const hasNeck = b0 >= Math.PI;
  const split = hasNeck ? Math.PI : b0; // split point (narrowest) on the fillet
  const shift = hasNeck ? neck : 0;
  bud.clear();
  bud.arc(0, -h - shift, R, -Math.PI / 2, aT, step);
  if (hasNeck) {
    bud.arc(rf, -rho - shift, rho, b0, Math.PI, step * 0.7);
    if (shift > 0) bud.lineTo(rf - rho, -rho, step);
  }
  bud.finish();
  parent.clear();
  parent.push(edge, 0);
  parent.lineTo(rf, 0, step * 1.6);
  parent.arc(rf, -rho, rho, Math.PI / 2, split, step * 0.7);
  parent.finish();
  return { rf, neckR: hasNeck ? rf - rho : Infinity, tipY: -h - shift - R, center: -h - shift };
}

/** A closed sphere profile (tip at bottom → top), centre (0, cy). */
export function buildSphere(R: number, cy: number, out: Profile, step = 0.07) {
  out.clear();
  out.arc(0, cy, R, -Math.PI / 2, Math.PI / 2, step);
  return out.finish();
}

/** A flat disc with a shallow rounded dimple of depth `d` (healing after scission), built from the edge inwards. */
export function buildDimple(edge: number, width: number, d: number, out: Profile, step = 0.07) {
  out.clear();
  out.push(edge, 0);
  const n = Math.max(8, Math.ceil(edge / step));
  for (let i = 1; i <= n; i++) {
    const r = edge * (1 - i / n);
    const k = Math.max(0, 1 - (r / width) ** 2);
    out.push(r, -d * k * k);
  }
  return out.finish();
}

/** A flat disc (edge → axis). */
export function buildFlat(edge: number, out: Profile, step = 0.1) {
  out.clear();
  out.push(edge, 0);
  out.lineTo(0, 0, step);
  return out.finish();
}
