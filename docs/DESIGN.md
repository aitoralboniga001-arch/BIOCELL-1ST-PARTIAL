# BioCell Atlas — design contract

Interactive 3D study simulator for Cell Biology (1st Medicine), topics 6–10 of the 1st partial:
**6 Chromatin & nucleus · 7 Endoplasmic reticulum · 8 Golgi apparatus · 9 Vesicular trafficking · 10 Endosomal compartment.**

It is the cell-biology sibling of the owner's embryology app "EnbrioAtlas" (`C:\Users\aitor\Downloads\1 MEDICINA`, topics 10–12 are the model).
Same product idea: each topic is a sequence of **stages**; each stage is a **3D scene that plays like a film** over time t∈[0,1], split into **steps**; for every step the student reads an explanation taken from the notes while the 3D shows exactly that, with labelled structures. UI language: **English**.

Sources (authoritative, already extracted): `sources/*.txt` (+ figures in `sources/*_media`, `sources/*_pages`).
Student notes contain a few errors; we keep what the notes say and flag the conflict in `topic.sourceIssues` (shown in the Summary page) — never silently rewrite.

## Stack
Vite 8 + React 19 + TypeScript + three 0.186 + @react-three/fiber 9.7 + @react-three/drei 10.7.
`npm run dev` (port 5180). `npm run build` → one self-contained `dist/index.html` (vite-plugin-singlefile) that must work offline by double-click: **no network assets** (no HDR files, no web fonts, no CDN). Use drei `<Environment>` with `<Lightformer>` children only (procedural), system font stack.

## Files
```
src/content/types.ts         content model (FIXED contract — read it)
src/content/t6.ts … t10.ts   one Topic per file (default export)
src/content/index.ts         TOPICS registry [t6, t7, t8, t9, t10]
src/engine/anim.ts           seg / vis / prog / lerp / stepAt / rand (FIXED)
src/engine/timeline.ts       playback store (t, playing, speed, step pauses)
src/three/kit/*              reusable 3D primitives + Stage3D + camera + anchors (platform)
src/three/kit/palette.ts     THE colour table — same thing, same colour, every topic
src/scenes/registry.ts       scene id → React.lazy(() => import('./tN/File'))
src/scenes/t6/*.tsx …        scenes, one file per stage (or shared per topic)
src/ui/*                     shell (pages, panels, timeline, quiz, glossary, summary)
```

