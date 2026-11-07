// Runs the real Python engine so front-end tests use true engine output, never hand-made lookalikes.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CareerListItem, OptionsResponse, RecommendationResponse, RoadmapResponse, StudentProfile } from '../api/types';

const ROOT = resolve(__dirname, '..', '..', '..');
const PY = process.env.PYTHON || 'python3';

function run<T>(req: object): T {
  const out = execFileSync(PY, [join(ROOT, 'scripts', 'engine_cli.py')], { input: JSON.stringify(req), encoding: 'utf8', cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out) as T;
}

export const engine = {
  recommend: (profile: StudentProfile, _o?: object) => run<RecommendationResponse>({ op: 'recommend', profile }),
  roadmap: (profile: StudentProfile, careerId: string) => run<RoadmapResponse>({ op: 'roadmap', profile, careerId }),
  listCareers: () => run<CareerListItem[]>({ op: 'careers' }),
  options: () => run<OptionsResponse>({ op: 'options' }),
};

export const KNOWN_FIELDS = new Set<string>(run<string[]>({ op: 'known' }));

const REQ_DIR = join(ROOT, 'examples', 'requests');
export const REQUEST_NAMES = readdirSync(REQ_DIR).filter((f) => f.startsWith('recommend_')).map((f) => f.replace('.json', ''));
export const profileOf = (name: string): StudentProfile => (JSON.parse(readFileSync(join(REQ_DIR, `${name}.json`), 'utf8')) as { profile: StudentProfile }).profile;
