import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, InputValidationError, CareerNotFoundError, validateRecommendationResult, validatePlan, QUESTIONNAIRE_OPTIONS, CONFIG } from '../src/engine/index.js';
import { CAREER_TAXONOMY } from '../src/engine/taxonomy.js';
import { buildKnowledgeBase } from '../src/knowledge/knowledgeBase.js';
import { kb, engine, profileOf, topIds, prng, rawKbFiles } from './helpers.js';

const ID = (s) => `career_${s}`;

// ---- Requirements 1-4: scenario recommendations from synthetic students
test('1. a beginner interested in programming and intelligent systems gets sensible introductory technical paths', () => {
  const r = engine.recommend(profileOf('recommend_beginner_programming_ai'));
  const ids = topIds(r);
  assert.equal(r.status, 'ok');
  assert.ok(ids.includes(ID('intro_to_coding')), 'includes the beginner on-ramp');
  assert.ok(ids.includes(ID('ai_ml_engineering')), 'includes AI/ML for the intelligent-systems interest');
  assert.ok(ids.every((i) => [ID('ai_ml_engineering'), ID('full_stack_web_development'), ID('intro_to_coding'), ID('data_careers'), ID('cloud_computing_aws')].includes(i)), `only technical paths: ${ids}`);
  for (const rec of r.recommendations) { assert.ok(rec.firstStep?.text); assert.equal(rec.roadmap.startingPoint.order, 1); }
});

test('1b. a complete beginner is pointed to the real Intro-to-Coding path as an on-ramp for a coding-heavy path', () => {
  const r = engine.recommend(profileOf('recommend_beginner_programming_ai'));
  const ai = r.recommendations.find((x) => x.careerId === ID('ai_ml_engineering'));
  assert.equal(ai.skillGaps.bridgePath?.careerId, ID('intro_to_coding'));
  assert.ok(kb.careers.has(ai.skillGaps.bridgePath.careerId));
  assert.ok(ai.skillGaps.prerequisites.some((p) => p.dimension === 'programming'));
  assert.match(ai.skillGaps.prerequisites[0].message, /not a requirement/i);
});

test('2. investigation + protection -> cybersecurity first, with matching evidence', () => {
  const r = engine.recommend(profileOf('recommend_security_investigator'));
  const top = r.recommendations[0];
  assert.equal(top.careerId, ID('cybersecurity'));
  assert.ok(top.matched.interests.some((i) => i.id === 'security_investigation'));
  assert.ok(top.matched.workStyles.some((i) => i.id === 'investigating'));
  assert.ok(top.matched.goals.some((i) => i.id === 'protect_people_orgs'));
  assert.ok(top.projects.every((p) => kb.projects.get(p.projectId).careerId === ID('cybersecurity')));
  assert.ok(top.projects.some((p) => p.safetyNote), 'ethical-testing safety note from the KB is carried through');
});

test('3. organising teams and workflows -> project management', () => {
  const r = engine.recommend(profileOf('recommend_project_organizer'));
  assert.equal(r.recommendations[0].careerId, ID('project_management'));
});

test('4. AI safety and quantum computing can each be returned when the profile supports them', () => {
  assert.equal(engine.recommend(profileOf('recommend_ai_safety_governance')).recommendations[0].careerId, ID('ai_safety'));
  assert.equal(engine.recommend(profileOf('recommend_quantum_curious')).recommendations[0].careerId, ID('quantum_computing'));
});

// ---- Requirement 5: missing answers
test('5. missing optional answers never crash the engine', () => {
  const full = profileOf('recommend_beginner_programming_ai');
  for (const key of Object.keys(full)) {
    const partial = { ...full }; delete partial[key];
    assert.doesNotThrow(() => engine.recommend(partial), `without ${key}`);
  }
  for (const p of [{}, { interests: [] }, { budget: null }, { interests: ['web_building'] }, { goals: ['start_business'] }]) assert.doesNotThrow(() => engine.recommend(p));
});

test('5b. skipping a factor renormalises the remaining weights (a skipped answer is not a zero)', () => {
  const r = engine.recommend({ interests: ['data_patterns'], currentSkills: ['analytical_thinking'] });
  for (const rec of r.recommendations) {
    const ev = rec.factorBreakdown.filter((f) => f.status === 'evaluated');
    assert.deepEqual(ev.map((f) => f.factor).sort(), ['interests', 'strengths']);
    assert.ok(Math.abs(ev.reduce((a, f) => a + f.weightPercent, 0) - 100) < 0.2);
    assert.ok(Math.abs(ev.find((f) => f.factor === 'interests').weightPercent - 58.3) < 0.2, '35/(35+25)');
    assert.ok(rec.factorBreakdown.filter((f) => f.status === 'not_evaluated').every((f) => f.score === null && f.weightPercent === 0));
  }
});

