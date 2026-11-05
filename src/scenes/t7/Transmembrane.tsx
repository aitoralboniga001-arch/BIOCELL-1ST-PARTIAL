/**
 * t7-transmembrane — Insertion of transmembrane proteins (start / stop-transfer sequences).
 *
 * Same world as t7-signal: rough-ER membrane patch, bilayer centre plane y = 0, CYTOSOL = +y, ER LUMEN = −y,
 * translocon at the origin with its lateral gate facing +x. A multipass protein is built on the −x side
 * (x ≈ −6) and its hydropathy plot floats above it in the cytosol.
 *
 * Choreography:
 *  0  the protein's sequence as a strip in the cytosol: hydrophobic blocks (signal peptide + an internal
 *     stop-transfer) stand out; the SRP-bound ribosome waits upstream
 *  1  the complex docks on the translocon; the signal peptide sits in the lateral gate; translation resumes,
 *     the chain loops into the lumen and the signal peptidase cuts the signal peptide
 *  2  the stop-transfer sequence is made, enters the channel and stops there, coiling into an α-helix
 *  3  the stop helix slides sideways through the lateral gate into the bilayer; the channel shuts; what is made
 *     next comes out into the cytosol (before = lumen, stop = membrane, after = cytosol)
 *  4  translation ends, the ribosome leaves, the translocon closes: a single-pass protein (N-lumen, C-cytosol)
 *  5  multipass protein: start / stop / start / stop helices are laid down one after the other
 *  6  the hydropathy plot of that protein is drawn: its hydrophobic peaks sit right above the helices
 */
