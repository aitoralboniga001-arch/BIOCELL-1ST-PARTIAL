# BioCell kit — writing a scene

Everything a scene needs is imported from `@/three/kit`. The reference scene is
`src/scenes/t7/Signal.tsx`. Read it before writing your own: it uses every part of the contract.

## 1. The contract

A scene is one file, `src/scenes/tN/<Name>.tsx`. Its rules:

- It **default-exports** a component taking `SceneProps` (`@/content/types`): `{ t, stepIndex, focus }`.
  - `t` is the stage time, from 0 to 1.
  - `stepIndex` is the current step.
  - `focus` lists the ids lit right now. You rarely need it, because primitives glow by themselves.
- It is a **pure function of `t`**: no internal clocks, `setTimeout` or random state. Scrubbing back and forth must give the
  same picture. Derive every motion from `t` with the `@/engine/anim` helpers:
  - `seg(t, a, b)`: eased 0..1 between `a` and `b`.
  - `prog(t, a, b)`: linear 0..1.
  - `vis(t, from, to)`: fade in, then fade out.
  - `lerp3`, `clamp`, `smooth`, `easeInOut`, `rand(seed)`.
  - The exception is ambient motion (Brownian jiggle) inside `useFrame`. Call `state.invalidate()` there, and keep it tiny.
- It **exports the step times** as `export const P = [0, .14, .28, ...] as const`. These must equal the stage's `steps[i].at`
  values in the content, so the 3D and the text stay in sync.
- It renders **every structure id** that the stage's steps mention or focus, each with an `<Anchor>`. It must also pass that id to the
  primitive that draws it, so chips and focus can glow it.
- **Registration:** add ONE line to `src/scenes/registry.ts` using Edit, never a rewrite:
  `'t7-ergic': () => import('./t7/Ergic'),`. The key is the stage's `scene` field.
  Unknown ids show the "Scene in preparation" placeholder.
- **Do not render** a `<Canvas>`, lights, background, fog, OrbitControls or HTML overlays. `Stage3D` owns them.

### Skeleton

```tsx
import type { SceneProps } from '@/content/types';
import { seg, vis, lerp3, type V3 } from '@/engine/anim';
import { useStageCamera, Anchor, EdgeTag, Bilayer, Vesicle, PALETTE, type CamKey } from '@/three/kit';

export const P = [0, 0.2, 0.45, 0.7] as const;            // = steps[i].at

const CAM: CamKey[] = [
  { at: 0,    pos: [0, 3, 12], target: [0, 0, 0], fov: 38 },
  { at: 0.18, pos: [0, 3, 12], target: [0, 0, 0], fov: 38 },   // hold (same key repeated)
  { at: 0.26, pos: [3, 2, 7],  target: [0, -0.5, 0] },         // glide in for step 2
];

export default function MyScene({ t }: SceneProps) {
  useStageCamera(CAM);
  const bud = seg(t, 0.2, 0.42);                               // the narrated verb happens here
  const pos = lerp3([0, -0.6, 0], [0, -2.2, 0], bud);
  return (
    <>
      <EdgeTag side="top" text="CYTOSOL" />
      <EdgeTag side="bottom" text="LUMEN" />
      <Bilayer id="er-membrane" width={14} depth={8} />
      <Anchor id="er-membrane" position={[-4, 0, 1]} />
      <Vesicle id="vesicle" position={pos} coat="copii" coatAmount={1 - seg(t, 0.5, 0.6)} />
      <Anchor id="vesicle" position={pos} show={vis(t, 0.2, 1)} />
    </>
  );
}
```

## 2. Coordinates and units

- Units are roughly **1 = 10 nm** at molecular scale. Use the same scale throughout a scene.
- **+y is the cytosol and −y is the lumen** (or the extracellular side / matrix) whenever a membrane is horizontal.
  `Bilayer` lies in the xz plane at y = 0. Its head surfaces sit at ±`BILAYER.surface` (0.625 at thickness 1).
- Keep the specimen within about ±8 of the origin. The fog runs from 16 to 48 from the camera.
- Leave about 15% free margin on the left and right of the frame. That is where the callout columns sit.

## 3. Camera: `useStageCamera(keys)`

- `CamKey = { at, pos, target, fov? }`, with keys sorted by `at`. Between keys the pose is an eased **orbital** blend: the target is lerped,
  the direction nlerped and the radius log-lerped. Moving between keys therefore swings around the specimen and never passes through it.
