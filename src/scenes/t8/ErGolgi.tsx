/**
 * t8-er-golgi — Two-way traffic between the ER and the Golgi (organelle scale).
 *
 * World: same stack as the other t8 scenes (axis +x, cis on the left at x ≈ −0.84, TGN on the right); the ER
 * sheet stands at x = −6.4. COPII vesicles run ER → cis along the lower route, COPI vesicles cis → ER along the
 * upper one. Yellow = secretory protein, pink = ER-resident protein (with its KDEL tag).
 *
 *  0  an ER protein escapes to the Golgi with the secretory cargo: it must be brought back
 *  1  anterograde: a stream of COPII-coated vesicles leaves the ER for the cis-Golgi
 *  2  inside one vesicle: secretory and ER-resident proteins travel together; it fuses with the CGN
 *  3  the KDEL tag of the ER proteins is caught by KDEL receptors in the Golgi membrane
 *  4  retrograde: COPI-coated vesicles carry them back to the ER
 *  5  the loop: COPII out, COPI back
 */
import type { SceneProps } from '@/content/types';
import { clamp, lerp, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, EdgeTag, PALETTE, Protein, Vesicle, useStageCamera, type CamKey } from '@/three/kit';
import { Cisterna } from './parts/Cisterna';
import { GolgiStack, X0, along, curve, loop } from './parts/stack';

export const P = [0, 0.17, 0.34, 0.52, 0.69, 0.86] as const;

const ER_X = -6.4;
const SEC = PALETTE.signalPeptide; // yellow
const ERP = '#f783ac'; // pink
const KDEL_COL = '#ff4d6d';
const T = {
  first: [0.04, 0.14],
  copii: 0.17,
  hero: [0.36, 0.47],
  fuse: [0.47, 0.5],
  bind: [0.55, 0.62],
  copi: 0.69,
} as const;

const COPII_PATH = curve([
  [ER_X + 0.45, -1.0, 0.4],
  [-3.6, -1.7, 0.9],
  [X0 - 0.32, -0.8, 0.4],
]);
const COPI_PATH = curve([
  [X0 - 0.32, 1.0, 0.4],
  [-3.6, 1.9, 0.9],
  [ER_X + 0.45, 1.1, 0.4],
]);
const RELEASE: V3 = [X0 + 0.05, -0.55, 0.3];
const RECEPTORS: V3[] = [
  [X0 + 0.02, -0.15, 0.45],
  [X0 + 0.02, 0.35, 0.45],
];

const CAM: CamKey[] = [
  { at: 0, pos: [-3.0, 1.6, 12.5], target: [-3.3, 0, 0], fov: 40 },
  { at: 0.15, pos: [-3.0, 1.5, 12.2], target: [-3.3, 0, 0], fov: 40 },
  { at: 0.21, pos: [-3.4, -0.4, 9.0], target: [-3.6, -0.9, 0.4], fov: 40 },
  { at: 0.33, pos: [-3.4, -0.4, 8.8], target: [-3.6, -0.9, 0.4], fov: 40 },
  { at: 0.38, pos: [-4.6, -1.0, 4.6], target: [-4.6, -1.5, 0.8], fov: 38 },
  { at: 0.46, pos: [-1.6, -0.6, 4.4], target: [-1.5, -1.0, 0.6], fov: 38 },
  { at: 0.51, pos: [-0.4, -0.3, 4.4], target: [X0, -0.5, 0.4], fov: 38 },
  { at: 0.56, pos: [0.4, 0.2, 4.0], target: [X0, -0.1, 0.4], fov: 36 },
  { at: 0.67, pos: [0.4, 0.2, 3.9], target: [X0, -0.05, 0.4], fov: 36 },
  { at: 0.73, pos: [-3.0, 2.4, 8.6], target: [-3.4, 1.3, 0.5], fov: 40 },
  { at: 0.84, pos: [-3.0, 2.3, 8.4], target: [-3.4, 1.3, 0.5], fov: 40 },
  { at: 0.9, pos: [-2.8, 1.4, 13.0], target: [-3.2, 0, 0], fov: 40 },
  { at: 1, pos: [-2.8, 1.4, 13.2], target: [-3.2, 0, 0], fov: 40 },
];

/** ER-resident protein with its KDEL tail (four small beads) */
function ErProtein({ pos, o = 1, glow = 0 }: { pos: V3; o?: number; glow?: number }) {
  return (
    <group position={pos}>
      <Protein id="er-resident-protein" shape="blob" color={ERP} size={0.16} seed={4} opacity={o} />
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} position={[0.08 + k * 0.035, -0.07 - k * 0.012, 0.02]}>
          <sphereGeometry args={[0.022, 8, 6]} />
          <meshStandardMaterial color={KDEL_COL} emissive={KDEL_COL} emissiveIntensity={0.3 + glow} transparent opacity={o} />
        </mesh>
      ))}
    </group>
  );
}

