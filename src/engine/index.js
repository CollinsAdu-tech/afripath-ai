// Public entry point of the recommendation engine.
//
//   const kb = await loadKnowledgeBaseFromDir('data/kb-v0.7');   // src/knowledge
//   const engine = createEngine(kb);
//   engine.recommend(answers)          -> top career paths with explanations
//   engine.roadmap(answers, careerId)  -> personalised learning plan
//
// Framework-free and I/O-free: no HTTP, no file access, no clock, no randomness. The same answers and
// knowledge base always give the same result. The API layer (src/api) depends on this module only.

import { CONFIG, ENGINE_VERSION, SCORING_MODEL, HEURISTIC_NOTE, FACTOR_LABELS } from './config.js';
import { CAREER_TAXONOMY, TAXONOMY_VERSION, validateTaxonomy } from './taxonomy.js';
import { QUESTIONNAIRE_OPTIONS } from './options.js';
import { normalizeProfile, KNOWN_FIELDS } from './profileNormalizer.js';
import { mapProfileToCareer } from './careerFeatureMapper.js';
import { assessEvidence, rankCareers, fitBand, round1 } from './recommendationEngine.js';
import { explainRecommendation, describeMatches, describeGaps, profileNotes, FACTOR_QUESTIONS } from './recommendationExplainer.js';
import { personalizeRoadmap, summarizeForRecommendation } from './roadmapPersonalizer.js';
import { validateRecommendationResult, validatePlan } from './recommendationValidator.js';
import { InputValidationError, CareerNotFoundError } from './errors.js';
import { KnowledgeBaseError } from '../knowledge/knowledgeBase.js';

export { InputValidationError, CareerNotFoundError, ENGINE_VERSION, CONFIG, QUESTIONNAIRE_OPTIONS, CAREER_TAXONOMY, KNOWN_FIELDS };
export { validateRecommendationResult, validatePlan } from './recommendationValidator.js';