- **To hold** the camera, repeat the same key at two times. **To glide**, put two different keys about .04–.1 apart in `t`.
- A jump in t (step buttons, scrubber click, reload), or a step change after the user orbited, triggers an automatic
  **1.2 s glide** from wherever the camera is. Never place two keys at the same `at`: that would be a hard cut, which is forbidden.
- Frame **each step's action**. The structures the step talks about must be large and central at that step's `at` and while
  its verb plays out.
- The user can orbit and zoom, but not pan. Double-click or the "reset" tool returns the camera to the keyed pose.
- For framing work, use `?cam=px,py,pz,tx,ty,tz[,fov]`. It overrides all keys with a fixed pose.

## 4. Labels: `<Anchor>` and `<EdgeTag>`

- `<Anchor id position? show? text?>` registers a label point. Its name comes from `topic.structures[id].name`; `text` overrides it.
  - The `position` is local: inside a moving or rotated group it follows the group.
  - Place the **dot well inside the structure's body**, never on a seam or edge. Labels are laid out automatically in edge
    columns with short leaders, so do not try to place the label yourself.
  - `show` (0..1) fades the anchor. Use it for things that appear or leave, e.g. `show={vis(t, .3, .8)}`. An anchor whose structure is
    invisible must have `show = 0`.
  - Which anchors are labelled is decided by the shell: the step's focus and mentions, cumulative through the stage, or all of
    them at the last step, or by L mode (step / all / none). Every id needs an anchor; the shell filters them.
- `<EdgeTag side="top"|"bottom" text="CYTOSOL" />` is the compartment tag at the viewport edge. Use one per side, in capitals.

## 5. Glow and dim

- Every primitive takes `id` (string or string[]). When that id is in focus (because of the step focus or a chip click), it glows with
  an eased emissive lift. **Same id, same structure, same colour everywhere.**
- The `glow` prop (0..1) forces glow from the timeline, e.g. the peptidase at the instant of cleavage: `glow={vis(t,.76,.8)}`.
  It adds to the focus glow.
- The `opacity` prop (0..1) fades the whole primitive. Use it for appearing and leaving things. Hide something when its opacity is 0.
- Custom meshes have two options:
  - `useKitHighlight(materials, id, { glow, opacity, strength, mode })`. Use mode `'boost'` for vertex- or instance-coloured materials.
  - `useGlow(id)` / `useDim(ids)` return eased numbers you can use yourself.

## 6. Palette (`PALETTE`)

**Never hard-code a colour that has a palette entry.** The keys are:

- Membranes: `lipidHead lipidTail membrane erMembrane golgiMembrane plasmaMembrane nuclearEnvelope`.
- Lumens and compartments: `erLumen golgiLumen cytosol nucleoplasm`.
- Translation: `ribosomeLarge ribosomeSmall mrna mrnaBase polypeptide signalPeptide srp srpReceptor translocon signalPeptidase`.
- ER chaperones and folding: `bip calnexin calreticulin pdi`.
- Chromatin: `dna dnaBase acetyl methyl phosphate lamina nuclearPore nucleolus` (plus the histones `h2a h2b h3 h4 h1`).
- Coats and trafficking: `clathrin copi copii caveolin dynamin rab vSnare tSnare gef`.
- Organelles and cargo: `lysosome hydrolase earlyEndosome lateEndosome recyclingEndosome mitochondrion mitoMatrix peroxisome`.
- Ions: `proton calcium`.
- Cytoskeleton: `microtubule actin intermediateFilament`.
- Generic: `neutral cargo receptor`.

`SUGARS` holds the SNFG colours and shapes for `GlcNAc Man Glc Gal Sia`. `UI.accent` is UI only; never use it on a structure.

## 7. Primitives

All primitives accept `KitProps = { position?, rotation?, scale?, id?, opacity?, glow? }`. Additional props are listed below.
Prop arrays such as `points` may be inline literals: geometry is keyed by value. Animated props should be plain numbers or arrays.

### Membranes — `primitives/membrane`

| Primitive | Props | Notes |
|---|---|---|
| `Bilayer` | `width=12 depth=8 curvature holes=[{x,z,r}] spacing=.26 thickness=1 headColor tailColor seed` | Instanced phospholipids in the xz plane. Use `holes` where channels or pores sit. Constants: `BILAYER.half/.head/.surface`. |
| `LumenTint` | `box=[x0,y0,z0,x1,y1,z1] color strength` | Soft tinted volume, e.g. under a bilayer, to read as the lumen. |
| `MembraneSheet` | `shape='plane'\|'sphere'\|'tube' width depth bend radius points length thickness color lumenColor surfaceOpacity` | Cheap continuous membrane for cell or organelle scale. |

