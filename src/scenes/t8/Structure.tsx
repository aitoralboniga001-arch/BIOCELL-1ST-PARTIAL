/**
 * t8-structure — Discovery and structure of the Golgi apparatus (organelle scale).
 * World: stack axis = +x (cis at −x faces the ER, trans at +x). ER on the left, lysosome lower right.
 *  0 the Golgi (whole stack, glowing)      1 cisternae spread apart (independent), then cut open: lumen
 *  2 cis convex / trans concave (section)   3 ER vesicles fuse at the CGN, sorted vesicles leave the TGN
 *  4 vesicles to destinations + lysosome     5 a different enzyme set in each cisterna
 */
import { CatmullRomCurve3, Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { clamp, lerp, prog, seg, vis, type V3 } from '@/engine/anim';
import { Anchor, EdgeTag, MembraneSheet, PALETTE, Protein, Vesicle, useStageCamera, type CamKey } from '@/three/kit';
import { Cisterna, STACK_ROT } from './parts/Cisterna';

export const P = [0, 0.17, 0.34, 0.52, 0.69, 0.86] as const;

const N = 5;
const R = [1.8, 2.1, 2.25, 2.15, 1.95];
const COL = ['#f2b84b', '#eaae5e', PALETTE.golgiMembrane, '#d48f52', '#c9763a'];
const GAP = 0.42;
const X0 = -((N - 1) * GAP) / 2;

const CAM: CamKey[] = [
  { at: 0, pos: [5.5, 4.2, 10.5], target: [0, 0, 0], fov: 38 },
  { at: 0.15, pos: [4.5, 3.2, 9.5], target: [0, 0, 0], fov: 38 },
  { at: 0.3, pos: [2.5, 1.6, 8.2], target: [0, 0, 0], fov: 38 },
  { at: 0.36, pos: [0.4, 0.8, 8.4], target: [0, 0, 0], fov: 38 },
  { at: 0.5, pos: [0.2, 0.6, 8.2], target: [0, 0, 0], fov: 38 },
  { at: 0.56, pos: [-0.5, 2.2, 13.5], target: [-1.2, 0, 0], fov: 40 },
  { at: 0.68, pos: [-0.5, 2.2, 13.5], target: [-1.2, 0, 0], fov: 40 },
  { at: 0.74, pos: [1.8, 3.0, 15.5], target: [1.0, -0.6, 0], fov: 40 },
  { at: 0.85, pos: [1.8, 3.0, 15.5], target: [1.0, -0.6, 0], fov: 40 },
  { at: 0.9, pos: [0.6, 1.0, 7.4], target: [0, 0, 0], fov: 38 },
  { at: 1, pos: [0.8, 1.2, 7.8], target: [0, 0, 0], fov: 38 },
];

const ER_X = -6.2;
const LYSO: V3 = [5.2, -2.6, 0];
const PM_X = 9;

const curve = (pts: V3[]) => new CatmullRomCurve3(pts.map((p) => new Vector3(...p)), false, 'centripetal');
// ER → cis vesicles
const IN = [0, 1, 2].map((i) => curve([[ER_X + 1.1, -1 + i, 0.4], [-3.2, -0.6 + i * 0.8, 0.9], [X0 - 0.35, -0.8 + i * 0.8, 0.5]]));
// trans → destinations (PM, lysosome, PM)
const OUT = [
  curve([[-X0 + 0.35, 0.9, 0.4], [3.5, 1.6, 0.8], [PM_X - 0.4, 1.4, 0.4]]),
  curve([[-X0 + 0.35, -0.6, 0.4], [3, -1.8, 0.8], [LYSO[0] - 0.6, LYSO[1] + 0.3, 0.3]]),
  curve([[-X0 + 0.35, 0.1, 0.5], [4, 0.0, 1.0], [PM_X - 0.4, -0.6, 0.4]]),
];
const OUT_COL = ['#51cf66', PALETTE.hydrolase, '#f783ac'];
const _p = new Vector3();

export default function StructureScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const spread = seg(t, 0.19, 0.24) * (1 - seg(t, 0.28, 0.33));
  const half = t >= 0.26;
  const silver = 1 - seg(t, 0.08, 0.15);
  const ctx = seg(t, 0.52, 0.56);
  const enz = seg(t, 0.87, 0.92);
  const flowIn = (t - 0.52) * 40;
  const flowOut = (t - 0.58) * 30;

  return (
    <group>
      <EdgeTag side="left" text="CIS · from ER" />
      <EdgeTag side="right" text="TRANS · out" />

      {/* the stack */}
      {R.map((r, i) => {
        const x = X0 + i * GAP + (i - 2) * 0.35 * spread;
        const ids = ['golgi', 'cisterna', ...(i === 0 ? ['cgn'] : []), ...(i === N - 1 ? ['tgn'] : [])];
        return (
          <group key={i} position={[x, 0, 0]} rotation={STACK_ROT}>
            <Cisterna R={r} seed={i + 1} half={half} fen={10} id={ids} color={silver > 0.5 ? '#3a2a18' : COL[i]} />
          </group>
        );
      })}
      <Anchor id="golgi" position={[0, 1.7, -0.8]} />
      <Anchor id="cisterna" position={[X0 + 2 * GAP, -1.2, -0.6]} show={seg(t, 0.17, 0.2)} />
      <Anchor id="golgi-lumen" position={[X0 + 2 * GAP + 0.1, 0.4, 0.02]} show={half ? 1 : 0} />
      <Anchor id="cgn" position={[X0, 0.9, -0.3]} show={seg(t, 0.34, 0.37)} />
      <Anchor id="tgn" position={[-X0, -0.9, -0.3]} show={seg(t, 0.34, 0.37)} />

      {/* ER (context from step 3) */}
      <group position={[ER_X, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <Cisterna R={3.2} seed={9} fen={0} bend={0.04} color={PALETTE.erMembrane} lumenColor={PALETTE.erLumen} opacity={ctx} id="er" />
      </group>
      <Anchor id="er" position={[ER_X, 2.2, 0.3]} show={ctx} />

      {/* unsorted ER vesicles → CGN */}
      {ctx > 0.01 &&
        IN.map((c, i) => {
          const u = (((flowIn + i / 3) % 1) + 1) % 1;
          c.getPointAt(u, _p);
          const s = Math.min(1, u / 0.12, (1 - u) / 0.12);
          return <Vesicle key={i} position={_p.toArray() as V3} radius={0.2 * s} id="transport-vesicle" cargo={{ count: 4, seed: i, color: ['#ffd43b', '#f783ac', '#ff7849'][i] }} opacity={ctx} />;
        })}
      <Anchor id="transport-vesicle" position={[-3.2, 0.95, 0.9]} show={ctx} />

      {/* sorted vesicles leaving the TGN */}
      {ctx > 0.01 &&
        OUT.map((c, i) => {
          const u = clamp((((flowOut + i / 3) % 1) + 1) % 1);
          c.getPointAt(u, _p);
          const s = Math.min(1, u / 0.1, (1 - u) / 0.1);
          return <Vesicle key={i} position={_p.toArray() as V3} radius={0.22 * s} lumenColor={PALETTE.golgiLumen} cargo={{ count: 5, seed: i + 4, color: OUT_COL[i] }} opacity={seg(t, 0.56, 0.6)} />;
        })}

      {/* lysosome + plasma membrane (destinations) */}
      <MembraneSheet shape="sphere" radius={0.75} position={LYSO} color={PALETTE.lysosome} lumenColor={PALETTE.lysosome} id="lysosome" opacity={seg(t, 0.68, 0.72)} />
      <Anchor id="lysosome" position={LYSO} show={seg(t, 0.68, 0.72)} />
      <MembraneSheet shape="plane" width={9} depth={4} position={[PM_X, 0, 0]} rotation={[0, 0, Math.PI / 2]} color={PALETTE.plasmaMembrane} opacity={seg(t, 0.68, 0.72) * 0.8} />

      {/* a different enzyme set in each cisterna */}
      {enz > 0.01 &&
        R.map((r, i) =>
          [0, 1, 2].map((k) => (
            <Protein key={`${i}-${k}`} id="glycosyltransferase" shape={i % 2 ? 'ring' : 'blob'} color={lerpCol(i)} size={0.16} seed={i * 3 + k} position={[X0 + i * GAP + 0.02 + 0.09 * (r * r * 0.0), lerp(-1.2, 1.2, k / 2), -0.05]} opacity={enz} />
          )),
        )}
      <Anchor id="glycosyltransferase" position={[X0 + 2 * GAP, 1.2, -0.05]} show={enz} />
      {prog(t, 0, 1) < 0 && <group />}
      {vis(t, 0, 1) < 0 && <group />}
    </group>
  );
}

function lerpCol(i: number) {
  return ['#ffd43b', '#ffa94d', '#ff922b', '#f76707', '#d9480f'][i];
}
