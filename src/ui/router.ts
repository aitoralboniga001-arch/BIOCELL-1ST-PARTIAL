/**
 * Hash routing:
 *   #/                              home
 *   #/t/7                           topic 7, simulation (last position or stage 1)
 *   #/t/7/<stageId>?step=3          topic 7, stage, step 3 (1-based)
 *   #/t/7/summary | quiz | glossary topic pages
 * Debug params (in the hash query or the page query): t=0..1 (stage time), paused=1, labels=step|all|none,
 * devask=1 (dev only: inject a test Learn question).
 */
import { useEffect, useState } from 'react';

export type TopicPage = 'sim' | 'summary' | 'quiz' | 'glossary';
export type Route =
  | { kind: 'home' }
  | { kind: 'topic'; n: number; page: TopicPage; stageId?: string; step?: number; params: URLSearchParams };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '');
  const [path, query = ''] = h.split('?');
  const params = new URLSearchParams(query);
  // page-level query (?t=…&paused=1#/t/7/signal) also counts, hash wins
  if (typeof window !== 'undefined') new URLSearchParams(window.location.search).forEach((v, k) => !params.has(k) && params.set(k, v));
  const parts = path.split('/').filter(Boolean);
  if (parts[0] !== 't' || !parts[1]) return { kind: 'home' };
  const n = Number(parts[1]);
  if (!Number.isFinite(n)) return { kind: 'home' };
  const third = parts[2];
  if (third === 'summary' || third === 'quiz' || third === 'glossary') return { kind: 'topic', n, page: third, params };
  const stepRaw = params.get('step');
  const step = stepRaw ? Math.max(1, Number(stepRaw) || 1) : undefined;
  return { kind: 'topic', n, page: 'sim', stageId: third ? decodeURIComponent(third) : undefined, step, params };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(hash: string) {
  if (window.location.hash !== hash) window.location.hash = hash;
}

/** Update the address bar without a navigation (step/stage position while playing). */
export function replaceHash(hash: string) {
  if (window.location.hash === hash) return;
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
}

export const hrefStage = (n: number, stageId: string, step?: number) => `#/t/${n}/${encodeURIComponent(stageId)}${step ? `?step=${step}` : ''}`;
export const hrefPage = (n: number, page: Exclude<TopicPage, 'sim'>) => `#/t/${n}/${page}`;
