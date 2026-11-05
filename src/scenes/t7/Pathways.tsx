/**
 * t7-pathways — Cytosolic vs secretory pathway (organelle scale).
 * Left: nucleus (mRNA leaves), a free polyribosome whose finished proteins go to the cytosol, nucleus,
 * mitochondrion and peroxisome. Right: ribosome-studded RER sheet → transport vesicle → Golgi → secretory
 * vesicle; a glycan marks the secretory protein.
 */
import { useMemo } from 'react';
import type { SceneProps } from '@/content/types';
import { prog, vis, type V3 } from '@/engine/anim';
import { Anchor, Flow, Glycan, OLIGO_14, PALETTE, Polyribosome, useStageCamera, type CamKey } from '@/three/kit';
import { GolgiStack, Mitochondrion, Nucleus, Peroxisome, RibosomeDots, Sac, sacRibosomes } from './parts/cell';
import type { SacSpec } from './parts/geo';
import { RouteVesicle, loopU } from './parts/traffic';

export const P = [0, 0.17, 0.34, 0.52, 0.69, 0.86] as const;

const NUC: V3 = [-6.5, 0, -1.5];
const POLY: V3[] = [[-4.0, 1.4, 0.6], [-3.0, 1.9, 1.0], [-1.8, 1.6, 1.2], [-0.8, 1.9, 0.9]];
const MITO: V3 = [-2.6, -2.0, 2.6];
const PEROX: V3 = [0.4, -0.6, 2.8];
const SHEET: SacSpec = { a: 2.4, b: 1.5, h: 0.14, n: 4, wave: 0.1, seed: 4 };
const RER: V3 = [3.0, -0.6, -0.5];
const GOLGI: V3 = [7.4, -0.2, -0.5];
const R_ER_GOLGI: V3[] = [[5.2, -0.4, -0.3], [6.0, 0.1, -0.1], [6.8, -0.1, -0.4]];
const R_GOLGI_OUT: V3[] = [[8.1, 0.1, -0.4], [9.3, 0.6, 0.2], [10.6, 0.8, 0.6]];

const CAM: CamKey[] = [
  { at: 0, pos: [-3.5, 4.5, 9.5], target: [-3.0, 0.8, 0.5], fov: 38 },
  { at: 0.16, pos: [-3.0, 4.2, 9.0], target: [-2.6, 0.8, 0.8], fov: 38 },
  { at: 0.36, pos: [-3.0, 6.0, 12.5], target: [-3.0, -0.2, 0.5], fov: 40 },
  { at: 0.5, pos: [-2.5, 6.0, 12.5], target: [-3.0, -0.2, 0.5], fov: 40 },
  { at: 0.55, pos: [5.0, 5.0, 11.0], target: [5.2, -0.3, -0.3], fov: 40 },
  { at: 0.68, pos: [5.5, 5.0, 11.0], target: [5.4, -0.3, -0.3], fov: 40 },
  { at: 0.72, pos: [3.4, 2.6, 6.0], target: [3.2, -0.6, 0.2], fov: 36 },
  { at: 0.84, pos: [3.6, 2.6, 6.0], target: [3.2, -0.6, 0.2], fov: 36 },
  { at: 0.9, pos: [0.5, 7.5, 16.0], target: [0.5, -0.2, 0], fov: 42 },
  { at: 1, pos: [0.5, 7.5, 16.0], target: [0.5, -0.2, 0], fov: 42 },
];

