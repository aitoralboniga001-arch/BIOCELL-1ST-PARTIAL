/**
 * Trafficking machinery shared by the topic 9 / 10 scenes (not in the kit yet):
 *  - <DynaminCollar>: helical oligomer of dynamin subunits (stalk + GTPase head) around a membrane neck;
 *    subunits fly in from the cytosol, the helix constricts, GTP → GDP on every head.
 *  - <Nucleotides>: GTP / GDP tokens (guanine bead + phosphate beads) at given points, instanced.
 *  - <BlobShell>: kit-style coat of protein blobs on a spherical shell (COPI, COPII Sec13/31, Sec23/24,
 *    caveolin), revealed from a direction like the kit Vesicle coat.
 *  - <TriskelionCloud>: clathrin triskelions released / drifting (uncoating).
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { CapsuleGeometry, Color, InstancedMesh, Matrix4, Object3D, Quaternion, SphereGeometry, Vector3 } from 'three';
import { clamp, lerp, rand, smooth, type V3 } from '@/engine/anim';
import { fibonacciSphere, groupProps, lumpySphere, PALETTE, proteinMaterial, Triskelion, useDisposable, useKitHighlight, type KitProps } from '@/three/kit';

export const NUC = { gtp: '#8ce99a', gdp: '#fa5252' } as const;

const _o = new Object3D();
const _v = new Vector3();
const _w = new Vector3();
const _t = new Vector3();
const _q = new Quaternion();
const _c = new Color();
const Y = new Vector3(0, 1, 0);

// ———————————————————————————————————————— dynamin ————————————————————————————————————————

export interface DynaminCollarProps extends KitProps {
  /** neck mid-surface radius (membrane) */
  neckR: number;
  /** top / bottom y of the helix */
  y0: number;
  y1: number;
  turns?: number;
  perTurn?: number;
  /** clearance from the neck mid-surface to the helix centre line (≈ half bilayer + stalk) */
  clearance?: number;
  /** 0..1 subunits arrived (each subunit has its own staggered arrival; bottom first) */
  assembled: number;
  /** 0..1 subunits leaving (disassembly) */
  release?: number;
  /** 0..1 GTP hydrolysed (staggered along the helix) */
  hydrolysis?: number;
  /** twist (radians) added along the helix while constricting */
  twist?: number;
  /** size of a subunit */
  size?: number;
  seed?: number;
  /** show GTP/GDP tokens on the heads */
  nucleotides?: boolean;
  /** optional id for the GTP tokens */
  gtpId?: string;
}

/** Where subunit i starts (free in the cytosol) — deterministic. */
function freePos(i: number, seed: number, R: number, ymid: number, out: Vector3) {
  const a = rand(seed * 31 + i * 7) * Math.PI * 2;
  const rr = R + 3.5 + rand(seed + i * 3) * 4;
  return out.set(Math.cos(a) * rr, ymid + (rand(seed * 5 + i) - 0.5) * 6, Math.sin(a) * rr);
}

