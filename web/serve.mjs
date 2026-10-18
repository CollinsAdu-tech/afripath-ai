// Tiny dev/preview server for the front end: serves web/ and forwards /v1/* and /health to the engine API,
// so the browser sees one origin (no CORS setup needed). For production, put any static host in front of
// web/ and either proxy /v1 and /health the same way or set `apiBase` in assets/js/config.js.
//
//   API_URL=http://localhost:8080 PORT=5173 node web/serve.mjs
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { resolveStatic } from './static-path.mjs';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const API_URL = (process.env.API_URL || 'http://localhost:8080').replace(/\/$/, '');
const PORT = Number.parseInt(process.env.PORT, 10) || 5173;
const HOST = process.env.HOST || '0.0.0.0';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };

async function proxy(req, res) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 64 * 1024) { res.writeHead(413).end(); return; } chunks.push(c); }
  try {
    const up = await fetch(API_URL + req.url, { method: req.method, headers: req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {}, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const body = Buffer.from(await up.arrayBuffer());
    res.writeHead(up.status, { 'Content-Type': up.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store', ...SECURITY }).end(body);
  } catch {
    res.writeHead(502, { 'Content-Type': 'application/json', ...SECURITY }).end(JSON.stringify({ error: { code: 'ENGINE_UNREACHABLE', message: `The engine API at ${API_URL} is not reachable.` } }));
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/health' || url.pathname.startsWith('/v1/')) return proxy(req, res);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    const hit = resolveStatic(root, url.pathname);
    if (!hit.ok) { res.writeHead(hit.status).end(); return; }
    let file = hit.file;
    const st = await stat(file).catch(() => null);
    if (st?.isDirectory()) file = join(file, 'index.html');
    else if (!st) { const alt = file + '.html'; if (await stat(alt).catch(() => null)) file = alt; else { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found'); return; } }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': hit.topDir === 'assets' ? 'public, max-age=300' : 'no-cache', ...SECURITY });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(500).end('Server error'); }
}).listen(PORT, HOST, () => console.log(`AfriPath AI web on http://localhost:${PORT}  (engine: ${API_URL})`));
