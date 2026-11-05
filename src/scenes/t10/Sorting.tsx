/**
 * t10-sorting — The early endosome as a sorting station: recycling, degradation, retrograde, transcytosis.
 *
 * World: a polarised cell seen in section — plasma membrane on top (y = 5, apical), basolateral membrane at the
 * bottom (y = −7). The early endosome (E) sits under the surface; the recycling endosome is up-left, the late
 * endosome and a lysosome down-right, the Golgi and the ER down-left. Each fate is a looping stream of vesicles
 * along a fixed curve; the immunogold close-up shows receptors (small gold) gathering in the tubule while ligands
 * (large gold) stay in the vacuole after the pH drop.
 */
import type { SceneProps } from '@/content/types';
import { lerp, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, EdgeTag, Endosome, ERSheet, GolgiStack, Ion, Lysosome, MembraneSheet, PALETTE, Protein, Vesicle, useStageCamera, type CamKey } from '@/three/kit';
import { Capsule } from '../t7/parts/molecules';
import { along, curve, loop } from '../t8/parts/stack';
import type { CatmullRomCurve3 } from 'three';

export const P = [0, 0.14, 0.28, 0.43, 0.57, 0.71, 0.86] as const;

const E: V3 = [0, 1.2, 0];
const ER_ = 1.1;
const RE: V3 = [-4.6, 3.0, 0];
const LE: V3 = [3.8, -2.6, 0];
const LY: V3 = [6.8, -4.7, 0];
const GO: V3 = [-6, -3.4, 0];
const ERP: V3 = [-11, -5.7, 0];
const TOP = 5;
const BOT = -7;
const REC = '#4dabf7';
const LIG = '#ff922b';
const LDL = '#ffd43b';
const GOLD = '#f2c94c';
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** tubule of the early endosome pointing towards the recycling endosome */
const TUB_DIR: V3 = [-0.86, 0.5, 0];
const TUB0 = add(E, [TUB_DIR[0] * ER_ * 0.85, TUB_DIR[1] * ER_ * 0.85, 0]);
const TUB1 = add(E, [TUB_DIR[0] * 2.9, TUB_DIR[1] * 2.9, 0]);

const IN = [-0.6, 0.9, 2.3].map((x, i) => curve([[x, TOP - 0.2, 0.3], [x * 0.6 + 0.2, TOP - 1.6, 0.6 + i * 0.1], add(E, [x * 0.25, 0.9, 0.3])]));
const REC1 = curve([TUB1, [-3.3, 2.7, 0.6], add(RE, [0.7, -0.1, 0.2])]);
const REC2 = curve([add(RE, [-0.2, 0.6, 0.2]), [-5.4, 3.9, 0.6], [-5.8, TOP - 0.25, 0.3]]);
const DEG = curve([add(E, [0.9, -0.7, 0.2]), [2.3, -1.0, 0.7], add(LE, [-0.9, 0.5, 0.2])]);
const RETRO = curve([add(E, [-0.8, -0.8, 0.2]), [-2.8, -1.4, 0.7], [-4.8, -2.2, 0.5], add(GO, [0.8, 0.9, 0.3])]);
const COPI = curve([add(GO, [-0.9, -0.8, 0.3]), [-8.4, -4.6, 0.7], add(ERP, [1.2, 0.35, 0.3])]);
const TR_IN = curve([[3.2, TOP - 0.2, 0.3], [2.6, 3.4, 0.7], add(E, [0.9, 0.5, 0.3])]);
const TR_OUT = curve([add(E, [0.4, -1.0, 0.3]), [1.4, -3.4, 0.8], [1.0, -5.4, 0.6], [0.6, BOT + 0.25, 0.3]]);
const LY_IN = curve([add(LE, [0.8, -0.5, 0.2]), [5.6, -3.6, 0.6], add(LY, [-0.6, 0.4, 0.2])]);

const ROUTES: { c: CatmullRomCurve3; color: string }[] = [
  { c: REC1, color: REC },
  { c: REC2, color: REC },
  { c: DEG, color: PALETTE.lysosome },
  { c: RETRO, color: PALETTE.golgiMembrane },
  { c: TR_OUT, color: LDL },
];

/** receptor–ligand pairs in the early endosome (close-up): bound → separated */
const PAIRS = Array.from({ length: 9 }, (_, i) => {
  const a = (i / 9) * Math.PI * 2 + 0.3;
  const z = Math.sin(i * 2.3) * 0.35;
  const k = i / 8;
  return {
    mem: [Math.cos(a) * ER_ * 0.92, Math.sin(a) * ER_ * 0.92, z + 0.25] as V3,
    tub: add([TUB_DIR[0] * lerp(1.1, 2.6, k), TUB_DIR[1] * lerp(1.1, 2.6, k), 0.3], [0.12 * TUB_DIR[1] * (i % 2 ? 1 : -1), -0.12 * TUB_DIR[0] * (i % 2 ? 1 : -1), 0]) as V3,
    free: [Math.cos(a * 1.7) * 0.4, Math.sin(a * 1.3) * 0.35, 0.35 + Math.sin(i) * 0.15] as V3,
  };
});

