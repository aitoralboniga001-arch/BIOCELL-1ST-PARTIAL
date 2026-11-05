/**
 * Local progress & preferences (localStorage, one JSON blob). Every access is guarded: private windows or
 * blocked storage just mean nothing is remembered.
 */
import { useSyncExternalStore } from 'react';
import type { LabelMode } from '@/three/kit';
import type { Speed } from '@/engine/timeline';

const KEY = 'biocell-atlas:v1';

export interface Prefs {
  voice: boolean;
  learn: boolean;
  labels: LabelMode;
  speed: Speed;
  pauseAtSteps: boolean;
}

export interface ProgressData {
  last?: { n: number; stageId: string; step: number };
  /** per topic → stage → highest step index reached (0-based) */
  seen: Record<string, Record<string, number>>;
  /** "n/stageId/stepIndex" or "n/quiz/k" → chosen option */
  answers: Record<string, number>;
  /** best quiz score per topic (0..100) */
  best: Record<string, number>;
  prefs: Prefs;
}

const DEFAULTS: ProgressData = {
  seen: {},
  answers: {},
  best: {},
  prefs: { voice: false, learn: true, labels: 'step', speed: 1, pauseAtSteps: true },
};

function load(): ProgressData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const d = JSON.parse(raw) as Partial<ProgressData>;
    return { ...structuredClone(DEFAULTS), ...d, prefs: { ...DEFAULTS.prefs, ...(d.prefs ?? {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

let data = load();
const listeners = new Set<() => void>();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable: keep in memory */
  }
  listeners.forEach((l) => l());
}

export const progress = {
  get: () => data,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
    data = { ...data, prefs: { ...data.prefs, [k]: v } };
    save();
  },
  markSeen(n: number, stageId: string, step: number) {
    const cur = data.seen[n]?.[stageId] ?? -1;
    const last = data.last;
    if (cur >= step && last && last.n === n && last.stageId === stageId && last.step === step) return;
    data = {
      ...data,
      last: { n, stageId, step },
      seen: { ...data.seen, [n]: { ...(data.seen[n] ?? {}), [stageId]: Math.max(cur, step) } },
    };
    save();
  },
  answer(key: string, option: number) {
    data = { ...data, answers: { ...data.answers, [key]: option } };
    save();
  },
  setBest(n: number, score: number) {
    if ((data.best[n] ?? -1) >= score) return;
    data = { ...data, best: { ...data.best, [n]: score } };
    save();
  },
};

export function useProgress<T>(select: (d: ProgressData) => T): T {
  return useSyncExternalStore(progress.subscribe, () => select(data), () => select(data));
}
