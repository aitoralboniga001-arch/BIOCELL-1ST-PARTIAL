/**
 * t6-linc — The LINC complex: cytoskeleton → nesprin (ONM) → SUN (INM) → lamins → chromatin.
 *
 * World: a slab of nuclear envelope seen edge-on. Outer nuclear membrane at y = +1.4, inner at y = −1.4 (the
 * perinuclear space between), cytoplasm above, nucleoplasm below with the lamina meshwork (y ≈ −2.5) and
 * heterochromatin attached under it. Three LINC complexes at x = −4 / 0 / +4 hold an actin filament, a microtubule
 * and an intermediate filament respectively.
 *
 *  0  the cytoskeleton is pulled: the pull travels into the nucleus and the chromatin shifts
 *  1  the LINC complexes: bridges across both membranes of the envelope
 *  2  nesprins (KASH) cross the ONM and grip actin, microtubules and intermediate filaments
 *  3  SUN proteins cross the INM, bind the KASH end of the nesprins in the perinuclear space and the lamins
 *  4  the whole chain lights up in order as the cytoskeleton is pulled again
 */
import { useMemo } from 'react';
import { Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { seg, smooth, vis, type V3 } from '@/engine/anim';
import { Actin, Anchor, Bilayer, EdgeTag, IntermediateFilament, LumenTint, Microtubule, PALETTE, Protein, proteinMaterial, useDisposable, useKitHighlight, useStageCamera, type CamKey } from '@/three/kit';
import { Capsule } from '../t7/parts/molecules';
import { threadGeometry } from './parts/nucleus';
import { DynTube, PathBuf, staticTubePath, tubeGeometry } from './parts/tube';

export const P = [0, 0.2, 0.4, 0.6, 0.8] as const;

const COL = { nesprin: '#38d9a9', sun: '#12b886', lamin: '#b48ead', chromatin: '#3b5bdb', linc: '#20c997' };
const ONM = 1.4;
const INM = -1.4;
const LAMINA_Y = -2.55;
const XS = [-4, 0, 4];
const Z = 0.3;
const T = {
  pull1: [0.04, 0.17],
  grip: [0.43, 0.5],
  bind: [0.64, 0.7],
  pull2: [0.83, 0.98],
} as const;

const tension = (t: number) => Math.sin(Math.PI * seg(t, T.pull1[0], T.pull1[1])) + Math.sin(Math.PI * seg(t, T.pull2[0], T.pull2[1]));

/** nesprin path: from the filament it holds, down through the ONM, KASH end in the perinuclear space */
const nesprinPts = (x: number, top: number): V3[] => [
  [x - 0.5, top, Z],
  [x - 0.3, top - 0.9, Z + 0.05],
  [x - 0.05, 2.6, Z],
  [x, ONM, Z],
  [x, 0.25, Z],
];
const TOPS = [4.75, 5.05, 4.7];

const MATRIX_PATHS: V3[][] = Array.from({ length: 18 }, (_, i) => {
  const horizontal = i < 9;
  return Array.from({ length: 10 }, (_, k) =>
    horizontal ? ([-10 + k * 2.2, LAMINA_Y + 0.08 * Math.sin(i * 3 + k), -3 + (i % 9) * 0.6 + 0.12 * Math.sin(k * 1.7 + i)] as V3) : ([-9 + (i - 9) * 2.2 + 0.25 * Math.sin(k + i), LAMINA_Y + 0.08 * Math.sin(k * 2 + i), -3.2 + k * 0.55] as V3),
  );
});

const CAM: CamKey[] = [
  { at: 0, pos: [0.6, 1.2, 17.0], target: [0, 0.6, 0], fov: 40 },
  { at: 0.18, pos: [0.5, 1.1, 16.6], target: [0, 0.6, 0], fov: 40 },
  { at: 0.24, pos: [2.2, 1.4, 13.4], target: [0.4, 0.8, 0], fov: 40 },
  { at: 0.38, pos: [2.0, 1.4, 13.2], target: [0.4, 0.8, 0], fov: 40 },
  { at: 0.44, pos: [1.0, 4.4, 10.6], target: [0, 3.2, 0], fov: 40 },
  { at: 0.58, pos: [1.0, 4.2, 10.4], target: [0, 3.1, 0], fov: 40 },
  { at: 0.64, pos: [1.6, -1.4, 9.4], target: [0.3, -1.0, 0], fov: 40 },
  { at: 0.78, pos: [1.4, -1.4, 9.2], target: [0.3, -1.0, 0], fov: 40 },
  { at: 0.85, pos: [0.8, 1.0, 16.4], target: [0, 0.6, 0], fov: 40 },
  { at: 1, pos: [0.6, 1.0, 16.8], target: [0, 0.6, 0], fov: 40 },
];

const CH_N = 160;
function chromatinPath(t: number, buf: PathBuf, v: Vector3) {
  const k = tension(t);
  buf.clear();
  for (let i = 0; i < CH_N; i++) {
    const u = i / (CH_N - 1);
    const x = -9.5 + 19 * u;
    let pull = 0;
    for (const c of XS) pull += Math.exp(-(((x - c) / 1.2) ** 2));
    v.set(x + 0.35 * k * pull, -3.25 - 0.45 * Math.sin(u * 23) - 0.25 * Math.sin(u * 51) + 0.45 * k * pull, 0.3 * Math.sin(u * 37) + 0.2);
    buf.pushV(v);
  }
}

export default function LincScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const buf = useMemo(() => new PathBuf(CH_N), []);
  const v = useMemo(() => new Vector3(), []);
  const mats = useDisposable(() => [proteinMaterial(COL.lamin, { roughness: 0.6 }), proteinMaterial(COL.chromatin, { roughness: 0.6 }), proteinMaterial(COL.nesprin, { roughness: 0.5 })], []);
  const laminaGeo = useDisposable(() => threadGeometry(MATRIX_PATHS, 0.045, 8, 6), []);
  const ten = tension(t);
  const shift = 0.45 * ten;
  // the chain lights up in order during the last pull
  const wave = (k: number) => vis(t, T.pull2[0] + k * 0.025, T.pull2[0] + k * 0.025 + 0.06, 0.015) * 0.8;
  const grip = vis(t, T.grip[0], T.grip[1], 0.015);
  const bind = vis(t, T.bind[0], T.bind[1], 0.015);
  const laminaMats = useMemo(() => [mats[0]], [mats]);
  const nesMats = useMemo(() => [mats[2]], [mats]);
  useKitHighlight(laminaMats, ['nuclear-lamina', 'lamin'], { glow: wave(3) + bind * 0.4 });
  useKitHighlight(nesMats, ['nesprin', 'linc-complex'], { glow: wave(1) + grip * 0.5 });
  const nesGeos = useDisposable(() => XS.map((x, k) => tubeGeometry(staticTubePath(nesprinPts(x, TOPS[k]), 60), 60, 0.11, 10)), []);
  chromatinPath(t, buf, v);

  const actinPts: V3[] = [
    [-9.6 + shift, 4.95, 0.2],
    [-6.2 + shift, 5.05, 0.3],
    [-4.5 + shift, 4.95, Z],
    [-1.6 + shift, 5.1, 0],
  ];
  const mtPts: V3[] = [
    [-2.6 + shift, 5.5, -0.5],
    [-0.5 + shift, 5.3, Z],
    [2.4 + shift, 5.6, -0.4],
  ];
  const ifPts: V3[] = [
    [1.6 + shift, 4.8, 0.7],
    [3.5 + shift, 4.9, Z],
    [6.4 + shift, 4.85, 0.0],
    [9.6 + shift, 5.1, -0.2],
  ];

  return (
    <group>
      <EdgeTag side="top" text="CYTOPLASM" />
      <EdgeTag side="bottom" text="NUCLEOPLASM" />
      <Bilayer id={['outer-nuclear-membrane', 'nucleus']} width={22} depth={7} position={[0, ONM, -3.0]} holes={XS.map((x) => ({ x, z: Z + 3.0, r: 0.28 }))} seed={3} />
      <Bilayer id={['inner-nuclear-membrane', 'nucleus']} width={22} depth={7} position={[0, INM, -3.0]} holes={XS.map((x) => ({ x, z: Z + 3.0, r: 0.42 }))} seed={6} />
      <LumenTint box={[-30, 30, 0.9, -0.9, -30, 30]} color={PALETTE.erLumen} strength={0.12} />
      <LumenTint box={[-30, 30, -1.9, -26, -30, 30]} color={PALETTE.nucleoplasm} strength={0.3} />
      <Anchor id="outer-nuclear-membrane" position={[-7.0, ONM + 0.4, 0.4]} />
      <Anchor id="inner-nuclear-membrane" position={[-7.0, INM - 0.4, 0.4]} />
      <Anchor id="nucleus" position={[7.6, -3.9, 0.2]} />

      {/* cytoskeleton (moves with the pull) */}
      <Actin id="actin-filament" points={actinPts} glow={wave(0) + grip * 0.4} />
      <Microtubule id="microtubule" points={mtPts} glow={wave(0) + grip * 0.4} />
      <IntermediateFilament id="intermediate-filament" points={ifPts} glow={wave(0) + grip * 0.4} />
      <Anchor id="actin-filament" position={[-2.6 + shift, 5.05, 0.15]} />
      <Anchor id="microtubule" position={[1.4 + shift, 5.45, -0.1]} />
      <Anchor id="intermediate-filament" position={[2.4 + shift, 4.85, 0.6]} />

      {/* LINC complexes: nesprin (ONM) + SUN trimer (INM) */}
      {XS.map((x, k) => (
        <group key={k}>
          <group position={[shift * 0.25 * 0, 0, 0]}>
            <mesh geometry={nesGeos[k]} material={mats[2]} />
            {/* spectrin repeats along the cytoplasmic part */}
            {[0.15, 0.35, 0.55].map((u, j) => {
              const pts = nesprinPts(x, TOPS[k]);
              const a = pts[0];
              const b = pts[2];
              return (
                <mesh key={j} position={[a[0] + (b[0] - a[0]) * u + 0.1, a[1] + (b[1] - a[1]) * u, Z + 0.05]} material={mats[2]}>
                  <sphereGeometry args={[0.18, 14, 10]} />
                </mesh>
              );
            })}
          </group>
          {/* SUN trimer: N-terminus on the lamina, through the INM, coiled-coil up to the KASH end */}
          {[-0.14, 0, 0.14].map((dx, j) => (
            <Capsule key={j} id={['sun', 'linc-complex']} a={[x + dx, LAMINA_Y + 0.2, Z + (j - 1) * 0.08]} b={[x + dx * 0.4, 0.05, Z]} r={0.07} color={COL.sun} glow={wave(2) + bind * 0.5} />
          ))}
          <Protein id={['sun', 'linc-complex']} shape="blob" color={COL.sun} size={0.42} seed={7 + k} position={[x, 0.05, Z]} glow={wave(2) + bind * 0.6} />
          <Protein id={['sun', 'lamin']} shape="blob" color={COL.sun} size={0.38} seed={11 + k} position={[x, LAMINA_Y + 0.15, Z]} glow={wave(2) + bind * 0.4} />
        </group>
      ))}
      <Anchor id="linc-complex" position={[XS[1] + 0.3, 0.3, Z + 0.2]} />
      <Anchor id="nesprin" position={[XS[2] - 0.15, 2.6, Z + 0.15]} />
      <Anchor id="sun" position={[XS[0] + 0.15, -0.6, Z + 0.15]} />

      {/* lamina + chromatin attached to it */}
      <mesh geometry={laminaGeo} material={mats[0]} />
      <Anchor id="nuclear-lamina" position={[-6.0, LAMINA_Y, 1.2]} />
      <Anchor id="lamin" position={[XS[2] + 1.1, LAMINA_Y, 0.9]} />
      <DynTube path={buf.a} n={CH_N} cap={CH_N} radius={0.2} material={mats[1]} id="chromatin" glow={wave(4)} />
      <Anchor id="chromatin" position={[-5.0 + 0.35 * ten * 0, -3.4, 0.4]} />
    </group>
  );
}
