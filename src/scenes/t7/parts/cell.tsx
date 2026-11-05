/**
 * Topic-7 organelle-scale parts (cell overviews and ER-scale views). Same look as the kit: glossy translucent
 * membranes (membraneMaterial), tinted lumens (tintMaterial), matte-satin proteins (proteinMaterial).
 * Candidates for the kit (Nucleus, RoughER/Sac, SmoothER, GolgiStack, Mitochondrion, Peroxisome, Lysosome,
 * Endosome, CellShell) — see the t7 report.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { CapsuleGeometry, Color, InstancedMesh, Object3D, SphereGeometry, TorusGeometry, Vector3, type BufferGeometry } from 'three';
import { rand, type V3 } from '@/engine/anim';
import {
  PALETTE,
  fibonacciSphere,
  groupProps,
  lumpySphere,
  membraneMaterial,
  proteinMaterial,
  tintMaterial,
  useDisposable,
  useKitHighlight,
  type KitProps,
} from '@/three/kit';
import { mergeAll, sacGeometry, sacSurface, shellPatch, varTube, type SacSpec } from './geo';

// ——————————————————————————————————————— ribosome dots (instanced) ———————————————————————————————————————

let ribGeo: [BufferGeometry, BufferGeometry] | null = null;
function ribosomeDotGeometry() {
  if (!ribGeo) {
    const large = lumpySphere({ detail: 3, scale: [1.0, 0.7, 0.9], noise: 0.08, seed: 5 }).translate(0, 0.62, 0);
    const small = lumpySphere({ detail: 3, scale: [0.9, 0.42, 0.62], noise: 0.08, seed: 9 }).translate(0, 1.5, 0.05);
    ribGeo = [large, small];
  }
  return ribGeo;
}

export interface Placement {
  p: Vector3;
  n: Vector3;
}

/** Many small ribosomes standing on a surface (each placement = point + outward normal). */
export function RibosomeDots(p: KitProps & { places: Placement[]; size?: number }) {
  const g = ribosomeDotGeometry();
  const mats = useDisposable(() => [proteinMaterial(PALETTE.ribosomeLarge), proteinMaterial(PALETTE.ribosomeSmall)], []);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.7 });
  const r0 = useRef<InstancedMesh>(null);
  const r1 = useRef<InstancedMesh>(null);
  const size = p.size ?? 0.06;
  useLayoutEffect(() => {
    const o = new Object3D();
    const up = new Vector3(0, 1, 0);
    [r0.current, r1.current].forEach((m) => {
      if (!m) return;
      p.places.forEach((pl, i) => {
        o.position.copy(pl.p);
        o.quaternion.setFromUnitVectors(up, pl.n);
        o.rotateY(rand(i * 7.3) * 6.28);
        o.scale.setScalar(size * (0.9 + 0.2 * rand(i * 3.1)));
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      });
      m.count = p.places.length;
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    });
  }, [p.places, size]);
  return (
    <group {...groupProps(p)}>
      <instancedMesh ref={r0} args={[g[0], mats[0], p.places.length]} key={`a${p.places.length}`} />
      <instancedMesh ref={r1} args={[g[1], mats[1], p.places.length]} key={`b${p.places.length}`} />
    </group>
  );
}

// ——————————————————————————————————————— sac (cisterna) ———————————————————————————————————————

export interface SacProps extends KitProps {
  spec: SacSpec;
  color?: string;
  lumenColor?: string;
  surfaceOpacity?: number;
  /** membrane thickness */
  th?: number;
  lumenStrength?: number;
}

