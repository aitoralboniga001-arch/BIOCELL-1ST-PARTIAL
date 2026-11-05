import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Topic } from '@/content/types';
import { TOPICS } from './content';
import { hrefPage, navigate, type Route, type TopicPage } from './router';
import { progress, useProgress } from './progress';
import { voice, voiceSupported } from './voice';
import { IChevron, IHelp, IVoice, IVoiceOff, IX, Logo } from './icons';
import { Simulation } from './Simulation';
import { Summary } from './Summary';
import { Quiz } from './Quiz';
import { Glossary } from './Glossary';

export function TopicView({ topic, route }: { topic: Topic; route: Extract<Route, { kind: 'topic' }> }) {
  const [help, setHelp] = useState(false);
  return (
    <div className={`app page-${route.page}`} style={{ ['--accent' as string]: topic.accent }}>
      <TopBar topic={topic} page={route.page} onHelp={() => setHelp(true)} />
      {route.page === 'sim' && <Simulation topic={topic} route={route} />}
      {route.page === 'summary' && <Summary topic={topic} />}
      {route.page === 'quiz' && <Quiz topic={topic} />}
      {route.page === 'glossary' && <Glossary topic={topic} />}
      {help && <HelpDialog onClose={() => setHelp(false)} />}
    </div>
  );
}

function TopBar({ topic, page, onHelp }: { topic: Topic; page: TopicPage; onHelp: () => void }) {
  const voiceOn = useProgress((d) => d.prefs.voice);
  const tabs: { id: TopicPage; label: string; href: string }[] = [
    { id: 'sim', label: 'Simulation', href: `#/t/${topic.n}` },
    { id: 'summary', label: 'Summary', href: hrefPage(topic.n, 'summary') },
    { id: 'quiz', label: 'Quiz', href: hrefPage(topic.n, 'quiz') },
    { id: 'glossary', label: 'Glossary', href: hrefPage(topic.n, 'glossary') },
  ];
  return (
    <header className="topbar">
      <a className="brand" href="#/" title="All topics">
        <Logo />
        <span>
          BioCell <b>Atlas</b>
        </span>
      </a>
      <Menu
        className="topic-pick"
        label={
          <>
            <span className="topic-pick-n">{topic.n}</span>
            <span className="topic-pick-title">{topic.title}</span>
            <IChevron size={16} />
          </>
        }
      >
        {(close) =>
          TOPICS.map((t) => (
            <button
              key={t.n}
              className={`menu-item${t.n === topic.n ? ' is-on' : ''}`}
              onClick={() => {
                close();
                navigate(`#/t/${t.n}`);
              }}
            >
              <span className="menu-n" style={{ color: t.accent }}>
                {t.n}
              </span>
              <span>
                {t.title}
                <small>{t.subtitle}</small>
              </span>
            </button>
          ))
        }
      </Menu>
      <nav className="tabs" aria-label="Topic sections">
        {tabs.map((t) => (
          <a key={t.id} href={t.href} className={`tab${page === t.id ? ' is-on' : ''}`} aria-current={page === t.id ? 'page' : undefined}>
            {t.label}
          </a>
        ))}
      </nav>
      <div className="topbar-right">
        {voiceSupported() && (
          <button
            className={`tool-btn voice-btn${voiceOn ? ' is-on' : ''}`}
            onClick={() => {
              if (voiceOn) voice.cancel();
              progress.setPref('voice', !voiceOn);
            }}
            title={voiceOn ? 'Voice on — playback waits for the narration' : 'Read each step aloud'}
            aria-pressed={voiceOn}
          >
            {voiceOn ? <IVoice /> : <IVoiceOff />}
            <span>Voice</span>
          </button>
        )}
        <button className="tool-btn icon-only" onClick={onHelp} title="Help & shortcuts" aria-label="Help">
          <IHelp />
        </button>
      </div>
    </header>
  );
}

/** Button + dropdown (closes on outside click / Escape). */
export function Menu({ label, children, className, align = 'left', title }: { label: ReactNode; children: (close: () => void) => ReactNode; className?: string; align?: 'left' | 'right'; title?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className={`menu ${className ?? ''}${open ? ' is-open' : ''}`} ref={ref}>
      <button className="menu-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} title={title}>
        {label}
      </button>
      {open && <div className={`menu-pop align-${align}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const rows: [string, string][] = [
    ['Space', 'Play / pause'],
    ['← →', 'Previous / next step'],
    ['Shift + ← →', 'Previous / next stage'],
    ['L', 'Labels: this step → all → none'],
    ['R', 'Reset the view'],
    ['F', 'Fullscreen'],
  ];
  return (
    <div className="dialog-back" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Help" onClick={(e) => e.stopPropagation()}>
        <button className="dialog-x" onClick={onClose} aria-label="Close">
          <IX />
        </button>
        <p className="kicker">How it works</p>
        <h2>Study a stage like a film</h2>
        <p>
          Each stage is split into steps. Playback pauses at the end of every step (turn this off in the timeline) so you can read; the Learn question appears
          where a step has one. Click a coloured term to make that structure glow in 3D. Drag to rotate, scroll to zoom — the next step glides the camera back.
        </p>
        <table className="keys">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Debug: add <code>?t=0.5&amp;paused=1</code> to a stage address to render that moment.</p>
      </div>
    </div>
  );
}
