import { useLayoutEffect, useMemo, useRef } from 'react';
import { CatmullRomCurve3, Color, CylinderGeometry, IcosahedronGeometry, InstancedMesh, Matrix4, Object3D, SphereGeometry, TubeGeometry, Vector3 } from 'three';
import { clamp, rand, smooth, type V3 } from '@/engine/anim';
import { groupProps, useDisposable, type KitProps } from '../common';
import { fibonacciSphere, lumpySphere, segmentMatrix } from '../geom';
import { useKitHighlight } from '../hooks';
import { membraneMaterial, proteinMaterial, tintMaterial } from '../materials';
import { PALETTE } from '../palette';

// ———————————————————————————————————————— clathrin ————————————————————————————————————————

interface CageGraph {
  verts: Vector3[];
  edges: [number, number][];
}
let cageCache: CageGraph | null = null;
/** Dual of a geodesic icosphere: 12 pentagons + 30 hexagons (the clathrin "football" lattice). */
function cageGraph(): CageGraph {
  if (cageCache) return cageCache;
  const ico = new IcosahedronGeometry(1, 1);
  const pos = ico.getAttribute('position');
  const ids = new Map<string, number>();
  const vid = (i: number) => {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!ids.has(k)) ids.set(k, ids.size);
    return ids.get(k)!;
  };
  const faces: number[][] = [];
  const verts: Vector3[] = [];
  for (let f = 0; f < pos.count / 3; f++) {
    const tri = [vid(f * 3), vid(f * 3 + 1), vid(f * 3 + 2)];
    faces.push(tri);
    const c = new Vector3();
    for (let j = 0; j < 3; j++) c.add(new Vector3(pos.getX(f * 3 + j), pos.getY(f * 3 + j), pos.getZ(f * 3 + j)));
    verts.push(c.normalize());
  }
  const edges: [number, number][] = [];
  for (let a = 0; a < faces.length; a++)
    for (let b = a + 1; b < faces.length; b++) {
      const shared = faces[a].filter((v) => faces[b].includes(v)).length;
      if (shared === 2) edges.push([a, b]);
    }
  ico.dispose();
  cageCache = { verts, edges };
  return cageCache;
}

export interface ClathrinCageProps extends KitProps {
  radius?: number;
  /** 0..1 how much of the cage has assembled (grows from `from`) */
  amount?: number;
  /** direction the assembly starts from (default −y: the membrane side of a budding vesicle) */
  from?: V3;
  color?: string;
}

/** Clathrin cage: pentagon/hexagon lattice of struts with triskelion hubs; assembles with `amount`. */
export function ClathrinCage(p: ClathrinCageProps) {
  const R = p.radius ?? 1;
  const amount = clamp(p.amount ?? 1);
  const graph = cageGraph();
  const geos = useDisposable(() => [new CylinderGeometry(1, 1, 1, 8, 1), new SphereGeometry(1, 12, 10)], []);
  const mats = useDisposable(() => [proteinMaterial(p.color ?? PALETTE.clathrin, { roughness: 0.45 })], [p.color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.4 });
  const strut = useRef<InstancedMesh>(null);
  const hub = useRef<InstancedMesh>(null);
  const fromKey = (p.from ?? [0, -1, 0]).join(',');
  useLayoutEffect(() => {
    const s = strut.current;
    const h = hub.current;
    if (!s || !h) return;
    const from = new Vector3(...(p.from ?? [0, -1, 0])).normalize();
    const m = new Matrix4();
    const a = new Vector3();
    const b = new Vector3();
    const o = new Object3D();
    const reveal = (v: Vector3) => {
      const ang = Math.acos(clamp(v.dot(from), -1, 1)) / Math.PI; // 0 at `from`, 1 opposite
      return smooth(clamp((amount * 1.08 - ang) / 0.08));
    };
    let n = 0;
    for (const [i, j] of graph.edges) {
      a.copy(graph.verts[i]);
      b.copy(graph.verts[j]);
      const k = Math.min(reveal(a), reveal(b));
      if (k <= 0.01) continue;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      a.lerp(mid, 1 - k).multiplyScalar(R);
      b.lerp(mid, 1 - k).multiplyScalar(R);
      segmentMatrix(a, b, R * 0.045, m);
      s.setMatrixAt(n++, m);
    }
    s.count = n;
    let nh = 0;
    for (const v of graph.verts) {
      const k = reveal(v);
      if (k <= 0.01) continue;
      o.position.copy(v).multiplyScalar(R);
      o.scale.setScalar(R * 0.075 * k);
      o.updateMatrix();
      h.setMatrixAt(nh++, o.matrix);
    }
    h.count = nh;
    s.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
    s.computeBoundingSphere();
    h.computeBoundingSphere();
  }, [R, amount, fromKey, graph]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group {...groupProps(p)}>
      <instancedMesh ref={strut} args={[geos[0], mats[0], graph.edges.length]} />
      <instancedMesh ref={hub} args={[geos[1], mats[0], graph.verts.length]} />
    </group>
  );
}