/** A flattened cisterna: glossy translucent membrane (two leaflet surfaces) around a tinted lumen. */
export function Sac(p: SacProps) {
  const th = p.th ?? Math.min(0.05, p.spec.h * 0.3);
  const key = JSON.stringify(p.spec) + th;
  const geos = useDisposable(() => [sacGeometry(p.spec), sacGeometry(p.spec, th), sacGeometry(p.spec, th * 1.6, 64, 24)], [key]);
  const color = p.color ?? PALETTE.erMembrane;
  const mats = useDisposable(() => {
    const so = p.surfaceOpacity ?? 0.55;
    return [membraneMaterial(color, so), membraneMaterial(color, so * 0.6), tintMaterial(p.lumenColor ?? PALETTE.erLumen, p.lumenStrength ?? 0.5)];
  }, [color, p.lumenColor, p.surfaceOpacity, p.lumenStrength]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.5 });
  return (
    <group {...groupProps(p)}>
      <mesh geometry={geos[2]} material={mats[2]} renderOrder={1} />
      <mesh geometry={geos[1]} material={mats[1]} renderOrder={2} />
      <mesh geometry={geos[0]} material={mats[0]} renderOrder={3} />
    </group>
  );
}

/** Ribosome placements spread over both faces of a sac (both faces of a cisterna face the cytosol). */
export function sacRibosomes(spec: SacSpec, count: number, seed = 1, faces: (1 | -1)[] = [1, -1], margin = 0.9): Placement[] {
  const out: Placement[] = [];
  let k = 0;
  while (out.length < count && k < count * 20) {
    k++;
    const u = (rand(seed * 31 + k * 3) * 2 - 1) * margin;
    const v = (rand(seed * 17 + k * 5) * 2 - 1) * margin;
    const n = spec.n ?? 4;
    if (Math.pow(Math.abs(u), n) + Math.pow(Math.abs(v), n) > Math.pow(margin, n)) continue;
    const side = faces[k % faces.length];
    const pt = new Vector3();
    const nr = new Vector3();
    sacSurface(spec, u, v, side, pt, nr);
    pt.addScaledVector(nr, 0.005);
    out.push({ p: pt, n: nr });
  }
  return out;
}

// ——————————————————————————————————————— smooth ER (tubules) ———————————————————————————————————————

export interface TubulesProps extends KitProps {
  /** each tubule = control points */
  paths: V3[][];
  radius?: number;
  color?: string;
  lumenColor?: string;
  surfaceOpacity?: number;
  /** flare the start of each tubule (where it leaves a sheet) */
  flareStart?: boolean;
}

/** Twisted, interconnected SER tubules: glossy membrane tube + tinted lumen, rounded ends. */
export function Tubules(p: TubulesProps) {
  const r = p.radius ?? 0.18;
  const key = JSON.stringify(p.paths) + r + !!p.flareStart;
  const geos = useDisposable(() => {
    const prof = p.flareStart ? (u: number) => 1 + 1.4 * Math.max(0, 1 - u / 0.12) ** 2 : undefined;
    const outer = mergeAll(p.paths.map((pts) => varTube({ points: pts, radius: r, profile: prof, capStart: !p.flareStart })));
    const lumen = mergeAll(p.paths.map((pts) => varTube({ points: pts, radius: r * 0.62, profile: prof, capStart: !p.flareStart, radial: 12 })));
    return [outer, lumen];
  }, [key]);
  const color = p.color ?? PALETTE.erMembrane;
  const mats = useDisposable(() => [membraneMaterial(color, p.surfaceOpacity ?? 0.62), tintMaterial(p.lumenColor ?? PALETTE.erLumen, 0.55)], [color, p.lumenColor, p.surfaceOpacity]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.5 });
  return (
    <group {...groupProps(p)}>
      <mesh geometry={geos[1]} material={mats[1]} renderOrder={1} />
      <mesh geometry={geos[0]} material={mats[0]} renderOrder={3} />
    </group>
  );
}

