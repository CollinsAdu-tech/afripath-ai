// Maps a URL path to a file inside `root`, or says why not. Takes the path module as a parameter so the
// same logic is tested with both POSIX and Windows semantics (a hard-coded "/" check once caused a 403 on Windows).
import nodePath from 'node:path';

export function resolveStatic(root, urlPath, p = nodePath) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch { return { ok: false, status: 400 }; }
  if (rel.includes('\0')) return { ok: false, status: 400 };
  rel = rel.replace(/^[\\/]+/, '');
  const file = p.resolve(root, rel === '' ? 'index.html' : rel);
  const inside = p.relative(root, file);
  if (inside === '' ? false : inside.startsWith('..') || p.isAbsolute(inside)) return { ok: false, status: 403 };
  if (p.basename(file) === 'serve.mjs' || p.basename(file) === 'static-path.mjs') return { ok: false, status: 404 };
  return { ok: true, file, topDir: inside.split(p.sep)[0] };
}
