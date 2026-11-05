/**
 * Renders text with [[id]] / [[id|text]] markup. Known ids become chips (click → glow in 3D);
 * unknown ids render as plain text and warn once in development (never crash).
 */
import { Fragment, type ReactNode } from 'react';
import type { Topic } from '@/content/types';

const warned = new Set<string>();

export function Rich({ text, topic, onChip, active, plainChips }: { text: string; topic: Topic; onChip?: (id: string) => void; active?: ReadonlySet<string>; plainChips?: boolean }) {
  const out: ReactNode[] = [];
  const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={k++}>{text.slice(last, m.index)}</Fragment>);
    const id = m[1].trim();
    const s = topic.structures[id];
    const shown = m[2] ?? s?.name ?? id;
    if (!s) {
      if (import.meta.env.DEV && !warned.has(`${topic.n}:${id}`)) {
        warned.add(`${topic.n}:${id}`);
        console.warn(`[content] Unknown structure id "${id}" in topic ${topic.n} markup — rendered as plain text.`);
      }
      out.push(<Fragment key={k++}>{shown}</Fragment>);
    } else if (plainChips || !onChip) {
      out.push(
        <span key={k++} className="term" style={{ ['--sw' as string]: s.color ?? '#9aa3ad' }}>
          {shown}
        </span>,
      );
    } else {
      const on = active?.has(id);
      out.push(
        <button key={k++} type="button" className={`chip${on ? ' is-on' : ''}`} style={{ ['--sw' as string]: s.color ?? '#9aa3ad' }} onClick={() => onChip(id)} title={`Show ${s.name} in 3D`}>
          <i />
          {shown}
        </button>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key={k++}>{text.slice(last)}</Fragment>);
  return <>{out}</>;
}
