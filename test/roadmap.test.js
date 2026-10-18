import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan, QUESTIONNAIRE_OPTIONS } from '../src/engine/index.js';
import { normalizeUrl } from '../src/knowledge/knowledgeBase.js';
import { kb, engine, example, prng } from './helpers.js';

const careers = [...kb.careers.keys()];
const constrained = { budget: 'none', internet: 'unreliable', device: 'phone_only', weeklyHours: 2, learningFormats: ['text'] };

test('9. every career x several profiles: stages, resources, projects, communities and opportunities reference valid records', () => {
  for (const cid of careers) for (const p of [{}, constrained, { experienceByCareer: { [cid]: 'some' }, programmingExperience: 'strong' }, { experienceByCareer: { [cid]: 'solid' } }]) {
    const plan = engine.roadmap(p, cid);
    const v = validatePlan(plan, kb);
    assert.ok(v.valid, `${cid}: ${v.problems}`);
    assert.equal(plan.stages.length, kb.careers.get(cid).stageIds.length);
  }
});

test('10. no resource (by id or by URL) appears twice in a plan, although the Replit tool is used in all 4 intro-coding weeks', () => {
  for (const cid of careers) {
    const plan = engine.roadmap(constrained, cid);
    const ids = plan.stages.flatMap((s) => s.resources.map((r) => r.resourceId));
    assert.equal(new Set(ids).size, ids.length, cid);
    const urls = ids.map((id) => normalizeUrl(kb.resources.get(id).url)).filter(Boolean);
    assert.equal(new Set(urls).size, urls.length, `${cid} duplicate URL`);
  }
  const coding = engine.roadmap({}, 'career_intro_to_coding');
  const weeks = coding.stages.map((s) => s.activities.filter((a) => a.resources.some((r) => r.resourceId === 'coding_res_replit')).length);
  assert.ok(weeks.every((n) => n >= 1), 'the day-by-day structure is kept: every week still references Replit');
  assert.equal(coding.stages.flatMap((s) => s.resources).filter((r) => r.resourceId === 'coding_res_replit').length, 1, 'but it is listed once');
});

test('10b. resources that share a URL under different ids are listed once per plan', () => {
  const plan = engine.roadmap({}, 'career_ai_safety');
  const ids = plan.stages.flatMap((s) => s.resources.map((r) => r.resourceId));
  assert.ok(!(ids.includes('res_ai_safety_future_of_ai_course') && ids.includes('res_ai_safety_ai_strategy_course')));
});

test('9b. every link in a plan is copied from the knowledge base, never constructed', () => {
  for (const cid of careers) {
    const plan = engine.roadmap(constrained, cid);
    for (const s of plan.stages) for (const r of s.resources) assert.equal(r.url, kb.resources.get(r.resourceId).url);
    for (const o of plan.opportunityLeads) assert.equal(o.url, kb.opportunities.get(o.opportunityId).url);
    for (const s of plan.stages) for (const c of s.communities) assert.equal(c.url, kb.communities.get(c.communityId).url);
  }
});

test('opportunities are never presented as open, funded or verified', () => {
  for (const cid of careers) {
    const plan = engine.roadmap({}, cid);
    for (const o of plan.opportunityLeads) { assert.equal(o.status, 'unverified_lead'); assert.match(o.statusNote, /do not assume it is open/i); }
    assert.ok(!/\b(now open|applications? (are )?open|open for applications|fully funded)\b/i.test(JSON.stringify(plan)));
  }
});

test('nothing is called free without a verification caveat; every resource carries its verification status', () => {
  for (const cid of careers) for (const s of engine.roadmap({}, cid).stages) for (const r of s.resources) {
    assert.ok(r.access.costNote.length > 0);
    assert.ok(!/^free$/i.test(r.access.cost));
    assert.ok(r.verificationStatus && r.verificationStatus !== 'verified');
    assert.ok(['unverified_link', 'no_link_provided'].includes(r.linkStatus));
  }
  const noLink = engine.roadmap({}, 'career_intro_to_coding').stages.flatMap((s) => s.resources).find((r) => r.resourceId === 'coding_res_crash_course');
  assert.equal(noLink.url, null); assert.equal(noLink.linkStatus, 'no_link_provided');
});

