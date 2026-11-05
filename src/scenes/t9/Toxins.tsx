/**
 * t9-toxins — Botulinum and tetanus toxins cut neuronal SNAREs: same mechanism, opposite symptoms.
 *
 * World (schematic, three areas):
 *  - lower left: the neuromuscular junction — motor-neuron terminal (x ≈ −4.5, y ≈ 1.4) full of synaptic vesicles
 *    over a muscle fibre (y = −1.6). Each action potential arriving makes docked vesicles fuse and release ACh,
 *    and the fibre twitches.
 *  - right: the spinal cord — motor-neuron soma (x = 10) whose axon runs left to the terminal, and an inhibitory
 *    interneuron (upper right) whose terminal on the soma releases inhibitory transmitter (red dots).
 *  - top middle: a zoom panel on a presynaptic membrane — a docked vesicle and three SNARE complexes
 *    (VAMP red on the vesicle; syntaxin blue + SNAP25 green on the membrane).
 *
 *  0  normal transmission at the NMJ
 *  1  zoom: v-/t-SNAREs; the two toxins
 *  2  botulinum toxin cuts VAMP, syntaxin and SNAP25 → no ACh release → flaccid muscle
 *  3  in small, local doses that is useful (spasms, wrinkles)
 *  4  tetanus toxin: retrograde up the motor axon into the inhibitory interneuron, cuts VAMP there →
 *     inhibition lost → the motor neuron fires non-stop → spastic contraction
 *  5  same mechanism, opposite symptoms
 */
import { TubeGeometry } from 'three';
import type { SceneProps } from '@/content/types';
import { clamp, lerp, lerp3, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, EdgeTag, MembraneSheet, PALETTE, Protein, Vesicle, proteinMaterial, useDisposable, useKitHighlight, useStageCamera, type CamKey } from '@/three/kit';
import { Capsule } from '../t7/parts/molecules';
import { curve } from '../t8/parts/stack';

export const P = [0, 0.17, 0.34, 0.51, 0.68, 0.86] as const;

const TERM: V3 = [-4.5, 1.4, 0];
const MUS_Y = -1.6;
const SOMA: V3 = [10, 4.6, 0];
const INTER: V3 = [13.6, 7.4, 0];
const SYN: V3 = [11.0, 5.75, 0.2]; // interneuron terminal on the motor-neuron soma
const INS: V3 = [3.2, 8.2, 0];
const NEURON = '#ffd8a8';
const INTER_C = '#b197fc';
const ACH = '#74c0fc';
const VAMP_C = '#f03e3e';
const SYX_C = '#1c7ed6';
const SNAP_C = '#20c997';
const BOT_C = '#2f9e44';
const TET_C = '#ae3ec9';

const AXON = curve([SOMA, [8.4, 4.6, 0], [0, 4.7, 0], [-3.4, 4.5, 0], [-4.4, 3.2, 0], [TERM[0], TERM[1] + 1.1, 0]]);
const T = {
  botoxCut: [0.37, 0.395, 0.42],
  botoxBlock: [0.42, 0.68],
  reset: [0.64, 0.67],
  retro: [0.69, 0.735],
  jump: [0.735, 0.752],
  tetCut: 0.775,
  tetBlock: 0.8,
} as const;

/** a SNARE helix that can be cut: the anchored part stays, the free part drifts off */
function Helix({ a, b, cutAt, k, color, id, drift, opacity = 1 }: { a: V3; b: V3; cutAt: number; k: number; color: string; id: string[]; drift: V3; opacity?: number }) {
  const m = lerp3(a, b, cutAt);
  const off = lerp3(m, b, 0.0);
  const d = smooth(k);
  const fb: V3 = [b[0] + drift[0] * d, b[1] + drift[1] * d, b[2] + drift[2] * d];
  const fm: V3 = [off[0] + drift[0] * d, off[1] + drift[1] * d, off[2] + drift[2] * d];
  if (k <= 0.001) return <Capsule a={a} b={b} r={0.05} color={color} id={id} opacity={opacity} />;
  return (
    <group>
      <Capsule a={a} b={[m[0], m[1] - 0.0, m[2]]} r={0.05} color={color} id={id} opacity={opacity} />
      <Capsule a={fm} b={fb} r={0.05} color={color} id={id} opacity={opacity * (1 - clamp((k - 0.4) / 0.6))} />
    </group>
  );
}

