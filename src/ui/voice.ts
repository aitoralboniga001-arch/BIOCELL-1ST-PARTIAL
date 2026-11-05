/**
 * Narration with the Web Speech API (English voice). Text is split into sentences and queued (long
 * utterances get cut off in Chromium). `speaking()` is what the playback gate asks before leaving a step.
 */
let queue: SpeechSynthesisUtterance[] = [];
let active = false;
let token = 0;
let onIdle: (() => void) | null = null;

export const voiceSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

function pickVoice(): SpeechSynthesisVoice | null {
  if (!voiceSupported()) return null;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('en'));
  const rank = (v: SpeechSynthesisVoice) =>
    (/natural|neural|online/i.test(v.name) ? 0 : 10) + (/en-gb|en-us/i.test(v.lang) ? 0 : 3) + (/google/i.test(v.name) ? 1 : 2) + (v.localService ? 0 : 1);
  return voices.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

/** Strip [[id|text]] markup to its readable text. */
export function plain(text: string, name: (id: string) => string | undefined): string {
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, id: string, shown?: string) => shown ?? name(id.trim()) ?? id);
}

export const voice = {
  speaking: () => active,
  /** called whenever narration becomes idle */
  setOnIdle(cb: (() => void) | null) {
    onIdle = cb;
  },
  speak(text: string) {
    if (!voiceSupported()) return;
    voice.cancel();
    const my = ++token;
    const v = pickVoice();
    const parts = text
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?;:])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    active = true;
    queue = parts.map((p) => {
      const u = new SpeechSynthesisUtterance(p);
      if (v) u.voice = v;
      u.lang = v?.lang ?? 'en-GB';
      u.rate = 1.0;
      return u;
    });
    const next = () => {
      if (my !== token) return;
      const u = queue.shift();
      if (!u) {
        active = false;
        onIdle?.();
        return;
      }
      u.onend = next;
      u.onerror = next;
      speechSynthesis.speak(u);
    };
    next();
  },
  cancel() {
    token++;
    queue = [];
    const was = active;
    active = false;
    if (voiceSupported()) speechSynthesis.cancel();
    if (was) onIdle?.();
  },
};

if (voiceSupported()) {
  // voices load asynchronously in Chromium
  speechSynthesis.onvoiceschanged = () => void 0;
}