/** Deterministic twisted tubule network around a centre (a few long wandering tubes that cross). */
export function serNetwork(center: V3, size: V3, count: number, seed = 3, pts = 7): V3[][] {
  const out: V3[][] = [];
  for (let i = 0; i < count; i++) {
    const path: V3[] = [];
    let x = center[0] + (rand(seed * 13 + i) - 0.5) * size[0];
    let y = center[1] + (rand(seed * 17 + i) - 0.5) * size[1];
    let z = center[2] + (rand(seed * 19 + i) - 0.5) * size[2];
    let dx = rand(seed * 23 + i) - 0.5;
    let dy = (rand(seed * 29 + i) - 0.5) * 0.6;
    let dz = rand(seed * 31 + i) - 0.5;
    for (let k = 0; k < pts; k++) {
      path.push([x, y, z]);
      dx += (rand(seed * 37 + i * 11 + k) - 0.5) * 1.3;
      dy += (rand(seed * 41 + i * 11 + k) - 0.5) * 0.8;
      dz += (rand(seed * 43 + i * 11 + k) - 0.5) * 1.3;
      const l = Math.hypot(dx, dy, dz) || 1;
      const step = (size[0] + size[2]) * 0.11;
      // pull back towards the centre so the network stays compact
      dx = dx / l + (center[0] - x) * 0.08;
      dy = dy / l + (center[1] - y) * 0.12;
      dz = dz / l + (center[2] - z) * 0.08;
      x += dx * step;
      y += dy * step * 0.6;
      z += dz * step;
    }
    out.push(path);
  }
  return out;
}

// ——————————————————————————————————————— nucleus (cut-away) ———————————————————————————————————————

export interface NucleusProps extends KitProps {
  radius?: number;
  /** azimuth (SphereGeometry φ) of the wedge cut towards the viewer, and its half-width; null = whole */
  cut?: { phi: number; half: number } | null;
  /** separate glow id for the envelope (outer nuclear membrane) */
  envelopeId?: string;
  pores?: number;
  ribosomes?: number;
  /** 0..1 chromatin condensation (apoptosis) */
  condense?: number;
}

/**
 * Nucleus: nucleoplasm (euchromatin, peripheral heterochromatin band), nucleolus, double envelope (inner +
 * outer nuclear membrane, perinuclear space tinted like the ER lumen), pores, ribosomes on the outer membrane.
 * Origin = centre. A wedge can be cut away to show the section.
 */
