/**
 * Content model. A Topic has Stages; a Stage plays a 3D scene over normalised time t ∈ [0, 1]
 * and is split into Steps (beats) that start at `at`. Everything the student reads lives here;
 * scenes only draw. Text comes from the course notes (sources/*.txt) — never invented facts.
 *
 * Inline markup in any text field:  [[structure-id]]  or  [[structure-id|shown text]]
 * renders as a chip that glows that structure in the 3D view.
 */

export interface Ask {
  q: string;
  options: string[];
  /** index into options */
  answer: number;
  /** one short explanation per option (why right / why wrong) */
  why: string[];
}

export interface Step {
  /** start, as a fraction of the stage (0..1), strictly increasing; the first step is at 0 */
  at: number;
  /** short title shown on the timeline tick and in the step list (≤ 60 chars) */
  title: string;
  /** the explanation for this step (2–6 sentences, from the notes) */
  text: string;
  /** one-sentence main idea (shown bold above the text) */
  idea: string;
  /** compact fact to memorise, shown as a "Key" card */
  key?: string;
  /** exam-style fact, collected into the topic Summary page */
  exam?: string;
  /** common confusion / trap, shown as a "Careful" card */
  caution?: string;
  /** structure ids lit (glow + highlighted label) during this step */
  focus: string[];
  /** optional check question (shown in Learn mode at the end of the step, and in the Quiz) */
  ask?: Ask;
}

export interface Stage {
  id: string;
  /** e.g. "The signal hypothesis" */
  title: string;
  /** one line under the title */
  subtitle: string;
  /** short paragraph shown before playing */
  intro: string;
  /** seconds to play the whole stage at 1× (typically 60–150) */
  duration: number;
  /** key into the scene registry (src/scenes/registry.ts) */
  scene: string;
  steps: Step[];
  /** 3–6 bullet summary of the stage */
  keyPoints: string[];
  /** structure ids that appear in this stage (glossary cross-links) */
  structures: string[];
  /** where in the notes: "Topic 7 · §6.1 Synthesis of water soluble proteins" */
  source: string;
}

export interface Structure {
  name: string;
  /** 1–3 sentence definition from the notes */
  desc: string;
  aka?: string[];
  /** swatch colour used in the glossary; should match the 3D colour (see three/kit/palette.ts) */
  color?: string;
}

export interface Topic {
  /** course topic number: 6..10 */
  n: number;
  slug: string;
  title: string;
  subtitle: string;
  /** accent colour for this topic's UI */
  accent: string;
  /** source file name in sources/ */
  file: string;
  stages: Stage[];
  structures: Record<string, Structure>;
  /** extra quiz items beyond the steps' `ask`s (e.g. the notes' "surprise questions", reworded) */
  quiz: Ask[];
  /**
   * Places where the notes contradict standard cell biology. We show what the notes say and add a
   * flag; we never silently rewrite the notes.
   */
  sourceIssues: { where: string; notes: string; textbook: string }[];
}

/** Props every 3D scene receives. Scenes are pure functions of t (no internal clocks for the story). */
export interface SceneProps {
  /** stage time, 0..1 */
  t: number;
  /** index of the current step */
  stepIndex: number;
  /** structure ids lit now (from the step plus any chip the student clicked) */
  focus: string[];
}
