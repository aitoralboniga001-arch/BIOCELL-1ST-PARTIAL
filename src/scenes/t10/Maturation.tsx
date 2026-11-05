/**
 * t10-maturation — Early endosome → late endosome (MVB) → endolysosome.
 *
 * World: cell scale. The plasma membrane is a vertical sheet on the left (x ≈ −7, periphery); a microtubule
 * runs from the periphery towards the centre (+x). The endosome rides the microtubule centripetally while it
 * acidifies (lumen tint shifts from blue to orange-red, more proton pumps appear, more H⁺ inside, and its label
 * carries the live pH value), fills with intraluminal vesicles, shows its inner glycocalyx, sequesters a
 * ubiquitinated membrane protein into a new ILV, and finally fuses with a lysosome into an endolysosome (pH < 5).
 */
import { useMemo } from 'react';
import { Color, MeshStandardMaterial, SphereGeometry } from 'three';
import type { SceneProps } from '@/content/types';
import { lerp, lerp3, seg, vis, type V3 } from '@/engine/anim';
import {
  Anchor,
  EdgeTag,
  Endosome,
  fibonacciSphere,
  GolgiStack,
  Ion,
  Lysosome,
  MembraneProtein,
  MembraneSheet,
  Microtubule,
  PALETTE,
  Protein,
  Sugar,
  Vesicle,
  useDisposable,
  useStageCamera,
  type CamKey,
} from '@/three/kit';

/** Step starts (= content `at`s). */
export const P = [0, 0.14, 0.28, 0.43, 0.57, 0.71, 0.86] as const;

const CAM: CamKey[] = [
  { at: 0, pos: [-4.5, 1.6, 9], target: [-4.6, 0, 0], fov: 38 },
  { at: 0.12, pos: [-4.5, 1.6, 9], target: [-4.6, 0, 0], fov: 38 },
  { at: 0.17, pos: [-1.5, 3.2, 13], target: [-2, -0.3, 0], fov: 40 },
  { at: 0.27, pos: [-0.5, 3, 12.5], target: [-1.5, -0.3, 0], fov: 40 },
  { at: 0.31, pos: [0.6, 1.5, 7.5], target: [0.5, 0, 0], fov: 38 },
  { at: 0.42, pos: [0.6, 1.5, 7.5], target: [0.5, 0, 0], fov: 38 },
  { at: 0.46, pos: [2.2, 1.2, 8.5], target: [2, 0, 0], fov: 38 },
  { at: 0.55, pos: [2.2, 1.2, 8.5], target: [2, 0, 0], fov: 38 },
  { at: 0.6, pos: [0.9, 3.4, 4.6], target: [0.5, 0.8, 0], fov: 36 },
  { at: 0.69, pos: [0.9, 3.4, 4.6], target: [0.5, 0.8, 0], fov: 36 },
  { at: 0.73, pos: [1.6, 1.4, 8.5], target: [1.6, 0, 0], fov: 38 },
  { at: 0.84, pos: [1.6, 1.4, 8.5], target: [1.6, 0, 0], fov: 38 },
  { at: 0.89, pos: [-1.5, 3.5, 15], target: [-1.2, 0.3, 0], fov: 40 },
  { at: 1, pos: [-1.5, 3.5, 15], target: [-1.2, 0.3, 0], fov: 40 },
];

const START: V3 = [-4.8, 0, 0];
const CENTRE: V3 = [0.5, 0, 0];
const LYSO_FAR: V3 = [4.6, 0.6, -0.4];
const LYSO_TOUCH: V3 = [2.6, 0.2, 0];
const ACID_LO = new Color('#86b6e8');
const ACID_HI = new Color('#ff5a3c');
const tmp = new Color();

/** pH tint sphere inside the current compartment (colour follows pH). */
function PHTint({ position, radius, ph, opacity }: { position: V3; radius: number; ph: number; opacity: number }) {
  const geo = useDisposable(() => [new SphereGeometry(1, 32, 24)], []);
  const mat = useMemo(() => new MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 0.6, emissiveIntensity: 0.35 }), []);
  const f = Math.min(1, Math.max(0, (7 - ph) / 2.4));
  tmp.copy(ACID_LO).lerp(ACID_HI, f);
  mat.color.copy(tmp);
  mat.emissive.copy(tmp);
  mat.opacity = 0.22 * opacity;
  mat.visible = opacity > 0.01;
  return <mesh position={position} scale={radius} geometry={geo[0]} material={mat} />;
}

