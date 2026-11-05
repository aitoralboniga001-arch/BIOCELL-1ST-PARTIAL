/**
 * DEV-ONLY fixtures (stripped from production builds by the import.meta.env.DEV guard in ui/content.ts).
 *  - While src/content/t7.ts is still a stub, the `signal` stage is replaced by a 7-step fixture that
 *    matches the reference scene (so the scene can be verified before the real content lands).
 *  - `?devask=1` injects a test Learn question into the first step of the current topic's stages that
 *    have none (to exercise the Learn flow). Never edits src/content.
 */
import type { Stage, Topic } from '@/content/types';

const SIGNAL_FIXTURE: Stage = {
  id: 'signal',
  title: 'The signal hypothesis',
  subtitle: 'How a ribosome gets to the rough ER',
  intro: 'Proteins that go to the ER start being made in the cytosol. A short hydrophobic signal peptide sends the whole ribosome to the ER membrane. [DEV FIXTURE — real content pending]',
  duration: 84,
  scene: 't7-signal',
  steps: [
    { at: 0, title: 'Translation starts in the cytosol', idea: 'Every protein starts on a free ribosome.', text: 'A free [[ribosome]] starts reading the [[mrna|mRNA]] in the [[cytosol]].', focus: ['ribosome', 'mrna'] },
    { at: 0.14, title: 'The signal peptide appears', idea: 'A hydrophobic signal peptide emerges first.', text: 'The [[signal-peptide|signal peptide]] (8–10 hydrophobic amino acids) emerges from the ribosome tunnel.', focus: ['signal-peptide'], key: 'Signal peptide = 8–10 hydrophobic aa near the start (N-terminus).' },
    { at: 0.28, title: 'SRP binds; translation pauses', idea: 'SRP recognises the signal peptide.', text: 'The [[srp|SRP]] binds the signal peptide and the ribosome. Translation is transiently stopped.', focus: ['srp'], caution: 'SRP pauses translation; it does not cut anything.' },
    { at: 0.42, title: 'To the SRP receptor', idea: 'SRP brings the complex to the RER.', text: 'SRP brings the mRNA–ribosome–nascent protein complex to the [[srp-receptor|SRP receptor]] on the [[er-membrane|RER membrane]].', focus: ['srp', 'srp-receptor'] },
    { at: 0.56, title: 'Translocon opens', idea: 'The translocon opens and translation resumes.', text: 'The [[translocon]] opens, SRP is released and the chain ([[polypeptide]]) threads into the [[er-lumen|ER lumen]].', focus: ['translocon', 'polypeptide'] },
    { at: 0.72, title: 'Signal peptidase cuts', idea: 'The signal peptide is removed.', text: '[[signal-peptidase|Signal peptidase]] cleaves the signal peptide, which stays in the membrane briefly.', focus: ['signal-peptidase', 'signal-peptide'], exam: 'Signal peptidase removes the signal peptide on the lumen side.' },
    { at: 0.86, title: 'Protein released', idea: 'A soluble protein ends up in the lumen.', text: 'The finished protein is released into the [[er-lumen|lumen]] and folds; the ribosome detaches and the translocon closes.', focus: ['polypeptide', 'er-lumen'] },
  ],
  keyPoints: ['Signal peptide → SRP → SRP receptor → translocon.', 'Translation pauses while SRP is bound.', 'Signal peptidase removes the signal peptide.'],
  structures: ['ribosome', 'mrna', 'signal-peptide', 'polypeptide', 'srp', 'srp-receptor', 'translocon', 'signal-peptidase', 'er-membrane', 'er-lumen', 'cytosol'],
  source: 'Topic 7 · §6 Translocation of proteins (DEV FIXTURE)',
};

const FIXTURE_STRUCTURES: Topic['structures'] = {
  ribosome: { name: 'Ribosome', desc: 'Makes proteins.', color: '#8e7cc3' },
  mrna: { name: 'mRNA', desc: 'Messenger RNA.', color: '#4fa3ff' },
  'signal-peptide': { name: 'Signal peptide', desc: '8–10 hydrophobic amino acids.', color: '#ffd23f' },
  polypeptide: { name: 'Nascent polypeptide', desc: 'The growing protein chain.', color: '#ff9a3c' },
  srp: { name: 'SRP', aka: ['Signal recognition particle'], desc: 'Recognises the signal peptide.', color: '#3ddc97' },
  'srp-receptor': { name: 'SRP receptor', desc: 'On the RER membrane.', color: '#2bb673' },
  translocon: { name: 'Translocon', desc: 'Protein channel of the ER membrane.', color: '#7fd1e8' },
  'signal-peptidase': { name: 'Signal peptidase', desc: 'Cuts the signal peptide.', color: '#e879f9' },
  'er-membrane': { name: 'RER membrane', desc: 'Membrane of the rough ER.', color: '#c9a46e' },
  'er-lumen': { name: 'ER lumen', desc: 'Inside of the ER.', color: '#2a6f6b' },
  cytosol: { name: 'Cytosol', desc: 'Fluid part of the cytoplasm.' },
};

const TEST_ASK = {
  q: '[DEV] Which particle recognises the signal peptide?',
  options: ['SRP', 'Signal peptidase', 'The translocon', 'BiP'],
  answer: 0,
  why: ['Right: the signal recognition particle binds it.', 'No: it cuts the signal peptide later.', 'No: it is the channel.', 'No: BiP is a lumenal chaperone.'],
};

export function applyDevFixtures(topics: Topic[]): Topic[] {
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  new URLSearchParams(window.location.search).forEach((v, k) => params.set(k, v));
  return topics.map((tp) => {
    let t = tp;
    if (t.n === 7) {
      const idx = t.stages.findIndex((s) => s.id === 'signal');
      const stub = idx < 0 || t.stages[idx].steps.length < 4;
      if (stub) {
        console.info('[dev] t7 `signal` content is a stub — using the dev fixture (src/ui/dev/fixtures.ts).');
        const stages = [...t.stages];
        if (idx < 0) stages.push(SIGNAL_FIXTURE);
        else stages[idx] = SIGNAL_FIXTURE;
        t = { ...t, stages, structures: { ...FIXTURE_STRUCTURES, ...t.structures } };
      }
    }
    if (params.get('devask') === '1') {
      t = {
        ...t,
        stages: t.stages.map((s) => (s.steps.some((x) => x.ask) ? s : { ...s, steps: s.steps.map((x, i) => (i === 1 || (s.steps.length === 1 && i === 0) ? { ...x, ask: TEST_ASK } : x)) })),
      };
    }
    return t;
  });
}