export function DynaminCollar(p: DynaminCollarProps) {
  const turns = p.turns ?? 2.5;
  const per = p.perTurn ?? 13;
  const n = Math.round(turns * per);
  const sz = p.size ?? 1;
  const seed = p.seed ?? 3;
  const geos = useDisposable(
    () => [
      new CapsuleGeometry(0.3 * sz, 0.62 * sz, 8, 16), // stalk (along local y)
      lumpySphere({ detail: 5, scale: [0.42 * sz, 0.36 * sz, 0.38 * sz], noise: 0.08, seed: 23 }), // GTPase head
      lumpySphere({ detail: 4, scale: [0.24 * sz, 0.2 * sz, 0.22 * sz], noise: 0.06, seed: 29 }), // PH domain (membrane side)
    ],
    [sz],
  );
  const mats = useDisposable(() => [proteinMaterial(PALETTE.dynamin), proteinMaterial(new Color(PALETTE.dynamin).lerp(new Color('#ffffff'), 0.18).getStyle()), proteinMaterial(new Color(PALETTE.dynamin).multiplyScalar(0.75).getStyle())], []);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  const stalk = useRef<InstancedMesh>(null);
  const head = useRef<InstancedMesh>(null);
  const ph = useRef<InstancedMesh>(null);
  const tokenPts = useMemo(() => Array.from({ length: n }, () => new Vector3()), [n]);
  const tokenShow = useMemo(() => new Float32Array(n), [n]);
  const tokenHyd = useMemo(() => new Float32Array(n), [n]);

  const clear = p.clearance ?? 0.98;
  useLayoutEffect(() => {
    const S = stalk.current;
    const H = head.current;
    const PH = ph.current;
    if (!S || !H || !PH) return;
    const Rh = p.neckR + clear * sz;
    const ymid = (p.y0 + p.y1) / 2;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const u = i / Math.max(1, n - 1);
      // arrival: bottom (u=0 at y1) first
      const arr = smooth(clamp((p.assembled * 1.25 - u) / 0.25));
      const lea = smooth(clamp(((p.release ?? 0) * 1.3 - (1 - u)) / 0.3));
      const a = u * turns * Math.PI * 2 + (p.twist ?? 0) * u;
      const y = lerp(p.y1, p.y0, u);
      // slot on the helix
      _v.set(Math.cos(a) * Rh, y, Math.sin(a) * Rh);
      // tangent (helix direction)
      const pitch = (p.y0 - p.y1) / (turns * Math.PI * 2);
      _t.set(-Math.sin(a) * Rh, pitch, Math.cos(a) * Rh).normalize();
      freePos(i, seed, Rh, ymid, _w);
      const vis = arr * (1 - lea);
      if (vis < 0.01) {
        tokenShow[i] = 0;
        continue;
      }
      // position: free → slot (arrival), slot → away (release)
      const pos = _o.position;
      pos.copy(_w).lerp(_v, arr);
      if (lea > 0) {
        _w.set(Math.cos(a) * (Rh + 4 + 3 * rand(i + seed)), y + (rand(i * 3 + seed) - 0.5) * 3, Math.sin(a) * (Rh + 4 + 3 * rand(i * 5 + seed)));
        pos.lerp(_w, lea);
      }
      // orientation: stalk along the helix tangent when bound, tumbling when free
      _q.setFromUnitVectors(Y, _t);
      const tumble = (1 - arr + lea) * (rand(i * 11 + seed) * 6);
      _o.quaternion.copy(_q);
      if (tumble > 0.001) _o.rotateZ(tumble);
      _o.scale.setScalar(0.4 + 0.6 * Math.min(1, vis * 1.5));
      _o.updateMatrix();
      S.setMatrixAt(k, _o.matrix);
      // head: outward (radial) from the stalk centre
      const ox = Math.cos(a);
      const oz = Math.sin(a);
      const savePos = _v.copy(pos);
      _o.position.set(savePos.x + ox * 0.62 * sz, savePos.y + 0.05 * sz, savePos.z + oz * 0.62 * sz);
      _o.updateMatrix();
      H.setMatrixAt(k, _o.matrix);
      tokenPts[i].set(savePos.x + ox * 0.98 * sz, savePos.y + 0.18 * sz, savePos.z + oz * 0.98 * sz);
      tokenShow[i] = arr * (1 - lea);
      tokenHyd[i] = smooth(clamp(((p.hydrolysis ?? 0) * 1.3 - u * 0.3 - rand(i * 7 + seed) * 0.15) / 0.22));
      // PH domain toward the membrane
      _o.position.set(savePos.x - ox * 0.42 * sz, savePos.y - 0.05 * sz, savePos.z - oz * 0.42 * sz);
      _o.updateMatrix();
      PH.setMatrixAt(k, _o.matrix);
      k++;
    }
    for (const m of [S, H, PH]) {
      m.count = k;
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  });
  return (
    <group {...groupProps(p)}>
      <instancedMesh ref={stalk} args={[geos[0], mats[0], n]} frustumCulled={false} />
      <instancedMesh ref={head} args={[geos[1], mats[1], n]} frustumCulled={false} />
      <instancedMesh ref={ph} args={[geos[2], mats[2], n]} frustumCulled={false} />
      {p.nucleotides && <Nucleotides points={tokenPts} show={tokenShow} hydrolysed={tokenHyd} size={0.85 * sz} id={p.gtpId} opacity={p.opacity} />}
    </group>
  );
}

