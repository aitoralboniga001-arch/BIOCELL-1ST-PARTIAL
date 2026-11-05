import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Group, Material, MeshStandardMaterial, PerspectiveCamera } from 'three';
import type { V3 } from '@/engine/anim';
import { KIT, useFocusSet, useServices } from './context';
import type { CamKey, ControlsLike } from './cameraRig';
import type { EdgeSide } from './calloutEngine';

const asArr = (id: string | string[] | undefined) => (id === undefined ? [] : Array.isArray(id) ? id : [id]);

// ——————————————————————————————————— camera ———————————————————————————————————

/**
 * Drive the stage camera with keyframes (call once per scene, inside the scene component).
 * Keys must be sorted by `at`. Hold a pose by repeating it at two `at`s; the camera glides between keys.
 */
export function useStageCamera(keys: CamKey[]): void {
  const { rig } = useServices();
  rig.setKeys(keys);
  useFrame((state, dt) => {
    const moving = rig.update(state.camera as PerspectiveCamera, state.controls as unknown as ControlsLike | null, dt);
    if (moving) state.invalidate();
  }, -1);
}

// ——————————————————————————————————— emphasis ———————————————————————————————————

/** Mutable eased glow/dim values for an id, updated every frame (no React re-render). */
export interface HL {
  glow: number;
  dim: number;
}

/**
 * Low-level: eased {glow, dim} for ids, as a ref. `glowOverride` (0..1) forces a glow (e.g. a flash).
 * glow → 1 while any of the ids is in focus; dim → 1 while something else is focused.
 */
export function useHighlightRef(id: string | string[] | undefined, glowOverride?: number) {
  const focus = useFocusSet();
  const ids = asArr(id);
  const ref = useRef<HL>({ glow: 0, dim: 0 });
  const targets = useRef({ glow: 0, dim: 0 });
  const lit = ids.some((i) => focus.has(i));
  targets.current.glow = Math.max(lit ? 1 : 0, glowOverride ?? 0);
  targets.current.dim = ids.length && focus.size > 0 && !lit ? 1 : 0;
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [lit, focus.size, glowOverride, invalidate]);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 30);
    const h = ref.current;
    const tg = targets.current;
    const k = KIT.instant ? 1 : 1 - Math.exp(-8 * dt);
    let moving = false;
    for (const f of ['glow', 'dim'] as const) {
      const v = h[f] + (tg[f] - h[f]) * k;
      h[f] = Math.abs(v - tg[f]) < 0.003 ? tg[f] : v;
      if (h[f] !== tg[f]) moving = true;
    }
    if (moving) invalidate();
  });
  return ref;
}

function useEasedNumber(get: () => number): number {
  const [v, setV] = useState(get);
  const cur = useRef(v);
  const target = get();
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [target, invalidate]);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 30);
    if (cur.current === target) return;
    let n = KIT.instant ? target : cur.current + (target - cur.current) * (1 - Math.exp(-8 * dt));
    if (Math.abs(n - target) < 0.004) n = target;
    cur.current = n;
    setV(n);
    invalidate();
  });
  return v;
}

/** 0..1, eased; 1 while the id (or any of the ids) is in focus. Re-renders while it changes. */
export function useGlow(id: string | string[]): number {
  const focus = useFocusSet();
  const ids = asArr(id);
  return useEasedNumber(() => (ids.some((i) => focus.has(i)) ? 1 : 0));
}

/** 0..1, eased; >0 while something other than `ids` is focused (use it to dim context). */
export function useDim(ids: string[]): number {
  const focus = useFocusSet();
  return useEasedNumber(() => (focus.size > 0 && !ids.some((i) => focus.has(i)) ? 1 : 0));
}

const DIM = 0.32;
const tmpC = new Color();

/**
 * Apply an HL ref to materials every frame: emissive glow in the material's own colour, slight dim.
 * Each material's base colour is captured once (material.userData.base).
 * `opacity` (optional) multiplies each material's base opacity.
 */
