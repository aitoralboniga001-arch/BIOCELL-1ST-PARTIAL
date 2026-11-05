/**
 * t7-lipid-ca — Lipid routes out of the SER, and the ER as a Ca²⁺ store.
 * SER bilayer at y = 0 (cytosol +y, lumen −y). Golgi (+x), mitochondrion (−x), peroxisome, plasma membrane above.
 */
import type { SceneProps } from '@/content/types';
import { lerp3, seg, vis, type V3 } from '@/engine/anim';
import {
  Actin,
  Anchor,
  Bilayer,
  EdgeTag,
  GolgiStack,
  Ion,
  LumenTint,
  MembraneProtein,
  MembraneSheet,
  Mitochondrion,
  PALETTE,
  Protein,
  Vesicle,
  useStageCamera,
  type CamKey,
} from '@/three/kit';

export const P = [0, 0.17, 0.34, 0.52, 0.69, 0.86] as const;

const CAM: CamKey[] = [
  { at: 0, pos: [0, 5, 15], target: [0, 1.5, 0], fov: 40 },
  { at: 0.3, pos: [0, 5, 15], target: [0, 1.5, 0], fov: 40 },
  { at: 0.36, pos: [3, 4.5, 12], target: [2, 2, 0], fov: 40 },
  { at: 0.5, pos: [3, 4.5, 12], target: [2, 2, 0], fov: 40 },
  { at: 0.56, pos: [-3, 4.5, 12], target: [-2, 1.5, 0], fov: 40 },
  { at: 0.66, pos: [-3, 4.5, 12], target: [-2, 1.5, 0], fov: 40 },
  { at: 0.72, pos: [0, 2, 8], target: [0, 0, 0], fov: 38 },
  { at: 1, pos: [0, 2, 8], target: [0, 0, 0], fov: 38 },
];

