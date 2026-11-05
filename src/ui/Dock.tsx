/**
 * Bottom dock: ONE message at a time (stage intro → step text → Learn question → stage complete) and the
 * timeline (transport, scrubber with step ticks, step counter, speed, pause-at-steps, Learn).
 */
import { useRef, useState } from 'react';
import type { Ask, Stage, Topic } from '@/content/types';
import { SPEEDS, timeline, useTimeline } from '@/engine/timeline';
import { progress, useProgress } from './progress';
import { Rich } from './Rich';
import { IArrowRight, ICheck, IPause, IPlay, IStageNext, IStagePrev, IStepNext, IStepPrev, IX } from './icons';

interface DockProps {
  topic: Topic;
  stage: Stage;
  stepIndex: number;
  t: number;
  started: boolean;
  holdReason: string | null;
  focus: string[];
  onChip: (id: string) => void;
  onAnswered: (i: number) => void;
  prevStage: Stage | null;
  nextStage: Stage | null;
  goStage: (s: Stage | null) => void;
}

export function Dock(p: DockProps) {
  const { topic, stage, stepIndex, t } = p;
  const step = stage.steps[stepIndex];
  const active = new Set(p.focus);
  const learn = useProgress((d) => d.prefs.learn);
  let body;
  if (p.holdReason === 'ask' && step.ask && learn) {
    body = (
      <AskCard
        key={`${stage.id}/${stepIndex}`}
        ask={step.ask}
        topic={topic}
        storeKey={`${topic.n}/${stage.id}/${stepIndex}`}
        label={`Check · step ${stepIndex + 1}`}
        onDone={() => {
          p.onAnswered(stepIndex);
          timeline.play();
        }}
        doneLabel={stepIndex === stage.steps.length - 1 ? 'Finish stage' : 'Continue'}
      />
    );
  } else if (!p.started && t === 0) {
    body = (
      <div className="msg msg-intro">
        <p className="kicker accent">
          Stage · {stage.steps.length} steps · ~{Math.round(stage.duration / 60) || 1} min
        </p>
        <h2>{stage.title}</h2>
        <p className="msg-text">
          <Rich text={stage.intro} topic={topic} onChip={p.onChip} active={active} />
        </p>
        <div className="msg-actions">
          <button className="btn btn-primary" onClick={() => timeline.play()}>
            <IPlay size={15} /> Play the stage
          </button>
          <span className="muted small">Space to play · it pauses after each step</span>
        </div>
      </div>
    );
  } else if (t >= 1) {
    body = (
      <div className="msg msg-end">
        <p className="kicker accent">Stage complete</p>
        <h2>{stage.title}</h2>
        <ul className="end-points">
          {stage.keyPoints.map((k, i) => (
            <li key={i}>
              <Rich text={k} topic={topic} onChip={p.onChip} active={active} />
            </li>
          ))}
        </ul>
        <div className="msg-actions">
          {p.nextStage ? (
            <button className="btn btn-primary" onClick={() => p.goStage(p.nextStage)}>
              Next: {p.nextStage.title} <IArrowRight size={15} />
            </button>
          ) : (
            <a className="btn btn-primary" href={`#/t/${topic.n}/quiz`}>
              Take the topic quiz <IArrowRight size={15} />
            </a>
          )}
          <button className="btn" onClick={() => timeline.jumpStep(0)}>
            Replay
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="msg msg-step" key={`${stage.id}/${stepIndex}`}>
        <p className="kicker accent">
          Step {stepIndex + 1}/{stage.steps.length} · {step.title}
        </p>
        <p className="msg-idea">
          <Rich text={step.idea} topic={topic} onChip={p.onChip} active={active} />
        </p>
        <p className="msg-text">
          <Rich text={step.text} topic={topic} onChip={p.onChip} active={active} />
        </p>
      </div>
    );
  }
  return (
    <section className="dock">
      <div className="dock-msg">{body}</div>
      <Timeline stage={stage} stepIndex={stepIndex} prevStage={p.prevStage} nextStage={p.nextStage} goStage={p.goStage} />
    </section>
  );
}

// ———————————————————————————————————————— question card ————————————————————————————————————————

