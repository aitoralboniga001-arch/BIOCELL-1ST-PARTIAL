/**
 * t8-sphingo — Sphingolipid synthesis: ceramide made in the SER, carried to the Golgi by a transfer protein,
 * finished there (sugars → glycosphingolipids, phosphocholine → sphingomyelin), exported in vesicles.
 *
 * World (membrane scale, seen edge-on): SER membrane on the left (x ≈ −5.6), Golgi membrane on the right
 * (x ≈ 5.9), both at y = 0 with their LUMEN ABOVE and the cytosol below. The plasma membrane lies further down
 * (y = −7; extracellular space below it). Ceramides sit on the front edge of the membranes (z = 0.7): head bead
 * + two tails (sphingosine + fatty acid). Head groups point into the lumen once in the luminal leaflet.
 *
 *  0  a ceramide close up: ceramide + polar groups = sphingolipid
 *  1  ceramide is made in the SER (cytosolic leaflet)
 *  2  ceramide translocators carry it through the cytosol to the Golgi — no vesicles
 *  3  sugars are added → glycosphingolipids (cerebroside, ganglioside)
 *  4  phosphocholine is added → sphingomyelin
 *  5  a secretory vesicle takes them to the plasma membrane
 */
import type { SceneProps } from '@/content/types';
import { lerp, seg, smooth, vis, type V3 } from '@/engine/anim';
import { Anchor, Bilayer, EdgeTag, LumenTint, PALETTE, Protein, Sugar, Vesicle, proteinMaterial, useDisposable, useKitHighlight, useStageCamera, type CamKey, type SugarKind } from '@/three/kit';
import { Capsule } from '../t7/parts/molecules';

export const P = [0, 0.17, 0.34, 0.52, 0.69, 0.86] as const;

const Z = 0.7;
const SER_X = -5.6;
const GOL_X = 5.9;
const PM_Y = -7;
const CER = '#ff922b';
const TAIL = '#ffd8a8';
const CHOLINE = '#4dabf7';
const SM_COL = '#22b8cf';

type Head = 'Glc' | 'Gal' | 'Sia' | 'P' | 'Cho';
interface HeadPart {
  kind: Head;
  on: number;
}

function Bead({ pos, r, color, id, glow, opacity = 1 }: { pos: V3; r: number; color: string; id?: string | string[]; glow?: number; opacity?: number }) {
  const mats = useDisposable(() => [proteinMaterial(color, { roughness: 0.4, emissive: 0.15 })], [color]);
  useKitHighlight(mats, id, { glow, opacity });
  if (opacity <= 0.002) return null;
  return (
    <mesh position={pos} material={mats[0]} scale={r}>
      <sphereGeometry args={[1, 16, 12]} />
    </mesh>
  );
}

/**
 * One ceramide-based lipid. Local frame: head bead at the origin, tails along −y (into the membrane), polar
 * groups stacked along +y. `rot` = rotation about z (π = head down, i.e. cytosolic leaflet of a lumen-up membrane).
 */
