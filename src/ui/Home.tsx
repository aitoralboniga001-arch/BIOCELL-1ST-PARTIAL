import { TOPICS, totalSteps, topicByN } from './content';
import { hrefStage, navigate } from './router';
import { useProgress } from './progress';
import { IArrowRight, Logo } from './icons';

export function Home() {
  const seen = useProgress((d) => d.seen);
  const last = useProgress((d) => d.last);
  const best = useProgress((d) => d.best);
  const lastTopic = last ? topicByN(last.n) : undefined;
  const lastStage = lastTopic?.stages.find((s) => s.id === last?.stageId);

  return (
    <div className="home">
      <header className="home-top">
        <a className="brand" href="#/">
          <Logo />
          <span>
            BioCell <b>Atlas</b>
          </span>
        </a>
        <span className="home-course">Cell Biology · 1st partial · topics 6–10</span>
      </header>

      <section className="home-hero">
        <p className="kicker">Interactive 3D study simulator</p>
        <h1>The cell, step by step.</h1>
        <p className="home-lede">
          Every stage plays like a film: read one step, watch exactly that happen in 3D, check yourself, move on. Click a highlighted term to make it glow in the
          specimen.
        </p>
        <p className="home-how">
          <b>How to study</b> · Play a stage → read each step while it pauses → answer the Learn question → finish with the topic Summary and Quiz.
        </p>
        {last && lastTopic && lastStage && (
          <button className="btn btn-primary home-continue" onClick={() => navigate(hrefStage(last.n, last.stageId, last.step + 1))}>
            Continue · {lastTopic.n}. {lastStage.title} · step {last.step + 1}
            <IArrowRight size={16} />
          </button>
        )}
      </section>

      <section className="home-grid">
        {TOPICS.map((t) => {
          const total = totalSteps(t);
          const done = t.stages.reduce((a, s) => a + Math.min(s.steps.length, (seen[t.n]?.[s.id] ?? -1) + 1), 0);
          const pct = total ? Math.round((done / total) * 100) : 0;
          return (
            <a key={t.n} className="topic-card" href={`#/t/${t.n}`} style={{ ['--accent' as string]: t.accent }}>
              <span className="topic-card-n">{t.n}</span>
              <span className="topic-card-body">
                <span className="topic-card-title">{t.title}</span>
                <span className="topic-card-sub">{t.subtitle}</span>
              </span>
              <span className="topic-card-meta">
                <span>
                  {t.stages.length} stage{t.stages.length === 1 ? '' : 's'}
                </span>
                <span>{best[t.n] !== undefined ? `Quiz best ${best[t.n]}%` : 'Quiz —'}</span>
              </span>
              <span className="topic-card-bar" aria-label={`${pct}% studied`}>
                <i style={{ width: `${pct}%` }} />
              </span>
              <span className="topic-card-pct">{pct}%</span>
            </a>
          );
        })}
      </section>
      <footer className="home-foot">Works offline · progress is saved on this device</footer>
    </div>
  );
}
