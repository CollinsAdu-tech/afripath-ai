// One command for local development: starts the Python (FastAPI) engine API and the React front end (Vite) together.
//   npm run dev        (then open http://localhost:5173)
// Ctrl+C stops both. Works the same on Windows, macOS and Linux. The first run installs web/ dependencies.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = resolve(root, 'web');
const API_PORT = process.env.API_PORT || '8080';
const WEB_PORT = process.env.WEB_PORT || '5173';
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';

if (!existsSync(resolve(web, 'node_modules'))) {
  console.log('First run: installing the front end dependencies (this needs internet and takes a minute)...');
  const r = spawnSync(npm, ['install'], { cwd: web, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) { console.error('\nCould not install the front end dependencies. Check your internet connection, then run "npm install" inside the web folder.'); process.exit(r.status || 1); }
}

let stopping = false;
const kids = [];
function kill(k) {
  if (k.pid && k.exitCode === null) k.kill('SIGTERM');
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  kids.forEach(kill);
  setTimeout(() => process.exit(code), 300);
}

const run = (name, cmd, args, opts) => {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts, env: { ...process.env, ...opts.env } });
  const tag = (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`[${name}] ${l}`));
  child.stdout.on('data', tag);
  child.stderr.on('data', tag);
  child.on('error', (e) => { console.log(`[${name}] could not start: ${e.message}`); stop(1); });
  child.on('exit', (code) => { console.log(`[${name}] exited (${code})`); stop(code || 0); });
  kids.push(child);
};

const py = process.env.PYTHON || (isWin ? 'python' : 'python3');
run('engine', py, ['-m', 'pathfinder.api'], { cwd: root, env: { PORT: API_PORT, HOST: '127.0.0.1', PYTHONUNBUFFERED: '1' } });
// Vite is started directly with node (not through npm), so stopping this script really stops it on every OS.
run('web', process.execPath, [resolve(web, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', WEB_PORT, '--strictPort'], { cwd: web, env: { API_URL: `http://127.0.0.1:${API_PORT}`, WEB_PORT } });
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
console.log(`\nAfriPath AI dev: open http://localhost:${WEB_PORT}  (engine on :${API_PORT}). Ctrl+C to stop.\n`);