// ———————————————————————————————————————— nucleotides ————————————————————————————————————————

export interface NucleotidesProps extends KitProps {
  points: Vector3[];
  /** per point visibility 0..1 */
  show: Float32Array | number[];
  /** per point 0 = GTP (green, 3 phosphates) … 1 = GDP (red, 2 phosphates; the 3rd Pi drifts away) */
  hydrolysed: Float32Array | number[];
  size?: number;
}

/** GTP / GDP tokens: a guanine bead plus a short chain of phosphate beads. */
export function Nucleotides(p: NucleotidesProps) {
  const n = p.points.length;
  const s = p.size ?? 1;
  const geos = useDisposable(() => [new SphereGeometry(0.17 * s, 16, 12), new SphereGeometry(0.085 * s, 12, 8)], [s]);
  const mats = useDisposable(() => [proteinMaterial('#ffffff', { emissive: 0.03, roughness: 0.35 }), proteinMaterial(PALETTE.phosphate, { emissive: 0.12, roughness: 0.35 })], []);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity, mode: 'boost', strength: 0.5 });
  const base = useRef<InstancedMesh>(null);
  const phos = useRef<InstancedMesh>(null);
  const cg = useMemo(() => new Color(NUC.gtp), []);
  const cd = useMemo(() => new Color(NUC.gdp), []);
  useLayoutEffect(() => {
    const B = base.current;
    const P = phos.current;
    if (!B || !P) return;
    let k = 0;
    let kp = 0;
    for (let i = 0; i < n; i++) {
      const sh = p.show[i];
      if (sh < 0.02) continue;
      const hy = p.hydrolysed[i];
      const c = p.points[i];
      _o.quaternion.identity();
      _o.position.copy(c);
      _o.scale.setScalar(sh);
      _o.updateMatrix();
      B.setMatrixAt(k, _o.matrix);
      _c.copy(cg).lerp(cd, smooth(clamp(hy * 1.4)));
      B.setColorAt(k, _c);
      k++;
      for (let j = 0; j < 3; j++) {
        let off = 0.21 + j * 0.15;
        let dy = 0.02 * j;
        let sc = sh;
        if (j === 2 && hy > 0) {
          // the released phosphate (Pi) drifts away and fades
          off += hy * 1.4;
          dy += hy * 0.6;
          sc *= 1 - smooth(clamp((hy - 0.6) / 0.4));
        }
        if (sc < 0.02) continue;
        _o.position.set(c.x + off * s * 0.8, c.y + dy * s, c.z + off * s * 0.5);
        _o.scale.setScalar(sc);
        _o.updateMatrix();
        P.setMatrixAt(kp++, _o.matrix);
      }
    }
    B.count = k;
    P.count = kp;
    B.instanceMatrix.needsUpdate = true;
    P.instanceMatrix.needsUpdate = true;
    if (B.instanceColor) B.instanceColor.needsUpdate = true;
    B.computeBoundingSphere();
    P.computeBoundingSphere();
  });
  return (
    <group {...groupProps(p)}>
      <instancedMesh ref={base} args={[geos[0], mats[0], Math.max(1, n)]} frustumCulled={false} />
      <instancedMesh ref={phos} args={[geos[1], mats[1], Math.max(1, n * 3)]} frustumCulled={false} />
    </group>
  );
}

/** A single nucleotide token (GTP → GDP with `hydrolysed`). */
export function Nucleotide(p: KitProps & { hydrolysed: number; show?: number; size?: number }) {
  const pts = useMemo(() => [new Vector3()], []);
  const sh = useMemo(() => new Float32Array(1), []);
  const hy = useMemo(() => new Float32Array(1), []);
  sh[0] = p.show ?? 1;
  hy[0] = p.hydrolysed;
  return <Nucleotides points={pts} show={sh} hydrolysed={hy} size={p.size} id={p.id} glow={p.glow} opacity={p.opacity} position={p.position} rotation={p.rotation} />;
}

// ———————————————————————————————————————— blob coats ————————————————————————————————————————

