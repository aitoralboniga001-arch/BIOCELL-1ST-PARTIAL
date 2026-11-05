import { useLayoutEffect, useMemo, useRef } from 'react';
import { BufferGeometry, CapsuleGeometry, CatmullRomCurve3, InstancedMesh, LatheGeometry, Object3D, SphereGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, rand, type V3 } from '@/engine/anim';
import { groupProps, useDisposable, type KitProps } from '../common';
import { bendGeometry, fibonacciSphere, lumpySphere } from '../geom';
import { useKitHighlight } from '../hooks';
import { membraneMaterial, proteinMaterial, tintMaterial } from '../materials';
import { PALETTE } from '../palette';
import { ribosomeGeometry } from './translation';
import { Vesicle } from './vesicles';
import { MembraneSheet } from './membrane';

/** Flattened disc profile with a swollen rounded rim (cisterna cross-section), for LatheGeometry. */
function cisternaProfile(r: number, h: number): Vector2[] {
  const pts: Vector2[] = [];
  const rim = h * 0.9;
  const cx = r - rim;
  pts.push(new Vector2(0.0001, -h * 0.5));
  for (let i = 0; i <= 10; i++) pts.push(new Vector2((cx * i) / 10, -h * 0.5 - Math.sin((i / 10) * Math.PI) * h * 0.03));
  for (let i = 0; i <= 24; i++) {
    const a = -Math.PI / 2 + (i / 24) * Math.PI;
    pts.push(new Vector2(cx + Math.cos(a) * rim, Math.sin(a) * rim * 0.92));
  }
  for (let i = 10; i >= 0; i--) pts.push(new Vector2((cx * i) / 10, h * 0.5));
  return pts;
}

export interface CisternaProps extends KitProps {
  radius?: number;
  /** thickness of the flat part */
  thickness?: number;
  /** y += bend·r² (cis face convex / trans concave: use ±) */
  bend?: number;
  color?: string;
  lumenColor?: string;
  /** squash the disc in z (oval cisternae) */
  aspect?: number;
}

/** One flattened membrane sac with a swollen rim (Golgi / ER cisterna); translucent with a tinted lumen. */
export function Cisterna(p: CisternaProps) {
  const r = p.radius ?? 2;
  const h = p.thickness ?? 0.22;
  const geos = useDisposable(() => {
    const outer = bendGeometry(new LatheGeometry(cisternaProfile(r, h), 96), p.bend ?? 0);
    const inner = bendGeometry(new LatheGeometry(cisternaProfile(r * 0.97, h * 0.62), 72), p.bend ?? 0);
    return [outer, inner];
  }, [r, h, p.bend]);
  const mats = useDisposable(() => [membraneMaterial(p.color ?? PALETTE.golgiMembrane, 0.62), tintMaterial(p.lumenColor ?? PALETTE.golgiLumen, 0.5)], [p.color, p.lumenColor]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.5 });
  return (
    <group {...groupProps(p)}>
      <group scale={[1, 1, p.aspect ?? 1]}>
        <mesh geometry={geos[1]} material={mats[1]} renderOrder={1} />
        <mesh geometry={geos[0]} material={mats[0]} renderOrder={2} />
      </group>
    </group>
  );
}

export interface GolgiStackProps extends KitProps {
  n?: number;
  /** curvature of the stack (cis face convex towards −y) */
  bend?: number;
  spacing?: number;
  radius?: number;
  /** glow ids per cisterna, cis (bottom, index 0) → trans (top) */
  ids?: string[];
  /** small vesicles at the rims */
  vesicles?: number;
}

/** Golgi stack: n cisternae from cis (−y, faces the ER) to trans (+y), curved, with rim vesicles. */
export function GolgiStack(p: GolgiStackProps) {
  const n = p.n ?? 5;
  const sp = p.spacing ?? 0.42;
  const R = p.radius ?? 2.2;
  const bend = p.bend ?? 0.06;
  const ves = useMemo(
    () =>
      Array.from({ length: p.vesicles ?? 6 }, (_, i) => {
        const a = rand(i * 7) * Math.PI * 2;
        const y = (rand(i * 3) - 0.5) * n * sp;
        const rr = R * (1.02 + rand(i) * 0.12);
        return [Math.cos(a) * rr, y + bend * rr * rr * 0.9, Math.sin(a) * rr * 0.75] as V3;
      }),
    [p.vesicles, n, sp, R, bend],
  );
  return (
    <group {...groupProps(p)}>
      {Array.from({ length: n }, (_, i) => {
        const k = n === 1 ? 0 : i / (n - 1);
        return <Cisterna key={i} position={[0, (i - (n - 1) / 2) * sp, 0]} radius={R * (1.04 - 0.14 * Math.abs(k - 0.45))} bend={bend} aspect={0.75} id={p.ids?.[i] ?? p.id} glow={p.glow} opacity={p.opacity} />;
      })}
      {ves.map((v, i) => (
        <Vesicle key={i} position={v} radius={0.2} color={PALETTE.golgiMembrane} lumenColor={PALETTE.golgiLumen} opacity={p.opacity} />
      ))}
    </group>
  );
}

