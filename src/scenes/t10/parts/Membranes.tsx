/**
 * Membrane renderers for axisymmetric profiles (see profile.ts):
 *  - <LipidRevolution>: instanced phospholipids (same head/tail geometry + materials as the kit <Bilayer>)
 *    laid out in rings along each leaflet of a profile — for molecular close-ups of budding, scission,
 *    fusion pores. Rings are indexed from the profile start, so the membrane only "flows" where it changes.
 *  - <SheetRevolution>: two smooth glossy translucent surfaces (the kit MembraneSheet / Vesicle look) for
 *    organelle-scale views.
 *  - <HoledSheet>: a flat smooth membrane with circular holes where SheetRevolution patches sit.
 * Both revolution renderers accept an angular cut-away (to look inside a bud / endosome in section).
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, InstancedMesh, Object3D, Path, Quaternion, Shape, ShapeGeometry, SphereGeometry, TubeGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rand } from '@/engine/anim';
import { groupProps, lipidHeadMaterial, lipidTailMaterial, membraneMaterial, PALETTE, useDisposable, useKitHighlight, type KitProps } from '@/three/kit';
import { Profile } from './profile';

// ———————————————————————————————————————— lipids ————————————————————————————————————————

/** Head + tail geometry exactly as the kit Bilayer builds it (so close-ups match everywhere). */
function lipidGeometries(spacing: number, thickness: number) {
  const half = thickness / 2;
  const headR = 0.125 * (spacing / 0.26);
  const head = new SphereGeometry(headR, 14, 10);
  const tailLen = half - headR * 0.6 - 0.04;
  const mk = (dx: number, kink: boolean) => {
    const pts = kink
      ? [new Vector3(dx, -headR * 0.5, 0), new Vector3(dx, -tailLen * 0.45, 0), new Vector3(dx + 0.05, -tailLen * 0.62, 0.02), new Vector3(dx + 0.07, -tailLen, 0.02)]
      : [new Vector3(dx, -headR * 0.5, 0), new Vector3(dx - 0.01, -tailLen * 0.5, 0.01), new Vector3(dx - 0.015, -tailLen, 0)];
    return new TubeGeometry(new CatmullRomCurve3(pts), 6, 0.034 * (spacing / 0.26), 5, false);
  };
  const a = mk(-0.045 * (spacing / 0.26), false);
  const b = mk(0.045 * (spacing / 0.26), true);
  const tails = mergeGeometries([a, b])!;
  a.dispose();
  b.dispose();
  return [head, tails];
}

export interface LipidRevolutionProps extends KitProps {
  profile: Profile;
  /** change detector; pass profile.sig() or any number that changes when the profile changes */
  sig: number;
  /** profile was built from the outer edge inwards (its normals point to −y): flip the leaflet sides */
  flip?: boolean;
  spacing?: number;
  thickness?: number;
  /** angular cut-away: skip lipids within ±width/2 of angle `center` (θ: x = r cosθ, z = r sinθ; +z = π/2) */
  cut?: { center: number; width: number };
  /** only draw rings whose start-distance is ≤ this (e.g. to stop at a seam) */
  maxS?: number;
  capacity?: number;
  seed?: number;
  headColor?: string;
}

const UP = new Vector3(0, 1, 0);
const _o = new Object3D();
const _q = new Quaternion();
const _qs = new Quaternion();
const _n = new Vector3();
const _c = new Color();
const SAMP = new Float32Array(4);

