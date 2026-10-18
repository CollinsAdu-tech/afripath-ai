// Maps a normalised student profile onto ONE career's taxonomy entry, producing a 0..1 sub-score per
// factor plus the evidence behind it (which answers matched). It does no ranking and no weighting.
//
// A factor returns `score: null` when it cannot be evaluated (the student skipped it, or the career
// has no mapping for it). The engine then excludes that factor and renormalises the weights.
// Constraints (budget, internet, device, study time, formats) are deliberately NOT read here:
// they must never change career fit. They are used later, only to shape resources and the roadmap.

/** Blend of mean and best single affinity over the student's selections. */
function blend(values, { mean, max }) {
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return mean * avg + max * Math.max(...values);
}

/**
 * Affinity of a set of selected option ids to a career's mapping for that question.
 * Selected ids the career has no mapping for are skipped (unknown, not zero).
 * @returns {{score:number|null, considered:string[], matched:string[]}}
 */
export function selectionAffinity(selectedIds, careerMap, config) {
  const considered = (selectedIds || []).filter((id) => careerMap && typeof careerMap[id] === 'number');
  if (considered.length === 0) return { score: null, considered: [], matched: [] };
  const values = considered.map((id) => careerMap[id]);
  return {
    score: blend(values, config.selectionBlend),
    considered,
    matched: considered.filter((id) => careerMap[id] >= config.matchThreshold),
  };
}

/** Student's level (0..3) on a preparation dimension, or null if unanswered. */
export function preparationLevel(profile, dimension, config) {
  if (dimension === 'math') return profile.mathConfidence == null ? null : config.levels.mathConfidence[profile.mathConfidence];
  const key = dimension === 'programming' ? profile.programmingExperience : profile.scienceBackground;
  return key == null ? null : config.levels.experience[key];
}

function strengthsFeature(profile, tax, config) {
  const cur = selectionAffinity(profile.currentSkills, tax.strengths, config);
  const dev = selectionAffinity(profile.skillsToDevelop, tax.strengths, config);
  let score = null;
  if (cur.score !== null && dev.score !== null) score = config.skillBlend.current * cur.score + config.skillBlend.develop * dev.score;
  else score = cur.score ?? dev.score;
  return { score, matched: cur.matched, matchedToDevelop: dev.matched, considered: [...new Set([...cur.considered, ...dev.considered])] };
}

function academicFeature(profile, tax, config) {
  const subjects = selectionAffinity(profile.subjects, tax.subjects, config);

  const dims = [];
  for (const dimension of ['math', 'programming', 'science']) {
    const have = preparationLevel(profile, dimension, config);
    const need = tax.prep?.[dimension];
    if (have === null || typeof need !== 'number') continue;
    let dimScore;
    let note = null;
    if (dimension === 'programming' && tax.foundationPath) {
      // Introductory path: usefulness falls as the student already codes. Redundancy, not ability.
      dimScore = config.foundationRedundancy[profile.programmingExperience];
      if (dimScore < 1) note = 'already_covered';
    } else {
      const fit = need === 0 ? 1 : Math.min(1, have / need);
      dimScore = config.prepGapFloor + (1 - config.prepGapFloor) * fit; // never below the floor: no absolute barrier
    }
    dims.push({ dimension, have, need, score: dimScore, gap: Math.max(0, need - have), note });
  }
  const preparation = { score: dims.length ? dims.reduce((a, d) => a + d.score, 0) / dims.length : null, dims };

  let score = null;
  if (subjects.score !== null && preparation.score !== null) score = config.academicBlend.subjects * subjects.score + config.academicBlend.preparation * preparation.score;
  else score = subjects.score ?? preparation.score;
  return { score, subjects, preparation, matchedSubjects: subjects.matched };
}

/** @returns per-factor features for one career: {interests, strengths, workStyle, academic, goals} */
export function mapProfileToCareer(profile, tax, config) {
  const interests = selectionAffinity(profile.interests, tax.interests, config);
  const workStyle = selectionAffinity(profile.workStyles, tax.workStyles, config);
  const goals = selectionAffinity(profile.goals, tax.goals, config);
  return {
    interests: { score: interests.score, matched: interests.matched, considered: interests.considered },
    strengths: strengthsFeature(profile, tax, config),
    workStyle: { score: workStyle.score, matched: workStyle.matched, considered: workStyle.considered },
    academic: academicFeature(profile, tax, config),
    goals: { score: goals.score, matched: goals.matched, considered: goals.considered },
  };
}

/** Which factors the student's answers can support at all (independent of any career). */
export function answeredFactors(profile, config) {
  const prepAnswered = profile.mathConfidence != null || profile.programmingExperience != null || profile.scienceBackground != null;
  return {
    interests: profile.interests.length > 0,
    strengths: profile.currentSkills.length > 0 || profile.skillsToDevelop.length > 0,
    workStyle: profile.workStyles.length > 0,
    academic: profile.subjects.length > 0 || prepAnswered,
    goals: profile.goals.length > 0,
  };
}
