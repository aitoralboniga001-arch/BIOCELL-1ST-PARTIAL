import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, CylinderGeometry, InstancedMesh, Matrix4, Object3D, Quaternion, SphereGeometry, TubeGeometry, Vector3 } from 'three';
import { rand, smooth, clamp, type V3 } from '@/engine/anim';
import { groupProps, useDisposable, type KitProps } from '../common';
import { curveFrom, lumpySphere, segmentMatrix } from '../geom';
import { useKitHighlight } from '../hooks';
import { nucleicMaterial, proteinMaterial } from '../materials';
import { PALETTE } from '../palette';

// ———————————————————————————————————————— Ribosome ————————————————————————————————————————

/**
 * Ribosome local frame (size = 1): small subunit on top (+y), large subunit below; the mRNA runs along x
 * through the groove between them at y = RIBOSOME.mrnaY; the exit tunnel opens at the bottom at
 * RIBOSOME.exit (−y). A bound ribosome sits with its exit over the translocon pore.
 * Multiply by `size` when placing things.
 */
export const RIBOSOME = { exit: [0, -1.0, 0] as V3, mrnaY: 0.36, top: 1.05, radius: 1.25 } as const;

let ribosomeGeoCache: { large: ReturnType<typeof lumpySphere>; small: ReturnType<typeof lumpySphere> } | null = null;
export function ribosomeGeometry() {
  if (ribosomeGeoCache) return ribosomeGeoCache;
  const large = lumpySphere({
    detail: 14,
    scale: [1.22, 0.78, 1.02],
    noise: 0.045,
    freq: 3.2,
    seed: 11,
    flattenY: { above: 0.62, k: 0.7 },
    bumps: [
      { dir: [0, 0.7, -0.7], amp: 0.2, width: 0.32 }, // central protuberance
      { dir: [-1, 0.55, 0.1], amp: 0.24, width: 0.28 }, // L1 stalk
      { dir: [1, 0.5, 0.25], amp: 0.18, width: 0.24 }, // P stalk
      { dir: [0.3, -0.4, 1], amp: 0.08, width: 0.5 },
      { dir: [0, -1, 0], amp: -0.16, width: 0.17 }, // exit tunnel mouth
    ],
  }).translate(0, -0.22, 0);
  const small = lumpySphere({
    detail: 12,
    scale: [1.12, 0.4, 0.7],
    noise: 0.05,
    freq: 3.6,
    seed: 23,
    bumps: [
      { dir: [-1, 0.3, 0.1], amp: 0.26, width: 0.42 }, // head
      { dir: [0.9, 0.1, 0.5], amp: 0.14, width: 0.35 }, // platform
      { dir: [0, -1, 0], amp: -0.12, width: 0.45 }, // mRNA groove
    ],
  }).translate(0, 0.66, 0.04);
  ribosomeGeoCache = { large, small };
  return ribosomeGeoCache;
}

export interface RibosomeProps extends KitProps {
  size?: number;
  state?: 'free' | 'bound';
  /** separate glow ids for the subunits (default: both use `id`) */
  largeId?: string;
  smallId?: string;
}

/** Ribosome: large (#8e7cc3) + small (#b9a7e6) subunit, recognisable lumpy textbook shape. */
export function Ribosome(p: RibosomeProps) {
  const g = ribosomeGeometry();
  const mats = useDisposable(() => [proteinMaterial(PALETTE.ribosomeLarge), proteinMaterial(PALETTE.ribosomeSmall)], []);
  const large = useMemo(() => [mats[0]], [mats]);
  const small = useMemo(() => [mats[1]], [mats]);
  useKitHighlight(large, p.largeId ?? p.id, { glow: p.glow, opacity: p.opacity, strength: 0.6 });
  useKitHighlight(small, p.smallId ?? p.id, { glow: p.glow, opacity: p.opacity, strength: 0.6 });
  const s = p.size ?? 1;
  const gp = groupProps(p);
  return (
    <group {...gp} scale={typeof p.scale === 'number' ? p.scale * s : s}>
      <mesh geometry={g.large} material={mats[0]} />
      <mesh geometry={g.small} material={mats[1]} />
    </group>
  );
}

// ———————————————————————————————————————— mRNA ————————————————————————————————————————

export interface MRNAProps extends KitProps {
  /** path (≥ 2 points) */
  points: V3[];
  /** 0..1 drawn fraction from the first point */
  length?: number;
  radius?: number;
  /** slide the bases along the strand (in bases): animate it while a ribosome translates */
  shift?: number;
  /** draw the little base stubs (default true) */
  bases?: boolean;
}