export function Nucleus(p: NucleusProps) {
  const R = p.radius ?? 3;
  const m = R * 0.022;
  const gap = R * 0.05;
  const cut = p.cut === undefined ? { phi: Math.PI / 2, half: 0.62 } : p.cut;
  const phi: [number, number] = cut ? [cut.phi + cut.half, cut.phi - cut.half + Math.PI * 2] : [0, Math.PI * 2];
  const geos = useDisposable(
    () => [
      shellPatch({ rIn: 0, rOut: R - m - R * 0.13, phi }), // euchromatin core
      shellPatch({ rIn: R - m - R * 0.13, rOut: R - m, phi }), // heterochromatin band
      shellPatch({ rIn: R - m, rOut: R, phi }), // INM
      shellPatch({ rIn: R, rOut: R + gap, phi }), // perinuclear space
      shellPatch({ rIn: R + gap, rOut: R + gap + m, phi }), // ONM
    ],
    [R, phi[0], phi[1]],
  );
  const cond = p.condense ?? 0;
  const mats = useDisposable(
    () => [
      proteinMaterial('#33407a', { roughness: 0.7, emissive: 0.08 }),
      proteinMaterial('#1d2550', { roughness: 0.75, emissive: 0.05 }),
      membraneMaterial(PALETTE.nuclearEnvelope, 0.95),
      tintMaterial(PALETTE.erLumen, 0.9),
      membraneMaterial(PALETTE.nuclearEnvelope, 0.95),
      proteinMaterial(PALETTE.nucleolus, { roughness: 0.6, emissive: 0.06 }),
    ],
    [],
  );
  const inner = useMemo(() => [mats[0], mats[1], mats[5]], [mats]);
  const env = useMemo(() => [mats[2], mats[3], mats[4]], [mats]);
  useKitHighlight(inner, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.35 });
  useKitHighlight(env, p.envelopeId ?? p.id, { glow: p.glow, opacity: p.opacity, strength: 0.45 });
  useLayoutEffect(() => {
    // apoptosis: chromatin condenses (darker, denser)
    (mats[0] as unknown as { color: Color }).color.set('#33407a').lerp(new Color('#121633'), cond);
    (mats[0] as unknown as { userData: { base?: Color } }).userData.base?.set('#33407a').lerp(new Color('#121633'), cond);
  }, [cond, mats]);
  // pores and ONM ribosomes (outside the wedge)
  const inWedge = (d: Vector3) => {
    if (!cut) return false;
    const ph = Math.atan2(d.z, -d.x); // SphereGeometry azimuth
    let dd = ph - cut.phi;
    while (dd > Math.PI) dd -= Math.PI * 2;
    while (dd < -Math.PI) dd += Math.PI * 2;
    return Math.abs(dd) < cut.half + 0.06;
  };
  const pores = useMemo(() => fibonacciSphere(p.pores ?? 70).filter((d) => !inWedge(d) && Math.abs(d.y) < 0.97), [p.pores, cut?.phi, cut?.half]); // eslint-disable-line react-hooks/exhaustive-deps
  const ribs = useMemo<Placement[]>(() => {
    const out: Placement[] = [];
    const n = p.ribosomes ?? 160;
    const pts = fibonacciSphere(n * 2);
    pts.forEach((d, i) => {
      if (out.length >= n || inWedge(d) || rand(i * 1.7) < 0.5) return;
      out.push({ p: d.clone().multiplyScalar(R + gap + m), n: d.clone() });
    });
    return out;
  }, [R, gap, m, p.ribosomes, cut?.phi, cut?.half]); // eslint-disable-line react-hooks/exhaustive-deps
  const poreGeo = useDisposable(() => new TorusGeometry(R * 0.055, R * 0.03, 10, 24), [R]);
  const poreMat = useDisposable(() => [proteinMaterial(PALETTE.nuclearPore, { roughness: 0.5 })], []);
  useKitHighlight(poreMat, p.envelopeId ?? p.id, { glow: p.glow, opacity: p.opacity, strength: 0.35 });
  const poreRef = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = poreRef.current;
    if (!mesh) return;
    const o = new Object3D();
    const z = new Vector3(0, 0, 1);
    pores.forEach((d, i) => {
      o.position.copy(d).multiplyScalar(R + gap * 0.5);
      o.quaternion.setFromUnitVectors(z, d);
      o.scale.set(1, 1, 1.3);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.count = pores.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [pores, R, gap]);
  const nucleolusPos: V3 = cut ? [-Math.cos(cut.phi) * R * 0.32, R * 0.12, Math.sin(cut.phi) * R * 0.32] : [R * 0.2, R * 0.1, 0];
  return (
    <group {...groupProps(p)}>
      <group scale={1 - 0.12 * cond}>
        <mesh geometry={geos[0]} material={mats[0]} />
        <mesh geometry={geos[1]} material={mats[1]} />
        <mesh material={mats[5]} position={nucleolusPos} scale={R * 0.24 * (1 - 0.3 * cond)}>
          <sphereGeometry args={[1, 32, 24]} />
        </mesh>
      </group>
      <mesh geometry={geos[2]} material={mats[2]} />
      <mesh geometry={geos[3]} material={mats[3]} />
      <mesh geometry={geos[4]} material={mats[4]} />
      <instancedMesh ref={poreRef} args={[poreGeo, poreMat[0], pores.length]} key={`p${pores.length}`} />
      <RibosomeDots places={ribs} size={R * 0.022} id={p.envelopeId ?? p.id} opacity={p.opacity} />
    </group>
  );
}

// ——————————————————————————————————————— Golgi stack ———————————————————————————————————————

export interface GolgiProps extends KitProps {
  n?: number;
  size?: number;
  /** vesicles around the rims */
  vesicles?: number;
}

