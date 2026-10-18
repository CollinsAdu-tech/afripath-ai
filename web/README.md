# AfriPath AI — web front end

React 19 + TypeScript (strict) + Vite. It talks to the recommendation engine only through the documented HTTP API
(`../docs/API.md`, `../docs/openapi.json`). The engine is untouched by this app and has no dependency on it.

## Run it

From the repository root (recommended): `npm run dev`, then open http://localhost:5173.
That starts the engine on :8080 and Vite on :5173, and installs `web/` dependencies on first run. Needs Node 20 or newer.

Or run the pieces yourself:

```
npm start                 # root: the engine API on :8080
cd web && npm install
npm run dev               # the site on :5173
```

Vite forwards `/v1/*` and `/health` to the engine, so the browser only talks to one origin and no CORS setup is needed.
Point at a different engine with `API_URL=http://host:port npm run dev` (also works for `npm run preview`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-checks, then builds to `dist/` |
| `npm run preview` | Serves `dist/` (with the same API forwarding) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest: runs the real engine in-process and renders its output |
| `npm run gen:types` | Regenerates `src/api/schema.d.ts` from `../docs/openapi.json` |
| `npm run check` | typecheck + tests |

## Layout

```
src/
  api/         typed client (ApiProblem, timeout, error mapping) and types generated from the OpenAPI file
  components/  Layout, ui primitives (Reveal, Accent, Tile, ...), Recommendations, Roadmap, Faq, Photo
  pages/       Home, Survey, Results, Roadmap, Opportunities, Mentorship, About, Login, Privacy, NotFound
  survey/      survey questions, answer -> profile mapping, answers context (sessionStorage)
  lib/         safeUrl, storage, useAsync, useReveal, useProgress, useTitle
  test/        Vitest tests
public/        fonts (self-hosted) and img/ (logo and photo slots)
```

Routes: `/`, `/afripath-ai`, `/results`, `/roadmap/:careerId`, `/opportunities`, `/mentorship`, `/about`, `/login`, `/privacy`.

## Honesty and privacy rules the UI enforces

- Fit scores are shown as a heuristic, with the engine's disclaimer; skipped questions are never counted as zero.
- "Source mentions free" appears only when the engine says so; otherwise the cost is "May involve cost" or "Cost not stated".
- Every opportunity is shown with an "Unverified lead" pill. Every resource says its link is not independently verified.
- Only `http(s)` links are rendered. API text is rendered as text, never as HTML.
- Survey answers live in `sessionStorage` (this tab only). Roadmap ticks live in `localStorage` (this browser only).
  No cookies, no analytics, no accounts. Only survey fields are sent to the engine.

## Deploying

`npm run build` produces static files in `dist/`. Two things to configure on the host:

1. **Single-page fallback:** serve `index.html` for any path that is not a file (otherwise refreshing `/results` gives a 404).
2. **API:** either route `/v1/*` and `/health` to the engine on the same domain, or build with
   `VITE_API_BASE=https://your-engine.example.com` and enable CORS on the engine (see `../docs/DEPLOYMENT.md`).

Hosting under a sub-path needs `base` set in `vite.config.ts` and `basename` on the router in `src/main.tsx`.

## Photos

The design has photo slots; until you add images they show labelled placeholders. Drop files into `public/img/`:
`hero.jpg`, `story.jpg`, `how.jpg`, `opportunities.jpg`, and transparent cut-outs `cta-left.png`, `cta-right.png`.
Sizes are listed in `public/img/README.md`.
