/**
 * Molecules of the t9-copii scene (COPII budding at the ER, molecular close-up):
 *  - <Sar1>: the small GTPase. Globular body + a "switch" lobe that closes over the nucleotide when ON +
 *    the hidden amphipathic/hydrophobic tail, which swings out of its groove when GTP is bound and can dip
 *    into the cytosolic leaflet. Body frame: +y = away from the membrane.
 *  - <CargoReceptor>: transmembrane rod, short cytosolic tail (+y, bound by Sec24), lumenal Y-shaped
 *    domain (−y) holding a soluble cargo molecule.
 *  - <Sec2324>: the adaptor heterodimer as a "bow-tie" of two lobes (Sec23 over Sar1, Sec24 over the
 *    receptor tail) — dark COPII green, the INNER layer.
 *  - <CopiiCage>: the Sec13/31 OUTER layer — a lattice of light-green rods with knobs at the vertices,
 *    drawn between node positions computed by the scene (so it follows the bending membrane).
 *
 * Colours: COPII palette entry for the outer cage (lightened), a darker shade for the adaptors so the
 * two layers stay distinguishable; Sar1 from PALETTE.sar1.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { BufferAttribute, Color, CylinderGeometry, IcosahedronGeometry, InstancedMesh, Object3D, Quaternion, Vector3 } from 'three';
import { clamp, lerp, smooth, type V3 } from '@/engine/anim';
import { groupProps, lumpySphere, PALETTE, Protein, proteinMaterial, useDisposable, useKitHighlight, type KitProps } from '@/three/kit';
import { Capsule } from '../../t7/parts/molecules';

const shade = (hex: string, k: number, toWhite = 0) => {
  const c = new Color(hex);
  if (toWhite > 0) c.lerp(new Color('#ffffff'), toWhite);
  else c.multiplyScalar(k);
  return `#${c.getHexString()}`;
};

export const COL = {
  sar1: PALETTE.sar1,
  sar1Lobe: shade(PALETTE.sar1, 1, 0.22),
  /** hydrophobic tail: deeper orange so it reads as a distinct segment */
  sar1Tail: shade(PALETTE.sar1, 0.72),
  sec23: shade(PALETTE.copii, 0.5),
  sec24: shade(PALETTE.copii, 0.62),
  cage: shade(PALETTE.copii, 1, 0.12),
  cageNode: shade(PALETTE.copii, 1, 0.35),
  /** glossary colour of `cargo-receptor` (t9.ts) */
  receptor: '#ff8787',
  cargo: PALETTE.cargo,
} as const;

// ———————————————————————————————————————— Sar1 ————————————————————————————————————————

/** Nucleotide pocket in the Sar1 body frame (top-front, facing the viewer). */
export const SAR1_POCKET: V3 = [0.12, 0.44, 0.4];
const TAIL_A: V3 = [-0.44, -0.08, 0.05];

export interface Sar1Props extends KitProps {
  quaternion?: [number, number, number, number];
  /** 0 = OFF (GDP shape: lobe open) … 1 = ON (GTP shape: lobe closed over the nucleotide) */
  on: number;
  /** 0 = tail hidden in its groove (up along the flank) … 1 = tail swung out, pointing to the membrane */
  tail: number;
  tailGlow?: number;
  tailId?: string | string[];
}

export function Sar1(p: Sar1Props) {
  const phi = Math.PI * smooth(clamp(p.tail));
  const L = lerp(0.62, 1.02, smooth(clamp(p.tail)));
  const dx = -Math.sin(phi) * 0.5;
  const dy = Math.cos(phi);
  const dz = Math.sin(phi) * 0.12;
  const l = Math.hypot(dx, dy, dz) || 1;
  const b: V3 = [TAIL_A[0] + (dx / l) * L, TAIL_A[1] + (dy / l) * L, TAIL_A[2] + (dz / l) * L];
  const lobe: V3 = [lerp(0.5, 0.2, p.on), lerp(0.36, 0.52, p.on), lerp(0.05, 0.3, p.on)];
  return (
    <group position={p.position} quaternion={p.quaternion}>
      <Protein id={p.id} shape="blob" color={COL.sar1} size={1.15} seed={4} opacity={p.opacity} glow={(p.glow ?? 0) + 0.18 * p.on} />
      <Protein id={p.id} shape="blob" color={COL.sar1Lobe} size={0.5} seed={12} position={lobe} opacity={p.opacity} glow={(p.glow ?? 0) + 0.25 * p.on} />
      <Capsule id={p.tailId ?? p.id} a={TAIL_A} b={b} r={0.12} color={COL.sar1Tail} opacity={p.opacity} glow={p.tailGlow} />
    </group>
  );
}

