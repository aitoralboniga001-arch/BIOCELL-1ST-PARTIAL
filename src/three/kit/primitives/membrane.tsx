import { useLayoutEffect, useMemo, useRef } from 'react';
import { BackSide, BoxGeometry, CatmullRomCurve3, Color, InstancedMesh, Matrix4, Object3D, SphereGeometry, TubeGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rand, type V3 } from '@/engine/anim';
import { groupProps, useDisposable, type KitProps } from '../common';
import { bendGeometry, curveFrom } from '../geom';
import { useKitHighlight } from '../hooks';
import { lipidHeadMaterial, lipidTailMaterial, membraneMaterial, tintMaterial } from '../materials';
import { PALETTE } from '../palette';

export interface BilayerProps extends KitProps {
  /** size along x */
  width: number;
  /** size along z */
  depth: number;
  /** y = curvature · x² (gentle bend) */
  curvature?: number;
  /** circular gaps (in the patch's x/z) where proteins sit, e.g. a translocon */
  holes?: { x: number; z: number; r: number }[];
  /** lipid spacing (default 0.26) */
  spacing?: number;
  /** distance between the two head planes (default 1.0) */
  thickness?: number;
  headColor?: string;
  tailColor?: string;
  seed?: number;
}

/** Bilayer constants (for placing proteins): head planes at ±BILAYER.half, head radius BILAYER.head. */
export const BILAYER = { half: 0.5, head: 0.125, surface: 0.5 + 0.125 } as const;

/**
 * Instanced phospholipid bilayer patch (molecular close-ups). Heads = glossy spheres, two tails each
 * (one kinked = unsaturated), two leaflets facing out. Centre plane at y = 0; top leaflet = +y.
 */
export function Bilayer(p: BilayerProps) {
  const spacing = p.spacing ?? 0.26;
  const thickness = p.thickness ?? 1.0;
  const half = thickness / 2;
  const headR = BILAYER.head * (spacing / 0.26);
  const seed = p.seed ?? 3;
  const holesKey = JSON.stringify(p.holes ?? []);

  const geos = useDisposable(() => {
    const head = new SphereGeometry(headR, 14, 10);
    const tailLen = half - headR * 0.6 - 0.04;
    const mk = (dx: number, kink: boolean) => {
      const pts = kink
        ? [new Vector3(dx, -headR * 0.5, 0), new Vector3(dx, -tailLen * 0.45, 0), new Vector3(dx + 0.05, -tailLen * 0.62, 0.02), new Vector3(dx + 0.07, -tailLen, 0.02)]
        : [new Vector3(dx, -headR * 0.5, 0), new Vector3(dx - 0.01, -tailLen * 0.5, 0.01), new Vector3(dx - 0.015, -tailLen, 0)];
      return new TubeGeometry(new CatmullRomCurve3(pts), 6, 0.034 * (spacing / 0.26), 5, false);
    };
    const a = mk(-0.045, false);
    const b = mk(0.045, true);
    const tails = mergeGeometries([a, b])!;
    a.dispose();
    b.dispose();
    return [head, tails];
  }, [headR, half, spacing]);

  const mats = useDisposable(() => [lipidHeadMaterial(p.headColor ?? PALETTE.lipidHead), lipidTailMaterial(p.tailColor ?? PALETTE.lipidTail)], [p.headColor, p.tailColor]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.45 });

  const layout = useMemo(() => {
    const holes = p.holes ?? [];
    const out: { x: number; z: number; spin: number; s: number; c: number }[] = [];
    const rowH = spacing * 0.866;
    const nz = Math.floor(p.depth / rowH);
    const nx = Math.floor(p.width / spacing);
    let k = 0;
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        k++;
        const x = -p.width / 2 + i * spacing + (j % 2 ? spacing / 2 : 0) + (rand(seed * 977 + k) - 0.5) * spacing * 0.22;
        const z = -p.depth / 2 + j * rowH + (rand(seed * 613 + k * 3) - 0.5) * spacing * 0.22;
        if (x > p.width / 2 || x < -p.width / 2) continue;
        if (holes.some((h) => (x - h.x) ** 2 + (z - h.z) ** 2 < h.r * h.r)) continue;
        out.push({ x, z, spin: rand(seed + k * 7) * Math.PI * 2, s: 0.93 + rand(seed + k * 11) * 0.12, c: 0.9 + rand(seed + k * 13) * 0.14 });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.width, p.depth, spacing, seed, holesKey]);

  const headRef = useRef<InstancedMesh>(null);
  const tailRef = useRef<InstancedMesh>(null);
  const count = layout.length * 2;

  useLayoutEffect(() => {
    const heads = headRef.current;
    const tails = tailRef.current;
    if (!heads || !tails) return;
    const o = new Object3D();
    const col = new Color();
    const curv = p.curvature ?? 0;
    let n = 0;
    for (const L of layout) {
      const y0 = curv * L.x * L.x;
      const tilt = Math.atan(2 * curv * L.x);
      for (const leaflet of [1, -1]) {
        o.position.set(L.x - Math.sin(tilt) * half * leaflet, y0 + Math.cos(tilt) * half * leaflet, L.z);
        // spin about the lipid's own axis, flip the lower leaflet, then follow the bend
        o.rotation.set(leaflet === 1 ? 0 : Math.PI, L.spin, tilt, 'ZYX');
        o.scale.setScalar(L.s);
        o.updateMatrix();
        heads.setMatrixAt(n, o.matrix);
        tails.setMatrixAt(n, o.matrix);
        col.setScalar(L.c);
        heads.setColorAt(n, col);
        n++;
      }
    }
    heads.count = n;
    tails.count = n;
    heads.instanceMatrix.needsUpdate = true;
    tails.instanceMatrix.needsUpdate = true;
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
    heads.computeBoundingSphere();
    tails.computeBoundingSphere();
  }, [layout, half, p.curvature]);

  return (
    <group {...groupProps(p)}>
      <instancedMesh ref={headRef} args={[geos[0], mats[0], count]} key={`h${count}`} />
      <instancedMesh ref={tailRef} args={[geos[1], mats[1], count]} key={`t${count}`} />
    </group>
  );
}