function Pumps({ radius, n, opacity }: { radius: number; n: number; opacity: number }) {
  const pts = useMemo(() => fibonacciSphere(10).map((v) => v.multiplyScalar(radius).toArray() as V3), [radius]);
  return (
    <>
      {pts.map((p, i) => (
        <Protein key={i} id="proton-pump" shape="barrel" position={p} size={0.26} color={PALETTE.receptor} seed={i + 3} opacity={opacity * Math.min(1, Math.max(0, n - i))} />
      ))}
    </>
  );
}

function Glycocalyx({ radius, opacity }: { radius: number; opacity: number }) {
  const pts = useMemo(() => fibonacciSphere(34).map((v) => v.multiplyScalar(radius).toArray() as V3), [radius]);
  const kinds = ['GlcNAc', 'Gal', 'Sia', 'Man'] as const;
  return (
    <>
      {pts.map((p, i) => (
        <Sugar key={i} id="glycocalyx" kind={kinds[i % 4]} position={p} size={0.09} opacity={opacity} />
      ))}
    </>
  );
}

export default function Maturation({ t }: SceneProps) {
  useStageCamera(CAM);

  // travel along the microtubule
  const move = seg(t, 0.15, 0.27);
  const pos = lerp3(START, CENTRE, move);
  // early → late morph
  const late = seg(t, 0.2, 0.3);
  const ilv = seg(t, 0.2, 0.36);
  // fusion
  const approach = seg(t, 0.72, 0.77);
  const fuse = seg(t, 0.77, 0.83);
  const lysoPos = lerp3(lerp3(LYSO_FAR, LYSO_TOUCH, approach), [1.6, 0.1, 0], fuse);
  const endoPos = lerp3(pos, [1.3, 0, 0], fuse);
  const endolyso = fuse;
  // pH: 7 → 6 (early) → 5.25 (late) → 4.6 (endolysosome)
  const ph = 7 - seg(t, 0.02, 0.12) - 0.75 * seg(t, 0.15, 0.3) - 0.65 * seg(t, 0.77, 0.85);
  const acid = (7 - ph) / 2.4;
  const phTxt = `pH ${ph.toFixed(1)}`;
  const rad = lerp(1.0, 1.3, late);

  // ubiquitin / ILV budding (late endosome top)
  const ubq = seg(t, 0.585, 0.62);
  const bud = seg(t, 0.625, 0.69);
  const budShow = vis(t, 0.6, 0.85) * (1 - fuse);
  const rLate = 1.3;
  const tmPos: V3 = [0, lerp(rLate, rLate * 0.42, bud), 0];
  const lysoShow = seg(t, 0.4, 0.46) * (1 - seg(t, 0.8, 0.83));
  const golgiShow = seg(t, 0.86, 0.9);
  const ghost = 0.5 * seg(t, 0.86, 0.9);

  return (
    <>
      <EdgeTag side="top" text="CYTOSOL" />

      {/* periphery: plasma membrane (vertical sheet at the left) */}
      <MembraneSheet id="plasma-membrane" shape="plane" width={9} depth={8} position={[-7, 0, 0]} rotation={[0, 0, Math.PI / 2]} color={PALETTE.plasmaMembrane} thickness={0.12} />
      <Anchor id="plasma-membrane" position={[-7, 2.4, 1]} />

      {/* microtubule: periphery → centre */}
      <Microtubule id="microtubule" points={[[-6.6, -1.25, 0], [-2, -1.35, 0.1], [3.6, -1.3, 0]]} radius={0.13} color={PALETTE.microtubule} />
      <Anchor id="microtubule" position={[-3, -1.33, 0.05]} />
      <Ion kind="H" count={18} region={{ center: [0, 2.6, 0], size: [9, 1.2, 3] }} t={t} seed={7} opacity={0.35} />

      {/* early endosome (tubular, peripheral) */}
      <Endosome id="early-endosome" kind="early" radius={1.0} position={pos} opacity={1 - late} />
      <Anchor id="early-endosome" position={lerp3(pos, pos, 0)} show={1 - late} text={`Early endosome · ${phTxt}`} />

      {/* late endosome / MVB */}
      <group position={endoPos}>
        <Endosome id={['late-endosome', 'limiting-membrane']} kind="late" radius={rad} ilv={ilv} opacity={late * (1 - fuse)} />
        <Glycocalyx radius={rLate * 0.9} opacity={seg(t, 0.43, 0.5) * late} />
        {/* ubiquitinated membrane protein → inward bud → ILV */}
        <MembraneProtein id="limiting-membrane" side="cytosol" position={tmPos} size={0.3} color={PALETTE.receptor} opacity={budShow} />
        <Protein id="ubiquitin" shape="blob" size={0.22} color={PALETTE.methyl} position={[0.12, tmPos[1] + lerp(0.9, 0.32, ubq), 0]} opacity={budShow * seg(t, 0.575, 0.6)} />
        <Vesicle id="ilv" radius={0.3} position={[0, tmPos[1], 0]} color={PALETTE.lateEndosome} lumenColor="#1e2a4a" opacity={budShow * seg(t, 0.62, 0.66)} />
        <Anchor id="ubiquitin" position={[0.12, tmPos[1] + lerp(0.9, 0.32, ubq), 0]} show={budShow * seg(t, 0.575, 0.6)} />
        <Anchor id="ilv" position={[-0.45, -0.4, 0.3]} show={ilv * (1 - fuse)} />
        <Anchor id="limiting-membrane" position={[-rLate * 0.7, rLate * 0.7, 0]} show={late * (1 - fuse) * vis(t, 0.55, 0.72)} />
        <Anchor id="glycocalyx" position={[rLate * 0.62, -rLate * 0.6, 0]} show={seg(t, 0.43, 0.5) * late} />
      </group>
      <Anchor id="late-endosome" position={lerp3(endoPos, endoPos, 0)} show={late * (1 - fuse)} text={`Late endosome (MVB) · ${phTxt}`} />

      {/* acidification: pumps + protons + pH tint */}
      <group position={endoPos}>
        <Pumps radius={rad} n={2 + 8 * acid} opacity={1 - fuse} />
        <Ion kind="H" count={16} region={{ center: [0, 0, 0], size: [rad, rad, rad] }} t={t} seed={3} opacity={acid} />
        <Ion kind="H" count={14} region={{ center: [0, 0, 0], size: [rad, rad, rad] }} t={t} seed={9} opacity={seg(t, 0.15, 0.3)} />
      </group>
      <PHTint position={endoPos} radius={lerp(rad * 0.95, 1.45, endolyso)} ph={ph} opacity={1} />
      <Anchor id="proton-pump" position={[endoPos[0] + rad * 0.2, endoPos[1] + rad * 0.98, rad * 0.1]} show={1 - fuse} />

      {/* lysosome with hydrolases */}
      <group position={lysoPos}>
        <Lysosome id="lysosome" radius={0.75} opacity={lysoShow} />
        {[[0.2, 0.1, 0.1], [-0.25, -0.15, 0], [0.05, -0.3, -0.1]].map((p, i) => (
          <Protein key={i} id="hydrolytic-enzyme" size={0.22} color={PALETTE.hydrolase} position={p as V3} seed={i + 11} opacity={lysoShow} />
        ))}
        <Anchor id="lysosome" position={[0, 0.45, 0]} show={lysoShow} />
        <Anchor id="hydrolytic-enzyme" position={[0.2, 0.1, 0.1]} show={lysoShow} />
      </group>

      {/* endolysosome */}
      <group position={[1.3, 0, 0]}>
        <Vesicle id="endolysosome" radius={1.45} color={PALETTE.lysosome} lumenColor={PALETTE.lysosome} cargo={{ count: 16, color: PALETTE.hydrolase, seed: 4 }} opacity={endolyso} />
        <Glycocalyx radius={1.45 * 0.9} opacity={endolyso} />
        <Pumps radius={1.45} n={10} opacity={endolyso} />
        <Ion kind="H" count={24} region={{ center: [0, 0, 0], size: [1.6, 1.6, 1.6] }} t={t} seed={13} opacity={endolyso} />
        <Anchor id="endolysosome" position={[0, -0.5, 0.3]} show={endolyso} text={`Endolysosome · ${phTxt}`} />
      </group>

      {/* pH staircase recap: ghosts of the earlier stages */}
      <Endosome id="early-endosome" kind="early" radius={0.8} position={[-5, 2, -1]} opacity={ghost} />
      <Endosome id="late-endosome" kind="late" radius={1.0} position={[-2.2, 2.2, -1]} opacity={ghost} />
      <group position={[4.8, 2.6, -2]} scale={0.45}>
        <GolgiStack id="golgi" n={4} opacity={golgiShow} />
      </group>
      <Anchor id="golgi" position={[4.8, 2.6, -2]} show={golgiShow} />
    </>
  );
}
