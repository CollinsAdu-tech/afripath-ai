// Thin client for the AfriPath AI engine API (see docs/API.md). Every failure becomes an ApiProblem
// with a plain-language message the UI can show as-is.
import { CONFIG } from './config.js';

export class ApiProblem extends Error {
  constructor(kind, message, { status = null, code = null, details = [] } = {}) {
    super(message); this.kind = kind; this.status = status; this.code = code; this.details = details;
  }
}

async function call(method, path, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CONFIG.requestTimeoutMs);
  let res;
  try {
    res = await fetch(CONFIG.apiBase + path, {
      method, signal: ctl.signal, headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiProblem(e?.name === 'AbortError' ? 'timeout' : 'network',
      e?.name === 'AbortError' ? 'The engine took too long to answer. Please try again.' : 'We could not reach the AfriPath AI engine. Check your connection and try again.');
  } finally { clearTimeout(timer); }

  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (res.ok) return data;
  const err = data?.error;
  if (res.status === 503) throw new ApiProblem('unavailable', 'AfriPath AI is temporarily unavailable. Please try again shortly.', { status: 503 });
  if (res.status === 422 || res.status === 400) throw new ApiProblem('invalid', err?.message || 'Some answers could not be used.', { status: res.status, code: err?.code, details: err?.details || [] });
  if (res.status === 404) throw new ApiProblem('not_found', err?.message || 'That item was not found.', { status: 404, code: err?.code });
  throw new ApiProblem('server', 'Something went wrong on our side. Please try again.', { status: res.status, code: err?.code });
}

export const api = {
  health: () => call('GET', '/health'),
  options: () => call('GET', '/v1/options'),
  careers: () => call('GET', '/v1/careers'),
  recommend: (profile) => call('POST', '/v1/recommendations', { profile, options: { maxResults: 3 } }),
  roadmap: (careerId, profile) => call('POST', '/v1/roadmaps', { careerId, profile: profile || {} }),
};
