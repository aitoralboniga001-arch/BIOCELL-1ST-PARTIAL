/**
 * t7-signal — The signal hypothesis (REFERENCE SCENE: the quality bar for every other scene).
 *
 * World: molecular close-up of a rough-ER membrane patch. Bilayer centre plane y = 0; CYTOSOL = +y,
 * ER LUMEN = −y. The translocon sits at the origin, its lateral gate facing +x; the SRP receptor is on the
 * −x side, the signal peptidase on the +x/back side. Units ≈ 5 nm.
 *
 * Choreography (every narrated verb takes ≥ 1.5 s at 1× for a ~60–90 s stage):
 *  0  translation starts on a free ribosome (mRNA bases slide through; the N-terminus peeks out)
 *  1  the yellow hydrophobic signal peptide (10 residues) emerges from the exit tunnel
 *  2  SRP flies in, grips the signal peptide and the ribosome; translation pauses (bases stop)
 *  3  the whole complex (ribosome + mRNA + chain + SRP) glides down to the SRP receptor
 *  4  translocon opens, SRP is released, the ribosome settles on the translocon, translation resumes and
 *     the chain threads into the lumen as a hairpin (signal peptide in the lateral gate, N-terminus facing
 *     the cytosol — as the notes say)
 *  5  signal peptidase cleaves at the lumen end of the signal peptide; the cleaved signal peptide stays
 *     bound to the translocon (it slides only slightly within the gate)
 *  6  translation ends; the soluble protein is released into the lumen and folds; ribosome detaches;
 *     translocon closes
 */