export interface LumenTintProps extends KitProps {
  /** box [minX, maxX, minY, maxY, minZ, maxZ] the compartment occupies */
  box: [number, number, number, number, number, number];
  color?: string;
  strength?: number;
}

/**
 * Quiet tint of a compartment's volume (e.g. ER lumen under a membrane patch) — orientation cue (rule 8).
 * Not fogged, does not write depth.
 */
export function LumenTint(p: LumenTintProps) {
  const [x0, x1, y0, y1, z0, z1] = p.box;
  const geo = useDisposable(() => new BoxGeometry(x1 - x0, y1 - y0, z1 - z0), [x0, x1, y0, y1, z0, z1]);
  const mat = useDisposable(() => {
    const m = tintMaterial(p.color ?? PALETTE.erLumen, p.strength ?? 0.2);
    m.side = BackSide;
    m.fog = false;
    return m;
  }, [p.color, p.strength]);
  const mats = useMemo(() => [mat], [mat]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.25 });
  return (
    <group {...groupProps(p)}>
      <mesh geometry={geo} material={mat} position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]} renderOrder={-1} />
    </group>
  );
}

export interface MembraneSheetProps extends KitProps {
  shape: 'plane' | 'sphere' | 'tube';
  /** plane: size along x / z */
  width?: number;
  depth?: number;
  /** plane: y += bend·(x²+z²) */
  bend?: number;
  /** sphere / tube radius */
  radius?: number;
  /** tube: path (default: straight along x, `length`) */
  points?: V3[];
  length?: number;
  /** wall thickness (distance between the two leaflets' surfaces) */
  thickness?: number;
  color?: string;
  /** colour of the inside (lumen) */
  lumenColor?: string;
  surfaceOpacity?: number;
}

/**
 * Organelle-scale membrane: two smooth translucent glossy surfaces (the bilayer look at low zoom) with a
 * tinted lumen between/inside. Plane = flat (optionally bent) slab, sphere = closed compartment, tube.
 */
export function MembraneSheet(p: MembraneSheetProps) {
  const th = p.thickness ?? 0.08;
  const color = p.color ?? PALETTE.membrane;
  const mats = useDisposable(() => {
    const outer = membraneMaterial(color, p.surfaceOpacity ?? 0.5);
    const inner = membraneMaterial(color, (p.surfaceOpacity ?? 0.5) * 0.7);
    const lumen = tintMaterial(p.lumenColor ?? PALETTE.erLumen, 0.22);
    return [outer, inner, lumen];
  }, [color, p.lumenColor, p.surfaceOpacity]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.5 });
  const key = JSON.stringify([p.shape, p.width, p.depth, p.bend, p.radius, p.points, p.length, th]);
  const geos = useDisposable(() => {
    if (p.shape === 'sphere') {
      const r = p.radius ?? 1;
      return [new SphereGeometry(r, 64, 48), new SphereGeometry(Math.max(0.01, r - th), 64, 48), new SphereGeometry(Math.max(0.01, r - th * 0.5), 48, 32)];
    }
    if (p.shape === 'tube') {
      const r = p.radius ?? 0.5;
      const pts = p.points ?? [[-(p.length ?? 4) / 2, 0, 0], [(p.length ?? 4) / 2, 0, 0]];
      const c = pts.length > 2 ? curveFrom(pts) : new CatmullRomCurve3(pts.map((q) => new Vector3(...q)));
      return [new TubeGeometry(c, 96, r, 40, false), new TubeGeometry(c, 96, Math.max(0.01, r - th), 40, false), new TubeGeometry(c, 64, Math.max(0.01, r - th * 0.5), 24, false)];
    }
    const w = p.width ?? 6;
    const d = p.depth ?? 4;
    const top = bendGeometry(new BoxGeometry(w, 0.001, d, 64, 1, 48).translate(0, th / 2, 0), p.bend ?? 0);
    const bot = bendGeometry(new BoxGeometry(w, 0.001, d, 64, 1, 48).translate(0, -th / 2, 0), p.bend ?? 0);
    const mid = bendGeometry(new BoxGeometry(w, th * 0.9, d, 64, 1, 48), p.bend ?? 0);
    return [top, bot, mid];
  }, [key]);
  return (
    <group {...groupProps(p)}>
      <mesh geometry={geos[2]} material={mats[2]} renderOrder={1} />
      <mesh geometry={geos[1]} material={mats[1]} renderOrder={2} />
      <mesh geometry={geos[0]} material={mats[0]} renderOrder={3} />
    </group>
  );
}

/** Small helper so scenes can reuse a matrix without allocating. */
export const scratchMatrix = new Matrix4();
