// Runs the real engine in-process so front-end tests use true engine output, never hand-made lookalikes.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
// @ts-expect-error the engine is plain JavaScript without type declarations
import { createEngine, KNOWN_FIELDS as KNOWN } from '../../../src/engine/index.js';
// @ts-expect-error the engine is plain JavaScript without type declarations
import { loadKnowledgeBaseFromDir } from '../../../src/knowledge/loadFromDirectory.js';
import type { CareerListItem, OptionsResponse, RecommendationResponse, RoadmapResponse, StudentProfile } from '../api/types';

const ROOT = resolve(__dirname, '..', '..', '..');
const kb = await loadKnowledgeBaseFromDir(join(ROOT, 'data', 'kb-v0.7'));
const raw = createEngine(kb) as {
  recommend(p: StudentProfile, o?: object): RecommendationResponse;
  roadmap(p: StudentProfile, careerId: string): RoadmapResponse;
  listCareers(): CareerListItem[];
  options(): OptionsResponse;
};

export const engine = raw;
export const KNOWN_FIELDS = KNOWN as Set<string>;

const REQ_DIR = join(ROOT, 'examples', 'requests');
export const REQUEST_NAMES = readdirSync(REQ_DIR).filter((f) => f.startsWith('recommend_')).map((f) => f.replace('.json', ''));
export const profileOf = (name: string): StudentProfile => (JSON.parse(readFileSync(join(REQ_DIR, `${name}.json`), 'utf8')) as { profile: StudentProfile }).profile;
