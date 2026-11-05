/**
 * t7-endomembrane — The endomembrane system (cell overview).
 *
 * World: a cell cut open at the top (plasma membrane bowl, +x = towards the secretory side). Nucleus on the
 * left with a wedge cut away (double envelope visible), rough ER sheets wrapped round it (the first sheet
 * joined to the outer nuclear membrane by necks), smooth ER tubules at their far edge, Golgi stack (cis face
 * towards the ER), endosomes, lysosomes, a phagosome and an autophagosome; mitochondria and peroxisomes are
 * outside the system (they receive no vesicles). Units ≈ 1 µm.
 *
 *  0  overview; vesicles bud and fuse one way (ER → Golgi → plasma membrane / lysosome; PM → endosome)
 *  1  the members light up in turn while traffic continues
 *  2  continuous zoom to the nucleus: the outer nuclear membrane continues into the ER; particles in the
 *     perinuclear space flow through a neck into an ER cisterna (one lumen)
 *  3  one cargo's journey: ER vesicle → Golgi (fuses); secretory vesicle → plasma membrane (fuses, cargo out)
 *  4  outsiders: mitochondria and peroxisomes; vesicles pass them by, their proteins come from the cytosol
 *  5  summary (wide)
 */
import { useMemo } from 'react';
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { SceneProps } from '@/content/types';
import { clamp, prog, seg, vis, type V3 } from '@/engine/anim';
import { Anchor, Flow, PALETTE, useStageCamera, type CamKey } from '@/three/kit';
import { Autophagosome, CellShell, Endosome, GolgiStack, Lysosome, Mitochondrion, Nucleus, Peroxisome, Phagosome, RibosomeDots, Sac, Tubules, sacRibosomes } from './parts/cell';
import { sacMap, varTube, type SacSpec } from './parts/geo';
import { RouteVesicle, loopU, routePoint } from './parts/traffic';
import { useDisposable, membraneMaterial, tintMaterial, useKitHighlight } from '@/three/kit';

export const P = [0, 0.17, 0.34, 0.52, 0.69, 0.86] as const;

const CELL: V3 = [11, 5.4, 8.6];
const NUC: V3 = [-4.4, -0.7, -1.2];
const NR = 2.3;
const NUC_CUT = { phi: Math.PI / 2 + 0.55, half: 0.62 };
const RER_YAW = 0.42;
const GOLGI: V3 = [2.5, -0.5, -0.9];

/** RER sheets wrapped round the nucleus (local frame of the RER group; sphere centre = nucleus centre). */
const SHEETS: SacSpec[] = [
  { a: 2.2, b: 1.2, h: 0.1, n: 4, wrapR: 2.95, wave: 0.05, seed: 1 },
  { a: 2.6, b: 1.35, h: 0.1, n: 4, wrapR: 3.42, wave: 0.06, seed: 2 },
  { a: 2.95, b: 1.5, h: 0.1, n: 4, wrapR: 3.9, wave: 0.06, seed: 3 },
];
/** RER group: at the nucleus, yawed away from the cut, then local (x, y, z) → world (x, z…) so azimuth is horizontal. */
const RER_Q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), RER_YAW).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2));
const toWorld = (local: Vector3) => local.clone().applyQuaternion(RER_Q).add(new Vector3(...NUC));
/** point at radius r, azimuth az, elevation el in the RER frame → world */
const polar = (r: number, az: number, el: number): V3 => toWorld(sacMap({ a: 1, b: 1, h: 0, wrapR: r }, az * r, 0, el * r, new Vector3())).toArray() as V3;

// necks joining the outer nuclear membrane to the first sheet (azimuth, elevation in the RER frame)
const NECKS: [number, number][] = [
  [-0.42, 0.12],
  [0.25, -0.18],
  [0.6, 0.2],
];
const ONM_R = NR * (1 + 0.05 + 0.022);

