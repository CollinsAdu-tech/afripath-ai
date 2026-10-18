// Evidence-based explanations. Every sentence is built from (a) the student's own answers that matched
// the career and (b) records in the knowledge base. Nothing here predicts success, calls a path "the
// one", or judges suitability. Language is plain and encouraging for secondary and early-university students.

import { QUESTIONNAIRE_OPTIONS as O } from './options.js';

const LABELS = {};
for (const group of ['interests', 'strengths', 'workStyles', 'goals', 'subjects']) {
  LABELS[group] = Object.fromEntries(O[group].map((o) => [o.id, o.label]));
}
export const labelOf = (group, id) => LABELS[group]?.[id] ?? id;
const item = (group, id) => ({ id, label: labelOf(group, id) });

/** "Building intelligent systems" -> "building intelligent systems" (keeps acronyms such as "ICT"). */
const lower = (s) => (s.length > 1 && s[1] === s[1].toUpperCase() && s[1] !== s[1].toLowerCase() ? s : s[0].toLowerCase() + s.slice(1));
const list = (labels) => {
  const l = labels.map(lower);
  if (l.length <= 1) return l.join('');
  return `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`;
};

const LEVEL_WORDS = ['not started yet', 'a beginner', 'comfortable', 'strong'];
const DIMENSION_LABELS = { math: 'Mathematics', programming: 'Programming', science: 'Science background' };

/** Answers that matched this career, as {id,label} items grouped like the questionnaire. */
export function describeMatches(scored, profile) {
  const f = scored.features;
  return {
    interests: f.interests.matched.map((id) => item('interests', id)),
    strengths: f.strengths.matched.map((id) => item('strengths', id)),
    skillsToDevelop: f.strengths.matchedToDevelop.map((id) => item('strengths', id)),
    workStyles: f.workStyle.matched.map((id) => item('workStyles', id)),
    goals: f.goals.matched.map((id) => item('goals', id)),
    subjects: f.academic.matchedSubjects.map((id) => item('subjects', id)),
  };
}

/** Plain-language reasons. `reasons[].factor` lets a UI group or icon them. */
export function explainRecommendation({ career, scored, profile, evidence, closeScores }) {
  const m = describeMatches(scored, profile);
  const reasons = [];
  const t = career.title;

  if (m.interests.length) reasons.push({ factor: 'interests', text: `You said you are interested in ${list(m.interests.map((x) => x.label))}, which is central to ${t}.`, matched: m.interests });
  else if (scored.features.interests.considered.length) reasons.push({ factor: 'interests', text: `Some of your interests connect with parts of ${t}, though it is not a central match.`, matched: [] });

  if (m.strengths.length) reasons.push({ factor: 'strengths', text: `Your strengths in ${list(m.strengths.map((x) => x.label))} are used a lot in this path.`, matched: m.strengths });
  if (m.skillsToDevelop.length) reasons.push({ factor: 'strengths', text: `You want to develop ${list(m.skillsToDevelop.map((x) => x.label))}, and this path gives plenty of chances to practise.`, matched: m.skillsToDevelop });
  if (m.workStyles.length) reasons.push({ factor: 'workStyle', text: `You like ${list(m.workStyles.map((x) => x.label))}, which is how much of the work in this path is done.`, matched: m.workStyles });
  if (m.goals.length) reasons.push({ factor: 'goals', text: `This path supports your goals: ${list(m.goals.map((x) => x.label))}.`, matched: m.goals });
  if (m.subjects.length) reasons.push({ factor: 'academic', text: `Your background in ${list(m.subjects.map((x) => x.label))} is helpful here.`, matched: m.subjects });

  const prep = scored.features.academic.preparation;
  const redundant = prep.dims.find((d) => d.note === 'already_covered');
  if (redundant) reasons.push({ factor: 'academic', text: 'You already have some programming experience, so you may move quickly through this foundation path or skip ahead to a more advanced one.', matched: [] });
  else if (prep.dims.length && prep.dims.every((d) => d.gap === 0)) reasons.push({ factor: 'academic', text: 'Your current preparation lines up well with where this path starts.', matched: [] });

  const strongMatches = reasons.filter((r) => r.matched.length).length;
  const headline = strongMatches >= 2 ? `${t} lines up with several of your answers` : `${t} connects with some of your answers`;
  const summary = reasons.slice(0, 2).map((r) => r.text).join(' ') || `${t} is worth a look based on the answers you gave.`;

  const notes = [];
  if (evidence.level === 'exploratory') notes.push('This suggestion is exploratory because you answered only a few questions. Answering more will sharpen it.');
  if (closeScores) notes.push('Several paths fit your answers similarly, so comparing them side by side may help.');
  notes.push('A short questionnaire cannot tell you what you can or cannot do. Treat this as a starting point for exploring.');
  return { headline, summary, reasons, notes };
}

