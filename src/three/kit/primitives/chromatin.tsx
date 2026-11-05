import { useLayoutEffect, useMemo, useRef } from 'react';
import { CatmullRomCurve3, CylinderGeometry, InstancedMesh, Matrix4, TubeGeometry, Vector3 } from 'three';
import { clamp, rand, type V3 } from '@/engine/anim';
import { groupProps, useDisposable, type KitProps } from '../common';
import { lumpySphere, segmentMatrix } from '../geom';
import { useKitHighlight } from '../hooks';
import { nucleicMaterial, proteinMaterial } from '../materials';
import { PALETTE } from '../palette';

// ———————————————————————————————————————— DNA ————————————————————————————————————————

export interface DNAHelixProps extends KitProps {
  /** straight helix along y of this length (ignored when `points` given) */
  length?: number;
  /** helical turns (default length / 0.34·… ≈ one turn per 1.0 units) */
  turns?: number;
  radius?: number;
  /** follow a path instead (e.g. wrapped around a nucleosome) */
  points?: V3[];
  closed?: boolean;
  /** 0..1 drawn fraction */
  amount?: number;
  /** base pairs per turn (default 10) */
  bpPerTurn?: number;
}

/** Double helix: two backbones (#4fa3ff) + base-pair rungs (#9fd0ff). Straight along y or along `points`. */
export function DNAHelix(p: DNAHelixProps) {
  const r = p.radius ?? 0.22;
  const key = JSON.stringify([p.points, p.length, p.turns, r, p.closed, p.bpPerTurn]);
  const built = useMemo(() => {
    const curve = p.points && p.points.length > 1 ? new CatmullRomCurve3(p.points.map((q) => new Vector3(...q)), !!p.closed, 'centripetal') : new CatmullRomCurve3([new Vector3(0, -(p.length ?? 4) / 2, 0), new Vector3(0, (p.length ?? 4) / 2, 0)]);
    const L = curve.getLength();
    const turns = p.turns ?? L / 1.0;
    const N = Math.max(16, Math.round(turns * 24));
    const frames = curve.computeFrenetFrames(N, !!p.closed);
    const a: Vector3[] = [];
    const b: Vector3[] = [];
    const tmp = new Vector3();
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const c = curve.getPointAt(u);
      const th = u * turns * Math.PI * 2;
      const nI = frames.normals[Math.min(i, N)];
      const bI = frames.binormals[Math.min(i, N)];
      a.push(c.clone().add(tmp.copy(nI).multiplyScalar(Math.cos(th) * r)).add(tmp.copy(bI).multiplyScalar(Math.sin(th) * r)));
      const th2 = th + 2.3; // minor/major groove asymmetry
      b.push(c.clone().add(tmp.copy(nI).multiplyScalar(Math.cos(th2) * r)).add(tmp.copy(bI).multiplyScalar(Math.sin(th2) * r)));
    }
    const nbp = Math.max(2, Math.round(turns * (p.bpPerTurn ?? 10)));
    return { a: new CatmullRomCurve3(a), b: new CatmullRomCurve3(b), nbp, N };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const geos = useDisposable(() => [new TubeGeometry(built.a, built.N * 2, r * 0.22, 8), new TubeGeometry(built.b, built.N * 2, r * 0.22, 8), new CylinderGeometry(1, 1, 1, 6, 1)], [built, r]);
  const mats = useDisposable(() => [nucleicMaterial(PALETTE.dna), nucleicMaterial(PALETTE.dnaBase)], []);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  const amount = clamp(p.amount ?? 1);
  useLayoutEffect(() => {
    const cnt = (g: TubeGeometry) => g.setDrawRange(0, Math.floor(amount * built.N * 2) * 8 * 6);
    cnt(geos[0] as TubeGeometry);
    cnt(geos[1] as TubeGeometry);
  }, [geos, amount, built]);
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const pa = new Vector3();
    const pb = new Vector3();
    const mat = new Matrix4();
    let k = 0;
    for (let i = 0; i < built.nbp; i++) {
      const u = (i + 0.5) / built.nbp;
      if (u > amount) break;
      built.a.getPointAt(u, pa);
      built.b.getPointAt(u, pb);
      segmentMatrix(pa, pb, r * 0.12, mat);
      m.setMatrixAt(k++, mat);
    }
    m.count = k;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [built, amount, r]);
  return (
    <group {...groupProps(p)}>
      <mesh geometry={geos[0]} material={mats[0]} />
      <mesh geometry={geos[1]} material={mats[0]} />
      <instancedMesh ref={ref} args={[geos[2], mats[1], built.nbp]} />
    </group>
  );
}

