/**
 * Chromatin parts for Topic 6 (candidates for the kit: Nucleosome / DNAHelix / ChromatinFiber).
 * Units = nm. Nucleosome local frame: superhelix axis = +y, dyad (where DNA enters/leaves) = +z.
 *
 *  - NUC: geometry constants; wrapPoint/wrapTangent: the left-handed DNA superhelix (1.65 turns).
 *  - <Octamer>: hero histone octamer (8 histone blobs: H2A, H2B, H3, H4 ×2, each its own colour/id),
 *    optional fly-in assembly and N-terminal tails (tailPoint() gives positions along a tail, e.g. lysines).
 *  - <OctamerField>: many octamers in one instanced draw (vertex-coloured merged geometry).
 *  - chainPath(): DNA centreline through a list of nucleosomes (wrap + Hermite linkers).
 *  - <Duplex>: double helix (two backbones + base-pair rungs) along any centreline.
 *  - <Charges>: billboarded + / − signs (instanced).
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshPhysicalMaterial, Object3D, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, lerp, smooth, type V3 } from '@/engine/anim';
import { lumpySphere, noise3, nucleicMaterial, PALETTE, proteinMaterial, useDisposable, useKitHighlight } from '@/three/kit';
import { DynTube, PathBuf, TubeBuilder } from './tube';

export const NUC = {
  /** DNA superhelix radius (to the DNA axis) */
  R: 4.2,
  /** rise per superhelical turn */
  pitch: 2.5,
  /** half of the wrapped angle (1.65 turns in total) */
  phiMax: 1.65 * Math.PI,
  /** DNA radius */
  dnaR: 1.0,
  octR: 3.3,
  octH: 4.6,
} as const;
const C = NUC.pitch / (2 * Math.PI);
/** arc length per radian of superhelix */
export const WRAP_L = Math.sqrt(NUC.R * NUC.R + C * C);
/** length of wrapped DNA */
export const WRAP_LEN = 2 * NUC.phiMax * WRAP_L;

/** Point of the left-handed superhelix at angle phi (0 = dyad, front). `R` lets the DNA loosen. */
export function wrapPoint(phi: number, out: Vector3, R: number = NUC.R): Vector3 {
  return out.set(R * Math.sin(phi), -C * phi, R * Math.cos(phi));
}
export function wrapTangent(phi: number, out: Vector3, R: number = NUC.R): Vector3 {
  return out.set(R * Math.cos(phi), -C, -R * Math.sin(phi)).normalize();
}

// ———————————————————————————————————————— histones ————————————————————————————————————————

export type HistoneKind = 'h2a' | 'h2b' | 'h3' | 'h4';
export const HISTONE_IDS: Record<HistoneKind, string> = { h2a: 'histone-h2a', h2b: 'histone-h2b', h3: 'histone-h3', h4: 'histone-h4' };
export const HISTONE_COLORS: Record<HistoneKind, string> = { h2a: PALETTE.h2a, h2b: PALETTE.h2b, h3: PALETTE.h3, h4: PALETTE.h4 };

/** The 8 histones: kind, sector angle (around y), layer (+1 top / −1 bottom). */
export const HISTONES: { kind: HistoneKind; ang: number; layer: 1 | -1 }[] = [
  { kind: 'h3', ang: 0.25 * Math.PI, layer: 1 },
  { kind: 'h4', ang: 0.75 * Math.PI, layer: 1 },
  { kind: 'h2b', ang: 1.25 * Math.PI, layer: 1 },
  { kind: 'h2a', ang: 1.75 * Math.PI, layer: 1 },
  { kind: 'h3', ang: -0.25 * Math.PI, layer: -1 },
  { kind: 'h4', ang: -0.75 * Math.PI, layer: -1 },
  { kind: 'h2b', ang: -1.25 * Math.PI, layer: -1 },
  { kind: 'h2a', ang: -1.75 * Math.PI, layer: -1 },
];

/** Centre of a histone blob in the octamer frame. */
export function histoneCentre(i: number, out: Vector3): Vector3 {
  const h = HISTONES[i];
  return out.set(Math.sin(h.ang) * 1.72, h.layer * 1.12, Math.cos(h.ang) * 1.72);
}

