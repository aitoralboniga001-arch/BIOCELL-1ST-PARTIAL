/**
 * Parts for the t9-rab scene (Rab GTPases):
 *  - <RabGTPase>: globular G-domain + flexible C-terminal tail ending in two prenyl (geranylgeranyl) chains.
 *    `open` 0 = Rab-GDP pose (tail and prenyls tucked into a groove on the back of the protein: hidden),
 *    1 = Rab-GTP pose (tail and prenyls stick out along local −y, ready to dip into a leaflet).
 *    Local frame: body centre at the origin; the prenyl tips reach RAB.tip (local −y).
 *  - <Tether>: long coiled-coil tethering protein ("Rab fishing line"): two intertwined bead strands along a
 *    cubic curve from a membrane foot (`base`) to a globular Rab-binding head (`tip`). Its length follows the
 *    tip, so pulling the tip down reels the line in.
 *  - <LipidVesicle>: a closed lipid-bilayer vesicle (same lipids as the kit Bilayer) with a lumen tint and cargo.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { CapsuleGeometry, CircleGeometry, DoubleSide, InstancedMesh, Object3D, SphereGeometry, Vector3 } from 'three';
import { clamp, rand, smooth, type V3 } from '@/engine/anim';
import { groupProps, lumpySphere, PALETTE, proteinMaterial, tintMaterial, useDisposable, useKitHighlight, type KitProps } from '@/three/kit';
import { LipidRevolution, useProfile } from '../../t10/parts/Membranes';
import { buildSphere } from '../../t10/parts/profile';

const _o = new Object3D();
const _a = new Vector3();
const _b = new Vector3();
const _n1 = new Vector3();
const _n2 = new Vector3();
const Z = new Vector3(0, 0, 1);

// ———————————————————————————————————————— Rab ————————————————————————————————————————

const TAIL_N = 8;
const PREN_N = 8;
/** local geometry constants (before group scale) */
export const RAB = {
  /** prenyl tips (local) */
  tip: -1.38,
  /** nucleotide pocket on the front face (local) */
  pocket: [0.26, 0.2, 0.46] as V3,
  /** body radius (approx.) */
  radius: 0.55,
} as const;

function rabPaths() {
  const closedT = new Float32Array(TAIL_N * 3);
  const openT = new Float32Array(TAIL_N * 3);
  const closedP = new Float32Array(2 * PREN_N * 3);
  const openP = new Float32Array(2 * PREN_N * 3);
  const bulgeT = new Float32Array(TAIL_N * 3);
  const bulgeP = new Float32Array(2 * PREN_N * 3);
  // groove on the back-left of the body: direction (−0.55, 0, −0.83)
  const gx = -0.55;
  const gz = -0.83;
  for (let i = 0; i < TAIL_N; i++) {
    const u = i / (TAIL_N - 1);
    openT.set([0.05 * Math.sin(u * Math.PI * 2), -0.44 - 0.44 * u, 0.02 * Math.sin(u * 5)], i * 3);
    const a = 0.12 * Math.PI + 0.36 * Math.PI * u; // angle from the −y axis, climbing the back
    const r = 0.57;
    closedT.set([r * Math.sin(a) * gx, -r * Math.cos(a), r * Math.sin(a) * gz], i * 3);
    bulgeT.set([gx * 0.35, -0.2, gz * 0.35 + 0.2], i * 3);
  }
  for (let c = 0; c < 2; c++) {
    const sx = c === 0 ? 1 : -1;
    for (let j = 0; j < PREN_N; j++) {
      const u = j / (PREN_N - 1);
      const k = (c * PREN_N + j) * 3;
      const zig = j % 2 ? 0.028 : -0.028; // isoprene kinks
      openP.set([sx * (0.05 + 0.07 * u) + zig, -0.9 - 0.48 * u, zig * 0.8], k);
      const a = 0.5 * Math.PI + 0.42 * Math.PI * u;
      const r = 0.45; // half-buried in the groove: "hidden in the structure"
      const az = sx * 0.16;
      const dx = gx * Math.cos(az) - gz * Math.sin(az);
      const dz = gx * Math.sin(az) + gz * Math.cos(az);
      closedP.set([r * Math.sin(a) * dx, -r * Math.cos(a), r * Math.sin(a) * dz], k);
      bulgeP.set([gx * 0.5, -0.45, gz * 0.5 + 0.35], k);
    }
  }
  return { closedT, openT, closedP, openP, bulgeT, bulgeP };
}
const PATHS = rabPaths();