// ———————————————————————————————————————— cargo receptor ————————————————————————————————————————

export function CargoReceptor(p: KitProps & { quaternion?: [number, number, number, number]; cargo?: number; cargoSeed?: number }) {
  return (
    <group position={p.position} quaternion={p.quaternion}>
      <Capsule id={p.id} a={[0, -0.78, 0]} b={[0, 0.78, 0]} r={0.15} color={COL.receptor} opacity={p.opacity} glow={p.glow} />
      <Capsule id={p.id} a={[0, 0.7, 0]} b={[0.08, 1.38, 0.04]} r={0.1} color={COL.receptor} opacity={p.opacity} glow={p.glow} />
      <Protein id={p.id} shape="blob" color={COL.receptor} size={0.34} seed={31} position={[0.1, 1.46, 0.05]} opacity={p.opacity} glow={p.glow} />
      <Protein id={p.id} shape="y" color={COL.receptor} size={1.15} seed={7} position={[0, -1.32, 0]} rotation={[0, 0, Math.PI]} opacity={p.opacity} glow={p.glow} />
      <Protein shape="blob" color={COL.cargo} size={0.62} seed={p.cargoSeed ?? 3} position={[0, -2.0, 0]} opacity={(p.opacity ?? 1) * (p.cargo ?? 1)} />
    </group>
  );
}

// ———————————————————————————————————————— Sec23/24 ————————————————————————————————————————

/** Bow-tie adaptor: `a` = Sec23 lobe centre, `b` = Sec24 lobe centre (world). */
export function Sec2324(p: KitProps & { a: V3; b: V3 }) {
  return (
    <group>
      <Protein id={p.id} shape="blob" color={COL.sec23} size={1.12} seed={21} position={p.a} opacity={p.opacity} glow={p.glow} />
      <Protein id={p.id} shape="blob" color={COL.sec24} size={1.12} seed={22} position={p.b} opacity={p.opacity} glow={p.glow} />
    </group>
  );
}

// ———————————————————————————————————————— Sec13/31 cage ————————————————————————————————————————

export interface CageLattice {
  /** unit directions of the lattice vertices (sphere, +y = bud tip) */
  dirs: V3[];
  /** pairs of vertex indices */
  edges: [number, number][];
}

/** Geodesic lattice (icosahedron, detail 1) limited to a polar cap of half-angle `maxA` around +y. */
export function makeCageLattice(maxA: number): CageLattice {
  const g = new IcosahedronGeometry(1, 1);
  const pos = g.getAttribute('position') as BufferAttribute;
  const verts: Vector3[] = [];
  const idx: number[] = [];
  // tilt so a vertex sits near the tip
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0.618).normalize(), new Vector3(0, 1, 0));
  for (let i = 0; i < pos.count; i++) {
    const v = new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize().applyQuaternion(q);
    let k = verts.findIndex((w) => w.distanceToSquared(v) < 1e-6);
    if (k < 0) {
      verts.push(v);
      k = verts.length - 1;
    }
    idx.push(k);
  }
  g.dispose();
  const keep = verts.map((v) => Math.acos(clamp(v.y, -1, 1)) <= maxA);
  const remap = new Map<number, number>();
  const dirs: V3[] = [];
  verts.forEach((v, i) => {
    if (!keep[i]) return;
    remap.set(i, dirs.length);
    dirs.push([v.x, v.y, v.z]);
  });
  const seen = new Set<string>();
  const edges: [number, number][] = [];
  for (let f = 0; f < idx.length; f += 3) {
    for (const [a, b] of [
      [idx[f], idx[f + 1]],
      [idx[f + 1], idx[f + 2]],
      [idx[f + 2], idx[f]],
    ]) {
      if (!keep[a] || !keep[b]) continue;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([remap.get(a)!, remap.get(b)!]);
    }
  }
  return { dirs, edges };
}