/** A single clathrin triskelion (three bent legs from a hub), lying in the x/z plane. */
export function Triskelion(p: KitProps & { size?: number; color?: string }) {
  const geo = useDisposable(() => {
    const leg = (a: number) =>
      new CatmullRomCurve3([
        new Vector3(0, 0, 0),
        new Vector3(Math.cos(a) * 0.45, 0.05, Math.sin(a) * 0.45),
        new Vector3(Math.cos(a + 0.35) * 0.85, 0.02, Math.sin(a + 0.35) * 0.85),
        new Vector3(Math.cos(a + 0.6) * 1.05, -0.06, Math.sin(a + 0.6) * 1.05),
      ]);
    return [0, 1, 2].map((i) => new TubeGeometry(leg((i / 3) * Math.PI * 2), 24, 0.06, 8));
  }, []);
  const mats = useDisposable(() => [proteinMaterial(p.color ?? PALETTE.clathrin)], [p.color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  return (
    <group {...groupProps(p)}>
      <group scale={p.size ?? 1}>
        {geo.map((g, i) => (
          <mesh key={i} geometry={g} material={mats[0]} />
        ))}
        <mesh material={mats[0]}>
          <sphereGeometry args={[0.1, 16, 12]} />
        </mesh>
      </group>
    </group>
  );
}

// ———————————————————————————————————————— vesicle ————————————————————————————————————————

export interface VesicleProps extends KitProps {
  radius?: number;
  coat?: 'clathrin' | 'copi' | 'copii' | 'caveolin' | null;
  /** 0..1 coat assembled (1) or shed (0) */
  coatAmount?: number;
  /** where the coat starts assembling from (default −y) */
  coatFrom?: V3;
  cargo?: { count?: number; color?: string; kind?: 'soluble' | 'membrane'; seed?: number };
  lumenColor?: string;
  color?: string;
  /** separate glow id for the coat */
  coatId?: string;
}

const COAT_COLOR = { clathrin: PALETTE.clathrin, copi: PALETTE.copi, copii: PALETTE.copii, caveolin: PALETTE.caveolin } as const;

/** Transport vesicle: bilayer shell (two glossy translucent surfaces), tinted lumen, optional coat & cargo. */
export function Vesicle(p: VesicleProps) {
  const r = p.radius ?? 0.6;
  const mats = useDisposable(() => [membraneMaterial(p.color ?? PALETTE.membrane, 0.42), membraneMaterial(p.color ?? PALETTE.membrane, 0.3), tintMaterial(p.lumenColor ?? PALETTE.erLumen, 0.3)], [p.color, p.lumenColor]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.5 });
  const geos = useDisposable(() => [new SphereGeometry(1, 48, 36)], []);
  return (
    <group {...groupProps(p)}>
      <mesh geometry={geos[0]} material={mats[2]} scale={r * 0.9} renderOrder={1} />
      <mesh geometry={geos[0]} material={mats[1]} scale={r * 0.9} renderOrder={2} />
      <mesh geometry={geos[0]} material={mats[0]} scale={r} renderOrder={3} />
      {p.cargo && <Cargo r={r} {...p.cargo} opacity={p.opacity} />}
      {p.coat === 'clathrin' && <ClathrinCage radius={r * 1.28} amount={p.coatAmount ?? 1} from={p.coatFrom} id={p.coatId} opacity={p.opacity} />}
      {(p.coat === 'copi' || p.coat === 'copii' || p.coat === 'caveolin') && <BlobCoat r={r} kind={p.coat} amount={p.coatAmount ?? 1} from={p.coatFrom} id={p.coatId} opacity={p.opacity} />}
    </group>
  );
}

function Cargo(p: { r: number; count?: number; color?: string; kind?: 'soluble' | 'membrane'; seed?: number; opacity?: number }) {
  const n = p.count ?? 8;
  const geo = useDisposable(() => lumpySphere({ detail: 3, scale: [1, 0.9, 0.95], noise: 0.1, seed: 9 }), []);
  const mats = useDisposable(() => [proteinMaterial(p.color ?? PALETTE.cargo)], [p.color]);
  useKitHighlight(mats, undefined, { opacity: p.opacity });
  const items = useMemo(() => {
    const pts = fibonacciSphere(n);
    const seed = p.seed ?? 1;
    return pts.map((v, i) => {
      const k = p.kind === 'membrane' ? 0.92 : 0.25 + 0.45 * rand(seed * 7 + i);
      return { pos: v.multiplyScalar(p.r * k).toArray() as V3, s: p.r * (p.kind === 'membrane' ? 0.12 : 0.13 + 0.05 * rand(seed + i)) };
    });
  }, [n, p.r, p.kind, p.seed]);
  return (
    <group>
      {items.map((c, i) => (
        <mesh key={i} geometry={geo} material={mats[0]} position={c.pos} scale={c.s} />
      ))}
    </group>
  );
}

function BlobCoat(p: { r: number; kind: 'copi' | 'copii' | 'caveolin'; amount: number; from?: V3; id?: string; opacity?: number }) {
  const n = p.kind === 'caveolin' ? 90 : 70;
  const geo = useDisposable(() => lumpySphere({ detail: 3, scale: [1, 0.7, 1], noise: 0.12, seed: 17 }), []);
  const mats = useDisposable(() => [proteinMaterial(COAT_COLOR[p.kind])], [p.kind]);
  useKitHighlight(mats, p.id, { opacity: p.opacity });
  const ref = useRef<InstancedMesh>(null);
  const fromKey = (p.from ?? [0, -1, 0]).join(',');
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const from = new Vector3(...(p.from ?? [0, -1, 0])).normalize();
    const o = new Object3D();
    const pts =
      p.kind === 'caveolin'
        ? Array.from({ length: n }, (_, i) => {
            // striated rings (caveolin coat looks like spiral filaments)
            const ring = Math.floor(i / 10);
            const a = ((i % 10) / 10) * Math.PI * 2 + ring * 0.3;
            const y = -0.85 + ring * 0.2;
            const rr = Math.sqrt(Math.max(0, 1 - y * y));
            return new Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr);
          })
        : fibonacciSphere(n);
    let k = 0;
    for (const v of pts) {
      const ang = Math.acos(clamp(v.dot(from), -1, 1)) / Math.PI;
      const s = smooth(clamp((p.amount * 1.08 - ang) / 0.1));
      if (s <= 0.01) continue;
      o.position.copy(v).multiplyScalar(p.r * 1.1);
      o.lookAt(0, 0, 0);
      o.rotateX(Math.PI / 2);
      o.scale.setScalar(p.r * (p.kind === 'caveolin' ? 0.1 : 0.17) * s);
      o.updateMatrix();
      m.setMatrixAt(k++, o.matrix);
    }
    m.count = k;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [p.amount, p.r, p.kind, fromKey, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return <instancedMesh ref={ref} args={[geo, mats[0], n]} />;
}

/** Shared colour helper for scenes that tint cargo by destination. */
export const cargoColor = (c: string) => new Color(c);
