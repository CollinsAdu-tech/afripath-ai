import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/api/server.js';
import { readServerConfig } from '../src/api/config.js';
import { createHandlers } from '../src/api/handlers.js';
import { engine, example } from './helpers.js';

const baseConfig = { ...readServerConfig({}), logRequests: false };
const start = async (deps, config = baseConfig) => {
  const server = createServer({ config, ...deps });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}`, stop: () => new Promise((r) => server.close(r)) };
};
const post = (url, path, body, headers = {}) => fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

let s;
before(async () => { s = await start({ engine }); });
after(() => s.stop());

test('GET /health reports the knowledge base and is cheap', async () => {
  const r = await fetch(`${s.url}/health`); const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.status, 'ok'); assert.equal(b.knowledgeBase.loaded, true); assert.equal(b.knowledgeBase.version, '0.7'); assert.equal(b.knowledgeBase.counts.careers, 9);
});

test('GET /v1/options exposes questionnaire ids/labels so a frontend can build the form', async () => {
  const b = await (await fetch(`${s.url}/v1/options`)).json();
  assert.equal(b.options.interests.length, 9); assert.ok(b.options.interests[0].id && b.options.interests[0].label);
  assert.equal(b.factorWeights.interests, 0.35);
});

test('GET /v1/careers and /v1/careers/:id', async () => {
  const list = await (await fetch(`${s.url}/v1/careers`)).json();
  assert.equal(list.careers.length, 9);
  const one = await fetch(`${s.url}/v1/careers/career_cybersecurity`);
  assert.equal(one.status, 200); assert.equal((await one.json()).stages.length, 4);
  const trailing = await fetch(`${s.url}/v1/careers/`); assert.equal(trailing.status, 200);
  const missing = await fetch(`${s.url}/v1/careers/career_nope`);
  assert.equal(missing.status, 404); assert.equal((await missing.json()).error.code, 'CAREER_NOT_FOUND');
  assert.equal((await fetch(`${s.url}/v1/careers/%E0%A4%A`)).status, 404);
});

test('POST /v1/recommendations returns ranked, explained results', async () => {
  const r = await post(s.url, '/v1/recommendations', example('recommend_security_investigator'));
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.recommendations[0].careerId, 'career_cybersecurity');
  for (const k of ['status', 'message', 'scoreNote', 'recommendations', 'explore', 'evidence', 'missingInformation', 'warnings', 'meta']) assert.ok(k in b, k);
  for (const k of ['rank', 'careerId', 'title', 'fit', 'explanation', 'matched', 'factorBreakdown', 'skillGaps', 'firstStep', 'roadmap', 'startingResources', 'projects', 'accessConsiderations', 'roadmapRequest']) assert.ok(k in b.recommendations[0], k);
});

test('empty profile is a valid request whose answer is "we need more information" (HTTP 200)', async () => {
  const r = await post(s.url, '/v1/recommendations', { profile: {} }); const b = await r.json();
  assert.equal(r.status, 200); assert.equal(b.status, 'insufficient_information'); assert.equal(b.recommendations.length, 0);
});

test('options.maxResults is validated and honoured', async () => {
  const ok = await (await post(s.url, '/v1/recommendations', { ...example('recommend_beginner_programming_ai'), options: { maxResults: 2 } })).json();
  assert.equal(ok.recommendations.length, 2);
  for (const bad of [0, 4, 1.5, '2', null]) {
    const r = await post(s.url, '/v1/recommendations', { profile: {}, options: { maxResults: bad } });
    assert.equal(r.status, 422, String(bad)); assert.equal((await r.json()).error.details[0].field, 'options.maxResults');
  }
  assert.equal((await post(s.url, '/v1/recommendations', { profile: {}, options: 'x' })).status, 422);
});

test('validation errors: 422 with a stable envelope, field details and a request id', async () => {
  const r = await post(s.url, '/v1/recommendations', { profile: { interests: 'web', weeklyHours: [] } });
  const b = await r.json();
  assert.equal(r.status, 422); assert.equal(b.error.code, 'VALIDATION_ERROR');
  assert.deepEqual(b.error.details.map((d) => d.field).sort(), ['interests', 'weeklyHours']);
  assert.equal(b.error.requestId, r.headers.get('x-request-id'));
  for (const body of [{}, [], '"x"', 'null', '5']) { const x = await post(s.url, '/v1/recommendations', body); assert.equal(x.status, 422, JSON.stringify(body)); }
  assert.equal((await post(s.url, '/v1/recommendations', { profile: 'x' })).status, 422);
});

test('unknown options and extra fields are warnings, not failures, and personal data is not echoed back', async () => {
  const r = await post(s.url, '/v1/recommendations', { profile: { interests: ['web_building', 'astrology'], fullName: 'Ama Mensah' }, extra: 1 });
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.deepEqual(b.warnings.map((w) => w.code).sort(), ['UNKNOWN_FIELD', 'UNKNOWN_FIELD', 'UNKNOWN_OPTION']);
  assert.ok(!JSON.stringify(b).includes('Ama Mensah'));
});

test('malformed JSON -> 400, wrong content type -> 415, oversized body -> 413', async () => {
  const bad = await post(s.url, '/v1/recommendations', '{"profile": {'); assert.equal(bad.status, 400); assert.equal((await bad.json()).error.code, 'INVALID_JSON');
  const text = await fetch(`${s.url}/v1/recommendations`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' }); assert.equal(text.status, 415);
  const none = await fetch(`${s.url}/v1/recommendations`, { method: 'POST', body: '{}' }); assert.equal(none.status, 415);
  const small = await start({ engine }, { ...baseConfig, maxBodyBytes: 1024 });
  try {
    const big = await post(small.url, '/v1/recommendations', JSON.stringify({ profile: { interests: [], pad: 'x'.repeat(3000) } }));
    assert.equal(big.status, 413); assert.equal((await big.json()).error.code, 'PAYLOAD_TOO_LARGE');
  } finally { await small.stop(); }
});

test('POST /v1/roadmaps: success, unknown career -> 404, missing careerId -> 422', async () => {
  const ok = await post(s.url, '/v1/roadmaps', example('roadmap_cybersecurity_constrained')); const b = await ok.json();
  assert.equal(ok.status, 200); assert.equal(b.career.careerId, 'career_cybersecurity'); assert.equal(b.stages.length, 4);
  assert.equal((await post(s.url, '/v1/roadmaps', { careerId: 'career_nope' })).status, 404);
  const miss = await post(s.url, '/v1/roadmaps', { profile: {} }); assert.equal(miss.status, 422); assert.equal((await miss.json()).error.details[0].field, 'careerId');
  assert.equal((await post(s.url, '/v1/roadmaps', { careerId: 'career_cybersecurity' })).status, 200, 'profile is optional');
  assert.equal((await post(s.url, '/v1/roadmaps', { careerId: 'career_cybersecurity', profile: { budget: 7 } })).status, 422);
});

test('routing errors: 404 for unknown paths, 405 with an Allow header for wrong methods', async () => {
  assert.equal((await fetch(`${s.url}/nope`)).status, 404);
  const r = await fetch(`${s.url}/v1/recommendations`); assert.equal(r.status, 405); assert.equal(r.headers.get('allow'), 'POST');
  assert.equal((await fetch(`${s.url}/health`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 405);
  assert.equal((await fetch(`${s.url}/v1/careers/x`, { method: 'DELETE' })).status, 405);
});

test('headers: JSON, no-store on student-specific responses, nosniff, request id honoured and sanitised', async () => {
  const r = await post(s.url, '/v1/recommendations', { profile: {} }, { 'x-request-id': 'abc-123' });
  assert.match(r.headers.get('content-type'), /application\/json/); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); assert.equal(r.headers.get('x-request-id'), 'abc-123');
  const bad = await fetch(`${s.url}/health`, { headers: { 'x-request-id': 'bad id with spaces<script>' } });
  assert.match(bad.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  assert.match((await fetch(`${s.url}/v1/options`)).headers.get('cache-control'), /max-age/);
});

test('CORS is off by default, and can be enabled for named origins or for any origin', async () => {
  const off = await fetch(`${s.url}/health`, { headers: { origin: 'https://app.example' } });
  assert.equal(off.headers.get('access-control-allow-origin'), null);
  const named = await start({ engine }, { ...baseConfig, corsAllowedOrigins: ['https://app.example'] });
  try {
    const yes = await fetch(`${named.url}/health`, { headers: { origin: 'https://app.example' } });
    assert.equal(yes.headers.get('access-control-allow-origin'), 'https://app.example');
    const no = await fetch(`${named.url}/health`, { headers: { origin: 'https://evil.example' } });
    assert.equal(no.headers.get('access-control-allow-origin'), null);
    const pre = await fetch(`${named.url}/v1/recommendations`, { method: 'OPTIONS', headers: { origin: 'https://app.example', 'access-control-request-method': 'POST' } });
    assert.equal(pre.status, 204); assert.match(pre.headers.get('access-control-allow-methods'), /POST/);
  } finally { await named.stop(); }
  const any = await start({ engine }, { ...baseConfig, corsAllowedOrigins: ['*'] });
  try { assert.equal((await fetch(`${any.url}/health`, { headers: { origin: 'http://localhost:5173' } })).headers.get('access-control-allow-origin'), '*'); } finally { await any.stop(); }
});

test('degraded mode: if the knowledge base failed to load, /health is 503 and data endpoints say so (no crash)', async () => {
  const d = await start({ engine: null, kbError: new Error('Knowledge base is empty') });
  try {
    const h = await fetch(`${d.url}/health`); const hb = await h.json();
    assert.equal(h.status, 503); assert.equal(hb.status, 'unavailable'); assert.match(hb.knowledgeBase.error, /empty/);
    for (const [m, p] of [['GET', '/v1/careers'], ['GET', '/v1/options'], ['GET', '/v1/careers/career_cybersecurity']]) assert.equal((await fetch(d.url + p, { method: m })).status, 503, p);
    const r = await post(d.url, '/v1/recommendations', { profile: {} }); assert.equal(r.status, 503); assert.equal((await r.json()).error.code, 'KNOWLEDGE_BASE_UNAVAILABLE');
    assert.equal((await fetch(`${d.url}/nope`)).status, 404);
  } finally { await d.stop(); }
});

test('internal failures return a generic 500 and never leak messages or stack traces', async () => {
  const boom = { ...engine, recommend() { throw new Error('SECRET database password in stack'); } };
  const b = await start({ engine: boom });
  const logged = []; const orig = console.error; console.error = (x) => logged.push(x);
  try {
    const r = await post(b.url, '/v1/recommendations', { profile: {} }); const body = await r.json();
    assert.equal(r.status, 500); assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.ok(!JSON.stringify(body).includes('SECRET') && !/\bat \w+/.test(JSON.stringify(body)));
  } finally { console.error = orig; await b.stop(); }
  assert.ok(logged.length === 1);
});

test('the server refuses to send a result that fails reference validation (last line of defence)', async () => {
  const corrupt = { ...engine, recommend: (...a) => { const r = engine.recommend(...a); r.recommendations[0].startingResources[0].url = 'https://invented.example'; return r; } };
  const b = await start({ engine: corrupt });
  const orig = console.error; console.error = () => {};
  try {
    const r = await post(b.url, '/v1/recommendations', example('recommend_security_investigator'));
    assert.equal(r.status, 500); assert.ok(!JSON.stringify(await r.json()).includes('invented.example'));
  } finally { console.error = orig; await b.stop(); }
});

test('handlers are pure: they can be called without any socket', () => {
  const { handle } = createHandlers({ engine });
  const out = handle({ method: 'POST', path: '/v1/recommendations', body: example('recommend_project_organizer') });
  assert.equal(out.status, 200); assert.equal(out.body.recommendations[0].careerId, 'career_project_management');
});

test('requests are not logged with their bodies (student answers stay private)', async () => {
  const lines = []; const orig = console.log; console.log = (x) => lines.push(String(x));
  const l = await start({ engine }, { ...baseConfig, logRequests: true });
  try { await post(l.url, '/v1/recommendations', { profile: { interests: ['security_investigation'] } }); } finally { console.log = orig; await l.stop(); }
  assert.equal(lines.length, 1);
  assert.ok(!lines[0].includes('security_investigation')); assert.match(lines[0], /"status":200/);
});
