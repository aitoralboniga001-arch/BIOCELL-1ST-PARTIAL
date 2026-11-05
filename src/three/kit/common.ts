import { useEffect, useMemo, type DependencyList } from 'react';
import type { V3 } from '@/engine/anim';

/** Props shared by every kit primitive. */
export interface KitProps {
  position?: V3;
  rotation?: V3;
  scale?: number | V3;
  /** structure id(s): the primitive glows while focused and dims slightly while something else is */
  id?: string | string[];
  /** 0..1 overall opacity (fades the whole primitive) */
  opacity?: number;
  /** 0..1 forced glow (e.g. a flash when something happens to it) */
  glow?: number;
}

/** Group transform props from KitProps. */
export const groupProps = (p: KitProps) => ({ position: p.position, rotation: p.rotation, scale: p.scale, visible: (p.opacity ?? 1) > 0.002 });

/** useMemo for disposable three objects (geometries/materials): disposed on change/unmount. */
export function useDisposable<T extends { dispose: () => void } | { dispose: () => void }[]>(factory: () => T, deps: DependencyList): T {
  const v = useMemo(factory, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      if (Array.isArray(v)) v.forEach((x) => x.dispose());
      else v.dispose();
    },
    [v],
  );
  return v;
}