const BASE_TINTS = ['#9fd0ff', '#7fbfff', '#b8e0ff', '#6fb0f5'];

/** mRNA: thin blue strand with base stubs; grows with `length`, bases slide with `shift`. */
export function MRNA(p: MRNAProps) {
  const r = p.radius ?? 0.07;
  const key = JSON.stringify(p.points);
  const curve = useMemo(() => curveFrom(p.points), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const segs = Math.max(32, Math.round(curve.getLength() * 14));
  const RADIAL = 10;
  const geos = useDisposable(() => [new TubeGeometry(curve, segs, r, RADIAL, false), new CylinderGeometry(0.035, 0.045, 1, 6, 1).translate(0, 0.5, 0)], [curve, segs, r]);
  const mats = useDisposable(() => [nucleicMaterial(PALETTE.mrna), nucleicMaterial(PALETTE.mrnaBase)], []);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  const len = clamp(p.length ?? 1);
  useLayoutEffect(() => {
    geos[0].setDrawRange(0, Math.floor(len * segs) * RADIAL * 6);
  }, [geos, len, segs]);

  const L = curve.getLength();
  const SP = 0.17;
  const nBases = Math.floor(L / SP) + 1;
  const ref = useRef<InstancedMesh>(null);
  const showBases = p.bases ?? true;
  const shift = p.shift ?? 0;
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const pt = new Vector3();
    const tg = new Vector3();
    const up = new Vector3();
    const dir = new Vector3();
    const q = new Quaternion();
    const mat = new Matrix4();
    const col = new Color();
    const Y = new Vector3(0, 1, 0);
    const frac = ((shift % 1) + 1) % 1;
    const whole = Math.floor(shift);
    let n = 0;
    for (let i = 0; i < nBases; i++) {
      const d = (i + frac) * SP;
      if (d > L * len || d > L) continue;
      const u = d / L;
      curve.getPointAt(u, pt);
      curve.getTangentAt(u, tg);
      up.set(0, 1, 0);
      dir.copy(up).addScaledVector(tg, -up.dot(tg));
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
      dir.normalize();
      q.setFromUnitVectors(Y, dir);
      mat.compose(pt.addScaledVector(dir, r * 0.6), q, new Vector3(1, 0.16 + 0.04 * rand(i - whole), 1));
      m.setMatrixAt(n, mat);
      col.set(BASE_TINTS[Math.floor(rand((i - whole) * 3.1) * 4)]);
      m.setColorAt(n, col);
      n++;
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [curve, L, len, shift, nBases, r]);

  return (
    <group {...groupProps(p)}>
      <mesh geometry={geos[0]} material={mats[0]} />
      {showBases && <instancedMesh ref={ref} args={[geos[1], mats[1], nBases]} key={nBases} />}
    </group>
  );
}

// ———————————————————————————————————————— Polypeptide ————————————————————————————————————————

export interface PolypeptideProps extends KitProps {
  /** path from the point where the chain emerges (start) outwards; the N-terminus leads */
  points?: V3[];
  /** number of residues (beads) of the full chain (default 40) */
  count?: number;
  /** 0..1 fraction of the chain synthesised (pushed out along the path). Ignored if `made` given. */
  length?: number;
  /** residues synthesised (float) — alternative to `length` */
  made?: number;
  /** distance between residues along the path (default 0.2) */
  spacing?: number;
  radius?: number;
  /** colour runs [from, to, colour] as fractions of the full chain from the N-terminus */
  segments?: [number, number, string][];
  /** only draw residues with index in [from, to) (e.g. after a cleavage) */
  range?: [number, number];
  /** 0..1 collapse into a compact folded globule */
  folded?: number;
  /** centre of the folded globule (default: end of the path) */
  foldCenter?: V3;
  /** draw a soft protein surface around the folded globule (default true) */
  surface?: boolean;
  color?: string;
  seed?: number;
  /**
   * Advanced: custom placement. Called per residue i (0 = N-terminus) with `made`; write the local
   * position into `out` and return false to hide the residue. Overrides `points`.
   */
  layout?: (i: number, made: number, out: Vector3) => boolean;
}

/** Deterministic compact random-coil globule (bead positions, consecutive beads ≈ `spacing` apart). */
export function foldedPositions(n: number, spacing: number, seed = 5): Vector3[] {
  const out: Vector3[] = [];
  const pos = new Vector3();
  const dir = new Vector3(1, 0, 0);
  const rnd = new Vector3();
  const R = spacing * Math.cbrt(n) * 0.62;
  for (let i = 0; i < n; i++) {
    out.push(pos.clone());
    rnd.set(rand(seed * 31 + i * 3) - 0.5, rand(seed * 17 + i * 5) - 0.5, rand(seed * 13 + i * 7) - 0.5).multiplyScalar(2.2);
    const pull = Math.max(0, pos.length() - R * 0.6) / R;
    dir.add(rnd).addScaledVector(pos, -pull * 1.6 / Math.max(pos.length(), 1e-3)).normalize();
    pos.addScaledVector(dir, spacing);
  }
  // centre it
  const c = out.reduce((a, v) => a.add(v), new Vector3()).divideScalar(n);
  out.forEach((v) => v.sub(c));
  return out;
}

/**
 * Nascent / mature polypeptide as beads on a string. Grows by being pushed out along the path (the
 * N-terminus leads), colour runs mark the signal peptide etc., folds into a globule with `folded`.
 */
export function Polypeptide(p: PolypeptideProps) {
  const n = p.count ?? 40;
  const sp = p.spacing ?? 0.2;
  const rad = p.radius ?? 0.11;
  const made = p.made ?? (p.length ?? 1) * n;
  const key = JSON.stringify(p.points ?? []);
  const curve = useMemo(() => (p.points && p.points.length >= 2 ? curveFrom(p.points) : null), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const geos = useDisposable(() => [new SphereGeometry(rad, 16, 12), new CylinderGeometry(1, 1, 1, 6, 1)], [rad]);
  const mats = useDisposable(() => {
    const bead = proteinMaterial('#ffffff', { roughness: 0.45, emissive: 0 });
    const link = proteinMaterial('#ffffff', { roughness: 0.6, emissive: 0 });
    const surf = proteinMaterial(p.color ?? PALETTE.polypeptide, { roughness: 0.6 });
    surf.transparent = true;
    surf.opacity = 0.42;
    surf.depthWrite = false;
    return [bead, link, surf];
  }, [rad, p.color]);
  const chainMats = useMemo(() => [mats[0], mats[1]], [mats]);
  const surfMats = useMemo(() => [mats[2]], [mats]);
  const surfOpacity = (p.surface ?? true) ? smooth(clamp((smooth(clamp(p.folded ?? 0)) - 0.55) / 0.45)) : 0;
  useKitHighlight(chainMats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.5, mode: 'boost' });
  useKitHighlight(surfMats, p.id, { glow: p.glow, opacity: (p.opacity ?? 1) * surfOpacity, strength: 0.5 });
  const fold = useMemo(() => foldedPositions(n, sp * 0.95, p.seed ?? 5), [n, sp, p.seed]);
  const surfGeo = useDisposable(() => lumpySphere({ detail: 6, noise: 0.12, freq: 2.6, seed: p.seed ?? 5 }), [p.seed]);
  const surfR = useMemo(() => Math.max(...fold.map((v) => v.length())) + rad * 1.4, [fold, rad]);

  const beadRef = useRef<InstancedMesh>(null);
  const linkRef = useRef<InstancedMesh>(null);
  const scratch = useMemo(() => ({ pos: Array.from({ length: n }, () => new Vector3()), vis: new Float32Array(n), m: new Matrix4(), o: new Object3D(), c: new Color() }), [n]);

  const segKey = JSON.stringify(p.segments ?? []);
  const foldK = smooth(clamp(p.folded ?? 0));
  const [r0, r1] = p.range ?? [0, n];
  const fc = p.foldCenter;

  useLayoutEffect(() => {
    const beads = beadRef.current;
    const links = linkRef.current;
    if (!beads || !links) return;
    const { pos, vis, o, c, m } = scratch;
    const L = curve ? curve.getLength() : 1;
    const end = new Vector3();
    if (curve) curve.getPointAt(1, end);
    const center = fc ? new Vector3(...fc) : end;
    const tmp = new Vector3();
    for (let i = 0; i < n; i++) {
      const s = made - i; // residues out of the tunnel ahead of this one
      vis[i] = i >= r0 && i < r1 ? clamp(s + 0.6) : 0;
      if (p.layout) {
        if (!p.layout(i, made, pos[i])) vis[i] = 0;
      } else if (curve) {
        const d = Math.max(0, s) * sp;
        if (d <= L) curve.getPointAt(d / L, pos[i]);
        else {
          curve.getPointAt(1, pos[i]);
          curve.getTangentAt(1, tmp);
          pos[i].addScaledVector(tmp, d - L);
        }
      } else pos[i].set(0, -Math.max(0, s) * sp, 0);
      if (foldK > 0) pos[i].lerp(tmp.copy(fold[i]).add(center), foldK);
    }
    // colours by segment
    const segs = p.segments ?? [];
    const baseCol = p.color ?? PALETTE.polypeptide;
    let nb = 0;
    for (let i = 0; i < n; i++) {
      if (vis[i] <= 0.001) continue;
      o.position.copy(pos[i]);
      o.scale.setScalar(vis[i]);
      o.updateMatrix();
      beads.setMatrixAt(nb, o.matrix);
      const f = (i + 0.5) / n;
      const seg = segs.find(([a, b]) => f >= a && f < b);
      c.set(seg ? seg[2] : baseCol);
      beads.setColorAt(nb, c);
      nb++;
    }
    beads.count = nb;
    let nl = 0;
    for (let i = 0; i < n - 1; i++) {
      if (vis[i] < 0.5 || vis[i + 1] < 0.5) continue;
      segmentMatrix(pos[i], pos[i + 1], rad * 0.42, m);
      links.setMatrixAt(nl, m);
      const f = (i + 1) / n;
      const seg = segs.find(([a, b]) => f >= a && f < b);
      c.set(seg ? seg[2] : baseCol);
      links.setColorAt(nl, c);
      nl++;
    }
    links.count = nl;
    beads.instanceMatrix.needsUpdate = true;
    links.instanceMatrix.needsUpdate = true;
    if (beads.instanceColor) beads.instanceColor.needsUpdate = true;
    if (links.instanceColor) links.instanceColor.needsUpdate = true;
    beads.computeBoundingSphere();
    links.computeBoundingSphere();
  });

  const centerV: V3 = useMemo(() => {
    if (fc) return fc;
    if (curve) {
      const e = curve.getPointAt(1);
      return [e.x, e.y, e.z];
    }
    return [0, 0, 0];
  }, [fc?.[0], fc?.[1], fc?.[2], curve]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <group {...groupProps(p)}>
      <instancedMesh ref={beadRef} args={[geos[0], mats[0], n]} key={`b${n}`} />
      <instancedMesh ref={linkRef} args={[geos[1], mats[1], n]} key={`l${n}`} />
      {surfOpacity > 0.01 && (
        <mesh geometry={surfGeo} material={mats[2]} position={centerV} scale={surfR * (0.9 + 0.1 * surfOpacity)} renderOrder={5} />
      )}
    </group>
  );
}

// ———————————————————————————————————————— Polyribosome ————————————————————————————————————————

export interface PolyribosomeProps extends KitProps {
  /** mRNA path */
  points: V3[];
  count?: number;
  size?: number;
  /** translation progress shift (slides bases, grows chains) */
  progress?: number;
}

/** Polyribosome: several ribosomes along one mRNA, each with a nascent chain (older = longer). */
export function Polyribosome(p: PolyribosomeProps) {
  const count = p.count ?? 5;
  const size = p.size ?? 0.6;
  const key = JSON.stringify(p.points);
  const curve = useMemo(() => curveFrom(p.points), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const places = useMemo(() => {
    const out: { pos: V3; rot: V3 }[] = [];
    const o = new Object3D();
    const tg = new Vector3();
    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count;
      const pt = curve.getPointAt(u);
      curve.getTangentAt(u, tg);
      o.position.copy(pt);
      o.quaternion.setFromUnitVectors(new Vector3(1, 0, 0), tg);
      o.position.y -= RIBOSOME.mrnaY * size;
      out.push({ pos: [pt.x, pt.y - RIBOSOME.mrnaY * size, pt.z], rot: [0, -Math.atan2(tg.z, tg.x), Math.atan2(tg.y, Math.hypot(tg.x, tg.z))] });
    }
    return out;
  }, [curve, count, size]);
  const prog = p.progress ?? 0;
  return (
    <group {...groupProps(p)}>
      <MRNA points={p.points} id={p.id} shift={prog * 8} radius={0.05} />
      {places.map((pl, i) => (
        <group key={i} position={pl.pos} rotation={pl.rot}>
          <Ribosome size={size} id={p.id} glow={p.glow} opacity={p.opacity} />
          <Polypeptide
            count={24}
            made={Math.min(24, 3 + (count - 1 - i) * 4 + prog * 4)}
            spacing={0.13}
            radius={0.07}
            points={[
              [0, RIBOSOME.exit[1] * size, 0],
              [0.1, RIBOSOME.exit[1] * size - 0.5, 0.1],
              [0.5, RIBOSOME.exit[1] * size - 1.2, 0.3],
              [0.3, RIBOSOME.exit[1] * size - 2.4, 0.6],
            ]}
            opacity={p.opacity}
          />
        </group>
      ))}
    </group>
  );
}
