import { useMemo, useState } from 'react';
import type { Topic } from '@/content/types';
import { hrefStage, navigate } from './router';
import { ICube, ISearch } from './icons';
import { Rich } from './Rich';

export function Glossary({ topic }: { topic: Topic }) {
  const [q, setQ] = useState('');
  const entries = useMemo(
    () =>
      Object.entries(topic.structures)
        .map(([id, s]) => {
          // first step that focuses it (else first stage that lists it)
          let where: { stage: string; step: number } | null = null;
          for (const st of topic.stages) {
            const i = st.steps.findIndex((x) => x.focus.includes(id));
            if (i >= 0) {
              where = { stage: st.id, step: i + 1 };
              break;
            }
          }
          if (!where) {
            const st = topic.stages.find((x) => x.structures.includes(id));
            if (st) where = { stage: st.id, step: 1 };
          }
          return { id, s, where };
        })
        .sort((a, b) => a.s.name.localeCompare(b.s.name)),
    [topic],
  );
  const needle = q.trim().toLowerCase();
  const shown = needle ? entries.filter(({ s }) => [s.name, s.desc, ...(s.aka ?? [])].join(' ').toLowerCase().includes(needle)) : entries;

  return (
    <main className="page glossary">
      <header className="page-head">
        <div>
          <p className="kicker accent">Glossary · topic {topic.n}</p>
          <h1>{topic.title}</h1>
          <p className="page-sub">{entries.length} structures · the swatch is the colour used in 3D</p>
        </div>
        <label className="search">
          <ISearch size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search structures…" aria-label="Search structures" />
        </label>
      </header>
      {shown.length === 0 && <p className="empty">Nothing matches “{q}”.</p>}
      <div className="gloss-list">
        {shown.map(({ id, s, where }) => (
          <article key={id} className="gloss-item">
            <span className="swatch" style={{ background: s.color ?? '#5b636d' }} />
            <div className="gloss-body">
              <h3>
                {s.name}
                {s.aka && s.aka.length > 0 && <span className="aka">{s.aka.join(' · ')}</span>}
              </h3>
              <p>
                <Rich text={s.desc} topic={topic} plainChips />
              </p>
            </div>
            {where && (
              <button className="btn btn-small" onClick={() => navigate(hrefStage(topic.n, where!.stage, where!.step))}>
                <ICube size={15} /> Show in 3D
              </button>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
