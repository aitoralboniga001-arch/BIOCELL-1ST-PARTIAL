/**
 * t10-synaptic — The synaptic vesicle cycle: fill → dock (actin, SNAREs) → action potential, Ca²⁺ → fusion →
 * clathrin re-endocytosis → refill.
 *
 * World: a nerve terminal in section. Presynaptic membrane at y = −3 (cytosol above), synaptic cleft below it and
 * the postsynaptic membrane at y = −4.8 with receptors. A pool of synaptic vesicles is held on actin filaments
 * above the active zone; three vesicles dock at x = −2.2, 0, 2.2 (SNARE pairs), fuse when Ca²⁺ enters through the
 * channels between them, and the membrane is taken back by a clathrin-coated pit at x = 4.5.
 */
import type { SceneProps } from '@/content/types';
import { clamp, lerp, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, ClathrinCage, EdgeTag, Ion, MembraneSheet, PALETTE, Protein, Vesicle, useStageCamera, type CamKey } from '@/three/kit';
import { Capsule } from '../t7/parts/molecules';

export const P = [0, 0.14, 0.28, 0.43, 0.57, 0.71, 0.86] as const;

const PM = -3;
const POST = -4.8;
const VR = 0.32;
const NT = '#69db7c';
const FV: V3 = [-3.6, 0.9, 0.4]; // the vesicle we watch being filled
const DOCK = [-2.2, 0, 2.2];
const DOCK_Y = PM + 0.08 + VR + 0.12;
const PIT_X = 4.5;
const CH = [-1.1, 1.1, -3.3, 3.3];
const r1 = (k: number) => Math.abs(Math.sin(k * 12.9898 + 78.233) * 43758.5453) % 1;

const POOL: V3[] = Array.from({ length: 26 }, (_, i) => [-6.5 + r1(i) * 13, -1.4 + r1(i + 40) * 4.4, -1.2 + r1(i + 80) * 1.6] as V3).filter(
  (p) => Math.hypot(p[0] - FV[0], p[1] - FV[1]) > 1.1,
);
const DOCK_FROM: V3[] = [
  [-2.6, -0.8, 0.2],
  [0.3, -0.6, 0.2],
  [2.4, -0.9, 0.2],
];
/** actin filaments: gently wavy lines through the pool */
const ACTIN: V3[][] = [-1.6, -0.3, 1.1, 2.4].map((y, k) =>
  Array.from({ length: 40 }, (_, i) => [-7 + i * 0.36, y + 0.25 * Math.sin(i * 0.5 + k), -0.6 + 0.2 * Math.cos(i * 0.3 + k)] as V3),
);
const NT_IN: V3[] = Array.from({ length: 12 }, (_, i) => {
  const a = i * 2.4;
  const b = Math.acos(1 - (2 * (i + 0.5)) / 12);
  return [Math.cos(a) * Math.sin(b) * 0.2, Math.cos(b) * 0.2, Math.sin(a) * Math.sin(b) * 0.2] as V3;
});
const NT_OUT: V3[] = NT_IN.map((_, i) => [-1.5 - r1(i) * 1.3, -0.6 + r1(i + 7) * 2.4, 0.6 + r1(i + 13) * 0.6] as V3);
const RECEPT = Array.from({ length: 9 }, (_, i) => -4 + i);

const CAM: CamKey[] = [
  { at: 0, pos: [0, 0.2, 15], target: [0, -0.2, 0], fov: 40 },
  { at: 0.12, pos: [0, 0.2, 14.6], target: [0, -0.2, 0], fov: 40 },
  { at: 0.17, pos: [-3.2, 1.0, 5.6], target: [-3.2, 0.8, 0], fov: 40 },
  { at: 0.27, pos: [-3.2, 1.0, 5.4], target: [-3.2, 0.8, 0], fov: 40 },
  { at: 0.31, pos: [0, -1.6, 7.2], target: [0, -2.3, 0], fov: 40 },
  { at: 0.42, pos: [0, -1.6, 7.0], target: [0, -2.3, 0], fov: 40 },
  { at: 0.46, pos: [-1.5, -1.2, 11], target: [-1.5, -2.0, 0], fov: 40 },
  { at: 0.56, pos: [-1.5, -1.2, 10.6], target: [-1.5, -2.0, 0], fov: 40 },
  { at: 0.6, pos: [0, -2.6, 9], target: [0, -3.2, 0], fov: 40 },
  { at: 0.7, pos: [0, -2.6, 8.7], target: [0, -3.2, 0], fov: 40 },
  { at: 0.74, pos: [3.8, -1.6, 7], target: [3.8, -2.0, 0], fov: 40 },
  { at: 0.85, pos: [3.8, -1.6, 6.8], target: [3.8, -2.0, 0], fov: 40 },
  { at: 0.9, pos: [0, 0.2, 14.5], target: [0, -0.4, 0], fov: 40 },
  { at: 1, pos: [0, 0.2, 14.2], target: [0, -0.4, 0], fov: 40 },
];

