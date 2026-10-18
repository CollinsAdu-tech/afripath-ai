// Browser storage that never throws (private windows, blocked storage) and falls back to memory.
const mem = new Map<string, string>();

function store(kind: 'session' | 'local'): Storage | null {
  try { return kind === 'session' ? window.sessionStorage : window.localStorage; } catch { return null; }
}

export function readJson<T>(kind: 'session' | 'local', key: string, fallback: T): T {
  try {
    const raw = store(kind)?.getItem(key) ?? mem.get(`${kind}:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(kind: 'session' | 'local', key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  mem.set(`${kind}:${key}`, raw);
  try { store(kind)?.setItem(key, raw); } catch { /* memory copy still works for this visit */ }
}

export function removeKey(kind: 'session' | 'local', key: string): void {
  mem.delete(`${kind}:${key}`);
  try { store(kind)?.removeItem(key); } catch { /* ignore */ }
}