export interface ERSheetProps extends KitProps {
  width?: number;
  depth?: number;
  thickness?: number;
  /** number of bound ribosomes on the cytosolic faces (0 = smooth) */
  ribosomes?: number;
  seed?: number;
  ribosomeId?: string;
}

/** A flattened RER sheet (cisterna) studded with ribosomes on its cytosolic faces. */
export function ERSheet(p: ERSheetProps) {
  const w = p.width ?? 6;
  const d = p.depth ?? 3.5;
  const th = p.thickness ?? 0.35;
  const geos = useDisposable(() => [new RoundedBoxGeometry(w, th, d, 6, th * 0.49), new RoundedBoxGeometry(w * 0.98, th * 0.6, d * 0.97, 4, th * 0.29)], [w, d, th]);
  const mats = useDisposable(() => [membraneMaterial(PALETTE.erMembrane, 0.6), tintMaterial(PALETTE.erLumen, 0.55)], []);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.5 });
  const rmats = useDisposable(() => [proteinMaterial(PALETTE.ribosomeLarge), proteinMaterial(PALETTE.ribosomeSmall)], []);
  useKitHighlight(rmats, p.ribosomeId, { glow: p.glow, opacity: p.opacity });
  const nr = p.ribosomes ?? 40;
  const L = useRef<InstancedMesh>(null);
  const S = useRef<InstancedMesh>(null);
  const rg = ribosomeGeometry();
  useLayoutEffect(() => {
    if (!L.current || !S.current) return;
    const o = new Object3D();
    const seed = p.seed ?? 1;
    for (let i = 0; i < nr; i++) {
      const top = i % 2 === 0;
      o.position.set((rand(seed * 13 + i) - 0.5) * (w - 0.4), (top ? 1 : -1) * (th / 2 + 0.17), (rand(seed * 29 + i) - 0.5) * (d - 0.4));
      o.rotation.set(top ? 0 : Math.PI, rand(seed + i) * 6.28, 0);
      o.scale.setScalar(0.16);
      o.updateMatrix();
      L.current.setMatrixAt(i, o.matrix);
      S.current.setMatrixAt(i, o.matrix);
    }
    L.current.instanceMatrix.needsUpdate = true;
    S.current.instanceMatrix.needsUpdate = true;
    L.current.computeBoundingSphere();
    S.current.computeBoundingSphere();
  }, [nr, w, d, th, p.seed]);
  return (
    <group {...groupProps(p)}>
      <mesh geometry={geos[1]} material={mats[1]} renderOrder={1} />
      <mesh geometry={geos[0]} material={mats[0]} renderOrder={2} />
      {nr > 0 && (
        <>
          <instancedMesh ref={L} args={[rg.large, rmats[0], nr]} key={`l${nr}`} />
          <instancedMesh ref={S} args={[rg.small, rmats[1], nr]} key={`s${nr}`} />
        </>
      )}
    </group>
  );
}

export interface ERTubulesProps extends KitProps {
  seed?: number;
  /** nodes in the network */
  count?: number;
  /** half-size of the region [x, y, z] */
  extent?: V3;
  radius?: number;
}

