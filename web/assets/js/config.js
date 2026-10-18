// Front-end settings. Edit this one file to point the site at the engine API.
//
//  apiBase: ''                         -> same origin (use `npm run web`, or a reverse proxy that forwards /v1 and /health)
//  apiBase: 'https://api.example.com'  -> a separately hosted engine (set CORS_ALLOWED_ORIGINS on the engine to this site's origin)
export const CONFIG = Object.freeze({
  apiBase: '',
  requestTimeoutMs: 15000,
});