function Ceramide({ pos, rot = 0, scale = 1, heads = [], t, opacity = 1, glow = 0 }: { pos: V3; rot?: number; scale?: number; heads?: HeadPart[]; t: number; opacity?: number; glow?: number }) {
  const shown = heads.map((h) => ({ ...h, o: smooth(seg(t, h.on, h.on + 0.012)) }));
  const sugars = shown.some((h) => h.o > 0.5 && (h.kind === 'Glc' || h.kind === 'Gal'));
  const sia = shown.some((h) => h.o > 0.5 && h.kind === 'Sia');
  const pc = shown.some((h) => h.o > 0.5 && h.kind === 'P');
  const ids = ['ceramide', ...(sugars ? ['glycosphingolipid'] : []), ...(sia ? ['ganglioside'] : []), ...(pc ? ['sphingomyelin'] : [])];
  if (opacity <= 0.002) return null;
  let y = 0.14;
  return (
    <group position={pos} rotation={[0, 0, rot]} scale={scale}>
      <Bead pos={[0, 0, 0]} r={0.12} color={CER} id={ids} glow={glow} opacity={opacity} />
      {/* sphingosine (with its trans double bond kink) + fatty acid */}
      <Capsule a={[-0.06, -0.06, 0]} b={[-0.07, -0.25, 0]} r={0.042} color={TAIL} id={ids} opacity={opacity} />
      <Capsule a={[-0.07, -0.25, 0]} b={[-0.09, -0.44, 0]} r={0.042} color={TAIL} id={ids} opacity={opacity} />
      <Capsule a={[0.07, -0.06, 0]} b={[0.08, -0.44, 0]} r={0.042} color={TAIL} id={ids} opacity={opacity} />
      {shown.map((h, i) => {
        if (h.o <= 0.01) return null;
        const step = h.kind === 'P' || h.kind === 'Cho' ? 0.19 : 0.25;
        y += i === 0 ? 0.08 : step;
        const p: V3 = [h.kind === 'Sia' ? 0.2 : 0, h.kind === 'Sia' ? y - 0.22 : y, 0];
        if (h.kind === 'Sia') y -= step;
        const pop = 1 + 0.4 * Math.sin(Math.PI * seg(t, h.on, h.on + 0.012));
        if (h.kind === 'P') return <Bead key={i} pos={p} r={0.1 * h.o * pop} color={PALETTE.phosphate} id={['phosphocholine', ...ids]} opacity={opacity} />;
        if (h.kind === 'Cho') return <Bead key={i} pos={p} r={0.11 * h.o * pop} color={CHOLINE} id={['phosphocholine', ...ids]} opacity={opacity} />;
        return <Sugar key={i} kind={h.kind as SugarKind} position={p} size={0.55 * h.o * pop} id={ids} opacity={opacity} />;
      })}
    </group>
  );
}

// ---- slots ----------------------------------------------------------------------------------------------------
const SX = [-7.6, -6.6, -5.6, -4.6, -3.6];
const SER_MADE = (k: number) => 0.19 + 0.022 * k;
const GX = [3.4, 4.4, 5.4, 6.4, 7.4, 8.4];
/** CERT k takes SER ceramide CERT_FROM[k] to Golgi slot CERT_TO[k] */
const CERT_FROM = [1, 2, 3];
const CERT_TO = [0, 2, 4];
const PICK = [0.37, 0.39, 0.41];
const ARRIVE = [0.43, 0.45, 0.47];
const CERT_Y = -1.15;
const HEADS: Record<number, HeadPart[]> = {
  1: [
    { kind: 'Glc', on: 0.55 },
    { kind: 'Gal', on: 0.58 },
    { kind: 'Sia', on: 0.61 },
  ],
  3: [{ kind: 'Gal', on: 0.565 }],
  0: [
    { kind: 'P', on: 0.72 },
    { kind: 'Cho', on: 0.725 },
  ],
  4: [
    { kind: 'P', on: 0.75 },
    { kind: 'Cho', on: 0.755 },
  ],
  2: [
    { kind: 'P', on: 0.78 },
    { kind: 'Cho', on: 0.785 },
  ],
  5: [],
};

const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
/** CERT position: comes up from the cytosol, docks under the SER, arcs across, docks under the Golgi, leaves */
function certAt(t: number, k: number): { pos: V3; o: number } {
  const sx = SX[CERT_FROM[k]];
  const gx = GX[CERT_TO[k]];
  const dockS: V3 = [sx, CERT_Y, Z];
  const dockG: V3 = [gx, CERT_Y, Z];
  const tp = PICK[k];
  const ta = ARRIVE[k];
  const o = vis(t, tp - 0.025, ta + 0.04, 0.012);
  if (t < tp) return { pos: lerp3([sx - 0.4, -3.0, Z], dockS, smooth(seg(t, tp - 0.025, tp - 0.004))), o };
  if (t < ta) {
    const u = smooth(seg(t, tp + 0.008, ta - 0.004));
    const p = lerp3(dockS, dockG, u);
    p[1] -= 2.2 * Math.sin(Math.PI * u);
    return { pos: p, o };
  }
  return { pos: lerp3(dockG, [gx + 0.5, -3.0, Z], smooth(seg(t, ta + 0.012, ta + 0.04))), o };
}