export default function SynapticScene({ t }: SceneProps) {
  useStageCamera(CAM);
  // filling (and refilling) of the watched vesicle
  const fill = t < 0.86 ? smooth(seg(t, 0.17, 0.27)) : 1;
  const trO = vis(t, 0.14, 0.28, 0.02);
  // docking, SNAREs, fusion; the docked trio is replaced by new vesicles during the refill step
  const dock = smooth(seg(t, 0.29, 0.36));
  const zip = smooth(seg(t, 0.34, 0.42));
  const fuse = smooth(seg(t, 0.59, 0.655));
  const redock = smooth(seg(t, 0.88, 0.97));
  const ap = seg(t, 0.44, 0.5);
  const chOpen = smooth(seg(t, 0.48, 0.51)) * (1 - seg(t, 0.68, 0.72));
  const ca = vis(t, 0.5, 0.71, 0.02);
  const release = smooth(seg(t, 0.6, 0.7));
  const cleftO = vis(t, 0.59, 0.86, 0.03);
  // clathrin re-endocytosis at the edge of the active zone
  const pit = smooth(seg(t, 0.72, 0.78));
  const coat = smooth(seg(t, 0.72, 0.77)) * (1 - smooth(seg(t, 0.805, 0.835)));
  const dyn = vis(t, 0.77, 0.805, 0.01);
  const rise = smooth(seg(t, 0.82, 0.88));
  const endoO = vis(t, 0.71, 2, 0.02);
  const pitY = lerp(PM - 0.12, PM + VR + 0.35, pit);
  const pitPos: V3 = [lerp(PIT_X, 3.3, rise), lerp(pitY, 0.3, rise), lerp(0.3, -0.2, rise)];
  const refill = smooth(seg(t, 0.88, 0.97));

  return (
    <group>
      <EdgeTag side="top" text="NERVE TERMINAL · cytosol" />
      <EdgeTag side="bottom" text="SYNAPTIC CLEFT → postsynaptic cell" />

      {/* membranes */}
      <MembraneSheet id={['plasma-membrane', 'nerve-terminal']} shape="plane" width={18} depth={6} position={[0, PM, 0]} color={PALETTE.plasmaMembrane} thickness={0.12} />
      <MembraneSheet shape="plane" width={18} depth={6} position={[0, POST, 0]} color="#d0bfff" thickness={0.12} />
      {RECEPT.map((x, i) => (
        <Protein key={i} shape="ring" color="#b197fc" size={0.26} seed={i} position={[x, POST + 0.15, 0.4]} />
      ))}
      <Anchor id="nerve-terminal" position={[-6.2, 3.0, 0.4]} show={vis(t, -1, 0.14, 0.02) + vis(t, 0.43, 0.57, 0.02)} />
      <Anchor id="plasma-membrane" text="Presynaptic plasma membrane" position={[-6, PM + 0.05, 1.2]} show={vis(t, 0.28, 0.43, 0.02) + vis(t, 0.71, 0.86, 0.02)} />

      {/* actin filaments holding the reserve pool */}
      {ACTIN.map((line, k) =>
        line.slice(0, -1).map((p, i) => <Capsule key={`${k}-${i}`} id="actin-filaments" a={p} b={line[i + 1]} r={0.045} color={PALETTE.actin} />),
      )}
      <Anchor id="actin-filaments" position={ACTIN[1][31]} show={vis(t, 0.28, 0.43, 0.02)} />

      {/* reserve pool */}
      {POOL.map((p, i) => (
        <Vesicle key={i} id="synaptic-vesicle" radius={VR} position={p} color={PALETTE.plasmaMembrane} lumenColor="#e6fcf5" cargo={{ count: 6, color: NT, seed: i }} />
      ))}
      <Anchor id="synaptic-vesicle" position={POOL[3]} show={vis(t, -1, 0.14, 0.02) + vis(t, 0.86, 2, 0.02)} />

      {/* the vesicle being filled by vesicular transporters */}
      <group position={FV}>
        <Vesicle id="synaptic-vesicle" radius={0.5} color={PALETTE.plasmaMembrane} lumenColor="#e6fcf5" />
        {[0, 1, 2, 3].map((k) => {
          const a = (k / 4) * Math.PI * 2 + 0.4;
          return <Protein key={k} id="vesicular-transporter" shape="barrel" color="#20c997" size={0.2} seed={k} position={[Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.15]} />;
        })}
        {NT_IN.map((p, i) => {
          const k = clamp(fill * 1.4 - (i / NT_IN.length) * 0.4);
          const s = smooth(k);
          const q: V3 = [lerp(NT_OUT[i][0] - FV[0] + 0.5, p[0], s), lerp(NT_OUT[i][1] - FV[1], p[1], s), lerp(NT_OUT[i][2], p[2], s)];
          return <Protein key={i} id="neurotransmitter" shape="blob" color={NT} size={0.09} seed={i} position={q} opacity={t < 0.14 ? 0 : vis(t, 0.14, 2, 0.02)} />;
        })}
        <Ion kind="H" count={10} region={{ center: [0, 0, 0], size: [0.5, 0.5, 0.4] }} t={t} seed={2} opacity={trO} />
      </group>
      <Anchor id="vesicular-transporter" position={[FV[0] + 0.5 * Math.cos(0.4), FV[1] + 0.5 * Math.sin(0.4), 0.6]} show={trO + vis(t, 0.86, 2, 0.02)} />
      <Anchor id="neurotransmitter" position={[FV[0] - 0.55, FV[1] - 0.55, 0.7]} show={trO} />

      {/* docked vesicles with SNAREs; they collapse into the membrane at fusion */}
      {DOCK.map((x, i) => {
        const before = t < 0.86;
        const k = before ? dock : redock;
        const pos: V3 = [lerp(DOCK_FROM[i][0], x, k), lerp(DOCK_FROM[i][1], DOCK_Y, k) - (before ? fuse * (VR + 0.2) : 0), lerp(DOCK_FROM[i][2], 0.3, k)];
        const sc = before ? 1 - 0.85 * fuse : 1;
        const o = before ? 1 - seg(fuse, 0.7, 1) : redock;
        const z = before ? zip * (1 - seg(fuse, 0, 0.5)) : redock;
        return (
          <group key={i}>
            <Vesicle id="synaptic-vesicle" radius={VR} position={pos} scale={sc} color={PALETTE.plasmaMembrane} lumenColor="#e6fcf5" cargo={{ count: 6, color: NT, seed: 30 + i }} opacity={o} />
            {[-1, 1].map((s) => {
              const vx = x + s * 0.2;
              const top: V3 = [vx, DOCK_Y - VR * 0.85, 0.35];
              const vEnd: V3 = [lerp(vx + s * 0.1, x + s * 0.12, z), lerp(DOCK_Y - VR - 0.12, PM + 0.12, z), 0.42];
              const tBase: V3 = [x + s * 0.42, PM + 0.07, 0.35];
              const tEnd: V3 = [lerp(x + s * 0.45, x + s * 0.18, z), lerp(PM + 0.3, DOCK_Y - VR * 0.85, z), 0.4];
              const so = Math.min(k, o) * (before ? vis(t, 0.3, 2, 0.02) : 1);
              return (
                <group key={s}>
                  <Capsule id="v-snare" a={top} b={vEnd} r={0.04} color={PALETTE.vSnare} opacity={so} />
                  <Capsule id="t-snare" a={tBase} b={tEnd} r={0.04} color={PALETTE.tSnare} opacity={so} />
                </group>
              );
            })}
          </group>
        );
      })}
      <Anchor id="v-snare" position={[0.25, DOCK_Y - VR - 0.05, 0.45]} show={vis(t, 0.32, 0.43, 0.02)} />
      <Anchor id="t-snare" position={[-0.45, PM + 0.2, 0.45]} show={vis(t, 0.32, 0.43, 0.02)} />
      <Anchor id="synaptic-vesicle" text="Docked synaptic vesicle" position={[0, DOCK_Y + 0.2, 0.4]} show={vis(t, 0.3, 0.43, 0.02) + vis(t, 0.57, 0.66, 0.02)} />

      {/* action potential wave along the membrane */}
      <mesh position={[lerp(-9, 1.5, ap), PM, 0.05]} visible={ap > 0 && ap < 1}>
        <boxGeometry args={[1.6, 0.22, 5.8]} />
        <meshBasicMaterial color="#ffe066" transparent opacity={0.55 * Math.sin(Math.PI * ap)} />
      </mesh>
      <Anchor id="nerve-terminal" text="Action potential arrives" position={[lerp(-9, 1.5, ap), PM + 0.3, 1]} show={vis(t, 0.44, 0.5, 0.01)} />

      {/* voltage-gated Ca²⁺ channels */}
      {CH.map((x, i) => (
        <Protein key={i} id="ca-channel" shape="ring" color="#74c0fc" size={0.3 + 0.08 * chOpen} seed={i} position={[x, PM, 0.35]} glow={chOpen} />
      ))}
      <Anchor id="ca-channel" text={chOpen > 0.5 ? 'Ca²⁺ channel · open' : 'Ca²⁺ channel · closed'} position={[CH[0], PM - 0.1, 0.6]} show={vis(t, 0.43, 0.6, 0.02)} />
      <Ion kind="Ca" count={30} region={{ center: [0, PM + 0.55, 0.4], size: [7, 0.8, 1.2] }} t={t} seed={7} opacity={ca} id="calcium" />
      <Ion kind="Ca" count={20} region={{ center: [0, PM - 0.8, 0.4], size: [9, 1.0, 1.2] }} t={t} seed={8} opacity={vis(t, -1, 0.57, 0.02) * 0.6} id="calcium" />
      <Anchor id="calcium" text="Ca²⁺ enters" position={[2.6, PM + 0.7, 0.8]} show={ca} />

      {/* neurotransmitter released into the cleft */}
      {cleftO > 0.01 &&
        Array.from({ length: 36 }, (_, i) => {
          const src = DOCK[i % 3];
          const end: V3 = [src + (r1(i) - 0.5) * 3, POST + 0.25 + r1(i + 5) * 1.2, 0.2 + r1(i + 9) * 0.6];
          const k = clamp(release * 1.3 - r1(i + 3) * 0.3);
          const p: V3 = [lerp(src, end[0], k), lerp(PM - 0.1, end[1], k), end[2]];
          return <Protein key={i} id="neurotransmitter" shape="blob" color={NT} size={0.09} seed={i} position={p} opacity={cleftO * (k > 0.02 ? 1 : 0)} />;
        })}
      <Anchor id="neurotransmitter" text="Neurotransmitter → cleft" position={[2.2, POST + 0.9, 0.7]} show={vis(t, 0.62, 0.71, 0.02)} />

      {/* clathrin-mediated re-endocytosis */}
      {endoO > 0.01 && (
        <group position={pitPos}>
          <Vesicle id="synaptic-vesicle" radius={0.4} color={PALETTE.plasmaMembrane} lumenColor="#e6fcf5" opacity={endoO * pit} />
          <ClathrinCage id="clathrin" radius={0.56} amount={coat} opacity={endoO * Math.min(1, coat * 3)} />
          <mesh position={[0, -0.42, 0]} rotation={[Math.PI / 2, 0, 0]} visible={dyn > 0.01}>
            <torusGeometry args={[0.18, 0.06, 8, 20]} />
            <meshStandardMaterial color={PALETTE.dynamin} emissive={PALETTE.dynamin} emissiveIntensity={0.3} transparent opacity={dyn} />
          </mesh>
          {/* the new vesicle refills with neurotransmitter during the last step */}
          {NT_IN.map((p, i) => (
            <Protein key={i} id="neurotransmitter" shape="blob" color={NT} size={0.08} seed={i} position={[p[0] * 1.2, p[1] * 1.2, p[2] * 1.2]} opacity={endoO * smooth(clamp(refill * 1.4 - i / NT_IN.length * 0.4))} />
          ))}
        </group>
      )}
      <Anchor id="clathrin" text={coat > 0.3 ? 'Clathrin-coated pit' : 'Uncoated · back to the pool'} position={[pitPos[0] + 0.7, pitPos[1] + 0.3, 0.8]} show={vis(t, 0.72, 0.9, 0.02)} />
      <Anchor id="synaptic-vesicle" text="Recycled vesicle · refilled" position={[pitPos[0] + 0.5, pitPos[1] + 0.4, 0.6]} show={vis(t, 0.9, 2, 0.02)} />
    </group>
  );
}