export function createEngine(kb, { config = CONFIG, taxonomy = CAREER_TAXONOMY } = {}) {
  if (!kb || !(kb.careers instanceof Map)) throw new KnowledgeBaseError('createEngine needs a knowledge base built by buildKnowledgeBase().');

  const problems = validateTaxonomy(taxonomy);
  if (problems.length) throw new KnowledgeBaseError(`The career taxonomy is invalid: ${problems.slice(0, 3).join('; ')}`);
  const wsum = Object.values(config.weights).reduce((a, b) => a + b, 0);
  if (!(wsum > 0) || Object.values(config.weights).some((w) => !(w >= 0))) throw new KnowledgeBaseError('Engine weights must be non-negative and sum to more than zero.');

  const issues = [];
  const scoreable = [];
  for (const id of kb.careers.keys()) {
    if (taxonomy[id]) scoreable.push(id);
    else issues.push({ severity: 'warning', code: 'NO_TAXONOMY', message: `Career "${id}" has no taxonomy entry, so it is not scored until one is added.`, ref: id });
  }
  for (const id of Object.keys(taxonomy)) if (!kb.careers.has(id)) issues.push({ severity: 'warning', code: 'TAXONOMY_UNKNOWN_CAREER', message: `Taxonomy entry "${id}" matches no career in the knowledge base.`, ref: id });
  if (scoreable.length === 0) throw new KnowledgeBaseError('No career in the knowledge base can be scored: none has a taxonomy entry.', issues);

  const meta = () => ({ engineVersion: ENGINE_VERSION, knowledgeBaseVersion: kb.version, taxonomyVersion: TAXONOMY_VERSION, scoringModel: SCORING_MODEL });

  function prepare(rawProfile) {
    const { profile, warnings, errors } = normalizeProfile(rawProfile);
    if (errors.length) throw new InputValidationError(errors);
    return { profile, warnings };
  }

  function careerView(careerId) {
    const c = kb.careers.get(careerId);
    return { careerId: c.id, title: c.title, category: c.category, summary: c.summary };
  }

  function recommend(rawProfile, { maxResults = config.maxRecommendations } = {}) {
    const { profile, warnings } = prepare(rawProfile);
    const limit = Math.min(Math.max(Number.isInteger(maxResults) ? maxResults : config.maxRecommendations, 1), config.maxRecommendations);
    const evidence = assessEvidence(profile, config);
    const missingInformation = evidence.missing.map((f) => ({ factor: f, label: FACTOR_LABELS[f], ...FACTOR_QUESTIONS[f] }));
    const base = {
      scoreNote: HEURISTIC_NOTE,
      evidence: { level: evidence.level, answeredFactors: Object.keys(evidence.answered).filter((f) => evidence.answered[f]), share: round1(evidence.applicableWeightShare * 100) },
      missingInformation,
      warnings,
      meta: { ...meta(), weights: config.weights },
    };

    if (evidence.level === 'insufficient') {
      return {
        status: 'insufficient_information',
        message: 'We need a little more information before suggesting paths. Answer the questions below, starting with the first. You can skip any you prefer not to answer.',
        recommendations: [],
        explore: { otherCareers: scoreable.map(careerView).map((c) => ({ ...c, fitScore: null })), hint: 'You can browse every career path while you decide what to answer.' },
        notes: [],
        ...base,
      };
    }

    const ranked = rankCareers(profile, scoreable, taxonomy, config);
    let chosen = ranked.filter((r) => r.fitScore >= config.minMeaningfulScore).slice(0, limit);
    let exploratoryFallback = false;
    if (chosen.length === 0) { chosen = ranked.slice(0, limit); exploratoryFallback = true; }
    const exploratory = evidence.level === 'exploratory' || exploratoryFallback;
    const spread = chosen.length > 1 ? chosen[0].fitScore - chosen[chosen.length - 1].fitScore : Infinity;
    const closeScores = spread < config.evidence.closeScoreSpread;

    const recommendations = chosen.map((scored, i) => {
      const career = kb.careers.get(scored.careerId);
      const tax = taxonomy[scored.careerId];
      const band = exploratory ? config.exploratoryBand : fitBand(scored.fitScore, config);
      const gaps = describeGaps({ kb, career, tax, taxonomy, scored, profile, config });
      const plan = personalizeRoadmap({ kb, careerId: career.id, profile, config, gaps });
      const slice = summarizeForRecommendation(plan, config);
      const explanation = explainRecommendation({ career, scored, profile, evidence, closeScores });
      return {
        rank: i + 1,
        ...careerView(career.id),
        fit: {
          kind: 'heuristic_fit_score', scale: '0-100', score: round1(scored.fitScore),
          label: band.label, labelId: band.id, basis: exploratory ? 'limited_answers' : 'broad_answers',
          disclaimer: 'Heuristic fit score based only on your answers. Not a prediction of success.',
        },
        explanation,
        matched: describeMatches(scored, profile),
        factorBreakdown: scored.factors.map((f) => ({
          factor: f.factor, label: f.label, status: f.evaluated ? 'evaluated' : 'not_evaluated',
          weightPercent: round1(f.effectiveWeight * 100), score: f.evaluated ? round1(f.subscore * 100) : null, contributionPoints: round1(f.contribution),
        })),
        careerBasis: tax.evidence,
        skillGaps: { skillsToBuild: gaps.skillsToBuild, strengthsToBuild: gaps.strengthsToBuild, prerequisites: gaps.prerequisites, bridgePath: gaps.bridgePath },
        ...slice,
        roadmapRequest: { method: 'POST', path: '/v1/roadmaps', body: { careerId: career.id } },
      };
    });

    const chosenIds = new Set(chosen.map((c) => c.careerId));
    const notes = profileNotes(profile, evidence, config);
    if (exploratoryFallback) notes.push('No path stood out strongly, so these are the closest matches for exploring rather than firm suggestions.');
    return {
      status: exploratory ? 'exploratory' : 'ok',
      message: exploratory
        ? 'Here are some paths to explore. Treat them as an early signal, not a firm answer.'
        : 'Here are paths that line up with your answers. They are starting points for exploring, not a verdict.',
      recommendations,
      explore: {
        otherCareers: ranked.filter((r) => !chosenIds.has(r.careerId)).map((r) => ({ ...careerView(r.careerId), fitScore: round1(r.fitScore) })),
        hint: 'Want to see other options? Browse these paths, or change your answers and ask again.',
      },
      notes,
      ...base,
    };
  }

  function roadmap(rawProfile, careerId) {
    if (typeof careerId !== 'string' || !kb.careers.has(careerId)) throw new CareerNotFoundError(careerId);
    const { profile, warnings } = prepare(rawProfile ?? {});
    const career = kb.careers.get(careerId);
    const tax = taxonomy[careerId];
    const gaps = tax
      ? describeGaps({ kb, career, tax, taxonomy, scored: { features: mapProfileToCareer(profile, tax, config) }, profile, config })
      : null;
    const plan = personalizeRoadmap({ kb, careerId, profile, config, gaps });
    return { ...plan, warnings, meta: meta() };
  }

  function listCareers() {
    return [...kb.careers.values()].map((c) => ({
      ...careerView(c.id), stageCount: c.stageIds.length, projectCount: c.projectIds.length, scored: Boolean(taxonomy[c.id]),
    }));
  }

  function getCareer(careerId) {
    if (typeof careerId !== 'string' || !kb.careers.has(careerId)) throw new CareerNotFoundError(careerId);
    const c = kb.careers.get(careerId);
    return {
      ...careerView(c.id), audiences: c.audiences, quickStart: c.quickStart, setupRequirements: c.setupRequirements,
      stages: c.stageIds.map((id) => { const s = kb.stages.get(id); return { stageId: s.id, order: s.order, name: s.name, durationPerSource: s.durationText }; }),
      projectCount: c.projectIds.length, skillCount: c.skillIds.length, opportunityLeadCount: c.opportunityIds.length,
      basis: taxonomy[c.id]?.evidence ?? [],
      verificationStatus: c.verificationStatus,
      meta: meta(),
    };
  }

  const options = () => ({ options: QUESTIONNAIRE_OPTIONS, factorWeights: config.weights, meta: meta() });
  const info = () => ({ ...meta(), counts: kb.counts, weights: config.weights, issues: issues.length + kb.issues.length });

  return { kb, recommend, roadmap, listCareers, getCareer, options, info, issues, meta };
}