export default function LipidCa({ t }: SceneProps) {
  useStageCamera(CAM);
  const ves = seg(t, 0.19, 0.32);
  const vesPos: V3 = lerp3([2, 1.2, 0.5], [4.6, 3.2, 0], ves);
  const cer = seg(t, 0.36, 0.48);
  const cerPos: V3 = lerp3([1.2, 0.8, 1], [4.2, 2.2, 0.6], cer);
  const direct = seg(t, 0.54, 0.66);
  const lipPos: V3 = lerp3([-1.8, 0.8, 0.5], [-4.2, 1.6, 0.5], direct);
  const pump = seg(t, 0.71, 0.84);
  const release = seg(t, 0.88, 0.97);
  const caIn = 1 - release;
  const cell = 1 - seg(t, 0.68, 0.72);
  const ca = seg(t, 0.69, 0.72);
  const atpPos: V3 = lerp3([1.8, 2.2, 0.8], [0.9, 1.1, 0.3], seg(t, 0.7, 0.76));
  return (
    <>
      <EdgeTag side="top" text="CYTOSOL" />
      <EdgeTag side="bottom" text="ER LUMEN" />
      <Bilayer id={['ser', 'phospholipid']} width={16} depth={8} seed={9} holes={[{ x: 0.5, z: 0, r: 0.5 }, { x: -1.6, z: 0, r: 0.5 }]} />
      <LumenTint id="er-lumen" box={[-30, 30, -26, -0.68, -30, 30]} color={PALETTE.erLumen} strength={0.14} />
      <Anchor id="ser" position={[-5, -0.1, 1]} />
      <Anchor id="phospholipid" position={[3.5, 0.5, 2]} />
      <Anchor id="er-lumen" position={[-4, -2, 1]} />
      <Anchor id="cytosol" position={[-5.5, 3, 0]} />

      {/* routes */}
      <GolgiStack id="golgi" position={[5, 3.2, -1]} scale={0.5} opacity={cell} />
      <Anchor id="golgi" position={[5, 3.2, -1]} show={cell} />
      <Vesicle id="transport-vesicle" position={vesPos} radius={0.45} coat={null} opacity={vis(t, 0.17, 0.33) * cell} />
      <Anchor id="transport-vesicle" position={vesPos} show={vis(t, 0.17, 0.33)} />
      <MembraneProtein id="ceramide-translocator" position={[1.2, 0, 1]} side="cytosol" color={PALETTE.receptor} opacity={cell} />
      <Anchor id="ceramide-translocator" position={[1.2, 0.8, 1]} show={cell} />
      <Protein id="ceramide" position={cerPos} color={PALETTE.lipidTail} size={0.35} opacity={vis(t, 0.35, 0.5) * cell} />
      <Anchor id="ceramide" position={cerPos} show={vis(t, 0.35, 0.5)} />
      <Protein id="sphingomyelin" position={[4.6, 2.6, 0.4]} color={PALETTE.lipidHead} size={0.35} opacity={seg(t, 0.46, 0.5) * cell} />
      <Anchor id="sphingomyelin" position={[4.6, 2.6, 0.4]} show={seg(t, 0.46, 0.5) * cell} />
      <MembraneSheet id="plasma-membrane" shape="plane" width={16} depth={6} position={[0, 5.5, -2]} color={PALETTE.plasmaMembrane} opacity={cell} />
      <Anchor id="plasma-membrane" position={[-2, 5.5, -1]} show={cell} />
      <Mitochondrion id="mitochondrion" position={[-4.6, 1.9, 0.5]} length={2.4} radius={0.6} opacity={cell} />
      <Anchor id="mitochondrion" position={[-4.6, 1.9, 0.5]} show={cell} />
      <MembraneSheet id="peroxisome" shape="sphere" radius={0.55} position={[-2.2, 3.4, -0.5]} color={PALETTE.peroxisome} opacity={cell} />
      <Anchor id="peroxisome" position={[-2.2, 3.4, -0.5]} show={cell} />
      <MembraneSheet id="outer-nuclear-membrane" shape="plane" width={5} depth={4} position={[-6, -0.05, -3]} color={PALETTE.nuclearEnvelope} opacity={cell} />
      <Anchor id="outer-nuclear-membrane" position={[-6.5, 0, -3]} show={cell} />
      <Protein id="phospholipid" position={lipPos} color={PALETTE.lipidHead} size={0.3} opacity={vis(t, 0.53, 0.67)} />

      {/* calcium */}
      <MembraneProtein id="ca-pump" position={[0.5, 0, 0]} side="cytosol" color={PALETTE.srpReceptor} opacity={ca} glow={vis(t, 0.72, 0.84) * 0.5} />
      <Anchor id="ca-pump" position={[0.5, 0.8, 0]} show={ca} />
      <MembraneProtein id="calcium" position={[-1.6, 0, 0]} side="cytosol" color={PALETTE.receptor} opacity={ca} glow={vis(t, 0.87, 0.95) * 0.5} />
      <Protein id="atp" position={atpPos} color={PALETTE.gef} size={0.3} opacity={vis(t, 0.69, 0.86)} />
      <Anchor id="atp" position={atpPos} show={vis(t, 0.69, 0.86)} />
      <Ion id="calcium" kind="Ca" count={14} t={t} seed={3} region={{ center: [0, -1.6 - 0 * pump, 0], size: [5, 1.4, 3] }} opacity={ca * (0.3 + 0.7 * pump) * caIn + ca * release * 0} />
      <Ion id="calcium" kind="Ca" count={14} t={t} seed={8} region={{ center: [0, 1.6, 0], size: [5, 1.4, 3] }} opacity={ca * ((1 - pump) + release)} />
      <Anchor id="calcium" position={[1.5, -1.6, 0.5]} show={ca} />
      <Actin id="muscle-fiber" points={[[-5, 3, -1], [5, 3, -1]]} opacity={seg(t, 0.86, 0.9)} />
      <Anchor id="muscle-fiber" position={[3, 3, -1]} show={seg(t, 0.86, 0.9)} />
    </>
  );
}
