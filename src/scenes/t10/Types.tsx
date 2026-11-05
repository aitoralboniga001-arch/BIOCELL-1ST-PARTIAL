/**
 * t10-types — The five types of endocytosis side by side.
 *
 * World: plasma membrane at y = 0 (EXTRACELLULAR = +y, CYTOSOL = −y). Five stations along x:
 * phagocytosis (x = −10, a bacterium), macropinocytosis (−5, a gulp of fluid), clathrin-mediated (0, ligands),
 * caveolin-mediated (4) and pinocytosis (7.5). The two large ones close actin-filled pseudopods over their target;
 * the three small ones bud into the cytosol and are pinched off by dynamin. Below: early endosome (0, −5),
 * a lysosome under the phagocytosis station and the Golgi on the right.
 *
 *  0  the cell keeps taking up fluid and membrane (small vesicles stream to the early endosome)
 *  1  specific (phago, clathrin) vs non-specific (macropino, caveolae, pinocytosis)
 *  2  actin pseudopods for the two large ones
 *  3  dynamin pinches the three small ones
 *  4  what each one takes
 *  5  they converge on the early endosome — except the phagosome, which goes to a lysosome
 *  6  the early endosome talks to the plasma membrane and the Golgi
 */
import { useMemo } from 'react';
import { Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { clamp, lerp, lerp3, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, ClathrinCage, EdgeTag, Endosome, GolgiStack, Lysosome, MembraneSheet, PALETTE, Protein, Vesicle, proteinMaterial, useDisposable, useStageCamera, type CamKey } from '@/three/kit';
import { Capsule } from '../t7/parts/molecules';
import { DynTube, PathBuf } from '../t6/parts/tube';
import { along, curve, loop } from '../t8/parts/stack';

export const P = [0, 0.14, 0.28, 0.42, 0.57, 0.71, 0.86] as const;

const X = { ph: -10, ma: -5, cl: 0, ca: 4, pi: 7.5 };
const EE: V3 = [0, -5, 0];
const LY: V3 = [-10, -5.6, 0];
const GOLGI: V3 = [8.2, -6.0, -0.5];
const FLUID = '#a5d8ff';
const LIG = '#ffd43b';
const BACT = '#94d82d';
const BIG = { r: 1.55, cy: 1.35 }; // engulfed volume: radius / centre height
const SMALL = { cl: 0.5, ca: 0.36, pi: 0.32 };
const T = {
  arms: [0.29, 0.4],
  close: 0.405,
  sink: [0.41, 0.5],
  bud: [0.2, 0.5],
  dyn: [0.45, 0.555],
  pinch: 0.555,
  drop: [0.555, 0.6],
  converge: [0.72, 0.8],
} as const;

/** one pseudopod: an arc over the engulfed volume, from the membrane up to angle `to` */
function Arm({ cx, side, prog, r, radius, mat, id, glow }: { cx: number; side: -1 | 1; prog: number; r: number; radius: number; mat: ReturnType<typeof proteinMaterial>; id: string | string[]; glow?: number }) {
  const buf = useMemo(() => new PathBuf(48), []);
  const v = useMemo(() => new Vector3(), []);
  const base = Math.asin(clamp(-BIG.cy / r, -1, 1)); // angle where the arc meets y = 0 (right side)
  const a0 = side > 0 ? base : Math.PI - base;
  const a1 = lerp(a0, Math.PI / 2 + side * 0.04, prog);
  buf.clear();
  const n = 40;
  for (let i = 0; i < n; i++) {
    const a = lerp(a0, a1, i / (n - 1));
    buf.pushV(v.set(cx + Math.cos(a) * r, BIG.cy + Math.sin(a) * r, 0.3));
  }
  if (prog <= 0.02) return null;
  return <DynTube path={buf.a} n={n} cap={48} radius={radius} material={mat} id={id} glow={glow} />;
}

/** pinocytic / clathrin / caveolar bud: sphere under the membrane, dynamin ring at the neck, then free */
function budY(t: number, R: number) {
  const b = smooth(seg(t, T.bud[0], T.bud[1]));
  const drop = smooth(seg(t, T.drop[0], T.drop[1]));
  return { b, y: lerp(-0.15 - R * b * 1.05, -1.9, drop) };
}

const ROUTES = {
  pi: curve([[X.pi, -0.5, 0.2], [4.5, -3.0, 0.6], [EE[0] + 1.1, EE[1] + 0.5, 0.2]]),
  cl: curve([[X.cl - 0.4, -0.5, 0.2], [-1.2, -2.6, 0.6], [EE[0] - 0.5, EE[1] + 1.0, 0.2]]),
  toGolgi: curve([[EE[0] + 1.2, EE[1] - 0.3, 0.2], [4.5, -6.4, 0.6], [GOLGI[0] - 1.6, GOLGI[1], 0.2]]),
  fromGolgi: curve([[GOLGI[0] - 1.4, GOLGI[1] + 0.8, 0.2], [4.8, -3.6, 0.6], [EE[0] + 1.0, EE[1] + 0.9, 0.2]]),
  recycle: curve([[EE[0] - 1.0, EE[1] + 0.7, 0.2], [-2.6, -2.4, 0.6], [-2.4, -0.4, 0.2]]),
};

const CAM: CamKey[] = [
  { at: 0, pos: [-1.2, 0.2, 21.5], target: [-1.2, -1.6, 0], fov: 40 },
  { at: 0.12, pos: [-1.2, 0.2, 21.2], target: [-1.2, -1.6, 0], fov: 40 },
  { at: 0.17, pos: [-1.2, 1.4, 20.0], target: [-1.2, 0.4, 0], fov: 40 },
  { at: 0.27, pos: [-1.2, 1.4, 19.8], target: [-1.2, 0.4, 0], fov: 40 },
  { at: 0.31, pos: [-7.5, 1.6, 11.5], target: [-7.5, 0.8, 0], fov: 40 },
  { at: 0.41, pos: [-7.5, 1.4, 11.2], target: [-7.5, 0.4, 0], fov: 40 },
  { at: 0.45, pos: [3.8, 0.2, 9.5], target: [3.8, -0.6, 0], fov: 40 },
  { at: 0.56, pos: [3.8, 0.0, 9.3], target: [3.8, -0.8, 0], fov: 40 },
  { at: 0.6, pos: [-1.2, -0.2, 20.0], target: [-1.2, -1.2, 0], fov: 40 },
  { at: 0.7, pos: [-1.2, -0.2, 19.8], target: [-1.2, -1.2, 0], fov: 40 },
  { at: 0.74, pos: [-2.0, -1.2, 19.0], target: [-2.0, -3.0, 0], fov: 40 },
  { at: 0.85, pos: [-2.0, -1.2, 18.8], target: [-2.0, -3.0, 0], fov: 40 },
  { at: 0.89, pos: [3.4, -2.4, 15.0], target: [3.4, -3.8, 0], fov: 40 },
  { at: 1, pos: [3.4, -2.4, 14.8], target: [3.4, -3.8, 0], fov: 40 },
];

export default function TypesScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const armMat = useDisposable(() => [proteinMaterial(PALETTE.plasmaMembrane, { roughness: 0.6 }), proteinMaterial('#ff6b6b', { roughness: 0.5, emissive: 0.2 })], []);
  const arms = smooth(seg(t, T.arms[0], T.arms[1]));
  const closed = t >= T.close;
  const sink = smooth(seg(t, T.sink[0], T.sink[1]));
  const conv = smooth(seg(t, T.converge[0], T.converge[1]));
  const fuse = smooth(seg(t, T.converge[1] - 0.02, T.converge[1] + 0.02));
  const actinGlow = 0.6 * vis(t, 0.28, 0.42, 0.015);
  const dynO = vis(t, T.dyn[0], T.pinch + 0.01, 0.01);
  const specific = vis(t, 0.14, 0.28, 0.02);

  // large vesicles: formed when the pseudopods meet, then sink into the cytosol
  const bigY = lerp(BIG.cy, -2.4, sink);
  const phagoC = lerp3([X.ph, bigY, 0], [LY[0] + 1.3, LY[1] + 0.6, 0], conv);
  const macroC = lerp3([X.ma, bigY, 0], [EE[0] - 1.2, EE[1] + 0.4, 0], conv);
  const bigO = closed ? 1 : 0;
  // small vesicles
  const cl = budY(t, SMALL.cl);
  const ca = budY(t, SMALL.ca);
  const pi = budY(t, SMALL.pi);
  const clC = lerp3([X.cl, cl.y, 0], [EE[0] - 0.3, EE[1] + 1.1, 0.3], conv);
  const caC = lerp3([X.ca, ca.y, 0], [EE[0] + 0.7, EE[1] + 1.0, 0.3], conv);
  const piC = lerp3([X.pi, pi.y, 0], [EE[0] + 1.1, EE[1] + 0.4, 0.3], conv);
  const smallO = 1 - fuse;

  const stream = vis(t, 0.01, 0.14, 0.015);
  const shuttle = vis(t, 0.87, 2, 0.02);

  return (
    <group>
      <EdgeTag side="top" text="EXTRACELLULAR" />
      <EdgeTag side="bottom" text="CYTOSOL" />
      <MembraneSheet id="plasma-membrane" shape="plane" width={32} depth={10} position={[0, 0, -2]} color={PALETTE.plasmaMembrane} thickness={0.14} />
      <Anchor id="plasma-membrane" position={[-13.5, 0.1, 1.2]} />

      {/* --- phagocytosis: bacterium, pseudopods with actin --- */}
      <group position={closed ? phagoC : [X.ph, BIG.cy, 0]}>
        <Capsule id="phagosome" a={[-0.55, -0.1, 0]} b={[0.55, 0.12, 0]} r={0.42} color={BACT} opacity={1 - smooth(seg(t, 0.8, 0.86))} />
        {closed && <Vesicle id="phagosome" radius={BIG.r} color={PALETTE.plasmaMembrane} lumenColor="#e9fac8" opacity={bigO * (1 - fuse)} />}
      </group>
      {!closed &&
        ([-1, 1] as const).map((s) => (
          <group key={s}>
            <Arm cx={X.ph} side={s} prog={arms} r={BIG.r} radius={0.32} mat={armMat[0]} id={['pseudopod', 'plasma-membrane']} />
            <Arm cx={X.ph} side={s} prog={arms * 0.97} r={BIG.r} radius={0.1} mat={armMat[1]} id="actin-filaments" glow={actinGlow} />
          </group>
        ))}
      <Anchor id="phagosome" text={specific > 0.5 ? 'Phagocytosis · specific' : undefined} position={closed ? [phagoC[0] - 1.2, phagoC[1] + 0.9, 0.6] : [X.ph - 0.8, BIG.cy + 0.9, 0.6]} show={vis(t, 0.14, 0.86, 0.02)} />
      <Anchor id="pseudopod" position={[X.ph + 1.45, 0.9, 0.5]} show={vis(t, 0.3, T.close, 0.01)} />
      <Anchor id="actin-filaments" position={[X.ma - 1.5, 0.9, 0.5]} show={vis(t, 0.3, T.close, 0.01)} />
      <Lysosome id="lysosome" radius={0.9} position={LY} opacity={vis(t, 0.7, 2, 0.02)} />

      {/* --- macropinocytosis: a gulp of fluid --- */}
      <group position={closed ? macroC : [X.ma, BIG.cy, 0]}>
        <mesh scale={BIG.r * 0.92}>
          <sphereGeometry args={[1, 24, 18]} />
          <meshStandardMaterial color={FLUID} emissive={FLUID} emissiveIntensity={0.45} transparent opacity={0.3 * (1 - fuse)} depthWrite={false} />
        </mesh>
        {closed && <Vesicle id="macropinosome" radius={BIG.r} color={PALETTE.plasmaMembrane} lumenColor={FLUID} opacity={bigO * (1 - fuse)} />}
      </group>
      {!closed &&
        ([-1, 1] as const).map((s) => (
          <group key={s}>
            <Arm cx={X.ma} side={s} prog={arms} r={BIG.r} radius={0.32} mat={armMat[0]} id={['pseudopod', 'plasma-membrane']} />
            <Arm cx={X.ma} side={s} prog={arms * 0.97} r={BIG.r} radius={0.1} mat={armMat[1]} id="actin-filaments" glow={actinGlow} />
          </group>
        ))}
      <Anchor id="macropinosome" text={specific > 0.5 ? 'Macropinocytosis · non-specific' : undefined} position={closed ? [macroC[0] + 1.2, macroC[1] + 0.9, 0.6] : [X.ma + 0.6, BIG.cy + 1.9, 0.6]} show={vis(t, 0.14, 0.86, 0.02)} />

      {/* --- clathrin-mediated --- */}
      <group position={clC}>
        <Vesicle id={['clathrin', 'transport-vesicle']} radius={SMALL.cl} color={PALETTE.plasmaMembrane} lumenColor={PALETTE.erLumen} opacity={smallO} />
        <ClathrinCage radius={SMALL.cl * 1.3} amount={cl.b * (1 - smooth(seg(t, 0.62, 0.68)))} from={[0, -1, 0]} id="clathrin" opacity={smallO} />
        {[0, 1, 2, 3].map((k) => (
          <Protein key={k} shape="blob" color={LIG} size={0.16} seed={k} position={[Math.cos(k * 1.6) * 0.22, 0.05 + Math.sin(k * 2.1) * 0.15, Math.sin(k * 1.6) * 0.2]} opacity={smallO * vis(t, 0.14, 2, 0.02)} />
        ))}
      </group>
      <Anchor id="clathrin" text={specific > 0.5 ? 'Clathrin-mediated · specific' : undefined} position={[clC[0] - 0.5, clC[1] - 0.6, 0.6]} show={vis(t, 0.14, 0.86, 0.02)} />

      {/* --- caveolin-mediated --- */}
      <group position={caC}>
        <Vesicle id="caveola" radius={SMALL.ca} coat="caveolin" coatAmount={ca.b} color={PALETTE.plasmaMembrane} lumenColor={FLUID} opacity={smallO} />
      </group>
      <Anchor id="caveola" text={specific > 0.5 ? 'Caveolae · non-specific' : undefined} position={[caC[0] + 0.3, caC[1] - 0.6, 0.6]} show={vis(t, 0.14, 0.86, 0.02)} />

      {/* --- pinocytosis --- */}
      <group position={piC}>
        <Vesicle id="pinocytic-vesicle" radius={SMALL.pi} color={PALETTE.plasmaMembrane} lumenColor={FLUID} opacity={smallO} />
      </group>
      <Anchor id="pinocytic-vesicle" text={specific > 0.5 ? 'Pinocytosis · non-specific' : undefined} position={[piC[0] + 0.3, piC[1] - 0.5, 0.6]} show={vis(t, 0.14, 0.86, 0.02)} />

      {/* dynamin collars on the three small necks */}
      {[X.cl, X.ca, X.pi].map((x, k) => (
        <mesh key={k} position={[x, -0.12, 0]} rotation={[Math.PI / 2, 0, 0]} scale={1 - 0.45 * smooth(seg(t, 0.5, T.pinch))} visible={dynO > 0.01}>
          <torusGeometry args={[0.2, 0.07, 8, 20]} />
          <meshStandardMaterial color={PALETTE.dynamin} emissive={PALETTE.dynamin} emissiveIntensity={0.3} transparent opacity={dynO} />
        </mesh>
      ))}
      <Anchor id="dynamin" position={[X.ca + 0.25, -0.15, 0.3]} show={dynO} />

      {/* early endosome; small endocytic vesicles stream in (step 0) */}
      <Endosome id="early-endosome" kind="early" radius={1.2} position={EE} glow={0.3 * fuse * vis(t, 0.7, 0.86, 0.02)} />
      <Anchor id="early-endosome" position={[EE[0] - 1.0, EE[1] - 0.9, 0.8]} />
      {stream > 0.01 &&
        (['pi', 'cl'] as const).flatMap((k) =>
          [0, 1, 2].map((i) => {
            const a = along(ROUTES[k], loop(t * 18, i, 3), 0.12);
            return <Vesicle key={`${k}${i}`} id="transport-vesicle" radius={0.28} position={a.pos} scale={a.s} color={PALETTE.plasmaMembrane} lumenColor={FLUID} opacity={stream} />;
          }),
        )}

      {/* the endosomal compartment is dynamic: EE ↔ Golgi, EE → plasma membrane */}
      <GolgiStack id="golgi" position={GOLGI} n={4} radius={1.4} vesicles={3} opacity={vis(t, 0.84, 2, 0.02)} />
      <Anchor id="golgi" position={[GOLGI[0] + 1.2, GOLGI[1] - 0.8, 0.6]} show={vis(t, 0.84, 2, 0.02)} />
      {shuttle > 0.01 &&
        (['toGolgi', 'fromGolgi', 'recycle'] as const).flatMap((k, ri) =>
          [0, 1].map((i) => {
            const a = along(ROUTES[k], loop(t * 14 + ri * 0.3, i, 2), 0.12);
            return <Vesicle key={`${k}${i}`} id="transport-vesicle" radius={0.26} position={a.pos} scale={a.s} color={k === 'recycle' ? PALETTE.recyclingEndosome : PALETTE.golgiMembrane} lumenColor={PALETTE.golgiLumen} opacity={shuttle} />;
          }),
        )}
      <Anchor id="transport-vesicle" position={ROUTES.toGolgi.getPointAt(0.5).toArray() as V3} show={shuttle + vis(t, 0.72, 0.86, 0.02) * 0} />
    </group>
  );
}
