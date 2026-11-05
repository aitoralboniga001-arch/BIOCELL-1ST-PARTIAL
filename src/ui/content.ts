import { TOPICS as RAW } from '@/content';
import type { Ask, Stage, Topic } from '@/content/types';
import { applyDevFixtures } from './dev/fixtures';
import { validateTopics } from '@/content/validate';

/** Topics as the UI sees them (dev fixtures applied in development only). */
export const TOPICS: Topic[] = import.meta.env.DEV ? applyDevFixtures(RAW) : RAW;

if (import.meta.env.DEV) {
  const problems = validateTopics(RAW);
  if (problems.length) console.warn(`[content] ${problems.length} problem(s):\n${problems.join('\n')}`);
}
export const topicByN = (n: number) => TOPICS.find((t) => t.n === n);

/** Ids mentioned with [[id]] / [[id|text]] markup in a string. */
export function mentions(text: string | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1].trim());
  return out;
}

export const stepStarts = (s: Stage) => s.steps.map((x) => x.at);

/** Every ask of a topic: step asks (with where they come from) + topic.quiz. */
export function allAsks(t: Topic): { key: string; ask: Ask; where: string }[] {
  const out: { key: string; ask: Ask; where: string }[] = [];
  t.stages.forEach((s, si) =>
    s.steps.forEach((st, i) => {
      if (st.ask) out.push({ key: `${t.n}/${s.id}/${i}`, ask: st.ask, where: `Stage ${si + 1} · ${s.title} · step ${i + 1}` });
    }),
  );
  t.quiz.forEach((a, k) => out.push({ key: `${t.n}/quiz/${k}`, ask: a, where: 'Topic quiz' }));
  return out;
}

export function totalSteps(t: Topic) {
  return t.stages.reduce((a, s) => a + s.steps.length, 0);
}