const CAM: CamKey[] = [
  { at: 0, pos: [-1.5, -0.6, 23], target: [-1.5, -0.8, 0], fov: 40 },
  { at: 0.11, pos: [-1.5, -0.6, 22.5], target: [-1.5, -0.8, 0], fov: 40 },
  { at: 0.16, pos: [-2.4, 2.6, 12], target: [-2.4, 2.4, 0], fov: 40 },
  { at: 0.26, pos: [-2.4, 2.6, 11.6], target: [-2.4, 2.4, 0], fov: 40 },
  { at: 0.31, pos: [-0.6, 1.8, 6.6], target: [-0.6, 1.6, 0], fov: 40 },
  { at: 0.41, pos: [-0.6, 1.8, 6.4], target: [-0.6, 1.6, 0], fov: 40 },
  { at: 0.46, pos: [3.6, -1.6, 12.5], target: [3.6, -1.8, 0], fov: 40 },
  { at: 0.55, pos: [3.6, -1.6, 12.2], target: [3.6, -1.8, 0], fov: 40 },
  { at: 0.6, pos: [-5.2, -2.0, 15], target: [-5.2, -2.0, 0], fov: 40 },
  { at: 0.69, pos: [-5.2, -2.0, 14.6], target: [-5.2, -2.0, 0], fov: 40 },
  { at: 0.74, pos: [0.8, -0.8, 19], target: [0.8, -1.0, 0], fov: 40 },
  { at: 0.84, pos: [0.8, -0.8, 18.6], target: [0.8, -1.0, 0], fov: 40 },
  { at: 0.89, pos: [1.2, -0.4, 20], target: [1.2, -0.6, 0], fov: 40 },
  { at: 1, pos: [1.2, -0.4, 19.6], target: [1.2, -0.6, 0], fov: 40 },
];

function Gold({ position, r, o }: { position: V3; r: number; o: number }) {
  return (
    <mesh position={position} visible={o > 0.01}>
      <sphereGeometry args={[r, 12, 10]} />
      <meshStandardMaterial color={GOLD} metalness={0.85} roughness={0.25} emissive="#7a5a00" emissiveIntensity={0.5} transparent opacity={o} />
    </mesh>
  );
}

/** a looping stream of vesicles along a curve */
function Stream({ c, t, speed, n, o, id, color, cargo, radius = 0.28, seed = 0 }: { c: CatmullRomCurve3; t: number; speed: number; n: number; o: number; id: string; color: string; cargo: { count: number; color: string; kind?: 'soluble' | 'membrane' }; radius?: number; seed?: number }) {
  if (o < 0.01) return null;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = along(c, loop(t * speed, i, n), 0.12);
        return <Vesicle key={i} id={id} radius={radius} position={a.pos} scale={a.s} color={color} lumenColor={color} cargo={{ ...cargo, seed: seed + i }} opacity={o} />;
      })}
    </>
  );
}