test('5c. invalid answers give a typed validation error with field details', () => {
  assert.throws(() => engine.recommend(null), (e) => e instanceof InputValidationError && e.details[0].field === 'profile');
  assert.throws(() => engine.recommend({ interests: 'web' }), (e) => e instanceof InputValidationError && e.details[0].field === 'interests');
});

test('evidence thresholds: too little information asks for more instead of ranking', () => {
  for (const p of [{}, { workStyles: ['building'] }, { goals: ['start_business'] }, { workStyles: ['building'], goals: ['start_business'] }]) {
    const r = engine.recommend(p);
    assert.equal(r.status, 'insufficient_information', JSON.stringify(p));
    assert.equal(r.recommendations.length, 0);
    assert.ok(r.missingInformation.length > 0 && r.missingInformation[0].factor === 'interests', 'asks the highest-weight question first');
    assert.equal(r.explore.otherCareers.length, 9, 'can still browse every career');
  }
});

test('evidence thresholds: interests alone is labelled exploratory, not a firm result', () => {
  const r = engine.recommend({ interests: ['data_patterns'] });
  assert.equal(r.status, 'exploratory');
  for (const rec of r.recommendations) { assert.equal(rec.fit.labelId, 'early_signal'); assert.equal(rec.fit.basis, 'limited_answers'); }
  assert.ok(r.notes.some((n) => /early signal/i.test(n)));
});

test('selecting almost every interest is flagged as leaving little to separate the paths', () => {
  const r = engine.recommend({ interests: QUESTIONNAIRE_OPTIONS.interests.map((o) => o.id) });
  assert.ok(r.notes.some((n) => /many interests/i.test(n)));
});

// ---- Requirement 6: determinism
test('6. identical inputs give identical results, including after reordering selections', () => {
  const p = profileOf('recommend_beginner_programming_ai');
  const a = JSON.stringify(engine.recommend(p));
  assert.equal(JSON.stringify(engine.recommend(structuredClone(p))), a);
  assert.equal(JSON.stringify(createEngine(kb).recommend(p)), a, 'a fresh engine agrees');
  const shuffled = { ...p, interests: [...p.interests].reverse(), currentSkills: [...p.currentSkills].reverse() };
  const b = engine.recommend(shuffled);
  assert.deepEqual(topIds(b), topIds(engine.recommend(p)));
  assert.deepEqual(b.recommendations.map((r) => r.fit.score), engine.recommend(p).recommendations.map((r) => r.fit.score));
});

test('6b. tied scores are ordered by career id, never by chance', () => {
  const taxonomy = { ...CAREER_TAXONOMY, career_ai_safety: CAREER_TAXONOMY.career_cybersecurity };   // two careers with identical evidence
  const tied = createEngine(kb, { taxonomy });
  const p = profileOf('recommend_security_investigator');
  for (let i = 0; i < 5; i++) {
    const r = tied.recommend(p);
    assert.equal(r.recommendations[0].fit.score, r.recommendations[1].fit.score);
    assert.deepEqual(topIds(r).slice(0, 2), [ID('ai_safety'), ID('cybersecurity')]);
  }
});

// ---- Requirements 7-8: bounds and valid ids, over many generated synthetic students
function randomProfile(rand) {
  const pick = (list, max) => list.filter(() => rand() < max / list.length);
  const maybe = (v) => (rand() < 0.6 ? v : undefined);
  const O = QUESTIONNAIRE_OPTIONS;
  return {
    interests: pick(O.interests.map((o) => o.id), 3), currentSkills: pick(O.strengths.map((o) => o.id), 3), skillsToDevelop: pick(O.strengths.map((o) => o.id), 2),
    workStyles: pick(O.workStyles.map((o) => o.id), 2), goals: pick(O.goals.map((o) => o.id), 2), subjects: pick(O.subjects.map((o) => o.id), 2),
    mathConfidence: maybe(1 + Math.floor(rand() * 5)), programmingExperience: maybe(O.programmingExperience[Math.floor(rand() * 4)]),
    scienceBackground: maybe(O.scienceBackground[Math.floor(rand() * 4)]), budget: maybe(O.budget[Math.floor(rand() * 3)]),
    internet: maybe(O.internet[Math.floor(rand() * 3)]), device: maybe(O.device[Math.floor(rand() * 3)]), weeklyHours: maybe(Math.floor(rand() * 20)),
    learningFormats: pick(O.learningFormats, 2),
  };
}

