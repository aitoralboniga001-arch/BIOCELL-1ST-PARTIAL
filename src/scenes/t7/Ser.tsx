/**
 * t7-ser — Smooth ER: detox (cytochrome P450) and phospholipid synthesis + flip-flop.
 *
 * World: molecular patch of a smooth-ER membrane (no ribosomes). Bilayer centre y = 0; CYTOSOL +y, SER LUMEN −y.
 * P450 system on the −x side; the lipid-synthesis site on the +x side of the cytosolic leaflet.
 *  0  bare SER bilayer: no ribosomes, membrane of phospholipids
 *  1  a hydrophobic toxin (xenobiotic) slides through the membrane core to cytochrome P450
 *  2  NADPH docks on the reductase; electrons stream to P450; O₂ arrives; one O goes to R, the other leaves as H₂O
 *  3  the oxidised toxin (now polar, R-OH) leaves into the cytosol (water-soluble)
 *  4  two fatty acids + glycerol-P join → phosphatidic acid → phosphate leaves → DAG → + choline → PC in the cytosolic leaflet
 *  5  the new PC flips to the luminal leaflet (flip-flop) and diffuses laterally
 */
import { useMemo } from 'react';
import { CapsuleGeometry, SphereGeometry } from 'three';
import type { SceneProps } from '@/content/types';
import { lerp, lerp3, seg, vis, type V3 } from '@/engine/anim';
import {
  Anchor,
  Bilayer,
  EdgeTag,
  Flow,
  LumenTint,
  MembraneProtein,
  PALETTE,
  Protein,
  proteinMaterial,
  useDisposable,
  useKitHighlight,
  useStageCamera,
  type CamKey,
} from '@/three/kit';

export const P = [0, 0.17, 0.34, 0.52, 0.69, 0.86] as const;

const CAM: CamKey[] = [
  { at: 0, pos: [0, 4.5, 13], target: [0, 0, 0], fov: 38 },
  { at: 0.12, pos: [0, 4.5, 13], target: [0, 0, 0], fov: 38 },
  { at: 0.19, pos: [-3, 2.4, 5.8], target: [-2.6, 0.6, 0], fov: 38 },
  { at: 0.5, pos: [-3.2, 2.5, 5.6], target: [-2.6, 0.8, 0], fov: 38 },
  { at: 0.56, pos: [-2.2, 3.2, 7.4], target: [-2.2, 1.6, 0], fov: 38 },
  { at: 0.66, pos: [-2.2, 3.2, 7.4], target: [-2.2, 1.6, 0], fov: 38 },
  { at: 0.72, pos: [3.4, 2.3, 5.6], target: [3, 0.8, 0], fov: 38 },
  { at: 0.85, pos: [3.4, 2.3, 5.6], target: [3, 0.8, 0], fov: 38 },
  { at: 0.9, pos: [5, 1, 6.4], target: [3.4, 0, 0], fov: 38 },
  { at: 1, pos: [5, 1, 6.4], target: [3.4, 0, 0], fov: 38 },
];

const P450: V3 = [-2.6, 0, 0];
const RED: V3 = [-1.5, 0, 0.5]; // P450 reductase (electron chain partner)

/** A smooth sphere / capsule part with kit glow. */
function Part({ id, position, rotation, color, r = 0.2, len = 0, opacity = 1, glow }: { id: string; position: V3; rotation?: V3; color: string; r?: number; len?: number; opacity?: number; glow?: number }) {
  const geo = useDisposable(() => (len > 0 ? new CapsuleGeometry(r, len, 6, 14) : new SphereGeometry(r, 22, 16)), [r, len]);
  const mats = useDisposable(() => [proteinMaterial(color, { roughness: 0.45 })], [color]);
  useKitHighlight(mats, id, { glow, opacity });
  if (opacity <= 0.001) return null;
  return <mesh geometry={geo} material={mats[0]} position={position} rotation={rotation} />;
}