export default function ErGolgiScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const first = seg(t, T.first[0], T.first[1]);
  const hero = smooth(seg(t, T.hero[0], T.hero[1]));
  const fuse = seg(t, T.fuse[0], T.fuse[1]);
  const bind = smooth(seg(t, T.bind[0], T.bind[1]));
  const copiiOn = t >= T.copii;
  const copiOn = t >= T.copi;
  const heroShow = vis(t, T.hero[0] - 0.015, T.fuse[1], 0.012);
  const released = vis(t, T.fuse[0] + 0.01, 2, 0.015);

  const heroPos = along(COPII_PATH, hero * 0.97).pos;
  const firstPos = along(COPII_PATH, first).pos;
  const firstShow = vis(t, T.first[0], T.first[1] + 0.02, 0.012);

  return (
    <group>
      <EdgeTag side="left" text="← ER" />
      <EdgeTag side="right" text="GOLGI: cis → trans" />

      {/* ER sheet */}
      <group position={[ER_X, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <Cisterna R={3.2} seed={9} fen={0} bend={0.04} color={PALETTE.erMembrane} lumenColor={PALETTE.erLumen} id="er" />
      </group>
      <Anchor id="er" position={[ER_X, -1.8, 0.3]} />

      {/* Golgi stack (first cisterna = CGN) */}
      <GolgiStack ids={(i) => (i === 0 ? ['cgn', 'golgi'] : ['golgi'])} />
      <Anchor id="golgi" position={[-X0, 1.4, -0.2]} />
      <Anchor id="cgn" position={[X0, 2.5, 0.2]} />

      {/* step 0: the first COPII vesicle with both kinds of cargo */}
      {firstShow > 0.01 && (
        <group position={firstPos}>
          <Vesicle radius={0.3} coat="copii" coatAmount={1 - seg(first, 0.85, 1)} coatId="copii" lumenColor={PALETTE.erLumen} cargo={{ count: 3, color: SEC, seed: 2 }} opacity={firstShow} />
          <ErProtein pos={[0.05, 0.08, 0.1]} o={firstShow} />
        </group>
      )}

      {/* anterograde: COPII vesicles ER → cis */}
      {copiiOn &&
        [0, 1, 2].map((i) => {
          const a = along(COPII_PATH, loop((t - T.copii) * 18, i, 3), 0.1);
          const u = loop((t - T.copii) * 18, i, 3);
          return (
            <group key={i} position={a.pos} scale={a.s}>
              <Vesicle radius={0.26} coat="copii" coatAmount={1 - clamp((u - 0.75) / 0.2)} coatId="copii" lumenColor={PALETTE.erLumen} cargo={{ count: 3, color: SEC, seed: i }} id="transport-vesicle" />
              <ErProtein pos={[0.04, 0.06, 0.08]} />
            </group>
          );
        })}
      <Anchor id="copii" position={COPII_PATH.getPointAt(0.35).toArray() as V3} show={copiiOn ? 1 : 0} />

      {/* step 2: one vesicle up close; fuses with the CGN and releases its cargo */}
      {heroShow > 0.01 && (
        <group position={heroPos} scale={1 - 0.6 * fuse}>
          <Vesicle radius={0.5} coat="copii" coatAmount={1 - clamp((hero - 0.75) / 0.2)} coatId="copii" lumenColor={PALETTE.erLumen} opacity={heroShow * (1 - fuse)} />
          {[
            [-0.15, 0.12, 0.1],
            [0.15, -0.1, 0.05],
            [0.0, -0.18, -0.12],
          ].map((p, k) => (
            <Protein key={k} id="secretory-protein" shape="blob" color={SEC} size={0.16} seed={10 + k} position={p as V3} opacity={heroShow * (1 - fuse)} />
          ))}
          <ErProtein pos={[0.12, 0.16, -0.05]} o={heroShow * (1 - fuse)} />
          <ErProtein pos={[-0.18, -0.08, -0.1]} o={heroShow * (1 - fuse)} />
          <Anchor id="secretory-protein" position={[-0.15, 0.12, 0.2]} show={heroShow * (1 - fuse)} />
        </group>
      )}

      {/* step 3: released into the CGN lumen; the KDEL tags are caught by KDEL receptors */}
      {RECEPTORS.map((r, k) => (
        <Protein key={k} id="kdel-receptor" shape="y" color="#4dabf7" size={0.32} position={r} rotation={[0, 0, -Math.PI / 2]} opacity={released} glow={0.3 * bind} />
      ))}
      <Anchor id="kdel-receptor" position={RECEPTORS[1]} show={released} />
      {released > 0.01 &&
        [0, 1].map((k) => {
          const from: V3 = [RELEASE[0] + 0.05 * k, RELEASE[1] - 0.1 * k, RELEASE[2] - 0.05];
          const to: V3 = [RECEPTORS[k][0] - 0.24, RECEPTORS[k][1] - 0.02, RECEPTORS[k][2]];
          const p: V3 = [lerp(from[0], to[0], bind), lerp(from[1], to[1], bind), lerp(from[2], to[2], bind)];
          const leave = vis(t, 0, T.copi + 0.02, 0.02);
          return <ErProtein key={k} pos={p} o={released * leave} glow={0.5 * bind} />;
        })}
      <Anchor id="er-resident-protein" position={[RECEPTORS[0][0] - 0.26, RECEPTORS[0][1], RECEPTORS[0][2] + 0.1]} show={released} />
      <Anchor id="kdel-signal" position={[RECEPTORS[0][0] - 0.16, RECEPTORS[0][1] - 0.08, RECEPTORS[0][2] + 0.12]} show={released * vis(t, T.bind[0], T.copi + 0.02, 0.02)} />

      {/* retrograde: COPI vesicles cis → ER carrying the ER proteins (and their receptors) */}
      {copiOn &&
        [0, 1, 2].map((i) => {
          const u = loop((t - T.copi) * 18, i, 3);
          const a = along(COPI_PATH, u, 0.1);
          return (
            <group key={i} position={a.pos} scale={a.s}>
              <Vesicle radius={0.26} coat="copi" coatAmount={1 - clamp((u - 0.75) / 0.2)} coatId="copi" lumenColor={PALETTE.golgiLumen} id="transport-vesicle" />
              <ErProtein pos={[0.0, 0.02, 0.06]} />
              <ErProtein pos={[-0.1, -0.08, -0.04]} />
            </group>
          );
        })}
      <Anchor id="copi" position={COPI_PATH.getPointAt(0.4).toArray() as V3} show={copiOn ? 1 : 0} />
    </group>
  );
}
