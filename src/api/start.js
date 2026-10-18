#!/usr/bin/env node
// Composition root: loads the knowledge base, builds the engine, starts the HTTP server.
//   npm start        (PORT, HOST, KB_DIR, CORS_ALLOWED_ORIGINS, MAX_BODY_BYTES, LOG_REQUESTS are optional)
// If the knowledge base is invalid the server STILL starts, answers /health with 503 and every other
// endpoint with 503, so a deployment platform sees an unhealthy instance instead of a crash loop.

import { readServerConfig } from './config.js';
import { createServer } from './server.js';
import { loadKnowledgeBaseFromDir } from '../knowledge/loadFromDirectory.js';
import { createEngine } from '../engine/index.js';

const config = readServerConfig();
let engine = null; let kbError = null;
try {
  engine = createEngine(await loadKnowledgeBaseFromDir(config.kbDir));
} catch (e) {
  kbError = e;
  console.error(JSON.stringify({ level: 'error', message: `Knowledge base failed to load: ${e.message}`, issues: e.issues?.slice(0, 5) }));
}

const server = createServer({ engine, kbError, config });
server.listen(config.port, config.host, () => {
  console.log(JSON.stringify({ level: 'info', message: 'listening', host: config.host, port: server.address().port, knowledgeBase: engine ? engine.info().counts : 'unavailable' }));
});
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