const histoneGeoCache: BufferGeometry[] = [];
/** Lumpy wedge-ish blob for histone i, in its own frame (x = radial). */
function histoneGeometry(i: number): BufferGeometry {
  if (histoneGeoCache[i]) return histoneGeoCache[i];
  const g = lumpySphere({
    detail: 9,
    scale: [1.58, 1.12, 1.3],
    noise: 0.07,
    freq: 2.6,
    seed: 101 + i * 7,
    bumps: [
      { dir: [1, 0, 0], amp: -0.05, width: 0.8 },
      { dir: [0.3, 0.6, 0.6], amp: 0.12, width: 0.5 },
      { dir: [0.4, -0.5, -0.5], amp: 0.1, width: 0.5 },
    ],
  });
  histoneGeoCache[i] = g;
  return g;
}

/** Rotation that turns the blob's local +x into the radial direction of histone i. */
function histoneQuat(i: number, out: Quaternion): Quaternion {
  const h = HISTONES[i];
  return out.setFromAxisAngle(Y_AXIS, h.ang - Math.PI / 2);
}
const Y_AXIS = new Vector3(0, 1, 0);

// ——— tails ———
/** N-terminal tail roots (octamer frame) and outward direction. H3/H2B tails leave between the DNA gyres. */
export const TAILS: { h: number; root: V3; dir: V3; len: number }[] = HISTONES.map((h, i) => {
  const r = 2.9;
  const a = h.ang + (h.kind === 'h3' ? 0.25 : h.kind === 'h4' ? -0.2 : h.kind === 'h2a' ? 0.3 : -0.25) * h.layer;
  const y = h.kind === 'h3' || h.kind === 'h2b' ? h.layer * 0.15 : h.layer * 1.9;
  const dir: V3 = h.kind === 'h4' || h.kind === 'h2a' ? [Math.sin(a) * 0.55, h.layer * 0.85, Math.cos(a) * 0.55] : [Math.sin(a), h.layer * 0.12, Math.cos(a)];
  const len = h.kind === 'h3' ? 9 : h.kind === 'h4' ? 7 : h.kind === 'h2b' ? 7 : 5.5;
  return { h: i, root: [Math.sin(a) * r, y, Math.cos(a) * r], dir, len };
});

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();

/**
 * Point along tail i at fraction u (0 = root … 1 = tip), wiggling with `t` (stage time), length scaled by `ext`.
 * Pure & deterministic.
 */
export function tailPoint(i: number, u: number, t: number, ext: number, out: Vector3): Vector3 {
  const T = TAILS[i];
  const L = T.len * ext;
  _a.set(...T.dir).normalize();
  // a perpendicular for the curl
  _b.set(-_a.z, 0.3, _a.x).normalize();
  _c.crossVectors(_a, _b).normalize();
  const s = u * L;
  const ph = i * 1.7;
  const curl = 0.9 * u * u;
  const w1 = Math.sin(u * 4.2 + ph + t * 9) * curl + 0.5 * Math.sin(i * 3.1) * u * u;
  const w2 = Math.cos(u * 3.4 + ph * 0.7 + t * 7) * curl * 0.8;
  return out.set(T.root[0] + _a.x * s + _b.x * w1 * 1.6 + _c.x * w2 * 1.6, T.root[1] + _a.y * s + _b.y * w1 * 1.6 + _c.y * w2 * 1.6 + -0.35 * u * u * (i % 2 ? 1 : -1), T.root[2] + _a.z * s + _b.z * w1 * 1.6 + _c.z * w2 * 1.6);
}

export interface OctamerProps {
  position?: V3;
  quaternion?: Quaternion;
  scale?: number;
  /** 0..1: histones fly in (H3/H4 first, then H2A/H2B) */
  assemble?: number;
  /** 0..1 tail length (0 = no tails) */
  tails?: number;
  t?: number;
  opacity?: number;
  /** extra ids every histone answers to (default nucleosome + histone-octamer) */
  ids?: string[];
  tailId?: string | string[];
  /** glow override for the tails */
  tailGlow?: number;
}