/** Smooth ER: a network of twisted, branching membrane tubules (no ribosomes). */
export function ERTubules(p: ERTubulesProps) {
  const seed = p.seed ?? 1;
  const n = p.count ?? 18;
  const [ex, ey, ez] = p.extent ?? [3, 0.8, 2];
  const r = p.radius ?? 0.14;
  const geo = useDisposable(() => {
    const nodes = Array.from({ length: n }, (_, i) => new Vector3((rand(seed * 11 + i) - 0.5) * 2 * ex, (rand(seed * 17 + i) - 0.5) * 2 * ey, (rand(seed * 23 + i) - 0.5) * 2 * ez));
    const edges = new Set<string>();
    nodes.forEach((a, i) => {
      const near = nodes.map((b, j) => ({ j, d: a.distanceTo(b) })).filter((x) => x.j !== i).sort((x, y) => x.d - y.d).slice(0, 2 + (i % 2));
      near.forEach(({ j }) => edges.add(i < j ? `${i}-${j}` : `${j}-${i}`));
    });
    const parts: BufferGeometry[] = [];
    let k = 0;
    for (const e of edges) {
      const [i, j] = e.split('-').map(Number);
      const a = nodes[i];
      const b = nodes[j];
      const m = a.clone().lerp(b, 0.5).add(new Vector3(rand(k * 3 + seed) - 0.5, (rand(k * 5 + seed) - 0.5) * 0.6, rand(k * 7 + seed) - 0.5).multiplyScalar(0.6));
      parts.push(new TubeGeometry(new CatmullRomCurve3([a, m, b]), 24, r, 10, false));
      k++;
    }
    nodes.forEach((v) => parts.push(new SphereGeometry(r * 1.35, 14, 10).translate(v.x, v.y, v.z)));
    const clean = parts.map((g) => {
      g.deleteAttribute('uv');
      return g.index ? g.toNonIndexed() : g;
    });
    const merged = mergeGeometries(clean)!;
    parts.forEach((g) => g.dispose());
    return merged;
  }, [seed, n, ex, ey, ez, r]);
  const mats = useDisposable(() => [membraneMaterial(PALETTE.erMembrane, 0.85)], []);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.5 });
  return (
    <group {...groupProps(p)}>
      <mesh geometry={geo} material={mats[0]} />
    </group>
  );
}

// ———————————————————————————————————————— cell-scale ————————————————————————————————————————

export interface CellBodyProps extends KitProps {
  radius?: number;
  /** [x, y, z] scale of the sphere (e.g. [1.3, 0.8, 1]) */
  squash?: V3;
  color?: string;
}

/** The plasma membrane of a whole cell: big translucent glossy shell (low opacity so organelles show). */
export function CellBody(p: CellBodyProps) {
  const r = p.radius ?? 8;
  return (
    <group {...groupProps(p)}>
      <group scale={p.squash ?? [1.25, 0.82, 1]}>
        <MembraneSheet shape="sphere" radius={r} thickness={0.12} color={p.color ?? PALETTE.plasmaMembrane} lumenColor="#1a2027" surfaceOpacity={0.16} id={p.id} glow={p.glow} opacity={p.opacity} />
      </group>
    </group>
  );
}

export interface NucleusProps extends KitProps {
  radius?: number;
  /** nuclear pores on the envelope */
  pores?: number;
  nucleolus?: boolean;
  envelopeId?: string;
  poreId?: string;
  nucleolusId?: string;
}

/** Nucleus: double-membrane envelope (translucent) with pores, nucleoplasm tint and a nucleolus. */
export function Nucleus(p: NucleusProps) {
  const r = p.radius ?? 2.5;
  const np = p.pores ?? 40;
  const poreGeo = useDisposable(() => new TorusGeometry(0.16 * (r / 2.5), 0.06 * (r / 2.5), 10, 24), [r]);
  const mats = useDisposable(() => [proteinMaterial(PALETTE.nuclearPore), proteinMaterial(PALETTE.nucleolus)], []);
  useKitHighlight([mats[0]], p.poreId ?? p.id, { glow: p.glow, opacity: p.opacity });
  useKitHighlight([mats[1]], p.nucleolusId ?? p.id, { glow: p.glow, opacity: p.opacity });
  const nucleolusGeo = useDisposable(() => lumpySphere({ detail: 7, noise: 0.12, freq: 2.5, seed: 77 }), []);
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new Object3D();
    fibonacciSphere(np).forEach((v, i) => {
      o.position.copy(v).multiplyScalar(r);
      o.lookAt(0, 0, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [np, r]);
  return (
    <group {...groupProps(p)}>
      <MembraneSheet shape="sphere" radius={r} thickness={0.1} color={PALETTE.nuclearEnvelope} lumenColor={PALETTE.nucleoplasm} surfaceOpacity={0.4} id={p.envelopeId ?? p.id} glow={p.glow} opacity={p.opacity} />
      <instancedMesh ref={ref} args={[poreGeo, mats[0], np]} key={np} />
      {(p.nucleolus ?? true) && <mesh geometry={nucleolusGeo} material={mats[1]} scale={r * 0.3} position={[r * 0.2, r * 0.1, 0]} />}
    </group>
  );
}

export interface MitochondrionProps extends KitProps {
  length?: number;
  radius?: number;
}

/** Mitochondrion: translucent outer capsule with folded cristae inside (NOT an endomembrane organelle). */
export function Mitochondrion(p: MitochondrionProps) {
  const L = p.length ?? 2.4;
  const R = p.radius ?? 0.6;
  const geos = useDisposable(() => {
    const outer = new CapsuleGeometry(R, L - 2 * R, 16, 48).rotateZ(Math.PI / 2);
    const matrix = new CapsuleGeometry(R * 0.86, L - 2 * R, 12, 40).rotateZ(Math.PI / 2);
    const cristae: BufferGeometry[] = [];
    const n = Math.max(3, Math.round(L / 0.35));
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + R * 0.7 + (i / (n - 1)) * (L - R * 1.4);
      const top = i % 2 === 0;
      const plate = lumpySphere({ detail: 4, scale: [0.06, R * 0.62, R * 0.8], noise: 0.08, seed: i + 3 }).translate(x, top ? R * 0.3 : -R * 0.3, 0);
      cristae.push(plate.index ? plate.toNonIndexed() : plate);
    }
    return [outer, matrix, mergeGeometries(cristae)!];
  }, [L, R]);
  const mats = useDisposable(() => [membraneMaterial(PALETTE.mitochondrion, 0.45), tintMaterial(PALETTE.mitoMatrix, 0.5), proteinMaterial(PALETTE.mitochondrion, { roughness: 0.4 })], []);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.5 });
  return (
    <group {...groupProps(p)}>
      <mesh geometry={geos[1]} material={mats[1]} renderOrder={1} />
      <mesh geometry={geos[2]} material={mats[2]} />
      <mesh geometry={geos[0]} material={mats[0]} renderOrder={2} />
    </group>
  );
}

