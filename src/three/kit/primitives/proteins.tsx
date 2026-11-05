import { useMemo } from 'react';
import { BufferGeometry, CapsuleGeometry, CatmullRomCurve3, Matrix4, Quaternion, TorusGeometry, TubeGeometry, Vector3 } from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lerp, rand, smooth, clamp, type V3 } from '@/engine/anim';
import { groupProps, useDisposable, type KitProps } from '../common';
import { lumpySphere, noise3 } from '../geom';
import { useKitHighlight } from '../hooks';
import { proteinMaterial } from '../materials';
import { PALETTE } from '../palette';

/** Displace any geometry radially-ish by smooth noise (molecular surface feel). */
function roughen(g: BufferGeometry, amp: number, freq: number, seed: number): BufferGeometry {
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = noise3(x * freq, y * freq, z * freq, seed) * amp;
    pos.setXYZ(i, x + nrm.getX(i) * n, y + nrm.getY(i) * n, z + nrm.getZ(i) * n);
  }
  g.computeVertexNormals();
  return g;
}

/** Capsule from a to b (radius r), returned as geometry in place. */
function capsuleAB(a: V3, b: V3, r: number, seg = 16): BufferGeometry {
  const va = new Vector3(...a);
  const vb = new Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new CapsuleGeometry(r, Math.max(0.001, len), 8, seg);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyMatrix4(new Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new Vector3(1, 1, 1)));
  return g;
}

function merged(parts: BufferGeometry[]): BufferGeometry {
  const clean = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    return n;
  });
  const m = mergeGeometries(clean)!;
  clean.forEach((g) => g.dispose());
  // weld so later normal recomputation stays smooth (no faceting)
  const w = mergeVertices(m, 1e-4);
  m.dispose();
  w.computeVertexNormals();
  return w;
}

// ———————————————————————————————————————— Protein ————————————————————————————————————————

export interface ProteinProps extends KitProps {
  shape?: 'blob' | 'barrel' | 'ring' | 'y';
  color?: string;
  /** overall size (≈ diameter) */
  size?: number;
  seed?: number;
}

const proteinGeoCache = new Map<string, BufferGeometry>();
function proteinGeometry(shape: string, seed: number): BufferGeometry {
  const k = `${shape}:${seed}`;
  const hit = proteinGeoCache.get(k);
  if (hit) return hit;
  let g: BufferGeometry;
  if (shape === 'barrel') {
    const parts: BufferGeometry[] = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 0.3;
      const tw = 0.35;
      parts.push(capsuleAB([Math.cos(a) * r, -0.38, Math.sin(a) * r], [Math.cos(a + tw) * r, 0.38, Math.sin(a + tw) * r], 0.13));
    }
    g = roughen(merged(parts), 0.02, 6, seed);
  } else if (shape === 'ring') {
    g = roughen(new TorusGeometry(0.36, 0.15, 24, 72), 0.035, 5, seed);
  } else if (shape === 'y') {
    g = roughen(
      merged([
        capsuleAB([0, -0.5, 0], [0, -0.02, 0], 0.11),
        capsuleAB([0, 0.02, 0], [-0.34, 0.45, 0], 0.11),
        capsuleAB([0, 0.02, 0], [0.34, 0.45, 0], 0.11),
        capsuleAB([-0.2, 0.15, 0.06], [-0.42, 0.42, 0.06], 0.08),
        capsuleAB([0.2, 0.15, 0.06], [0.42, 0.42, 0.06], 0.08),
      ]),
      0.015,
      7,
      seed,
    );
  } else {
    g = lumpySphere({
      detail: 9,
      scale: [0.5, 0.43, 0.46],
      noise: 0.08,
      freq: 2.4,
      seed,
      bumps: [0, 1, 2].map((i) => ({ dir: [rand(seed * 7 + i) - 0.5, rand(seed * 11 + i) - 0.5, rand(seed * 13 + i) - 0.5] as V3, amp: 0.18, width: 0.6 })),
    });
  }
  proteinGeoCache.set(k, g);
  return g;
}

