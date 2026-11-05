/**
 * t9-pathways — The two directions of vesicular traffic in a polarised cell (cell scale).
 *
 * World: a slab of cell between the apical plasma membrane (y = +5) and the basolateral one (y = −5). Nucleus and
 * ER on the left, Golgi stack (kit: cis at −y, TGN on top) left of centre, early endosome under the apical membrane
 * (x ≈ 3), lysosome on the right. Vesicles run on fixed routes, each route active only in its own step:
 * endocytosis (apical → EE), EE → lysosome, recycling (EE → apical), transcytosis (EE → basolateral), retrograde
 * (EE → TGN → ER), anterograde/constitutive (ER → Golgi → membranes) and regulated secretion (a stored pool that
 * fuses all at once when Ca²⁺ rises).
 */
import type { SceneProps } from '@/content/types';
import { lerp, lerp3, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, EdgeTag, Endosome, ERSheet, GolgiStack, Ion, Lysosome, MembraneSheet, Nucleus, PALETTE, Vesicle, useStageCamera, type CamKey } from '@/three/kit';
import { along, curve, loop } from '../t8/parts/stack';

export const P = [0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.86] as const;

const AP = 5;
const BL = -5;
const GOLGI: V3 = [-3.2, -0.4, -0.5];
const TGN: V3 = [-3.2, 0.5, -0.3];
const CIS: V3 = [-3.2, -1.3, -0.3];
const EE: V3 = [3.0, 2.4, 0];
const LYSO: V3 = [6.6, -0.6, 0];
const ER: V3 = [-7.0, -2.6, -1];
const CARGO = '#ffa94d';
const SEC = PALETTE.signalPeptide;

type Route = { c: ReturnType<typeof curve>; a: number; b: number; n: number; speed: number; coat?: 'clathrin' | 'copi' | 'copii'; cargo: string; id: string | string[]; color?: string };
const R = (pts: V3[], a: number, b: number, rest: Partial<Route> & { cargo: string; id: string | string[] }): Route => ({ c: curve(pts), a, b, n: 3, speed: 14, ...rest });

const ROUTES: Route[] = [
  // endocytic: apical membrane → early endosome
  R([[1.4, AP - 0.3, 0.3], [1.9, 4.0, 0.6], [EE[0] - 0.7, EE[1] + 0.6, 0.3]], 0.02, 0.56, { coat: 'clathrin', cargo: CARGO, id: 'transport-vesicle' }),
  // exocytic (constitutive) preview in step 0, and in step 5
  R([[TGN[0] + 0.6, TGN[1] + 0.4, 0], [-1.6, 3.0, 0.6], [-0.6, AP - 0.3, 0.3]], 0.02, 0.13, { cargo: SEC, id: 'secretory-vesicle' }),
  // EE → lysosome
  R([[EE[0] + 0.8, EE[1] - 0.6, 0.2], [5.4, 1.2, 0.6], [LYSO[0] - 0.4, LYSO[1] + 0.6, 0.2]], 0.29, 0.42, { cargo: CARGO, id: 'transport-vesicle' }),
  // recycling: EE → same (apical) membrane
  R([[EE[0] + 0.7, EE[1] + 0.6, 0.2], [4.6, 3.9, 0.6], [5.2, AP - 0.3, 0.3]], 0.43, 0.56, { cargo: '#69db7c', id: 'transport-vesicle', color: PALETTE.recyclingEndosome }),
  // transcytosis: EE → basolateral membrane
  R([[EE[0], EE[1] - 0.9, 0.2], [3.6, -1.0, 0.8], [3.2, BL + 0.3, 0.3]], 0.47, 0.56, { cargo: '#69db7c', id: 'transport-vesicle', color: PALETTE.recyclingEndosome }),
  // retrograde: EE → TGN → ER
  R([[EE[0] - 0.9, EE[1] - 0.2, 0.2], [0.0, 2.0, 0.6], [TGN[0] + 1.2, TGN[1] + 0.3, 0]], 0.57, 0.7, { cargo: CARGO, id: 'retrograde-vesicle' }),
  R([[CIS[0] - 1.2, CIS[1] - 0.2, 0], [-5.4, -1.3, 0.5], [ER[0] + 1.0, ER[1] + 0.35, 0]], 0.6, 0.7, { coat: 'copi', cargo: CARGO, id: 'retrograde-vesicle' }),
  // anterograde ER → cis Golgi, then constitutive secretion TGN → apical and basolateral
  R([[ER[0] + 1.6, ER[1] + 0.35, 0.3], [-5.0, -2.3, 0.7], [CIS[0] - 0.3, CIS[1] - 0.3, 0.3]], 0.71, 0.86, { coat: 'copii', cargo: SEC, id: 'transport-vesicle' }),
  R([[TGN[0] + 0.6, TGN[1] + 0.4, 0], [-1.6, 3.0, 0.6], [-0.6, AP - 0.3, 0.3]], 0.72, 0.86, { cargo: SEC, id: 'secretory-vesicle' }),
  R([[TGN[0] + 1.6, TGN[1] - 0.2, 0], [-0.6, -2.4, 0.6], [-1.4, BL + 0.3, 0.3]], 0.72, 0.86, { cargo: SEC, id: 'secretory-vesicle' }),
];

