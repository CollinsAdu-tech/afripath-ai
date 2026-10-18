import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildKnowledgeBase, KnowledgeBaseError } from '../src/knowledge/knowledgeBase.js';
import { loadKnowledgeBaseFromDir } from '../src/knowledge/loadFromDirectory.js';
import { createEngine } from '../src/engine/index.js';
import { CONFIG } from '../src/engine/config.js';
import { kb, rawKbFiles } from './helpers.js';

const clone = () => structuredClone(rawKbFiles());

test('real v0.7 knowledge base loads with the documented counts', () => {
  assert.deepEqual(kb.counts, { careers: 9, stages: 36, resources: 157, skills: 102, projects: 46, communities: 35, opportunities: 33, learningTracks: 5 });
  assert.equal(kb.version, '0.7');
});

test('stable career ids are preserved and every career has four ordered stages', () => {
  assert.deepEqual([...kb.careers.keys()].sort(), [
    'career_ai_ml_engineering', 'career_ai_safety', 'career_cloud_computing_aws', 'career_cybersecurity', 'career_data_careers',
    'career_full_stack_web_development', 'career_intro_to_coding', 'career_project_management', 'career_quantum_computing']);
  for (const c of kb.careers.values()) {
    assert.equal(c.stageIds.length, 4, c.id);
    const orders = c.stageIds.map((id) => kb.stages.get(id).order);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  }
});

test('all stage->resource, activity->resource and stage->community references resolve', () => {
  for (const s of kb.stages.values()) {
    for (const r of s.resourceIds) assert.ok(kb.resources.has(r), `${s.id} -> ${r}`);
    for (const a of s.activities) for (const r of a.resourceIds) assert.ok(kb.resources.has(r));
    for (const c of s.communityIds) assert.ok(kb.communities.has(c));
  }
  assert.equal(kb.issues.filter((i) => i.code === 'DANGLING_RESOURCE_REF').length, 0);
});

test('the 5 projects the archive flags as category mismatches are quarantined, not attached to any career', () => {
  const q = [...kb.projects.values()].filter((p) => p.quarantined).map((p) => p.id).sort();
  assert.equal(q.length, 5);
  for (const c of kb.careers.values()) for (const id of c.projectIds) assert.ok(!q.includes(id));
  assert.equal(kb.issues.filter((i) => i.code === 'PROJECT_CATEGORY_MISMATCH').length, 5);
});

test('every non-quarantined project is linked to a career', () => {
  for (const p of kb.projects.values()) if (!p.quarantined) assert.ok(p.careerId, p.id);
});

test('opportunities are never marked open or verified', () => {
  for (const o of kb.opportunities.values()) assert.equal(o.status, 'unverified_lead');
});

test('no resource is ever classified as verified-free', () => {
  for (const r of kb.resources.values()) {
    assert.ok(['may_involve_cost', 'source_mentions_free', 'unknown'].includes(r.access.cost));
    assert.match(r.access.costNote, /check|verified/i);
    assert.notEqual(r.verificationStatus, 'verified');
  }
});

test('data-quality issues are reported, not hidden', () => {
  const codes = new Set(kb.issues.map((i) => i.code));
  for (const c of ['DUPLICATE_URL', 'PROJECT_CATEGORY_MISMATCH', 'RESOURCE_NO_URL', 'RESOURCES_NOT_IN_ANY_STAGE', 'PROJECT_SKILLS_BY_NAME']) assert.ok(codes.has(c), c);
});

// ---- invalid / empty knowledge bases give useful errors, not crashes (requirement 13)
test('null, non-object and empty knowledge bases throw a KnowledgeBaseError with a clear message', () => {
  assert.throws(() => buildKnowledgeBase(null), (e) => e instanceof KnowledgeBaseError && /missing|not an object/i.test(e.message));
  assert.throws(() => buildKnowledgeBase('x'), KnowledgeBaseError);
  assert.throws(() => buildKnowledgeBase({}), (e) => e instanceof KnowledgeBaseError && /"careers" must be a list/.test(e.message));
  const empty = clone(); empty.careers = [];
  assert.throws(() => buildKnowledgeBase(empty), (e) => e instanceof KnowledgeBaseError && /empty/i.test(e.message) && e.code === 'KB_INVALID');
});