/** Hero histone octamer: 8 separately coloured histone blobs (+ optional tails). */
export function Octamer(p: OctamerProps) {
  const extra = p.ids ?? ['nucleosome', 'histone-octamer'];
  const mats = useDisposable(() => (['h2a', 'h2b', 'h3', 'h4'] as HistoneKind[]).map((k) => proteinMaterial(HISTONE_COLORS[k], { roughness: 0.5 })), []);
  const m0 = useMemo(() => [mats[0]], [mats]);
  const m1 = useMemo(() => [mats[1]], [mats]);
  const m2 = useMemo(() => [mats[2]], [mats]);
  const m3 = useMemo(() => [mats[3]], [mats]);
  useKitHighlight(m0, [HISTONE_IDS.h2a, ...extra], { opacity: p.opacity, strength: 0.55 });
  useKitHighlight(m1, [HISTONE_IDS.h2b, ...extra], { opacity: p.opacity, strength: 0.55 });
  useKitHighlight(m2, [HISTONE_IDS.h3, ...extra], { opacity: p.opacity, strength: 0.55 });
  useKitHighlight(m3, [HISTONE_IDS.h4, ...extra], { opacity: p.opacity, strength: 0.55 });
  const matOf = (k: HistoneKind) => mats[k === 'h2a' ? 0 : k === 'h2b' ? 1 : k === 'h3' ? 2 : 3];
  const assemble = p.assemble ?? 1;
  const t = p.t ?? 0;
  const tails = p.tails ?? 0;
  const tailMat = useDisposable(() => proteinMaterial('#ffe8a3', { roughness: 0.55 }), []);
  const bufs = useMemo(() => TAILS.map(() => new PathBuf(24)), []);
  if (tails > 0.01) {
    TAILS.forEach((_, i) => {
      const b = bufs[i].clear();
      for (let k = 0; k < 24; k++) {
        tailPoint(i, k / 23, t, tails, _d);
        b.pushV(_d);
      }
    });
  }
  const q = useMemo(() => new Quaternion(), []);
  return (
    <group position={p.position} quaternion={p.quaternion} scale={p.scale} visible={(p.opacity ?? 1) > 0.002}>
      {HISTONES.map((h, i) => {
        const late = h.kind === 'h2a' || h.kind === 'h2b';
        const k = smooth(clamp((assemble - (late ? 0.45 : 0)) / 0.55));
        histoneCentre(i, _a);
        const fly = 1 - k;
        const dir = _b.copy(_a).normalize();
        const pos: V3 = [_a.x + dir.x * 7 * fly + (late ? 0 : 0), _a.y + dir.y * 6 * fly + (i % 2 ? 3 : -3) * fly, _a.z + dir.z * 7 * fly + 2 * fly];
        histoneQuat(i, q);
        const rot = new Quaternion().setFromAxisAngle(Y_AXIS, fly * 1.4 * (i % 2 ? 1 : -1)).multiply(q);
        return <mesh key={i} geometry={histoneGeometry(i)} material={matOf(h.kind)} position={pos} quaternion={rot} visible={k > 0.001} scale={0.6 + 0.4 * k} />;
      })}
      {tails > 0.01 && TAILS.map((_, i) => <DynTube key={i} path={bufs[i].a} n={24} radius={0.32} material={tailMat} cap={24} radial={10} id={p.tailId ?? 'histone-tail'} opacity={p.opacity} glow={p.tailGlow} />)}
    </group>
  );
}

/** Merged, vertex-coloured octamer (+ short static tails) for instancing many nucleosomes. */
let octMerged: BufferGeometry | null = null;
export function octamerMergedGeometry(): BufferGeometry {
  if (octMerged) return octMerged;
  const parts: BufferGeometry[] = [];
  const m = new Matrix4();
  const q = new Quaternion();
  const col = new Color();
  HISTONES.forEach((h, i) => {
    const g = histoneGeometry(i).clone();
    histoneCentre(i, _a);
    histoneQuat(i, q);
    g.applyMatrix4(m.compose(_a, q, new Vector3(1, 1, 1)));
    col.set(HISTONE_COLORS[h.kind]);
    const n = g.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      c[k * 3] = col.r;
      c[k * 3 + 1] = col.g;
      c[k * 3 + 2] = col.b;
    }
    g.setAttribute('color', new BufferAttribute(c, 3));
    parts.push(g);
  });
  // short tails
  const tb = new PathBuf(10);
  TAILS.forEach((_, i) => {
    tb.clear();
    for (let k = 0; k < 10; k++) {
      tailPoint(i, k / 9, 0.3, 0.45, _d);
      tb.pushV(_d);
    }
    const tube = new TubeBuilder(10, 7, 2);
    tube.update(tb.a, 10, 0.3);
    const g = new BufferGeometry();
    const pos = tube.geo.getAttribute('position') as BufferAttribute;
    const nrm = tube.geo.getAttribute('normal') as BufferAttribute;
    const idx = tube.geo.getIndex()!;
    const count = tube.geo.drawRange.count;
    g.setAttribute('position', pos.clone());
    g.setAttribute('normal', nrm.clone());
    g.setIndex(new BufferAttribute((idx.array as Uint32Array).slice(0, count), 1));
    const nv = pos.count;
    const c = new Float32Array(nv * 3);
    col.set('#ffe8a3');
    for (let k = 0; k < nv; k++) {
      c[k * 3] = col.r;
      c[k * 3 + 1] = col.g;
      c[k * 3 + 2] = col.b;
    }
    g.setAttribute('color', new BufferAttribute(c, 3));
    tube.dispose();
    parts.push(g.toNonIndexed());
    g.dispose();
  });
  const clean = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  octMerged = mergeGeometries(clean)!;
  octMerged.computeBoundingSphere();
  return octMerged;
}