import { useMemo } from 'react';
import { CatmullRomCurve3, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { clamp, easeInOut, lerp, seg, smooth, vis, type V3 } from '@/engine/anim';
import {
  Anchor,
  Bilayer,
  EdgeTag,
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
  Bond,
  useStageCamera,
  type CamKey,
} from '@/three/kit';

/** Step starts (the content's `at`s must match). */
export const P = [0, 0.14, 0.28, 0.42, 0.56, 0.72, 0.86] as const;

// ——— timing (stage time) ———
const T = {
  start: [0.03, 0.13],
  emerge: [0.145, 0.265],
  srpIn: [0.29, 0.375],
  travel: [0.43, 0.545],
  open: [0.565, 0.605],
  release: [0.575, 0.645],
  settle: [0.58, 0.63],
  insert: [0.575, 0.63],
  resume: [0.615, 0.715],
  more: [0.725, 0.85],
  approach: [0.725, 0.765],
  cut: [0.765, 0.8],
  sigAway: [0.795, 0.855],
  finish: [0.862, 0.892],
  fold: [0.885, 0.965],
  detach: [0.905, 0.985],
  close: [0.93, 0.985],
} as const;
const S = 1.15; // ribosome size
const N = 44; // residues in the chain
const NSIG = 10; // signal peptide residues (8–10 hydrophobic aa in the notes)
const SP = 0.2; // residue spacing

// ——— poses ———
const RIB_FREE = { pos: [-4.6, 4.9, 1.1] as V3, rot: [0.1, 0.5, 0.3] as V3 };
const RIB_DOCK = { pos: [0, 2.04, 0] as V3, rot: [0, 0, 0] as V3 };
const RIB_AWAY = { pos: [1.6, 5.9, -1.8] as V3, rot: [-0.15, -0.45, -0.3] as V3 };
const EXIT_L = new Vector3(0, RIBOSOME.exit[1] * S, 0);

/** Chain path while the ribosome is free: hangs from the exit tunnel and curls towards −x (ribosome frame). */
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

/** SRP bound pose in the ribosome frame: grip on the signal peptide, Alu domain at the subunit interface. */
const SRP_BOUND = (() => {
  const grip = HOOK.getPointAt(Math.min(1, 1.75 / HOOK_LEN)).add(new Vector3(0, 0.05, 0));
  const alu = new Vector3(-0.35, 0.38, 1.45);
  const gL = new Vector3(...SRP_SITES.grip);
  const aL = new Vector3(...SRP_SITES.alu);
  // basis of the SRP's own frame and of the target, aligned on the grip→alu axis, "down" = groove side
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
  // where the receptor docks: the SRP's middle (S/NG region)
  const ng = new Vector3(0.15, -0.15, 0).applyQuaternion(q).add(pos);
  return { pos, q, ng };
})();

/** Pre-dock pose: the complex rests on the SRP receptor (chain clear of the membrane). */
const PRE_Y = 2.75;
const RIB_PRE = { pos: [0, PRE_Y, 0] as V3, rot: [0, 0, 0] as V3 };
/** SRP receptor placement + vertical stretch so its docking site meets the SRP's middle at PRE. */
const SR = (() => {
  const ngWorld = SRP_BOUND.ng.clone().add(new Vector3(0, PRE_Y, 0));
  const sy = (ngWorld.y - 0.32) / RECEPTOR_SITE[1];
  return { pos: [ngWorld.x - RECEPTOR_SITE[0], 0, Math.min(0.5, ngWorld.z - RECEPTOR_SITE[2])] as V3, sy };
})();

const PEPTIDASE_POS: V3 = [1.25, 0, -0.95];

// ——— hairpin geometry (ribosome docked) ———
const E_DOCK = new Vector3(0, RIB_DOCK.pos[1], 0).add(EXIT_L);
const PB = new Vector3(0, -0.82, 0); // pore bottom (lumen face)
const GATE_X = 0.6;
const G = new Vector3(GATE_X, -0.72, 0); // lumen end of the signal peptide (cleavage site)
const G_FREE = new Vector3(0.05, -1.75, 0.75); // where the new N-terminus drifts after cleavage
const HELIX_LEN = (NSIG - 1) * SP;
// after cleavage the signal peptide stays bound to the translocon (notes: affinity for hydrophobic peptides):
// it only slides a little out of the gate, still touching the channel
const SIG_AWAY = new Vector3(0.2, 0.04, 0.16);
const FOLD_C: V3 = [-0.55, -3.1, 0.9];

/** Arc-length of the pore segment E → PB. */
const PORE = [E_DOCK.clone(), new Vector3(0, 0.55, 0), new Vector3(0, -0.2, 0), PB.clone()];
const PORE_LEN = PORE.reduce((a, p, i) => (i ? a + p.distanceTo(PORE[i - 1]) : 0), 0);

const _v = new Vector3();
const _w = new Vector3();
/** Hanging loop from PB to `end` with depth D (writes into the polyline). */
function pushLoop(pl: Polyline, end: Vector3, D: number, samples = 28) {
  for (let i = 1; i <= samples; i++) {
    const u = i / samples;
    const s = Math.sin(Math.PI * u);
    _v.lerpVectors(PB, end, u);
    pl.push(_v.x - 0.35 * D * s + 0.16 * Math.sin(3 * Math.PI * u) * s * Math.min(1, D), _v.y - D * s, _v.z + 0.5 * D * s + 0.18 * Math.sin(2 * Math.PI * u) * Math.min(1, D));
  }
}
const scratchPl = new Polyline(64);
function loopLength(end: Vector3, D: number) {
  scratchPl.clear().pushV(PB);
  pushLoop(scratchPl, end, D);
  return scratchPl.length;
}
/** Depth that gives the loop the wanted arc length (a few secant steps). */
function solveDepth(end: Vector3, want: number) {
  let D = 0.25;
  for (let k = 0; k < 6; k++) {
    const L = loopLength(end, D);
    D = Math.max(0.12, D + (want - L) / 2.2);
  }
  return D;
}
const LOOP0 = loopLength(G, 0.22);

/** Signal-peptide helix in the lateral gate: bead j (0 = N-terminus at the cytosolic face) → position. */
function helixPoint(j: number, shift: Vector3, out: Vector3) {
  // α-helix: 10 residues over ≈1.2 of height, radius 0.11
  const k = j / (NSIG - 1);
  const ang = j * 1.75;
  return out.set(GATE_X + shift.x + Math.cos(ang) * 0.11, lerp(0.5, G.y, k) + shift.y, shift.z + Math.sin(ang) * 0.11);
}

// ——— the chain ———
function madeAt(t: number) {
  return (
    -4 +
    5.6 * seg(t, T.start[0], T.start[1]) +
    (NSIG + 3 - 1.6) * seg(t, T.emerge[0], T.emerge[1]) +
    (30 - 13) * seg(t, T.resume[0], T.resume[1]) +
    (38 - 30) * seg(t, T.more[0], T.more[1]) +
    (N - 38) * seg(t, T.finish[0], T.finish[1])
  );
}

const ribObj = new Object3D();
function ribosomePose(t: number) {
  const a = easeInOut(clamp((t - T.travel[0]) / (T.travel[1] - T.travel[0])));
  const b = easeInOut(clamp((t - T.settle[0]) / (T.settle[1] - T.settle[0])));
  const c = easeInOut(clamp((t - T.detach[0]) / (T.detach[1] - T.detach[0])));
  const pos: V3 = [0, 0, 0];
  const rot: V3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let p = lerp(RIB_FREE.pos[i], RIB_PRE.pos[i], a);
    p = lerp(p, RIB_DOCK.pos[i], b);
    p = lerp(p, RIB_AWAY.pos[i], c);
    // a gentle arc while travelling (comes in from above, not through the membrane)
    if (i === 1) p += Math.sin(Math.PI * a) * 0.5;
    pos[i] = p;
    let r = lerp(RIB_FREE.rot[i], RIB_PRE.rot[i], a);
    r = lerp(r, RIB_AWAY.rot[i], c);
    rot[i] = r;
  }
  // a faint idle sway while free (so the free ribosome reads as floating, still a pure function of t)
  const sway = 1 - a;
  pos[1] += Math.sin(t * 60) * 0.04 * sway;
  rot[2] += Math.sin(t * 45) * 0.02 * sway;
  return { pos, rot };
}