test('quarantined (category-mismatch) projects never appear anywhere', () => {
  const bad = new Set([...kb.projects.values()].filter((p) => p.quarantined).map((p) => p.id));
  const all = JSON.stringify(careers.map((c) => engine.roadmap({}, c))) + JSON.stringify(engine.recommend(example('recommend_beginner_programming_ai').profile));
  for (const id of bad) assert.ok(!all.includes(id), id);
  assert.match(JSON.stringify(engine.roadmap({}, 'career_ai_ml_engineering').knowledgeGaps), /held back/);
});

test('a complete beginner starts at the first stage with a concrete, real first action', () => {
  for (const cid of careers) {
    const plan = engine.roadmap({ programmingExperience: 'none' }, cid);
    assert.equal(plan.startingPoint.stageId, kb.careers.get(cid).stageIds[0]);
    assert.ok(plan.firstAction?.text, cid);
    if (plan.firstAction.resource) assert.ok(kb.resources.has(plan.firstAction.resource.resourceId));
    assert.deepEqual(plan.stages.map((s) => s.status), ['start_here', 'upcoming', 'upcoming', 'upcoming']);
  }
});

test('prior experience moves the starting point forward and keeps earlier stages available', () => {
  const plan = engine.roadmap(example('roadmap_quantum_experienced').profile, 'career_quantum_computing');
  assert.equal(plan.startingPoint.order, 2);
  assert.deepEqual(plan.stages.map((s) => s.status), ['covered_by_your_answers', 'start_here', 'upcoming', 'upcoming']);
  assert.equal(engine.roadmap({ experienceByCareer: { career_cybersecurity: 'solid' } }, 'career_cybersecurity').startingPoint.order, 3);
});

test('genuine prerequisites are preserved verbatim from the source, not invented or evaluated', () => {
  const plan = engine.roadmap({}, 'career_quantum_computing');
  assert.deepEqual(plan.stages[3].prerequisitesPerSource, ['Understand basic quantum states and gates']);
  assert.deepEqual(plan.stages[0].prerequisitesPerSource, []);
});

test('stage durations are shown "per source" as text and no deadline or date is produced', () => {
  const plan = engine.roadmap({ weeklyHours: 5 }, 'career_cloud_computing_aws');
  assert.equal(plan.stages[1].durationPerSource, 'Months 1–3');
  assert.ok(!/\b(deadline|by (january|february|march|april|may|june|july|august|september|october|november|december))\b/i.test(JSON.stringify(plan.stages.map((s) => [s.name, s.focus, s.actions]))));
  assert.match(plan.pacing.note, /not turned into deadlines/);
});

test('11d. with no budget, resources that may involve cost are flagged and listed after the other options in their stage', () => {
  let checked = 0;
  for (const cid of careers) {
    const plan = engine.roadmap({ budget: 'none' }, cid);
    for (const s of plan.stages) {
      if (s.activities.some((a) => a.day)) continue;
      const flags = s.resources.map((r) => r.flags.some((f) => f.code === 'check_cost'));
      const firstFlagged = flags.indexOf(true);
      if (firstFlagged >= 0) { checked++; assert.ok(flags.slice(firstFlagged).every(Boolean), `${s.stageId}: unflagged resource after a flagged one`); }
    }
  }
  assert.ok(checked > 0, 'the check actually exercised costly resources');
  const aws = engine.roadmap({ budget: 'none' }, 'career_cloud_computing_aws');
  assert.ok(aws.accessConsiderations.some((a) => a.code === 'cost_may_apply' && a.resourceIds.length > 0));
  assert.ok(!aws.firstAction.flags.some((f) => f.code === 'check_cost'), 'first action is not a costly item when alternatives exist');
  assert.ok(aws.stages.flatMap((s) => s.resources).length === engine.roadmap({}, 'career_cloud_computing_aws').stages.flatMap((s) => s.resources).length, 'nothing is removed, only reordered');
});

test('11e. limited internet puts video-heavy resources last in a stage and explains the workaround', () => {
  const plan = engine.roadmap({ internet: 'unreliable' }, 'career_cybersecurity');
  const s = plan.stages[0];
  const heavy = s.resources.map((r) => r.access.dataUse === 'video_heavy');
  assert.ok(heavy.includes(true));
  assert.ok(heavy.slice(heavy.indexOf(true)).every(Boolean));
  assert.ok(plan.accessConsiderations.some((a) => a.code === 'data_use'));
});