export function LipidRevolution(p: LipidRevolutionProps) {
  const spacing = p.spacing ?? 0.24;
  const thickness = p.thickness ?? 0.6;
  const half = thickness / 2;
  const cap = p.capacity ?? 6000;
  const geos = useDisposable(() => lipidGeometries(spacing, thickness), [spacing, thickness]);
  const mats = useDisposable(() => [lipidHeadMaterial(p.headColor ?? PALETTE.lipidHead), lipidTailMaterial(PALETTE.lipidTail)], [p.headColor]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.45 });
  const heads = useRef<InstancedMesh>(null);
  const tails = useRef<InstancedMesh>(null);
  const leaf = useMemo(() => new Profile(1024), []);
  const seed = p.seed ?? 5;
  const cutKey = p.cut ? `${p.cut.center.toFixed(3)},${p.cut.width.toFixed(3)}` : '';

  useLayoutEffect(() => {
    const H = heads.current;
    const T = tails.current;
    if (!H || !T) return;
    const prof = p.profile;
    const fl = p.flip ? -1 : 1;
    let k = 0;
    for (const side of [1, -1]) {
      // offset curve of this leaflet
      leaf.clear();
      for (let i = 0; i < prof.n; i++) {
        const o = side * fl * half;
        leaf.push(Math.max(0, prof.r[i] + prof.nr[i] * o), prof.y[i] + prof.ny[i] * o);
      }
      leaf.finish();
      const L = Math.min(leaf.length, p.maxS ?? Infinity);
      const rings = Math.floor(L / spacing + 1e-4);
      for (let ri = 0; ri <= rings && k < cap; ri++) {
        const d = ri * spacing + spacing * 0.5 * (ri === 0 ? 0 : 0);
        leaf.at(d, SAMP);
        const r = SAMP[0];
        const y = SAMP[1];
        const nr = SAMP[2] * fl;
        const ny = SAMP[3] * fl;
        const n = r < spacing * 0.5 ? (ri === 0 ? 1 : 1) : Math.max(1, Math.round((2 * Math.PI * r) / spacing));
        const phase = ri * 2.39996 + (side > 0 ? 0 : 0.7) + seed;
        for (let j = 0; j < n && k < cap; j++) {
          const jit = rand(seed * 131 + ri * 17 + j * 7 + (side > 0 ? 0 : 5000)) - 0.5;
          const th = phase + ((j + jit * 0.35) / n) * Math.PI * 2;
          if (p.cut) {
            let dd = Math.abs((((th - p.cut.center) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
            if (dd < p.cut.width / 2) continue;
          }
          const c = Math.cos(th);
          const s = Math.sin(th);
          const rr = r + jit * spacing * 0.08;
          _o.position.set(rr * c, y, rr * s);
          // local +y → outward normal of this leaflet (heads face the water)
          _n.set(nr * c * side, ny * side, nr * s * side).normalize();
          _q.setFromUnitVectors(UP, _n);
          _qs.setFromAxisAngle(UP, rand(seed + ri * 13 + j * 3) * Math.PI * 2);
          _o.quaternion.copy(_q).multiply(_qs);
          _o.scale.setScalar(0.93 + rand(seed + ri * 11 + j) * 0.12);
          _o.updateMatrix();
          H.setMatrixAt(k, _o.matrix);
          T.setMatrixAt(k, _o.matrix);
          _c.setScalar(0.9 + rand(seed + ri * 5 + j * 13) * 0.14);
          H.setColorAt(k, _c);
          k++;
        }
      }
    }
    H.count = k;
    T.count = k;
    H.instanceMatrix.needsUpdate = true;
    T.instanceMatrix.needsUpdate = true;
    if (H.instanceColor) H.instanceColor.needsUpdate = true;
    H.computeBoundingSphere();
    T.computeBoundingSphere();
  }, [p.sig, p.flip, spacing, half, cutKey, p.maxS, seed, cap]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <group {...groupProps(p)}>
      <instancedMesh ref={heads} args={[geos[0], mats[0], cap]} frustumCulled={false} />
      <instancedMesh ref={tails} args={[geos[1], mats[1], cap]} frustumCulled={false} />
    </group>
  );
}

// ———————————————————————————————————————— smooth sheets ————————————————————————————————————————

export interface SheetRevolutionProps extends KitProps {
  profile: Profile;
  sig: number;
  flip?: boolean;
  thickness?: number;
  color?: string;
  surfaceOpacity?: number;
  /** vertices along the profile (fixed) */
  along?: number;
  around?: number;
  /** angular range drawn (θ from thetaStart over thetaLength) — a cut-away when < 2π */
  thetaStart?: number;
  thetaLength?: number;
}

function gridIndex(a: number, b: number) {
  const idx: number[] = [];
  for (let i = 0; i < a - 1; i++)
    for (let j = 0; j < b - 1; j++) {
      const p0 = i * b + j;
      const p1 = p0 + 1;
      const p2 = p0 + b;
      const p3 = p2 + 1;
      idx.push(p0, p2, p1, p1, p2, p3);
    }
  return idx;
}

export function SheetRevolution(p: SheetRevolutionProps) {
  const A = p.along ?? 140;
  const B = (p.around ?? 96) + 1;
  const th = p.thickness ?? 0.1;
  const color = p.color ?? PALETTE.membrane;
  const mats = useDisposable(() => [membraneMaterial(color, p.surfaceOpacity ?? 0.5), membraneMaterial(color, (p.surfaceOpacity ?? 0.5) * 0.7)], [color, p.surfaceOpacity]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.5 });
  const geos = useDisposable(() => {
    const idx = gridIndex(A, B);
    return [0, 1].map(() => {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(A * B * 3), 3));
      g.setAttribute('normal', new BufferAttribute(new Float32Array(A * B * 3), 3));
      g.setIndex(idx);
      return g;
    });
  }, [A, B]);
  const t0 = p.thetaStart ?? 0;
  const tl = p.thetaLength ?? Math.PI * 2;
  useLayoutEffect(() => {
    const prof = p.profile;
    const fl = p.flip ? -1 : 1;
    const L = prof.length;
    for (let gi = 0; gi < 2; gi++) {
      const side = gi === 0 ? 1 : -1;
      const pos = geos[gi].getAttribute('position') as BufferAttribute;
      const nor = geos[gi].getAttribute('normal') as BufferAttribute;
      const P = pos.array as Float32Array;
      const N = nor.array as Float32Array;
      for (let i = 0; i < A; i++) {
        prof.at((L * i) / (A - 1), SAMP);
        const nr = SAMP[2] * fl;
        const ny = SAMP[3] * fl;
        const r = Math.max(0, SAMP[0] + nr * side * th * 0.5);
        const y = SAMP[1] + ny * side * th * 0.5;
        for (let j = 0; j < B; j++) {
          const a = t0 + (tl * j) / (B - 1);
          const c = Math.cos(a);
          const s = Math.sin(a);
          const o = (i * B + j) * 3;
          P[o] = r * c;
          P[o + 1] = y;
          P[o + 2] = r * s;
          N[o] = nr * c * side;
          N[o + 1] = ny * side;
          N[o + 2] = nr * s * side;
        }
      }
      pos.needsUpdate = true;
      nor.needsUpdate = true;
      geos[gi].computeBoundingSphere();
    }
  }, [p.sig, p.flip, th, t0, tl, geos]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group {...groupProps(p)}>
      <mesh geometry={geos[1]} material={mats[1]} renderOrder={2} />
      <mesh geometry={geos[0]} material={mats[0]} renderOrder={3} />
    </group>
  );
}