test('7+8. across 400 generated students: scores stay in 0-100, contributions add up, and all ids are valid', () => {
  const rand = prng(20261015);
  let evaluated = 0;
  for (let i = 0; i < 400; i++) {
    const p = randomProfile(rand);
    const r = engine.recommend(p);
    const check = validateRecommendationResult(r, kb);
    assert.ok(check.valid, `${JSON.stringify(p)} -> ${check.problems}`);
    for (const rec of r.recommendations) {
      evaluated++;
      assert.ok(rec.fit.score >= 0 && rec.fit.score <= 100);
      const sum = rec.factorBreakdown.reduce((a, f) => a + f.contributionPoints, 0);
      assert.ok(Math.abs(sum - rec.fit.score) <= 0.3, `contributions ${sum} vs ${rec.fit.score}`);
      for (const f of rec.factorBreakdown) assert.ok(f.score === null || (f.score >= 0 && f.score <= 100));
      assert.ok(rec.rank >= 1 && rec.rank <= 3);
    }
    for (const o of r.explore.otherCareers) if (o.fitScore !== null) assert.ok(o.fitScore >= 0 && o.fitScore <= 100);
    assert.ok(r.recommendations.length <= 3);
    const scores = r.recommendations.map((x) => x.fit.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a), 'ranked by score');
  }
  assert.ok(evaluated > 400);
});

test('8. no career appears twice and "explore" never repeats a recommended career', () => {
  const r = engine.recommend(profileOf('recommend_beginner_programming_ai'));
  const rec = new Set(topIds(r));
  assert.equal(rec.size, r.recommendations.length);
  for (const o of r.explore.otherCareers) assert.ok(!rec.has(o.careerId));
  assert.equal(rec.size + r.explore.otherCareers.length, 9);
});

test('maxResults limits how many recommendations are returned', () => {
  const r = engine.recommend(profileOf('recommend_beginner_programming_ai'), { maxResults: 1 });
  assert.equal(r.recommendations.length, 1);
  assert.equal(engine.recommend(profileOf('recommend_beginner_programming_ai'), { maxResults: 99 }).recommendations.length, 3);
});

// ---- Requirement 11: constraints must never change career fit
test('11. budget, internet, device, study time and formats never change scores or rankings', () => {
  const base = profileOf('recommend_beginner_programming_ai');
  const constrained = { ...base, budget: 'none', internet: 'unreliable', device: 'phone_only', weeklyHours: 1, learningFormats: ['video'] };
  const a = engine.recommend(base); const b = engine.recommend(constrained);
  assert.deepEqual(b.recommendations.map((r) => [r.careerId, r.fit.score]), a.recommendations.map((r) => [r.careerId, r.fit.score]));
  assert.deepEqual(b.explore.otherCareers, a.explore.otherCareers);
  assert.deepEqual(b.recommendations.map((r) => r.factorBreakdown), a.recommendations.map((r) => r.factorBreakdown));
});

test('11b. a cost-heavy path (cybersecurity: certifications) is still fully recommended to a student with no budget', () => {
  const p = { ...profileOf('recommend_security_investigator'), budget: 'none', internet: 'unreliable', device: 'phone_only', weeklyHours: 1 };
  const r = engine.recommend(p);
  assert.equal(r.recommendations[0].careerId, ID('cybersecurity'));
  assert.equal(r.recommendations[0].fit.score, engine.recommend(profileOf('recommend_security_investigator')).recommendations[0].fit.score);
});

test('11c. academic preparation is guidance, not a barrier: low maths moves quantum by only a few points', () => {
  const strong = { ...profileOf('recommend_quantum_curious'), mathConfidence: 5 };
  const weak = { ...profileOf('recommend_quantum_curious'), mathConfidence: 1 };
  const a = engine.recommend(strong).recommendations.find((r) => r.careerId === ID('quantum_computing'));
  const b = engine.recommend(weak).recommendations.find((r) => r.careerId === ID('quantum_computing'));
  assert.ok(b, 'still recommended');
  assert.ok(a.fit.score - b.fit.score <= 7.5 + 0.1, `penalty ${a.fit.score - b.fit.score}`);
  assert.ok(b.skillGaps.prerequisites.some((p) => p.dimension === 'math'), 'gap becomes guidance');
  assert.equal(b.roadmap.startingPoint.order, 1, 'still starts at the first stage');
});

