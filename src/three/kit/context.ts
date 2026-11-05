import { createContext, useContext } from 'react';
import type { CalloutEngine } from './calloutEngine';
import type { CameraRig } from './cameraRig';

/** Stable per-Stage3D services (never change identity while the stage is mounted). */
export interface StageServices {
  engine: CalloutEngine;
  rig: CameraRig;
}
export const ServicesContext = createContext<StageServices | null>(null);

/** Ids currently lit (step focus + chips the student clicked). */
export const FocusContext = createContext<ReadonlySet<string>>(new Set());

export function useServices(): StageServices {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('Kit components must be rendered inside <Stage3D>.');
  return s;
}

export const useFocusSet = () => useContext(FocusContext);

/** Global kit switches. `instant`: no easing (screenshots / deterministic debug frames). */
export const KIT = { instant: false };