import { useLayoutEffect, useMemo } from 'react';
import { CatmullRomCurve3, DoubleSide, Matrix4, MeshStandardMaterial, Object3D, Quaternion, Shape, ShapeGeometry, TubeGeometry, Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { clamp, easeInOut, lerp, seg, smooth, vis, type V3 } from '@/engine/anim';
import {
  Anchor,
  Bilayer,
  Bond,
  EdgeTag,
  foldedPositions,
  LumenTint,
  MembraneProtein,
  MRNA,
  PALETTE,
  Polyline,
  Polypeptide,
  Ribosome,
  RIBOSOME,
  SRP,
  SRP_SITES,
  SRPReceptor,
  RECEPTOR_SITE,
  Translocon,
  useDisposable,
  useKitHighlight,
  useStageCamera,
  type CamKey,
} from '@/three/kit';

/** Step starts (the content's `at`s must match). */
export const P = [0, 0.14, 0.28, 0.43, 0.57, 0.71, 0.86] as const;

const STOP_COL = '#ff7849';
const TM_COL = '#ffb347';
const PLOT_COL = '#9fd0ff';

// ——— timing (stage time) ———
const T = {
  strip: [0.005, 0.03],
  stripOut: [0.125, 0.155],
  travel: [0.148, 0.19],
  settle: [0.19, 0.205],
  open: [0.19, 0.2],
  release: [0.192, 0.215],
  insert: [0.19, 0.205],
  resume: [0.205, 0.245],
  approach: [0.232, 0.248],
  cut: [0.248, 0.262],
  sigAway: [0.26, 0.278],
  sigFade: [0.292, 0.33],
  stopIn: [0.285, 0.36],
  coil: [0.362, 0.398],
  bind: [0.37, 0.425],
  lateral: [0.448, 0.505],
  shut: [0.497, 0.522],
  tail: [0.522, 0.56],
  finish: [0.575, 0.6],
  detach: [0.6, 0.668],
  close: [0.6, 0.628],
  foldL: [0.602, 0.68],
  foldC: [0.618, 0.692],
  multi: [0.728, 0.845],
  plot: [0.87, 0.93],
  peaks: [0.925, 0.962],
} as const;

const S = 1.15; // ribosome size
const SP = 0.2; // residue spacing
// single-pass chain: signal peptide | lumenal domain | stop-transfer | cytosolic domain
const NSIG = 10;
const L0 = 10; // first lumenal residue
const ST0 = 28; // first stop-transfer residue
const C0 = 38; // first cytosolic residue
const N = 52;
const LAT: V3 = [1.38, 0, 0.55]; // final place of the stop helix in the bilayer

// ——— poses ———
const RIB_FREE = { pos: [-4.6, 4.9, 1.1] as V3, rot: [0.1, 0.5, 0.3] as V3 };
const RIB_DOCK = { pos: [0, 2.04, 0] as V3, rot: [0, 0, 0] as V3 };
const RIB_AWAY = { pos: [-1.4, 6.2, -2.2] as V3, rot: [-0.15, 0.45, 0.3] as V3 };
const EXIT_L = new Vector3(0, RIBOSOME.exit[1] * S, 0);

/** Chain path while the ribosome is free (ribosome frame). */
const HOOK = new CatmullRomCurve3(
  [
    [0, 0, 0],
    [0, -0.3, 0],
    [-0.25, -0.52, 0.12],
    [-0.7, -0.64, 0.25],
    [-1.25, -0.68, 0.35],
    [-1.85, -0.64, 0.42],
    [-2.45, -0.56, 0.47],
    [-3.1, -0.46, 0.5],
  ].map((p) => new Vector3(p[0], p[1], p[2]).add(EXIT_L)),
  false,
  'centripetal',
);
const HOOK_LEN = HOOK.getLength();

/** SRP bound pose in the ribosome frame (same construction as t7-signal). */
const SRP_BOUND = (() => {
  const grip = HOOK.getPointAt(Math.min(1, 1.75 / HOOK_LEN)).add(new Vector3(0, 0.05, 0));
  const alu = new Vector3(-0.35, 0.38, 1.45);
  const gL = new Vector3(...SRP_SITES.grip);
  const aL = new Vector3(...SRP_SITES.alu);
  const basis = (a: Vector3, b: Vector3, down: Vector3) => {
    const x = b.clone().sub(a).normalize();
    const up = down.clone().negate();
    const y = up.sub(x.clone().multiplyScalar(up.dot(x))).normalize();
    const z = new Vector3().crossVectors(x, y);
    return new Matrix4().makeBasis(x, y, z);
  };
  const mSrc = basis(gL, aL, new Vector3(0, -1, 0));
  const mDst = basis(grip, alu, new Vector3(0.2, -1, -0.3).normalize());
  const rot = new Matrix4().multiplyMatrices(mDst, mSrc.clone().invert());
  const q = new Quaternion().setFromRotationMatrix(rot);
  const pos = grip.clone().sub(gL.clone().applyQuaternion(q));
  const ng = new Vector3(0.15, -0.15, 0).applyQuaternion(q).add(pos);
  return { pos, q, ng };
})();

const PRE_Y = 2.75;
const RIB_PRE = { pos: [0, PRE_Y, 0] as V3, rot: [0, 0, 0] as V3 };
const SR = (() => {
  const ngWorld = SRP_BOUND.ng.clone().add(new Vector3(0, PRE_Y, 0));
  const sy = (ngWorld.y - 0.32) / RECEPTOR_SITE[1];
  return { pos: [ngWorld.x - RECEPTOR_SITE[0], 0, Math.min(0.5, ngWorld.z - RECEPTOR_SITE[2])] as V3, sy };
})();
const PEPTIDASE_POS: V3 = [1.2, 0, -1.05];

// ——— hairpin geometry (ribosome docked) ———
const E_DOCK = new Vector3(0, RIB_DOCK.pos[1], 0).add(EXIT_L);
const PB = new Vector3(0, -0.82, 0);
const GATE_X = 0.6;
const G = new Vector3(GATE_X, -0.72, 0);
const G_FREE = new Vector3(0.05, -1.75, 0.75);
const HELIX_LEN = (NSIG - 1) * SP;
const SIG_AWAY = new Vector3(0.2, 0.04, 0.16);
const PORE = [E_DOCK.clone(), new Vector3(0, 0.55, 0), new Vector3(0, -0.2, 0), PB.clone()];
const PORE_LEN = PORE.reduce((a, p, i) => (i ? a + p.distanceTo(PORE[i - 1]) : 0), 0);
const G_END = new Vector3(GATE_X - 0.1, G.y - 0.17, 0.02);

const LUM_BULGE = new Vector3(-0.35, -1, 0.5);
const CYT_BULGE = new Vector3(0.35, 0.25, 1);
const _v = new Vector3();
const _w = new Vector3();
/** Arc from A to B bulging along `dir` by D (Signal's hanging loop, generalised). */
function pushArc(pl: Polyline, A: Vector3, B: Vector3, D: number, dir: Vector3, samples = 28) {
  const m = Math.min(1, D);
  for (let i = 1; i <= samples; i++) {
    const u = i / samples;
    const s = Math.sin(Math.PI * u);
    _v.lerpVectors(A, B, u);
    pl.push(_v.x + dir.x * D * s + 0.16 * Math.sin(3 * Math.PI * u) * s * m, _v.y + dir.y * D * s, _v.z + dir.z * D * s + 0.18 * Math.sin(2 * Math.PI * u) * m);
  }
}
const scratchPl = new Polyline(64);
function arcLength(A: Vector3, B: Vector3, D: number, dir: Vector3) {
  scratchPl.clear().pushV(A);
  pushArc(scratchPl, A, B, D, dir);
  return scratchPl.length;
}
function solveDepth(A: Vector3, B: Vector3, dir: Vector3, want: number) {
  let D = 0.25;
  for (let k = 0; k < 7; k++) D = Math.max(0.05, D + (want - arcLength(A, B, D, dir)) / 2.2);
  return D;
}
const LOOP0 = arcLength(PB, G, 0.22, LUM_BULGE);

/** Signal-peptide helix in the lateral gate (j = 0 N-terminus at the cytosolic face). */
function helixPoint(j: number, shift: Vector3, out: Vector3) {
  const k = j / (NSIG - 1);
  const ang = j * 1.75;
  return out.set(GATE_X + shift.x + Math.cos(ang) * 0.11, lerp(0.5, G.y, k) + shift.y, shift.z + Math.sin(ang) * 0.11);
}
/** Stop-transfer helix (j = 0 at the lumen face, 9 at the cytosolic face) centred on (cx, cz). */
function stopPoint(j: number, cx: number, cz: number, out: Vector3) {
  const ang = j * 1.75 + 0.6;
  return out.set(cx + Math.cos(ang) * 0.11, lerp(-0.62, 0.62, j / 9), cz + Math.sin(ang) * 0.11);
}

function madeAt(t: number) {
  return (
    13 +
    (22 - 13) * seg(t, T.resume[0], T.resume[1]) +
    (38 - 22) * seg(t, T.stopIn[0], T.stopIn[1]) +
    (45 - 38) * seg(t, T.lateral[0], T.lateral[1]) +
    (48 - 45) * seg(t, T.tail[0], T.tail[1]) +
    (N - 48) * seg(t, T.finish[0], T.finish[1])
  );
}

const ribObj = new Object3D();
function ribosomePose(t: number) {
  const a = easeInOut(seg(t, T.travel[0], T.travel[1]));
  const b = easeInOut(seg(t, T.settle[0], T.settle[1]));
  const c = easeInOut(seg(t, T.detach[0], T.detach[1]));
  const pos: V3 = [0, 0, 0];
  const rot: V3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let p = lerp(RIB_FREE.pos[i], RIB_PRE.pos[i], a);
    p = lerp(p, RIB_DOCK.pos[i], b);
    p = lerp(p, RIB_AWAY.pos[i], c);
    if (i === 1) p += Math.sin(Math.PI * a) * 0.5;
    pos[i] = p;
    rot[i] = lerp(lerp(RIB_FREE.rot[i], RIB_PRE.rot[i], a), RIB_AWAY.rot[i], c);
  }
  const sway = 1 - a;
  pos[1] += Math.sin(t * 60) * 0.04 * sway;
  rot[2] += Math.sin(t * 45) * 0.02 * sway;
  return { pos, rot };
}