/** Phospholipid-like assembly (local frame: head at +y, tails pointing −y). */
function Lipid({ t, position, flip }: { t: number; position: V3; flip: number }) {
  // build sub-steps (stage 4 window .69–.86)
  const faIn = seg(t, 0.695, 0.735);
  const join = seg(t, 0.735, 0.765); // acyl transferase esterifies FA to glycerol-P → phosphatidic acid
  const pOff = seg(t, 0.77, 0.795); // phosphate removed → DAG
  const chIn = seg(t, 0.8, 0.83); // choline (with phosphate) added → PC
  const ins = seg(t, 0.83, 0.855); // inserted into cytosolic leaflet
  const show = seg(t, 0.69, 0.7);
  const isPA = join > 0.5 && pOff < 0.5;
  const isDAG = pOff >= 0.5 && chIn < 0.5;
  const isPC = chIn >= 0.5;
  const faA: V3 = lerp3([-1.4, 1.2, 0.6], [-0.13, -0.55, 0], join);
  const faB: V3 = lerp3([1.4, 1.0, -0.5], [0.13, -0.55, 0], join);
  const pPos: V3 = lerp3([0, 0.42, 0], [0.9, 1.6, 0.6], pOff);
  const chPos: V3 = lerp3([-1.2, 1.9, 0.8], [0, 0.62, 0], chIn);
  const base: V3 = lerp3([position[0], 1.5, position[2]], position, ins);
  const fa0 = 0.75 + 0.25 * faIn;
  return (
    <group position={base} rotation={[0, 0, flip * Math.PI]}>
      <group position={[0, (1 - faIn) * 0.6, 0]}>
        <Part id={isPA ? 'phosphatidic-acid' : isDAG ? 'diacylglycerol' : 'phosphatidylcholine'} position={[0, 0.1, 0]} color={PALETTE.lipidHead} r={0.2} opacity={show * fa0} />
        <Anchor id={isPC ? 'phosphatidylcholine' : isDAG ? 'diacylglycerol' : isPA ? 'phosphatidic-acid' : 'phospholipid'} position={[0, 0.1, 0]} show={show * (join > 0.5 ? 1 : 0)} />
      </group>
      <Part id="fatty-acid" position={faA} color={PALETTE.lipidTail} r={0.08} len={0.75} opacity={show * fa0} />
      <Part id="fatty-acid" position={faB} color={PALETTE.lipidTail} r={0.08} len={0.75} opacity={show * fa0} />
      <Anchor id="fatty-acid" position={faA} show={show * (1 - join)} />
      <Part id={isPA ? 'phosphatidic-acid' : 'phosphatidylcholine'} position={chIn > 0 ? [chPos[0], chPos[1] - 0.22, chPos[2]] : pPos} color={PALETTE.phosphate} r={0.14} opacity={show * (chIn > 0 ? chIn : 1 - pOff)} />
      <Part id="choline" position={chPos} color={PALETTE.receptor} r={0.17} opacity={show * seg(t, 0.785, 0.8)} />
      <Anchor id="choline" position={chPos} show={vis(t, 0.79, 0.86) * (1 - flip)} />
    </group>
  );
}