export interface NucPose {
  pos: Vector3;
  quat: Quaternion;
  /** octamer scale (0 = hidden) */
  s?: number;
}

/** Many octamers in a single instanced draw. Poses are read every render. */
export function OctamerField({ poses, count, id, opacity, glow, color }: { poses: NucPose[]; count: number; id?: string | string[]; opacity?: number; glow?: number; color?: string }) {
  const geo = octamerMergedGeometry();
  const mat = useDisposable(() => {
    const m = proteinMaterial(color ?? '#ffffff', { roughness: 0.5 });
    m.vertexColors = true;
    m.emissiveIntensity = 0.02;
    return m;
  }, [color]);
  const mats = useMemo(() => [mat], [mat]);
  useKitHighlight(mats, id, { opacity, glow, strength: 0.32, mode: 'boost' });
  const ref = useRef<InstancedMesh>(null);
  const cap = useMemo(() => poses.length, [poses]);
  const o = useMemo(() => new Object3D(), []);
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    const n = Math.min(count, cap);
    for (let i = 0; i < n; i++) {
      const P = poses[i];
      o.position.copy(P.pos);
      o.quaternion.copy(P.quat);
      o.scale.setScalar(P.s ?? 1);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  });
  return <instancedMesh ref={ref} args={[geo, mat, cap]} frustumCulled={false} visible={(opacity ?? 1) > 0.002} />;
}

// ———————————————————————————————————————— DNA path through nucleosomes ————————————————————————————————————————

const _p = new Vector3();
const _t0 = new Vector3();
const _t1 = new Vector3();
const _p0 = new Vector3();
const _p1 = new Vector3();

/** Cubic Hermite from p0 (tangent m0) to p1 (tangent m1); `steps` points pushed (excluding the start). */
export function pushHermite(buf: PathBuf, p0: Vector3, m0: Vector3, p1: Vector3, m1: Vector3, steps: number) {
  for (let k = 1; k <= steps; k++) {
    const u = k / steps;
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    buf.push(
      h00 * p0.x + h10 * m0.x + h01 * p1.x + h11 * m1.x,
      h00 * p0.y + h10 * m0.y + h01 * p1.y + h11 * m1.y,
      h00 * p0.z + h10 * m0.z + h01 * p1.z + h11 * m1.z,
    );
  }
}

/**
 * DNA centreline through nucleosomes in order: free end → wrap 1 → linker → wrap 2 … → free end.
 * `R` = superhelix radius (per nucleosome via `Rs`), `wraps` = wrapped fraction per nucleosome (0 = the
 * DNA only touches the dyad), `leadIn` / `leadOut` = free DNA before/after (nm).
 * `marks[i*2]`, `marks[i*2+1]` receive the point indices where nucleosome i's wrap starts / ends.
 */
