// Front-end tests that need no browser: pure renderers, survey model, and static integrity of web/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { engine, example, profileOf, ROOT } from './helpers.js';
import { KNOWN_FIELDS } from '../src/engine/index.js';

globalThis.location = { pathname: '/index.html' };
const WEB = join(ROOT, 'web');
const { renderRecommendations, renderRoadmap, renderLeads, renderResource } = await import('../web/assets/js/render.js');
const { SURVEY_STEPS, buildProfile, optionsFor } = await import('../web/assets/js/survey-model.js');
const { safeUrl, esc } = await import('../web/assets/js/site.js');

const REQS = readdirSync(join(ROOT, 'examples', 'requests')).filter((f) => f.startsWith('recommend_')).map((f) => f.replace('.json', ''));

test('survey only asks questions the engine accepts', () => {
  const keys = SURVEY_STEPS.flatMap((s) => s.fields.map((f) => f.key));
  for (const k of keys) assert.ok(KNOWN_FIELDS.has(k), `${k} is not an engine field`);
  assert.equal(new Set(keys).size, keys.length, 'no question appears twice');
});

test('survey offers every option the engine defines', () => {
  const opts = engine.options().options;
  for (const step of SURVEY_STEPS) for (const f of step.fields) {
    if (f.kind === 'number') continue;
    const shown = optionsFor(f, opts).map((o) => String(o.id));
    assert.deepEqual(shown, (opts[f.source || f.key] || []).map((o) => String(typeof o === 'object' ? o.id : o)), `${f.key} options`);
    for (const o of optionsFor(f, opts)) assert.ok(o.label && o.label !== o.id || /^\d$/.test(o.id) || o.label.length > 2, `${f.key}:${o.id} has a label`);
  }
});

test('buildProfile drops empty answers, coerces numbers and ignores unknown keys', () => {
  const p = buildProfile({ interests: [], goals: ['research'], mathConfidence: '4', weeklyHours: '5', budget: '', device: undefined, evil: 'x', email: 'a@b.c' });
  assert.deepEqual(p, { goals: ['research'], mathConfidence: 4, weeklyHours: 5 });
  assert.deepEqual(buildProfile({}), {});
  assert.deepEqual(buildProfile(null), {});
});

test('survey output is accepted by the engine without warnings', () => {
  const answers = { interests: ['web_building'], currentSkills: ['programming'], workStyles: ['building'], educationLevel: 'senior_secondary', subjects: ['ict_computing'], mathConfidence: '3', programmingExperience: 'none', goals: ['technical_career'], budget: 'none', internet: 'limited', device: 'phone_only', weeklyHours: '5', learningFormats: ['text'] };
  const res = engine.recommend(buildProfile(answers));
  assert.deepEqual(res.warnings, []);
  assert.ok(res.recommendations.length > 0);
});

for (const name of REQS) {
  test(`renders recommendation response: ${name}`, () => {
    const res = engine.recommend(profileOf(name));
    const html = renderRecommendations(res);
    assert.ok(html.length > 100);
    assert.ok(!/undefined|\[object Object\]|NaN/.test(html), 'no leaked placeholders');
    if (res.status === 'insufficient_information') assert.match(html, /afripath-ai\.html/);
    for (const r of res.recommendations) {
      assert.match(html, new RegExp(`roadmap\\.html\\?career=${r.careerId}`));
      assert.ok(html.includes(esc(r.fit.disclaimer)), 'disclaimer shown');
    }
    if (res.status === 'exploratory') assert.match(html, /Early signal/);
  });
}

