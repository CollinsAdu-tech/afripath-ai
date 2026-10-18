// HTTP adapter (node:http, zero dependencies). Handles transport concerns only: body size limit,
// JSON parsing, content-type, CORS, request ids, security headers and request logging.
// Request bodies are never logged: they hold student answers.

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createHandlers } from './handlers.js';
import { ApiError } from './errors.js';

const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

async function readBody(req, limit) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `The request body must be at most ${limit} bytes.`);
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `The request body must be at most ${limit} bytes.`);
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * @param {{engine:object|null, kbError?:Error|null, config:object}} deps
 * `engine` may be null when the knowledge base failed to load: the server then reports 503 instead of crashing.
 */
export function createServer({ engine, kbError = null, config }) {
  const { handle, toErrorResponse } = createHandlers({ engine, kbError });

  const corsHeaders = (origin) => {
    const allowed = config.corsAllowedOrigins;
    if (!allowed.length || !origin) return {};
    if (allowed.includes('*')) return { 'Access-Control-Allow-Origin': '*' };
    return allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  };

  return http.createServer(async (req, res) => {
    const started = process.hrtime.bigint();
    const inbound = req.headers['x-request-id'];
    const requestId = typeof inbound === 'string' && REQUEST_ID.test(inbound) ? inbound : randomUUID();
    const url = new URL(req.url, 'http://localhost');
    const headers = {
      'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'X-Request-Id': requestId,
      'Cache-Control': 'no-store', ...corsHeaders(req.headers.origin),
    };
    let out;
    try {
      if (req.method === 'OPTIONS') {
        out = { status: 204, headers: { ...corsHeaders(req.headers.origin), 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Request-Id', 'Access-Control-Max-Age': '600' }, body: null };
      } else {
        let body;
        if (req.method === 'POST') {
          const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
          if (type !== 'application/json') throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the request with Content-Type: application/json.');
          const text = await readBody(req, config.maxBodyBytes);
          try { body = JSON.parse(text); } catch { throw new ApiError(400, 'INVALID_JSON', 'The request body is not valid JSON.'); }
        }
        out = handle({ method: req.method, path: url.pathname, query: url.searchParams, body });
        if (out.cache) out.headers = { 'Cache-Control': 'public, max-age=300' };
      }
    } catch (err) {
      if (err.internal || !(err instanceof ApiError || err.code)) console.error(JSON.stringify({ level: 'error', requestId, message: err.message }));
      out = toErrorResponse(err, requestId);
    }
    Object.assign(headers, out.headers);
    res.writeHead(out.status, headers);
    res.end(out.body === null ? undefined : JSON.stringify(out.body));
    if (config.logRequests) {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      console.log(JSON.stringify({ level: 'info', requestId, method: req.method, path: url.pathname, status: out.status, ms: Math.round(ms) }));
    }
  });
}
