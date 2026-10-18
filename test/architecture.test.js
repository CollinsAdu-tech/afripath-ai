import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.js';

const files = (dir) => readdirSync(join(ROOT, 'src', dir)).filter((f) => f.endsWith('.js')).map((f) => ({ f: `${dir}/${f}`, text: readFileSync(join(ROOT, 'src', dir, f), 'utf8') }));
const importsOf = (text) => [
  ...text.matchAll(/(?:^|[;\n])\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/g),   // import x from '...'
  ...text.matchAll(/(?:^|[;\n])\s*import\s+['"]([^'"]+)['"]/g),                          // import '...'
  ...text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),                               // import('...')
].map((m) => m[1]);

test('knowledge layer imports nothing from the engine or the API', () => {
  for (const { f, text } of files('knowledge')) for (const i of importsOf(text)) assert.ok(!/engine|api/.test(i), `${f} imports ${i}`);
});

test('engine core has no HTTP, file-system, environment, clock or randomness dependencies', () => {
  for (const { f, text } of files('engine')) {
    for (const i of importsOf(text)) {
      assert.ok(!i.startsWith('node:'), `${f} imports ${i}`);
      assert.ok(!/\.\.\/api/.test(i), `${f} imports ${i}`);
      if (i.startsWith('../knowledge')) assert.equal(i, '../knowledge/knowledgeBase.js', `${f}: engine may use only the pure KB module, not the file loader`);
    }
    for (const bad of [/\bprocess\./, /Date\.now|new Date\(/, /Math\.random/, /\bfetch\(/, /require\(/]) assert.ok(!bad.test(text.replace(/\/\/.*$/gm, '')), `${f} uses ${bad}`);
  }
});

test('API handlers depend only on the engine facade; the KB loader is wired in only by the start script', () => {
  for (const { f, text } of files('api')) {
    const imps = importsOf(text);
    if (f === 'api/start.js') continue;
    for (const i of imps) assert.ok(!i.includes('knowledge'), `${f} imports ${i}`);
    if (f === 'api/handlers.js') for (const i of imps) assert.ok(i === './errors.js' || i === '../engine/index.js', `${f} imports ${i}`);
  }
});

test('the engine and API have zero runtime dependencies', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.deepEqual(pkg.devDependencies ?? {}, {});
});

test('nothing outside src/engine/config.js hard-codes the factor weights', () => {
  for (const { f, text } of [...files('engine'), ...files('api'), ...files('knowledge')]) {
    if (f === 'engine/config.js') continue;
    assert.ok(!/0\.35|0\.25\b.*strengths|interests:\s*0\./.test(text.replace(/\/\/.*$/gm, '')), `${f} appears to hard-code a weight`);
  }
});