const _o = new Object3D();
const _a = new Vector3();
const _b = new Vector3();
const _m = new Vector3();
const _d = new Vector3();
const _c = new Vector3();
const UP = new Vector3(0, 1, 0);

export interface CopiiCageProps extends KitProps {
  lattice: CageLattice;
  /** node positions (world), xyz per node — written by the scene each render */
  nodes: Float32Array;
  /** per node 0..1: arrived (scale) */
  shown: Float32Array;
  /** per edge 0..1: drifted away (disassembly) */
  edgeRelease: Float32Array;
  /** centre the released rods drift away from */
  centre: V3;
}

/** Sec13/31 outer cage: rods along the lattice edges + knobs at the vertices (instanced). */
export function CopiiCage(p: CopiiCageProps) {
  const nE = p.lattice.edges.length;
  const nN = p.lattice.dirs.length;
  const geos = useDisposable(() => [new CylinderGeometry(0.17, 0.17, 1, 12, 1), lumpySphere({ detail: 4, scale: [0.36, 0.3, 0.36], noise: 0.1, seed: 33 })], []);
  const mats = useDisposable(() => [proteinMaterial(COL.cage), proteinMaterial(COL.cageNode)], []);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  const rods = useRef<InstancedMesh>(null);
  const knobs = useRef<InstancedMesh>(null);
  const centre = useMemo(() => new Vector3(), []);
  useLayoutEffect(() => {
    const Rm = rods.current;
    const K = knobs.current;
    if (!Rm || !K) return;
    centre.set(...p.centre);
    const N = p.nodes;
    let k = 0;
    for (let e = 0; e < nE; e++) {
      const [i, j] = p.lattice.edges[e];
      const s = Math.min(p.shown[i], p.shown[j]);
      const rel = p.edgeRelease[e];
      const vis = smooth(clamp((s - 0.75) / 0.25)) * (1 - smooth(clamp((rel - 0.6) / 0.4)));
      if (vis < 0.02) continue;
      _a.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      _b.set(N[j * 3], N[j * 3 + 1], N[j * 3 + 2]);
      _m.copy(_a).add(_b).multiplyScalar(0.5);
      _d.copy(_b).sub(_a);
      const len = _d.length();
      if (rel > 0) {
        _c.copy(_m).sub(centre).normalize();
        _m.addScaledVector(_c, rel * 5.5);
      }
      _o.position.copy(_m);
      _o.quaternion.setFromUnitVectors(UP, _d.normalize());
      if (rel > 0) _o.rotateX(rel * 1.4 * ((e % 3) - 1));
      _o.scale.set(vis, len * 0.86, vis);
      _o.updateMatrix();
      Rm.setMatrixAt(k++, _o.matrix);
    }
    Rm.count = k;
    let kn = 0;
    for (let i = 0; i < nN; i++) {
      // knobs fade quickly when their rods leave
      let rel = 0;
      for (let e = 0; e < nE; e++) {
        const [a, b] = p.lattice.edges[e];
        if (a === i || b === i) rel = Math.max(rel, p.edgeRelease[e]);
      }
      const s = smooth(clamp(p.shown[i])) * (1 - smooth(clamp(rel / 0.35)));
      if (s < 0.02) continue;
      _o.position.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      _o.quaternion.identity();
      _o.scale.setScalar(s);
      _o.updateMatrix();
      K.setMatrixAt(kn++, _o.matrix);
    }
    K.count = kn;
    Rm.instanceMatrix.needsUpdate = true;
    K.instanceMatrix.needsUpdate = true;
    Rm.computeBoundingSphere();
    K.computeBoundingSphere();
  });
  return (
    <group {...groupProps(p)}>
      <instancedMesh ref={rods} args={[geos[0], mats[0], nE]} frustumCulled={false} />
      <instancedMesh ref={knobs} args={[geos[1], mats[1], nN]} frustumCulled={false} />
    </group>
  );
}