export default function Ser({ t }: SceneProps) {
  useStageCamera(CAM);

  // ——— detox ———
  const toxIn = seg(t, 0.19, 0.31); // toxin slides in the membrane core to P450
  const nadIn = seg(t, 0.355, 0.4);
  const eFlow = vis(t, 0.39, 0.5);
  const o2In = seg(t, 0.4, 0.45);
  const oxid = seg(t, 0.46, 0.5);
  const leave = seg(t, 0.54, 0.66);
  const toxStart: V3 = [-7, 0, 0.4];
  const toxSite: V3 = [P450[0] + 0.15, 0.95, 0.35];
  const toxOut: V3 = [-2.0, 3.4, 1.2];
  const toxPos: V3 = leave > 0 ? lerp3(toxSite, toxOut, leave) : toxIn < 0.6 ? lerp3(toxStart, [-3.6, 0, 0.4], toxIn / 0.6) : lerp3([-3.6, 0, 0.4], toxSite, (toxIn - 0.6) / 0.4);
  const toxColor = oxid > 0.5 ? PALETTE.erLumen : PALETTE.lipidTail;
  const nadPos: V3 = lerp3([0.2, 3.4, 1.6], [RED[0], 1.35, RED[2] + 0.1], nadIn);
  const nadShow = 1 - seg(t, 0.5, 0.56);
  const o2Pos: V3 = lerp3([-4.6, 3.2, 1.4], [toxSite[0] - 0.35, toxSite[1] + 0.3, toxSite[2]], o2In);
  const waterPos: V3 = lerp3([toxSite[0] - 0.35, toxSite[1] + 0.3, toxSite[2]], [-4.4, 3.0, 1.8], seg(t, 0.49, 0.58));
  const showO2 = seg(t, 0.39, 0.41);
  const ePath = useMemo<V3[]>(() => [[RED[0], 1.3, RED[2] + 0.1], [-1.9, 1.35, 0.35], [-2.3, 1.15, 0.2], [P450[0], 1.0, 0.1]], []);

  // ——— lipids ———
  const flip = seg(t, 0.875, 0.93);
  const lat = seg(t, 0.93, 0.995);
  const lipidBase: V3 = [lerp(3, 3.0, flip) + lat * 1.4, lerp(0.42, -0.42, flip), lat * 0.4];

  return (
    <>
      <EdgeTag side="top" text="CYTOSOL" />
      <EdgeTag side="bottom" text="SER LUMEN" />
      <Bilayer id={['ser', 'phospholipid', 'cytosolic-leaflet', 'luminal-leaflet']} width={16} depth={9} holes={[{ x: P450[0], z: 0, r: 0.6 }, { x: RED[0], z: RED[2], r: 0.45 }, { x: 3, z: 0, r: 0.45 }]} seed={7} />
      <LumenTint id="ser" box={[-30, 30, -26, -0.68, -30, 30]} color={PALETTE.erLumen} strength={0.14} />
      <Anchor id="ser" position={[-5.5, -0.1, -1.2]} />
      <Anchor id="phospholipid" position={[1.2, 0.5, 1.4]} />
      <Anchor id="cytosolic-leaflet" position={[5.5, 0.45, 1.2]} />
      <Anchor id="luminal-leaflet" position={[5.5, -0.45, 1.2]} />

      {/* P450 system */}
      <MembraneProtein id="cytochrome-p450" position={P450} side="cytosol" color={PALETTE.mitochondrion} size={1.2} seed={11} />
      <Anchor id="cytochrome-p450" position={[P450[0] + 0.1, 1.05, 0.05]} />
      <MembraneProtein id="cytochrome-p450" position={RED} side="cytosol" color={PALETTE.pdi} size={0.9} seed={23} />
      <Protein id="nadph" position={nadPos} color={PALETTE.gef} size={0.42} seed={3} opacity={nadShow * seg(t, 0.34, 0.36)} />
      <Anchor id="nadph" position={nadPos} show={vis(t, 0.34, 0.54)} />
      <Flow id="cytochrome-p450" points={ePath} t={t * 40} speed={1} count={10} color={PALETTE.calcium} size={0.06} opacity={eFlow} />
      <Part id="oxygen" position={[o2Pos[0] - 0.12, o2Pos[1], o2Pos[2]]} color={PALETTE.proton} r={0.13} opacity={showO2 * (1 - oxid)} />
      <Part id="oxygen" position={[o2Pos[0] + 0.12, o2Pos[1], o2Pos[2]]} color={PALETTE.proton} r={0.13} opacity={showO2 * (1 - oxid)} />
      <Part id="oxygen" position={waterPos} color={PALETTE.proton} r={0.14} opacity={oxid * (1 - seg(t, 0.6, 0.66))} />
      <Anchor id="oxygen" position={oxid > 0.5 ? waterPos : o2Pos} show={vis(t, 0.39, 0.6)} text={oxid > 0.5 ? 'H₂O' : undefined} />
      <Protein id="xenobiotic" position={toxPos} color={toxColor} size={0.42} seed={5} opacity={seg(t, 0.17, 0.2) * (1 - seg(t, 0.68, 0.7))} />
      <Part id="xenobiotic" position={[toxPos[0] + 0.24, toxPos[1] + 0.12, toxPos[2]]} color={PALETTE.proton} r={0.1} opacity={oxid * (1 - seg(t, 0.68, 0.7))} />
      <Anchor id="xenobiotic" position={toxPos} show={vis(t, 0.18, 0.68)} />

      {/* phospholipid synthesis + flip-flop */}
      <Lipid t={t} position={lipidBase} flip={flip} />
    </>
  );
}