export default function SortingScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const either = (...w: [number, number][]) => Math.max(...w.map(([a, b]) => vis(t, a, b, 0.02)));
  const s1 = vis(t, -1, 0.14, 0.02);
  const inO = either([-1, 0.28], [0.86, 2]);
  const recO = either([0.14, 0.28], [0.86, 2]);
  const degO = either([0.43, 0.57], [0.86, 2]);
  const retO = vis(t, 0.57, 0.71, 0.02);
  const trO = vis(t, 0.71, 0.86, 0.02);
  const goldO = vis(t, 0.28, 0.43, 0.02);
  const sep = smooth(seg(t, 0.32, 0.4));
  const ph = either([0.3, 0.43], [0.86, 2]);
  // lysosome A fuses with the late endosome during degradation; a fresh one fades back in afterwards
  const fuse = smooth(seg(t, 0.49, 0.555));
  const lyA = t < 0.57 ? 1 - seg(t, 0.53, 0.56) : smooth(seg(t, 0.58, 0.62));
  const lyPos: V3 = t < 0.57 ? [lerp(LY[0], LE[0] + 0.7, fuse), lerp(LY[1], LE[1] - 0.4, fuse), 0] : LY;
  const step3 = 0.28 <= t && t < 0.43;

  return (
    <group>
      <EdgeTag side="top" text={trO > 0.5 ? 'APICAL · gut lumen' : 'EXTRACELLULAR SPACE'} />
      <EdgeTag side="bottom" text={trO > 0.5 ? 'BASOLATERAL · tissue' : 'BASOLATERAL'} />

      {/* membranes */}
      <MembraneSheet id={['plasma-membrane', 'enterocyte']} shape="plane" width={30} depth={6} position={[-2, TOP, 0]} color={PALETTE.plasmaMembrane} thickness={0.12} />
      <MembraneSheet id={['plasma-membrane', 'enterocyte']} shape="plane" width={30} depth={6} position={[-2, BOT, 0]} color={PALETTE.plasmaMembrane} thickness={0.12} />
      {trO > 0.01 &&
        Array.from({ length: 22 }, (_, i) => <Capsule key={i} id="enterocyte" a={[-10 + i * 0.85, TOP, -0.4]} b={[-10 + i * 0.85, TOP + 1.1, -0.4]} r={0.15} color={PALETTE.plasmaMembrane} opacity={trO} />)}

      {/* organelles */}
      <Endosome id="early-endosome" kind="early" radius={ER_} position={E} />
      <MembraneSheet id="early-endosome" shape="tube" points={[TUB0, add(E, [TUB_DIR[0] * 1.9, TUB_DIR[1] * 1.9 + 0.1, 0]), TUB1]} radius={0.2} thickness={0.03} color={PALETTE.earlyEndosome} lumenColor={PALETTE.earlyEndosome} />
      <Endosome id="recycling-endosome" kind="recycling" radius={0.9} position={RE} />
      <Endosome id="late-endosome" kind="late" radius={1.0} position={LE} glow={fuse * (1 - seg(t, 0.56, 0.6))} />
      <Lysosome id="lysosome" radius={0.75} position={lyPos} opacity={lyA} />
      <GolgiStack id="golgi" n={4} radius={1.7} position={GO} vesicles={4} />
      <ERSheet id="er" width={5} depth={3} ribosomes={24} position={ERP} />

      {/* step 1: the four destinations, drawn as faint tracks */}
      {s1 > 0.01 &&
        ROUTES.map((r, i) => (
          <mesh key={i}>
            <tubeGeometry args={[r.c, 48, 0.04, 6, false]} />
            <meshBasicMaterial color={r.color} transparent opacity={0.55 * s1} />
          </mesh>
        ))}
      <Anchor id="early-endosome" position={add(E, [1.0, 0.75, 0.3])} show={1 - goldO} />
      <Anchor id="plasma-membrane" position={[-9, TOP + 0.05, 1]} show={either([-1, 0.28], [0.86, 2])} />
      <Anchor id="recycling-endosome" position={add(RE, [-0.6, -0.7, 0.3])} show={either([-1, 0.28], [0.86, 2])} />
      <Anchor id="late-endosome" position={add(LE, [0.9, 0.6, 0.3])} show={either([-1, 0.14], [0.43, 0.57], [0.86, 2])} />
      <Anchor id="lysosome" position={add(lyPos, [0.7, -0.3, 0.3])} show={lyA * either([-1, 0.14], [0.43, 0.57], [0.86, 2])} />
      <Anchor id="golgi" position={add(GO, [1.6, 0.6, 0.3])} show={either([-1, 0.14], [0.57, 0.71])} />
      <Anchor id="er" position={add(ERP, [-1.5, 0.4, 1])} show={either([-1, 0.14], [0.57, 0.71])} />

      {/* incoming endocytic vesicles (receptor + ligand) */}
      <Stream c={IN[0]} t={t} speed={18} n={2} o={inO} id="early-endosome" color={PALETTE.plasmaMembrane} cargo={{ count: 4, color: t > 0.86 ? LDL : LIG }} />
      <Stream c={IN[1]} t={t + 0.013} speed={18} n={2} o={inO} id="early-endosome" color={PALETTE.plasmaMembrane} cargo={{ count: 4, color: t > 0.86 ? LDL : LIG }} seed={4} />
      <Stream c={IN[2]} t={t + 0.027} speed={18} n={2} o={inO} id="early-endosome" color={PALETTE.plasmaMembrane} cargo={{ count: 4, color: t > 0.86 ? LDL : LIG }} seed={8} />

      {/* recycling: receptors only, EE tubule → recycling endosome → plasma membrane */}
      <Stream c={REC1} t={t} speed={16} n={3} o={recO} id="receptor" color={PALETTE.recyclingEndosome} cargo={{ count: 5, color: REC, kind: 'membrane' }} />
      <Stream c={REC2} t={t + 0.02} speed={16} n={3} o={recO} id="receptor" color={PALETTE.recyclingEndosome} cargo={{ count: 5, color: REC, kind: 'membrane' }} seed={3} />
      <Anchor id="receptor" text="Receptors · recycled to the surface" position={REC2.getPointAt(0.5).toArray() as V3} show={either([0.14, 0.28], [0.86, 2])} />

      {/* close-up: receptors + ligands with immunogold, separating after the pH drop */}
      {goldO > 0.01 &&
        PAIRS.map((p, i) => {
          const rp = add(E, [lerp(p.mem[0], p.tub[0], sep), lerp(p.mem[1], p.tub[1], sep), lerp(p.mem[2], p.tub[2], sep)]);
          const lb: V3 = [p.mem[0] * 0.78, p.mem[1] * 0.78, p.mem[2]];
          const lp = add(E, [lerp(lb[0], p.free[0], sep), lerp(lb[1], p.free[1], sep), lerp(lb[2], p.free[2], sep)]);
          return (
            <group key={i}>
              <Protein id="receptor" shape="y" color={REC} size={0.2} seed={i} position={rp} opacity={goldO} />
              <Gold position={add(rp, [0.1, 0.12, 0.12])} r={0.045} o={goldO} />
              <Protein id="ligand" shape="blob" color={LIG} size={0.17} seed={i + 20} position={lp} opacity={goldO} />
              <Gold position={add(lp, [-0.1, 0.1, 0.12])} r={0.09} o={goldO} />
            </group>
          );
        })}
      <Ion kind="H" count={26} region={{ center: add(E, [0, 0, 0.2]), size: [1.5, 1.5, 0.9] }} t={t} seed={3} opacity={ph} />
      <Anchor id="receptor" text={sep > 0.5 ? 'Receptors → tubule (small gold)' : 'Receptor (small gold)'} position={add(E, [PAIRS[4].tub[0] * sep + PAIRS[4].mem[0] * (1 - sep), PAIRS[4].tub[1] * sep + PAIRS[4].mem[1] * (1 - sep), 0.3])} show={goldO * (step3 ? 1 : 0)} />
      <Anchor id="ligand" text={sep > 0.5 ? 'Ligands stay in the vacuole (large gold)' : 'Ligand (large gold)'} position={add(E, [0.2, -0.3, 0.45])} show={goldO} />
      <Anchor id="gold-particles" position={add(E, [0.9, -0.95, 0.4])} show={goldO * vis(t, 0.29, 0.34, 0.01)} />

      {/* degradation: EE → late endosome → lysosome */}
      <Stream c={DEG} t={t} speed={14} n={3} o={degO} id="late-endosome" color={PALETTE.lateEndosome} cargo={{ count: 4, color: t > 0.86 ? LDL : LIG }} />
      <Stream c={LY_IN} t={t + 0.02} speed={14} n={2} o={either([0.86, 2])} id="lysosome" color={PALETTE.lateEndosome} cargo={{ count: 4, color: LDL }} />

      {/* retrograde: EE → Golgi (retrograde vesicles), Golgi → ER (COPI) */}
      <Stream c={RETRO} t={t} speed={14} n={3} o={retO} id="retrograde-vesicle" color={PALETTE.golgiMembrane} cargo={{ count: 3, color: '#b197fc' }} />
      <Stream c={COPI} t={t + 0.02} speed={14} n={2} o={retO} id="copi" color={PALETTE.golgiMembrane} cargo={{ count: 3, color: '#b197fc' }} radius={0.24} />
      {retO > 0.01 &&
        [0.25, 0.75].map((k) => {
          const a = along(COPI, loop((t + 0.02) * 14, k < 0.5 ? 0 : 1, 2), 0.12);
          return <Vesicle key={k} id="copi" radius={0.32} coat="copi" coatAmount={1 - seg(loop((t + 0.02) * 14, k < 0.5 ? 0 : 1, 2), 0.75, 0.95)} position={a.pos} scale={a.s} color={PALETTE.golgiMembrane} opacity={retO} />;
        })}
      <Anchor id="retrograde-vesicle" position={RETRO.getPointAt(0.45).toArray() as V3} show={retO} />
      <Anchor id="copi" text="COPI vesicle → ER" position={COPI.getPointAt(0.5).toArray() as V3} show={retO} />

      {/* transcytosis: apical → EE → basolateral */}
      <Stream c={TR_IN} t={t} speed={14} n={2} o={trO} id="transcytotic-vesicle" color={PALETTE.plasmaMembrane} cargo={{ count: 4, color: LDL }} />
      <Stream c={TR_OUT} t={t + 0.025} speed={14} n={3} o={trO} id="transcytotic-vesicle" color={PALETTE.plasmaMembrane} cargo={{ count: 4, color: LDL }} seed={5} />
      <Anchor id="transcytotic-vesicle" position={TR_OUT.getPointAt(0.55).toArray() as V3} show={trO} />
      <Anchor id="enterocyte" position={[-8.5, -1.5, 0.5]} show={trO} />
    </group>
  );
}