function writeChain(m: InstancedMesh | null, closed: Float32Array, open: Float32Array, bulge: Float32Array, k: number, r: number) {
  if (!m) return;
  const n = closed.length / 3;
  const sw = Math.sin(Math.PI * k);
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    _o.position.set(
      closed[o] + (open[o] - closed[o]) * k + bulge[o] * sw,
      closed[o + 1] + (open[o + 1] - closed[o + 1]) * k + bulge[o + 1] * sw,
      closed[o + 2] + (open[o + 2] - closed[o + 2]) * k + bulge[o + 2] * sw,
    );
    _o.quaternion.identity();
    _o.scale.setScalar(r);
    _o.updateMatrix();
    m.setMatrixAt(i, _o.matrix);
  }
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere();
}

export interface RabProps extends KitProps {
  /** 0 = GDP pose (prenyls hidden) … 1 = GTP pose (prenyls exposed) */
  open: number;
  color?: string;
  prenylId?: string;
  seed?: number;
  /** quaternion [x,y,z,w] (overrides rotation) */
  quaternion?: [number, number, number, number];
}

export function RabGTPase(p: RabProps) {
  const seed = p.seed ?? 5;
  const geos = useDisposable(
    () => [
      lumpySphere({ detail: 9, scale: [0.56, 0.5, 0.52], noise: 0.09, seed, bumps: [{ dir: [-0.55, 0, -0.83], amp: -0.1, width: 0.5 }, { dir: [0.4, 0.5, 0.75], amp: -0.08, width: 0.3 }] }),
      new SphereGeometry(1, 12, 9),
    ],
    [seed],
  );
  const color = p.color ?? PALETTE.rab;
  const mats = useDisposable(() => [proteinMaterial(color), proteinMaterial(color)], [color]);
  const pm = useDisposable(() => [proteinMaterial('#74c0fc', { emissive: 0.22, roughness: 0.4 })], []);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  useKitHighlight(pm, p.prenylId, { glow: p.glow, opacity: p.opacity });
  const tail = useRef<InstancedMesh>(null);
  const pren = useRef<InstancedMesh>(null);
  const k = smooth(clamp(p.open));
  useLayoutEffect(() => {
    writeChain(tail.current, PATHS.closedT, PATHS.openT, PATHS.bulgeT, k, 0.085);
    writeChain(pren.current, PATHS.closedP, PATHS.openP, PATHS.bulgeP, k, 0.062);
  }, [k]);
  const gp = groupProps(p);
  return (
    <group position={gp.position} rotation={p.quaternion ? undefined : gp.rotation} quaternion={p.quaternion} scale={gp.scale} visible={gp.visible}>
      <mesh geometry={geos[0]} material={mats[0]} />
      <instancedMesh ref={tail} args={[geos[1], mats[1], TAIL_N]} frustumCulled={false} />
      <instancedMesh ref={pren} args={[geos[1], pm[0], PREN_N * 2]} frustumCulled={false} />
    </group>
  );
}

// ———————————————————————————————————————— tether ————————————————————————————————————————

const SAMPLES = 56;
const CAP = 220;
const SP = new Float32Array((SAMPLES + 1) * 3);
const SL = new Float32Array(SAMPLES + 1);

export interface TetherProps extends KitProps {
  base: V3;
  tip: V3;
  /** sideways offset of the first control point (shapes the line) */
  sway?: V3;
  color?: string;
  seed?: number;
}

