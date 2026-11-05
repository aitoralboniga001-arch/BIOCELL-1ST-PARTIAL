/**
 * t7-glycosylation — N-glycosylation in the ER.
 *
 * World: RER membrane patch (bilayer at y = 0, cytosol above, lumen below) with a ribosome docked on the
 * translocon at the origin; the nascent chain threads down into the lumen and runs towards −x under a
 * dolichol phosphate lying in the lumenal leaflet at x ≈ −1.1. The Golgi waits in the distance (+x, back).
 *
 *  0  co-translational: the chain enters the lumen while it is being made; a cytosolic protein carries no sugar
 *  1  dolichol phosphate in the membrane; the 14-sugar block is built on it, sugar by sugar
 *  2  close-up on the oligosaccharide: 2 GlcNAc (blue cubes), 9 mannose (green), 3 glucose (blue spheres)
 *  3  an asparagine of the chain arrives; the whole block jumps from dolichol phosphate onto its N atom
 *  4  other secretory proteins carry exactly the same glycan; the Golgi will turn it into an address label
 *  5  calnexin and calreticulin hold glycoproteins by those sugars while they fold
 */
import { useMemo } from 'react';
import { Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { clamp, lerp, seg, smooth, vis, type V3 } from '@/engine/anim';
import {
  Anchor,
  Bilayer,
  curveFrom,
  EdgeTag,
  GolgiStack,
  LumenTint,
  MembraneProtein,
  MRNA,
  PALETTE,
  Polypeptide,
  Protein,
  Ribosome,
  RIBOSOME,
  Translocon,
  useStageCamera,
  type CamKey,
} from '@/three/kit';
import { Capsule, coilPoint, OLIGO_GLC3, TypedGlycan } from './parts/molecules';

export const P = [0, 0.17, 0.34, 0.52, 0.69, 0.86] as const;

const T = {
  thread: [0.02, 0.15],
  build: [0.19, 0.31],
  arrive: [0.53, 0.575],
  jump: [0.585, 0.635],
  more: [0.645, 0.7],
  others: [0.71, 0.78],
  golgi: [0.72, 0.77],
  bind: [0.88, 0.94],
} as const;

const S = 1.15;
const SP = 0.2;
const N = 44;
const ASN = 12;
const ASN_COL = '#ffa8a8';
const DOL_COL = '#c0eb75';
const E: V3 = [0, 2.04 + RIBOSOME.exit[1] * S, 0];
const PATH: V3[] = [E, [0, 0.55, 0], [0, -0.82, 0], [-0.35, -1.25, 0.35], [-1.1, -1.35, 0.55], [-1.95, -1.25, 0.6], [-2.7, -1.6, 0.6], [-3.2, -2.3, 0.5], [-3.3, -3.2, 0.3], [-3.0, -4.1, 0.2]];
const CURVE = curveFrom(PATH);
const LEN = CURVE.getLength();
// dolichol phosphate: lipid tail in the lumenal leaflet, phosphate at the lumen face
const DOL_P: V3 = [-1.15, -0.62, 0.62];
const GLY_SIZE = 0.5;
/** where along the path the asparagine stops, right under the dolichol */
const ASN_D = (() => {
  let best = 0;
  let bd = 1e9;
  const p = new Vector3();
  for (let k = 0; k <= 400; k++) {
    CURVE.getPointAt(k / 400, p);
    const d = p.distanceTo(new Vector3(-0.42, -1.28, 0.42));
    if (d < bd) {
      bd = d;
      best = (k / 400) * LEN;
    }
  }
  return best;
})();
const MADE_ASN = ASN + ASN_D / SP;

function madeAt(t: number) {
  return 3 + (MADE_ASN - 3) * (0.55 * seg(t, T.thread[0], T.thread[1]) + 0.45 * seg(t, T.arrive[0], T.arrive[1])) + (N - MADE_ASN) * seg(t, T.more[0], T.more[1]);
}
const _p = new Vector3();
const _q = new Vector3();
function beadAt(i: number, made: number, out: Vector3) {
  const d = Math.max(0, made - i) * SP;
  if (d <= LEN) return CURVE.getPointAt(d / LEN, out);
  CURVE.getPointAt(1, out);
  CURVE.getTangentAt(1, _q);
  return out.addScaledVector(_q, d - LEN);
}

const MRNA_PTS: V3[] = [
  [-5.4, 1.2, 1.5],
  [-3.6, 0.62, 0.95],
  [-1.7, 0.43, 0.32],
  [0, RIBOSOME.mrnaY * S, 0],
  [1.7, 0.46, -0.28],
  [3.4, 0.82, -0.8],
  [5.2, 1.4, -1.1],
];

/** other glycoproteins of the secretory pathway (step 4) and the chaperones that grab them (step 5) */
const OTHERS: { c: V3; seed: number }[] = [
  { c: [2.6, -2.9, 0.8], seed: 4 },
  { c: [6.6, -4.6, 1.0], seed: 7 },
  { c: [-6.2, -3.0, 0.4], seed: 9 },
];
const CNX: V3 = [-5.6, 0, 0.5];
const CRT: V3 = [4.2, -1.5, 1.0];
const GLY_H = 6 * 0.42 * GLY_SIZE;
const BIND_TO: V3[] = [
  [CRT[0] - 0.05, CRT[1] - GLY_H - 0.85, CRT[2]],
  [6.6, -4.6, 1.0],
  [CNX[0] + 0.1, -1.0 - GLY_H - 0.85, CNX[2]],
];
const GOLGI: V3 = [7.2, 3.6, -5.5];

const CAM: CamKey[] = [
  { at: 0, pos: [3.6, 2.6, 11.0], target: [-0.8, 0.4, 0.2], fov: 40 },
  { at: 0.15, pos: [3.4, 2.2, 10.6], target: [-0.8, 0.2, 0.2], fov: 40 },
  { at: 0.2, pos: [1.2, -0.6, 7.2], target: [-1.2, -1.0, 0.4], fov: 38 },
  { at: 0.33, pos: [1.1, -0.7, 7.0], target: [-1.2, -1.1, 0.4], fov: 38 },
  { at: 0.38, pos: [-0.4, -1.3, 4.6], target: [-1.15, -1.45, 0.6], fov: 36 },
  { at: 0.5, pos: [-0.5, -1.3, 4.5], target: [-1.15, -1.45, 0.6], fov: 36 },
  { at: 0.55, pos: [0.8, -0.9, 6.8], target: [-1.5, -1.5, 0.5], fov: 38 },
  { at: 0.68, pos: [0.6, -1.2, 7.2], target: [-1.8, -1.9, 0.5], fov: 38 },
  { at: 0.74, pos: [2.0, 1.2, 15.6], target: [0.6, -0.4, -0.6], fov: 42 },
  { at: 0.85, pos: [2.0, 1.2, 15.4], target: [0.6, -0.4, -0.6], fov: 42 },
  { at: 0.9, pos: [-0.4, -0.2, 14.4], target: [-0.4, -2.0, 0.2], fov: 42 },
  { at: 1, pos: [-0.4, -0.2, 14.8], target: [-0.4, -2.0, 0.2], fov: 42 },
];

const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

export default function GlycosylationScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const asn = useMemo(() => new Vector3(), []);

  const made = madeAt(t);
  beadAt(ASN, made, asn);
  const build = seg(t, T.build[0], T.build[1]);
  const jump = smooth(seg(t, T.jump[0], T.jump[1]));
  const flash = vis(t, T.jump[1] - 0.012, T.jump[1] + 0.02, 0.012);
  // glycan root: on dolichol phosphate, then on the asparagine (and rides along with it)
  const asnRoot: V3 = [asn.x, asn.y - 0.16, asn.z];
  const root = lerp3(DOL_P, asnRoot, jump);
  root[1] -= Math.sin(Math.PI * jump) * 0.25;
  const others = seg(t, T.others[0], T.others[1]);
  const bind = smooth(seg(t, T.bind[0], T.bind[1]));
  const crtPos = lerp3([6.0, -0.4, 1.4], CRT, bind);

  const layout = (i: number, m: number, out: Vector3) => (beadAt(i, m, out), true);
  const segs: [number, number, string][] = [[ASN / N, (ASN + 1) / N, ASN_COL]];

  return (
    <group>
      <EdgeTag side="top" text="CYTOSOL" />
      <EdgeTag side="bottom" text="ER LUMEN" />
      <Bilayer id="er-membrane" width={24} depth={10} position={[0, 0, -4.2]} holes={[{ x: 0, z: 4.2, r: 0.95 }, { x: CNX[0], z: CNX[2] + 4.2, r: 0.4 }, { x: DOL_P[0], z: DOL_P[2] + 4.2, r: 0.32 }]} seed={12} />
      <LumenTint id="er-lumen" box={[-30, 30, -0.68, -26, -30, 30]} color={PALETTE.erLumen} strength={0.16} />
      <Anchor id="er-membrane" position={[-3.6, 0.55, 0.45]} />
      <Anchor id="er-lumen" position={[1.6, -3.6, 0.6]} />

      {/* ribosome on the translocon, translating */}
      <Translocon id="translocon" open={1} />
      <Anchor id="translocon" position={[0.5, 0.05, 0.45]} />
      <group position={[0, 2.04, 0]}>
        <Ribosome id="ribosome" size={S} />
        <MRNA id="mrna" points={MRNA_PTS} shift={made * 3} />
      </group>

      {/* the nascent chain; the asparagine is pink */}
      <Polypeptide id="polypeptide" count={N} made={made} spacing={SP} layout={layout} segments={segs} />
      <Anchor id="polypeptide" position={beadAt(Math.max(0, Math.floor(made) - 6), made, _p).toArray() as V3} show={clamp(made - 6)} />
      <Anchor id="asparagine" position={[asn.x + 0.05, asn.y + 0.05, asn.z + 0.15]} show={clamp(made - ASN - 3)} />
      {/* a cytosolic protein: no sugars */}
      <Polypeptide count={30} made={30} spacing={SP} folded={1} foldCenter={[-4.2, 2.6, 0.6]} layout={(i, _m, out) => (coilPoint(i, 30, [-4.2, 2.6, 0.6], t, 2, out), true)} seed={3} />

      {/* dolichol phosphate: lipid tail in the membrane, phosphate on the lumen face */}
      <Capsule id="dolichol-phosphate" a={[DOL_P[0] - 0.05, 0.5, DOL_P[2] - 0.05]} b={[DOL_P[0], -0.42, DOL_P[2]]} r={0.07} color={DOL_COL} />
      <mesh position={[DOL_P[0], -0.5, DOL_P[2]]}>
        <sphereGeometry args={[0.11, 16, 12]} />
        <meshStandardMaterial color={PALETTE.phosphate} roughness={0.4} />
      </mesh>
      <Anchor id="dolichol-phosphate" position={[DOL_P[0], 0.1, DOL_P[2] + 0.1]} />

      {/* the 14-sugar oligosaccharide (hangs into the lumen) */}
      <group position={root} rotation={[0, 0, Math.PI]}>
        <TypedGlycan id="oligosaccharide" tree={OLIGO_GLC3} size={GLY_SIZE} amount={build} glow={flash} />
      </group>
      <Anchor id="oligosaccharide" position={[root[0] + 0.2, root[1] - GLY_H * 0.5, root[2] + 0.2]} show={build} />
      <Anchor id="glcnac" position={[root[0], root[1] - 0.12, root[2] + 0.12]} show={build} />
      <Anchor id="mannose" position={[root[0] - 0.05, root[1] - 0.21 * 3, root[2] + 0.12]} show={build} />
      <Anchor id="glucose" position={[root[0] - 0.42, root[1] - GLY_H + 0.05, root[2] + 0.12]} show={seg(t, T.build[1] - 0.02, T.build[1])} />

      {/* other secretory glycoproteins: the same glycan for all */}
      {OTHERS.map((o, k) => {
        const c = k < 2 ? lerp3(o.c, BIND_TO[k === 0 ? 0 : 1], k === 0 ? bind : 0) : lerp3(o.c, BIND_TO[2], bind);
        if (others <= 0.002) return null;
        return (
          <group key={k}>
            <Polypeptide id="polypeptide" count={26} made={26} spacing={SP} folded={0.7} foldCenter={c} seed={o.seed} opacity={others} layout={(i, _m, out) => (coilPoint(i, 26, c, t, o.seed, out, 1.5), true)} />
            <group position={[c[0], c[1] + 0.45, c[2]]}>
              <TypedGlycan id="oligosaccharide" tree={OLIGO_GLC3} size={GLY_SIZE} amount={1} opacity={others} />
            </group>
          </group>
        );
      })}

      {/* the Golgi, where the common glycan becomes a destination tag */}
      <group position={GOLGI} rotation={[0.2, -0.5, 0]} scale={1.1}>
        <GolgiStack id="golgi" n={5} opacity={vis(t, T.golgi[0], 2, 0.03)} />
      </group>
      <Anchor id="golgi" position={[GOLGI[0] - 0.4, GOLGI[1] + 0.2, GOLGI[2] + 1.0]} show={vis(t, T.golgi[0], 2, 0.03)} />

      {/* chaperones that use the sugars as handles */}
      <group position={CNX}>
        <MembraneProtein id="calnexin" color={PALETTE.calnexin} side="lumen" seed={12} />
        <Anchor id="calnexin" position={[0.25, -0.95, 0.25]} />
      </group>
      <Protein id="calreticulin" shape="blob" color={PALETTE.calreticulin} size={0.7} seed={8} position={crtPos} />
      <Anchor id="calreticulin" position={[crtPos[0] + 0.15, crtPos[1] + 0.05, crtPos[2] + 0.25]} show={vis(t, 0.84, 2, 0.02)} />
    </group>
  );
}