export default function PathwaysScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const ribs = useMemo(() => sacRibosomes(SHEET, 150, 3), []);
  const release = vis(t, P[1] + 0.02, 1.1, 0.02);
  const destinations = vis(t, P[2] + 0.01, 1.1, 0.02);
  const secretory = vis(t, P[3] + 0.01, 1.1, 0.02);
  return (
    <group>
      <Nucleus id="nucleus" position={NUC} radius={2.2} pores={50} ribosomes={80} />
      <Anchor id="nucleus" position={[NUC[0] + 0.5, NUC[1], NUC[2] + 1]} />
      <Flow points={[[NUC[0] + 2.0, 0.9, -0.6], [-4.4, 1.3, 0.3], POLY[0]]} t={t} speed={4} count={6} size={0.05} color={PALETTE.mrna} id="mrna" />

      {/* free polyribosome: cytosolic pathway */}
      <Polyribosome id="polyribosome" points={POLY} count={5} size={0.32} progress={t * 12} />
      <Anchor id="polyribosome" position={POLY[2]} />
      <Anchor id="mrna" position={POLY[1]} />
      <Anchor id="ribosome" position={[POLY[3][0], POLY[3][1] - 0.1, POLY[3][2]]} />
      <Anchor id="cytosol" position={[-1.5, 3.0, -1.5]} />
      {release > 0.01 && <Flow points={[[-1.8, 0.9, 1.2], [-1.0, 0.4, 2.0], [-0.2, 1.2, 2.6]]} t={t} speed={3} count={5} size={0.09} color={PALETTE.polypeptide} opacity={release} />}
      {destinations > 0.01 && (
        <>
          <Flow points={[[-2.8, 1.0, 1.0], [-4.0, 0.6, 0.6], [NUC[0] + 2.1, 0.2, -0.4]]} t={t} speed={3.5} count={5} size={0.09} color={PALETTE.polypeptide} opacity={destinations} />
          <Flow points={[[-2.4, 1.0, 1.2], [-2.6, -0.6, 2.2], [MITO[0], MITO[1] + 0.4, MITO[2]]]} t={t} speed={3.2} count={5} size={0.09} color={PALETTE.polypeptide} opacity={destinations} />
          <Flow points={[[-1.4, 1.2, 1.2], [-0.4, 0.4, 2.2], [PEROX[0] - 0.3, PEROX[1] + 0.2, PEROX[2]]]} t={t} speed={3} count={5} size={0.09} color={PALETTE.polypeptide} opacity={destinations} />
        </>
      )}
      <Mitochondrion id="mitochondrion" position={MITO} rotation={[0, 0.4, 0]} length={2.2} radius={0.5} />
      <Anchor id="mitochondrion" position={MITO} />
      <Peroxisome id="peroxisome" position={PEROX} radius={0.45} />
      <Anchor id="peroxisome" position={PEROX} />

      {/* secretory pathway: ER-bound ribosomes, vesicles, Golgi */}
      <group position={RER}>
        <Sac spec={SHEET} id={['rer', 'er']} />
        <RibosomeDots places={ribs} size={0.075} id="ribosome" />
        <group position={[0.4, -0.02, 0.2]} scale={0.32 * secretory}>
          <Glycan tree={OLIGO_14} id="oligosaccharide" />
        </group>
      </group>
      <Anchor id="rer" position={[RER[0] - 1.2, RER[1], RER[2] + 0.4]} />
      <Anchor id="er" position={[RER[0] + 1.4, RER[1], RER[2] - 0.6]} />
      <Anchor id="oligosaccharide" position={[RER[0] + 0.4, RER[1] + 0.3, RER[2] + 0.2]} show={secretory} />
      <group position={GOLGI} rotation={[0, 0, -Math.PI / 2]}>
        <GolgiStack id="golgi" size={0.9} vesicles={6} />
      </group>
      <Anchor id="golgi" position={GOLGI} />
      {secretory > 0.01 && (
        <>
          <RouteVesicle points={R_ER_GOLGI} u={loopU(prog(t, P[3], 1), 4)} radius={0.25} cargo={PALETTE.cargo} id="transport-vesicle" opacity={secretory} />
          <RouteVesicle points={R_GOLGI_OUT} u={loopU(prog(t, P[3], 1), 4, 0.5)} radius={0.28} cargo={PALETTE.cargo} id="transport-vesicle" opacity={secretory} />
          <Anchor id="transport-vesicle" position={R_ER_GOLGI[1]} show={secretory} />
        </>
      )}
    </group>
  );
}
