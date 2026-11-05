/**
 * A Golgi cisterna at organelle scale: a smooth, flattened sac (thin centre, dilated rim), bent into a cup
 * (local +y = concave side = towards trans), slightly elliptical, with fenestrations (true see-through
 * holes) near the rim. Optionally cut in half (z ≤ 0 kept) with a cross-section cap: membrane band +
 * lumen, the TEM/textbook section look.
 *
 * Local frame: thickness along y, sheet in x/z. In the scenes the stack axis is world +x (cis → trans), so a
 * cisterna is placed with rotation [0, 0, −π/2] (local +y → world +x) — use <StackCisterna>.
 */
import { useLayoutEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, LatheGeometry, Material, Shape, ShapeGeometry, Vector2 } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rand, type V3 } from '@/engine/anim';
import { PALETTE, membraneMaterial, tintMaterial, useKitHighlight, useDisposable, type KitProps } from '@/three/kit';
import { cisternaProfile } from './lathe';

export interface CisternaShape {
  R: number;
  h0?: number;
  hr?: number;
  bend?: number;
  ellipse?: number;
  seed?: number;
  half?: boolean;
  /** number of fenestrations (0 = none) */
  fen?: number;
}

const MEM = 0.028; // membrane thickness at this scale

function wobble(theta: number, seed: number) {
  return 1 + 0.035 * Math.sin(3 * theta + seed * 1.7) + 0.022 * Math.sin(5 * theta + seed * 3.1) + 0.012 * Math.sin(7 * theta + seed);
}

/** Apply ellipse + wobble + bend to a geometry built in disk coordinates; adds aDisk (pre-bend x/z ÷ R). */
function shapeGeometry(g: BufferGeometry, s: Required<CisternaShape>) {
  const p = g.getAttribute('position') as BufferAttribute;
  const disk = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let z = p.getZ(i);
    const th = Math.atan2(z, x);
    const w = wobble(th, s.seed);
    x *= w;
    z *= w * s.ellipse;
    disk[i * 2] = x / s.R;
    disk[i * 2 + 1] = z / s.R;
    p.setXYZ(i, x, p.getY(i) + s.bend * (x * x + z * z), z);
  }
  g.setAttribute('aDisk', new BufferAttribute(disk, 2));
  return g;
}

function latheFrom(points: { r: number; y: number }[], s: Required<CisternaShape>) {
  const pts = points.map((q) => new Vector2(Math.max(0, q.r), q.y));
  const g = s.half ? new LatheGeometry(pts, 72, Math.PI / 2, Math.PI) : new LatheGeometry(pts, 128);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const w = mergeVertices(g, 1e-5);
  g.dispose();
  shapeGeometry(w, s);
  w.computeVertexNormals();
  return w;
}

function shapeFromProfile(points: { r: number; y: number }[]) {
  // full-width closed outline: right half (x = +ρ) then left half (x = −ρ), reversed
  const sh = new Shape();
  points.forEach((q, i) => (i ? sh.lineTo(q.r, q.y) : sh.moveTo(q.r, q.y)));
  for (let i = points.length - 1; i >= 0; i--) sh.lineTo(-points[i].r, points[i].y);
  return sh;
}

function capGeometry(points: { r: number; y: number }[], hole: { r: number; y: number }[] | null, s: Required<CisternaShape>) {
  const sh = shapeFromProfile(points);
  if (hole) sh.holes.push(shapeFromProfile(hole));
  const g = new ShapeGeometry(sh, 1);
  g.deleteAttribute('uv');
  // ShapeGeometry lies in x/y; our cut plane is z = 0 with x = ρ (θ = 0 side) → already right
  shapeGeometry(g, s);
  g.computeVertexNormals();
  return g;
}

/** Fenestration pattern: holes in the outer ring of the sheet (disk coords, radius in disk units). */
function holes(seed: number, n: number, half: boolean): Float32Array {
  const out = new Float32Array(Math.max(1, n) * 3);
  let k = 0;
  for (let i = 0; k < n && i < n * 6; i++) {
    const a = rand(seed * 31 + i * 7) * Math.PI * 2;
    const rr = 0.6 + 0.24 * rand(seed * 17 + i * 3);
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr * 0.86;
    if (half && z > -0.06) continue; // only on the kept half, away from the cut
    const r = 0.045 + 0.03 * rand(seed * 5 + i);
    let ok = true;
    for (let j = 0; j < k; j++) if (Math.hypot(out[j * 3] - x, out[j * 3 + 1] - z) < out[j * 3 + 2] + r + 0.05) ok = false;
    if (!ok) continue;
    out[k * 3] = x;
    out[k * 3 + 1] = z;
    out[k * 3 + 2] = r;
    k++;
  }
  for (; k < Math.max(1, n); k++) out[k * 3 + 2] = -1;
  return out;
}