/** Lysosome: vesicle with a dark-orange acidic lumen and hydrolase cargo. */
export function Lysosome(p: KitProps & { radius?: number }) {
  return <Vesicle {...p} radius={p.radius ?? 0.7} color={PALETTE.lysosome} lumenColor={PALETTE.lysosome} cargo={{ count: 10, color: PALETTE.hydrolase }} />;
}

export interface EndosomeProps extends KitProps {
  kind?: 'early' | 'late' | 'recycling';
  radius?: number;
  /** 0..1 intraluminal vesicles (late endosome / MVB) */
  ilv?: number;
}

/** Endosome: early (vesicle + tubules, peripheral), late/MVB (round, intraluminal vesicles), recycling (tubular). */
export function Endosome(p: EndosomeProps) {
  const kind = p.kind ?? 'early';
  const r = p.radius ?? 0.8;
  const color = kind === 'late' ? PALETTE.lateEndosome : kind === 'recycling' ? PALETTE.recyclingEndosome : PALETTE.earlyEndosome;
  const tubes = useMemo<V3[][]>(
    () =>
      kind === 'late'
        ? []
        : Array.from({ length: kind === 'recycling' ? 4 : 3 }, (_, i) => {
            const a = (i / 3) * Math.PI * 2 + 0.4;
            const len = r * (kind === 'recycling' ? 2.4 : 1.8);
            return [
              [Math.cos(a) * r * 0.8, 0, Math.sin(a) * r * 0.8],
              [Math.cos(a + 0.2) * (r + len * 0.5), (rand(i) - 0.5) * r * 0.6, Math.sin(a + 0.2) * (r + len * 0.5)],
              [Math.cos(a + 0.35) * (r + len), (rand(i + 5) - 0.5) * r, Math.sin(a + 0.35) * (r + len)],
            ];
          }),
    [kind, r],
  );
  const ilvN = Math.round(clamp(p.ilv ?? (kind === 'late' ? 1 : 0)) * 12);
  const ilv = useMemo(() => fibonacciSphere(12).map((v, i) => v.multiplyScalar(r * (0.35 + 0.3 * rand(i))).toArray() as V3), [r]);
  return (
    <group {...groupProps(p)}>
      <Vesicle radius={kind === 'recycling' ? r * 0.6 : r} color={color} lumenColor={color} id={p.id} glow={p.glow} opacity={p.opacity} />
      {tubes.map((pts, i) => (
        <MembraneSheet key={i} shape="tube" points={pts} radius={r * 0.16} thickness={0.03} color={color} lumenColor={color} id={p.id} glow={p.glow} opacity={p.opacity} />
      ))}
      {ilv.slice(0, ilvN).map((v, i) => (
        <Vesicle key={i} position={v} radius={r * 0.16} color={color} lumenColor="#1e2a4a" opacity={p.opacity} />
      ))}
    </group>
  );
}