const SER_PATHS: V3[][] = (() => {
  // tubules leaving the far edge of the outer sheets towards the Golgi side (world coords)
  const out: V3[][] = [];
  const starts: [number, number, number][] = [
    [3.9, 0.66, -0.15],
    [3.9, 0.62, 0.22],
    [3.42, 0.7, 0.05],
  ];
  starts.forEach(([r, az, el], i) => {
    const a = polar(r, az, el);
    const b = polar(r + 0.2, az + 0.22, el + (i - 1) * 0.12);
    out.push([a, b, [b[0] + 0.5, b[1] + 0.3 * (i - 1), b[2] - 0.6], [b[0] + 0.3, b[1] - 0.4, b[2] - 1.3], [b[0] - 0.4, b[1] - 0.2, b[2] - 1.7]]);
  });
  const c = polar(4.1, 0.9, 0);
  out.push([[c[0] - 0.2, c[1] + 0.5, c[2] - 1.1], [c[0] + 0.4, c[1] + 0.1, c[2] - 0.5], [c[0] + 0.1, c[1] - 0.4, c[2] + 0.3], [c[0] - 0.5, c[1] - 0.3, c[2] + 0.6]]);
  return out;
})();

// Golgi orientation: local y (cis → trans) → +x, local x (long) → +y, local z → −z
const GOLGI_Q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(0, 1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, -1)));

const MITO: { pos: V3; rot: V3; len: number }[] = [
  { pos: [-0.6, -2.0, 3.3], rot: [0.2, 0.5, 0.1], len: 2.3 },
  { pos: [5.8, -1.6, -3.6], rot: [0.1, -0.7, 0.2], len: 2.0 },
  { pos: [-7.2, -1.7, 3.0], rot: [0, 1.1, 0.15], len: 2.1 },
];
const PEROX: V3[] = [
  [1.4, -1.0, 3.9],
  [-7.6, -0.4, -2.4],
  [5.0, -0.3, 3.4],
];
const LYSO: V3[] = [
  [4.9, -1.7, 1.3],
  [3.2, -2.2, -3.9],
];
const EARLY: V3 = [7.9, -0.3, 2.3];
const LATE: V3 = [6.4, -1.2, -0.9];
const PHAGO: V3 = [8.1, -1.4, -2.9];
const AUTO: V3 = [0.2, -1.9, -4.3];

// ——— routes (world) ———
const ER_EXIT = polar(4.05, 0.5, 0.05);
const R_ER_GOLGI: V3[] = [ER_EXIT, [ER_EXIT[0] + 1.0, ER_EXIT[1] + 0.25, ER_EXIT[2] + 0.1], [GOLGI[0] - 1.3, GOLGI[1] + 0.15, GOLGI[2] + 0.05], [GOLGI[0] - 0.62, GOLGI[1], GOLGI[2]]];
const R_ER_GOLGI_B: V3[] = [polar(4.05, 0.42, -0.3), [GOLGI[0] - 2.2, GOLGI[1] - 0.5, GOLGI[2] + 0.6], [GOLGI[0] - 0.62, GOLGI[1] - 0.4, GOLGI[2] + 0.4]];
const PM_EXO: V3 = [10.55, -0.4, 2.0];
const R_GOLGI_PM: V3[] = [[GOLGI[0] + 0.62, GOLGI[1] + 0.2, GOLGI[2]], [GOLGI[0] + 2.4, GOLGI[1] + 0.6, GOLGI[2] + 0.7], [8.2, -0.1, 1.6], PM_EXO];
const R_GOLGI_LYSO: V3[] = [[GOLGI[0] + 0.6, GOLGI[1] - 0.5, GOLGI[2] + 0.2], [GOLGI[0] + 1.5, GOLGI[1] - 1.2, GOLGI[2] + 0.9], [LYSO[0][0] - 0.45, LYSO[0][1] + 0.05, LYSO[0][2] - 0.1]];
const R_PM_EARLY: V3[] = [[10.1, 0.4, 3.6], [9.0, 0.2, 3.0], [EARLY[0] + 0.55, EARLY[1], EARLY[2] + 0.2]];
const R_EARLY_LATE: V3[] = [[EARLY[0] - 0.5, EARLY[1] - 0.2, EARLY[2] - 0.3], [7.2, -0.8, 0.7], [LATE[0] + 0.45, LATE[1] + 0.1, LATE[2] + 0.2]];
const R_LATE_LYSO: V3[] = [[LATE[0] - 0.5, LATE[1] - 0.1, LATE[2] + 0.3], [5.6, -1.5, 0.6], [LYSO[0][0] + 0.4, LYSO[0][1], LYSO[0][2]]];
const R_PHAGO_LYSO: V3[] = [[PHAGO[0] - 0.7, PHAGO[1], PHAGO[2] + 0.3], [5.6, -2.1, -3.2], [LYSO[1][0] + 0.45, LYSO[1][1], LYSO[1][2]]];