export function chainPath(
  nucs: NucPose[],
  buf: PathBuf,
  o: { R?: number; Rs?: ArrayLike<number>; wraps?: ArrayLike<number>; wrapSteps?: number; linkSteps?: number; leadIn?: number; leadOut?: number; tension?: number; marks?: Int32Array; count?: number } = {},
) {
  const ws = o.wrapSteps ?? 40;
  const ls = o.linkSteps ?? 12;
  const tension = o.tension ?? 1;
  const n = o.count ?? nucs.length;
  buf.clear();
  for (let i = 0; i < n; i++) {
    const N = nucs[i];
    const R = o.Rs ? o.Rs[i] : (o.R ?? NUC.R);
    const w = o.wraps ? clamp(o.wraps[i]) : 1;
    const pm = NUC.phiMax * w;
    // entry
    wrapPoint(-pm, _p0, R).applyQuaternion(N.quat).add(N.pos);
    wrapTangent(-pm, _t0, R).applyQuaternion(N.quat);
    if (i === 0) {
      const L = o.leadIn ?? 0;
      if (L > 0) {
        const steps = Math.max(2, Math.round(L / 1.5));
        for (let k = 0; k < steps; k++) buf.push(_p0.x - _t0.x * L * (1 - k / steps), _p0.y - _t0.y * L * (1 - k / steps), _p0.z - _t0.z * L * (1 - k / steps));
      }
      buf.pushV(_p0);
    } else {
      // linker from the previous exit
      const P = nucs[i - 1];
      const Rp = o.Rs ? o.Rs[i - 1] : (o.R ?? NUC.R);
      const wp = o.wraps ? clamp(o.wraps[i - 1]) : 1;
      wrapPoint(NUC.phiMax * wp, _p1, Rp).applyQuaternion(P.quat).add(P.pos);
      wrapTangent(NUC.phiMax * wp, _t1, Rp).applyQuaternion(P.quat);
      const d = _p1.distanceTo(_p0) * tension;
      _t1.multiplyScalar(d);
      _c.copy(_t0).multiplyScalar(d);
      const steps = Math.max(ls, Math.round(_p1.distanceTo(_p0) / 1.6));
      pushHermite(buf, _p1, _t1, _p0, _c, steps);
    }
    if (o.marks) o.marks[i * 2] = buf.n - 1;
    const wsi = Math.max(1, Math.round(ws * w));
    if (w > 0.002) {
      for (let k = 1; k <= wsi; k++) {
        const phi = -pm + (2 * pm * k) / wsi;
        wrapPoint(phi, _p, R).applyQuaternion(N.quat).add(N.pos);
        buf.pushV(_p);
      }
    }
    if (o.marks) o.marks[i * 2 + 1] = buf.n - 1;
    if (i === n - 1) {
      const L = o.leadOut ?? 0;
      if (L > 0) {
        wrapPoint(pm, _p1, R).applyQuaternion(N.quat).add(N.pos);
        wrapTangent(pm, _t1, R).applyQuaternion(N.quat);
        const steps = Math.max(2, Math.round(L / 1.5));
        for (let k = 1; k <= steps; k++) buf.push(_p1.x + _t1.x * (L * k) / steps, _p1.y + _t1.y * (L * k) / steps, _p1.z + _t1.z * (L * k) / steps);
      }
    }
  }
  return buf;
}

// ———————————————————————————————————————— double helix ————————————————————————————————————————

export interface DuplexProps {
  /** centreline (any spacing; resampled internally to ~0.34 nm per base pair) */
  path: Float32Array;
  n: number;
  /** capacity in base pairs */
  capBp: number;
  id?: string | string[];
  opacity?: number;
  glow?: number;
  /** helix phase offset (radians), e.g. to make the helix "turn" while sliding */
  phase?: number;
  /** strand distance from the axis */
  radius?: number;
}

const BP = 0.34;
const TWIST = (2 * Math.PI) / 10.5;
const GROOVE = 2.3; // angle between the two backbones (minor groove)
const _T = new Vector3();
const _N = new Vector3();
const _B = new Vector3();
const _P = new Vector3();
const _Q = new Vector3();
const _tmpV = new Vector3();
const _mm = new Matrix4();
const _qq = new Quaternion();
const _ss = new Vector3();
const UP = new Vector3(0, 1, 0);

