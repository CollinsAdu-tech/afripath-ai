import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfile } from '../src/engine/profileNormalizer.js';

const codes = (list) => list.map((x) => x.code);

test('empty profile is valid and means "not answered"', () => {
  const { profile, errors, warnings } = normalizeProfile({});
  assert.equal(errors.length, 0); assert.equal(warnings.length, 0);
  assert.deepEqual(profile.interests, []); assert.equal(profile.budget, null); assert.equal(profile.mathConfidence, null);
});

test('non-object input is an error, never a crash', () => {
  for (const bad of [null, undefined, 'x', 5, [], true]) {
    const r = normalizeProfile(bad);
    assert.equal(r.profile, null); assert.equal(r.errors[0].code, 'INVALID_TYPE');
  }
});

test('option ids are normalised (case, spaces, dashes) and de-duplicated', () => {
  const { profile } = normalizeProfile({ interests: ['Web Building', 'web-building', 'WEB_BUILDING', 'data_patterns'] });
  assert.deepEqual(profile.interests, ['web_building', 'data_patterns']);
});

test('unknown option ids are ignored with a warning, not an error', () => {
  const { profile, errors, warnings } = normalizeProfile({ interests: ['web_building', 'astrology'], budget: 'lots' });
  assert.equal(errors.length, 0);
  assert.deepEqual(profile.interests, ['web_building']); assert.equal(profile.budget, null);
  assert.deepEqual(codes(warnings), ['UNKNOWN_OPTION', 'UNKNOWN_OPTION']);
});

test('wrong types are errors with the offending field named', () => {
  const { errors } = normalizeProfile({ interests: 'web_building', budget: 5, weeklyHours: { a: 1 }, mathConfidence: true, experienceByCareer: [] });
  assert.deepEqual(errors.map((e) => e.field).sort(), ['budget', 'experienceByCareer', 'interests', 'mathConfidence', 'weeklyHours']);
});

test('numbers: numeric strings accepted, out-of-range warned and ignored', () => {
  assert.equal(normalizeProfile({ mathConfidence: '4' }).profile.mathConfidence, 4);
  assert.equal(normalizeProfile({ weeklyHours: '3.5' }).profile.weeklyHours, 3.5);
  const r = normalizeProfile({ mathConfidence: 9, weeklyHours: 500 });
  assert.equal(r.profile.mathConfidence, null); assert.equal(r.profile.weeklyHours, null);
  assert.deepEqual(codes(r.warnings), ['OUT_OF_RANGE', 'OUT_OF_RANGE']);
  assert.equal(normalizeProfile({ weeklyHours: 0 }).profile.weeklyHours, 0);
});

test('fields that are not questionnaire answers are ignored with a privacy-minded warning', () => {
  const { profile, warnings } = normalizeProfile({ interests: ['web_building'], fullName: 'Ama Mensah', email: 'a@b.c' });
  assert.ok(!('fullName' in profile) && !('email' in profile));
  assert.equal(warnings.filter((w) => w.code === 'UNKNOWN_FIELD').length, 2);
  assert.match(warnings[0].message, /personal information/i);
});

test('very long answer lists are capped', () => {
  const { profile, warnings } = normalizeProfile({ interests: Array(100).fill('web_building').map((x, i) => (i % 2 ? x : 'data_patterns')) });
  assert.ok(profile.interests.length <= 2);
  assert.ok(codes(warnings).includes('TOO_MANY_VALUES'));
});

test('experienceByCareer accepts only safe keys and known levels (prototype keys are harmless)', () => {
  const raw = JSON.parse('{"experienceByCareer":{"career_cybersecurity":"some","__proto__":"none","bad key!":"some","career_x":"expert"}}');
  const { profile, warnings } = normalizeProfile(raw);
  assert.deepEqual(Object.keys(profile.experienceByCareer), ['career_cybersecurity']);
  assert.equal(warnings.length, 3);
  assert.equal({}.polluted, undefined);
});
