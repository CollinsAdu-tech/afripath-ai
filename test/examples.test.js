import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runExamples, examplesDir } from '../scripts/exampleRunner.js';

test('the committed example responses match what the real server returns today (run `npm run examples` to refresh)', async () => {
  const live = await runExamples();
  assert.ok(Object.keys(live).length >= 20);
  for (const [file, content] of Object.entries(live)) {
    const onDisk = JSON.parse(await readFile(join(examplesDir, file), 'utf8'));
    assert.deepEqual(onDisk, content, `${file} is stale`);
  }
});

test('documented examples cover success, exploratory, insufficient-information and every error code', async () => {
  const live = await runExamples();
  const statuses = new Set(Object.values(live).map((x) => x.httpStatus));
  for (const s of [200, 400, 404, 405, 415, 422]) assert.ok(statuses.has(s), `no example with HTTP ${s}`);
  const resultStatuses = new Set(Object.values(live).map((x) => x.body.status));
  for (const s of ['ok', 'exploratory', 'insufficient_information']) assert.ok(resultStatuses.has(s), s);
});