/** DNA double helix along a centreline: two sugar-phosphate backbones + base-pair rungs (instanced). */
export function Duplex(p: DuplexProps) {
  const cap = p.capBp;
  const strandA = useMemo(() => new PathBuf(cap), [cap]);
  const strandB = useMemo(() => new PathBuf(cap), [cap]);
  const mats = useDisposable(() => [nucleicMaterial(PALETTE.dna), nucleicMaterial(PALETTE.dnaBase)], []);
  const rungMats = useMemo(() => [mats[1]], [mats]);
  useKitHighlight(rungMats, p.id, { opacity: p.opacity, glow: p.glow, strength: 0.5 });
  const rungGeo = useDisposable(() => new CylinderGeometry(1, 1, 1, 8, 1), []);
  const ref = useRef<InstancedMesh>(null);
  const r = p.radius ?? 0.95;

  // resample + frames (parallel transport) → strands
  let nbp = 0;
  {
    const a = p.path;
    const n = p.n;
    strandA.clear();
    strandB.clear();
    if (n >= 2) {
      let seg = 0;
      let segPos = 0; // distance into current segment
      _P.set(a[0], a[1], a[2]);
      _T.set(a[3] - a[0], a[4] - a[1], a[5] - a[2]).normalize();
      if (Math.abs(_T.y) < 0.9) _N.set(0, 1, 0);
      else _N.set(1, 0, 0);
      _N.sub(_tmpV.copy(_T).multiplyScalar(_N.dot(_T))).normalize();
      let s = 0;
      while (nbp < cap) {
        // position at arc s
        _B.crossVectors(_T, _N).normalize();
        const th = s / BP * TWIST + (p.phase ?? 0);
        const ca = Math.cos(th);
        const sa = Math.sin(th);
        strandA.push(_P.x + (_N.x * ca + _B.x * sa) * r, _P.y + (_N.y * ca + _B.y * sa) * r, _P.z + (_N.z * ca + _B.z * sa) * r);
        const cb = Math.cos(th + GROOVE);
        const sb = Math.sin(th + GROOVE);
        strandB.push(_P.x + (_N.x * cb + _B.x * sb) * r, _P.y + (_N.y * cb + _B.y * sb) * r, _P.z + (_N.z * cb + _B.z * sb) * r);
        nbp++;
        // advance BP along the polyline
        let left = BP;
        let ended = false;
        while (left > 0) {
          if (seg >= n - 1) {
            ended = true;
            break;
          }
          const i = seg * 3;
          const dx = a[i + 3] - a[i];
          const dy = a[i + 4] - a[i + 1];
          const dz = a[i + 5] - a[i + 2];
          const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          const rem = L - segPos;
          if (left <= rem) {
            segPos += left;
            left = 0;
          } else {
            left -= rem;
            seg++;
            segPos = 0;
          }
        }
        if (ended) break;
        const i = seg * 3;
        const dx = a[i + 3] - a[i];
        const dy = a[i + 4] - a[i + 1];
        const dz = a[i + 5] - a[i + 2];
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const k = segPos / L;
        _P.set(a[i] + dx * k, a[i + 1] + dy * k, a[i + 2] + dz * k);
        // smooth tangent: blend with next segment near its end
        _Q.set(dx, dy, dz).normalize();
        if (seg + 2 < n) {
          const j = i + 3;
          _tmpV.set(a[j + 3] - a[j], a[j + 4] - a[j + 1], a[j + 5] - a[j + 2]).normalize();
          _Q.lerp(_tmpV, k * 0.5).normalize();
        }
        if (seg > 0) {
          const j = i - 3;
          _tmpV.set(a[j + 3] - a[j], a[j + 4] - a[j + 1], a[j + 5] - a[j + 2]).normalize();
          _Q.lerp(_tmpV, (1 - k) * 0.5).normalize();
        }
        _T.copy(_Q);
        _N.sub(_tmpV.copy(_T).multiplyScalar(_N.dot(_T)));
        if (_N.lengthSq() < 1e-10) _N.set(_T.y, -_T.x, 0);
        _N.normalize();
        s += BP;
      }
    }
  }

  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    let c = 0;
    for (let i = 0; i < nbp; i++) {
      strandA.get(i, _P);
      strandB.get(i, _Q);
      // rung = two half-bases meeting in the middle (slightly shorter than the backbone distance)
      _tmpV.subVectors(_Q, _P);
      const len = _tmpV.length();
      if (len < 1e-4) continue;
      _tmpV.divideScalar(len);
      _qq.setFromUnitVectors(UP, _tmpV);
      _ss.set(0.13, len * 0.86, 0.13);
      _P.add(_Q).multiplyScalar(0.5);
      _mm.compose(_P, _qq, _ss);
      im.setMatrixAt(c++, _mm);
    }
    im.count = c;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  });

  return (
    <group visible={(p.opacity ?? 1) > 0.002}>
      <DynTube path={strandA.a} n={nbp} radius={0.3} material={mats[0]} cap={cap} radial={10} id={p.id} opacity={p.opacity} glow={p.glow} strength={0.5} />
      <DynTube path={strandB.a} n={nbp} radius={0.3} material={mats[0]} cap={cap} radial={10} id={null} />
      <instancedMesh ref={ref} args={[rungGeo, mats[1], cap]} frustumCulled={false} />
    </group>
  );
}