interface ChainState {
  beads: Vector3[];
  made: number;
}

const ZERO = new Vector3();
const _t = new Vector3();
const _h = new Vector3();
/** Loop end before cleavage: one residue below the gate (the signal's last residue sits at G). */
const G_END = new Vector3(GATE_X - 0.1, G.y - 0.17, 0.02);

function chainAt(t: number, rib: { pos: V3; rot: V3 }, st: ChainState, pl: Polyline) {
  const made = madeAt(t);
  st.made = made;
  ribObj.position.set(...rib.pos);
  ribObj.rotation.set(...rib.rot);
  ribObj.updateMatrix();
  const insertK = easeInOut(clamp((t - T.insert[0]) / (T.insert[1] - T.insert[0])));
  const away = smooth(clamp((t - T.sigAway[0]) / (T.sigAway[1] - T.sigAway[0])));

  // hairpin path (from the insertion on): pore + hanging loop ending just under the gate
  let mainLen = 0;
  if (insertK > 0) {
    const end = _w.lerpVectors(G_END, G_FREE, away);
    const wantLoop = Math.max(LOOP0, made * SP - PORE_LEN - HELIX_LEN - SP);
    const D = solveDepth(end, wantLoop);
    pl.clear();
    PORE.forEach((p) => pl.pushV(p));
    pushLoop(pl, end, D);
    mainLen = pl.length;
  }
  const shift = _v.copy(SIG_AWAY).multiplyScalar(away);
  for (let i = 0; i < N; i++) {
    const s = Math.max(0, made - i) * SP; // distance from the exit tunnel along the chain
    const b = st.beads[i];
    if (insertK < 1) {
      // free / SRP-held: hangs from the exit and curls towards −x (ribosome frame → world)
      HOOK.getPointAt(Math.min(1, s / HOOK_LEN), b);
      if (s > HOOK_LEN) b.x -= s - HOOK_LEN;
      b.applyMatrix4(ribObj.matrix);
    }
    if (insertK > 0) {
      const sh = i < NSIG ? shift : ZERO;
      if (s <= mainLen || i >= NSIG) pl.at(Math.min(s, mainLen), _t);
      else {
        // past the loop end: up the lateral gate as an α-helix (j = 9 at the lumen end, 0 = N-terminus)
        const over = s - mainLen;
        const j = clamp(NSIG - over / SP, 0, NSIG - 1);
        helixPoint(j, sh, _t);
        if (over < SP) {
          pl.at(mainLen, _h);
          _t.lerp(_h, 1 - over / SP);
        }
      }
      if (insertK < 1) b.lerp(_t, insertK);
      else b.copy(_t);
    }
  }
  return st;
}