const LOOPS: { pts: V3[]; rate: number; phase: number; r: number; cargo: string }[] = [
  { pts: R_ER_GOLGI, rate: 7, phase: 0, r: 0.2, cargo: PALETTE.cargo },
  { pts: R_ER_GOLGI_B, rate: 6, phase: 0.5, r: 0.18, cargo: PALETTE.cargo },
  { pts: R_GOLGI_PM, rate: 5, phase: 0.2, r: 0.24, cargo: PALETTE.cargo },
  { pts: R_GOLGI_LYSO, rate: 5.5, phase: 0.65, r: 0.18, cargo: PALETTE.hydrolase },
  { pts: R_PM_EARLY, rate: 6, phase: 0.35, r: 0.18, cargo: '#9fd0ff' },
  { pts: R_EARLY_LATE, rate: 4.5, phase: 0.8, r: 0.2, cargo: '#9fd0ff' },
  { pts: R_LATE_LYSO, rate: 5, phase: 0.1, r: 0.2, cargo: '#9fd0ff' },
  { pts: R_PHAGO_LYSO, rate: 4, phase: 0.45, r: 0.2, cargo: PALETTE.hydrolase },
];

// ——— the highlighted journey of step 3 ———
const J1: [number, number] = [P[3] + 0.012, P[3] + 0.075];
const J2: [number, number] = [P[3] + 0.085, P[3] + 0.155];
const J_OUT: [number, number] = [P[3] + 0.145, P[3] + 0.17];

// ——— lumen continuity flow (RER frame polar coords) ———
const PN_R = NR * 1.025; // middle of the perinuclear space
const FLOW_PTS: V3[] = [
  polar(PN_R, -0.75, 0.1),
  polar(PN_R, -0.6, 0.12),
  polar(PN_R, -0.47, 0.12),
  polar(2.75, -0.43, 0.12),
  polar(2.95, -0.36, 0.1),
  polar(2.95, -0.1, 0.0),
  polar(2.95, 0.2, -0.1),
];

const CAM: CamKey[] = [
  { at: 0, pos: [3.4, 11.8, 14.8], target: [0.4, -1.0, 0], fov: 38 },
  { at: 0.16, pos: [1.6, 10.8, 14.2], target: [0.4, -1.0, 0], fov: 38 },
  { at: 0.19, pos: [-1.5, 13.5, 18.0], target: [0.2, -1.0, 0], fov: 38 },
  { at: 0.33, pos: [-3.0, 13.0, 17.5], target: [0.0, -1.0, 0], fov: 38 },
  // zoom into the nuclear envelope / ER junction
  { at: 0.36, pos: [-2.2, 7.5, 10.5], target: [-2.4, -0.6, 0.2], fov: 36 },
  { at: 0.4, pos: [0.4, 3.3, 5.3], target: [-1.7, -0.4, 0.2], fov: 34 },
  { at: 0.51, pos: [0.9, 3.0, 4.9], target: [-1.6, -0.4, 0.1], fov: 34 },
  // the journey ER → Golgi → PM
  { at: 0.545, pos: [1.6, 6.4, 9.2], target: [0.3, -0.4, -0.2], fov: 36 },
  { at: 0.6, pos: [3.0, 6.8, 9.6], target: [1.6, -0.4, -0.2], fov: 36 },
  { at: 0.68, pos: [7.0, 6.8, 10.0], target: [6.0, -0.3, 0.6], fov: 38 },
  // outsiders
  { at: 0.71, pos: [1.0, 13.0, 17.0], target: [0.0, -1.4, 0.4], fov: 38 },
  { at: 0.85, pos: [-1.5, 12.5, 16.5], target: [0.0, -1.4, 0.4], fov: 38 },
  { at: 0.89, pos: [2.8, 11.8, 14.8], target: [0.4, -1.0, 0], fov: 38 },
  { at: 1, pos: [3.8, 11.4, 14.5], target: [0.4, -1.0, 0], fov: 38 },
];