/** Points on the backbone of a Duplex-like helix at base pair index i (for − charges): see Charges. */

// ———————————————————————————————————————— charges ————————————————————————————————————————

export interface ChargesProps {
  /** local positions */
  points: Vector3[] | V3[];
  /** count of points used */
  count?: number;
  sign: 1 | -1;
  size?: number;
  opacity?: number;
  color?: string;
}

const _wq = new Quaternion();
const _cq = new Quaternion();
/** Billboarded charge signs (+ blue / − red), instanced; they always face the camera. */
export function Charges(p: ChargesProps) {
  const geo = useDisposable(() => new RoundedBoxGeometry(1, 0.26, 0.18, 2, 0.08), []);
  const mat = useDisposable(() => {
    const c = new Color(p.color ?? (p.sign > 0 ? '#5aa9ff' : '#ff5a6e'));
    return new MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.35, clearcoat: 0.6, transparent: true, depthWrite: false, toneMapped: false });
  }, [p.sign, p.color]);
  const group = useRef<Group>(null);
  const hRef = useRef<InstancedMesh>(null);
  const vRef = useRef<InstancedMesh>(null);
  const n = p.count ?? p.points.length;
  const cap = p.points.length;
  const size = p.size ?? 1;
  mat.opacity = p.opacity ?? 1;
  useFrame((state) => {
    const g = group.current;
    if (!g || !hRef.current) return;
    g.getWorldQuaternion(_wq);
    _cq.copy(_wq).invert().multiply(state.camera.quaternion);
    const o = _obj;
    for (let i = 0; i < n; i++) {
      const pt = p.points[i];
      if (Array.isArray(pt)) o.position.set(pt[0], pt[1], pt[2]);
      else o.position.copy(pt);
      o.quaternion.copy(_cq);
      o.scale.setScalar(size);
      o.updateMatrix();
      hRef.current.setMatrixAt(i, o.matrix);
      if (vRef.current) {
        o.rotateZ(Math.PI / 2);
        o.updateMatrix();
        vRef.current.setMatrixAt(i, o.matrix);
      }
    }
    hRef.current.count = n;
    hRef.current.instanceMatrix.needsUpdate = true;
    if (vRef.current) {
      vRef.current.count = n;
      vRef.current.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <group ref={group} visible={(p.opacity ?? 1) > 0.01}>
      <instancedMesh ref={hRef} args={[geo, mat, cap]} frustumCulled={false} renderOrder={5} />
      {p.sign > 0 && <instancedMesh ref={vRef} args={[geo, mat, cap]} frustumCulled={false} renderOrder={5} />}
    </group>
  );
}
const _obj = new Object3D();

/** Utility: lerp a Quaternion pose pair. */
export function lerpPose(a: NucPose, b: NucPose, k: number, out: NucPose): NucPose {
  out.pos.lerpVectors(a.pos, b.pos, k);
  out.quat.slerpQuaternions(a.quat, b.quat, k);
  out.s = lerp(a.s ?? 1, b.s ?? 1, k);
  return out;
}

/** Quaternion from a basis given local y (axis) and local z (dyad) directions. */
export function quatFromAxes(yAxis: Vector3, zAxis: Vector3, out: Quaternion): Quaternion {
  const y = _a.copy(yAxis).normalize();
  const z = _b.copy(zAxis).sub(_c.copy(y).multiplyScalar(zAxis.dot(y))).normalize();
  const x = _c.crossVectors(y, z).normalize();
  _mm.makeBasis(x, y, z);
  return out.setFromRotationMatrix(_mm);
}

export { noise3 };