const ZERO = new Vector3();
const _t = new Vector3();
const _h = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const plA = new Polyline(96);
const plB = new Polyline(64);
const plC = new Polyline(64);

/** All bead positions of the single-pass chain at time t (unfolded; folding is applied by Polypeptide). */
function chainAt(t: number, rib: { pos: V3; rot: V3 }, beads: Vector3[]) {
  const made = madeAt(t);
  ribObj.position.set(...rib.pos);
  ribObj.rotation.set(...rib.rot);
  ribObj.updateMatrix();
  const insertK = easeInOut(seg(t, T.insert[0], T.insert[1]));
  const away = smooth(seg(t, T.sigAway[0], T.sigAway[1]));
  const coilK = smooth(seg(t, T.coil[0], T.coil[1]));
  const latK = smooth(clamp((made - 38) / 7));
  const mT = Math.min(made, C0); // residues that went into the channel

  // A) hairpin: pore + loop (as in t7-signal), driven by mT
  let mainLen = 0;
  if (insertK > 0) {
    const end = _w.lerpVectors(G_END, G_FREE, away);
    const want = Math.max(LOOP0, mT * SP - PORE_LEN - HELIX_LEN - SP);
    const D = solveDepth(PB, end, LUM_BULGE, want);
    plA.clear();
    PORE.forEach((p) => plA.pushV(p));
    pushArc(plA, PB, end, D, LUM_BULGE);
    mainLen = plA.length;
  }
  // B) stop helix (in the pore, then sliding into the bilayer) + lumenal loop hanging from its lumen end
  const cx = LAT[0] * latK;
  const cz = LAT[2] * latK;
  if (coilK > 0) {
    stopPoint(0, cx, cz, _a);
    const D = solveDepth(_a, G_FREE, LUM_BULGE, (ST0 - L0) * SP);
    plB.clear().pushV(_a);
    pushArc(plB, _a, G_FREE, D, LUM_BULGE);
  }
  // C) cytosolic part: between the exit tunnel and the top of the stop helix
  if (made > C0) {
    stopPoint(9, cx, cz, _b);
    const chord = _b.distanceTo(E_DOCK);
    const D = solveDepth(E_DOCK, _b, CYT_BULGE, Math.max(chord * 1.02, (made - (C0 - 1)) * SP));
    plC.clear().pushV(E_DOCK);
    pushArc(plC, E_DOCK, _b, D, CYT_BULGE);
  }

  const shift = _v.copy(SIG_AWAY).multiplyScalar(away);
  for (let i = 0; i < N; i++) {
    const b = beads[i];
    if (i >= C0) {
      if (made > C0) plC.at(Math.min(Math.max(0, made - i) * SP, plC.length), b);
      else b.copy(E_DOCK);
      continue;
    }
    const s = Math.max(0, mT - i) * SP;
    if (insertK < 1) {
      HOOK.getPointAt(Math.min(1, s / HOOK_LEN), b);
      if (s > HOOK_LEN) b.x -= s - HOOK_LEN;
      b.applyMatrix4(ribObj.matrix);
    }
    if (insertK > 0) {
      const sh = i < NSIG ? shift : ZERO;
      if (s <= mainLen || i >= NSIG) plA.at(Math.min(s, mainLen), _t);
      else {
        const over = s - mainLen;
        const j = clamp(NSIG - over / SP, 0, NSIG - 1);
        helixPoint(j, sh, _t);
        if (over < SP) {
          plA.at(mainLen, _h);
          _t.lerp(_h, 1 - over / SP);
        }
      }
      if (insertK < 1) b.lerp(_t, insertK);
      else b.copy(_t);
    }
    if (coilK > 0 && i >= L0) {
      if (i >= ST0) stopPoint(i - ST0, cx, cz, _t);
      else plB.at(Math.min((ST0 - i) * SP, plB.length), _t);
      b.lerp(_t, coilK);
    }
  }
  return made;
}