function Axon() {
  const geo = useDisposable(() => new TubeGeometry(AXON, 90, 0.22, 10), []);
  const mats = useDisposable(() => [proteinMaterial(NEURON, { roughness: 0.6 })], []);
  useKitHighlight(mats, 'motor-neuron', {});
  return <mesh geometry={geo} material={mats[0]} />;
}

function Dot({ pos, r, color, o, id }: { pos: V3; r: number; color: string; o: number; id?: string }) {
  const mats = useDisposable(() => [proteinMaterial(color, { emissive: 0.4 })], [color]);
  useKitHighlight(mats, id, { opacity: o });
  if (o <= 0.01) return null;
  return (
    <mesh position={pos} material={mats[0]} scale={r}>
      <sphereGeometry args={[1, 10, 8]} />
    </mesh>
  );
}

const rnd = (i: number, k: number) => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
const VES: V3[] = Array.from({ length: 10 }, (_, i) => [TERM[0] + (rnd(i, 1) - 0.5) * 2.4, TERM[1] + (rnd(i, 2) - 0.2) * 1.1, (rnd(i, 3) - 0.5) * 1.2]);
const DOCK: V3[] = [-0.9, 0, 0.9].map((dx) => [TERM[0] + dx, TERM[1] - 0.95, 0.35]);
const ACH_P: V3[] = Array.from({ length: 30 }, (_, i) => [TERM[0] + (rnd(i, 4) - 0.5) * 2.6, lerp(TERM[1] - 1.25, MUS_Y + 1.0, rnd(i, 5)), (rnd(i, 6) - 0.5) * 1.2 + 0.3]);
const INH_P: V3[] = Array.from({ length: 10 }, (_, i) => [SYN[0] - 0.2 + (rnd(i, 7) - 0.5) * 0.5, SYN[1] - 0.25 - rnd(i, 8) * 0.35, 0.4 + (rnd(i, 9) - 0.5) * 0.4]);
const COMPLEX_X = [-0.6, 0, 0.6];

const CAM: CamKey[] = [
  { at: 0, pos: [-4.5, 1.0, 10.5], target: [-4.5, 0.4, 0], fov: 40 },
  { at: 0.15, pos: [-4.4, 1.0, 10.2], target: [-4.5, 0.4, 0], fov: 40 },
  { at: 0.21, pos: [3.2, 8.0, 6.2], target: [3.2, 7.9, 0], fov: 40 },
  { at: 0.45, pos: [3.2, 8.0, 5.9], target: [3.2, 7.9, 0], fov: 40 },
  { at: 0.5, pos: [-4.5, 1.0, 10.2], target: [-4.5, 0.4, 0], fov: 40 },
  { at: 0.55, pos: [-4.0, 1.4, 12.0], target: [-4.2, 0.6, 0], fov: 40 },
  { at: 0.67, pos: [-4.0, 1.4, 11.8], target: [-4.2, 0.6, 0], fov: 40 },
  { at: 0.71, pos: [3.0, 3.6, 20.0], target: [3.0, 3.2, 0], fov: 40 },
  { at: 0.745, pos: [3.0, 3.6, 19.6], target: [3.0, 3.2, 0], fov: 40 },
  { at: 0.765, pos: [3.2, 8.0, 6.2], target: [3.2, 7.9, 0], fov: 40 },
  { at: 0.79, pos: [3.2, 8.0, 6.0], target: [3.2, 7.9, 0], fov: 40 },
  { at: 0.82, pos: [3.0, 3.4, 20.0], target: [3.0, 3.0, 0], fov: 40 },
  { at: 0.86, pos: [3.0, 3.4, 19.8], target: [3.0, 3.0, 0], fov: 40 },
  { at: 0.9, pos: [3.0, 3.0, 21.0], target: [3.0, 2.8, 0], fov: 40 },
  { at: 1, pos: [3.0, 3.0, 21.2], target: [3.0, 2.8, 0], fov: 40 },
];

