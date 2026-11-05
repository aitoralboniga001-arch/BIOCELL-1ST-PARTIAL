/**
 * Playback store for one stage. Stage time t ∈ [0,1] advances by dt·speed/duration while playing.
 *
 * Step boundaries: when playback reaches the end of a step, the `gate` decides what happens:
 *   'go'   → carry on into the next step
 *   'wait' → hold at the boundary while still "playing" (e.g. the voice is still reading); re-asked every tick
 *   'stop' → pause at the boundary (pause-at-each-step, a Learn question…). Pressing play continues into
 *            the next step.
 * The end of the stage always stops (t = 1).
 */
import { useSyncExternalStore } from 'react';
import { clamp, stepAt } from './anim';

export type Speed = 0.5 | 1 | 1.5 | 2;
export const SPEEDS: Speed[] = [0.5, 1, 1.5, 2];
export type GateResult = 'go' | 'wait' | 'stop';
/** Asked when playback reaches the end of step `i` (`reason` is for the UI). */
export type Gate = (i: number) => { result: GateResult; reason?: string };

export interface TimelineState {
  /** stage key (topic/stage) the state belongs to */
  key: string;
  t: number;
  playing: boolean;
  speed: Speed;
  pauseAtSteps: boolean;
  duration: number;
  starts: number[];
  /** a boundary we are parked at (t is just before it); play() continues from here */
  heldAt: number | null;
  /** why we are held ('step' | 'voice' | 'ask' | 'end' | …) */
  holdReason: string | null;
  /** has playback ever been started in this stage visit (the intro shows until then) */
  started: boolean;
}

const EPS = 1e-4;
let state: TimelineState = {
  key: '',
  t: 0,
  playing: false,
  speed: 1,
  pauseAtSteps: true,
  duration: 60,
  starts: [0],
  heldAt: null,
  holdReason: null,
  started: false,
};
let gate: Gate = () => ({ result: 'go' });
const listeners = new Set<() => void>();

function set(patch: Partial<TimelineState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const timeline = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setGate(g: Gate) {
    gate = g;
  },
  /** Load a stage (keeps speed and pause-at-steps preferences). */
  load(key: string, starts: number[], duration: number, t = 0, playing = false) {
    set({ key, starts, duration: Math.max(1, duration), t: clamp(t), playing, heldAt: null, holdReason: null, started: playing || t > 0 });
  },
  stepIndex: () => stepAt(state.starts, state.t),
  play() {
    if (state.t >= 1) {
      set({ t: 0, playing: true, heldAt: null, holdReason: null, started: true });
      return;
    }
    if (state.heldAt !== null) {
      set({ t: state.heldAt + EPS, playing: true, heldAt: null, holdReason: null, started: true });
      return;
    }
    set({ playing: true, started: true });
  },
  pause() {
    if (state.playing) set({ playing: false });
  },
  toggle() {
    if (state.playing) timeline.pause();
    else timeline.play();
  },
  seek(t: number) {
    set({ t: clamp(t), heldAt: null, holdReason: null, started: true });
  },
  /** Jump to the start of step i (clamped). `play` starts playback so the step's action is seen. */
  jumpStep(i: number, play = true) {
    const n = state.starts.length;
    const j = Math.max(0, Math.min(n - 1, i));
    set({ t: state.starts[j] + (j === 0 ? 0 : EPS), heldAt: null, holdReason: null, playing: play, started: true });
  },
  next() {
    timeline.jumpStep(timeline.stepIndex() + 1);
  },
  prev() {
    timeline.jumpStep(timeline.stepIndex() - 1);
  },
  setSpeed(speed: Speed) {
    set({ speed });
  },
  setPauseAtSteps(pauseAtSteps: boolean) {
    set({ pauseAtSteps });
  },
  /** Re-evaluate a 'wait' hold right now (e.g. the voice just finished). */
  poke() {
    if (state.playing) timeline.tick(0);
  },
  /** Advance the clock by dt seconds (called from a requestAnimationFrame loop). */
  tick(dt: number) {
    if (!state.playing) return;
    const { starts, t, speed, duration } = state;
    const i = stepAt(starts, t);
    const boundary = i + 1 < starts.length ? starts[i + 1] : 1;
    const nt = t + (dt * speed) / duration;
    if (nt < boundary - EPS) {
      set({ t: nt, holdReason: null });
      return;
    }
    // reached the end of step i
    const parked = boundary - EPS;
    if (boundary >= 1) {
      const g = gate(i);
      if (g.result === 'wait') {
        set({ t: parked, holdReason: g.reason ?? 'wait' });
        return;
      }
      if (g.result === 'stop' && g.reason && g.reason !== 'step') {
        // e.g. a Learn question on the last step: park before the end, play() then finishes the stage
        set({ t: parked, playing: false, heldAt: null, holdReason: g.reason });
        return;
      }
      set({ t: 1, playing: false, heldAt: null, holdReason: 'end' });
      return;
    }
    const g = gate(i);
    if (g.result === 'go') set({ t: Math.max(nt, boundary + EPS), holdReason: null });
    else if (g.result === 'wait') set({ t: parked, holdReason: g.reason ?? 'wait' });
    else set({ t: parked, playing: false, heldAt: boundary, holdReason: g.reason ?? 'step' });
  },
};

/** Subscribe a component to a slice of the timeline state. Select primitives (or stable objects). */
export function useTimeline<T>(select: (s: TimelineState) => T): T {
  return useSyncExternalStore(
    timeline.subscribe,
    () => select(state),
    () => select(state),
  );
}
