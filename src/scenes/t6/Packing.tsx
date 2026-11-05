/**
 * t6-packing — DNA packing levels. Units = nm inside a world group scaled by 1/Z (Z = nm per world unit),
 * so the camera stays at a constant distance while we zoom between levels.
 *  0 naked DNA double helix (2 m of DNA must be packed)
 *  1 histones assemble into the octamer (H3/H4 then H2A/H2B), DNA approaches and wraps 1.65 turns
 *  2 neighbouring nucleosomes form along the DNA, H1 binds at each entry/exit, the string tightens
 *  3 + charges (Lys/Arg) on histones, − charges on the DNA backbone; DNA lifts and snaps back (attraction)
 *  4 zoom out: 10 nm "beads on a string" (euchromatin); RNA polymerase binds linker DNA, RNA emerges
 *  5 the string coils into the 30 nm solenoid (heterochromatin); RNA polymerase is pushed off and cannot enter
 *  6 the 30 nm fibre bends into a loop (loops → maximum condensation in mitotic chromosomes)
 */
import { useMemo } from 'react';
import { Quaternion, Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { clamp, rand, seg, vis, type V3 } from '@/engine/anim';
import { Anchor, lumpySphere, nucleicMaterial, PALETTE, proteinMaterial, useDisposable, useKitHighlight, useStageCamera, type CamKey } from '@/three/kit';
import { chainPath, Charges, Duplex, NUC, Octamer, OctamerField, wrapPoint, type NucPose } from './parts/chromatin';
import { DynTube, PathBuf } from './parts/tube';
import { keyedLog, useFollow } from './parts/util';

export const P = [0, 0.14, 0.28, 0.42, 0.57, 0.71, 0.86] as const;

const K = 12;
const NN = 2 * K + 1;
const HERO = K;

const CAM: CamKey[] = [
  { at: 0, pos: [0, 2.5, 14.5], target: [0, 0, 0], fov: 36 },
  { at: 0.14, pos: [2.5, 5.5, 13], target: [0, 0, 0], fov: 36 },
  { at: 0.28, pos: [2.5, 5.5, 13], target: [0, 0, 0], fov: 36 },
  { at: 0.31, pos: [0, 4, 14], target: [0, 0, 0], fov: 36 },
  { at: 0.42, pos: [0, 4, 14], target: [0, 0, 0], fov: 36 },
  { at: 0.45, pos: [-3, 6, 12.5], target: [0, 0, 0], fov: 36 },
  { at: 0.57, pos: [-3, 6, 12.5], target: [0, 0, 0], fov: 36 },
  { at: 0.6, pos: [0, 3.5, 14.5], target: [0, 0, 0], fov: 36 },
  { at: 0.71, pos: [0, 3.5, 14.5], target: [0, 0, 0], fov: 36 },
  { at: 0.78, pos: [2, 4.5, 13.5], target: [0, 0, 0], fov: 36 },
  { at: 0.86, pos: [2, 4.5, 13.5], target: [0, 0, 0], fov: 36 },
  { at: 0.95, pos: [0, 3, 14.5], target: [0, 0, 0], fov: 36 },
  { at: 1, pos: [-1.5, 3.5, 14], target: [0, 0, 0], fov: 36 },
];

const ZK: [number, number][] = [
  [0, 9],
  [0.1, 2.6],
  [0.14, 2.5],
  [0.28, 2.5],
  [0.305, 4.6],
  [0.42, 4.6],
  [0.445, 2.4],
  [0.57, 2.4],
  [0.61, 12],
  [0.71, 12],
  [0.79, 7.6],
  [0.86, 7.6],
  [0.94, 8.6],
  [0.985, 16],
];

// ——— poses ———
const Y = new Vector3(0, 1, 0);
const X = new Vector3(1, 0, 0);
function nakedPose(k: number, out: NucPose) {
  out.pos.set(k * 20, 0, 0);
  out.quat.identity();
}
function stringPose(k: number, S: number, out: NucPose) {
  if (k === 0) {
    out.pos.set(0, 0, 0);
    out.quat.identity();
    return;
  }
  out.pos.set(k * S, 3.5 * Math.sin(k * 1.3), 3 * Math.cos(k * 0.9) - 3);
  out.quat.setFromAxisAngle(X, (rand(k * 3.7) - 0.5) * 1.3).multiply(_q.setFromAxisAngle(Y, (rand(k * 5.1) - 0.5) * 1.2));
}
const _q = new Quaternion();
const _z = new Vector3();
const _y = new Vector3();
const _x = new Vector3();
/** 30 nm solenoid along x (6 nucleosomes per turn, pitch 11 nm), optionally bent into a loop (bend 0..1). */
function solenoidPose(i: number, bend: number, out: NucPose) {
  const th = (i - HERO) * ((2 * Math.PI) / 6);
  const x = ((i - HERO) * 11) / 6;
  const r = 11;
  let px = x;
  let py = r * Math.cos(th);
  const pz = r * Math.sin(th);
  // radial inward (dyad) and tangential (axis) directions
  _z.set(0, -Math.cos(th), -Math.sin(th));
  _y.set(0, -Math.sin(th), Math.cos(th));
  if (bend > 0.001) {
    const Rl = 26 / bend;
    const a = x / Rl;
    const yy = py;
    px = (Rl - yy) * Math.sin(a);
    py = Rl - (Rl - yy) * Math.cos(a);
    _q.setFromAxisAngle(_x.set(0, 0, 1), -a);
    _z.applyQuaternion(_q);
    _y.applyQuaternion(_q);
  }
  out.pos.set(px, py - (bend > 0.001 ? 22 * bend : 0), pz);
  _x.crossVectors(_y, _z).normalize();
  out.quat.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
}
import { CatmullRomCurve3, Matrix4, SphereGeometry, TubeGeometry } from 'three';
const _m = new Matrix4();

const tmpA: NucPose = { pos: new Vector3(), quat: new Quaternion() };
const tmpB: NucPose = { pos: new Vector3(), quat: new Quaternion() };
const _v = new Vector3();

/** Mitotic chromosome (world units): two sister chromatids joined at the centromere. */
function Chromosome({ k }: { k: number }) {
  const geos = useDisposable(() => {
    const mk = (sx: number) => {
      const c = new CatmullRomCurve3([new Vector3(0.95 * sx, 2.6, 0), new Vector3(0.45 * sx, 1.2, 0.05), new Vector3(0.2 * sx, 0.35, 0), new Vector3(0.45 * sx, -1.0, -0.05), new Vector3(1.05 * sx, -2.9, 0)]);
      const g = new TubeGeometry(c, 96, 0.42, 20, false);
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const n = 0.06 * Math.sin(y * 9 + z * 5) * Math.cos(x * 7 + y * 3);
        pos.setXYZ(i, x * (1 + n), y, z * (1 + n));
      }
      g.computeVertexNormals();
      return g;
    };
    return [mk(-1), mk(1), new SphereGeometry(0.5, 32, 24)];
  }, []);
  const mat = useDisposable(() => proteinMaterial('#6f86d6', { roughness: 0.55 }), []);
  const mats = useMemo(() => [mat], [mat]);
  useKitHighlight(mats, 'mitotic-chromosome', { opacity: k });
  return (
    <group position={[0, 0, 0]} scale={0.4 + 0.6 * k} visible={k > 0.01}>
      <mesh geometry={geos[0]} material={mat} />
      <mesh geometry={geos[1]} material={mat} />
      <mesh geometry={geos[2]} material={mat} position={[0, 0.35, 0]} scale={[1.1, 0.7, 0.8]} />
      <Anchor id="mitotic-chromosome" position={[-0.5, 1.4, 0.1]} show={k} />
    </group>
  );
}