function fenestrate(m: Material, h: Float32Array) {
  const N = h.length / 3;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHoles = { value: h };
    sh.vertexShader = 'attribute vec2 aDisk;\nvarying vec2 vDisk;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vDisk = aDisk;');
    sh.fragmentShader =
      `uniform vec3 uHoles[${N}];\nvarying vec2 vDisk;\n` +
      sh.fragmentShader
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
  float fenRim = 0.0;
  for (int i = 0; i < ${N}; i++) {
    vec3 hh = uHoles[i];
    if (hh.z <= 0.0) continue;
    float d = length(vDisk - hh.xy);
    if (d < hh.z) discard;
    fenRim = max(fenRim, 1.0 - smoothstep(hh.z, hh.z * 1.8, d));
  }`,
        )
        .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= 1.0 + 0.45 * fenRim;\n  diffuseColor.a = min(1.0, diffuseColor.a + 0.25 * fenRim);');
  };
  m.customProgramCacheKey = () => `fen${N}`;
}

export interface CisternaProps extends KitProps, CisternaShape {
  color?: string;
  lumenColor?: string;
  /** surface opacity of the outer leaflet */
  surface?: number;
}

export function Cisterna(p: CisternaProps) {
  const s: Required<CisternaShape> = {
    R: p.R,
    h0: p.h0 ?? 0.05,
    hr: p.hr ?? 0.12,
    bend: p.bend ?? 0.09,
    ellipse: p.ellipse ?? 0.86,
    seed: p.seed ?? 1,
    half: p.half ?? false,
    fen: p.fen ?? 10,
  };
  const key = JSON.stringify(s);
  const geos = useDisposable(() => {
    const outerP = cisternaProfile(s.R, s.h0, s.hr, 0);
    const innerP = cisternaProfile(s.R, s.h0, s.hr, MEM);
    const lumenP = cisternaProfile(s.R, s.h0, s.hr, MEM * 1.6);
    const list = [latheFrom(outerP, s), latheFrom(innerP, s), latheFrom(lumenP, s)];
    if (s.half) list.push(capGeometry(outerP, innerP, s), capGeometry(innerP, null, s));
    return list;
  }, [key]);
  const color = p.color ?? PALETTE.golgiMembrane;
  const lumen = p.lumenColor ?? PALETTE.golgiLumen;
  const surf = p.surface ?? 0.62;
  const h = useMemo(() => holes(s.seed, s.fen, s.half), [s.seed, s.fen, s.half]);
  const mats = useDisposable(() => {
    const outer = membraneMaterial(color, surf);
    const inner = membraneMaterial(color, surf * 0.55);
    const lum = tintMaterial(lumen, 0.42);
    const band = membraneMaterial(color, 0.96);
    band.depthWrite = true;
    const capL = tintMaterial(lumen, 0.78);
    capL.emissiveIntensity = 0.35;
    [outer, inner, lum].forEach((m) => s.fen > 0 && fenestrate(m, h));
    return [outer, inner, lum, band, capL];
  }, [color, lumen, surf, h, s.fen]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, strength: 0.55 });
  useLayoutEffect(() => {
    mats.forEach((m) => (m.needsUpdate = true));
  }, [mats]);
  return (
    <group position={p.position} rotation={p.rotation} scale={p.scale} visible={(p.opacity ?? 1) > 0.002}>
      <mesh geometry={geos[2]} material={mats[2]} renderOrder={1} />
      <mesh geometry={geos[1]} material={mats[1]} renderOrder={2} />
      <mesh geometry={geos[0]} material={mats[0]} renderOrder={3} />
      {s.half && <mesh geometry={geos[4]} material={mats[4]} renderOrder={4} position={[0, 0, 0.002]} />}
      {s.half && <mesh geometry={geos[3]} material={mats[3]} renderOrder={5} position={[0, 0, 0.003]} />}
    </group>
  );
}

/** Rotation that turns a cisterna's local +y (concave side) into world +x (cis → trans axis). */
export const STACK_ROT: V3 = [0, 0, -Math.PI / 2];
