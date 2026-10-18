import type { CareersResponse, ErrorBody, HealthResponse, OptionsResponse, RecommendationResponse, RoadmapResponse, StudentProfile } from './types';

/** Set VITE_API_BASE to call a separately hosted engine (then set CORS_ALLOWED_ORIGINS on the engine). Empty = same origin. */
const API_BASE: string = import.meta.env.VITE_API_BASE ?? '';
const TIMEOUT_MS = 15_000;

export type ProblemKind = 'timeout' | 'network' | 'unavailable' | 'invalid' | 'not_found' | 'server' | 'aborted';
export interface FieldProblem { field: string; message: string; code?: string }

/** Every failure becomes an ApiProblem whose message is safe to show to a student as-is. */
export class ApiProblem extends Error {
  readonly kind: ProblemKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly details: FieldProblem[];
  constructor(kind: ProblemKind, message: string, opts: { status?: number; code?: string; details?: FieldProblem[] } = {}) {
    super(message);
    this.name = 'ApiProblem';
    this.kind = kind;
    this.status = opts.status ?? null;
    this.code = opts.code ?? null;
    this.details = opts.details ?? [];
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, outer?: AbortSignal): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort('timeout'), TIMEOUT_MS);
  const onOuter = () => ctl.abort('aborted');
  outer?.addEventListener('abort', onOuter);
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      signal: ctl.signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    if (outer?.aborted) throw new ApiProblem('aborted', 'The request was cancelled.');
    if (ctl.signal.aborted) throw new ApiProblem('timeout', 'The engine took too long to answer. Please try again.');
    throw new ApiProblem('network', 'We could not reach the AfriPath AI engine. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuter);
  }

  let data: unknown = null;
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (res.ok) return data as T;

  const err = (data as Partial<ErrorBody> | null)?.error;
  const details = (err?.details ?? []).map((d) => ({ field: d.field, message: d.message, code: d.code }));
  switch (res.status) {
    case 503: throw new ApiProblem('unavailable', 'AfriPath AI is temporarily unavailable. Please try again shortly.', { status: 503 });
    case 400:
    case 422: throw new ApiProblem('invalid', err?.message ?? 'Some answers could not be used.', { status: res.status, code: err?.code, details });
    case 404: throw new ApiProblem('not_found', err?.message ?? 'That item was not found.', { status: 404, code: err?.code });
    default: throw new ApiProblem('server', 'Something went wrong on our side. Please try again.', { status: res.status, code: err?.code });
  }
}

export const api = {
  health: (signal?: AbortSignal) => call<HealthResponse>('GET', '/health', undefined, signal),
  options: (signal?: AbortSignal) => call<OptionsResponse>('GET', '/v1/options', undefined, signal),
  careers: (signal?: AbortSignal) => call<CareersResponse>('GET', '/v1/careers', undefined, signal),
  recommend: (profile: StudentProfile, signal?: AbortSignal) =>
    call<RecommendationResponse>('POST', '/v1/recommendations', { profile, options: { maxResults: 3 } }, signal),
  roadmap: (careerId: string, profile: StudentProfile, signal?: AbortSignal) =>
    call<RoadmapResponse>('POST', '/v1/roadmaps', { careerId, profile }, signal),
};