// ——— multipass protein (x ≈ −6): Nt | H1 start | loop | H2 stop | loop | H3 start | loop | H4 stop | Ct ———
const MP_N = 76;
const MP_DX = 0.07;
const MP_X0 = -8.66;
const MP_Z = 0.58;
const MP_HC = [10.5, 28.5, 46.5, 64.5]; // helix centre residues
const MP_SEGS: { r: [number, number]; kind: 'loop' | 'start' | 'stop' }[] = [
  { r: [0, 6], kind: 'loop' },
  { r: [6, 16], kind: 'start' },
  { r: [16, 24], kind: 'loop' },
  { r: [24, 34], kind: 'stop' },
  { r: [34, 42], kind: 'loop' },
  { r: [42, 52], kind: 'start' },
  { r: [52, 60], kind: 'loop' },
  { r: [60, 70], kind: 'stop' },
  { r: [70, 76], kind: 'loop' },
];
const mpX = (c: number) => MP_X0 + c * MP_DX;
const MP_POS: Vector3[] = (() => {
  const out: Vector3[] = Array.from({ length: MP_N }, () => new Vector3());
  // helices: H1/H3 go down (cytosol → lumen), H2/H4 go up
  MP_HC.forEach((c, k) => {
    const s0 = 6 + 18 * k;
    for (let j = 0; j < 10; j++) {
      const down = k % 2 === 0;
      const y = down ? lerp(0.62, -0.62, j / 9) : lerp(-0.62, 0.62, j / 9);
      const ang = j * 1.75 + k;
      out[s0 + j].set(mpX(c) + Math.cos(ang) * 0.11, y, MP_Z + Math.sin(ang) * 0.11);
    }
  });
  // loops between helices: arcs bulging into the lumen (after a "down" helix) or the cytosol
  for (let k = 0; k < 3; k++) {
    const a = out[6 + 18 * k + 9];
    const b = out[6 + 18 * (k + 1)];
    const sgn = k % 2 === 0 ? -1 : 1;
    for (let m = 1; m <= 8; m++) {
      const u = m / 9;
      const s = Math.sin(Math.PI * u);
      out[6 + 18 * k + 9 + m].lerpVectors(a, b, u).add(new Vector3(0, sgn * 0.62 * s, 0.32 * s));
    }
  }
  // tails in the cytosol
  for (let d = 1; d <= 6; d++) {
    out[6 - d].copy(out[6]).add(new Vector3(-0.1 * d, 0.17 * d, 0.06 * d + 0.08 * Math.sin(d * 1.3)));
    out[69 + d].copy(out[69]).add(new Vector3(0.1 * d, 0.17 * d, 0.05 * d + 0.08 * Math.sin(d * 1.1)));
  }
  return out;
})();

// ——— hydropathy plot ———
const PLOT_POS: V3 = [MP_X0, 2.75, -0.35];
const PLOT_W = MP_N * MP_DX;
const PLOT_AMP = 0.78;
const PLOT_THR = 0.55;
const hyd = (i: number) => -0.45 + 1.55 * MP_HC.reduce((a, c) => a + 1 / (1 + ((i - c) / 5.4) ** 8), 0) + 0.12 * Math.sin(i * 1.3) + 0.07 * Math.sin(i * 0.47 + 1);
const PLOT_SAMPLES = 240;

