/**
 * Simulation page: stage header, 3D viewport (+ tools), right panel, bottom dock (message + timeline).
 * Owns the stage ↔ timeline wiring: loading, the step gate (pause at steps / Learn / voice), focus & label
 * sets, URL + progress sync, keyboard shortcuts.
 */
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Stage, Topic } from '@/content/types';
import { stepAt } from '@/engine/anim';
import { timeline, useTimeline } from '@/engine/timeline';
import { Stage3D, type LabelMode, type StageApi } from '@/three/kit';
import { sceneFor } from '@/scenes/registry';
import PlaceholderScene from '@/scenes/Placeholder';
import { mentions, stepStarts } from './content';
import { hrefStage, navigate, replaceHash, type Route } from './router';
import { progress, useProgress } from './progress';
import { plain, voice } from './voice';
import { Menu } from './TopicView';
import { Dock } from './Dock';
import { IChevron, IFull, IReset, ITag, IZoomIn, IZoomOut } from './icons';

const LABEL_NEXT: Record<LabelMode, LabelMode> = { step: 'all', all: 'none', none: 'step' };
const LABEL_TEXT: Record<LabelMode, string> = { step: 'Labels: this step', all: 'Labels: all', none: 'Labels: off' };

export function Simulation({ topic, route }: { topic: Topic; route: Extract<Route, { kind: 'topic' }> }) {
  // ——— which stage ———
  const last = progress.get().last;
  const stageIdx = useMemo(() => {
    const byRoute = route.stageId ? topic.stages.findIndex((s) => s.id === route.stageId) : -1;
    if (byRoute >= 0) return byRoute;
    if (last && last.n === topic.n) {
      const i = topic.stages.findIndex((s) => s.id === last.stageId);
      if (i >= 0) return i;
    }
    return 0;
  }, [route.stageId, topic]); // eslint-disable-line react-hooks/exhaustive-deps
  const stage = topic.stages[stageIdx];
  if (!stage) return <div className="empty">This topic has no stages yet.</div>;
  return <StageView key={`${topic.n}/${stage.id}/${route.step ?? ''}/${route.params.toString()}`} topic={topic} stage={stage} stageIdx={stageIdx} route={route} />;
}