## Layout (mirror EnbrioAtlas, dark theme)
- **Top bar**: logo "BioCell Atlas"; topic picker (pill "7 · Endoplasmic reticulum" ▾); tabs **Simulation · Summary · Quiz · Glossary**; voice toggle; help (?).
- **Stage header** (left, above viewport): "Stage 3/9 ▾" dropdown + stage title + subtitle chip.
- **Viewport** (big, rounded, near-black #0b0d10 with subtle radial vignette): R3F canvas + callout overlay. Top-right tool column: labels mode (step / all / none, key L), reset view, zoom ±, fullscreen. Hint "Drag to rotate · scroll to zoom · double-click resets" fades after first drag.
- **Right panel** (≈300px): "Today" list of stages with numbers (current highlighted, click to go); below it for the current step: **Key** card, **Careful** card, **Exam** line; source line at bottom.
- **Bottom dock** under the viewport: step text panel (step title, bold `idea`, then `text` with structure chips) and the **timeline**: play/pause, prev/next step, prev/next stage, scrubber with a tick per step (hover shows step title), "Step 3/7", speed 0.5×/1×/1.5×/2×, toggle "Pause at each step" (default ON), voice (Web Speech API, English voice reads idea+text; when on, playback waits for speech to end before leaving a step).
- **Learn mode**: when a step has `ask`, at its end the dock shows the question (4 options, explanation per option after answering) before continuing. Answers saved in localStorage.
- **Summary** tab: per stage keyPoints + every step `exam` + `caution`, plus the topic's sourceIssues block. Printable (print CSS).
- **Quiz** tab: all `ask`s of the topic + `topic.quiz`, shuffled; score + review; best score per topic in localStorage.
- **Glossary** tab: all structures (swatch, name, aka, desc) with search; "Show in 3D" → jumps to the first step that focuses it.
- **Home** (`#/`): 5 topic cards (number, title, subtitle, stage count, progress %, accent colour) + a short "how to study" line.
- Routing: hash. `#/t/7` → topic 7 stage 1; `#/t/7/<stageId>?step=3`; `#/t/7/summary|quiz|glossary`.
- Keyboard: Space play/pause · ←/→ step · Shift+←/→ stage · L labels · R reset view · F fullscreen.
- Targets: PC + tablet (768–1440 px). Check 1440×900 and 1024×768.

## 3D rules (lessons from EnbrioAtlas — the owner is demanding about these)
1. **High-end look**: smooth shapes (enough segments, no faceting), soft studio lighting (Environment + Lightformers, key + rim), physically-based materials (MeshStandard/MeshPhysical: membranes slightly translucent & glossy, proteins matte-satin), ACES tone mapping, gentle fog for depth, antialias, dpr [1, 2]. Recognisable textbook shapes, not abstract cylinders.
2. **Never get lost**: every view change is a camera **glide** (no hard cuts). Camera keyframes per step; the user may orbit freely, and the next step glides back from wherever the camera is. Moving from a whole-cell view to a molecular close-up = continuous zoom into the place (show where we are going first). A turn > 120° must be mentioned in the step text.
3. **No drawn pointers**: never rings, dashed boxes or reticles to point at things. Emphasis = the structure itself glows (emissive) / others dim slightly, and its label pill turns accent-coloured.
4. **Labels** (callouts): 2D overlay; pills in columns at the left/right edges of the viewport, short leader lines to an anchor dot that sits **well inside** the structure (never on a seam). Leaders never cross text; labels never overlap each other or the tool column. Labels appear progressively: a label shows once its structure has been focused or mentioned in this stage so far; all labels show at the stage's last step; key L cycles step → all → none. Never remove a structure's label to tidy a frame — fix layout instead.
5. **Narrated actions are shown**: if the step says "SRP binds the signal peptide", the SRP visibly moves and binds during that step. Every verb (binds, cleaves, buds, fuses, flips, pumps, acidifies…) must visibly happen, at a pace the student can follow (≥ 1.5 s at 1×).
6. **3D must never contradict the notes**: check each step's pose sentence by sentence (what is where, what binds what, which side is lumen vs cytosol).
7. **Consistent style**: same structure = same shape and colour across all topics (use `palette.ts` and the shared kit components; never restyle a ribosome/vesicle/membrane per scene).
8. **Orientation cue**: in membrane close-ups always label the two sides (e.g. "CYTOSOL" / "ER LUMEN") with quiet edge tags; lumen-side tint differs slightly.
9. Performance: 60 fps on a laptop. Instanced meshes for repeated parts (lipid heads, sugars, ribosomes), memoised geometries, no per-frame allocations in hot paths, `frameloop="always"` only while playing or interacting (else "demand").

## Kit API (implemented in src/three/kit, used by all scenes)
```ts
// Stage3D wraps a scene: <Canvas>, lights, environment, camera rig, anchor registry, callout overlay.
// Scenes are rendered INSIDE it and get SceneProps {t, stepIndex, focus}.

useStageCamera(keys: CamKey[]): void
  // CamKey = { at: number; pos: V3; target: V3; fov?: number }  (at = stage time; keys sorted)
  // camera glides along the keys as t advances (eased). If the user orbited, the rig waits until the
  // next step change and then glides from the current camera to the step's pose (≈1.2 s).

<Anchor id="structure-id" position={[x,y,z]} show={0..1} text?="override text" />
  // registers a label anchor at a local position (works inside moving/rotated groups: world pos is used).
  // `show` fades the label; anchors also fade when behind the camera.

useGlow(id: string | string[]): number   // 0..1, eased, 1 while the id is in `focus`
useDim(ids: string[]): number            // 0..1 — >0 when something else is focused (for dimming context)

<EdgeTag side="top"|"bottom"|"left"|"right" text="CYTOSOL" />   // quiet orientation tag at the viewport edge

// Primitives (all accept position/rotation/scale group props, `id?` for glow, `opacity?`, `glow?` override):
<Bilayer width depth curvature? holes? />        // instanced phospholipid patch (heads spheres + 2 tails), two leaflets; for molecular close-ups
<MembraneSheet shape="plane"|"sphere"|"tube" … /> // smooth translucent membrane surface for organelle-scale views (double surface = bilayer look, rim)
<Vesicle radius coat?="clathrin"|"copi"|"copii"|"caveolin"|null coatAmount=0..1 cargo?={…} lumenColor? />
<ClathrinCage radius amount />  <Triskelion />
<Ribosome size? state?="free"|"bound" />         // small + large subunit, recognisable
<Polyribosome mRNA path, count />
<MRNA points length=0..1 />                       // thin blue tube along a curve, grows with length
<Polypeptide points length=0..1 segments?={[from,to,color]} folded?=0..1 />  // chain that grows; segments colour signal peptide etc.
<Protein shape="blob"|"barrel"|"ring"|"y" color size seed />  // generic smooth protein (SRP, translocon, chaperones, receptors, enzymes)
<Translocon open=0..1 />  <Pore />  <NuclearPore />
<DNAHelix length turns radius />  <Nucleosome tails?=0..1 acetyl?=0..1 />  <ChromatinFiber kind="10nm"|"30nm" />
<Cisterna radius thickness bend />  <GolgiStack n bend />  <ERSheet ribosomes? />  <ERTubules seed />
<Sugar kind="GlcNAc"|"Man"|"Glc"|"Gal"|"Sia"|"Man6P" />  <Glycan tree=[…] />   // SNFG symbols in 3D (cube/sphere/diamond)
<Ion kind="Ca"|"H" count region />  <Flow points t speed />  // little particles moving along a path
<Microtubule points />  <Actin points />  <IntermediateFilament points />
<CellBody … /> <Nucleus … /> <Mitochondrion /> <Lysosome /> <Endosome kind="early"|"late"|"recycling" ilv=0..1 />
```

## Palette (src/three/kit/palette.ts — SNFG colours for sugars)
membrane lipid heads #e8c9a0 · tails #f3e3c3 · organelle membrane surface #d9b38c (ER #c9a46e tint, Golgi #e0a96d, PM #d8c3a5) ·
lumen tint ER #2a6f6b · cytosol bg #0b0d10 · ribosome large #8e7cc3 small #b9a7e6 · mRNA #4fa3ff · polypeptide #ff9a3c · signal peptide #ffd23f ·
SRP #3ddc97 · SRP receptor #2bb673 · translocon #7fd1e8 · chaperones (BiP #19c3b4, calnexin #12a594, calreticulin #4fd6c4, PDI #9be15d) ·
DNA #4fa3ff/#9fd0ff · histones H2A #ff7a7a H2B #ffb37a H3 #ffd36e H4 #9ee07a H1 #c7a0ff · acetyl #3ddc97 methyl #ff5d8f phosphate #ffd23f ·
lamina #b48ead · clathrin #e9eef5 · COPI #f2b84b · COPII #6fcf97 · caveolin #ff8fab · dynamin #f25f5c · Rab #4dabf7 · v-SNARE #ff6b6b · t-SNARE #845ef7 ·
GEF #ffd43b · Sar1/ARF #ffa94d · lysosome #c2410c (hydrolases #ff7849) · early endosome #74c0fc · late endosome/MVB #5c7cfa · H⁺ #ff4d6d · Ca²⁺ #f1f3f5 ·
GlcNAc blue cube #1f6feb · Man green sphere #2fb344 · Glc blue sphere #1f6feb · Gal yellow sphere #ffd43b · Sia purple diamond #a855f7 · M6P = Man + small phosphate bead #ffd23f.

## Stage plan (content + scenes must match these ids)
Scene id = `t<topic>-<stage id>`.

**Topic 6 · Chromatin and the nucleus** (sources/2026_Topic_6_*.txt)
1 `packing` DNA packing levels: double helix → nucleosomes (octamer H2A,H2B,H3,H4 ×2; H1 linker) → 10 nm "beads on a string" (euchromatin) → 30 nm fiber (heterochromatin) → loops → mitotic chromosome; 2 m of DNA in ~5 µm³ nucleus; histones + (Lys/Arg) bind − DNA.
2 `eu-hetero` Nucleus cut open: envelope (ONM/INM, pores), heterochromatin dark at the periphery (on lamina), euchromatin central, nucleolus; TEM look toggle (electron-dense = dark); silent genes move to heterochromatin, genes to be read move to euchromatin via nucleoskeleton.
3 `histone-marks` Nucleosome close-up with tails: acetylation (HAT, acetyl-CoA → Lys, + charge neutralised → DNA loosens) vs HDAC; methylation (HMT/HDM, no charge change, binding affinity; activating H3K4me vs repressive H3K9me/H3K27me); phosphorylation (kinase/phosphatase, − charge); active chromatin (acetylated, coactivators) vs inactive (methyl marks, repressors).
4 `domains` 3D genome: chromosome territories; lamina-associated domains (constitutive heterochromatin, repetitive DNA, telomeres) = compartment B at periphery; nuclear matrix / interior = compartment A; S/MARs; a gene segment moving B → A while the chromosome stays in its territory.
5 `tads` Loops & TADs: cohesin ring extrudes a loop until it meets CTCF boundaries; TAD = local interactions; S/MAR anchoring to the matrix clusters TADs from different chromosomes → co-activation.
6 `linc` LINC complex: cytoskeleton (actin, MTs, IFs) → nesprin/KASH crossing the ONM → SUN crossing the INM → lamins; tension transmitted into chromatin rearrangement.
7 `nucleolus` Nucleolus: FC (pale, rDNA euchromatin), DFC (dense, new pre-rRNA), GC (assembly); NORs on several chromosomes → 1 or more nucleoli; ribosomal proteins made in cytosol come back through the pore (NLS + importins), subunits assembled and exported (NES + exportins).

**Topic 7 · The endoplasmic reticulum** (sources/2026_TOPIC_7_*.txt)
1 `endomembrane` Cell overview: ER continuous with outer nuclear membrane, Golgi, endosomes, lysosomes, phago/autophagosomes, vesicles (unidirectional) — vs mitochondria, peroxisomes (NOT endomembrane: they receive no vesicles; dim them).
2 `rer-ser` RER (parallel flattened cisternae studded with ribosomes) continuous with SER (twisted tubules); functions; RER/SER ratio by cell type (secretory cell vs hepatocyte/adrenal cell).
3 `pathways` Cytosolic pathway (free polyribosome → cytosol, nucleus, mitochondria, peroxisomes) vs secretory pathway (ER-bound → ER → Golgi → vesicles → PM/lysosomes; glycosylated).
4 `signal` Signal hypothesis: translation starts free; hydrophobic signal peptide (8–10 aa) emerges; SRP binds peptide + ribosome, translation pauses; SRP receptor on RER; translocon opens; signal peptidase cleaves; soluble protein released into the lumen.
5 `transmembrane` Start/stop-transfer: single-pass protein (part before stop stays in lumen, stop sequence moves sideways into the bilayer, part after stays in cytosol); multipass by alternating start/stop; α-helices; hydropathy plot predicts TM domains.
6 `folding` Chaperones (BiP: heavy+light chain antibody assembly; calnexin (membrane) & calreticulin (soluble) bind glycans; PDI disulfide bonds); misfolded retained.
7 `upr` UPR: sensors PERK, IRE1, ATF6 held inactive by BiP; unfolded proteins accumulate (e.g. heat) → BiP leaves sensors → signal to nucleus → transcription of more chaperones (+ autophagy); persistent stress → apoptosis.
8 `glycosylation` N-glycosylation: dolichol-phosphate in ER membrane carries the 14-sugar oligosaccharide (2 GlcNAc, 9 Man, 3 Glc — notes say "galactose": flag) transferred en bloc to Asn during translocation; same initial glycan for all.
9 `ser` SER: cytochrome P450 detox (NADPH e⁻, O₂, hydrophobic toxin R → oxidised, water-soluble); hepatocyte & adrenal examples; phospholipid synthesis on the cytosolic leaflet (fatty acids + glycerol-P → phosphatidic acid → DAG → + choline → phosphatidylcholine), flip-flop to balance leaflets.
10 `lipid-ca` Lipid exchange routes (vesicles to Golgi; ceramide by specific translocator to Golgi; direct transfer to mitochondria/peroxisomes/PM; lateral diffusion into nuclear envelope) + Ca²⁺ store (ATP-driven pump fills lumen; signal releases Ca²⁺ → muscle contraction).

**Topic 8 · The Golgi apparatus** (sources/TOPIC_8_*.txt)
1 `structure` Discovery (Camillo Golgi, 1898, silver impregnation, spinal ganglion neurons) and structure: stack of independent flattened cisternae, cis (convex, faces ER, CGN) → medial → trans (concave, TGN), lumen; polarity.
2 `maturation` Movement across the stack: cisternal maturation model (new cisternae at cis, mature toward trans, enzymes retro-transported) + vesicle transport model (vesicles bud at rims, anterograde & retrograde) — both coexist.
3 `glyco` Glycosylation in Golgi: arriving glycan trimmed to core 5 (2 GlcNAc + 3 Man); complex glycosylation (Gal, GlcNAc, sialic acid → secretory/membrane) vs mannose glycosylation with Man-6-P (lysosomal tag); N- (Asn, started in ER) vs O- (Ser/Thr, only Golgi); GAGs & proteoglycans (hyaluronic acid exception: made at PM).
4 `sorting` TGN sorting to 3 destinations: lysosomes (M6P + receptors), secretion (constitutive = default, continuous, renews PM — luminal sugars end up outside; regulated = stored, released on signal) and retrograde vesicles back to ER.
5 `lysosome` Lysosome biogenesis: CGN adds/phosphorylates mannose; TGN M6P receptors cluster; clathrin buds vesicles; acidic lumen (proton pumps) dissociates enzyme from receptor; receptors recycled to TGN; I-cell disease (no M6P → enzymes secreted).
6 `er-golgi` Bidirectional ER↔Golgi: COPII anterograde (secretory + ER-resident proteins travel together), KDEL (Lys-Asp-Glu-Leu) receptors catch ER residents, COPI retrograde back to ER (pH-dependent binding).
7 `sphingo` Sphingolipids: ceramide (fatty acid + sphingosine) made in SER, carried by a translocator (not vesicles) to Golgi; + sugars → glycosphingolipids (cerebrosides, gangliosides); + phosphocholine → sphingomyelin; leave with secretory vesicles to PM.

**Topic 9 · Vesicular trafficking** (sources/9_VESICULAR_TRAFFICKING.txt)
1 `overview` Donor compartment → vesicle → target compartment; the three control mechanisms: protein coats (formation), Rab GTPases (delivery), SNAREs (fusion).
2 `pathways` Map of directions: endocytic (PM → early endosome → lysosome / recycling / transcytosis / retrograde to TGN-ER) vs exocytic (ER → Golgi → PM; constitutive in all cells vs regulated: stored vesicles, Ca²⁺ signal, massive release e.g. mast cell).
3 `coats` Vesicle formation control: cargo receptor binds ligand → adaptor → GEF → GTPase → coat polymerises → bud; clathrin triskelions; coat types and where they act (clathrin: PM & TGN; COPI: Golgi→ER retrograde; COPII: ER→Golgi; naked: constitutive).
4 `dynamin` Dynamin helical collar constricts the neck with GTP hydrolysis → scission; coat disassembles within seconds; naked vesicle (notes say "clathrin" catalyses the last step: flag — it is dynamin).
5 `copii` GTPase switch + COPII example: Sar1-GDP (cytosolic) → GEF in ER membrane → Sar1-GTP exposes hydrophobic tail, inserts → recruits Sec23/24 (adaptors, bind receptors) → Sec13/31 (coat) polymerise; GTP hydrolysis → OFF.
6 `rab` Rab GTPases: Rab-GDP cytosolic → specific GEF → Rab-GTP exposes prenyl group, inserts in vesicle → tethering proteins ("fishing lines") catch it → Rab receptors dock the vesicle; >60 Rabs; recycled.
7 `snare` SNAREs: v-SNARE on vesicle + complementary t-SNARE on target zip together (trigger) → fusion complex → membranes fuse → content delivered; full sequence recap (coat → dynamin → uncoat → Rab → tether → dock → SNARE → fusion → recycle).
8 `toxins` Neuromuscular synapse: botulinum toxin cleaves VAMP/synaptobrevin, syntaxin, SNAP-25 → no ACh release → flaccid paralysis (Botox uses); tetanus toxin cleaves VAMP in inhibitory interneurons → spastic contraction.

**Topic 10 · The endosomal compartment** (sources/Copia_de_10_*.txt)
1 `types` Five ways in, side by side on one plasma membrane: phagocytosis (specific, actin pseudopods, large particles), macropinocytosis (non-specific, actin, ≈1 µm), clathrin-mediated (specific, receptors), caveolin (non-specific, caveolin oligomers, naked), pinocytosis (non-specific, naked, small); dynamin for the small ones; all but phagocytosis converge on the early endosome.
2 `phago` Phagocytosis: opsonised bacterium (antibodies/complement; Toll-like receptors) recognised by receptors; actin pseudopods surround it; phagosome; fuses with lysosomes → phagolysosome; only macrophages, neutrophils, dendritic cells.
3 `clathrin-ldl` Receptor-mediated endocytosis, LDL/cholesterol: receptors + ligands concentrate in coated pit; clathrin cage; dynamin; uncoat; fuse → early endosome pH 6 → ligand/receptor dissociate; receptors recycled to PM; LDL to late endosome → lysosome (pH 5 → 4.5); cholesterol released.
4 `caveolae-transcytosis` Caveolae (caveolin oligomers bend the membrane, no coat, dynamin) in endothelial cell; transcytosis lumen → tissue side (also enterocytes apical → basolateral).
5 `sorting` Early endosome as sorting station: 4 fates — recycling (receptors back to PM, recycling endosome), degradation (late endosome → lysosome), retrograde (to TGN/ER, COPI), transcytosis; immunogold experiment (receptors vs ligands segregate).
6 `synaptic` Synaptic vesicle cycle: filled by transporters, held near membrane, action potential → voltage-gated Ca²⁺ channels → Ca²⁺ entry → SNARE fusion → release → clathrin re-endocytosis → refill.
7 `maturation` Early (≈1 min, peripheral, tubular, pH 6) → late endosome / MVB (5–15 min, central via microtubules, pH 5–5.5, intraluminal vesicles of ubiquitinated membrane proteins) → endolysosome (pH < 5) ; glycocalyx protects the limiting membrane, so membrane proteins must be put into ILVs to be degraded.

## Done-criteria per stage
- Content: every sentence traceable to the notes; steps 4–9 per stage; ≥1 `ask` per stage; `focus` ids exist in `structures` and are drawn+anchored in the scene during that step.
- Scene: every step's camera frames what it talks about; every narrated action visible; labels readable at 1440×900 and 1024×768; no console errors; 60 fps feel.