/** regulated secretion: stored vesicles under the basolateral membrane */
const STORE: V3[] = Array.from({ length: 16 }, (_, i) => {
  const r = (k: number) => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
  return [lerp(0.4, 6.0, r(1)), lerp(-3.9, -2.2, r(2)), lerp(-0.8, 1.0, r(3))];
});
const STORE_T = [0.74, 0.88] as const;
const CA = [0.9, 0.93] as const;
const RELEASE = [0.935, 0.975] as const;

const CAM: CamKey[] = [
  { at: 0, pos: [-0.5, 0.6, 19.5], target: [-0.5, 0, 0], fov: 40 },
  { at: 0.12, pos: [-0.5, 0.6, 19.0], target: [-0.5, 0, 0], fov: 40 },
  { at: 0.17, pos: [2.6, 3.0, 11.5], target: [2.6, 3.0, 0], fov: 40 },
  { at: 0.27, pos: [2.6, 3.0, 11.2], target: [2.6, 3.0, 0], fov: 40 },
  { at: 0.31, pos: [4.6, 1.0, 11.5], target: [4.6, 0.9, 0], fov: 40 },
  { at: 0.41, pos: [4.6, 1.0, 11.2], target: [4.6, 0.9, 0], fov: 40 },
  { at: 0.45, pos: [3.4, 0.2, 15.5], target: [3.4, 0, 0], fov: 40 },
  { at: 0.55, pos: [3.4, 0.2, 15.2], target: [3.4, 0, 0], fov: 40 },
  { at: 0.59, pos: [-1.6, 0.6, 14.5], target: [-1.6, 0.2, 0], fov: 40 },
  { at: 0.69, pos: [-1.6, 0.6, 14.2], target: [-1.6, 0.2, 0], fov: 40 },
  { at: 0.73, pos: [-1.2, 0.2, 18.0], target: [-1.2, 0, 0], fov: 40 },
  { at: 0.85, pos: [-1.2, 0.2, 17.6], target: [-1.2, 0, 0], fov: 40 },
  { at: 0.89, pos: [3.0, -1.6, 11.5], target: [3.0, -2.6, 0], fov: 40 },
  { at: 1, pos: [3.0, -1.6, 11.2], target: [3.0, -2.6, 0], fov: 40 },
];