// ——— camera ———
const CAM: CamKey[] = [
  { at: 0, pos: [-1.0, 6.6, 9.8], target: [-4.0, 4.0, 1.0], fov: 36 },
  { at: 0.13, pos: [-1.6, 6.0, 8.6], target: [-4.2, 3.8, 1.1], fov: 36 },
  { at: 0.185, pos: [-1.9, 4.2, 7.9], target: [-4.6, 3.3, 1.3], fov: 36 },
  { at: 0.275, pos: [-1.9, 4.2, 7.9], target: [-4.6, 3.3, 1.3], fov: 36 },
  { at: 0.315, pos: [0.4, 5.2, 9.6], target: [-4.0, 3.6, 1.4], fov: 36 },
  { at: 0.415, pos: [0.2, 5.0, 9.2], target: [-4.1, 3.5, 1.4], fov: 36 },
  { at: 0.46, pos: [2.6, 5.2, 12.0], target: [-1.8, 2.3, 0.6], fov: 38 },
  { at: 0.55, pos: [2.8, 3.8, 10.0], target: [-0.3, 1.5, 0.3], fov: 38 },
  { at: 0.6, pos: [2.9, 2.6, 8.0], target: [0.0, 0.7, 0.2], fov: 38 },
  { at: 0.715, pos: [3.1, 2.1, 8.2], target: [0.1, 0.1, 0.2], fov: 38 },
  { at: 0.755, pos: [3.6, -0.6, 7.0], target: [0.5, -0.7, 0.2], fov: 38 },
  { at: 0.855, pos: [3.4, -0.4, 7.2], target: [0.5, -0.8, 0.2], fov: 38 },
  { at: 0.9, pos: [3.6, 1.4, 10.6], target: [0.2, -0.6, 0.3], fov: 40 },
  { at: 1, pos: [4.2, 2.0, 11.4], target: [0.3, -0.3, 0.2], fov: 40 },
];