test('every career roadmap renders, with honest labelling', () => {
  for (const c of engine.listCareers()) {
    const plan = engine.roadmap(profileOf('recommend_constrained_access'), c.careerId);
    const html = renderRoadmap(plan);
    assert.ok(!/undefined|\[object Object\]|NaN/.test(html), `${c.careerId}: no leaked placeholders`);
    assert.equal((html.match(/pill--peach">Unverified lead</g) || []).length, plan.opportunityLeads.length, `${c.careerId}: every opportunity is marked unverified`);
    assert.ok(!/>\s*Free\s*</i.test(html), 'never a bare "Free" badge');
    assert.ok(html.includes('Link not independently verified'), 'resources carry the verification caveat');
    for (const s of plan.stages) assert.ok(html.includes(`data-stage="${s.stageId}"`));
  }
});

test('"Source mentions free" is only shown when the engine says so', () => {
  const base = { resourceId: 'r1', title: 'T', provider: 'P', type: 'course', url: 'https://example.org', notes: [], flags: [] };
  assert.match(renderResource({ ...base, access: { cost: 'source_mentions_free', costNote: 'n' } }), /Source mentions free/);
  assert.doesNotMatch(renderResource({ ...base, access: { cost: 'unknown', costNote: 'n' } }), /free/i);
  assert.match(renderResource({ ...base, access: { cost: 'may_involve_cost', costNote: 'n' } }), /May involve cost/);
});

test('progress ticks render checked for done resources', () => {
  const plan = engine.roadmap({}, 'career_cybersecurity');
  const id = plan.stages[0].resources[0].resourceId;
  const html = renderRoadmap(plan, new Set([id]));
  assert.match(html, new RegExp(`data-res="${id}" checked`));
  assert.match(html, /1\/\d+ done/);
});

test('API text is escaped and unsafe links are never rendered as links', () => {
  const res = engine.recommend(profileOf('recommend_beginner_programming_ai'));
  const evil = structuredClone(res);
  evil.recommendations[0].title = '<img src=x onerror=alert(1)>';
  evil.recommendations[0].explanation.summary = '<script>alert(1)</script>';
  evil.recommendations[0].firstStep.resource = { title: 'x', url: 'javascript:alert(1)' };
  const html = renderRecommendations(evil);
  assert.ok(!html.includes('<img src=x'), 'title escaped');
  assert.ok(!html.includes('<script>alert'), 'summary escaped');
  assert.ok(!/href="javascript:/i.test(html), 'javascript: URL rejected');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,x'), null);
  assert.ok(safeUrl('https://example.org/a'));
  const plan = engine.roadmap({}, 'career_cybersecurity');
  const bad = structuredClone(plan);
  bad.opportunityLeads[0].url = 'javascript:alert(1)'; bad.opportunityLeads[0].title = '<b>t</b>';
  const h2 = renderRoadmap(bad);
  assert.ok(!/href="javascript:/i.test(h2)); assert.ok(!h2.includes('<b>t</b>'));
});

test('leads page marks every lead unverified', () => {
  const plan = engine.roadmap({}, 'career_cybersecurity');
  const leads = plan.opportunityLeads.map((o) => ({ ...o, careerTitle: 'Cybersecurity' }));
  const html = renderLeads(leads);
  assert.equal((html.match(/pill--peach">Unverified lead</g) || []).length, leads.length);
  assert.match(renderLeads([]), /No leads/);
});

// ---- static integrity of web/ ----
const pages = readdirSync(WEB).filter((f) => f.endsWith('.html'));
test('web: every page links only to files that exist', () => {
  for (const f of pages) {
    const html = readFileSync(join(WEB, f), 'utf8');
    for (const m of html.matchAll(/(?<![-\w])(?:href|src)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
      const t = m[1];
      if (/^(https?:|mailto:|data:|__)/.test(t)) continue;
      assert.ok(existsSync(resolve(WEB, t)), `${f} -> ${t} is missing`);
    }
  }
});

test('web: every JS import resolves, and every nav target is a real page', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  for (const f of walk(join(WEB, 'assets', 'js'))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) assert.ok(existsSync(resolve(dirname(f), m[1])), `${f} imports missing ${m[1]}`);
  }
  const site = readFileSync(join(WEB, 'assets/js/site.js'), 'utf8');
  for (const m of site.matchAll(/href: '([^']+\.html)'/g)) assert.ok(pages.includes(m[1]), `nav points at missing page ${m[1]}`);
});

test('web: pages carry no frameworks, inline handlers or third-party scripts', () => {
  for (const f of pages) {
    const html = readFileSync(join(WEB, f), 'utf8');
    assert.ok(!/<script[^>]+src="https?:/.test(html), `${f}: external script`);
    assert.ok(!/<link[^>]+href="https?:/.test(html), `${f}: external stylesheet`);
    assert.ok(!/\son(click|load|error)=/i.test(html), `${f}: inline handler`);
    assert.match(html, /<title>AfriPath AI/, `${f}: title`);
    assert.match(html, /lang="en"/);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${f}: exactly one h1`);
  }
});

test('web: static path resolution is safe and identical on Windows and POSIX', async () => {
  const { resolveStatic } = await import('../web/static-path.mjs');
  const path = await import('node:path');
  const cases = [
    [path.posix, '/srv/app/web'],
    [path.win32, 'D:\\New folder\\Passion Project\\kareer\\web'],
  ];
  for (const [p, root] of cases) {
    const ok = (u) => resolveStatic(root, u, p);
    assert.equal(ok('/').ok, true, `${p.sep}: root serves index`);
    assert.ok(ok('/').file.endsWith('index.html'));
    assert.equal(ok('/assets/css/styles.css').ok, true);
    assert.equal(ok('/assets/css/styles.css').topDir, 'assets');
    assert.equal(ok('/about.html').ok, true);
    assert.equal(ok('/../package.json').status, 403, 'traversal blocked');
    assert.equal(ok('/%2e%2e/package.json').status, 403, 'encoded traversal blocked');
    assert.equal(ok('/assets/../../secret').status, 403);
    assert.equal(ok('/serve.mjs').status, 404, 'server source hidden');
    assert.equal(ok('/a%00b').status, 400);
    assert.equal(ok('/%E0%A4%A').status, 400, 'bad encoding');
  }
  assert.equal(resolveStatic('D:\\w\\web', '/..\\..\\x', path.win32).status, 403, 'backslash traversal blocked on Windows');
});