export default function PathwaysScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const lysoGlow = 0.5 * vis(t, 0.3, 0.42, 0.02);
  const eeGlow = 0.3 * vis(t, 0.15, 0.56, 0.02);
  const storeN = Math.round(STORE.length * smooth(seg(t, STORE_T[0], STORE_T[1])));
  const ca = vis(t, CA[0], 2, 0.012);
  const rel = smooth(seg(t, RELEASE[0], RELEASE[1]));

  return (
    <group>
      <EdgeTag side="top" text="APICAL DOMAIN" />
      <EdgeTag side="bottom" text="BASOLATERAL DOMAIN" />
      <MembraneSheet id="plasma-membrane" shape="plane" width={24} depth={8} position={[0, AP, -2]} color={PALETTE.plasmaMembrane} thickness={0.14} />
      <MembraneSheet id="plasma-membrane" shape="plane" width={24} depth={8} position={[0, BL, -2]} color={PALETTE.plasmaMembrane} thickness={0.14} />
      <Anchor id="plasma-membrane" position={[-6.5, AP, 0.6]} />

      <Nucleus id="nucleus" position={[-10.6, 2.0, -3.0]} radius={2.2} pores={40} />
      <ERSheet id="er" position={ER} width={5} depth={4} ribosomes={40} />
      <Anchor id="er" position={[ER[0] - 1.6, ER[1] - 0.3, 0.8]} />
      <GolgiStack position={GOLGI} n={5} ids={['golgi', 'golgi', 'golgi', 'golgi', 'tgn']} vesicles={4} />
      <Anchor id="golgi" position={[GOLGI[0] - 1.8, GOLGI[1] - 0.2, 0.6]} />
      <Anchor id="tgn" position={[TGN[0] + 0.4, TGN[1] + 0.35, 0.8]} />

      <Endosome id="early-endosome" kind="early" radius={1.0} position={EE} glow={eeGlow} />
      <Anchor id="early-endosome" position={[EE[0] - 0.5, EE[1] - 0.8, 0.8]} />
      <Lysosome id="lysosome" radius={0.9} position={LYSO} glow={lysoGlow} />
      <Anchor id="lysosome" position={[LYSO[0] + 0.5, LYSO[1] - 0.7, 0.6]} />

      {ROUTES.map((r, ri) => {
        const o = vis(t, r.a, r.b, 0.015);
        if (o <= 0.01) return null;
        return Array.from({ length: r.n }, (_, i) => {
          const u = loop((t - r.a) * r.speed, i, r.n);
          const a = along(r.c, u, 0.12);
          const shed = r.coat === 'clathrin' || r.coat === 'copi' || r.coat === 'copii' ? 1 - seg(u, 0.25, 0.45) : 0;
          return (
            <Vesicle key={`${ri}-${i}`} id={r.id} radius={0.3} position={a.pos} scale={a.s} coat={r.coat ?? null} coatAmount={shed} color={r.color} lumenColor={r.color ?? PALETTE.golgiLumen} cargo={{ count: 3, color: r.cargo, seed: ri + i }} opacity={o} />
          );
        });
      })}
      <Anchor id="transport-vesicle" position={ROUTES[0].c.getPointAt(0.5).toArray() as V3} show={vis(t, 0.14, 0.56, 0.02)} />
      <Anchor id="retrograde-vesicle" position={ROUTES[5].c.getPointAt(0.5).toArray() as V3} show={vis(t, 0.57, 0.7, 0.02)} />
      <Anchor id="secretory-vesicle" position={ROUTES[8].c.getPointAt(0.55).toArray() as V3} show={vis(t, 0.71, 0.86, 0.02)} />

      {/* regulated secretion: stored vesicles, then a Ca²⁺ rise releases them all at once */}
      {STORE.slice(0, storeN).map((p, i) => {
        const q = lerp3(p, [p[0], BL + 0.25, p[2]], rel);
        return <Vesicle key={i} id="secretory-vesicle" radius={0.34} position={q} scale={1 - 0.7 * smooth(seg(t, RELEASE[1] - 0.012, RELEASE[1] + 0.012))} color={PALETTE.golgiMembrane} lumenColor="#845ef7" cargo={{ count: 5, color: '#5f3dc4', seed: i }} glow={0.4 * ca * (1 - rel)} />;
      })}
      <Ion kind="Ca" count={40} region={{ center: [3.2, -3.0, 0.2], size: [7, 2.4, 2] }} t={t} seed={5} opacity={ca} id="calcium" />
      <Anchor id="calcium" position={[0.2, -3.6, 1.0]} show={ca} />
      <Anchor id="mast-cell" position={[5.4, -2.0, 0.8]} show={vis(t, 0.87, 2, 0.02)} />
      <Anchor id="secretory-vesicle" position={STORE[0]} show={vis(t, 0.86, RELEASE[0], 0.02)} />
    </group>
  );
}