/** Golgi stack: curved flattened cisternae with swollen rims (cis face = −y, convex), lumen tinted. */
export function GolgiStack(p: GolgiProps) {
  const n = p.n ?? 5;
  const s = p.size ?? 1;
  const specs = useMemo(
    () =>
      Array.from({ length: n }, (_, i): SacSpec => {
        const k = i / Math.max(1, n - 1);
        return { a: s * (1.55 - 0.25 * Math.abs(k - 0.4)), b: s * (0.95 - 0.12 * Math.abs(k - 0.4)), h: s * 0.075, n: 3, rim: 0.9, bend: -0.16 / s, wave: 0.03 * s, seed: i + 2 };
      }),
    [n, s],
  );
  const ves = useMemo(() => {
    const out: { pos: V3; r: number }[] = [];
    const m = p.vesicles ?? 8;
    for (let i = 0; i < m; i++) {
      const a = rand(i * 5.1) * Math.PI * 2;
      const side = i % 2 ? 1 : -1;
      out.push({ pos: [side * s * (1.75 + 0.25 * rand(i * 2.3)), (rand(i * 3.7) - 0.5) * s * 0.9, Math.sin(a) * s * 0.7], r: s * (0.09 + 0.03 * rand(i * 9.1)) });
    }
    return out;
  }, [p.vesicles, s]);
  const vgeo = useDisposable(() => new SphereGeometry(1, 24, 16), []);
  const vmat = useDisposable(() => [membraneMaterial(PALETTE.golgiMembrane, 0.7)], []);
  useKitHighlight(vmat, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.5 });
  return (
    <group {...groupProps(p)}>
      {specs.map((sp, i) => (
        <Sac key={i} spec={sp} position={[0, (i - (n - 1) / 2) * s * 0.3, 0]} color={PALETTE.golgiMembrane} lumenColor={PALETTE.golgiLumen} surfaceOpacity={0.7} lumenStrength={0.7} id={p.id} glow={p.glow} opacity={p.opacity} th={s * 0.02} />
      ))}
      {ves.map((v, i) => (
        <mesh key={i} geometry={vgeo} material={vmat[0]} position={v.pos} scale={v.r} />
      ))}
    </group>
  );
}

// ——————————————————————————————————————— mitochondrion ———————————————————————————————————————

/** Mitochondrion: translucent outer membrane, matrix, folded cristae plates. Long axis = x. */
export function Mitochondrion(p: KitProps & { length?: number; radius?: number }) {
  const L = p.length ?? 2.2;
  const r = p.radius ?? 0.55;
  const geos = useDisposable(() => {
    const outer = new CapsuleGeometry(r, L - 2 * r, 16, 48).rotateZ(Math.PI / 2);
    const inner = new CapsuleGeometry(r * 0.86, L - 2 * r, 12, 40).rotateZ(Math.PI / 2);
    const plates: BufferGeometry[] = [];
    const nC = Math.max(3, Math.round(L / (r * 0.55)));
    for (let i = 0; i < nC; i++) {
      const x = -L / 2 + r * 0.7 + (i * (L - 1.4 * r)) / Math.max(1, nC - 1);
      const side = i % 2 ? 1 : -1;
      const g = sacGeometry({ a: r * 0.5, b: r * 0.62, h: r * 0.06, n: 2.6 }, 0, 32, 12).rotateZ(Math.PI / 2).translate(x, side * r * 0.3, 0);
      plates.push(g);
    }
    return [outer, inner, mergeAll(plates)];
  }, [L, r]);
  const mats = useDisposable(() => [membraneMaterial(PALETTE.mitochondrion, 0.42), tintMaterial(PALETTE.mitoMatrix, 0.75), proteinMaterial('#ff9a5a', { roughness: 0.45, emissive: 0.08 })], []);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.55 });
  return (
    <group {...groupProps(p)}>
      <mesh geometry={geos[1]} material={mats[1]} renderOrder={1} />
      <mesh geometry={geos[2]} material={mats[2]} />
      <mesh geometry={geos[0]} material={mats[0]} renderOrder={3} />
    </group>
  );
}