export interface BlobShellProps extends KitProps {
  /** shell radius (blob centres) */
  radius: number;
  color: string;
  count?: number;
  /** blob size (≈ diameter) */
  blob?: number;
  /** 0..1 revealed from `from` */
  amount: number;
  from?: V3;
  /** 0..1: blobs fly in from the cytosol instead of popping in place */
  flyIn?: boolean;
  seed?: number;
  /** flatten the blobs radially (0.7 = kit coat) */
  flat?: number;
  /** limit to a polar cap: only points with angle from `from` ≤ maxAngle (radians) */
  maxAngle?: number;
}

/** Coat of protein blobs on a sphere shell (the kit Vesicle coat recipe), assembling from a direction. */
export function BlobShell(p: BlobShellProps) {
  const n = p.count ?? 70;
  const seed = p.seed ?? 17;
  const geo = useDisposable(() => lumpySphere({ detail: 4, scale: [1, p.flat ?? 0.7, 1], noise: 0.12, seed }), [seed, p.flat]);
  const mats = useDisposable(() => [proteinMaterial(p.color)], [p.color]);
  useKitHighlight(mats, p.id, { glow: p.glow, opacity: p.opacity });
  const ref = useRef<InstancedMesh>(null);
  const pts = useMemo(() => fibonacciSphere(n), [n]);
  const fromKey = (p.from ?? [0, -1, 0]).join(',');
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const from = _t.set(...(p.from ?? [0, -1, 0])).normalize();
    const maxA = p.maxAngle ?? Math.PI;
    let k = 0;
    for (let i = 0; i < pts.length; i++) {
      const v = pts[i];
      const ang = Math.acos(clamp(v.dot(from), -1, 1));
      if (ang > maxA) continue;
      const s = smooth(clamp((p.amount * 1.08 - ang / maxA) / 0.12));
      if (s <= 0.01) continue;
      _v.copy(v).multiplyScalar(p.radius);
      if (p.flyIn) _v.addScaledVector(v, (1 - s) * 3.5 + 0.0);
      _o.position.copy(_v);
      _o.lookAt(0, 0, 0);
      _o.rotateX(Math.PI / 2);
      _o.rotateY(rand(seed + i) * 6.28);
      _o.scale.setScalar((p.blob ?? p.radius * 0.3) * 0.5 * (p.flyIn ? 0.6 + 0.4 * s : s));
      _o.updateMatrix();
      m.setMatrixAt(k++, _o.matrix);
    }
    m.count = k;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [p.amount, p.radius, p.blob, fromKey, pts, p.flyIn, p.maxAngle]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group {...groupProps(p)}>
      <instancedMesh ref={ref} args={[geo, mats[0], n]} frustumCulled={false} />
    </group>
  );
}

// ———————————————————————————————————————— triskelions ————————————————————————————————————————

export interface TriskelionCloudProps extends KitProps {
  /** where each triskelion starts (on the cage) */
  starts: V3[];
  /** per-triskelion release progress 0 (on the cage) … 1 (drifted away) */
  release: (i: number) => number;
  /** drift direction centre: they move away from this point */
  centre: V3;
  size?: number;
  drift?: number;
}

/** Clathrin triskelions coming off a cage and drifting into the cytosol (uncoating). */
export function TriskelionCloud(p: TriskelionCloudProps) {
  const size = p.size ?? 1;
  return (
    <group {...groupProps(p)}>
      {p.starts.map((s, i) => {
        const k = p.release(i);
        if (k <= 0.001) return null;
        const dx = s[0] - p.centre[0];
        const dy = s[1] - p.centre[1];
        const dz = s[2] - p.centre[2];
        const l = Math.hypot(dx, dy, dz) || 1;
        const d = (p.drift ?? 5) * k;
        const pos: V3 = [s[0] + (dx / l) * d + Math.sin(i * 1.7) * k, s[1] + (dy / l) * d + Math.cos(i * 2.3) * k * 0.6, s[2] + (dz / l) * d];
        const rot: V3 = [rand(i) * 6 * k + 1.2, rand(i * 3) * 6, rand(i * 7) * 6 * k];
        return <Triskelion key={i} position={pos} rotation={rot} size={size} id={p.id} opacity={(p.opacity ?? 1) * (1 - smooth(clamp((k - 0.75) / 0.25)))} />;
      })}
    </group>
  );
}

export const _m4 = new Matrix4();