// ———————————————————————————————————————— nucleosome ————————————————————————————————————————

/** Superhelical path of the ~1.65 turns of DNA around the octamer (origin = octamer centre, axis = y). */
export function nucleosomeDNAPath(extra = 0.6): V3[] {
  const pts: V3[] = [];
  const turns = 1.65;
  const R = 0.62;
  const pitch = 0.36;
  const n = 40;
  pts.push([R + extra, -pitch * turns * 0.5 - 0.1, -extra * 0.8]);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = u * turns * Math.PI * 2;
    pts.push([Math.cos(a) * R, -pitch * turns * 0.5 + u * pitch * turns, Math.sin(a) * R]);
  }
  const a = turns * Math.PI * 2;
  pts.push([Math.cos(a) * R + extra * 0.6, pitch * turns * 0.5 + 0.1, Math.sin(a) * R + extra]);
  return pts;
}

export interface NucleosomeProps extends KitProps {
  size?: number;
  /** 0..1 histone N-terminal tails sticking out */
  tails?: number;
  /** 0..1 fraction of tail lysines acetylated (green beads at the tips) */
  acetyl?: number;
  /** 0..1 methyl marks (pink beads) */
  methyl?: number;
  /** show the H1 linker histone at the DNA entry/exit */
  h1?: boolean;
  /** draw the wrapped DNA (default true) */
  dna?: boolean;
  /** 0..1 how loosely the DNA is wrapped (acetylation loosens it) */
  loosen?: number;
  /** cheaper look for fibres (no tails, simpler DNA) */
  lite?: boolean;
  /** separate glow ids */
  histoneId?: string;
  dnaId?: string;
}

const HISTONES: { c: string; pos: V3 }[] = [
  { c: PALETTE.h3, pos: [0.3, 0.17, 0.08] },
  { c: PALETTE.h4, pos: [-0.05, 0.17, 0.33] },
  { c: PALETTE.h2a, pos: [-0.32, 0.17, -0.05] },
  { c: PALETTE.h2b, pos: [0.05, 0.17, -0.32] },
  { c: PALETTE.h3, pos: [0.32, -0.17, -0.08] },
  { c: PALETTE.h4, pos: [0.05, -0.17, -0.33] },
  { c: PALETTE.h2a, pos: [-0.3, -0.17, 0.05] },
  { c: PALETTE.h2b, pos: [-0.05, -0.17, 0.32] },
];

