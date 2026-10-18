// Runs every file in examples/requests and examples/errors against the REAL HTTP server (ephemeral port)
// and returns the responses. Used by generate-examples.js (writes them) and by the test suite (checks
// the committed files are not stale).
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/api/server.js';
import { readServerConfig } from '../src/api/config.js';
import { loadKnowledgeBaseFromDir } from '../src/knowledge/loadFromDirectory.js';
import { createEngine } from '../src/engine/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const examplesDir = join(root, 'examples');

export async function runExamples() {
  const config = { ...readServerConfig({}), port: 0, logRequests: false };
  const engine = createEngine(await loadKnowledgeBaseFromDir(config.kbDir));
  const server = createServer({ engine, config });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const out = {};
  const scrub = (b) => JSON.parse(JSON.stringify(b).replace(/"requestId":"[^"]+"/g, '"requestId":"<request-id>"'));
  try {
    for (const file of (await readdir(join(examplesDir, 'requests'))).sort()) {
      const body = JSON.parse(await readFile(join(examplesDir, 'requests', file), 'utf8'));
      const path = file.startsWith('roadmap_') ? '/v1/roadmaps' : '/v1/recommendations';
      const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      out[`responses/${file}`] = { httpStatus: res.status, body: scrub(await res.json()) };
    }
    for (const file of (await readdir(join(examplesDir, 'errors'))).sort()) {
      const c = JSON.parse(await readFile(join(examplesDir, 'errors', file), 'utf8'));
      const res = await fetch(base + c.path, { method: c.method, headers: c.headers, body: c.method === 'POST' ? (c.rawBody ?? JSON.stringify(c.body)) : undefined });
      out[`responses/error_${basename(file)}`] = { httpStatus: res.status, body: scrub(await res.json()) };
    }
    for (const [name, path] of [['health', '/health'], ['options', '/v1/options'], ['careers', '/v1/careers'], ['career_detail', '/v1/careers/career_cybersecurity']]) {
      const res = await fetch(base + path);
      const body = await res.json();
      if (name === 'health') body.uptimeSeconds = 0; // varies per run
      out[`responses/get_${name}.json`] = { httpStatus: res.status, body };
    }
  } finally { await new Promise((r) => server.close(r)); }
  return out;
}