function StageView({ topic, stage, stageIdx, route }: { topic: Topic; stage: Stage; stageIdx: number; route: Extract<Route, { kind: 'topic' }> }) {
  const key = `${topic.n}/${stage.id}`;
  const starts = useMemo(() => stepStarts(stage), [stage]);
  const debug = route.params.has('t') || route.params.has('paused');
  const prefs = useProgress((d) => d.prefs);

  // ——— load the stage into the timeline ———
  useLayoutEffect(() => {
    const p = route.params;
    let t0 = 0;
    if (p.has('t')) t0 = Math.min(1, Math.max(0, Number(p.get('t')) || 0));
    else if (route.step) {
      const i = Math.min(route.step - 1, starts.length - 1);
      t0 = starts[i] + (i ? 1e-4 : 0);
    } else if (route.stageId === undefined && progress.get().last?.n === topic.n && progress.get().last?.stageId === stage.id) {
      const i = Math.min(progress.get().last!.step, starts.length - 1);
      t0 = starts[i] + (i ? 1e-4 : 0);
    }
    timeline.setSpeed(prefs.speed);
    timeline.setPauseAtSteps(prefs.pauseAtSteps);
    timeline.load(key, starts, stage.duration, t0, false);
    const lbl = p.get('labels');
    if (lbl === 'step' || lbl === 'all' || lbl === 'none') setLabelOverride(lbl);
    return () => timeline.pause();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = useTimeline((s) => (s.key === key ? s.t : 0));
  const playing = useTimeline((s) => s.playing);
  const holdReason = useTimeline((s) => s.holdReason);
  const started = useTimeline((s) => s.started);
  const stepIndex = stepAt(starts, t);
  const step = stage.steps[stepIndex];
  const lastStep = stage.steps.length - 1;

  // ——— playback clock ———
  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      timeline.tick(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ——— step gate: voice → Learn question → pause at steps ———
  const answered = useRef(new Set<number>());
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  useEffect(() => {
    timeline.setGate((i) => {
      if (prefsRef.current.voice && voice.speaking()) return { result: 'wait', reason: 'voice' };
      const st = stage.steps[i];
      if (prefsRef.current.learn && st?.ask && !answered.current.has(i)) return { result: 'stop', reason: 'ask' };
      if (timeline.get().pauseAtSteps) return { result: 'stop', reason: 'step' };
      return { result: 'go' };
    });
    voice.setOnIdle(() => timeline.poke());
    return () => {
      timeline.setGate(() => ({ result: 'go' }));
      voice.setOnIdle(null);
    };
  }, [stage]);

  // ——— voice: read each step as it starts ———
  const nameOf = useCallback((id: string) => topic.structures[id]?.name, [topic]);
  useEffect(() => {
    if (!prefs.voice || !started) return;
    voice.speak(`${plain(step.idea, nameOf)} ${plain(step.text, nameOf)}`);
  }, [prefs.voice, started, stepIndex, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => voice.cancel(), [key]);

  // ——— focus & labels ———
  const [extra, setExtra] = useState<string[]>([]);
  useEffect(() => setExtra([]), [stepIndex, key]);
  const focus = useMemo(() => [...new Set([...step.focus, ...extra])], [step, extra]);
  const [labelOverride, setLabelOverride] = useState<LabelMode | null>(null);
  const labelMode = labelOverride ?? prefs.labels;
  const labelIds = useMemo(() => {
    if (stepIndex >= lastStep || t >= 1) return null;
    const s = new Set<string>(extra);
    for (let i = 0; i <= stepIndex; i++) {
      const st = stage.steps[i];
      st.focus.forEach((id) => s.add(id));
      [st.text, st.idea, st.key, st.caution].forEach((x) => mentions(x).forEach((id) => s.add(id)));
    }
    return s;
  }, [stage, stepIndex, lastStep, extra, t >= 1]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleChip = useCallback((id: string) => setExtra((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id])), []);
  const names = useMemo(() => Object.fromEntries(Object.entries(topic.structures).map(([id, s]) => [id, s.name])), [topic]);

  // ——— URL + progress ———
  useEffect(() => {
    if (!debug) replaceHash(hrefStage(topic.n, stage.id, stepIndex + 1));
    if (started || stepIndex > 0) progress.markSeen(topic.n, stage.id, stepIndex);
  }, [stepIndex, key, started]); // eslint-disable-line react-hooks/exhaustive-deps

  // ——— navigation ———
  const prevStage = stageIdx > 0 ? topic.stages[stageIdx - 1] : null;
  const nextStage = stageIdx < topic.stages.length - 1 ? topic.stages[stageIdx + 1] : null;
  const goStage = useCallback((s: Stage | null) => s && navigate(hrefStage(topic.n, s.id)), [topic.n]);

  // ——— viewport api ———
  const api = useRef<StageApi>(null);
  const shell = useRef<HTMLDivElement>(null);
  const [orbited, setOrbited] = useState(false);
  const [hintGone, setHintGone] = useState(false);
  useEffect(() => {
    if (orbited) setHintGone(true);
  }, [orbited]);
  const fullscreen = useCallback(() => {
    const el = shell.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }, []);
  const cycleLabels = useCallback(() => {
    const next = LABEL_NEXT[labelMode];
    setLabelOverride(null);
    progress.setPref('labels', next);
  }, [labelMode]);

  // ——— keyboard ———
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (timeline.get().holdReason === 'ask') return;
        timeline.toggle();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) goStage(nextStage);
        else timeline.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) goStage(prevStage);
        else timeline.prev();
      } else if (e.key === 'l' || e.key === 'L') cycleLabels();
      else if (e.key === 'r' || e.key === 'R') api.current?.reset();
      else if (e.key === 'f' || e.key === 'F') fullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goStage, nextStage, prevStage, cycleLabels, fullscreen]);

  const Scene = sceneFor(stage.scene);
  const colors = useMemo(() => Object.fromEntries(Object.entries(topic.structures).map(([id, s]) => [id, s.color])), [topic]);

  return (
    <main className="sim">
      <div className="sim-main" ref={shell}>
        <StageHeader topic={topic} stage={stage} stageIdx={stageIdx} />
        <div className="viewport">
          <Stage3D
            ref={api}
            stageKey={key}
            t={t}
            stepIndex={stepIndex}
            focus={focus}
            names={names}
            labelMode={labelMode}
            labelIds={labelIds}
            playing={playing}
            onUserOrbit={setOrbited}
            instant={route.params.get("paused") === "1"}
          >
            <Suspense fallback={null}>
              {Scene ? <Scene t={t} stepIndex={stepIndex} focus={focus} /> : <PlaceholderScene t={t} stepIndex={stepIndex} focus={focus} ids={stage.structures} colors={colors} />}
            </Suspense>
          </Stage3D>
          <div className="vp-tools" role="toolbar" aria-label="View tools">
            <button className={`vp-tool${labelMode !== 'step' ? ' is-on' : ''}`} onClick={cycleLabels} title={`${LABEL_TEXT[labelMode]} (L)`} aria-label={LABEL_TEXT[labelMode]}>
              <ITag />
              <small>{labelMode === 'step' ? 'step' : labelMode}</small>
            </button>
            <span className="vp-sep" />
            <button className="vp-tool" onClick={() => api.current?.reset()} title="Reset view (R)" aria-label="Reset view">
              <IReset />
            </button>
            <button className="vp-tool" onClick={() => api.current?.zoom(0.8)} title="Zoom in" aria-label="Zoom in">
              <IZoomIn />
            </button>
            <button className="vp-tool" onClick={() => api.current?.zoom(1.25)} title="Zoom out" aria-label="Zoom out">
              <IZoomOut />
            </button>
            <button className="vp-tool" onClick={fullscreen} title="Fullscreen (F)" aria-label="Fullscreen">
              <IFull />
            </button>
          </div>
          <div className={`vp-hint${hintGone || debug ? ' is-gone' : ''}`}>Drag to rotate · scroll to zoom · double-click resets</div>
          {orbited && (
            <button className="vp-back" onClick={() => api.current?.reset()}>
              <IReset size={14} /> Back to the guided view
            </button>
          )}
        </div>
        <Dock
          topic={topic}
          stage={stage}
          stepIndex={stepIndex}
          t={t}
          started={started}
          holdReason={holdReason}
          focus={focus}
          onChip={toggleChip}
          onAnswered={(i) => answered.current.add(i)}
          prevStage={prevStage}
          nextStage={nextStage}
          goStage={goStage}
        />
      </div>
      <RightPanel topic={topic} stage={stage} stageIdx={stageIdx} stepIndex={stepIndex} />
    </main>
  );
}