export interface HoledSheetProps extends KitProps {
  width: number;
  depth: number;
  holes: { x: number; z: number; r: number }[];
  thickness?: number;
  color?: string;
  surfaceOpacity?: number;
}

/** Flat smooth membrane (x/z plane, centre y = 0) with circular holes for SheetRevolution patches. */
export function HoledSheet(p: HoledSheetProps) {
  const th = p.thickness ?? 0.1;
  const color = p.color ?? PALETTE.plasmaMembrane;
  const mats = useDisposable(() => [membraneMaterial(color, p.surfaceOpacity ?? 0.5), membraneMaterial(color, (p.surfaceOpacity ?? 0.5) * 0.7)], [color, p.surfaceOpacity]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.5 });
  const key = JSON.stringify([p.width, p.depth, p.holes]);
  const geo = useDisposable(() => {
    const s = new Shape();
    const w = p.width / 2;
    const d = p.depth / 2;
    s.moveTo(-w, -d).lineTo(w, -d).lineTo(w, d).lineTo(-w, d).lineTo(-w, -d);
    for (const h of p.holes) {
      const path = new Path();
      // shape lives in (x, −z) once rotated; hole circles sampled like SheetRevolution (96 segs)
      path.absarc(h.x, -h.z, h.r, 0, Math.PI * 2, true);
      s.holes.push(path);
    }
    const g = new ShapeGeometry(s, 48);
    g.rotateX(-Math.PI / 2);
    // densify normals (all up)
    const n = g.getAttribute('normal') as BufferAttribute;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    return g;
  }, [key]);
  return (
    <group {...groupProps(p)}>
      <mesh geometry={geo} material={mats[1]} position={[0, -th / 2, 0]} renderOrder={2} />
      <mesh geometry={geo} material={mats[0]} position={[0, th / 2, 0]} renderOrder={3} />
    </group>
  );
}

/** Convenience: build a profile once (memoised) with a builder function. */
export function useProfile(cap = 512) {
  return useMemo(() => new Profile(cap), [cap]);
}
