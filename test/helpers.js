import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKnowledgeBaseFromDir } from '../src/knowledge/loadFromDirectory.js';
import { createEngine } from '../src/engine/index.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const KB_DIR = join(ROOT, 'data', 'kb-v0.7');
export const kb = await loadKnowledgeBaseFromDir(KB_DIR);
export const engine = createEngine(kb);

/** A synthetic student request from examples/requests (these are the documented fixtures). */
export const example = (name) => JSON.parse(readFileSync(join(ROOT, 'examples', 'requests', `${name}.json`), 'utf8'));
export const profileOf = (name) => example(name).profile;
export const topIds = (result) => result.recommendations.map((r) => r.careerId);
export const rawKbFiles = () => {
  const r = {};
  for (const n of ['careers', 'roadmap_stages', 'resources', 'skills', 'projects', 'communities', 'opportunities', 'learning_tracks', 'advice']) r[n] = JSON.parse(readFileSync(join(KB_DIR, `combined_${n}.json`), 'utf8'));
  return r;
};

/** Small deterministic PRNG so "random" profiles are reproducible. */
export function prng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