/** control points of a tether curve (base → c1 → c2 → tip) */
function controls(base: V3, tip: V3, sway: V3) {
  const h = Math.max(0.5, tip[1] - base[1]);
  return [base[0] + sway[0], base[1] + 0.55 * h + sway[1], base[2] + sway[2], tip[0] - 0.4 * sway[0], tip[1] - 0.35 * h, tip[2] - 0.3 * sway[2]];
}

/** a point along a tether's centre line (u = 0 base … 1 tip), e.g. for its label anchor */
export function tetherPoint(base: V3, tip: V3, sway: V3, u: number): V3 {
  const [c1x, c1y, c1z, c2x, c2y, c2z] = controls(base, tip, sway);
  const v = 1 - u;
  const w0 = v * v * v;
  const w1 = 3 * v * v * u;
  const w2 = 3 * v * u * u;
  const w3 = u * u * u;
  return [w0 * base[0] + w1 * c1x + w2 * c2x + w3 * tip[0], w0 * base[1] + w1 * c1y + w2 * c2y + w3 * tip[1], w0 * base[2] + w1 * c1z + w2 * c2z + w3 * tip[2]];
}

export function Tether(p: TetherProps) {
  const color = p.color ?? '#a5d8ff';
  const geos = useDisposable(
    () => [
      new SphereGeometry(1, 10, 8),
      lumpySphere({ detail: 7, scale: [0.42, 0.34, 0.4], noise: 0.1, seed: p.seed ?? 3 }),
      new CapsuleGeometry(0.15, 1.1, 6, 12),
    ],
    [p.seed],
  );
  const mats = useDisposable(() => [proteinMaterial(color), proteinMaterial(color), proteinMaterial(color)], [color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  const ref = useRef<InstancedMesh>(null);
  const [bx, by, bz] = p.base;
  const [tx, ty, tz] = p.tip;
  const [sx, sy, sz] = p.sway ?? [0, 0, 0];
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    // cubic Bézier: base → c1 (straight up + sway) → c2 (below the tip) → tip
    const h = Math.max(0.5, ty - by);
    const c1x = bx + sx;
    const c1y = by + 0.55 * h + sy;
    const c1z = bz + sz;
    const c2x = tx - 0.4 * sx;
    const c2y = ty - 0.35 * h;
    const c2z = tz - 0.3 * sz;
    let L = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      const u = i / SAMPLES;
      const v = 1 - u;
      const w0 = v * v * v;
      const w1 = 3 * v * v * u;
      const w2 = 3 * v * u * u;
      const w3 = u * u * u;
      SP[i * 3] = w0 * bx + w1 * c1x + w2 * c2x + w3 * tx;
      SP[i * 3 + 1] = w0 * by + w1 * c1y + w2 * c2y + w3 * ty;
      SP[i * 3 + 2] = w0 * bz + w1 * c1z + w2 * c2z + w3 * tz;
      if (i > 0) L += Math.hypot(SP[i * 3] - SP[i * 3 - 3], SP[i * 3 + 1] - SP[i * 3 - 2], SP[i * 3 + 2] - SP[i * 3 - 1]);
      SL[i] = L;
    }
    const step = 0.13;
    const per = Math.min(CAP / 2, Math.max(2, Math.floor((L - 0.3) / step)));
    let seg = 1;
    let k = 0;
    for (let b = 0; b < per; b++) {
      const s = b * step;
      while (seg < SAMPLES && SL[seg] < s) seg++;
      const s0 = SL[seg - 1];
      const f = clamp((s - s0) / Math.max(1e-5, SL[seg] - s0));
      _a.set(SP[seg * 3 - 3], SP[seg * 3 - 2], SP[seg * 3 - 1]);
      _b.set(SP[seg * 3], SP[seg * 3 + 1], SP[seg * 3 + 2]);
      const px = _a.x + (_b.x - _a.x) * f;
      const py = _a.y + (_b.y - _a.y) * f;
      const pz = _a.z + (_b.z - _a.z) * f;
      _b.sub(_a).normalize(); // tangent
      _n1.crossVectors(_b, Z);
      if (_n1.lengthSq() < 1e-4) _n1.set(1, 0, 0);
      _n1.normalize();
      _n2.crossVectors(_b, _n1);
      const ph = (s / 0.95) * Math.PI * 2;
      for (let strand = 0; strand < 2; strand++) {
        const a = ph + strand * Math.PI;
        const ca = Math.cos(a) * 0.085;
        const sa = Math.sin(a) * 0.085;
        _o.position.set(px + _n1.x * ca + _n2.x * sa, py + _n1.y * ca + _n2.y * sa, pz + _n1.z * ca + _n2.z * sa);
        _o.quaternion.identity();
        _o.scale.setScalar(0.088);
        _o.updateMatrix();
        m.setMatrixAt(k++, _o.matrix);
      }
    }
    m.count = k;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  });
  const gp = groupProps(p);
  return (
    <group visible={gp.visible}>
      <instancedMesh ref={ref} args={[geos[0], mats[0], CAP]} frustumCulled={false} />
      {/* globular Rab-binding head */}
      <mesh geometry={geos[1]} material={mats[1]} position={p.tip} />
      {/* membrane foot (spans the bilayer) */}
      <mesh geometry={geos[2]} material={mats[2]} position={[bx, by - 0.55, bz]} />
    </group>
  );
}

