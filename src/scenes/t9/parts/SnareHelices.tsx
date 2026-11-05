/**
 * Molecular close-up of trans-SNARE complexes between a docked vesicle and the target membrane.
 *
 * Frame: target membrane mid-plane at y = 0 (CYTOSOL = +y, TARGET LUMEN = −y); the vesicle (mid-surface radius R)
 * sits above it on the y axis with its centre at `cy`. Each complex lives in the vertical half-plane at azimuth φ
 * (x = r cosφ, z = r sinφ): one v-SNARE helix (red) leaves the vesicle membrane through a TM segment, three t-SNARE
 * helices (purple) leave the target membrane. Unzipped, they splay out radially on their own membranes; zipping
 * (`zip` 0..1) pairs them from the membrane-DISTAL ends (N-termini, far from the axis) towards the membranes into a
 * twisted 4-helix bundle whose inner end pulls the two bilayers together. `spread` (0..1, after fusion) turns the
 * complex into a cis complex lying in the merged flat membrane and slides it outwards.
 *
 * Each helix is a coiled bead chain (α-helix look), all beads of one kind in one InstancedMesh — no allocations per
 * frame. `helixPoint` is exported so the scene can place label anchors on a helix.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, Object3D, SphereGeometry, Vector3 } from 'three';
import { clamp, lerp, smooth } from '@/engine/anim';
import { groupProps, PALETTE, proteinMaterial, useDisposable, useKitHighlight, type KitProps } from '@/three/kit';

export interface SnareState {
  /** vesicle centre height (world y) */
  cy: number;
  /** vesicle mid-surface radius */
  R: number;
  /** 0..1 zipping (distal → proximal) */
  zip: number;
  /** 0..1 after fusion: cis complex in the flat merged membrane, sliding outwards */
  spread: number;
}

const HALF = 0.5; // bilayer half thickness (kit thickness 1)
const EXIT = 0.56; // head surface + a little
const S_TM = 0.18; // fraction of the helix inside the membrane
const S_LINK = 0.3; // end of the juxtamembrane linker
const RV = 1.35; // v-SNARE anchor radius (on the vesicle)
const RT = [1.85, 2.15, 2.45]; // t-SNARE anchor radii
const LAT_T = [-0.32, 0.3, 0.02]; // t-SNARE lateral offsets
const B0 = 2.05; // bundle inner end radius
const B1 = 5.2; // bundle distal end radius
const SLOT = 0.21; // supercoil radius
const TWIST = 2.4; // supercoil turns (radians) along the bundle
const COIL = 0.075; // α-helix coil radius
const PITCH = 0.36;
const LEN = 4.8; // approximate helix length (for the coil phase)
const N = 150; // beads per helix

/** outer-leaflet height of the vesicle at radius r (world y) */
function vesOuter(s: SnareState, r: number) {
  const Ro = s.R + HALF;
  return s.cy - Math.sqrt(Math.max(0, Ro * Ro - r * r));
}

/**
 * Centre line of helix `h` (0 = v-SNARE, 1..3 = t-SNAREs) at parameter u ∈ [0,1] (0 = inside the membrane, 1 = distal
 * N-terminus), in the complex's own (r, y, lateral) coordinates. Writes into out (x = r, y = y, z = lateral).
 */
function centre2(h: number, u: number, s: SnareState, out: Vector3) {
  const sp = smooth(s.spread);
  // ---------------- membrane anchors (TM segment) ----------------
  let ar: number, ay: number, nr: number, ny: number, lat: number;
  if (h === 0) {
    const r = RV + 2.2 * sp;
    const yy = Math.sqrt(Math.max(0, s.R * s.R - RV * RV));
    // vesicle mid-surface point and outward normal; after fusion it is a flat-membrane anchor
    const vr = RV;
    const vy = s.cy - yy;
    const vnr = RV / s.R;
    const vny = -yy / s.R;
    ar = lerp(vr, r, sp);
    ay = lerp(vy, 0, sp);
    nr = lerp(vnr, 0, sp);
    ny = lerp(vny, 1, sp);
    const l = Math.hypot(nr, ny) || 1;
    nr /= l;
    ny /= l;
    lat = 0;
  } else {
    ar = RT[h - 1] + 2.2 * sp;
    ay = 0;
    nr = 0;
    ny = 1;
    lat = LAT_T[h - 1];
  }
  if (u <= S_TM) {
    const k = u / S_TM; // inner leaflet → exit
    const d = lerp(-HALF, EXIT, k);
    out.set(ar + nr * d, ay + ny * d, lat);
    return out;
  }
  const exR = ar + nr * EXIT;
  const exY = ay + ny * EXIT;
  // ---------------- zipped bundle position ----------------
  const b0 = B0 + 2.2 * sp;
  const b1 = B1 + 2.2 * sp;
  const yTop = lerp(vesOuter(s, B0), EXIT, sp);
  const yb0 = lerp((EXIT + yTop) / 2, 0.95, sp);
  const yb1 = yb0 + lerp(0.35, 0.1, sp);
  const ub = clamp((u - S_LINK) / (1 - S_LINK));
  const theta = (h * Math.PI) / 2 + 0.5 + TWIST * ub;
  // bundle frame: axis along (b1-b0, yb1-yb0); e2 = in-plane perpendicular, e1 = lateral
  const ax = b1 - b0;
  const ay2 = yb1 - yb0;
  const al = Math.hypot(ax, ay2);
  const pr = -ay2 / al;
  const py = ax / al;
  let zr: number, zy: number, zl: number;
  if (u <= S_LINK) {
    // linker: exit point → bundle slot at the inner end
    const k = smooth((u - S_TM) / (S_LINK - S_TM));
    const th0 = (h * Math.PI) / 2 + 0.5;
    const sr = b0 + pr * Math.sin(th0) * SLOT;
    const sy = yb0 + py * Math.sin(th0) * SLOT;
    const sl = Math.cos(th0) * SLOT;
    zr = lerp(exR, sr, k);
    zy = lerp(exY, sy, k);
    zl = lerp(lat, sl, k);
  } else {
    zr = lerp(b0, b1, ub) + pr * Math.sin(theta) * SLOT;
    zy = lerp(yb0, yb1, ub) + py * Math.sin(theta) * SLOT;
    zl = Math.cos(theta) * SLOT;
  }
  // ---------------- free (unzipped) position ----------------
  const kf = (u - S_TM) / (1 - S_TM);
  let fr: number, fy: number, fl: number;
  if (h === 0) {
    // leaves the vesicle along its normal, then runs outwards close to the vesicle's lower flank
    const tipR = 5.0;
    const tipY = exY - 0.25;
    const cR = exR + nr * 1.1;
    const cY = exY + ny * 1.1;
    const a = 1 - kf;
    fr = a * a * exR + 2 * a * kf * cR + kf * kf * tipR;
    fy = a * a * exY + 2 * a * kf * cY + kf * kf * tipY;
    fl = 0.05 * Math.sin(kf * 3);
  } else {
    const tipR = 4.9 + 0.15 * (h - 2);
    const tipY = 1.55 + 0.22 * (h - 2);
    const cR = exR + 0.2;
    const cY = exY + 1.2;
    const a = 1 - kf;
    fr = a * a * exR + 2 * a * kf * cR + kf * kf * tipR;
    fy = a * a * exY + 2 * a * kf * cY + kf * kf * tipY;
    fl = lat * (1 + 0.6 * kf);
  }
  // ---------------- zipper: distal end first ----------------
  const q = (1 - u) / (1 - S_TM); // 0 at the N-terminus, 1 at the membrane exit
  const w = Math.max(sp, smooth(clamp((s.zip * 1.25 - q) / 0.25)));
  out.set(lerp(fr, zr, w), lerp(fy, zy, w), lerp(fl, zl, w));
  return out;
}

