import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from '../src/api/server.js';
import { readServerConfig } from '../src/api/config.js';
import { QUESTIONNAIRE_OPTIONS as O, CONFIG } from '../src/engine/index.js';
import { runExamples } from '../scripts/exampleRunner.js';
import { ROOT, engine } from './helpers.js';

const spec = JSON.parse(readFileSync(join(ROOT, 'docs', 'openapi.json'), 'utf8'));
const ids = (l) => l.map((o) => (typeof o === 'string' ? o : o.id));

test('openapi.json enums match the option lists the engine validates against (run `npm run openapi` if this fails)', () => {
  const p = spec.components.schemas.StudentProfile.properties;
  assert.deepEqual(p.interests.items.enum, ids(O.interests));
  assert.deepEqual(p.currentSkills.items.enum, ids(O.strengths));
  assert.deepEqual(p.workStyles.items.enum, ids(O.workStyles));
  assert.deepEqual(p.goals.items.enum, ids(O.goals));
  assert.deepEqual(p.subjects.items.enum, ids(O.subjects));
  assert.deepEqual(p.budget.enum, [...ids(O.budget), null]);
  assert.deepEqual(p.internet.enum, [...ids(O.internet), null]);
  assert.deepEqual(p.device.enum, [...ids(O.device), null]);
  assert.equal(p.currentSkills.maxItems, CONFIG.limits.maxArrayAnswers);
  assert.deepEqual(spec.components.schemas.FactorBreakdown.properties.factor.enum, Object.keys(CONFIG.weights));
});

test('every documented path and method is routable on the real server', async () => {
  const server = createServer({ engine, config: { ...readServerConfig({}), logRequests: false } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [path, ops] of Object.entries(spec.paths)) for (const method of Object.keys(ops)) {
      const url = base + path.replace('{careerId}', 'career_cybersecurity');
      const res = await fetch(url, { method: method.toUpperCase(), headers: { 'content-type': 'application/json' }, body: method === 'post' ? JSON.stringify(path === '/v1/roadmaps' ? { careerId: 'career_cybersecurity' } : { profile: {} }) : undefined });
      assert.equal(res.status, 200, `${method} ${path}`);
    }
  } finally { await new Promise((r) => server.close(r)); }
});

test('every error code the server actually emits in the examples is declared in the ErrorResponse enum', async () => {
  const declared = new Set(spec.components.schemas.ErrorResponse.properties.error.properties.code.enum);
  const live = await runExamples();
  for (const { body } of Object.values(live)) if (body.error) assert.ok(declared.has(body.error.code), body.error.code);
});

test('the documented response status enum matches the engine\'s statuses', () => {
  assert.deepEqual(spec.components.schemas.RecommendationResponse.properties.status.enum, ['ok', 'exploratory', 'insufficient_information']);
});