// ———————————————————————————————————————— vesicle ————————————————————————————————————————

export interface LipidVesicleProps extends KitProps {
  radius: number;
  seed?: number;
  cargo?: number;
}

/**
 * Lipid vesicle drawn in SECTION: the half facing the viewer (+z) is cut away, so the bilayer is seen in
 * profile all around the rim (heads – tails – heads) and the lumen with its cargo is visible.
 */
export function LipidVesicle(p: LipidVesicleProps) {
  const prof = useProfile(256);
  useMemo(() => buildSphere(p.radius, 0, prof), [p.radius, prof]);
  const geos = useDisposable(
    () => [new SphereGeometry(1, 40, 28, Math.PI, Math.PI), new CircleGeometry(1, 64), lumpySphere({ detail: 4, scale: [1, 0.9, 0.95], noise: 0.12, seed: 9 })],
    [],
  );
  const mats = useDisposable(() => {
    const a = tintMaterial(PALETTE.golgiLumen, 0.4);
    a.side = DoubleSide;
    const b = tintMaterial(PALETTE.golgiLumen, 0.28);
    b.side = DoubleSide;
    return [a, b, proteinMaterial(PALETTE.cargo)];
  }, []);
  useKitHighlight(mats, undefined, { opacity: p.opacity });
  const items = useMemo(() => {
    const n = p.cargo ?? 7;
    const s = p.seed ?? 1;
    return Array.from({ length: n }, (_, i) => {
      const r = (p.radius - 1) * (0.35 + 0.65 * Math.cbrt(rand(s * 13 + i)));
      const th = Math.PI + rand(s * 7 + i * 3) * Math.PI; // back half (z < 0)
      const ph = 0.35 + rand(s * 5 + i * 11) * (Math.PI - 0.7);
      return { pos: [r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th) * 0.8 - 0.1] as V3, s: 0.3 + 0.12 * rand(s + i) };
    });
  }, [p.cargo, p.seed, p.radius]);
  const ri = p.radius - 0.5;
  return (
    <group {...groupProps(p)}>
      <mesh geometry={geos[0]} material={mats[0]} scale={ri} renderOrder={1} />
      <mesh geometry={geos[1]} material={mats[1]} scale={ri} position={[0, 0, -0.02]} renderOrder={1} />
      {items.map((c, i) => (
        <mesh key={i} geometry={geos[2]} material={mats[2]} position={c.pos} scale={c.s} />
      ))}
      <LipidRevolution profile={prof} sig={p.radius} id={p.id} opacity={p.opacity} spacing={0.26} thickness={1} seed={p.seed ?? 3} capacity={6000} cut={{ center: Math.PI / 2, width: Math.PI }} />
    </group>
  );
}