// ——— background RER ribosomes (context; no labels) ———
const BG = [
  { pos: [-5.6, 0, -3.6] as V3, made: 30, seed: 3 },
  { pos: [4.6, 0, -4.8] as V3, made: 24, seed: 7 },
  { pos: [-1.2, 0, -6.4] as V3, made: 34, seed: 11 },
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

export default function SignalScene({ t }: SceneProps) {
  useStageCamera(CAM);

  const state = useMemo<ChainState>(() => ({ beads: Array.from({ length: N }, () => new Vector3()), made: 0 }), []);
  const pl = useMemo(() => new Polyline(96), []);

  const rib = ribosomePose(t);
  chainAt(t, rib, state, pl);
  const made = state.made;

  // SRP: flies in (ribosome frame), rides along, is released after docking
  const srpIn = seg(t, T.srpIn[0], T.srpIn[1]);
  const srpOut = seg(t, T.release[0], T.release[1]);
  const srpOpacity = vis(t, T.srpIn[0] - 0.005, T.release[1], 0.03);
  const srpPos: V3 = [
    SRP_BOUND.pos.x + (1 - srpIn) * 3.2 - srpOut * 1.6,
    SRP_BOUND.pos.y + (1 - srpIn) * 2.4 + srpOut * 2.4,
    SRP_BOUND.pos.z + (1 - srpIn) * 2.2 + srpOut * 1.2,
  ];
  const srpRot = _q2.copy(SRP_BOUND.q).multiply(_q.setFromAxisAngle(_axis, (1 - srpIn) * 1.1 - srpOut * 0.8)).toArray() as [number, number, number, number];

  const open = seg(t, T.open[0], T.open[1]) * (1 - seg(t, T.close[0], T.close[1]));
  const shift = made * 3; // three bases per residue: the mRNA slides through the ribosome
  const cutFlash = vis(t, T.cut[0], T.cut[1], 0.012);
  const peptidaseLean = seg(t, T.approach[0], T.approach[1]) * (1 - seg(t, T.sigAway[1], T.sigAway[1] + 0.03));
  const fold = seg(t, T.fold[0], T.fold[1]);
  const away = seg(t, T.sigAway[0], T.sigAway[1]);

  // label positions that follow moving things
  const sigAnchor = state.beads[4].toArray() as V3;
  const matureIdx = Math.max(NSIG + 1, Math.min(N - 1, Math.floor(NSIG + (made - NSIG) * 0.5)));
  const polyAnchor: V3 = fold > 0.6 ? [FOLD_C[0], FOLD_C[1], FOLD_C[2]] : (state.beads[matureIdx].toArray() as V3);
  const chainOut = clamp(made - NSIG - 1); // the mature part has emerged

  const layout = (i: number, _m: number, out: Vector3) => {
    out.copy(state.beads[i]);
    return true;
  };

  return (
    <group>
      <EdgeTag side="top" text="CYTOSOL" />
      <EdgeTag side="bottom" text="ER LUMEN" />

      {/* RER membrane patch (cut face towards the camera at z ≈ 0.8) */}
      <Bilayer
        id="er-membrane"
        width={20}
        depth={10}
        position={[0, 0, -4.2]}
        holes={[
          { x: 0, z: 4.2, r: 0.95 },
          { x: SR.pos[0], z: SR.pos[2] + 4.2, r: 0.26 },
          { x: PEPTIDASE_POS[0], z: PEPTIDASE_POS[2] + 4.2, r: 0.3 },
          ...BG.map((b) => ({ x: b.pos[0], z: b.pos[2] + 4.2, r: 0.95 })),
        ]}
        seed={7}
      />
      <LumenTint id="er-lumen" box={[-30, 30, -0.68, -26, -30, 30]} color={PALETTE.erLumen} strength={0.16} />
      <Anchor id="er-membrane" position={[-3.6, 0.55, 0.45]} />
      <Anchor id="er-lumen" position={[-3.4, -2.3, 0.6]} />
      <Anchor id="cytosol" position={[-6.8, 2.6, -0.5]} />

      {/* translocon (Sec61) */}
      <Translocon id="translocon" open={open} />
      <Anchor id="translocon" position={[-0.5, 0.05, 0.45]} />

      {/* SRP receptor */}
      <group position={SR.pos}>
        <group scale={[1, SR.sy, 1]}>
          <SRPReceptor id="srp-receptor" />
        </group>
        <Anchor id="srp-receptor" position={[0.1, 0.95 * SR.sy, 0.05]} show={1} />
      </group>

      {/* signal peptidase (membrane enzyme, active site in the lumen) */}
      <group position={PEPTIDASE_POS} rotation={[0.42 * peptidaseLean, -0.5, -0.32 * peptidaseLean]}>
        <MembraneProtein id="signal-peptidase" color={PALETTE.signalPeptidase} side="lumen" glow={cutFlash * 0.9} />
        <Anchor id="signal-peptidase" position={[0.1, -0.95, 0.05]} />
      </group>

      {/* ribosome + mRNA (+ SRP while bound) */}
      <group position={rib.pos} rotation={rib.rot}>
        <Ribosome id="ribosome" size={S} />
        <MRNA id="mrna" points={MRNA_PTS} shift={shift} />
        <Anchor id="ribosome" position={[-0.45, -0.3, 0.9]} />
        <Anchor id="mrna" position={MRNA_PTS[1]} />
        {srpOpacity > 0.002 && (
          <group position={srpPos} quaternion={srpRot}>
            <SRP id="srp" opacity={srpOpacity} />
            <Anchor id="srp" position={[0.2, 0.06, 0]} show={srpOpacity} />
          </group>
        )}
      </group>

      {/* the nascent chain: signal peptide (yellow, residues 0–9) + mature protein (orange) */}
      <Polypeptide id="signal-peptide" count={N} made={made} spacing={SP} color={PALETTE.signalPeptide} range={[0, NSIG]} layout={layout} />
      <Polypeptide id="polypeptide" count={N} made={made} spacing={SP} range={[NSIG, N]} layout={layout} folded={fold} foldCenter={FOLD_C} />
      {/* the peptide bond the signal peptidase cuts */}
      <Bond a={state.beads[NSIG - 1]} b={state.beads[NSIG]} radius={0.046} color={PALETTE.polypeptide} id="polypeptide" show={made > NSIG + 0.4 && cutFlash < 0.5 && away === 0 ? 1 : 0} />
      <Anchor id="signal-peptide" position={sigAnchor} show={clamp(made - 4)} />
      <Anchor id="polypeptide" position={polyAnchor} show={chainOut} />

      {/* cleavage flash at the cut site (the event itself, not a pointer) */}
      {cutFlash > 0.01 && (
        <mesh position={[G.x + away * 0.2, G.y, G.z]} scale={0.18 + 0.22 * cutFlash}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshBasicMaterial color="#fff3c4" transparent opacity={0.55 * cutFlash} depthWrite={false} toneMapped={false} />
        </mesh>
      )}

      {/* background bound ribosomes: the membrane is *rough* ER */}
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
const BG_PATH: V3[] = [
  [0, E_DOCK.y, 0],
  [0, -0.8, 0],
  [0.3, -1.6, 0.3],
  [-0.2, -2.6, 0.6],
  [0.4, -3.6, 0.2],
  [-0.3, -4.8, 0.5],
  [0.2, -6, 0.2],
];