export function useHighlightMaterials(mats: Material[], hl: React.RefObject<HL>, opacity = 1, glowStrength = 0.75, mode: 'emissive' | 'boost' = 'emissive') {
  useLayoutEffect(() => {
    for (const m of mats) {
      const sm = m as MeshStandardMaterial;
      if (!sm.userData.base && sm.color) sm.userData.base = sm.color.clone();
      if (sm.userData.baseOpacity === undefined) sm.userData.baseOpacity = sm.opacity;
      if (sm.userData.baseEmissive === undefined) sm.userData.baseEmissive = sm.emissiveIntensity ?? 0;
      if (sm.userData.baseTransparent === undefined) sm.userData.baseTransparent = sm.transparent;
    }
  }, [mats]);
  useFrame(() => {
    const h = hl.current;
    if (!h) return;
    for (const m of mats) {
      const sm = m as MeshStandardMaterial;
      const base = sm.userData.base as Color | undefined;
      if (!base) continue;
      if (sm.emissive && mode === 'emissive') {
        sm.emissive.copy(tmpC.copy(base).lerp(WHITE, 0.15));
        sm.emissiveIntensity = (sm.userData.baseEmissive as number) + h.glow * glowStrength;
      }
      // 'boost' (instanced meshes coloured per instance): brighten the colour instead of emitting
      sm.color.copy(base).multiplyScalar((1 - DIM * h.dim * (1 - h.glow)) * (mode === 'boost' ? 1 + h.glow * glowStrength * 1.6 : 1));
      const bo = sm.userData.baseOpacity as number;
      const o = bo * opacity;
      const wantT = (sm.userData.baseTransparent as boolean) || o < 0.999;
      if (sm.transparent !== wantT) {
        sm.transparent = wantT;
        sm.needsUpdate = true;
      }
      sm.opacity = o;
      sm.visible = o > 0.002;
    }
  });
}
const WHITE = new Color('#ffffff');

/** Convenience: highlight ref + material application in one call. */
export function useKitHighlight(mats: Material[], id: string | string[] | undefined, opts: { glow?: number; opacity?: number; strength?: number; mode?: 'emissive' | 'boost' } = {}) {
  const hl = useHighlightRef(id, opts.glow);
  useHighlightMaterials(mats, hl, opts.opacity ?? 1, opts.strength, opts.mode);
  return hl;
}

// ——————————————————————————————————— anchors & tags ———————————————————————————————————

export interface AnchorProps {
  /** structure id (label text = topic.structures[id].name unless `text`) */
  id: string;
  /** local position (inside moving / rotated groups the world position is used) */
  position?: V3;
  /** 0..1 label visibility (fades) */
  show?: number;
  /** override label text */
  text?: string;
}

/** Registers a label anchor. Put it well inside its structure (not on a seam). */
export function Anchor({ id, position = [0, 0, 0], show = 1, text }: AnchorProps) {
  const { engine } = useServices();
  const key = useId();
  const ref = useRef<Group>(null);
  useLayoutEffect(() => {
    engine.update(key, id, ref.current, show, text);
  });
  useLayoutEffect(() => () => engine.remove(key), [engine, key]);
  return <group ref={ref} position={position} />;
}

/** Quiet orientation tag at a viewport edge (e.g. "CYTOSOL" top, "ER LUMEN" bottom). */
export function EdgeTag({ side, text }: { side: EdgeSide; text: string }) {
  const { engine } = useServices();
  const key = useId();
  useLayoutEffect(() => {
    engine.addTag(key, side, text);
    return () => engine.removeTag(key);
  }, [engine, key, side, text]);
  return null;
}

/** Memoise a value by a structural key (for V3[] props → curves/geometries). */
export function useStable<T>(value: T): T {
  const key = JSON.stringify(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => value, [key]);
}