test('device limits: the intro path quotes its real setup requirement; other paths admit the KB is silent', () => {
  const coding = engine.roadmap({ device: 'phone_only' }, 'career_intro_to_coding');
  assert.match(coding.accessConsiderations.find((a) => a.code === 'device').message, /Browser-based tools; no local development setup/);
  const cyber = engine.roadmap({ device: 'phone_only' }, 'career_cybersecurity');
  assert.match(cyber.accessConsiderations.find((a) => a.code === 'device').message, /does not state device requirements/);
});

test('a preferred learning format reorders resources and never removes any', () => {
  const plain = engine.roadmap({}, 'career_full_stack_web_development').stages[0].resources;
  const video = engine.roadmap({ learningFormats: ['video'] }, 'career_full_stack_web_development').stages[0].resources;
  assert.equal(video.length, plain.length);
  assert.ok(video[0].access.formats.includes('video'));
});

test('pacing: suggestion scales with weekly hours and is absent when hours are not given', () => {
  assert.equal(engine.roadmap({}, 'career_cybersecurity').pacing, null);
  assert.equal(engine.roadmap({ weeklyHours: 1 }, 'career_cybersecurity').pacing.suggestedItemsPerWeek, 1);
  assert.equal(engine.roadmap({ weeklyHours: 4 }, 'career_cybersecurity').pacing.suggestedItemsPerWeek, 2);
  const p = engine.roadmap({ weeklyHours: 10 }, 'career_cybersecurity').pacing;
  assert.equal(p.suggestedItemsPerWeek, 3); assert.equal(p.firstWeek.length, 3);
});

test('projects are ordered by difficulty for the student; the missing project->stage link is disclosed', () => {
  const beginner = engine.roadmap({ programmingExperience: 'none' }, 'career_quantum_computing').projects;
  assert.equal(beginner[0].difficulty, 'beginner');
  const experienced = engine.roadmap({ programmingExperience: 'strong' }, 'career_quantum_computing').projects;
  assert.equal(experienced[0].difficulty, 'intermediate');
  assert.equal(beginner.length, 5);
  assert.match(engine.roadmap({}, 'career_quantum_computing').knowledgeGaps.join(' '), /not to individual stages/);
});

test('data gaps are stated instead of filled: maths guidance admits the KB has no maths resources', () => {
  const plan = engine.roadmap({ mathConfidence: 1 }, 'career_quantum_computing');
  assert.match(plan.knowledgeGaps.join(' '), /no maths-specific resources/);
});

test('Data Careers exposes its real learning tracks, flagged as not independently verified', () => {
  const plan = engine.roadmap({}, 'career_data_careers');
  assert.equal(plan.learningTracks.length, 5);
  for (const t of plan.learningTracks) assert.match(t.verificationStatus, /not_independently_verified/);
});

test('roadmap works for random synthetic students without crashing and always validates', () => {
  const rand = prng(99);
  for (let i = 0; i < 120; i++) {
    const O = QUESTIONNAIRE_OPTIONS;
    const p = { budget: O.budget[Math.floor(rand() * 3)], internet: O.internet[Math.floor(rand() * 3)], device: O.device[Math.floor(rand() * 3)], weeklyHours: Math.floor(rand() * 30),
      programmingExperience: O.programmingExperience[Math.floor(rand() * 4)], mathConfidence: 1 + Math.floor(rand() * 5), learningFormats: [O.learningFormats[Math.floor(rand() * 5)]] };
    const cid = careers[Math.floor(rand() * careers.length)];
    const v = validatePlan(engine.roadmap(p, cid), kb);
    assert.ok(v.valid, `${cid} ${JSON.stringify(p)} ${v.problems}`);
  }
});

test('validator catches tampering: unknown ids, foreign links, duplicates and a claimed-open opportunity', () => {
  const good = () => engine.roadmap({}, 'career_cybersecurity');
  let p = good(); p.stages[0].resources[0].resourceId = 'res_made_up'; assert.ok(!validatePlan(p, kb).valid);
  p = good(); p.stages[0].resources[0].url = 'https://evil.example'; assert.match(validatePlan(p, kb).problems.join(), /does not come from the knowledge base/);
  p = good(); p.stages[1].resources.push({ ...p.stages[0].resources[0] }); assert.match(validatePlan(p, kb).problems.join(), /duplicate/);
  p = good(); p.opportunityLeads[0].status = 'open'; assert.match(validatePlan(p, kb).problems.join(), /must not claim a verified status/);
  p = good(); p.projects[0].projectId = 'proj_vulnerability_assessment'; assert.ok(!validatePlan(p, kb).valid);
  assert.ok(!validatePlan(null, kb).valid);
});