const SKILL_LEVEL_RANK = { introductory: 0, beginner: 0, beginner_to_intermediate: 1, progressive: 2, intermediate: 2, intermediate_to_advanced: 3, advanced: 4 };

/** Skills, strengths and prerequisites to work on. Built only from KB skill records and the student's own answers. */
export function describeGaps({ kb, career, tax, taxonomy, scored, profile, config }) {
  const skillsToBuild = [...kb.skills.values()]
    .filter((s) => s.careerId === career.id && s.name)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (SKILL_LEVEL_RANK[a.s.level] ?? 1) - (SKILL_LEVEL_RANK[b.s.level] ?? 1) || a.i - b.i)
    .slice(0, config.limits.skillsToBuildFirst)
    .map(({ s }) => ({ skillId: s.id, name: s.name, level: s.level, evidence: s.evidence }));

  // Only when the student told us their current strengths can we say a strength is "not yet listed".
  const strengthsToBuild = profile.currentSkills.length
    ? Object.entries(tax.strengths)
        .filter(([id, v]) => v >= 0.8 && !profile.currentSkills.includes(id))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([id]) => item('strengths', id))
    : [];

  const prerequisites = scored.features.academic.preparation.dims
    .filter((d) => d.gap > 0)
    .map((d) => ({
      dimension: d.dimension,
      label: DIMENSION_LABELS[d.dimension],
      yourLevel: LEVEL_WORDS[d.have],
      helpfulLevel: LEVEL_WORDS[d.need],
      message: `${DIMENSION_LABELS[d.dimension]} becomes more important as you go deeper into this path. You are ${LEVEL_WORDS[d.have]} so far, and being ${LEVEL_WORDS[d.need]} would help over time. This is guidance, not a requirement: you can still start at the first stage.`,
    }));

  // For a complete beginner, point to a real introductory path in the KB (never invented).
  let bridgePath = null;
  const needsCoding = prerequisites.some((p) => p.dimension === 'programming');
  if (needsCoding && profile.programmingExperience === 'none') {
    const bridgeId = Object.entries(taxonomy || {}).find(([id, t]) => t.foundationPath && kb.careers.has(id))?.[0];
    const b = bridgeId && bridgeId !== career.id ? kb.careers.get(bridgeId) : null;
    if (b) bridgePath = { careerId: b.id, title: b.title, summary: b.summary, setupRequirements: b.setupRequirements,
      why: 'If you have never coded before, this beginner track can be a gentle on-ramp, before or alongside this path.' };
  }
  return { skillsToBuild, strengthsToBuild, prerequisites, bridgePath };
}

/** Notes about the answers as a whole (not about one career). */
export function profileNotes(profile, evidence, config) {
  const notes = [];
  if (profile.interests.length >= config.broadSelectionInterests) notes.push('You selected many interests, which leaves little to separate the paths. Try choosing the two or three that excite you most.');
  if (evidence.level === 'exploratory') notes.push('Only a few questions were answered, so these results are an early signal. Answer more to sharpen them.');
  return notes;
}

export const FACTOR_QUESTIONS = Object.freeze({
  interests: { fields: ['interests'], question: 'Which topics interest you most?' },
  strengths: { fields: ['currentSkills', 'skillsToDevelop'], question: 'What are you good at, and what would you like to get better at?' },
  workStyle: { fields: ['workStyles'], question: 'How do you like to work?' },
  academic: { fields: ['subjects', 'mathConfidence', 'programmingExperience', 'scienceBackground'], question: 'What have you studied, and how confident are you in maths and programming?' },
  goals: { fields: ['goals'], question: 'What do you hope to achieve?' },
});
