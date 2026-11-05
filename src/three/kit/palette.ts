/**
 * THE colour table. Same structure = same colour in every topic and scene (DESIGN.md rule 7).
 * Scenes must take colours from here (never hard-code a hex for a structure that has an entry).
 * Glossary swatches in src/content should match these values.
 */
export const PALETTE = {
  // membranes
  lipidHead: '#e8c9a0',
  lipidTail: '#f3e3c3',
  membrane: '#d9b38c',
  erMembrane: '#c9a46e',
  golgiMembrane: '#e0a96d',
  plasmaMembrane: '#d8c3a5',
  nuclearEnvelope: '#c9a46e',
  // compartments
  erLumen: '#2a6f6b',
  golgiLumen: '#6b4a2a',
  cytosol: '#0b0d10',
  nucleoplasm: '#1b2236',
  // translation
  ribosomeLarge: '#8e7cc3',
  ribosomeSmall: '#b9a7e6',
  mrna: '#4fa3ff',
  mrnaBase: '#9fd0ff',
  polypeptide: '#ff9a3c',
  signalPeptide: '#ffd23f',
  srp: '#3ddc97',
  srpReceptor: '#2bb673',
  translocon: '#7fd1e8',
  signalPeptidase: '#e879f9',
  // chaperones / ER enzymes
  bip: '#19c3b4',
  calnexin: '#12a594',
  calreticulin: '#4fd6c4',
  pdi: '#9be15d',
  // nucleus & chromatin
  dna: '#4fa3ff',
  dnaBase: '#9fd0ff',
  h2a: '#ff7a7a',
  h2b: '#ffb37a',
  h3: '#ffd36e',
  h4: '#9ee07a',
  h1: '#c7a0ff',
  acetyl: '#3ddc97',
  methyl: '#ff5d8f',
  phosphate: '#ffd23f',
  lamina: '#b48ead',
  nuclearPore: '#a3b8cc',
  nucleolus: '#7b5ea7',
  // coats & trafficking machinery
  clathrin: '#e9eef5',
  copi: '#f2b84b',
  copii: '#6fcf97',
  caveolin: '#ff8fab',
  dynamin: '#f25f5c',
  rab: '#4dabf7',
  vSnare: '#ff6b6b',
  tSnare: '#845ef7',
  gef: '#ffd43b',
  sar1: '#ffa94d',
  // organelles
  lysosome: '#c2410c',
  hydrolase: '#ff7849',
  earlyEndosome: '#74c0fc',
  lateEndosome: '#5c7cfa',
  recyclingEndosome: '#63e6be',
  mitochondrion: '#e8590c',
  mitoMatrix: '#7a2e0e',
  peroxisome: '#a9e34b',
  // ions & small molecules
  proton: '#ff4d6d',
  calcium: '#f1f3f5',
  // cytoskeleton
  microtubule: '#8ce99a',
  actin: '#ff8787',
  intermediateFilament: '#ffd8a8',
  // generic
  neutral: '#9aa3ad',
  cargo: '#ffa8a8',
  receptor: '#4dabf7',
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** SNFG (Symbol Nomenclature for Glycans) colours + shapes used by <Sugar>/<Glycan>. */
export const SUGARS = {
  GlcNAc: { color: '#1f6feb', shape: 'cube' },
  Man: { color: '#2fb344', shape: 'sphere' },
  Glc: { color: '#1f6feb', shape: 'sphere' },
  Gal: { color: '#ffd43b', shape: 'sphere' },
  Sia: { color: '#a855f7', shape: 'diamond' },
  Man6P: { color: '#2fb344', shape: 'sphere' },
} as const;
export type SugarKind = keyof typeof SUGARS;

/** UI colours shared by the shell and the callout overlay. */
export const UI = {
  accent: '#ff6a3d',
  focus: '#ffb86b',
  bg: '#0a0a0b',
  viewport: '#0b0d10',
} as const;
