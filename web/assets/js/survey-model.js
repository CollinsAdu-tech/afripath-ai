// Survey structure and answer handling (DOM-free so it can be tested). The engine owns the option ids;
// this file only decides how the questions are grouped and worded.

const L = {
  programmingExperience: { none: 'Never tried it', some: 'A little', comfortable: 'Comfortable', strong: 'Strong' },
  scienceBackground: { none: 'None yet', some: 'A little', comfortable: 'Comfortable', strong: 'Strong' },
  educationLevel: { junior_secondary: 'Junior high (JHS)', senior_secondary: 'Senior high (SHS)', tertiary: 'University or college', graduate: 'Graduate', other: 'Something else' },
  budget: { none: 'Free options only', low: 'A small budget', flexible: 'Flexible' },
  internet: { unreliable: 'Often unreliable', limited: 'Limited data', reliable: 'Reliable' },
  device: { phone_only: 'Phone only', low_spec_computer: 'Older or basic computer', standard_computer: 'Standard computer' },
  learningFormats: { video: 'Videos', text: 'Reading', interactive: 'Interactive lessons', hands_on: 'Hands-on projects', community: 'Learning with others' },
  mathConfidence: { 1: '1 · Not confident', 2: '2', 3: '3 · Okay', 4: '4', 5: '5 · Very confident' },
};

export const SURVEY_STEPS = [
  { short: 'Interests', title: 'What are you <span class="accent">curious</span> about?', help: 'Pick every topic that catches your attention.', fields: [{ key: 'interests', kind: 'multi', label: 'Topics that interest me' }] },
  { short: 'Strengths', title: 'What are you <span class="accent">good</span> at?', help: 'Be honest and generous with yourself. These shape which paths fit you.', fields: [
    { key: 'currentSkills', kind: 'multi', source: 'strengths', label: 'I am already good at', compact: true },
    { key: 'skillsToDevelop', kind: 'multi', source: 'strengths', label: 'I would like to get better at', compact: true }] },
  { short: 'Style', title: 'How do you like to <span class="accent">work</span>?', help: 'Choose the ways of working that feel most like you.', fields: [{ key: 'workStyles', kind: 'multi', label: 'I enjoy' }] },
  { short: 'Background', title: 'Where are you <span class="accent">now</span>?', help: 'This helps us pick a sensible starting point.', fields: [
    { key: 'educationLevel', kind: 'single', label: 'My level of study', enum: true },
    { key: 'subjects', kind: 'multi', label: 'Subjects I have studied or enjoy', compact: true },
    { key: 'mathConfidence', kind: 'single', label: 'How confident are you in maths?', enum: true, compact: true },
    { key: 'programmingExperience', kind: 'single', label: 'Programming experience', enum: true, compact: true },
    { key: 'scienceBackground', kind: 'single', label: 'Science background', enum: true, compact: true }] },
  { short: 'Goals', title: 'What do you want to <span class="accent">achieve</span>?', help: 'Where would you like this to take you?', fields: [{ key: 'goals', kind: 'multi', label: 'My goals' }] },
  { short: 'Practical', title: 'What does learning look like for <span class="accent">you</span>?', optionalNote: 'these never change your matches', help: 'These only help us order resources and flag things like data use and cost. They never change which paths we suggest.', fields: [
    { key: 'budget', kind: 'single', label: 'What can you spend on learning?', enum: true, compact: true },
    { key: 'internet', kind: 'single', label: 'Your internet', enum: true, compact: true },
    { key: 'device', kind: 'single', label: 'Your device', enum: true, compact: true },
    { key: 'weeklyHours', kind: 'number', label: 'About how many hours a week could you study?', min: 0, max: 80, help: 'A rough number is fine.' },
    { key: 'learningFormats', kind: 'multi', label: 'How do you like to learn?', compact: true }] },
];

const ENUMS = ['educationLevel', 'mathConfidence', 'programmingExperience', 'scienceBackground', 'budget', 'internet', 'device', 'learningFormats'];

/** Options for a question: objects with {id,label}. Engine enums arrive as plain ids and get friendly labels here. */
export function optionsFor(field, options) {
  const raw = options[field.source || field.key] || [];
  return raw.map((o) => (typeof o === 'object' ? o : { id: o, label: L[field.key]?.[o] ?? String(o).replace(/_/g, ' ') }));
}

const KEY = 'afripath.answers.v1';
let memory = {};
export function loadAnswers() { try { return JSON.parse(sessionStorage.getItem(KEY) || '{}') || {}; } catch { return { ...memory }; } }
export function saveAnswers(a) { memory = { ...a }; try { sessionStorage.setItem(KEY, JSON.stringify(a)); } catch { /* private mode: keep in memory only */ } }
export function clearAnswers() { memory = {}; try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } }

/** Turn raw survey answers into the engine's profile: drop empties, coerce numbers. Only known question keys are sent. */
export function buildProfile(a) {
  const keys = SURVEY_STEPS.flatMap((s) => s.fields.map((f) => f.key));
  const out = {};
  for (const k of keys) {
    const v = a?.[k];
    if (Array.isArray(v)) { if (v.length) out[k] = v; }
    else if (v !== undefined && v !== null && v !== '') out[k] = (k === 'mathConfidence' || k === 'weeklyHours') ? Number(v) : v;
  }
  return out;
}