### Translation — `primitives/translation`

| Primitive | Props | Notes |
|---|---|---|
| `Ribosome` | `size=1 state='free'\|'bound' largeId smallId` | The exit tunnel points to −y. Use `RIBOSOME.exit / mrnaY / top / radius` (scaled by `size`) to attach things. |
| `MRNA` | `points length radius shift bases` | Animate `shift` to slide the message through the ribosome. |
| `Polypeptide` | `points \| layout(i,made,out) count=40 made spacing=.2 radius=.11 segments=[[from,to,color]] range=[a,b] folded foldCenter surface color seed` | A bead chain. `made` sets how many residues exist (it grows). `range` draws a sub-range (e.g. signal vs mature). `folded` 0..1 collapses it into a globule. `layout` places beads procedurally. |
| `Polyribosome` | `points count size progress` | Several ribosomes on one mRNA with growing chains. |
| `foldedPositions(n, center, seed)` | helper | Globule bead positions. |

### Proteins — `primitives/proteins`

| Primitive | Props | Notes |
|---|---|---|
| `Protein` | `shape='blob'\|'barrel'\|'ring'\|'y' color size seed` | Generic lumpy protein. Use it for chaperones, enzymes and receptors with a palette colour. |
| `SRP` | `color` | Elongated particle. Attachment points are `SRP_SITES.grip` (signal) and `SRP_SITES.alu` (elongation arrest). |
| `SRPReceptor` | `color` | Membrane-anchored. `RECEPTOR_SITE` is where the SRP docks. |
| `MembraneProtein` | `color side='lumen'\|'cytosol' seed size` | A TM anchor plus a domain on one side. |
| `Pore` | `open=0..1 color staves radius=[closed,open] lateralGate plug rim` | Generic channel (ChannelProps). |
| `Translocon` | `open` | Sec61 pore. Its lateral gate faces +x. Put a `Bilayer` hole under it. |
| `NuclearPore` | `size color` | Eight-fold ring complex. |

### Vesicles and coats — `primitives/vesicles`

| Primitive | Props | Notes |
|---|---|---|
| `Vesicle` | `radius coat='clathrin'\|'copi'\|'copii'\|'caveolin'\|null coatAmount coatFrom cargo={count,color,kind:'soluble'\|'membrane',seed} lumenColor color coatId` | `coatAmount` 0..1 assembles or disassembles the coat starting from `coatFrom`. Give the coat a separate glow id with `coatId`. |
| `ClathrinCage` | `radius amount from color` | A lattice that grows from a point. |
| `Triskelion` | `size color` | A single free triskelion. |

### Small things — `primitives/small`

| Primitive | Props | Notes |
|---|---|---|
| `Sugar` | `kind size` | Single SNFG symbol. |
| `Glycan` | `tree: GlycanNode size gap amount` | Branched oligosaccharide. `OLIGO_14` is Glc3Man9GlcNAc2. `amount` grows or trims it. |
| `Ion` | `kind='Ca'\|'H'\|'other' count region={center,size} t seed color size` | Jiggling ions in a box. Pass `t` so they move with time. |
| `Flow` | `points t speed count color size` | Particles streaming along a path (transport arrows without arrows). |
| `Bond` | `a b radius color show` | Stick between two points, e.g. a peptide bond before cleavage or a disulfide. |

### Chromatin — `primitives/chromatin`

| Primitive | Props | Notes |
|---|---|---|
| `DNAHelix` | `length turns radius=.22 points closed amount bpPerTurn` | Double helix along a straight axis or along `points`. `amount` 0..1 builds it. |
| `Nucleosome` | `size tails acetyl methyl h1 dna loosen lite histoneId dnaId` | Octamer plus 1.65 turns of DNA. Use `acetyl`/`methyl` marks on the tails and `loosen` for open chromatin. |
| `ChromatinFiber` | `kind='10nm'\|'30nm' count compact` | `compact` morphs beads-on-a-string into the solenoid. |
| `nucleosomeDNAPath(extra)` | helper | Wrap path points. |

### Organelles — `primitives/organelles` (cell scale)

