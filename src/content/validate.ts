import type { Ask, Topic } from './types';

/** Matches [[id]] and [[id|shown text]]. */
const MARKUP = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

function markupIds(text: string | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(MARKUP)) out.push(m[1].trim());
  return out;
}

function checkAsk(ask: Ask, where: string, problems: string[]) {
  if (!ask.q || !ask.q.trim()) problems.push(`${where}: empty question`);
  if (ask.options.length !== 4) problems.push(`${where}: expected 4 options, found ${ask.options.length}`);
  if (!Number.isInteger(ask.answer) || ask.answer < 0 || ask.answer >= ask.options.length) {
    problems.push(`${where}: answer ${ask.answer} out of range (0..${ask.options.length - 1})`);
  }
  if (ask.why.length !== ask.options.length) {
    problems.push(`${where}: why.length (${ask.why.length}) != options.length (${ask.options.length})`);
  }
  if (new Set(ask.options).size !== ask.options.length) problems.push(`${where}: duplicate options`);
}

/** Returns a list of human-readable problems; an empty list means the topics are consistent. */
export function validateTopics(topics: Topic[]): string[] {
  const problems: string[] = [];
  const seenN = new Set<number>();

  for (const topic of topics) {
    const T = `T${topic.n}`;
    if (seenN.has(topic.n)) problems.push(`${T}: duplicate topic number`);
    seenN.add(topic.n);
    const known = new Set(Object.keys(topic.structures));
    const usedInStages = new Set<string>();
    const seenStages = new Set<string>();

    for (const id of known) {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) problems.push(`${T}: structure id "${id}" is not kebab-case`);
      const s = topic.structures[id];
      if (!s.name || !s.desc) problems.push(`${T}: structure "${id}" lacks name or desc`);
    }

    for (const stage of topic.stages) {
      const S = `${T}/${stage.id}`;
      if (seenStages.has(stage.id)) problems.push(`${S}: duplicate stage id`);
      seenStages.add(stage.id);
      if (stage.scene !== `t${topic.n}-${stage.id}`) {
        problems.push(`${S}: scene id "${stage.scene}" should be "t${topic.n}-${stage.id}"`);
      }
      if (stage.steps.length < 5 || stage.steps.length > 8) {
        problems.push(`${S}: ${stage.steps.length} steps (expected 5-8)`);
      }
      if (stage.keyPoints.length < 3 || stage.keyPoints.length > 6) {
        problems.push(`${S}: ${stage.keyPoints.length} keyPoints (expected 3-6)`);
      }
      if (!(stage.duration > 0)) problems.push(`${S}: duration must be > 0`);
      if (!stage.source) problems.push(`${S}: missing source`);
      if (!stage.steps.some((st) => st.ask)) problems.push(`${S}: no ask in any step`);

      const inStage = new Set(stage.structures);
      for (const id of stage.structures) {
        usedInStages.add(id);
        if (!known.has(id)) problems.push(`${S}: stage.structures id "${id}" missing from topic.structures`);
      }
      if (inStage.size !== stage.structures.length) problems.push(`${S}: duplicate ids in stage.structures`);

      let prev = -1;
      stage.steps.forEach((step, i) => {
        const P = `${S} step ${i + 1}`;
        if (i === 0 && step.at !== 0) problems.push(`${P}: first step must be at 0 (is ${step.at})`);
        if (step.at < 0 || step.at > 1) problems.push(`${P}: at ${step.at} out of range 0..1`);
        if (i > 0 && !(step.at > prev)) problems.push(`${P}: at ${step.at} is not > previous ${prev}`);
        if (i === stage.steps.length - 1 && step.at > 0.86 + 1e-9) {
          problems.push(`${P}: last step at ${step.at} exceeds 0.86`);
        }
        prev = step.at;
        if (step.title.length > 60) problems.push(`${P}: title longer than 60 chars`);
        if (!step.idea || !step.text) problems.push(`${P}: missing idea or text`);

        for (const f of step.focus) {
          if (!known.has(f)) problems.push(`${P}: focus id "${f}" missing from topic.structures`);
          else if (!inStage.has(f)) problems.push(`${P}: focus id "${f}" not listed in stage.structures`);
        }
        const fields: [string, string | undefined][] = [
          ['idea', step.idea],
          ['text', step.text],
          ['key', step.key],
          ['exam', step.exam],
          ['caution', step.caution],
        ];
        for (const [name, value] of fields) {
          for (const id of markupIds(value)) {
            if (!known.has(id)) problems.push(`${P}: [[${id}]] in ${name} missing from topic.structures`);
            else if (!inStage.has(id)) problems.push(`${P}: [[${id}]] in ${name} not listed in stage.structures`);
          }
        }
        if (step.ask) checkAsk(step.ask, `${P} ask`, problems);
      });
    }

    for (const id of known) {
      if (!usedInStages.has(id)) problems.push(`${T}: structure "${id}" is not used by any stage`);
    }
    topic.quiz.forEach((q, i) => checkAsk(q, `${T} quiz ${i + 1}`, problems));
    if (topic.quiz.length < 8 || topic.quiz.length > 15) {
      problems.push(`${T}: ${topic.quiz.length} quiz items (expected 8-15)`);
    }
    topic.sourceIssues.forEach((si, i) => {
      if (!si.where || !si.notes || !si.textbook) problems.push(`${T} sourceIssue ${i + 1}: empty field`);
    });
  }
  return problems;
}
