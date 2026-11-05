/** BioCell kit — everything a scene needs. Import from '@/three/kit'. */
export { Stage3D, StudioLights, type StageApi, type Stage3DProps } from './Stage3D';
export { useStageCamera, useGlow, useDim, useHighlightRef, useHighlightMaterials, useKitHighlight, Anchor, EdgeTag, useStable, type AnchorProps, type HL } from './hooks';
export type { CamKey } from './cameraRig';
export type { LabelMode, EdgeSide } from './calloutEngine';
export { PALETTE, SUGARS, UI, type PaletteKey, type SugarKind } from './palette';
export { type KitProps, groupProps, useDisposable } from './common';
export { lumpySphere, fibonacciSphere, noise3, segmentMatrix, curveFrom, Polyline, bendGeometry, type Bump, type LumpyOpts } from './geom';
export { proteinMaterial, membraneMaterial, lipidHeadMaterial, lipidTailMaterial, nucleicMaterial, tintMaterial } from './materials';

export { Bilayer, BILAYER, LumenTint, MembraneSheet, type BilayerProps, type LumenTintProps, type MembraneSheetProps } from './primitives/membrane';
export { Ribosome, RIBOSOME, MRNA, Polypeptide, Polyribosome, foldedPositions, type RibosomeProps, type MRNAProps, type PolypeptideProps, type PolyribosomeProps } from './primitives/translation';
export { Protein, SRP, SRP_SITES, SRPReceptor, RECEPTOR_SITE, MembraneProtein, Pore, Translocon, NuclearPore, type ProteinProps, type ChannelProps } from './primitives/proteins';
export { Vesicle, ClathrinCage, Triskelion, type VesicleProps, type ClathrinCageProps } from './primitives/vesicles';
export { Sugar, Glycan, OLIGO_14, Ion, Flow, Bond, type BondProps, type SugarProps, type GlycanProps, type GlycanNode, type IonProps, type FlowProps } from './primitives/small';
export { DNAHelix, nucleosomeDNAPath, Nucleosome, ChromatinFiber, type DNAHelixProps, type NucleosomeProps, type ChromatinFiberProps } from './primitives/chromatin';
export { Cisterna, GolgiStack, ERSheet, ERTubules, CellBody, Nucleus, Mitochondrion, Lysosome, Endosome, type CisternaProps, type GolgiStackProps, type ERSheetProps, type ERTubulesProps, type CellBodyProps, type NucleusProps, type MitochondrionProps, type EndosomeProps } from './primitives/organelles';
export { Microtubule, Actin, IntermediateFilament, type FilamentProps } from './primitives/cytoskeleton';
export { KIT } from './context';
