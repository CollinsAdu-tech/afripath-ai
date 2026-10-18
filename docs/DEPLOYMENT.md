# Deployment

## Requirements

| Item | Requirement |
|---|---|
| Runtime | Node.js **20 or newer** (tested on 22). No other software. |
| Dependencies | None. No `npm install` is needed (the package has no dependencies). |
| Build step | None. |
| Data | The knowledge base ships in `data/kb-v0.7/` (the `combined_*.json` files). It is read once at startup. |
| Memory / CPU | Very small. Scoring 9 careers is a few milliseconds of CPU; the KB is under 1 MB. |
| State | None. Stateless, so any number of instances can run side by side. No database, queue or cache is required. |
| Network | Inbound HTTP only. The engine makes **no outbound requests**. |

## Start

```bash
npm start            # or: node src/api/start.js
```

## Environment variables (all optional)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on. |
| `HOST` | `0.0.0.0` | Interface to bind. |
| `KB_DIR` | `data/kb-v0.7` | Directory holding the `combined_*.json` knowledge-base files. Use this to deploy a newer KB version without code changes (the engine's taxonomy must cover its careers; see docs/SCORING_AND_MAPPING.md). |
| `CORS_ALLOWED_ORIGINS` | *(empty = CORS off)* | Comma-separated list of allowed browser origins, e.g. `https://app.example.com,http://localhost:5173`, or `*` for any origin. A browser-based frontend on a different origin **needs this set**. |
| `MAX_BODY_BYTES` | `32768` | Maximum request body size (1 KB – 1 MB). |
| `LOG_REQUESTS` | `true` | Set to `false` to silence the one-line-per-request JSON log. |

No secrets are needed and none are read.

## Health check

`GET /health`

- **200** `{"status":"ok", ...}` — the process is up and the knowledge base loaded.
- **503** `{"status":"unavailable", "knowledgeBase":{"loaded":false,"error":"..."}}` — the knowledge base failed validation or could not be read.

If the knowledge base is invalid the server **still starts** and answers 503 everywhere (except unknown paths), so a platform health check marks the instance unhealthy rather than putting it in a crash loop. The reason is logged at startup (`Knowledge base failed to load: ...`) and returned by `/health`.

Point your platform's health check (Render, Fly, Railway, Kubernetes probe, load balancer, …) at `/health`.

## Logging and privacy

One JSON line per request: `level, requestId, method, path, status, ms`. **Request and response bodies are never logged** (they contain student answers). Errors log the error message and request id only, never the body. Every response carries an `X-Request-Id` header (a valid inbound `X-Request-Id` is reused), and error bodies repeat it so users can quote it in support requests.

## Hardening checklist (outside the engine's scope, recommended before public launch)

The engine deliberately adds no infrastructure. Before exposing it to the public internet, put it behind your platform's standard front door and add:

1. **TLS** (HTTPS) at the load balancer or platform edge.
2. **Rate limiting** at the gateway (the API itself has none). Requests are cheap but unauthenticated.
3. **CORS allow-list**: set `CORS_ALLOWED_ORIGINS` to your real frontend origin(s) rather than `*`.
4. **Authentication**, only if your product needs it. The API has none because it holds no personal data and no state; if your frontend has accounts, enforce them in front of this service or in your own backend.
5. **Process supervision**: the platform restarts the process; `SIGTERM`/`SIGINT` trigger a graceful close.

## Updating the knowledge base

1. Replace the files in `data/kb-v0.7/` (or point `KB_DIR` at a new directory).
2. `npm run data-quality` and read `docs/DATA_QUALITY_REPORT.md`.
3. If careers were added or renamed, update `src/engine/taxonomy.js` (the engine reports `NO_TAXONOMY` for unmapped careers and does not score them).
4. `npm run examples && npm run openapi && npm test`. Tests that assert specific counts for v0.7 (`test/knowledgeBase.test.js`) are expected to need updating for a new version.

## Container note

No Dockerfile is provided because none was built or tested here. A container needs only a Node 20+ base image, the repository contents, `EXPOSE 8080`, and `CMD ["node","src/api/start.js"]`; there is no build step.
