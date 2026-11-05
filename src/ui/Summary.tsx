import type { Topic } from '@/content/types';
import { Rich } from './Rich';
import { hrefStage } from './router';
import { IPrint } from './icons';

export function Summary({ topic }: { topic: Topic }) {
  return (
    <main className="page summary">
      <header className="page-head">
        <div>
          <p className="kicker accent">Summary · topic {topic.n}</p>
          <h1>{topic.title}</h1>
          <p className="page-sub">{topic.subtitle}</p>
        </div>
        <button className="btn no-print" onClick={() => window.print()}>
          <IPrint size={16} /> Print
        </button>
      </header>

      {topic.stages.map((s, si) => {
        const exams = s.steps.map((st, i) => ({ st, i })).filter((x) => x.st.exam || x.st.caution);
        return (
          <section key={s.id} className="sum-stage">
            <div className="sum-stage-head">
              <span className="sum-n">{si + 1}</span>
              <div>
                <h2>
                  <a href={hrefStage(topic.n, s.id)}>{s.title}</a>
                </h2>
                <p className="page-sub">{s.subtitle}</p>
              </div>
            </div>
            <ul className="sum-points">
              {s.keyPoints.map((k, i) => (
                <li key={i}>
                  <Rich text={k} topic={topic} plainChips />
                </li>
              ))}
            </ul>
            {exams.length > 0 && (
              <div className="sum-exam">
                {exams.map(({ st, i }) => (
                  <div key={i} className="sum-exam-row">
                    <a className="sum-step" href={hrefStage(topic.n, s.id, i + 1)}>
                      Step {i + 1}
                    </a>
                    <div>
                      {st.exam && (
                        <p>
                          <span className="tag tag-exam">Exam</span> <Rich text={st.exam} topic={topic} plainChips />
                        </p>
                      )}
                      {st.caution && (
                        <p>
                          <span className="tag tag-careful">Careful</span> <Rich text={st.caution} topic={topic} plainChips />
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="source-line">{s.source}</p>
          </section>
        );
      })}

      {topic.sourceIssues.length > 0 && (
        <section className="sum-issues">
          <p className="kicker">Notes vs textbook</p>
          <h2>Where the notes differ</h2>
          <p className="page-sub">We keep what the notes say (it is what the exam is based on) and flag the standard textbook view.</p>
          {topic.sourceIssues.map((x, i) => (
            <div key={i} className="issue">
              <p className="issue-where">{x.where}</p>
              <p>
                <span className="tag">Notes</span> {x.notes}
              </p>
              <p>
                <span className="tag tag-ok">Textbook</span> {x.textbook}
              </p>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