function Necks({ opacity }: { opacity?: number }) {
  const geos = useDisposable(() => {
    const parts = NECKS.map(([az, el]) => varTube({ points: [polar(ONM_R - 0.06, az, el), polar((ONM_R + 2.85) / 2, az, el), polar(2.9, az, el)], radius: 0.085, capStart: false, capEnd: false, profile: (u) => 1 + 0.9 * (Math.pow(1 - u, 4) + Math.pow(u, 4)) }));
    return parts;
  }, []);
  const mats = useDisposable(() => [membraneMaterial(PALETTE.erMembrane, 0.6), tintMaterial(PALETTE.erLumen, 0.5)], []);
  useKitHighlight(mats, ['er', 'outer-nuclear-membrane'], { opacity, strength: 0.5 });
  return (
    <group>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} material={mats[0]} renderOrder={3} />
      ))}
    </group>
  );
}

export default function EndomembraneScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const ribs = useMemo(() => SHEETS.map((s, i) => sacRibosomes(s, 120 + i * 30, i + 4)), []);

  // step 2: the outer nuclear membrane turns translucent so the shared lumen shows
  const nePeek = seg(t, P[2] + 0.01, P[2] + 0.04) * (1 - seg(t, P[3] - 0.01, P[3] + 0.02));
  const flowOn = vis(t, P[2] + 0.035, P[3] - 0.005, 0.015);

  // journey (step 3)
  const u1 = t < J1[0] ? -1 : prog(t, J1[0], J1[1]);
  const u2 = t < J2[0] ? -1 : prog(t, J2[0], J2[1]);
  const jOn = vis(t, J1[0] - 0.004, J2[1] + 0.01, 0.006);
  const cargoOut = seg(t, J_OUT[0], J_OUT[1]);
  // background traffic thins out during the journey so the highlighted one reads
  const bgTraffic = 1 - 0.7 * vis(t, P[3] + 0.002, P[4], 0.01);
  // step 4: protein import into mitochondria / peroxisomes from the cytosol (no vesicles)
  const importOn = vis(t, P[4] + 0.01, P[5], 0.015);

  return (
    <group>
      <CellShell id="plasma-membrane" size={CELL} cutTheta={0.95} surfaceOpacity={0.2} />

      <Nucleus id="nucleus" envelopeId="outer-nuclear-membrane" position={NUC} radius={NR} cut={NUC_CUT} pores={60} ribosomes={150} opacity={1} />
      <Anchor id="nucleus" position={[NUC[0] + 0.6, NUC[1] + 0.1, NUC[2] + 1.0]} />
      <Anchor id="outer-nuclear-membrane" position={polar(ONM_R, -0.62, 0.32)} />

      {/* rough ER sheets + necks to the outer nuclear membrane + smooth ER tubules */}
      <group position={NUC} quaternion={RER_Q}>
        {SHEETS.map((s, i) => (
          <group key={i}>
            <Sac spec={s} id="er" surfaceOpacity={0.5 + 0.12 * nePeek} />
            <RibosomeDots places={ribs[i]} size={0.055} id="er" />
          </group>
        ))}
      </group>
      <Necks />
      <Tubules id="er" paths={SER_PATHS} radius={0.12} flareStart />
      <Anchor id="er" position={polar(3.42, 0.15, 0.25)} />

      {/* lumen continuity: perinuclear space → neck → ER cisterna */}
      {flowOn > 0.01 && <Flow points={FLOW_PTS} t={t} speed={9} count={18} size={0.045} color="#7ff3e6" opacity={flowOn} glow={1} />}

      {/* Golgi */}
      <group position={GOLGI} quaternion={GOLGI_Q}>
        <GolgiStack id="golgi" size={0.9} vesicles={8} />
      </group>
      <Anchor id="golgi" position={[GOLGI[0] + 0.1, GOLGI[1] + 0.45, GOLGI[2]]} />

      {/* endosomes, lysosomes, phagosome, autophagosome */}
      <Endosome id="endosome" kind="early" position={EARLY} radius={0.55} rotation={[0, 0.6, 0]} />
      <Endosome id="endosome" kind="late" position={LATE} radius={0.55} />
      <Anchor id="endosome" position={EARLY} />
      {LYSO.map((l, i) => (
        <Lysosome key={i} id="lysosome" position={l} radius={0.45} seed={i + 1} />
      ))}
      <Anchor id="lysosome" position={LYSO[0]} />
      <Phagosome id="phagosome" position={PHAGO} radius={0.85} />
      <Anchor id="phagosome" position={PHAGO} />
      <Autophagosome id="autophagosome" position={AUTO} radius={0.75} />
      <Anchor id="autophagosome" position={AUTO} />

      {/* outsiders */}
      {MITO.map((m, i) => (
        <Mitochondrion key={i} id="mitochondrion" position={m.pos} rotation={m.rot} length={m.len} radius={0.48} />
      ))}
      <Anchor id="mitochondrion" position={MITO[0].pos} />
      {PEROX.map((p, i) => (
        <Peroxisome key={i} id="peroxisome" position={p} radius={0.36} />
      ))}
      <Anchor id="peroxisome" position={PEROX[0]} />
      {importOn > 0.01 && (
        <>
          <Flow points={[[-2.6, -0.6, 4.6], [-1.6, -1.1, 4.0], [-0.9, -1.8, 3.5]]} t={t} speed={6} count={7} size={0.06} color={PALETTE.polypeptide} opacity={importOn} />
          <Flow points={[[2.8, -0.3, 4.9], [2.0, -0.7, 4.3], [1.5, -0.95, 3.95]]} t={t} speed={5} count={6} size={0.06} color={PALETTE.polypeptide} opacity={importOn} />
        </>
      )}

      {/* background traffic (unidirectional loops) */}
      {LOOPS.map((l, i) => (
        <RouteVesicle key={i} points={l.pts} u={loopU(t, l.rate, l.phase)} radius={l.r} cargo={l.cargo} id="transport-vesicle" opacity={bgTraffic} />
      ))}
      <Anchor id="transport-vesicle" position={routePoint(R_GOLGI_PM, clamp(loopU(t, 5, 0.2), 0.2, 0.8))} show={jOn > 0.5 ? 0 : 1} />

      {/* step 3: one cargo's journey */}
      {jOn > 0.01 && (
        <>
          <RouteVesicle points={R_ER_GOLGI} u={u1} radius={0.24} cargo={PALETTE.polypeptide} cargoCount={6} id="transport-vesicle" glow={0.8} />
          <RouteVesicle points={R_GOLGI_PM} u={u2} radius={0.27} cargo={PALETTE.polypeptide} cargoCount={6} id="transport-vesicle" glow={0.8} />
          <Anchor id="transport-vesicle" position={u2 >= 0 ? routePoint(R_GOLGI_PM, clamp(u2, 0, 0.9)) : routePoint(R_ER_GOLGI, clamp(u1, 0, 1))} show={jOn * (u2 > 0.92 ? 0 : 1)} />
          {cargoOut > 0.01 && <Flow points={[PM_EXO, [PM_EXO[0] + 0.9, PM_EXO[1] + 0.2, PM_EXO[2] + 0.4], [PM_EXO[0] + 1.8, PM_EXO[1] + 0.4, PM_EXO[2] + 0.9]]} t={t * 0.6} speed={8} count={6} size={0.07} color={PALETTE.polypeptide} opacity={cargoOut * (1 - seg(t, P[4] - 0.01, P[4] + 0.01))} />}
        </>
      )}
      <Anchor id="plasma-membrane" position={[10.5, 0.6, -1.5]} />
    </group>
  );
}