test('an already-experienced coder is told the intro path may be redundant (not that they lack ability)', () => {
  const p = { interests: ['web_building'], currentSkills: ['programming'], programmingExperience: 'strong', workStyles: ['building'] };
  const r = engine.recommend(p, { maxResults: 3 });
  const intro = [...r.recommendations, ...r.explore.otherCareers].find((x) => x.careerId === ID('intro_to_coding'));
  assert.ok(intro);
  const beginner = engine.recommend({ ...p, programmingExperience: 'none' }).recommendations.find((x) => x.careerId === ID('intro_to_coding'))?.fit.score
    ?? engine.recommend({ ...p, programmingExperience: 'none' }).explore.otherCareers.find((x) => x.careerId === ID('intro_to_coding')).fitScore;
  const experienced = intro.fit?.score ?? intro.fitScore;
  assert.ok(experienced < beginner);
});

// ---- Requirement 12: changing interests changes rankings
test('12. changing interests changes the ranking, and only because of the changed evidence', () => {
  const base = { currentSkills: ['problem_solving'], workStyles: ['building'] };
  const cyber = engine.recommend({ ...base, interests: ['security_investigation'] });
  const pm = engine.recommend({ ...base, interests: ['organizing_projects'] });
  const web = engine.recommend({ ...base, interests: ['web_building'] });
  assert.equal(cyber.recommendations[0].careerId, ID('cybersecurity'));
  assert.equal(pm.recommendations[0].careerId, ID('project_management'));
  assert.equal(web.recommendations[0].careerId, ID('full_stack_web_development'));
  assert.notDeepEqual(topIds(cyber), topIds(pm));
});

test('weights are centralised: a different weight config changes the ranking without touching any other code', () => {
  const p = { interests: ['web_building'], goals: ['research'] };
  const base = engine.recommend(p).recommendations[0].careerId;
  const goalsOnly = createEngine(kb, { config: { ...CONFIG, weights: { interests: 0, strengths: 0, workStyle: 0, academic: 0, goals: 1 } } });
  const r = goalsOnly.recommend(p);
  assert.notEqual(r.recommendations[0].careerId, base);
  assert.equal(r.recommendations[0].careerId, ID('quantum_computing'));
});

test('the weights in the shipped config are exactly the product spec', () => {
  assert.deepEqual({ ...CONFIG.weights }, { interests: 0.35, strengths: 0.25, workStyle: 0.15, academic: 0.15, goals: 0.10 });
});

test('popularity and resource counts do not influence scores: stripping a career\'s resources and projects leaves every score unchanged', () => {
  const raw = rawKbFiles();
  raw.resources = raw.resources.filter((r) => !r.resource_id.startsWith('cyber_res_'));
  raw.projects = raw.projects.filter((x) => x.career_id !== ID('cybersecurity'));
  const lean = buildKnowledgeBase(raw);
  assert.ok(lean.resources.size < kb.resources.size);
  for (const name of ['recommend_security_investigator', 'recommend_beginner_programming_ai', 'recommend_project_organizer']) {
    const p = profileOf(name);
    const scores = (e) => Object.fromEntries([...e.recommend(p).recommendations.map((r) => [r.careerId, r.fit.score]), ...e.recommend(p).explore.otherCareers.map((o) => [o.careerId, o.fitScore])]);
    assert.deepEqual(scores(createEngine(lean)), scores(engine), name);
  }
});

// ---- Language safety
test('explanations never promise success, call a path "the one", or declare a student unsuitable', () => {
  const banned = /\b(guarantee[sd]?|perfect(ly)?|only path|the one|best career for you|you will succeed|will definitely|unsuitable|not for you|can't succeed|cannot succeed|not cut out|destined)\b/i;
  const rand = prng(7);
  for (let i = 0; i < 150; i++) {
    const r = engine.recommend(randomProfile(rand));
    assert.ok(!banned.test(JSON.stringify(r)), JSON.stringify(r).match(banned)?.[0]);
    for (const rec of r.recommendations) assert.match(rec.fit.disclaimer, /not a prediction of success/i);
    assert.match(r.scoreNote, /not a prediction of success/i);
  }
});

test('the response says the score is heuristic and gives a way to explore other careers', () => {
  const r = engine.recommend(profileOf('recommend_security_investigator'));
  assert.equal(r.recommendations[0].fit.kind, 'heuristic_fit_score');
  assert.ok(r.explore.otherCareers.length >= 6 && r.explore.hint);
  assert.equal(r.recommendations[0].roadmapRequest.path, '/v1/roadmaps');
});

test('careers can be listed and fetched; unknown ids throw a typed error', () => {
  assert.equal(engine.listCareers().length, 9);
  assert.equal(engine.getCareer(ID('cybersecurity')).stages.length, 4);
  assert.throws(() => engine.getCareer('nope'), CareerNotFoundError);
  assert.throws(() => engine.roadmap({}, 'nope'), CareerNotFoundError);
  assert.throws(() => engine.roadmap({}, undefined), CareerNotFoundError);
});