export default function PackingScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const Z = useFollow(keyedLog(t, ZK), { log: true });

  const poses = useMemo<NucPose[]>(() => Array.from({ length: NN }, () => ({ pos: new Vector3(), quat: new Quaternion(), s: 1 })), []);
  const dnaPoses = useMemo<NucPose[]>(() => Array.from({ length: NN }, () => ({ pos: new Vector3(), quat: new Quaternion(), s: 1 })), []);
  const others = useMemo<NucPose[]>(() => Array.from({ length: NN - 1 }, () => ({ pos: new Vector3(), quat: new Quaternion(), s: 1 })), []);
  const wraps = useMemo(() => new Float32Array(NN), []);
  const Rs = useMemo(() => new Float32Array(NN), []);
  const marks = useMemo(() => new Int32Array(NN * 2), []);
  const full = useMemo(() => new PathBuf(4200), []);
  const sub = useMemo(() => new PathBuf(1400), []);

  const heroWrap = seg(t, 0.2, 0.265);
  const othersIn = seg(t, 0.29, 0.33);
  const compact = seg(t, 0.38, 0.415);
  const approach = seg(t, 0.17, 0.2);
  const pulse = Math.sin(Math.PI * clamp((t - 0.47) / 0.07)) * (t > 0.47 && t < 0.54 ? 1 : 0);
  const coil = (i: number) => seg(t, 0.72 + 0.035 * (Math.abs(i - HERO) / K), 0.76 + 0.035 * (Math.abs(i - HERO) / K));
  const bend = seg(t, 0.875, 0.95);

  for (let i = 0; i < NN; i++) {
    const k = i - HERO;
    nakedPose(k, tmpA);
    stringPose(k, 20 - 3 * compact, tmpB);
    const a = k === 0 ? 1 : othersIn;
    const P0 = poses[i];
    P0.pos.lerpVectors(tmpA.pos, tmpB.pos, a);
    P0.quat.slerpQuaternions(tmpA.quat, tmpB.quat, a);
    const c = coil(i);
    if (c > 0) {
      solenoidPose(i, bend, tmpA);
      P0.pos.lerp(tmpA.pos, c);
      P0.quat.slerp(tmpA.quat, c);
    }
    P0.s = k === 0 ? 1 : othersIn;
    wraps[i] = k === 0 ? heroWrap : othersIn;
    Rs[i] = NUC.R + (k === 0 ? 0.75 * pulse : 0) + (k === 0 ? 0 : 0);
    const D = dnaPoses[i];
    D.pos.copy(P0.pos).add(_v.set(0, 3.5, 9).multiplyScalar(1 - approach));
    D.quat.copy(P0.quat);
  }
  others.forEach((o, j) => {
    const src = poses[j < HERO ? j : j + 1];
    o.pos.copy(src.pos);
    o.quat.copy(src.quat);
    o.s = src.s;
  });
  const lead = 60 * (1 - 0.85 * seg(t, 0.72, 0.8));
  chainPath(dnaPoses, full, { Rs, wraps, leadIn: lead, leadOut: lead, marks, wrapSteps: 44 });
  // duplex region: from nucleosome HERO−2 to HERO+2
  const a0 = Math.max(0, marks[(HERO - 2) * 2] - 6);
  const a1 = Math.min(full.n - 1, marks[(HERO + 2) * 2 + 1] + 6);
  sub.clear();
  for (let i = a0; i <= a1 && sub.n < sub.cap; i++) sub.push(full.a[i * 3], full.a[i * 3 + 1], full.a[i * 3 + 2]);

  const duplexOn = 1 - seg(t, 0.575, 0.6);
  const tubeOn = 1 - duplexOn;

  // charges (step 3)
  const charges = vis(t, 0.43, 0.565, 0.015);
  const minus = useMemo(() => Array.from({ length: 16 }, () => new Vector3()), []);
  const plus = useMemo(() => {
    const pts: Vector3[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pts.push(new Vector3(Math.sin(a) * 2.5, 2.55, Math.cos(a) * 2.5));
      pts.push(new Vector3(Math.sin(a + 0.26) * 2.5, -2.55, Math.cos(a + 0.26) * 2.5));
    }
    return pts;
  }, []);
  for (let i = 0; i < minus.length; i++) {
    const phi = -NUC.phiMax * 0.95 + (1.9 * NUC.phiMax * i) / (minus.length - 1);
    wrapPoint(phi, minus[i], Rs[HERO] + 1.5);
  }

  // RNA polymerase
  const mid = marks[(HERO + 1) * 2 + 1] + Math.round((marks[(HERO + 2) * 2] - marks[(HERO + 1) * 2 + 1]) / 2);
  full.get(Math.min(full.n - 1, Math.max(0, mid)), _v);
  const polIn = seg(t, 0.6, 0.64);
  const polOff = seg(t, 0.715, 0.745);
  const polBack = seg(t, 0.79, 0.83) * (1 - seg(t, 0.86, 0.9));
  const polShow = vis(t, 0.595, 0.9, 0.02);
  const polPos: V3 = [
    _v.x * (1 - polOff) + 8 * polOff + (1 - polIn) * 10 - polBack * 8,
    _v.y + 7 + (1 - polIn) * 40 + polOff * 34 - polBack * 12,
    _v.z + 3 + polOff * 10 - polBack * 8,
  ];
  const rna = seg(t, 0.64, 0.7) * (1 - polOff);
  const rnaBuf = useMemo(() => new PathBuf(30), []);
  rnaBuf.clear();
  for (let i = 0; i < 30; i++) {
    const u = (i / 29) * rna;
    rnaBuf.push(polPos[0] + 3 + u * 10, polPos[1] + 3 + u * 14 + Math.sin(u * 9) * 2, polPos[2] + Math.cos(u * 7) * 3);
  }

  // materials
  const tubeMat = useDisposable(() => nucleicMaterial(PALETTE.dna), []);
  const rnaMat = useDisposable(() => nucleicMaterial(PALETTE.mrna), []);
  const h1Mat = useDisposable(() => proteinMaterial(PALETTE.h1), []);
  const polMat = useDisposable(() => proteinMaterial('#fab005'), []);
  const h1Mats = useMemo(() => [h1Mat], [h1Mat]);
  const polMats = useMemo(() => [polMat], [polMat]);
  useKitHighlight(h1Mats, 'histone-h1', { opacity: seg(t, 0.335, 0.36) });
  useKitHighlight(polMats, 'rna-polymerase', { opacity: polShow });
  const h1Geo = useDisposable(() => lumpySphere({ detail: 6, scale: [1.5, 1.1, 1.2], noise: 0.08, seed: 9 }), []);
  const polGeo = useDisposable(() => lumpySphere({ detail: 9, scale: [6, 5, 5.2], noise: 0.07, seed: 33, bumps: [{ dir: [0, -1, 0.3], amp: -0.3, width: 0.5 }, { dir: [1, 0.4, 0], amp: 0.2, width: 0.6 }] }), []);

  const fibreIds = useMemo(() => ['nucleosome', 'fiber-10nm', 'fiber-30nm', 'euchromatin', 'heterochromatin', 'chromatin-loop'], []);
  const dnaIds = useMemo(() => ['dna', 'fiber-10nm', 'fiber-30nm', 'euchromatin', 'heterochromatin', 'chromatin-loop'], []);

  const s = 1 / Z;
  const hero = poses[HERO];
  const steps = t >= P[5] ? 'b' : 'a';
  void steps;

  const chromo = seg(t, 0.95, 0.99);
  return (
    <>
    <Chromosome k={chromo} />
    <group scale={s * (1 - 0.9 * chromo)} visible={chromo < 0.99}>
      {/* hero nucleosome */}
      <group position={hero.pos.toArray() as V3} quaternion={hero.quat}>
        <Octamer assemble={seg(t, 0.145, 0.19)} tails={0.5 * seg(t, 0.17, 0.2)} t={t} ids={['nucleosome', 'histone-octamer', ...fibreIds]} />
        <Anchor id="nucleosome" position={[0, 2.2, 2.4]} show={seg(t, 0.15, 0.19) * (1 - seg(t, 0.95, 0.97))} />
        <Anchor id="histone-octamer" position={[-1.2, 1.2, 2.4]} show={seg(t, 0.16, 0.19) * (1 - seg(t, 0.95, 0.97))} />
        <Anchor id="histone-h3" position={[1.2, 1.2, 1.5]} show={seg(t, 0.16, 0.19) * (1 - seg(t, 0.57, 0.6))} />
        <Anchor id="histone-h4" position={[1.3, -1.2, -1.2]} show={seg(t, 0.16, 0.19) * (1 - seg(t, 0.57, 0.6))} />
        <Anchor id="histone-h2a" position={[-1.3, 1.2, 1.3]} show={seg(t, 0.17, 0.2) * (1 - seg(t, 0.57, 0.6))} />
        <Anchor id="histone-h2b" position={[-1.3, -1.2, 1.3]} show={seg(t, 0.17, 0.2) * (1 - seg(t, 0.57, 0.6))} />
        <Charges points={plus} sign={1} size={0.75} opacity={charges} />
        <Charges points={minus} sign={-1} size={0.75} opacity={charges} />
      </group>
      <OctamerField poses={others} count={others.length} id={fibreIds} />

      {/* H1 at every nucleosome's entry/exit (dyad, outside the DNA) */}
      {poses.map((p0, i) => {
        const k = i - HERO;
        const fly = 1 - seg(t, 0.335 + Math.abs(k) * 0.003, 0.37 + Math.abs(k) * 0.003);
        _v.set(0, 0, NUC.R + 1.7).applyQuaternion(p0.quat).add(p0.pos);
        return <mesh key={i} geometry={h1Geo} material={h1Mat} position={[_v.x, _v.y + fly * 25, _v.z + fly * 10]} quaternion={p0.quat} visible={t > 0.335} />;
      })}
      <Anchor id="histone-h1" position={(() => { _v.set(0, 0, NUC.R + 1.7).applyQuaternion(hero.quat).add(hero.pos); return [_v.x, _v.y, _v.z] as V3; })()} show={seg(t, 0.36, 0.38) * (1 - seg(t, 0.57, 0.6))} />

      {/* DNA: double helix in close-up, smooth tube when zoomed out */}
      <Duplex path={sub.a} n={sub.n} capBp={1500} id={dnaIds} opacity={duplexOn} />
      {tubeOn > 0.01 && <DynTube path={full.a} n={full.n} radius={1.0} material={tubeMat} cap={4200} radial={8} id={dnaIds} opacity={tubeOn} />}
      <Anchor id="dna" position={(() => { full.get(Math.max(0, marks[(HERO + 1) * 2] - 4), _v); return [_v.x, _v.y, _v.z] as V3; })()} show={1 - seg(t, 0.57, 0.6)} />

      {/* RNA polymerase + transcript */}
      <mesh geometry={polGeo} material={polMat} position={polPos} visible={polShow > 0.01} />
      <Anchor id="rna-polymerase" position={polPos} show={polShow} />
      {rna > 0.02 && <DynTube path={rnaBuf.a} n={30} radius={0.6} material={rnaMat} cap={30} radial={8} id={null} />}

      {/* fibre-level labels */}
      <Anchor id="fiber-10nm" position={(() => { const p1 = poses[HERO - 3].pos; return [p1.x, p1.y, p1.z] as V3; })()} show={seg(t, 0.6, 0.62) * (1 - seg(t, 0.72, 0.74))} />
      <Anchor id="euchromatin" position={(() => { const p1 = poses[HERO + 4].pos; return [p1.x, p1.y, p1.z] as V3; })()} show={seg(t, 0.6, 0.62) * (1 - seg(t, 0.72, 0.74))} />
      <Anchor id="fiber-30nm" position={(() => { const p1 = poses[HERO - 4].pos; return [p1.x, p1.y, p1.z] as V3; })()} show={seg(t, 0.78, 0.8) * (1 - seg(t, 0.95, 0.97))} />
      <Anchor id="heterochromatin" position={(() => { const p1 = poses[HERO + 5].pos; return [p1.x, p1.y, p1.z] as V3; })()} show={seg(t, 0.78, 0.8) * (1 - seg(t, 0.95, 0.97))} />
      <Anchor id="chromatin-loop" position={(() => { const p1 = poses[HERO].pos; return [p1.x, p1.y, p1.z] as V3; })()} show={seg(t, 0.92, 0.95) * (1 - chromo)} />
    </group>
    </>
  );
}