/** Nucleosome: histone octamer (2× H2A, H2B, H3, H4 — palette colours) wrapped by ≈1.65 turns of DNA; optional tails, marks, H1. */
export function Nucleosome(p: NucleosomeProps) {
  const geo = useDisposable(() => lumpySphere({ detail: 5, scale: [0.27, 0.19, 0.27], noise: 0.06, seed: 31 }), []);
  const mats = useDisposable(() => HISTONES.map((h) => proteinMaterial(h.c)), []);
  const markMats = useDisposable(() => [proteinMaterial(PALETTE.h1), proteinMaterial(PALETTE.acetyl, { emissive: 0.2 }), proteinMaterial(PALETTE.methyl, { emissive: 0.2 }), proteinMaterial('#e9d6c0')], []);
  useKitHighlight(mats, p.histoneId ?? p.id, { glow: p.glow, opacity: p.opacity });
  useKitHighlight(markMats, p.id, { glow: p.glow, opacity: p.opacity });
  const loosen = clamp(p.loosen ?? 0);
  const path = useMemo(() => {
    const base = nucleosomeDNAPath();
    return base.map(([x, y, z]) => [x * (1 + loosen * 0.35), y * (1 + loosen * 0.6), z * (1 + loosen * 0.35)] as V3);
  }, [loosen]);
  const tails = p.lite ? 0 : clamp(p.tails ?? 0);
  const tailPts = useMemo(
    () =>
      HISTONES.map((h, i) => {
        const dir = new Vector3(h.pos[0], h.pos[1] * 2.2, h.pos[2]).normalize();
        return Array.from({ length: 6 }, (_, k) => {
          const d = 0.3 + k * 0.11;
          return [h.pos[0] + dir.x * d + (rand(i * 9 + k) - 0.5) * 0.06, h.pos[1] + dir.y * d, h.pos[2] + dir.z * d + (rand(i * 7 + k) - 0.5) * 0.06] as V3;
        });
      }),
    [],
  );
  const s = p.size ?? 1;
  return (
    <group {...groupProps(p)}>
      <group scale={s}>
        {HISTONES.map((h, i) => (
          <mesh key={i} geometry={geo} material={mats[i]} position={h.pos} />
        ))}
        {(p.dna ?? true) && <DNAHelix points={path} radius={0.1} turns={p.lite ? 8 : 14} id={p.dnaId ?? p.id} opacity={p.opacity} glow={p.glow} />}
        {p.h1 && (
          <mesh material={markMats[0]} position={[0.75, 0, 0.35]}>
            <sphereGeometry args={[0.16, 20, 14]} />
          </mesh>
        )}
        {tails > 0.01 &&
          tailPts.map((pts, i) => {
            const shown = Math.round(tails * pts.length);
            return pts.slice(0, shown).map((q, k) => {
              const tip = k === shown - 1;
              const mark = tip && (i % 2 === 0 ? rand(i) < (p.acetyl ?? 0) * 1.2 : rand(i + 3) < (p.methyl ?? 0) * 1.2);
              return (
                <mesh key={`${i}-${k}`} position={q} material={mark ? (i % 2 === 0 ? markMats[1] : markMats[2]) : mats[i]} scale={mark ? 0.075 : 0.05}>
                  <sphereGeometry args={[1, 12, 8]} />
                </mesh>
              );
            });
          })}
      </group>
    </group>
  );
}

// ———————————————————————————————————————— fibres ————————————————————————————————————————

export interface ChromatinFiberProps extends KitProps {
  kind?: '10nm' | '30nm';
  /** nucleosomes */
  count?: number;
  /** 0..1 compaction blend from 10 nm "beads on a string" to the 30 nm solenoid */
  compact?: number;
}

/** Chromatin fibre: "beads on a string" (10 nm, euchromatin) or the 30 nm solenoid (heterochromatin); `compact` morphs. */
export function ChromatinFiber(p: ChromatinFiberProps) {
  const n = p.count ?? 12;
  const k = clamp(p.compact ?? (p.kind === '30nm' ? 1 : 0));
  const places = useMemo(() => {
    const out: { pos: Vector3; rot: V3 }[] = [];
    for (let i = 0; i < n; i++) {
      const string = new Vector3((i - (n - 1) / 2) * 1.9, Math.sin(i * 1.3) * 0.35, Math.cos(i * 0.9) * 0.3);
      const a = (i / 6) * Math.PI * 2;
      const sol = new Vector3(Math.cos(a) * 1.05, (i - (n - 1) / 2) * 0.36, Math.sin(a) * 1.05);
      out.push({ pos: string.lerp(sol, k), rot: [Math.PI / 2 * k, -a * k + i * 0.7 * (1 - k), 0] });
    }
    return out;
  }, [n, k]);
  const linker = useDisposable(() => {
    const pts = places.map((q) => q.pos.clone());
    return new TubeGeometry(new CatmullRomCurve3(pts, false, 'centripetal'), n * 12, 0.07, 8);
  }, [places]);
  const mats = useDisposable(() => [nucleicMaterial(PALETTE.dna)], []);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  return (
    <group {...groupProps(p)}>
      <mesh geometry={linker} material={mats[0]} />
      {places.map((q, i) => (
        <Nucleosome key={i} lite size={0.85} position={q.pos.toArray() as V3} rotation={q.rot} id={p.id} glow={p.glow} opacity={p.opacity} />
      ))}
    </group>
  );
}