const CAM: CamKey[] = [
  { at: 0, pos: [0.2, -1.5, 6.4], target: [0, -2.0, 1.2], fov: 40 },
  { at: 0.15, pos: [0.1, -1.5, 6.2], target: [0, -2.0, 1.2], fov: 40 },
  { at: 0.2, pos: [-5.6, -1.4, 7.0], target: [-5.6, -0.5, 0], fov: 40 },
  { at: 0.33, pos: [-5.6, -1.4, 6.8], target: [-5.6, -0.5, 0], fov: 40 },
  { at: 0.37, pos: [0, -1.6, 13.2], target: [0, -1.0, 0], fov: 40 },
  { at: 0.5, pos: [0, -1.6, 13.0], target: [0, -1.0, 0], fov: 40 },
  { at: 0.54, pos: [5.9, -0.2, 6.6], target: [5.9, 0.5, 0], fov: 40 },
  { at: 0.67, pos: [5.9, -0.2, 6.4], target: [5.9, 0.5, 0], fov: 40 },
  { at: 0.71, pos: [5.9, -0.3, 6.6], target: [5.9, 0.4, 0], fov: 40 },
  { at: 0.85, pos: [5.9, -0.3, 6.4], target: [5.9, 0.4, 0], fov: 40 },
  { at: 0.89, pos: [5.0, -3.2, 14.0], target: [5.0, -3.4, 0], fov: 40 },
  { at: 1, pos: [5.0, -3.2, 14.2], target: [5.0, -3.4, 0], fov: 40 },
];

