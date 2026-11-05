/**
 * t6-eu-hetero — a nucleus cut open: envelope (ONM/INM, pores), lamina, dark heterochromatin clumps on the
 * lamina at the periphery, light euchromatin threads in the centre, a central nucleolus; an active gene
 * moves from the periphery to the euchromatin centre while a silent gene moves out to the periphery.
 */
import { useMemo } from 'react';
import { Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { rand, seg, type V3 } from '@/engine/anim';
import { Anchor, lumpySphere, PALETTE, proteinMaterial, useDisposable, useKitHighlight, useStageCamera, type CamKey } from '@/three/kit';
import { cutPlane, fibPoints, LocalClipping, NucleusShell, randomWalk, threadGeometry } from './parts/nucleus';

export const P = [0, 0.17, 0.34, 0.52, 0.69, 0.86] as const;

const R = 4;
const CUT = 1.2;
const CAM: CamKey[] = [
  { at: 0, pos: [3.5, 3.2, 8.5], target: [1.6, 1.8, 0.6], fov: 38 },
  { at: 0.15, pos: [3.5, 3.2, 8.5], target: [1.6, 1.8, 0.6], fov: 38 },
  { at: 0.2, pos: [0, 1.5, 13], target: [0, 0, 0], fov: 38 },
  { at: 0.5, pos: [0, 1.5, 13], target: [0, 0, 0], fov: 38 },
  { at: 0.55, pos: [0.5, 0.8, 9], target: [0.3, -0.2, -0.4], fov: 38 },
  { at: 0.67, pos: [0.5, 0.8, 9], target: [0.3, -0.2, -0.4], fov: 38 },
  { at: 0.72, pos: [-1, 1.5, 11.5], target: [0, 0, 0], fov: 38 },
  { at: 1, pos: [1, 2, 13], target: [0, 0, 0], fov: 38 },
];

const NUCLEOLUS: V3 = [0.3, -0.2, -0.5];
const HET = fibPoints(46, 0.7)
  .map((v, i) => ({ p: v.multiplyScalar(R * 0.82), s: 0.42 + rand(i * 3.1) * 0.3, i }))
  .filter((h) => h.p.z < CUT - 0.2);

export default function EuHeteroScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const plane = useMemo(() => cutPlane(CUT), []);
  const hetGeo = useDisposable(() => lumpySphere({ detail: 6, scale: [1, 0.55, 1], noise: 0.18, freq: 3, seed: 5 }), []);
  const euGeo = useDisposable(() => threadGeometry(Array.from({ length: 18 }, (_, i) => randomWalk(i + 3, 26, [0, 0, 0], R * 0.62, 0.45)), 0.035, 8, 6), []);
  const nuGeo = useDisposable(() => lumpySphere({ detail: 8, scale: [1, 0.9, 0.95], noise: 0.12, freq: 3.5, seed: 21 }), []);
  const geneGeo = useDisposable(() => lumpySphere({ detail: 5, scale: [0.22, 0.18, 0.2], noise: 0.1, seed: 2 }), []);
  const mats = useDisposable(() => {
    const het = proteinMaterial('#3b5bdb', { roughness: 0.7 });
    const eu = proteinMaterial('#9fd0ff', { roughness: 0.5 });
    const nu = proteinMaterial(PALETTE.nucleolus, { roughness: 0.65 });
    const act = proteinMaterial('#69db7c', { emissive: 0.3 });
    const sil = proteinMaterial('#868e96');
    [het, eu, nu].forEach((m) => (m.clippingPlanes = [plane]));
    return [het, eu, nu, act, sil];
  }, [plane]);
  const mHet = useMemo(() => [mats[0]], [mats]);
  const mEu = useMemo(() => [mats[1]], [mats]);
  const mNu = useMemo(() => [mats[2]], [mats]);
  const mAct = useMemo(() => [mats[3]], [mats]);
  const mSil = useMemo(() => [mats[4]], [mats]);
  // TEM look in step 3: everything greys toward electron density
  useKitHighlight(mHet, 'heterochromatin', { strength: 0.5 });
  useKitHighlight(mEu, 'euchromatin', { strength: 0.6 });
  useKitHighlight(mNu, 'nucleolus', { strength: 0.6 });
  const genes = seg(t, 0.69, 0.69) * 1;
  useKitHighlight(mAct, 'active-gene', { opacity: genes });
  useKitHighlight(mSil, 'silent-gene', { opacity: genes });

  const move = seg(t, 0.72, 0.84);
  const actFrom = new Vector3(-3.0, 1.6, 0.4);
  const actTo = new Vector3(-0.9, 0.6, 0.5);
  const silFrom = new Vector3(1.2, 1.4, 0.4);
  const silTo = new Vector3(2.9, 2.0, 0.3);
  const act = actFrom.clone().lerp(actTo, move);
  const sil = silFrom.clone().lerp(silTo, move);

  return (
    <group>
      <LocalClipping />
      <NucleusShell radius={R} cutZ={CUT} pores={70} poreSize={0.16} lamina={1} laminaN={900} onmId="outer-nuclear-membrane" inmId="inner-nuclear-membrane" poreId="nuclear-pore" laminaId={['nuclear-lamina', 'nucleoskeleton']} />
      {HET.map((h) => (
        <mesh key={h.i} geometry={hetGeo} material={mats[0]} position={h.p.toArray() as V3} scale={h.s} quaternion={undefined} onUpdate={(o) => o.lookAt(0, 0, 0)} />
      ))}
      <mesh geometry={euGeo} material={mats[1]} />
      <mesh geometry={nuGeo} material={mats[2]} position={NUCLEOLUS} />
      <mesh geometry={geneGeo} material={mats[3]} position={act.toArray() as V3} />
      <mesh geometry={geneGeo} material={mats[4]} position={sil.toArray() as V3} />

      <Anchor id="outer-nuclear-membrane" position={[2.2, 3.05, 1.1]} />
      <Anchor id="inner-nuclear-membrane" position={[1.6, 2.9, 1.1]} />
      <Anchor id="nuclear-pore" position={[3.1, 2.4, -0.6]} />
      <Anchor id="nuclear-lamina" position={[-2.6, -2.6, 0.5]} />
      <Anchor id="nucleoskeleton" position={[-3.2, -1.3, 0.6]} />
      <Anchor id="heterochromatin" position={HET[3].p.toArray() as V3} />
      <Anchor id="euchromatin" position={[-1.2, 0.9, 0.2]} />
      <Anchor id="nucleolus" position={NUCLEOLUS} />
      <Anchor id="active-gene" position={act.toArray() as V3} show={genes} />
      <Anchor id="silent-gene" position={sil.toArray() as V3} show={genes} />
    </group>
  );
}
