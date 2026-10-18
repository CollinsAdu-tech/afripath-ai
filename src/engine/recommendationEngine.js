// Deterministic, explainable career scoring. Pure functions: no I/O, no randomness, no clock.
//
// fitScore(career) = 100 * sum(weight_f * subscore_f) / sum(weight_f)     over EVALUABLE factors f
//
// A factor is evaluable only if the student answered it AND the career has a mapping for it.
// Skipped factors are excluded and the remaining weights are renormalised, so "I didn't answer"
// is never read as "no interest" or "no ability".
// Popularity and the number of resources in the knowledge base play NO part in scoring.

import { FACTOR_LABELS } from './config.js';
import { mapProfileToCareer, answeredFactors } from './careerFeatureMapper.js';

const FACTORS = Object.keys(FACTOR_LABELS); // interests, strengths, workStyle, academic, goals

/**
 * How much the student's answers can support meaningful matching.
 * @returns {{level:'insufficient'|'exploratory'|'sufficient', applicableWeightShare:number, answered:Record<string,boolean>, missing:string[]}}
 */
export function assessEvidence(profile, config) {
  const answered = answeredFactors(profile, config);
  const total = FACTORS.reduce((a, f) => a + config.weights[f], 0);
  const share = FACTORS.filter((f) => answered[f]).reduce((a, f) => a + config.weights[f], 0) / total;
  const hasCore = answered.interests || answered.strengths;
  const e = config.evidence;
  let level = 'sufficient';
  if (share < e.minApplicableWeight || (!hasCore && share < e.minWeightWithoutCore)) level = 'insufficient';
  else if (share < e.exploratoryBelowWeight) level = 'exploratory';
  // Missing factors, most influential first, so a UI can ask the highest-value question first.
  const missing = FACTORS.filter((f) => !answered[f]).sort((a, b) => config.weights[b] - config.weights[a]);
  return { level, applicableWeightShare: share, answered, missing };
}

/**
 * Score one career.
 * @returns {{careerId, fitScore:number, applicableWeight:number, factors:object[], features:object}}
 */
export function scoreCareer(profile, careerId, taxonomyEntry, config) {
  const features = mapProfileToCareer(profile, taxonomyEntry, config);
  const evaluated = FACTORS.filter((f) => features[f].score !== null);
  const applicableWeight = evaluated.reduce((a, f) => a + config.weights[f], 0);

  const factors = FACTORS.map((f) => {
    const ok = features[f].score !== null && applicableWeight > 0;
    const effectiveWeight = ok ? config.weights[f] / applicableWeight : 0;
    const subscore = ok ? features[f].score : null;
    return {
      factor: f,
      label: FACTOR_LABELS[f],
      evaluated: ok,
      nominalWeight: config.weights[f],
      effectiveWeight,            // after renormalisation; effective weights of evaluated factors sum to 1
      subscore,                   // 0..1
      contribution: ok ? 100 * effectiveWeight * subscore : 0, // points out of 100; contributions sum to fitScore
    };
  });
  const fitScore = factors.reduce((a, x) => a + x.contribution, 0);
  return { careerId, fitScore: Math.min(100, Math.max(0, fitScore)), applicableWeight, factors, features };
}

/**
 * Score and rank every career that has a taxonomy entry.
 * Ties (to 6 decimals) are broken by career id so identical inputs always give identical rankings.
 */
export function rankCareers(profile, careerIds, taxonomy, config) {
  const scored = careerIds
    .filter((id) => taxonomy[id])
    .map((id) => scoreCareer(profile, id, taxonomy[id], config));
  const key = (s) => Math.round(s.fitScore * 1e6);
  return scored.sort((a, b) => key(b) - key(a) || a.careerId.localeCompare(b.careerId));
}

export function fitBand(score, config) {
  return config.fitBands.find((b) => score >= b.min) || config.fitBands[config.fitBands.length - 1];
}

export const round1 = (n) => Math.round(n * 10) / 10;