export default function SphingoScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const heroO = vis(t, -1, 0.17, 0.03);
  const certs = [0, 1, 2].map((k) => certAt(t, k));

  // SER ceramides (cytosolic leaflet: head down at y = −0.5)
  const ser = SX.map((x, k) => {
    const made = smooth(seg(t, SER_MADE(k), SER_MADE(k) + 0.02));
    const c = CERT_FROM.indexOf(k);
    let pos: V3 = [x, -0.5, Z];
    let o = made;
    if (c >= 0 && t >= PICK[c]) {
      const into = smooth(seg(t, PICK[c], PICK[c] + 0.008));
      const cp = certs[c].pos;
      pos = lerp3(pos, [cp[0], cp[1] + 0.05, Z + 0.35], into);
      if (t >= ARRIVE[c]) o = 0; // handed to the Golgi slot below
    }
    return { pos, o, glow: 0.5 * vis(t, SER_MADE(k), SER_MADE(k) + 0.04, 0.01) };
  });

  // Golgi ceramides: slots 1, 3, 5 already there (luminal leaflet); 0, 2, 4 delivered by CERT then flipped
  const golgi = GX.map((x, k) => {
    const c = CERT_TO.indexOf(k);
    if (c < 0) return { pos: [x, 0.5, Z] as V3, rot: 0, o: vis(t, 0.34, 2, 0.02) };
    const ta = ARRIVE[c];
    if (t < ta) return { pos: [x, 0.5, Z] as V3, rot: 0, o: 0 };
    const cp = certs[c].pos;
    const ins = smooth(seg(t, ta, ta + 0.008));
    const flip = smooth(seg(t, ta + 0.012, ta + 0.032));
    const p = lerp3([cp[0], cp[1] + 0.05, Z + 0.35], [x, -0.5, Z], ins);
    p[1] = lerp(p[1], 0.5, flip);
    return { pos: p, rot: Math.PI * (1 - flip), o: 1 };
  });

  // export: a secretory vesicle buds into the cytosol and fuses with the plasma membrane
  const bud = smooth(seg(t, 0.87, 0.9));
  const go = smooth(seg(t, 0.9, 0.96));
  const fuse = smooth(seg(t, 0.96, 0.99));
  const vesO = bud * (1 - fuse);
  const vesPos: V3 = [GOL_X, lerp(-1.4, PM_Y + 1.25, go), Z];
  const pmO = vis(t, 0.86, 2, 0.02);
  const pmSm = smooth(seg(t, 0.965, 0.995));

  return (
    <group>
      <EdgeTag side="top" text="LUMEN (ER · Golgi)" />
      <EdgeTag side="left" text="SER" />
      <EdgeTag side="right" text="GOLGI" />
      <Bilayer id="ser" width={7} depth={5} position={[SER_X, 0, -2]} seed={4} />
      <Bilayer id="golgi" width={7} depth={5} position={[GOL_X, 0, -2]} seed={7} />
      <LumenTint box={[SER_X - 3.5, SER_X + 3.5, 5, 0.55, -4.5, 0.5]} color={PALETTE.erLumen} strength={0.18} />
      <LumenTint box={[GOL_X - 3.5, GOL_X + 3.5, 5, 0.55, -4.5, 0.5]} color={PALETTE.golgiLumen} strength={0.18} />
      <Anchor id="ser" position={[SER_X - 2.6, 0.55, 0.6]} />
      <Anchor id="golgi" position={[GOL_X + 2.6, 0.55, 0.6]} />

      {/* step 0: one ceramide, large */}
      <group rotation={[0, t * 6, 0]} position={[0, -2.0, 1.2]}>
        <Ceramide pos={[0, 0.3, 0]} scale={2.6} t={t} opacity={heroO} glow={0.2} />
      </group>
      <Anchor id="ceramide" position={[0.35, -1.6, 1.4]} show={heroO} />

      {ser.map((c, k) => (
        <Ceramide key={k} pos={c.pos} rot={Math.PI} t={t} opacity={c.o} glow={c.glow} />
      ))}
      <Anchor id="ceramide" position={[SX[0] + 0.1, -0.75, Z + 0.1]} show={vis(t, SER_MADE(0) + 0.01, 0.52, 0.02)} />

      {certs.map((c, k) => (
        <Protein key={k} id="ceramide-translocator" shape="blob" color="#94d82d" size={0.75} seed={11 + k} position={c.pos} opacity={c.o} />
      ))}
      <Anchor id="ceramide-translocator" position={[certs[1].pos[0], certs[1].pos[1] - 0.3, Z + 0.3]} show={certs[1].o} />

      {golgi.map((c, k) => (
        <Ceramide key={k} pos={c.pos} rot={c.rot} heads={HEADS[k]} t={t} opacity={c.o} />
      ))}
      <Anchor id="glycosphingolipid" position={[GX[3] + 0.15, 0.95, Z]} show={vis(t, 0.57, 0.86, 0.02)} />
      <Anchor id="ganglioside" position={[GX[1] - 0.05, 1.3, Z]} show={vis(t, 0.62, 0.86, 0.02)} />
      <Anchor id="phosphocholine" position={[GX[0], 0.85, Z]} show={vis(t, 0.73, 0.86, 0.02)} />
      <Anchor id="sphingomyelin" position={[GX[4] + 0.1, 0.75, Z]} show={vis(t, 0.76, 2, 0.02)} />

      {/* plasma membrane + secretory vesicle */}
      <Bilayer id="plasma-membrane" width={10} depth={5} position={[GOL_X, PM_Y, -2]} seed={9} opacity={pmO} />
      <Anchor id="plasma-membrane" position={[GOL_X + 3.6, PM_Y - 0.6, 0.6]} show={pmO} />
      {vesO > 0.01 && (
        <group position={vesPos} scale={0.3 + 0.7 * bud}>
          <Vesicle id="secretory-vesicle" radius={0.75} lumenColor={PALETTE.golgiLumen} cargo={{ count: 6, color: SM_COL, kind: 'membrane', seed: 3 }} opacity={vesO} />
        </group>
      )}
      <Anchor id="secretory-vesicle" position={[vesPos[0] + 0.6, vesPos[1], vesPos[2] + 0.4]} show={vesO} />
      {[-0.6, 0, 0.6].map((dx, k) => (
        <Ceramide key={k} pos={[GOL_X + dx, PM_Y - 0.5, Z]} rot={Math.PI} heads={[{ kind: 'P', on: -1 }, { kind: 'Cho', on: -1 }]} t={t} opacity={pmSm} />
      ))}
      <Anchor id="sphingomyelin" position={[GOL_X + 0.6, PM_Y - 0.95, Z + 0.1]} show={pmSm} />
    </group>
  );
}
