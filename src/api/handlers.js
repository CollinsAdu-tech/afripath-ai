// Route handlers. Pure functions of a parsed request -> {status, body, headers?}. No sockets here,
// so the whole contract can be tested without starting a server. All recommendation logic lives in
// src/engine; this file only validates the request envelope and shapes the response.

import { ApiError } from './errors.js';
import { InputValidationError, CareerNotFoundError, validateRecommendationResult, validatePlan } from '../engine/index.js';

const SERVICE = 'kareer-pathfinder-engine';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const warn = (field, message) => ({ field, code: 'UNKNOWN_FIELD', message });

function expectObject(body) {
  if (!isObj(body)) throw new ApiError(422, 'VALIDATION_ERROR', 'The request body must be a JSON object.', [{ field: 'body', code: 'INVALID_TYPE', message: 'Send a JSON object.' }]);
}

function unknownKeys(body, allowed) {
  return Object.keys(body).filter((k) => !allowed.includes(k)).map((k) => warn(k.slice(0, 40), `"${k.slice(0, 40)}" is not a recognised request field and was ignored.`));
}

export function createHandlers({ engine, kbError = null, startedAt = Date.now() }) {
  const unavailable = () => new ApiError(503, 'KNOWLEDGE_BASE_UNAVAILABLE', 'The knowledge base could not be loaded, so recommendations are temporarily unavailable.');

  const routes = {
    'GET /health': () => {
      if (!engine) return { status: 503, body: { status: 'unavailable', service: SERVICE, knowledgeBase: { loaded: false, error: kbError?.message ?? 'unknown error' } } };
      const info = engine.info();
      return { status: 200, body: {
        status: 'ok', service: SERVICE, engineVersion: info.engineVersion,
        knowledgeBase: { loaded: true, version: info.knowledgeBaseVersion, counts: info.counts },
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      } };
    },
    'GET /v1/meta': () => ({ status: 200, body: engine.info(), cache: true }),
    'GET /v1/options': () => ({ status: 200, body: engine.options(), cache: true }),
    'GET /v1/careers': () => ({ status: 200, body: { careers: engine.listCareers(), meta: engine.meta() }, cache: true }),
    'POST /v1/recommendations': ({ body }) => {
      expectObject(body);
      if (!('profile' in body)) throw new ApiError(422, 'VALIDATION_ERROR', 'The request is missing "profile".', [{ field: 'profile', code: 'REQUIRED', message: '"profile" is required (it may be an empty object).' }]);
      const extra = unknownKeys(body, ['profile', 'options']);
      let maxResults;
      if ('options' in body) {
        if (!isObj(body.options)) throw new ApiError(422, 'VALIDATION_ERROR', '"options" must be an object.', [{ field: 'options', code: 'INVALID_TYPE', message: 'Send an object such as {"maxResults": 3}.' }]);
        if ('maxResults' in body.options) {
          const n = body.options.maxResults;
          if (!Number.isInteger(n) || n < 1 || n > 3) throw new ApiError(422, 'VALIDATION_ERROR', '"options.maxResults" must be a whole number from 1 to 3.', [{ field: 'options.maxResults', code: 'OUT_OF_RANGE', message: 'Use 1, 2 or 3.' }]);
          maxResults = n;
        }
      }
      const result = engine.recommend(body.profile, { maxResults });
      const check = validateRecommendationResult(result, engine.kb);
      if (!check.valid) { const e = new Error(`Result failed validation: ${check.problems.slice(0, 3).join('; ')}`); e.internal = true; throw e; }
      result.warnings = [...result.warnings, ...extra];
      return { status: 200, body: result };
    },
    'POST /v1/roadmaps': ({ body }) => {
      expectObject(body);
      if (typeof body.careerId !== 'string' || !body.careerId) throw new ApiError(422, 'VALIDATION_ERROR', 'The request is missing "careerId".', [{ field: 'careerId', code: 'REQUIRED', message: '"careerId" must be a career id from GET /v1/careers.' }]);
      const extra = unknownKeys(body, ['careerId', 'profile']);
      const plan = engine.roadmap(body.profile ?? {}, body.careerId);
      const check = validatePlan(plan, engine.kb);
      if (!check.valid) { const e = new Error(`Roadmap failed validation: ${check.problems.slice(0, 3).join('; ')}`); e.internal = true; throw e; }
      plan.warnings = [...plan.warnings, ...extra];
      return { status: 200, body: plan };
    },
  };

  /** @param {{method:string, path:string, body?:any}} req */
  function handle(req) {
    const path = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
    const key = `${req.method} ${path}`;
    const careerMatch = /^\/v1\/careers\/([^/]+)$/.exec(path);

    if (!engine && path !== '/health') {
      if (routes[key] || (careerMatch && req.method === 'GET')) throw unavailable();
    }
    if (routes[key]) return routes[key](req);
    if (careerMatch && req.method === 'GET') {
      let id; try { id = decodeURIComponent(careerMatch[1]); } catch { id = ''; }
      return { status: 200, body: engine.getCareer(id), cache: true };
    }
    const allowed = Object.keys(routes).filter((k) => k.split(' ')[1] === path).map((k) => k.split(' ')[0]);
    if (careerMatch) allowed.push('GET');
    if (allowed.length) throw Object.assign(new ApiError(405, 'METHOD_NOT_ALLOWED', `${req.method} is not allowed on ${path}.`), { allow: allowed.join(', ') });
    throw new ApiError(404, 'NOT_FOUND', `No endpoint at ${path}.`);
  }

  /** Maps any thrown error to a stable {status, body} error envelope. */
  function toErrorResponse(err, requestId) {
    const base = (status, code, message, details, headers) => ({ status, headers, body: { error: { code, message, ...(details ? { details } : {}), requestId } } });
    if (err instanceof ApiError) return base(err.status, err.code, err.message, err.details, err.allow ? { Allow: err.allow } : undefined);
    if (err instanceof InputValidationError) return base(422, 'VALIDATION_ERROR', err.message, err.details);
    if (err instanceof CareerNotFoundError) return base(404, 'CAREER_NOT_FOUND', err.message);
    return base(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Please try again.');
  }

  return { handle, toErrorResponse };
}