export default function ToxinsScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const botox = vis(t, T.botoxBlock[0], T.botoxBlock[1], 0.02);
  const tet = smooth(seg(t, T.tetBlock, T.tetBlock + 0.03));
  // action potentials: normal rate, much faster once inhibition is lost
  const rate = lerp(22, 70, tet);
  const phase = (t * rate) % 1;
  const pulse = Math.pow(Math.max(0, Math.sin(Math.PI * clamp((phase - 0.82) / 0.18))), 2);
  const release = pulse * (1 - botox);
  const contraction = Math.max(release * 0.55, 0.85 * tet + 0.1 * tet * Math.sin(t * 900));
  const sag = 0.25 * botox;
  const apPos = AXON.getPointAt(clamp(phase / 0.85)).toArray() as V3;
  const inhib = (1 - tet) * Math.pow(Math.max(0, Math.sin(t * 160)), 2) * vis(t, 0.68, 2, 0.02);

  // zoom panel: SNARE cutting
  const reset = smooth(seg(t, T.reset[0], T.reset[1]));
  const cutB = T.botoxCut.map((tc) => smooth(seg(t, tc, tc + 0.02)) * (1 - reset));
  const cutT = smooth(seg(t, T.tetCut, T.tetCut + 0.02));
  const vampCut = Math.max(cutB[0], cutT);
  const panelLabel = t < 0.6 ? 'Presynaptic terminal (zoom)' : 'Interneuron terminal (zoom)';

  // toxin light chains in the zoom panel
  const botIn = vis(t, 0.19, 0.47, 0.015);
  const botTarget = t < T.botoxCut[0] ? [INS[0] - 1.6, INS[1] - 0.3, 0.6] : t < T.botoxCut[1] ? [INS[0] - 0.75, INS[1] - 0.45, 0.6] : t < T.botoxCut[2] ? [INS[0] - 0.05, INS[1] - 0.45, 0.65] : [INS[0] + 0.6, INS[1] - 0.45, 0.65];
  const botPos = botTarget as V3;
  const tetPanel = Math.max(vis(t, 0.19, 0.34, 0.015), vis(t, T.jump[1], 0.86, 0.015));
  const tetPos: V3 = t < 0.5 ? [INS[0] + 1.6, INS[1] - 0.3, 0.6] : lerp3([INS[0] + 1.7, INS[1] - 0.1, 0.6], [INS[0] + 0.1, INS[1] - 0.25, 0.65], smooth(seg(t, 0.76, T.tetCut)));
  // tetanus toxin's trip: NMJ → retrograde up the motor axon → into the interneuron
  const retro = smooth(seg(t, T.retro[0], T.retro[1]));
  const jump = smooth(seg(t, T.jump[0], T.jump[1]));
  const tetTrip = jump > 0 ? lerp3(SOMA, SYN, jump) : (AXON.getPointAt(1 - retro).toArray() as V3);
  const tripO = vis(t, T.retro[0] - 0.01, T.jump[1] + 0.01, 0.01);
  const botNmj = vis(t, 0.44, 0.68, 0.02);

  return (
    <group>
      {/* muscle fibre */}
      <group position={[TERM[0], MUS_Y - sag, 0]} scale={[1 - 0.12 * contraction, 1 + 0.18 * contraction - 0.06 * botox, 1 + 0.18 * contraction]}>
        <Capsule id="muscle-fiber" a={[-4.6, 0, 0]} b={[4.6, 0, 0]} r={0.95} color="#e03131" glow={0.4 * contraction} />
        {Array.from({ length: 13 }, (_, i) => (
          <mesh key={i} position={[-4.2 + i * 0.7, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.96, 0.03, 6, 28]} />
            <meshStandardMaterial color="#a61e1e" />
          </mesh>
        ))}
      </group>
      <Anchor id="muscle-fiber" position={[TERM[0] - 3.4, MUS_Y - 0.6, 0.9]} />

      {/* motor neuron: soma, axon, terminal */}
      <Protein id="motor-neuron" shape="blob" color={NEURON} size={2.0} seed={3} position={SOMA} glow={0.5 * tet * pulse} />
      <Axon />
      <group position={TERM} scale={[1.3, 0.85, 1]}>
        <Vesicle id={['motor-neuron', 'neuromuscular-junction']} radius={1.7} color={NEURON} lumenColor="#fff4e6" />
      </group>
      <Anchor id="motor-neuron" position={[SOMA[0] - 0.4, SOMA[1] - 1.0, 0.8]} />
      <Dot pos={apPos} r={0.38} color="#fff3bf" o={vis(phase, 0.02, 0.86, 0.04)} />

      {/* synaptic vesicles with ACh; docked ones fuse on each impulse (unless the SNAREs are cut) */}
      {VES.map((p, i) => (
        <Vesicle key={i} id="synaptic-vesicle" radius={0.2} position={p} color={PALETTE.membrane} lumenColor="#d0ebff" cargo={{ count: 3, color: ACH, seed: i }} />
      ))}
      {DOCK.map((p, i) => (
        <Vesicle key={`d${i}`} id="synaptic-vesicle" radius={0.22} position={p} scale={1 - 0.85 * release} color={PALETTE.membrane} lumenColor="#d0ebff" cargo={{ count: 3, color: ACH, seed: 20 + i }} />
      ))}
      <Anchor id="synaptic-vesicle" position={DOCK[2]} show={vis(t, 0, 0.5, 0.02)} />
      {ACH_P.map((p, i) => (
        <Dot key={i} pos={[p[0], p[1] - 0.3 * release, p[2]]} r={0.07} color={ACH} o={release} id="acetylcholine" />
      ))}
      <Anchor id="acetylcholine" position={ACH_P[3]} show={vis(t, 0, 0.34, 0.02)} />
      <Anchor id="neuromuscular-junction" position={[TERM[0] + 1.8, TERM[1] - 1.2, 0.6]} />

      {/* botulinum toxin inside the NMJ terminal (steps 2–3) */}
      {[-0.9, 0.2, 1.0].map((dx, i) => (
        <Protein key={i} id="botulinum-toxin" shape="blob" color={BOT_C} size={0.32} seed={30 + i} position={[TERM[0] + dx, TERM[1] - 0.55, 0.6]} opacity={botNmj} />
      ))}
      <Anchor id="botulinum-toxin" position={[TERM[0] + 1.0, TERM[1] - 0.55, 0.7]} show={botNmj} />

      {/* inhibitory interneuron */}
      <Protein id="interneuron" shape="blob" color={INTER_C} size={1.4} seed={8} position={INTER} glow={0.3 * vis(t, 0.68, 2, 0.02)} />
      <Capsule id="interneuron" a={INTER} b={[SYN[0] + 0.35, SYN[1] + 0.35, 0.2]} r={0.17} color={INTER_C} />
      <mesh position={SYN}>
        <sphereGeometry args={[0.38, 16, 12]} />
        <meshStandardMaterial color={INTER_C} />
      </mesh>
      {INH_P.map((p, i) => (
        <Dot key={i} pos={p} r={0.06} color="#ff6b6b" o={inhib} />
      ))}
      <Anchor id="interneuron" position={[INTER[0] + 0.4, INTER[1] + 0.8, 0.6]} />

      {/* tetanus toxin travelling retrogradely, then into the interneuron */}
      <Dot pos={tetTrip} r={0.3} color={TET_C} o={tripO} id="tetanus-toxin" />
      <Anchor id="tetanus-toxin" position={tetTrip} show={tripO} />
      <Protein id="tetanus-toxin" shape="blob" color={TET_C} size={0.36} seed={40} position={[SYN[0] + 0.1, SYN[1] + 0.05, 0.6]} opacity={vis(t, T.jump[1], 2, 0.02)} />
      <Anchor id="tetanus-toxin" position={[SYN[0] + 0.3, SYN[1] + 0.2, 0.7]} show={vis(t, 0.82, 2, 0.02)} />

      {/* zoom panel */}
      <mesh position={[INS[0], INS[1], -0.6]}>
        <planeGeometry args={[5.2, 3.2]} />
        <meshBasicMaterial color="#1c2230" transparent opacity={0.85} />
      </mesh>
      <MembraneSheet id={['t-snare', 'motor-neuron']} shape="plane" width={4.6} depth={1.4} position={[INS[0], INS[1] - 0.72, -0.1]} color={PALETTE.plasmaMembrane} thickness={0.12} />
      <Vesicle id={['synaptic-vesicle', 'v-snare']} radius={0.85} position={[INS[0], INS[1] + 0.92, 0]} color={PALETTE.membrane} lumenColor="#d0ebff" cargo={{ count: 6, color: ACH, seed: 3 }} />
      <Anchor id="synaptic-vesicle" text={panelLabel} position={[INS[0] - 0.6, INS[1] + 1.5, 0.4]} show={vis(t, 0.18, 0.47, 0.02) + vis(t, 0.75, 0.82, 0.01)} />
      {COMPLEX_X.map((dx, i) => {
        const x = INS[0] + dx;
        return (
          <group key={i}>
            <Helix id={['vamp', 'v-snare']} color={VAMP_C} a={[x - 0.07, INS[1] + 0.12, 0.45]} b={[x - 0.07, INS[1] - 0.6, 0.45]} cutAt={0.45} k={vampCut} drift={[-0.3, -0.5, 0.6]} />
            <Helix id={['syntaxin', 't-snare']} color={SYX_C} a={[x + 0.07, INS[1] - 0.68, 0.45]} b={[x + 0.07, INS[1] + 0.05, 0.45]} cutAt={0.5} k={cutB[1]} drift={[0.3, 0.5, 0.6]} />
            <Helix id={['snap25', 't-snare']} color={SNAP_C} a={[x, INS[1] - 0.68, 0.57]} b={[x, INS[1] + 0.0, 0.57]} cutAt={0.55} k={cutB[2]} drift={[0.1, 0.4, 0.7]} />
            <Helix id={['snap25', 't-snare']} color={SNAP_C} a={[x, INS[1] - 0.68, 0.33]} b={[x + 0.02, INS[1] - 0.05, 0.33]} cutAt={0.55} k={cutB[2]} drift={[0.2, 0.45, -0.2]} />
          </group>
        );
      })}
      <Anchor id="vamp" position={[INS[0] - 0.67, INS[1] - 0.2, 0.5]} show={vis(t, 0.2, 0.51, 0.02) + vis(t, 0.75, 0.86, 0.02)} />
      <Anchor id="v-snare" position={[INS[0] - 0.07, INS[1] - 0.05, 0.5]} show={vis(t, 0.18, 0.34, 0.02)} />
      <Anchor id="t-snare" position={[INS[0] + 0.67, INS[1] - 0.45, 0.5]} show={vis(t, 0.18, 0.34, 0.02)} />
      <Anchor id="syntaxin" position={[INS[0] + 0.67, INS[1] - 0.3, 0.5]} show={vis(t, 0.36, 0.51, 0.02)} />
      <Anchor id="snap25" position={[INS[0] + 0.6, INS[1] - 0.55, 0.6]} show={vis(t, 0.36, 0.51, 0.02)} />
      <Protein id="botulinum-toxin" shape="blob" color={BOT_C} size={0.42} seed={31} position={botPos} opacity={botIn} />
      <Anchor id="botulinum-toxin" position={[botPos[0], botPos[1] + 0.25, botPos[2]]} show={botIn} />
      <Protein id="tetanus-toxin" shape="blob" color={TET_C} size={0.42} seed={41} position={tetPos} opacity={tetPanel} />
      <Anchor id="tetanus-toxin" position={[tetPos[0], tetPos[1] + 0.25, tetPos[2]]} show={tetPanel} />

      <EdgeTag side="bottom" text={tet > 0.5 ? 'TETANUS: inhibition lost → spastic contraction' : botox > 0.5 ? 'BOTULISM: no ACh release → flaccid muscle' : 'normal transmission'} />
    </group>
  );
}
