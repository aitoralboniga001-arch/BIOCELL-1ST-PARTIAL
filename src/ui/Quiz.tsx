import { useMemo, useState } from 'react';
import type { Topic } from '@/content/types';
import { allAsks } from './content';
import { AskCard } from './Dock';
import { progress, useProgress } from './progress';
import { Rich } from './Rich';

function shuffle<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function Quiz({ topic }: { topic: Topic }) {
  const [round, setRound] = useState(0);
  const items = useMemo(() => shuffle(allAsks(topic)), [topic, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const best = useProgress((d) => d.best[topic.n]);
  const answers = useProgress((d) => d.answers);

  if (!items.length)
    return (
      <main className="page quiz">
        <header className="page-head">
          <div>
            <p className="kicker accent">Quiz · topic {topic.n}</p>
            <h1>{topic.title}</h1>
          </div>
        </header>
        <p className="empty">No questions in this topic yet.</p>
      </main>
    );

  const done = i >= items.length;
  const score = Math.round((results.filter(Boolean).length / items.length) * 100);

  return (
    <main className="page quiz">
      <header className="page-head">
        <div>
          <p className="kicker accent">Quiz · topic {topic.n}</p>
          <h1>{topic.title}</h1>
          <p className="page-sub">
            {items.length} questions, shuffled{best !== undefined ? ` · your best: ${best}%` : ''}
          </p>
        </div>
        {!done && (
          <div className="quiz-progress" aria-label={`Question ${i + 1} of ${items.length}`}>
            <span>
              {i + 1}/{items.length}
            </span>
            <i>
              <b style={{ width: `${(i / items.length) * 100}%` }} />
            </i>
          </div>
        )}
      </header>

      {!done ? (
        <div className="quiz-card">
          <AskCard
            key={`${round}/${i}`}
            ask={items[i].ask}
            topic={topic}
            storeKey={items[i].key}
            label={items[i].where}
            doneLabel={i === items.length - 1 ? 'See score' : 'Next question'}
            onDone={(ok) => {
              const r = [...results, ok];
              setResults(r);
              if (i === items.length - 1) progress.setBest(topic.n, Math.round((r.filter(Boolean).length / items.length) * 100));
              setI(i + 1);
            }}
          />
        </div>
      ) : (
        <div className="quiz-done">
          <div className="score">
            <span className="score-n">{score}%</span>
            <span>
              {results.filter(Boolean).length} of {items.length} correct{best !== undefined ? ` · best ${best}%` : ''}
            </span>
            <button
              className="btn btn-primary"
              onClick={() => {
                setRound((r) => r + 1);
                setI(0);
                setResults([]);
              }}
            >
              Try again (reshuffled)
            </button>
          </div>
          <h2>Review</h2>
          <ol className="review">
            {items.map((it, k) => {
              const mine = answers[it.key];
              const ok = results[k];
              return (
                <li key={it.key} className={ok ? 'is-right' : 'is-wrong'}>
                  <p className="review-q">
                    <Rich text={it.ask.q} topic={topic} plainChips />
                  </p>
                  <p className="review-a">
                    <span className="tag tag-ok">Answer</span> <Rich text={it.ask.options[it.ask.answer]} topic={topic} plainChips />
                  </p>
                  {!ok && mine !== undefined && mine !== it.ask.answer && (
                    <p className="review-a">
                      <span className="tag tag-careful">You</span> <Rich text={it.ask.options[mine]} topic={topic} plainChips />
                    </p>
                  )}
                  <p className="review-why">
                    <Rich text={it.ask.why[it.ask.answer] ?? ''} topic={topic} plainChips />
                  </p>
                  <p className="source-line">{it.where}</p>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </main>
  );
}