const _c = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _t = new Vector3();
const _e1 = new Vector3();
const _e2 = new Vector3();
const _o = new Object3D();

/** World position of helix `h` of the complex at azimuth `phi`, parameter u (0..1). */
export function helixPoint(phi: number, h: number, u: number, s: SnareState, out: Vector3) {
  centre2(h, u, s, out);
  const c = Math.cos(phi);
  const sn = Math.sin(phi);
  const r = out.x;
  const y = out.y;
  const l = out.z;
  // radial (c, 0, sn), lateral (−sn, 0, c)
  return out.set(r * c - l * sn, y, r * sn + l * c);
}

export interface SnareHelicesProps extends KitProps {
  state: SnareState;
  /** azimuths of the complexes */
  phis: number[];
  /** extra glow on all helices (e.g. at the trigger) */
  pulse?: number;
}

export function SnareHelices(p: SnareHelicesProps) {
  const geo = useDisposable(() => new SphereGeometry(0.085, 10, 8), []);
  const matV = useDisposable(() => [proteinMaterial(PALETTE.vSnare)], []);
  const matT = useDisposable(() => [proteinMaterial(PALETTE.tSnare)], []);
  useKitHighlight(matV, 'v-snare', { glow: p.pulse, opacity: p.opacity });
  useKitHighlight(matT, 't-snare', { glow: p.pulse, opacity: p.opacity });
  const vRef = useRef<InstancedMesh>(null);
  const tRef = useRef<InstancedMesh>(null);
  const nc = p.phis.length;
  const phisKey = p.phis.join(',');
  const phis = useMemo(() => p.phis.slice(), [phisKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const { cy, R, zip, spread } = p.state;

  useLayoutEffect(() => {
    const V = vRef.current;
    const T = tRef.current;
    if (!V || !T) return;
    const st: SnareState = { cy, R, zip, spread };
    let kv = 0;
    let kt = 0;
    for (const phi of phis) {
      const c = Math.cos(phi);
      const sn = Math.sin(phi);
      // lateral direction (tangential) is the coil's first axis
      for (let h = 0; h < 4; h++) {
        for (let i = 0; i < N; i++) {
          const u = i / (N - 1);
          helixPoint(phi, h, u, st, _c);
          helixPoint(phi, h, Math.max(0, u - 0.01), st, _a);
          helixPoint(phi, h, Math.min(1, u + 0.01), st, _b);
          _t.subVectors(_b, _a).normalize();
          _e1.set(-sn, 0, c);
          _e1.addScaledVector(_t, -_e1.dot(_t)).normalize();
          _e2.crossVectors(_t, _e1).normalize();
          const ph = ((u * LEN) / PITCH) * Math.PI * 2 + h * 1.3;
          _o.position.copy(_c).addScaledVector(_e1, Math.cos(ph) * COIL).addScaledVector(_e2, Math.sin(ph) * COIL);
          _o.updateMatrix();
          if (h === 0) V.setMatrixAt(kv++, _o.matrix);
          else T.setMatrixAt(kt++, _o.matrix);
        }
      }
    }
    V.count = kv;
    T.count = kt;
    V.instanceMatrix.needsUpdate = true;
    T.instanceMatrix.needsUpdate = true;
  }, [cy, R, zip, spread, phis]);

  return (
    <group {...groupProps(p)}>
      <instancedMesh ref={vRef} args={[geo, matV[0], nc * N]} frustumCulled={false} />
      <instancedMesh ref={tRef} args={[geo, matT[0], nc * N * 3]} frustumCulled={false} />
    </group>
  );
}