test('a missing collection names the collection in the error', () => {
  const raw = clone(); delete raw.resources;
  assert.throws(() => buildKnowledgeBase(raw), /"resources" must be a list/);
});

test('careers without titles are excluded; if none remain the error says so', () => {
  const raw = clone(); raw.careers = raw.careers.map((c) => ({ career_id: c.career_id }));
  assert.throws(() => buildKnowledgeBase(raw), /no usable career/i);
  const raw2 = clone(); delete raw2.careers[0].title; delete raw2.careers[0].career_title;
  const built = buildKnowledgeBase(raw2);
  assert.equal(built.careers.size, 8);
  assert.ok(built.issues.some((i) => i.code === 'CAREER_NO_TITLE'));
});

test('duplicate ids keep the first record and report the duplicate', () => {
  const raw = clone(); raw.resources.push({ ...raw.resources[0], title: 'IMPOSTOR' });
  const built = buildKnowledgeBase(raw);
  assert.equal(built.resources.size, 157);
  assert.notEqual(built.resources.get(raw.resources[0].resource_id).title, 'IMPOSTOR');
  assert.ok(built.issues.some((i) => i.code === 'DUPLICATE_ID'));
});

test('dangling references are dropped and reported; null items and odd shapes do not crash', () => {
  const raw = clone();
  raw.roadmap_stages[0].learning_activities[0].resource_id = 'res_does_not_exist';
  raw.resources.push(null, 42, 'text');
  raw.projects.push(null);
  raw.roadmap_stages.push({ stage_id: 'orphan_stage', career_id: 'career_nope', level: 1 });
  const built = buildKnowledgeBase(raw);
  assert.ok(built.issues.some((i) => i.code === 'DANGLING_RESOURCE_REF'));
  assert.ok(built.issues.some((i) => i.code === 'STAGE_UNKNOWN_CAREER'));
  assert.ok(!built.stages.has('orphan_stage'));
  for (const s of built.stages.values()) for (const r of s.resourceIds) assert.ok(built.resources.has(r));
});

test('a career with no stages is reported, and the engine still builds', () => {
  const raw = clone(); raw.roadmap_stages = raw.roadmap_stages.filter((s) => s.career_id !== 'career_cybersecurity');
  const built = buildKnowledgeBase(raw);
  assert.ok(built.issues.some((i) => i.code === 'CAREER_NO_STAGES' && i.ref === 'career_cybersecurity'));
  const e = createEngine(built);
  const plan = e.roadmap({}, 'career_cybersecurity');
  assert.equal(plan.stages.length, 0);
  assert.equal(plan.firstAction, null);
});

test('loader: missing directory, unreadable file and malformed JSON all give a useful KnowledgeBaseError', async () => {
  await assert.rejects(loadKnowledgeBaseFromDir('/definitely/not/here'), (e) => e instanceof KnowledgeBaseError && /combined_careers\.json/.test(e.message));
  await assert.rejects(loadKnowledgeBaseFromDir(''), KnowledgeBaseError);
  const dir = await mkdtemp(join(tmpdir(), 'kb-test-'));
  try {
    for (const n of ['careers', 'roadmap_stages', 'resources', 'skills', 'projects', 'communities', 'opportunities']) await writeFile(join(dir, `combined_${n}.json`), n === 'resources' ? '{not json' : '[]');
    await assert.rejects(loadKnowledgeBaseFromDir(dir), (e) => e instanceof KnowledgeBaseError && /combined_resources\.json/.test(e.message));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('engine refuses a knowledge base none of whose careers can be scored', () => {
  const raw = clone(); for (const c of raw.careers) c.career_id = `x_${c.career_id}`; 
  raw.roadmap_stages = []; raw.skills = []; raw.projects = []; raw.opportunities = [];
  assert.throws(() => createEngine(buildKnowledgeBase(raw)), /No career .* can be scored/);
});

test('engine rejects an invalid taxonomy and invalid weights with a clear error', () => {
  assert.throws(() => createEngine(kb, { taxonomy: { career_cybersecurity: { interests: {} } } }), /taxonomy is invalid/i);
  assert.throws(() => createEngine(kb, { config: { ...CONFIG, weights: { interests: 0, strengths: 0, workStyle: 0, academic: 0, goals: 0 } } }), /weights/i);
});