export function AskCard({ ask, topic, storeKey, label, onDone, doneLabel = 'Continue', onSkip }: { ask: Ask; topic: Topic; storeKey: string; label: string; onDone: (correct: boolean) => void; doneLabel?: string; onSkip?: () => void }) {
  const [chosen, setChosen] = useState<number | null>(null);
  return (
    <div className="msg msg-ask">
      <p className="kicker accent">{label}</p>
      <h2 className="ask-q">
        <Rich text={ask.q} topic={topic} plainChips />
      </h2>
      <div className="ask-options">
        {ask.options.map((o, i) => {
          const state = chosen === null ? '' : i === ask.answer ? ' is-right' : i === chosen ? ' is-wrong' : ' is-dim';
          return (
            <button
              key={i}
              className={`ask-opt${state}`}
              disabled={chosen !== null}
              onClick={() => {
                setChosen(i);
                progress.answer(storeKey, i);
              }}
            >
              <span className="ask-letter">{chosen !== null && i === ask.answer ? <ICheck size={14} /> : chosen === i ? <IX size={14} /> : String.fromCharCode(65 + i)}</span>
              <span className="ask-body">
                <Rich text={o} topic={topic} plainChips />
                {chosen !== null && ask.why[i] && (
                  <small className="ask-why">
                    <Rich text={ask.why[i]} topic={topic} plainChips />
                  </small>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="msg-actions">
        {chosen !== null ? (
          <button className="btn btn-primary" onClick={() => onDone(chosen === ask.answer)}>
            {chosen === ask.answer ? 'Correct — ' : ''}
            {doneLabel} <IArrowRight size={15} />
          </button>
        ) : (
          <button className="btn btn-ghost" onClick={() => (onSkip ? onSkip() : onDone(false))}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}

// ———————————————————————————————————————— timeline ————————————————————————————————————————

function Timeline({ stage, stepIndex, prevStage, nextStage, goStage }: { stage: Stage; stepIndex: number; prevStage: Stage | null; nextStage: Stage | null; goStage: (s: Stage | null) => void }) {
  const t = useTimeline((s) => s.t);
  const playing = useTimeline((s) => s.playing);
  const speed = useTimeline((s) => s.speed);
  const pauseAtSteps = useTimeline((s) => s.pauseAtSteps);
  const holdReason = useTimeline((s) => s.holdReason);
  const learn = useProgress((d) => d.prefs.learn);
  const bar = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; i: number } | null>(null);
  const n = stage.steps.length;

  const fracAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };
  const stepFor = (f: number) => {
    let i = 0;
    stage.steps.forEach((s, j) => f >= s.at && (i = j));
    return i;
  };

  return (
    <div className="tl">
      <div className="tl-transport">
        <button className="tl-btn" onClick={() => goStage(prevStage)} disabled={!prevStage} title="Previous stage (Shift+←)" aria-label="Previous stage">
          <IStagePrev size={16} />
        </button>
        <button className="tl-btn" onClick={() => timeline.prev()} disabled={stepIndex === 0 && t < 0.002} title="Previous step (←)" aria-label="Previous step">
          <IStepPrev size={17} />
        </button>
        <button className="tl-play" onClick={() => timeline.toggle()} title="Play / pause (Space)" aria-label={playing ? 'Pause' : 'Play'} disabled={holdReason === 'ask'}>
          {playing ? <IPause size={18} /> : <IPlay size={18} />}
        </button>
        <button className="tl-btn" onClick={() => timeline.next()} disabled={stepIndex >= n - 1} title="Next step (→)" aria-label="Next step">
          <IStepNext size={17} />
        </button>
        <button className="tl-btn" onClick={() => goStage(nextStage)} disabled={!nextStage} title="Next stage (Shift+→)" aria-label="Next stage">
          <IStageNext size={16} />
        </button>
      </div>

      <div
        className="tl-bar"
        ref={bar}
        role="slider"
        aria-label="Stage time"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(t * 100)}
        tabIndex={-1}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          timeline.seek(fracAt(e.clientX));
        }}
        onPointerMove={(e) => {
          const f = fracAt(e.clientX);
          setHover({ x: f, i: stepFor(f) });
          if (e.buttons & 1) timeline.seek(f);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <div className="tl-track">
          <div className="tl-fill" style={{ width: `${t * 100}%` }} />
        </div>
        {stage.steps.map((s, i) => (
          <span key={i} className={`tl-tick${i <= stepIndex ? ' is-past' : ''}${i === stepIndex ? ' is-now' : ''}${s.ask ? ' has-ask' : ''}`} style={{ left: `${s.at * 100}%` }} />
        ))}
        <span className="tl-head" style={{ left: `${t * 100}%` }} />
        {hover && (
          <span className="tl-tip" style={{ left: `${hover.x * 100}%` }}>
            <b>{hover.i + 1}</b> {stage.steps[hover.i].title}
          </span>
        )}
      </div>

      <span className="tl-count">
        Step <b>{stepIndex + 1}</b>/{n}
        {holdReason === 'voice' && <em className="tl-note">reading…</em>}
      </span>

      <div className="tl-opts">
      <div className="tl-speed" role="group" aria-label="Speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={s === speed ? 'is-on' : ''}
            onClick={() => {
              timeline.setSpeed(s);
              progress.setPref('speed', s);
            }}
          >
            {s}×
          </button>
        ))}
      </div>
      <label className="tl-toggle" title="Stop at the end of each step so you can read">
        <input
          type="checkbox"
          checked={pauseAtSteps}
          onChange={(e) => {
            timeline.setPauseAtSteps(e.target.checked);
            progress.setPref('pauseAtSteps', e.target.checked);
          }}
        />
        <span className="sw" /> Pause at steps
      </label>
      <label className="tl-toggle" title="Ask the step's check question before moving on">
        <input type="checkbox" checked={learn} onChange={(e) => progress.setPref('learn', e.target.checked)} />
        <span className="sw" /> Learn
      </label>
      </div>
    </div>
  );
}
