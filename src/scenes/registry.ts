/**
 * Scene registry: scene id (`t<topic>-<stageId>`, = Stage.scene) → lazily loaded scene component.
 * To add a scene: create src/scenes/tN/File.tsx with a default-exported component (props: SceneProps)
 * and add ONE line below. Unknown ids render the "Scene in preparation" placeholder.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { SceneProps } from '@/content/types';

type SceneModule = { default: ComponentType<SceneProps> };
const SCENES: Record<string, () => Promise<SceneModule>> = {
  't10-synaptic': () => import('./t10/Synaptic'),
  't10-sorting': () => import('./t10/Sorting'),
  't10-caveolae-transcytosis': () => import('./t10/CaveolaeTranscytosis'),
  't10-phago': () => import('./t10/Phago'),
  't10-types': () => import('./t10/Types'),
  't9-toxins': () => import('./t9/Toxins'),
  't9-coats': () => import('./t9/Coats'),
  't9-pathways': () => import('./t9/Pathways'),
  't8-sphingo': () => import('./t8/Sphingo'),
  't8-glyco': () => import('./t8/Glyco'),
  't8-maturation': () => import('./t8/Maturation'),
  't8-er-golgi': () => import('./t8/ErGolgi'),
  't6-nucleolus': () => import('./t6/Nucleolus'),
  't6-domains': () => import('./t6/Domains'),
  't6-linc': () => import('./t6/Linc'),
  't6-tads': () => import('./t6/Tads'),
  't6-histone-marks': () => import('./t6/HistoneMarks'),
  't7-signal': () => import('./t7/Signal'),
  't7-transmembrane': () => import('./t7/Transmembrane'),
  't7-folding': () => import('./t7/Folding'),
  't7-upr': () => import('./t7/Upr'),
  't7-glycosylation': () => import('./t7/Glycosylation'),
  't10-maturation': () => import('./t10/Maturation'),
  't9-rab': () => import('./t9/Rab'),
  't9-copii': () => import('./t9/Copii'),
  't9-overview': () => import('./t9/Overview'),
  't7-ser': () => import('./t7/Ser'),
  't7-lipid-ca': () => import('./t7/LipidCa'),
  't6-packing': () => import('./t6/Packing'),
  't6-eu-hetero': () => import('./t6/EuHetero'),
  't7-endomembrane': () => import('./t7/Endomembrane'),
  't7-rer-ser': () => import('./t7/RerSer'),
  't7-pathways': () => import('./t7/Pathways'),
  't9-dynamin': () => import('./t9/Dynamin'),
  't9-snare': () => import('./t9/Snare'),
  't10-clathrin-ldl': () => import('./t10/ClathrinLdl'),
  't8-structure': () => import('./t8/Structure'),
  't8-sorting': () => import('./t8/Sorting'),
  't8-lysosome': () => import('./t8/Lysosome'),
};

const cache = new Map<string, LazyExoticComponent<ComponentType<SceneProps>>>();

/** The lazy component for a scene id, or null if no scene is registered (→ placeholder). */
export function sceneFor(id: string): LazyExoticComponent<ComponentType<SceneProps>> | null {
  const load = SCENES[id];
  if (!load) return null;
  let c = cache.get(id);
  if (!c) {
    c = lazy(load);
    cache.set(id, c);
  }
  return c;
}

export const hasScene = (id: string) => id in SCENES;
export const sceneIds = () => Object.keys(SCENES);