// ——————————————————————————————————————— small round organelles ———————————————————————————————————————

/** Peroxisome: single membrane, granular matrix, dense crystalloid core. */
export function Peroxisome(p: KitProps & { radius?: number }) {
  const r = p.radius ?? 0.45;
  const geos = useDisposable(() => [new SphereGeometry(1, 40, 28), lumpySphere({ detail: 4, scale: [0.42, 0.36, 0.4], noise: 0.05, seed: 3, flattenY: { above: 0.25, below: -0.25, k: 0.8 } })], []);
  const mats = useDisposable(() => [membraneMaterial(PALETTE.peroxisome, 0.5), tintMaterial('#4d6b1a', 0.6), proteinMaterial('#5c8a12', { roughness: 0.5 })], []);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.6 });
  return (
    <group {...groupProps(p)}>
      <group scale={r}>
        <mesh geometry={geos[0]} material={mats[1]} scale={0.9} renderOrder={1} />
        <mesh geometry={geos[1]} material={mats[2]} rotation={[0.4, 0.6, 0.2]} />
        <mesh geometry={geos[0]} material={mats[0]} renderOrder={3} />
      </group>
    </group>
  );
}

/** Lysosome: acidic organelle with hydrolase granules. */
export function Lysosome(p: KitProps & { radius?: number; seed?: number }) {
  const r = p.radius ?? 0.5;
  const geos = useDisposable(() => [new SphereGeometry(1, 40, 28), new SphereGeometry(1, 12, 10)], []);
  const mats = useDisposable(() => [membraneMaterial(PALETTE.lysosome, 0.55), tintMaterial('#5a1d06', 0.7), proteinMaterial(PALETTE.hydrolase, { roughness: 0.5, emissive: 0.1 })], []);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.6 });
  const gran = useMemo(() => fibonacciSphere(14).map((d, i) => d.multiplyScalar(0.25 + 0.45 * rand(i * 3.3 + (p.seed ?? 1))).toArray() as V3), [p.seed]);
  return (
    <group {...groupProps(p)}>
      <group scale={r}>
        <mesh geometry={geos[0]} material={mats[1]} scale={0.9} renderOrder={1} />
        {gran.map((g, i) => (
          <mesh key={i} geometry={geos[1]} material={mats[2]} position={g} scale={0.1 + 0.05 * rand(i)} />
        ))}
        <mesh geometry={geos[0]} material={mats[0]} renderOrder={3} />
      </group>
    </group>
  );
}

/** Early endosome (irregular body with tubules) or late endosome / MVB (round, intraluminal vesicles). */
export function Endosome(p: KitProps & { kind?: 'early' | 'late'; radius?: number }) {
  const r = p.radius ?? 0.6;
  const late = p.kind === 'late';
  const geos = useDisposable(() => {
    const body = lumpySphere({ detail: 6, scale: late ? [1, 0.92, 0.95] : [1.1, 0.75, 0.9], noise: late ? 0.04 : 0.1, seed: late ? 7 : 4 });
    const tubes = late
      ? new SphereGeometry(0.0001, 3, 2)
      : mergeAll([
          varTube({ points: [[0.8, 0.1, 0], [1.4, 0.3, 0.2], [1.9, 0.2, 0.5]], radius: 0.16 }),
          varTube({ points: [[-0.7, -0.2, 0.3], [-1.3, -0.35, 0.6], [-1.6, -0.2, 1.1]], radius: 0.14 }),
        ]);
    return [body, tubes, new SphereGeometry(1, 14, 10)];
  }, [late]);
  const color = late ? PALETTE.lateEndosome : PALETTE.earlyEndosome;
  const mats = useDisposable(() => [membraneMaterial(color, 0.5), tintMaterial(color, 0.25), membraneMaterial('#cfe3ff', 0.75)], [color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.6 });
  const ilv = useMemo(() => (late ? fibonacciSphere(10).map((d, i) => d.multiplyScalar(0.5 * rand(i + 2) + 0.15).toArray() as V3) : []), [late]);
  return (
    <group {...groupProps(p)}>
      <group scale={r}>
        <mesh geometry={geos[0]} material={mats[1]} scale={0.9} renderOrder={1} />
        {ilv.map((v, i) => (
          <mesh key={i} geometry={geos[2]} material={mats[2]} position={v} scale={0.16} />
        ))}
        <mesh geometry={geos[0]} material={mats[0]} renderOrder={3} />
        <mesh geometry={geos[1]} material={mats[0]} renderOrder={3} />
      </group>
    </group>
  );
}

