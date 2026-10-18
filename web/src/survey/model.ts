// Survey structure and answer handling. The engine owns the option ids and validation; this file only decides
// how the questions are grouped and worded, and turns answers into the engine's `StudentProfile`.
import type { OptionItem, OptionKey, OptionsResponse, StudentProfile } from '../api/types';

export type AnswerKey = Exclude<keyof StudentProfile, 'experienceByCareer'>;
export type AnswerValue = string[] | string | number | null | undefined;
export type Answers = Partial<Record<AnswerKey, AnswerValue>>;

/** A heading made of plain text and one accent word, e.g. ['What are you ', {accent:'good'}, ' at?']. */
export type TitlePart = string | { accent: string };

export interface Field {
  key: AnswerKey;
  kind: 'multi' | 'single' | 'number';
  label: string;
  /** Option list to use when it differs from the key (both strength questions use `strengths`). */
  source?: OptionKey;
  compact?: boolean;
  help?: string;
  min?: number;
  max?: number;
}
export interface Step { short: string; title: TitlePart[]; help: string; note?: string; fields: Field[] }

const LABELS: Partial<Record<AnswerKey, Record<string, string>>> = {
  programmingExperience: { none: 'Never tried it', some: 'A little', comfortable: 'Comfortable', strong: 'Strong' },
  scienceBackground: { none: 'None yet', some: 'A little', comfortable: 'Comfortable', strong: 'Strong' },
  educationLevel: { junior_secondary: 'Junior high (JHS)', senior_secondary: 'Senior high (SHS)', tertiary: 'University or college', graduate: 'Graduate', other: 'Something else' },
  budget: { none: 'Free options only', low: 'A small budget', flexible: 'Flexible' },
  internet: { unreliable: 'Often unreliable', limited: 'Limited data', reliable: 'Reliable' },
  device: { phone_only: 'Phone only', low_spec_computer: 'Older or basic computer', standard_computer: 'Standard computer' },
  learningFormats: { video: 'Videos', text: 'Reading', interactive: 'Interactive lessons', hands_on: 'Hands-on projects', community: 'Learning with others' },
  mathConfidence: { '1': '1 · Not confident', '2': '2', '3': '3 · Okay', '4': '4', '5': '5 · Very confident' },
};

export const SURVEY_STEPS: Step[] = [
  { short: 'Interests', title: ['What are you ', { accent: 'curious' }, ' about?'], help: 'Pick every topic that catches your attention.', fields: [{ key: 'interests', kind: 'multi', label: 'Topics that interest me' }] },
  { short: 'Strengths', title: ['What are you ', { accent: 'good' }, ' at?'], help: 'Be honest and generous with yourself. These shape which paths fit you.', fields: [
    { key: 'currentSkills', kind: 'multi', source: 'strengths', label: 'I am already good at', compact: true },
    { key: 'skillsToDevelop', kind: 'multi', source: 'strengths', label: 'I would like to get better at', compact: true }] },
  { short: 'Style', title: ['How do you like to ', { accent: 'work' }, '?'], help: 'Choose the ways of working that feel most like you.', fields: [{ key: 'workStyles', kind: 'multi', label: 'I enjoy' }] },
  { short: 'Background', title: ['Where are you ', { accent: 'now' }, '?'], help: 'This helps us pick a sensible starting point.', fields: [
    { key: 'educationLevel', kind: 'single', label: 'My level of study' },
    { key: 'subjects', kind: 'multi', label: 'Subjects I have studied or enjoy', compact: true },
    { key: 'mathConfidence', kind: 'single', label: 'How confident are you in maths?', compact: true },
    { key: 'programmingExperience', kind: 'single', label: 'Programming experience', compact: true },
    { key: 'scienceBackground', kind: 'single', label: 'Science background', compact: true }] },
  { short: 'Goals', title: ['What do you want to ', { accent: 'achieve' }, '?'], help: 'Where would you like this to take you?', fields: [{ key: 'goals', kind: 'multi', label: 'My goals' }] },
  { short: 'Practical', title: ['What does learning look like for ', { accent: 'you' }, '?'], note: 'these never change your matches', help: 'These only help us order resources and flag things like data use and cost. They never change which paths we suggest.', fields: [
    { key: 'budget', kind: 'single', label: 'What can you spend on learning?', compact: true },
    { key: 'internet', kind: 'single', label: 'Your internet', compact: true },
    { key: 'device', kind: 'single', label: 'Your device', compact: true },
    { key: 'weeklyHours', kind: 'number', label: 'About how many hours a week could you study?', min: 0, max: 80, help: 'A rough number is fine.' },
    { key: 'learningFormats', kind: 'multi', label: 'How do you like to learn?', compact: true }] },
];

/** Options for a question as {id,label}. Engine enums arrive as plain ids and get friendly labels here. */
export function optionsFor(field: Field, options: OptionsResponse['options']): OptionItem[] {
  const raw = options[field.source ?? (field.key as OptionKey)] as Array<OptionItem | string | number> | undefined;
  return (raw ?? []).map((o) => {
    if (typeof o === 'object') return o;
    const id = String(o);
    return { id, label: LABELS[field.key]?.[id] ?? id.replace(/_/g, ' ') };
  });
}

const NUMERIC: AnswerKey[] = ['mathConfidence', 'weeklyHours'];

/**
 * Turns survey answers into the engine's profile: empty answers are dropped, numbers are coerced, and only
 * questions that exist in the survey are ever sent (so no stray personal data can leak into a request).
 */
export function buildProfile(answers: Answers | null | undefined): StudentProfile {
  const out: Record<string, unknown> = {};
  for (const step of SURVEY_STEPS) {
    for (const { key } of step.fields) {
      const v = answers?.[key];
      if (Array.isArray(v)) { if (v.length) out[key] = v; continue; }
      if (v === undefined || v === null || v === '') continue;
      if (NUMERIC.includes(key)) { const n = Number(v); if (Number.isFinite(n)) out[key] = n; continue; }
      out[key] = v;
    }
  }
  // Boundary cast: the engine re-validates every field, and unknown ids come back as warnings, not crashes.
  return out as StudentProfile;
}

export const hasAnswers = (profile: StudentProfile): boolean => Object.keys(profile).length > 0;