/** Generic smooth protein (SRP domains, chaperones, receptors, enzymes…). */
export function Protein(p: ProteinProps) {
  const g = proteinGeometry(p.shape ?? 'blob', p.seed ?? 1);
  const mats = useDisposable(() => [proteinMaterial(p.color ?? PALETTE.neutral)], [p.color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  const s = p.size ?? 1;
  return (
    <group {...groupProps(p)}>
      <mesh geometry={g} material={mats[0]} scale={s} />
    </group>
  );
}

// ———————————————————————————————————————— SRP ————————————————————————————————————————

/**
 * SRP local frame: an elongated, kinked particle along x. The M domain (signal-peptide grip) is at
 * SRP_SITES.grip (+x end, its groove facing −y); the Alu domain (which reaches the ribosome's elongation
 * site and pauses translation) is at SRP_SITES.alu (−x end).
 */
export const SRP_SITES = { grip: [1.45, -0.32, 0] as V3, alu: [-1.75, 0.3, 0] as V3 } as const;

let srpGeo: BufferGeometry | null = null;
function srpGeometry() {
  if (srpGeo) return srpGeo;
  const rod = new TubeGeometry(
    new CatmullRomCurve3([new Vector3(-1.6, 0.3, 0), new Vector3(-0.9, 0.12, 0.05), new Vector3(-0.1, 0.02, 0), new Vector3(0.8, 0.0, -0.05), new Vector3(1.2, -0.05, 0)]),
    48,
    0.15,
    14,
    false,
  );
  const alu = lumpySphere({ detail: 7, scale: [0.42, 0.34, 0.36], noise: 0.08, seed: 41 }).translate(-1.75, 0.3, 0);
  const s = lumpySphere({ detail: 7, scale: [0.42, 0.3, 0.34], noise: 0.07, seed: 43 }).translate(0.15, 0.06, 0.02);
  const m = lumpySphere({
    detail: 9,
    scale: [0.6, 0.46, 0.5],
    noise: 0.07,
    seed: 47,
    bumps: [{ dir: [0, -1, 0], amp: -0.22, width: 0.42 }], // the groove that holds the signal peptide
  }).translate(1.4, -0.08, 0);
  srpGeo = roughen(merged([rod, alu, s, m]), 0.02, 5, 3);
  return srpGeo;
}

/** Signal-recognition particle (green): elongated kinked particle with the signal-peptide grip at +x. */
export function SRP(p: KitProps & { color?: string }) {
  const g = srpGeometry();
  const mats = useDisposable(() => [proteinMaterial(p.color ?? PALETTE.srp)], [p.color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  return (
    <group {...groupProps(p)}>
      <mesh geometry={g} material={mats[0]} />
    </group>
  );
}

// ———————————————————————————————————————— membrane-anchored receptor ————————————————————————————————————————

let srGeo: BufferGeometry | null = null;
function srGeometry() {
  if (srGeo) return srGeo;
  const tm = capsuleAB([0, -0.55, 0], [0, 0.6, 0], 0.13);
  const beta = lumpySphere({ detail: 7, scale: [0.34, 0.26, 0.3], noise: 0.07, seed: 51 }).translate(-0.12, 0.82, 0);
  const alpha = lumpySphere({ detail: 8, scale: [0.46, 0.32, 0.4], noise: 0.08, seed: 53, bumps: [{ dir: [0, 1, 0], amp: -0.12, width: 0.5 }] }).translate(0.25, 1.06, 0.05);
  srGeo = roughen(merged([tm, beta, alpha]), 0.015, 6, 5);
  return srGeo;
}

/**
 * SRP receptor: a membrane-anchored protein (one helix crossing the bilayer, origin = membrane centre)
 * with its globular docking domain in the cytosol (top ≈ y 1.35). Its docking site is RECEPTOR_SITE.
 */
export const RECEPTOR_SITE: V3 = [0.2, 1.38, 0.05];
export function SRPReceptor(p: KitProps & { color?: string }) {
  const g = srGeometry();
  const mats = useDisposable(() => [proteinMaterial(p.color ?? PALETTE.srpReceptor)], [p.color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  return (
    <group {...groupProps(p)}>
      <mesh geometry={g} material={mats[0]} />
    </group>
  );
}

/**
 * Generic single-pass membrane enzyme/receptor: TM helix + a globular domain on one side.
 * `side` = 'lumen' (domain at −y, e.g. signal peptidase) or 'cytosol' (+y).
 */
export function MembraneProtein(p: KitProps & { color?: string; side?: 'lumen' | 'cytosol'; seed?: number; size?: number }) {
  const seed = p.seed ?? 61;
  const side = p.side ?? 'lumen';
  const g = useDisposable(() => {
    const sgn = side === 'lumen' ? -1 : 1;
    const tm = capsuleAB([0, -0.62, 0], [0, 0.62, 0], 0.13);
    const tm2 = capsuleAB([0.24, -0.6, 0.08], [0.2, 0.6, 0.05], 0.12);
    const dom = lumpySphere({ detail: 8, scale: [0.5, 0.36, 0.44], noise: 0.08, seed }).translate(0.1, sgn * 0.98, 0.02);
    return roughen(merged([tm, tm2, dom]), 0.015, 6, seed);
  }, [seed, side]);
  const mats = useDisposable(() => [proteinMaterial(p.color ?? PALETTE.signalPeptidase)], [p.color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  return (
    <group {...groupProps(p)}>
      <mesh geometry={g} material={mats[0]} scale={p.size ?? 1} />
    </group>
  );
}

// ———————————————————————————————————————— channels ————————————————————————————————————————

let staveGeo: BufferGeometry | null = null;
function stave() {
  if (!staveGeo) staveGeo = roughen(merged([capsuleAB([0, -0.62, 0], [0, 0.62, 0], 0.17, 18), capsuleAB([0.1, -0.5, 0.12], [0.06, 0.55, 0.14], 0.1, 12)]), 0.022, 6, 9);
  return staveGeo;
}

export interface ChannelProps extends KitProps {
  /** 0 closed … 1 open */
  open?: number;
  color?: string;
  staves?: number;
  /** pore radius closed / open (stave centres) */
  radius?: [number, number];
  /** lateral gate: the two staves facing +x part sideways when open (translocon) */
  lateralGate?: boolean;
  /** a plug helix that leaves the pore towards −y when open */
  plug?: boolean;
  /** cytosolic rim (ribosome-binding face) at +y */
  rim?: boolean;
}

/** Ring of helix-bundle staves spanning the bilayer (origin = membrane centre, axis = y). */
export function Pore(p: ChannelProps) {
  const open = smooth(clamp(p.open ?? 0));
  const n = p.staves ?? 8;
  const [r0, r1] = p.radius ?? [0.42, 0.6];
  const R = lerp(r0, r1, open);
  const mats = useDisposable(() => [proteinMaterial(p.color ?? PALETTE.translocon), proteinMaterial(p.color ?? PALETTE.translocon, { roughness: 0.6 })], [p.color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  const g = stave();
  const rimGeo = useDisposable(() => roughen(new TorusGeometry(0.62, 0.12, 16, 64), 0.03, 6, 4).rotateX(Math.PI / 2), []);
  const plugGeo = useDisposable(() => lumpySphere({ detail: 6, scale: [0.2, 0.26, 0.2], noise: 0.08, seed: 71 }), []);
  const staves = useMemo(() => Array.from({ length: n }, (_, i) => i), [n]);
  return (
    <group {...groupProps(p)}>
      {staves.map((i) => {
        let a = ((i + 0.5) / n) * Math.PI * 2;
        if (p.lateralGate) {
          // the two staves either side of +x (a≈0) open the lateral gate
          if (i === 0) a += 0.42 * open;
          if (i === n - 1) a -= 0.42 * open;
        }
        const tilt = 0.12 + 0.05 * rand(i * 3);
        return <mesh key={i} geometry={g} material={mats[0]} position={[Math.cos(a) * R, 0, Math.sin(a) * R]} rotation={[Math.sin(a) * tilt, -a, -Math.cos(a) * tilt * 0.6]} />;
      })}
      {p.rim && <mesh geometry={rimGeo} material={mats[1]} position={[0, 0.66, 0]} scale={[lerp(1, 1.18, open), 1, lerp(1, 1.18, open)]} />}
      {p.plug && <mesh geometry={plugGeo} material={mats[1]} position={[lerp(0, -0.25, open), lerp(-0.1, -0.95, open), lerp(0, 0.2, open)]} />}
    </group>
  );
}

/** Translocon (Sec61): ring of staves with a lateral gate (+x) and a plug; `open` 0..1. */
export function Translocon(p: Omit<ChannelProps, 'lateralGate' | 'plug' | 'rim'>) {
  return <Pore {...p} lateralGate plug rim radius={p.radius ?? [0.44, 0.62]} color={p.color ?? PALETTE.translocon} />;
}

// ———————————————————————————————————————— nuclear pore ————————————————————————————————————————

/**
 * Nuclear pore complex (origin = centre of the envelope, axis y; cytoplasm = +y, nucleus = −y).
 * Eight-fold rings on both faces, spokes, cytoplasmic filaments and the nuclear basket.
 */
export function NuclearPore(p: KitProps & { size?: number; color?: string }) {
  const mats = useDisposable(() => [proteinMaterial(p.color ?? PALETTE.nuclearPore), proteinMaterial(p.color ?? PALETTE.nuclearPore, { roughness: 0.65 })], [p.color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  const geos = useDisposable(() => {
    const sub = lumpySphere({ detail: 5, scale: [0.22, 0.16, 0.2], noise: 0.08, seed: 81 });
    const spoke = capsuleAB([0, -0.32, 0], [0, 0.32, 0], 0.1, 10);
    const fil = new TubeGeometry(new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(0.05, 0.35, 0.02), new Vector3(-0.04, 0.7, 0.05), new Vector3(0.06, 1.0, 0)]), 16, 0.035, 6);
    const basket = new TubeGeometry(new CatmullRomCurve3([new Vector3(0.7, 0, 0), new Vector3(0.62, -0.4, 0), new Vector3(0.38, -0.8, 0), new Vector3(0.24, -0.98, 0)]), 16, 0.035, 6);
    const ring = new TorusGeometry(0.24, 0.05, 10, 32).rotateX(Math.PI / 2);
    return [sub, spoke, fil, basket, ring];
  }, []);
  const s = p.size ?? 1;
  const idx = useMemo(() => Array.from({ length: 8 }, (_, i) => i), []);
  return (
    <group {...groupProps(p)}>
      <group scale={s}>
        {idx.map((i) => {
          const a = (i / 8) * Math.PI * 2;
          const x = Math.cos(a) * 0.72;
          const z = Math.sin(a) * 0.72;
          return (
            <group key={i}>
              <mesh geometry={geos[0]} material={mats[0]} position={[x, 0.34, z]} rotation={[0, -a, 0]} />
              <mesh geometry={geos[0]} material={mats[0]} position={[x, -0.34, z]} rotation={[0, -a, 0]} />
              <mesh geometry={geos[1]} material={mats[0]} position={[x * 0.92, 0, z * 0.92]} />
              <mesh geometry={geos[2]} material={mats[1]} position={[x, 0.42, z]} rotation={[0, -a, 0]} />
              <mesh geometry={geos[3]} material={mats[1]} position={[0, -0.4, 0]} rotation={[0, -a, 0]} />
            </group>
          );
        })}
        <mesh geometry={geos[4]} material={mats[1]} position={[0, -1.38, 0]} />
      </group>
    </group>
  );
}