function HydropathyPlot({ draw, peaks, opacity }: { draw: number; peaks: number; opacity: number }) {
  const geos = useDisposable(() => {
    const pts: Vector3[] = [];
    for (let k = 0; k <= PLOT_SAMPLES; k++) {
      const i = (k / PLOT_SAMPLES) * (MP_N - 1);
      pts.push(new Vector3(i * MP_DX, hyd(i) * PLOT_AMP, 0));
    }
    const curve = new TubeGeometry(new CatmullRomCurve3(pts), PLOT_SAMPLES, 0.035, 6, false);
    // filled areas above the hydrophobicity threshold (one per peak)
    const areas = MP_HC.map((c) => {
      const sh = new Shape();
      const thr = PLOT_THR * PLOT_AMP;
      let started = false;
      let last = 0;
      for (let k = 0; k <= 80; k++) {
        const i = c - 9 + (k / 80) * 18;
        const y = hyd(i) * PLOT_AMP;
        if (y < thr) continue;
        if (!started) {
          sh.moveTo(i * MP_DX, thr);
          started = true;
        }
        sh.lineTo(i * MP_DX, y);
        last = i;
      }
      sh.lineTo(last * MP_DX, thr);
      return new ShapeGeometry(sh);
    });
    return [curve, ...areas];
  }, []);
  const mats = useDisposable(() => {
    const line = new MeshStandardMaterial({ color: PLOT_COL, emissive: PLOT_COL, emissiveIntensity: 0.35, roughness: 0.5, transparent: true });
    const axis = new MeshStandardMaterial({ color: '#c9d6e8', roughness: 0.6, transparent: true });
    const panel = new MeshStandardMaterial({ color: '#0e1a2b', roughness: 0.9, transparent: true, opacity: 0.55, depthWrite: false, side: DoubleSide });
    const area = new MeshStandardMaterial({ color: TM_COL, emissive: TM_COL, emissiveIntensity: 0.3, transparent: true, depthWrite: false, side: DoubleSide });
    return [line, axis, panel, area];
  }, []);
  const lineMats = useMemo(() => [mats[0], mats[1]], [mats]);
  const panelMats = useMemo(() => [mats[2]], [mats]);
  const areaMats = useMemo(() => [mats[3]], [mats]);
  useKitHighlight(lineMats, 'hydropathy-plot', { opacity });
  useKitHighlight(panelMats, 'hydropathy-plot', { opacity: opacity * 0.55 });
  useKitHighlight(areaMats, 'tm-helix', { opacity: opacity * 0.75 * peaks });
  useLayoutEffect(() => {
    const tube = geos[0];
    const idx = tube.index ? tube.index.count : 0;
    tube.setDrawRange(0, Math.floor((idx / PLOT_SAMPLES / 6) * Math.round(draw * PLOT_SAMPLES)) * 6);
  });
  const thr = PLOT_THR * PLOT_AMP;
  const dashes = useMemo(() => Array.from({ length: 22 }, (_, k) => (k + 0.25) * (PLOT_W / 22)), []);
  if (opacity <= 0.002) return null;
  return (
    <group position={PLOT_POS}>
      {/* backing panel */}
      <mesh position={[PLOT_W / 2, 0.25, -0.06]} material={mats[2]}>
        <planeGeometry args={[PLOT_W + 0.7, 2.25]} />
      </mesh>
      {/* axes: zero line (hydrophobic above, hydrophilic below) and the y axis */}
      <mesh position={[PLOT_W / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={mats[1]}>
        <cylinderGeometry args={[0.012, 0.012, PLOT_W + 0.2, 6]} />
      </mesh>
      <mesh position={[-0.1, 0.25, 0]} material={mats[1]}>
        <cylinderGeometry args={[0.012, 0.012, 1.9, 6]} />
      </mesh>
      {/* threshold (dashed) */}
      {dashes.map((x, k) => (
        <mesh key={k} position={[x, thr, 0]} rotation={[0, 0, Math.PI / 2]} material={mats[1]}>
          <cylinderGeometry args={[0.008, 0.008, PLOT_W / 22 / 2, 4]} />
        </mesh>
      ))}
      {geos.slice(1).map((g, k) => (
        <mesh key={k} geometry={g} material={mats[3]} position={[0, 0, -0.01]} />
      ))}
      <mesh geometry={geos[0]} material={mats[0]} />
    </group>
  );
}

// ——— camera ———
const CAM: CamKey[] = [
  { at: 0, pos: [0.6, 4.6, 14.2], target: [-0.6, 2.2, 0.6], fov: 40 },
  { at: 0.12, pos: [0.4, 4.4, 13.6], target: [-0.7, 2.1, 0.6], fov: 40 },
  { at: 0.165, pos: [2.4, 3.8, 10.8], target: [-0.9, 1.7, 0.4], fov: 38 },
  { at: 0.215, pos: [3.0, 2.1, 8.6], target: [0.0, 0.4, 0.2], fov: 38 },
  { at: 0.25, pos: [3.6, -0.4, 7.4], target: [0.4, -0.75, 0.2], fov: 38 },
  { at: 0.278, pos: [3.5, -0.3, 7.5], target: [0.4, -0.7, 0.2], fov: 38 },
  { at: 0.31, pos: [3.4, 1.3, 9.6], target: [0.1, -0.4, 0.2], fov: 40 },
  { at: 0.425, pos: [3.2, 1.1, 9.2], target: [0.1, -0.35, 0.2], fov: 40 },
  { at: 0.46, pos: [4.4, 1.2, 8.8], target: [0.6, -0.2, 0.35], fov: 40 },
  { at: 0.565, pos: [4.6, 1.4, 9.2], target: [0.7, -0.1, 0.35], fov: 40 },
  { at: 0.61, pos: [4.4, 2.0, 10.6], target: [0.6, 0.2, 0.3], fov: 40 },
  { at: 0.7, pos: [4.0, 0.8, 8.4], target: [1.0, -0.2, 0.5], fov: 40 },
  { at: 0.755, pos: [-3.4, 1.4, 10.2], target: [-6.0, -0.1, 0.1], fov: 40 },
  { at: 0.855, pos: [-3.6, 1.1, 9.8], target: [-6.0, -0.1, 0.1], fov: 40 },
  { at: 0.9, pos: [-4.0, 2.4, 12.0], target: [-6.0, 1.5, -0.1], fov: 40 },
  { at: 1, pos: [-4.3, 2.6, 12.4], target: [-6.0, 1.6, -0.1], fov: 40 },
];

const BG = [
  { pos: [4.6, 0, -4.8] as V3, made: 24, seed: 7 },
  { pos: [1.4, 0, -7.4] as V3, made: 34, seed: 11 },
];
const BG_PATH: V3[] = [
  [0, E_DOCK.y, 0],
  [0, -0.8, 0],
  [0.3, -1.6, 0.3],
  [-0.2, -2.6, 0.6],
  [0.4, -3.6, 0.2],
  [-0.3, -4.8, 0.5],
  [0.2, -6, 0.2],
];
const MRNA_PTS: V3[] = [
  [-5.4, 1.2, 1.5],
  [-3.6, 0.62, 0.95],
  [-1.7, 0.43, 0.32],
  [0, RIBOSOME.mrnaY * S, 0],
  [1.7, 0.46, -0.28],
  [3.4, 0.82, -0.8],
  [5.2, 1.4, -1.1],
];

// sequence strip of step 0 (same domain colours as the real chain)
// (the path runs from the C-terminal end, so the N-terminus ends up on the left)
const STRIP: V3[] = Array.from({ length: 7 }, (_, k) => [5.3 - k * 1.75, 3.2 + 0.14 * Math.sin(k * 1.4), 2.5 - 0.1 * Math.cos(k)] as V3);
const STRIP_SP = 0.196;
const STRIP_CURVE = new CatmullRomCurve3(STRIP.map((p) => new Vector3(...p)));
const STRIP_LEN = STRIP_CURVE.getLength();
/** Where residue i of the strip sits. */
const stripPt = (i: number) => STRIP_CURVE.getPointAt(clamp(((N - i) * STRIP_SP) / STRIP_LEN));
const STRIP_DOMAINS = [
  { r: [0, NSIG] as [number, number], id: 'signal-peptide', color: PALETTE.signalPeptide, rad: 0.135 },
  { r: [L0, ST0] as [number, number], id: 'polypeptide', color: PALETTE.polypeptide, rad: 0.1 },
  { r: [ST0, C0] as [number, number], id: 'stop-transfer', color: STOP_COL, rad: 0.135 },
  { r: [C0, N] as [number, number], id: 'polypeptide', color: PALETTE.polypeptide, rad: 0.1 },
];

const FOLD_L: V3 = [1.15, -1.3, 0.8];
const FOLD_C: V3 = [1.6, 1.2, 0.85];
const FOLD_L_POS = foldedPositions(ST0 - L0, SP * 0.95, 21);
const FOLD_C_POS = foldedPositions(N - C0, SP * 0.95, 23);
const _f = new Vector3();
/** Same blend Polypeptide applies when `folded` is set (for bonds and labels). */
function foldedBead(p: Vector3, local: Vector3, center: V3, k: number, out: Vector3) {
  return out.copy(p).lerp(_f.copy(local).add(new Vector3(...center)), smooth(clamp(k)));
}

export default function TransmembraneScene({ t }: SceneProps) {
  useStageCamera(CAM);

  const beads = useMemo(() => Array.from({ length: N }, () => new Vector3()), []);
  const rib = ribosomePose(t);
  const made = chainAt(t, rib, beads);

  // SRP rides with the free ribosome and leaves after docking
  const srpOut = seg(t, T.release[0], T.release[1]);
  const srpOpacity = 1 - vis(t, T.release[1] - 0.012, 2, 0.012);
  const srpPos: V3 = [SRP_BOUND.pos.x - srpOut * 1.6, SRP_BOUND.pos.y + srpOut * 2.4, SRP_BOUND.pos.z + srpOut * 1.2];
  const srpRot = _q2.copy(SRP_BOUND.q).multiply(_q.setFromAxisAngle(_axis, -srpOut * 0.8)).toArray() as [number, number, number, number];

  const shutK = seg(t, T.shut[0], T.shut[1]);
  const open = seg(t, T.open[0], T.open[1]) * (1 - 0.75 * shutK) * (1 - seg(t, T.close[0], T.close[1]));
  const cutFlash = vis(t, T.cut[0], T.cut[1], 0.012);
  const peptidaseLean = seg(t, T.approach[0], T.approach[1]) * (1 - seg(t, T.sigAway[1], T.sigAway[1] + 0.03));
  const away = seg(t, T.sigAway[0], T.sigAway[1]);
  const sigOpacity = 1 - seg(t, T.sigFade[0], T.sigFade[1]);
  const bindGlow = vis(t, T.bind[0], T.bind[1], 0.015) * 0.7;
  const foldL = seg(t, T.foldL[0], T.foldL[1]);
  const foldC = seg(t, T.foldC[0], T.foldC[1]);
  const stripOp = vis(t, T.strip[0], T.stripOut[1], 0.025);
  const mpMade = MP_N * seg(t, T.multi[0], T.multi[1]) + (t > T.multi[1] ? 1 : 0);
  const mpOp = vis(t, T.multi[0] - 0.012, 2, 0.012);
  const plotDraw = seg(t, T.plot[0], T.plot[1]);
  const plotOp = vis(t, T.plot[0] - 0.012, 2, 0.012);
  const peaks = seg(t, T.peaks[0], T.peaks[1]);

  const bead = (i: number) => beads[i];
  const layoutFrom = (off: number) => (i: number, _m: number, out: Vector3) => {
    out.copy(beads[off + i]);
    return true;
  };
  const layouts = useMemo(() => ({ sig: layoutFrom(0), lum: layoutFrom(L0), stop: layoutFrom(ST0), cyt: layoutFrom(C0) }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const mpLayout = useMemo(() => MP_SEGS.map((sg) => (i: number, _m: number, out: Vector3) => (out.copy(MP_POS[sg.r[0] + i]), true)), []);

  // bond ends follow the folding globules
  const lumEnd = foldedBead(bead(ST0 - 1), FOLD_L_POS[ST0 - 1 - L0], FOLD_L, foldL, new Vector3());
  const cytStart = foldedBead(bead(C0), FOLD_C_POS[0], FOLD_C, foldC, new Vector3());

  // label anchors (they glide between the sequence strip and the real chain)
  const toChain = smooth(seg(t, 0.13, 0.16));
  const stopStrip = stripPt(33);
  const stopChain = bead(33);
  const stopAnchor = _s1.lerpVectors(stopStrip, stopChain, smooth(seg(t, 0.13, 0.3))).toArray() as V3;
  const tmSingle = new Vector3(LAT[0] + 0.05, 0.1, LAT[2] + 0.12);
  const tmMulti = new Vector3(mpX(MP_HC[1]), 0.05, MP_Z + 0.15);
  const tmAnchor = (t < 0.3 ? stopStrip.clone() : t < 0.72 ? tmSingle : tmMulti).toArray() as V3;
  const tmShow = t < 0.13 ? 1 : t < 0.3 ? 0 : t < 0.43 ? 0 : t < 0.71 ? clamp((t - 0.44) / 0.02) : clamp((t - 0.73) / 0.02);
  const lumAnchor = foldL > 0.6 ? FOLD_L : (bead(Math.max(L0, Math.min(ST0 - 1, Math.floor(L0 + (Math.min(made, ST0) - L0) * 0.5)))).toArray() as V3);
  const polyStrip = stripPt(19).toArray() as V3;
  const polyAnchor = t < 0.15 ? polyStrip : t < 0.71 ? lumAnchor : ([mpX(37.5), 1.25, MP_Z + 0.3] as V3);

  return (
    <group>
      <EdgeTag side="top" text="CYTOSOL" />
      <EdgeTag side="bottom" text="ER LUMEN" />

      <Bilayer
        id="er-membrane"
        width={30}
        depth={10}
        position={[-1, 0, -4.2]}
        holes={[
          { x: 1, z: 4.2, r: 0.95 },
          { x: 1 + 0.9, z: 4.2 + 0.32, r: 0.32 },
          { x: 1 + LAT[0], z: 4.2 + LAT[2], r: 0.3 },
          { x: 1 + SR.pos[0], z: SR.pos[2] + 4.2, r: 0.26 },
          { x: 1 + PEPTIDASE_POS[0], z: PEPTIDASE_POS[2] + 4.2, r: 0.3 },
          ...MP_HC.map((c) => ({ x: 1 + mpX(c), z: 4.2 + MP_Z, r: 0.34 })),
          ...BG.map((b) => ({ x: 1 + b.pos[0], z: b.pos[2] + 4.2, r: 0.95 })),
        ]}
        seed={9}
      />
      <LumenTint id="er-lumen" box={[-30, 30, -0.68, -26, -30, 30]} color={PALETTE.erLumen} strength={0.16} />
      <Anchor id="er-membrane" position={t < 0.71 ? [-3.4, 0.55, 0.45] : [-2.6, 0.55, 0.6]} />
      <Anchor id="er-lumen" position={t < 0.71 ? [-2.6, -2.4, 0.6] : [-6.0, -2.2, 0.4]} />
      <Anchor id="cytosol" position={t < 0.71 ? [-6.4, 2.2, -0.5] : [-8.6, 1.6, -0.6]} />

      <Translocon id="translocon" open={open} glow={bindGlow} />
      <Anchor id="translocon" position={[-0.5, 0.05, 0.45]} />

      <group position={SR.pos}>
        <group scale={[1, SR.sy, 1]}>
          <SRPReceptor />
        </group>
      </group>

      <group position={PEPTIDASE_POS} rotation={[0.42 * peptidaseLean, -0.5, -0.32 * peptidaseLean]}>
        <MembraneProtein id="signal-peptidase" color={PALETTE.signalPeptidase} side="lumen" glow={cutFlash * 0.9} />
        <Anchor id="signal-peptidase" position={[0.1, -0.95, 0.05]} />
      </group>

      {/* ribosome + mRNA (+ SRP while bound) */}
      <group position={rib.pos} rotation={rib.rot}>
        <Ribosome id="ribosome" size={S} />
        <MRNA id="mrna" points={MRNA_PTS} shift={made * 3} />
        <Anchor id="ribosome" position={[-0.45, -0.3, 0.9]} />
        {srpOpacity > 0.002 && (
          <group position={srpPos} quaternion={srpRot}>
            <SRP id="srp" opacity={srpOpacity} />
            <Anchor id="srp" position={[0.2, 0.06, 0]} show={srpOpacity} />
          </group>
        )}
      </group>

      {/* step 0: the sequence of the protein, hydrophobic blocks thicker */}
      {stripOp > 0.002 &&
        STRIP_DOMAINS.map((d, k) => (
          <Polypeptide
            key={k}
            id={d.id === 'stop-transfer' ? ['stop-transfer', 'tm-helix'] : d.id}
            count={N}
            made={N}
            spacing={STRIP_SP}
            radius={d.rad}
            color={d.color}
            range={d.r}
            points={STRIP}
            opacity={stripOp}
          />
        ))}

      {/* the single-pass chain */}
      <Polypeptide id="signal-peptide" count={NSIG} made={made} spacing={SP} color={PALETTE.signalPeptide} layout={layouts.sig} opacity={sigOpacity} />
      <Polypeptide id="polypeptide" count={ST0 - L0} made={made - L0} spacing={SP} layout={layouts.lum} folded={foldL} foldCenter={FOLD_L} seed={21} />
      <Polypeptide id={['stop-transfer', 'tm-helix']} count={C0 - ST0} made={made - ST0} spacing={SP} radius={0.12} color={STOP_COL} layout={layouts.stop} glow={bindGlow} />
      <Polypeptide id="polypeptide" count={N - C0} made={made - C0} spacing={SP} layout={layouts.cyt} folded={foldC} foldCenter={FOLD_C} seed={23} />
      <Bond a={bead(NSIG - 1)} b={bead(NSIG)} radius={0.046} color={PALETTE.polypeptide} id="polypeptide" show={made > NSIG + 0.4 && cutFlash < 0.5 && away === 0 ? 1 : 0} />
      <Bond a={lumEnd} b={bead(ST0)} radius={0.046} color={PALETTE.polypeptide} id="polypeptide" show={made > ST0 + 0.4 ? 1 : 0} />
      <Bond a={bead(C0 - 1)} b={cytStart} radius={0.046} color={PALETTE.polypeptide} id="polypeptide" show={made > C0 + 0.4 ? 1 : 0} />

      <Anchor id="signal-peptide" position={(t < 0.15 ? stripPt(4) : bead(4)).toArray() as V3} show={t < 0.15 ? stripOp : sigOpacity} />
      <Anchor id="stop-transfer" position={stopAnchor} show={t < 0.14 ? stripOp : clamp(made - (ST0 + 3))} />
      <Anchor id="tm-helix" position={tmAnchor} show={tmShow} />
      <Anchor id="polypeptide" position={polyAnchor} show={t < 0.15 ? stripOp * (1 - toChain) + toChain : 1} />

      {cutFlash > 0.01 && (
        <mesh position={[G.x + away * 0.2, G.y, G.z]} scale={0.18 + 0.22 * cutFlash}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshBasicMaterial color="#fff3c4" transparent opacity={0.55 * cutFlash} depthWrite={false} toneMapped={false} />
        </mesh>
      )}

      {/* multipass protein */}
      {mpOp > 0.002 &&
        MP_SEGS.map((sg, k) => (
          <Polypeptide
            key={k}
            id={sg.kind === 'loop' ? 'polypeptide' : sg.kind === 'stop' ? ['stop-transfer', 'tm-helix'] : 'tm-helix'}
            count={sg.r[1] - sg.r[0]}
            made={mpMade - sg.r[0]}
            spacing={SP}
            radius={sg.kind === 'loop' ? 0.11 : 0.12}
            color={sg.kind === 'start' ? PALETTE.signalPeptide : sg.kind === 'stop' ? STOP_COL : PALETTE.polypeptide}
            layout={mpLayout[k]}
            opacity={mpOp}
            seed={30 + k}
          />
        ))}
      {mpOp > 0.002 &&
        MP_SEGS.slice(1).map((sg, k) => (
          <Bond key={k} a={MP_POS[sg.r[0] - 1]} b={MP_POS[sg.r[0]]} radius={0.046} color={PALETTE.polypeptide} id="polypeptide" show={mpMade > sg.r[0] + 0.4 ? mpOp : 0} />
        ))}

      <HydropathyPlot draw={plotDraw} peaks={peaks} opacity={plotOp} />
      <Anchor id="hydropathy-plot" position={[PLOT_POS[0] + 0.55, PLOT_POS[1] - 0.45, PLOT_POS[2] + 0.05]} show={plotOp} />

      {BG.map((b, k) => (
        <group key={k} position={b.pos}>
          <Translocon open={1} />
          <group position={[0, RIB_DOCK.pos[1], 0]} rotation={[0, b.seed, 0]}>
            <Ribosome size={S} />
            <MRNA points={MRNA_PTS} shift={t * 90 + b.seed * 7} />
          </group>
          <Polypeptide count={b.made} made={b.made} spacing={SP} points={BG_PATH} seed={b.seed} />
        </group>
      ))}
    </group>
  );
}

const _q = new Quaternion();
const _q2 = new Quaternion();
const _axis = new Vector3(0.3, 1, 0.2).normalize();
const _s1 = new Vector3();