/** Phagosome: a large vesicle (from the plasma membrane) holding an engulfed bacterium. */
export function Phagosome(p: KitProps & { radius?: number }) {
  const r = p.radius ?? 0.8;
  const geos = useDisposable(() => [new SphereGeometry(1, 40, 28), new CapsuleGeometry(0.28, 0.75, 10, 24)], []);
  const mats = useDisposable(() => [membraneMaterial(PALETTE.plasmaMembrane, 0.45), tintMaterial('#3b2a1a', 0.35), proteinMaterial('#9bbf6a', { roughness: 0.55 })], []);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.6 });
  return (
    <group {...groupProps(p)}>
      <group scale={r}>
        <mesh geometry={geos[0]} material={mats[1]} scale={0.93} renderOrder={1} />
        <mesh geometry={geos[1]} material={mats[2]} rotation={[0.3, 0.2, 1.1]} />
        <mesh geometry={geos[0]} material={mats[0]} renderOrder={3} />
      </group>
    </group>
  );
}

/** Autophagosome: double membrane around a piece of cytoplasm (here a worn mitochondrion fragment). */
export function Autophagosome(p: KitProps & { radius?: number }) {
  const r = p.radius ?? 0.75;
  const geos = useDisposable(() => [new SphereGeometry(1, 40, 28), new CapsuleGeometry(0.22, 0.55, 10, 24).rotateZ(1.2)], []);
  const mats = useDisposable(() => [membraneMaterial('#9775fa', 0.42), membraneMaterial('#9775fa', 0.32), proteinMaterial('#c06a3a', { roughness: 0.6 }), tintMaterial('#2a2046', 0.4)], []);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.6 });
  return (
    <group {...groupProps(p)}>
      <group scale={r}>
        <mesh geometry={geos[0]} material={mats[3]} scale={0.84} renderOrder={1} />
        <mesh geometry={geos[1]} material={mats[2]} />
        <mesh geometry={geos[0]} material={mats[1]} scale={0.88} renderOrder={2} />
        <mesh geometry={geos[0]} material={mats[0]} renderOrder={3} />
      </group>
    </group>
  );
}

// ——————————————————————————————————————— cell shell ———————————————————————————————————————

/** Plasma membrane of a cell cut open at the top (a bowl): thick translucent ellipsoid shell. */
export function CellShell(p: KitProps & { size?: V3; cutTheta?: number; surfaceOpacity?: number; color?: string }) {
  const size = p.size ?? [10, 5, 8];
  const ct = p.cutTheta ?? 0.9;
  const geos = useDisposable(() => [shellPatch({ rIn: 0.985, rOut: 1, scale: size, theta: [ct, Math.PI], wSeg: 128, hSeg: 48 })], [size[0], size[1], size[2], ct]);
  const mats = useDisposable(() => [membraneMaterial(p.color ?? PALETTE.plasmaMembrane, p.surfaceOpacity ?? 0.38)], [p.color, p.surfaceOpacity]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.4 });
  return (
    <group {...groupProps(p)}>
      <mesh geometry={geos[0]} material={mats[0]} renderOrder={4} />
    </group>
  );
}

/** Position on a cell shell's surface (unit-sphere direction → ellipsoid). */
export function onShell(size: V3, dir: V3, out = new Vector3()): Vector3 {
  const d = new Vector3(...dir).normalize();
  return out.set(d.x * size[0], d.y * size[1], d.z * size[2]);
}
