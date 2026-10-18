// Node-only helper: reads the `combined_*.json` files from a directory and builds the knowledge base.
// Kept apart from knowledgeBase.js so the pure builder can be used and tested without file access.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildKnowledgeBase, KnowledgeBaseError } from './knowledgeBase.js';

const REQUIRED = ['careers', 'roadmap_stages', 'resources', 'skills', 'projects', 'communities', 'opportunities'];
const OPTIONAL = ['learning_tracks', 'advice']; // missing optional files are tolerated

export async function loadKnowledgeBaseFromDir(dir, options) {
  if (typeof dir !== 'string' || !dir) throw new KnowledgeBaseError('Knowledge-base directory was not provided.');
  const raw = {};
  for (const name of [...REQUIRED, ...OPTIONAL]) {
    const file = `combined_${name}.json`;
    try {
      raw[name] = JSON.parse(await readFile(join(dir, file), 'utf8'));
    } catch (e) {
      if (OPTIONAL.includes(name) && e.code === 'ENOENT') continue;
      const why = e.code === 'ENOENT' ? 'file not found' : e.message;
      throw new KnowledgeBaseError(`Could not read knowledge-base file "${file}" in "${dir}": ${why}`, [{ severity: 'error', code: 'KB_FILE_UNREADABLE', message: file }]);
    }
  }
  return buildKnowledgeBase(raw, options);
}
