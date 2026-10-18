// Try the engine WITHOUT any server or frontend:
//   node scripts/recommend.js examples/requests/recommend_security_investigator.json
//   node scripts/recommend.js examples/requests/roadmap_cybersecurity_constrained.json
import { readFile } from 'node:fs/promises';
import { loadKnowledgeBaseFromDir } from '../src/knowledge/loadFromDirectory.js';
import { createEngine } from '../src/engine/index.js';
import { readServerConfig } from '../src/api/config.js';

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/recommend.js <request.json>'); process.exit(2); }
const req = JSON.parse(await readFile(file, 'utf8'));
const engine = createEngine(await loadKnowledgeBaseFromDir(readServerConfig().kbDir));
try {
  const result = req.careerId ? engine.roadmap(req.profile ?? {}, req.careerId) : engine.recommend(req.profile, req.options);
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(JSON.stringify({ error: { code: e.code ?? 'ERROR', message: e.message, details: e.details } }, null, 2));
  process.exit(1);
}
