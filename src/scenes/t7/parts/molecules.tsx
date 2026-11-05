/** Small molecular helpers shared by the t7 lumen scenes (folding, UPR, glycosylation). */
import { useMemo } from 'react';
import { CylinderGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import { clamp, smooth, type V3 } from '@/engine/anim';
import { groupProps, proteinMaterial, segmentMatrix, Sugar, useDisposable, useKitHighlight, type GlycanNode, type KitProps, type SugarKind } from '@/three/kit';

/**
 * The ER precursor oligosaccharide Glc3Man9GlcNAc2 (14 sugars: 2 GlcNAc, 9 Man, 3 Glc).
 * Depth-first order puts the three glucoses last, so `amount` trims them first (14 → 11 sugars).
 */
export const OLIGO_GLC3: GlycanNode = {
  kind: 'GlcNAc',
  children: [
    {
      kind: 'GlcNAc',
      children: [
        {
          kind: 'Man',
          children: [
            // α1,6 arm: Man → (Man–Man, Man–Man)
            { kind: 'Man', children: [{ kind: 'Man', children: [{ kind: 'Man' }] }, { kind: 'Man', children: [{ kind: 'Man' }] }] },
            // α1,3 arm: Man–Man–Man–Glc–Glc–Glc
            { kind: 'Man', children: [{ kind: 'Man', children: [{ kind: 'Man', children: [{ kind: 'Glc', children: [{ kind: 'Glc', children: [{ kind: 'Glc' }] }] }] }] }] },
          ],
        },
      ],
    },
  ],
};
/** Fraction of OLIGO_GLC3 shown for n sugars. */
export const sugars = (n: number) => n / 14;

const _f = new Vector3();
/** The blend Polypeptide applies with `folded` (for bonds / labels that must follow folding beads). */
export function foldedBead(p: Vector3, local: Vector3, center: V3, k: number, out: Vector3) {
  return out.copy(p).lerp(_f.set(center[0] + local.x, center[1] + local.y, center[2] + local.z), smooth(clamp(k)));
}

const _a = new Vector3();
const _b = new Vector3();
const _up = new Vector3(0, 1, 0);
/** A protein domain / chain drawn as a capsule from a to b (local coordinates). */
export function Capsule(p: KitProps & { a: V3; b: V3; r?: number; color: string }) {
  const mats = useDisposable(() => [proteinMaterial(p.color, { roughness: 0.5 })], [p.color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  const r = p.r ?? 0.17;
  const { pos, q, len } = useMemo(() => {
    _a.set(...p.a);
    _b.set(...p.b);
    const d = _b.clone().sub(_a);
    const len = d.length();
    const q = new Quaternion().setFromUnitVectors(_up, d.normalize());
    const pos = _a.clone().add(_b).multiplyScalar(0.5);
    return { pos, q, len };
  }, [p.a[0], p.a[1], p.a[2], p.b[0], p.b[1], p.b[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  if ((p.opacity ?? 1) <= 0.002) return null;
  return (
    <mesh position={pos} quaternion={q} material={mats[0]}>
      <capsuleGeometry args={[r, Math.max(0.01, len - 2 * r), 6, 14]} />
    </mesh>
  );
}

/** Wobbling random-coil path (an unfolded chain), pure function of t. */
export function coilPoint(i: number, n: number, c: V3, t: number, seed: number, out: Vector3, span = 2.6) {
  const u = i / (n - 1) - 0.5;
  const w = t * 40 + seed;
  return out.set(
    c[0] + u * span + 0.18 * Math.sin(i * 0.9 + w + seed),
    c[1] + 0.42 * Math.sin(i * 0.45 + seed) + 0.1 * Math.sin(w * 0.7 + i),
    c[2] + 0.35 * Math.cos(i * 0.6 + seed * 0.3) + 0.08 * Math.cos(w + i * 1.3),
  );
}

export const _m4 = new Matrix4();

const SUGAR_ID: Partial<Record<SugarKind, string>> = { GlcNAc: 'glcnac', Man: 'mannose', Glc: 'glucose' };
/**
 * Glycan whose sugars also glow with their own type id (glcnac / mannose / glucose) besides `id`.
 * Same layout as the kit Glycan (root at the origin, grows along +y); `amount` shows sugars root-first.
 */
export function TypedGlycan(p: KitProps & { tree: GlycanNode; size?: number; gap?: number; amount?: number }) {
  const gap = p.gap ?? 0.42;
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
  }, [p.tree, gap]);
  const mats = useDisposable(() => [proteinMaterial('#d7dbe0', { roughness: 0.6 })], []);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  const bond = useDisposable(() => new CylinderGeometry(0.03, 0.03, 1, 6), []);
  const mats4 = useMemo(() => nodes.map((n) => (n.parent >= 0 ? segmentMatrix(new Vector3(...nodes[n.parent].pos), new Vector3(...n.pos), 1, new Matrix4()) : null)), [nodes]);
  const shown = Math.round((p.amount ?? 1) * nodes.length);
  const base = p.id === undefined ? [] : Array.isArray(p.id) ? p.id : [p.id];
  return (
    <group {...groupProps(p)}>
      <group scale={p.size ?? 1}>
        {nodes.slice(0, shown).map((n, i) => (
          <group key={i}>
            <Sugar kind={n.kind} position={n.pos} id={SUGAR_ID[n.kind] ? [...base, SUGAR_ID[n.kind]!] : base} glow={p.glow} opacity={p.opacity} />
            {mats4[i] && <mesh geometry={bond} material={mats[0]} matrixAutoUpdate={false} matrix={mats4[i]!} />}
          </group>
        ))}
      </group>
    </group>
  );
}
