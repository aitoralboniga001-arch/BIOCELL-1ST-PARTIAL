import { useLayoutEffect, useMemo, useRef } from 'react';
import { CylinderGeometry, InstancedMesh, Matrix4, Object3D, OctahedronGeometry, SphereGeometry, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { rand, type V3 } from '@/engine/anim';
import { groupProps, useDisposable, type KitProps } from '../common';
import { curveFrom, segmentMatrix } from '../geom';
import { useKitHighlight } from '../hooks';
import { proteinMaterial } from '../materials';
import { PALETTE, SUGARS, type SugarKind } from '../palette';

// ———————————————————————————————————————— sugars (SNFG) ————————————————————————————————————————

const sugarGeo: Partial<Record<string, import('three').BufferGeometry>> = {};
function sugarGeometry(shape: 'cube' | 'sphere' | 'diamond') {
  if (!sugarGeo[shape]) {
    sugarGeo[shape] =
      shape === 'cube' ? new RoundedBoxGeometry(0.3, 0.3, 0.3, 3, 0.05) : shape === 'diamond' ? new OctahedronGeometry(0.22, 0).scale(1, 1.2, 1) : new SphereGeometry(0.16, 24, 18);
  }
  return sugarGeo[shape]!;
}

export interface SugarProps extends KitProps {
  kind: SugarKind;
  size?: number;
}

/** One monosaccharide in SNFG style: GlcNAc blue cube, Man green sphere, Glc blue sphere, Gal yellow sphere, Sia purple diamond, Man-6-P = Man + phosphate bead. */
export function Sugar(p: SugarProps) {
  const def = SUGARS[p.kind];
  const mats = useDisposable(() => [proteinMaterial(def.color, { roughness: 0.4 }), proteinMaterial(PALETTE.phosphate, { roughness: 0.35 })], [def.color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  return (
    <group {...groupProps(p)}>
      <group scale={p.size ?? 1}>
        <mesh geometry={sugarGeometry(def.shape)} material={mats[0]} />
        {p.kind === 'Man6P' && (
          <mesh material={mats[1]} position={[0.17, 0.12, 0.08]}>
            <sphereGeometry args={[0.075, 16, 12]} />
          </mesh>
        )}
      </group>
    </group>
  );
}

export interface GlycanNode {
  kind: SugarKind;
  children?: GlycanNode[];
}

export interface GlycanProps extends KitProps {
  tree: GlycanNode;
  size?: number;
  /** spacing between generations (default 0.42) */
  gap?: number;
  /** 0..1 how many sugars are shown, in build order (root first) — e.g. trimming / adding */
  amount?: number;
}

/** A glycan tree (SNFG symbols linked by thin bonds). Root at the origin, the tree grows along +y. */
export function Glycan(p: GlycanProps) {
  const gap = p.gap ?? 0.42;
  const key = JSON.stringify(p.tree);
  const nodes = useMemo(() => {
    const out: { kind: SugarKind; pos: V3; parent: number }[] = [];
    const leaves = (n: GlycanNode): number => (n.children?.length ? n.children.reduce((a, c) => a + leaves(c), 0) : 1);
    const walk = (n: GlycanNode, depth: number, x0: number, parent: number) => {
      const w = leaves(n);
      const me = out.length;
      out.push({ kind: n.kind, pos: [x0 + ((w - 1) * gap * 0.75) / 2, depth * gap, 0], parent });
      let x = x0;
      for (const c of n.children ?? []) {
        walk(c, depth + 1, x, me);
        x += leaves(c) * gap * 0.75;
      }
    };
    walk(p.tree, 0, 0, -1);
    const shift = out[0].pos[0];
    out.forEach((n) => (n.pos = [n.pos[0] - shift, n.pos[1], n.pos[2]]));
    return out;
  }, [key, gap]); // eslint-disable-line react-hooks/exhaustive-deps
  const amount = p.amount ?? 1;
  const shown = Math.round(amount * nodes.length);
  const mats = useDisposable(() => [proteinMaterial('#d7dbe0', { roughness: 0.6 })], []);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  const bond = useDisposable(() => new CylinderGeometry(0.03, 0.03, 1, 6), []);
  const m = useMemo(() => new Matrix4(), []);
  return (
    <group {...groupProps(p)}>
      <group scale={p.size ?? 1}>
        {nodes.slice(0, shown).map((n, i) => (
          <group key={i}>
            <Sugar kind={n.kind} position={n.pos} id={p.id} glow={p.glow} opacity={p.opacity} />
            {n.parent >= 0 && (
              <mesh geometry={bond} material={mats[0]} matrixAutoUpdate={false} matrix={segmentMatrix(new Vector3(...nodes[n.parent].pos), new Vector3(...n.pos), 1, m.clone())} />
            )}
          </group>
        ))}
      </group>
    </group>
  );
}

/** The ER precursor oligosaccharide (2 GlcNAc, 9 Man, 3 Glc) as a Glycan tree. */
export const OLIGO_14: GlycanNode = {
  kind: 'GlcNAc',
  children: [
    {
      kind: 'GlcNAc',
      children: [
        {
          kind: 'Man',
          children: [
            { kind: 'Man', children: [{ kind: 'Man', children: [{ kind: 'Man', children: [{ kind: 'Glc', children: [{ kind: 'Glc', children: [{ kind: 'Glc' }] }] }] }] }] },
            { kind: 'Man', children: [{ kind: 'Man', children: [{ kind: 'Man' }] }, { kind: 'Man', children: [{ kind: 'Man' }] }] },
          ],
        },
      ],
    },
  ],
};

// ———————————————————————————————————————— ions & flows ————————————————————————————————————————

export interface IonProps extends KitProps {
  kind: 'Ca' | 'H' | 'other';
  count?: number;
  /** box the ions occupy: centre and size */
  region?: { center: V3; size: V3 };
  /** stage time (or any clock) — ions jiggle with it */
  t?: number;
  seed?: number;
  color?: string;
  size?: number;
}

/** Small glowing ions scattered in a region (H⁺ red, Ca²⁺ white). Deterministic jiggle with `t`. */
export function Ion(p: IonProps) {
  const n = p.count ?? 20;
  const color = p.color ?? (p.kind === 'H' ? PALETTE.proton : p.kind === 'Ca' ? PALETTE.calcium : PALETTE.neutral);
  const geo = useDisposable(() => new SphereGeometry(1, 14, 10), []);
  const mats = useDisposable(() => [proteinMaterial(color, { emissive: 0.45, roughness: 0.3 })], [color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  const ref = useRef<InstancedMesh>(null);
  const reg = p.region ?? { center: [0, 0, 0] as V3, size: [2, 2, 2] as V3 };
  const size = p.size ?? (p.kind === 'Ca' ? 0.09 : 0.07);
  const seed = p.seed ?? 1;
  const t = p.t ?? 0;
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new Object3D();
    for (let i = 0; i < n; i++) {
      const ph = rand(seed * 19 + i) * 6.28;
      const w = 30 + 20 * rand(seed + i * 3);
      o.position.set(
        reg.center[0] + (rand(seed * 7 + i) - 0.5) * reg.size[0] + Math.sin(t * w + ph) * 0.06,
        reg.center[1] + (rand(seed * 11 + i) - 0.5) * reg.size[1] + Math.cos(t * w * 1.3 + ph) * 0.06,
        reg.center[2] + (rand(seed * 13 + i) - 0.5) * reg.size[2] + Math.sin(t * w * 0.7 + ph * 2) * 0.06,
      );
      o.scale.setScalar(size);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  });
  return (
    <group {...groupProps(p)}>
      <instancedMesh ref={ref} args={[geo, mats[0], n]} />
    </group>
  );
}

export interface FlowProps extends KitProps {
  points: V3[];
  /** clock (stage t or seconds) */
  t: number;
  /** loops per unit of t */
  speed?: number;
  count?: number;
  color?: string;
  size?: number;
}

/** Little particles streaming along a path (cargo flow, ion flux). */
export function Flow(p: FlowProps) {
  const n = p.count ?? 16;
  const key = JSON.stringify(p.points);
  const curve = useMemo(() => curveFrom(p.points), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const geo = useDisposable(() => new SphereGeometry(1, 12, 10), []);
  const mats = useDisposable(() => [proteinMaterial(p.color ?? PALETTE.cargo, { emissive: 0.3 })], [p.color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new Object3D();
    for (let i = 0; i < n; i++) {
      const u = (((i / n + p.t * (p.speed ?? 1)) % 1) + 1) % 1;
      curve.getPointAt(u, o.position);
      const fade = Math.min(1, u / 0.08, (1 - u) / 0.08);
      o.scale.setScalar((p.size ?? 0.08) * fade);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  });
  return (
    <group {...groupProps(p)}>
      <instancedMesh ref={ref} args={[geo, mats[0], n]} />
    </group>
  );
}


// ———————————————————————————————————————— bond ————————————————————————————————————————

export interface BondProps extends KitProps {
  a: V3 | Vector3;
  b: V3 | Vector3;
  radius?: number;
  color?: string;
  /** 0..1 */
  show?: number;
}

const _ba = new Vector3();
const _bb = new Vector3();
/** A single stick between two points (a bond / link that can be broken by setting show = 0). */
export function Bond(p: BondProps) {
  const geo = useDisposable(() => new CylinderGeometry(1, 1, 1, 10, 1), []);
  const mats = useDisposable(() => [proteinMaterial(p.color ?? PALETTE.polypeptide)], [p.color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: (p.opacity ?? 1) * (p.show ?? 1) });
  const m = useMemo(() => new Matrix4(), []);
  if (Array.isArray(p.a)) _ba.set(p.a[0], p.a[1], p.a[2]);
  else _ba.copy(p.a as Vector3);
  if (Array.isArray(p.b)) _bb.set(p.b[0], p.b[1], p.b[2]);
  else _bb.copy(p.b as Vector3);
  segmentMatrix(_ba, _bb, p.radius ?? 0.04, m);
  const e = m.elements;
  return (
    <group {...groupProps(p)}>
      <mesh geometry={geo} material={mats[0]} matrixAutoUpdate={false} matrix={new Matrix4().fromArray(e)} visible={(p.show ?? 1) > 0.01} />
    </group>
  );
}