| Primitive | Props | Notes |
|---|---|---|
| `Cisterna` | `radius=2 thickness=.22 bend aspect color lumenColor` | Flat sac with a swollen rim. |
| `GolgiStack` | `n=5 bend spacing radius ids=[cis…trans] vesicles` | Cis is at −y, trans at +y. Each cisterna can glow separately via `ids`. |
| `ERSheet` | `width depth thickness ribosomes=40 seed ribosomeId` | RER sheet. Use `ribosomes={0}` for a smooth sheet. |
| `ERTubules` | `seed count extent radius` | SER tubule network. |
| `CellBody` | `radius=8 squash color` | Translucent plasma membrane shell. |
| `Nucleus` | `radius pores nucleolus envelopeId poreId nucleolusId` | Envelope with pores and a nucleolus. |
| `Mitochondrion` | `length radius` | Outer membrane and cristae. |
| `Lysosome` | `radius` | |
| `Endosome` | `kind='early'\|'late'\|'recycling' radius ilv` | Early and recycling forms have tubules; late (MVB) has intraluminal vesicles. |

### Cytoskeleton — `primitives/cytoskeleton`

The props are `FilamentProps = { points, radius, color }`. `Microtubule` is a 13-ridge tube, `Actin` two twisted bead strands and
`IntermediateFilament` a four-strand rope.

### Helpers

- Geometry: `lumpySphere(opts)`, `fibonacciSphere(n)`, `curveFrom(points)`, `Polyline` (arc-length lookup without allocation), `segmentMatrix`, `bendGeometry`, `noise3`.
- Materials: `proteinMaterial`, `membraneMaterial`, `nucleicMaterial`, `tintMaterial`, `lipidHead/TailMaterial`.
- `useDisposable(factory, deps)` builds GPU resources once and disposes them on unmount.
- `useStable(value)` keeps an identity-stable copy of an array or object value.

## 8. Rules that review will check

1. **The narrated verb visibly happens** while the step is on screen, and lasts at least about 1.5 s at 1× speed. Stage durations are in the content
   (`stage.duration` seconds), so 1.5 s equals `1.5 / duration` of `t`.
2. **The 3D never contradicts the text.** Read every step's text and `notes` and show exactly that.
3. **No drawn pointers:** no rings, boxes, arrows or reticles. Glow and labels do the pointing.
4. **No hard camera cuts**, and the specimen is never hidden behind overlays.
5. Anchor dots sit inside the structure. Each anchor follows its structure and fades with it.
6. Use palette colours, with one id per structure.
7. Performance: no allocation per frame or per render inside hot paths.
   - Keep scratch `Vector3`s at module level or use `useMemo`.
   - Pass **new arrays** (`[x,y,z]`, `quat.toArray()`) when a value changes. Mutating the same object will not re-render.
   - Memoise point lists that do not depend on `t`.
   - Keep instanced counts fixed.

## 9. Debug URL parameters

All parameters go in the hash query, e.g. `#/t/7/signal?t=0.41&paused=1`. They also work as a page query before the `#`.

| Parameter | Effect |
|---|---|
| `t=0.41` | Load the stage at that time (paused). The URL is not rewritten while debugging. |
| `paused=1` | **Instant mode**: no easing of glow, labels or camera. Use it for deterministic screenshots. |
| `step=3` | Open at step 3 (1-based). This is the normal deep link. |
| `labels=step\|all\|none` | Force the label mode. |
| `cam=px,py,pz,tx,ty,tz[,fov]` | Fixed camera pose that overrides the keys. Use it for framing. |
| `devask=1` | DEV only. Injects a test Learn question into step 2 of stages without one. |

Keyboard: Space plays or pauses, ←/→ moves by step, Shift+←/→ by stage, L cycles labels, R resets the view, F toggles fullscreen.

## 10. Verification routine

1. Run `npx tsc --noEmit` and fix every error.
2. With the dev server on `http://localhost:5180/`, take a screenshot of each step using `scripts/shot.mjs` (headless Chrome or Edge with no dependencies):
   ```
   node scripts/shot.mjs "http://localhost:5180/#/t/7/signal?t=0.41&paused=1" out.png 1440 900 9000
   ```
   It can also run a batch: `node scripts/shot.mjs --jobs jobs.json`, where the file is `[{ "url", "out", "w", "h", "wait", "eval" }]`.
   - It prints console errors and warnings, and exits with code 1 on any error.
   - Headless WebGL is software-rendered at about 1 fps, so **wait at least 7–9 s** and always use `paused=1`.
3. **Look at every screenshot** at 1440×900 and 1024×768. Check:
   - each step's action is visible and framed;
   - the labels do not overlap;
   - the dots are inside their structures;
   - the colours are right;
   - nothing shows that the text does not say.
4. Scrub the whole stage in the dev app at 1× speed: no pops, no cuts, nothing appearing out of nowhere.
