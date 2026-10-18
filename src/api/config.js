// Server settings, read from environment variables (all optional). No secrets are required.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function readServerConfig(env = process.env) {
  const int = (v, d, min, max) => { const n = Number.parseInt(v, 10); return Number.isInteger(n) && n >= min && n <= max ? n : d; };
  const origins = (env.CORS_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    port: int(env.PORT, 8080, 0, 65535),
    host: env.HOST || '0.0.0.0',
    kbDir: env.KB_DIR ? resolve(env.KB_DIR) : resolve(root, 'data', 'kb-v0.7'),
    corsAllowedOrigins: origins,           // [] = CORS disabled; ['*'] = any origin
    maxBodyBytes: int(env.MAX_BODY_BYTES, 32 * 1024, 1024, 1024 * 1024),
    logRequests: env.LOG_REQUESTS !== 'false',
  };
}