function StageHeader({ topic, stage, stageIdx }: { topic: Topic; stage: Stage; stageIdx: number }) {
  return (
    <div className="stage-head">
      <Menu
        className="stage-pick"
        title="Choose a stage"
        label={
          <>
            <span>
              Stage <b>{stageIdx + 1}</b> / {topic.stages.length}
            </span>
            <IChevron size={15} />
          </>
        }
      >
        {(close) =>
          topic.stages.map((s, i) => (
            <button
              key={s.id}
              className={`menu-item${i === stageIdx ? ' is-on' : ''}`}
              onClick={() => {
                close();
                navigate(hrefStage(topic.n, s.id));
              }}
            >
              <span className="menu-n">{i + 1}</span>
              <span>
                {s.title}
                <small>{s.subtitle}</small>
              </span>
            </button>
          ))
        }
      </Menu>
      <h1 className="stage-title">{stage.title}</h1>
      <span className="stage-sub">{stage.subtitle}</span>
    </div>
  );
}

function RightPanel({ topic, stage, stageIdx, stepIndex }: { topic: Topic; stage: Stage; stageIdx: number; stepIndex: number }) {
  const step = stage.steps[stepIndex];
  const seen = useProgress((d) => d.seen[topic.n] ?? EMPTY);
  return (
    <aside className="panel">
      <p className="kicker accent">Today</p>
      <ol className="stage-list">
        {topic.stages.map((s, i) => {
          const done = (seen[s.id] ?? -1) >= s.steps.length - 1;
          return (
            <li key={s.id}>
              <a href={hrefStage(topic.n, s.id)} className={`stage-item${i === stageIdx ? ' is-on' : ''}${done ? ' is-done' : ''}`} aria-current={i === stageIdx ? 'step' : undefined}>
                <span className="stage-num">{i + 1}</span>
                <span className="stage-name">{s.title}</span>
              </a>
            </li>
          );
        })}
      </ol>
      <div className="panel-cards">
        {step.key && (
          <div className="card card-key">
            <p className="kicker">Key</p>
            <p>{plain(step.key, (id) => topic.structures[id]?.name)}</p>
          </div>
        )}
        {step.caution && (
          <div className="card card-careful">
            <p className="kicker">Careful</p>
            <p>{plain(step.caution, (id) => topic.structures[id]?.name)}</p>
          </div>
        )}
        {step.exam && (
          <p className="exam-line">
            <span className="kicker">Exam</span> {plain(step.exam, (id) => topic.structures[id]?.name)}
          </p>
        )}
      </div>
      <p className="source-line">{stage.source}</p>
    </aside>
  );
}
const EMPTY: Record<string, number> = {};
