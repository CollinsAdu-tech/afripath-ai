# API integration contract

Plain JSON over HTTP. Frontend-agnostic: no framework, cookies, sessions or SDK required. The machine-readable version is [openapi.json](openapi.json) (OpenAPI 3.1). Real request/response pairs are in [`examples/`](../examples).

- **Base URL:** `http://localhost:8080` by default.
- **Content type:** requests with a body must send `Content-Type: application/json`; all responses are `application/json; charset=utf-8`.
- **Stateless and private:** nothing is stored; bodies are never logged. Student-specific responses carry `Cache-Control: no-store`.
- **Deterministic:** the same request against the same knowledge base returns the same body.
- **Versioning:** paths are prefixed `/v1`. Within v1, fields may be *added*; they are not removed or retyped. Read `meta.engineVersion` / `meta.knowledgeBaseVersion` for the exact build.
- **Request ids:** every response has `X-Request-Id`. Send your own (`[A-Za-z0-9._-]`, ≤ 64 chars) to correlate logs; it is echoed. Error bodies repeat it.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + knowledge-base status (use as the deployment health check) |
| GET | `/v1/meta` | Engine / KB / taxonomy versions and factor weights |
| GET | `/v1/options` | Questionnaire option ids and labels (build the form from this) |
| GET | `/v1/careers` | List all career paths |
| GET | `/v1/careers/{careerId}` | One career path with its stage list |
| POST | `/v1/recommendations` | Top career paths for a student profile |
| POST | `/v1/roadmaps` | Personalised learning plan for one career |

Trailing slashes are tolerated. Unknown paths → `404`; wrong method → `405` with an `Allow` header.

## Typical integration flow

1. `GET /v1/options` → render the questionnaire from the returned `id`/`label` pairs. Every question is optional; let students skip.
2. `POST /v1/recommendations` with whatever was answered → render by `status` (see below).
3. When the student picks a career, `POST /v1/roadmaps` with `{careerId, profile}` (the recommendation includes a ready-made `roadmapRequest`).
4. To "explore other careers", use `explore.otherCareers` and `GET /v1/careers`, or change the answers and call again.

## The student profile

All fields optional. Send only what the student answered. Option ids come from `GET /v1/options` (ids are matched case-insensitively; spaces and dashes become `_`).

| Field | Type | Allowed values | Affects fit score? |
|---|---|---|---|
| `interests` | string[] | `intelligent_systems, web_building, data_patterns, security_investigation, cloud_infrastructure, science_quantum, ai_ethics_governance, organizing_projects, helping_solving` | **Yes** (35%) |
| `currentSkills` | string[] | `logical_reasoning, mathematics, communication, creativity, research, problem_solving, teamwork, organization, programming, analytical_thinking` | **Yes** (25%, with `skillsToDevelop`) |
| `skillsToDevelop` | string[] | same as `currentSkills` | **Yes** (part of strengths; weighted 30% vs 70% for current skills) |
| `workStyles` | string[] | `building, investigating, analyzing, researching, helping_people, planning_coordinating` | **Yes** (15%) |
| `goals` | string[] | `build_products, research, protect_people_orgs, improve_education, solve_community_problems, start_business, technical_career` | **Yes** (10%) |
| `subjects` | string[] | `mathematics, physics, ict_computing, biology_chemistry, social_science_humanities, business_economics, languages_communication` | **Yes** (academic, 15%) |
| `mathConfidence` | integer 1–5 (numeric string accepted) | | **Yes** (academic; gently, see below) |
| `programmingExperience` | string | `none, some, comfortable, strong` | **Yes** (academic) |
| `scienceBackground` | string | `none, some, comfortable, strong` | **Yes** (academic) |
| `educationLevel` | string | `junior_secondary, senior_secondary, tertiary, graduate, other` | No (accepted, unused) |
| `budget` | string | `none, low, flexible` | **No.** Orders resources, adds cost warnings |
| `internet` | string | `unreliable, limited, reliable` | **No.** Orders resources, adds data warnings |
| `device` | string | `phone_only, low_spec_computer, standard_computer` | **No.** Adds device notes |
| `weeklyHours` | number 0–80 (numeric string accepted) | | **No.** Pacing suggestion |
| `learningFormats` | string[] | `video, text, interactive, hands_on, community` | **No.** Reorders resources |
| `experienceByCareer` | object | `{ "<careerId>": "none"\|"some"\|"solid" }` | **No.** Moves the roadmap start stage |

### Validation rules

| Situation | Result |
|---|---|
| Field missing, `null`, `""` or `[]` | Treated as **not answered**. Never penalised. |
| Wrong type (e.g. `interests: "web"`, `budget: 5`, `weeklyHours: {}`) | **422** `VALIDATION_ERROR`, `error.details[].field` names each offender |
| Unknown option id (e.g. `"astrology"`) | Ignored; `warnings[]` entry `UNKNOWN_OPTION` |
| Number out of range (`mathConfidence: 9`, `weeklyHours: 500`) | Ignored; `warnings[]` entry `OUT_OF_RANGE` |
| Unknown field (e.g. `fullName`, `email`) | Ignored; `warnings[]` entry `UNKNOWN_FIELD`. **Do not send personal information.** |
| More than 20 values in a list | First 20 used; `TOO_MANY_VALUES` warning |
| Duplicates in a list | Removed |
| Body over 32 KB (configurable) | **413** |
| Body not JSON | **400** `INVALID_JSON` |
| Missing/other `Content-Type` on POST | **415** |

## POST /v1/recommendations

Request:

```json
{
  "profile": { "interests": ["security_investigation"], "currentSkills": ["analytical_thinking"],
               "workStyles": ["investigating"], "goals": ["protect_people_orgs"], "budget": "none", "weeklyHours": 3 },
  "options": { "maxResults": 3 }
}
```

`profile` is required (it may be `{}`). `options.maxResults` is optional, an integer 1–3 (default 3). Extra top-level keys are ignored with a warning.

### Response

| Field | Meaning |
|---|---|
| `status` | `ok`, `exploratory` or `insufficient_information` (see next section) |
| `message` | Student-facing sentence for this status |
| `scoreNote` | Plain-language statement that the score is heuristic. Show it near the scores. |
| `recommendations[]` | 0–3 paths, best first (see below) |
| `explore.otherCareers[]` | Every career **not** in `recommendations`, with its `fitScore` (null when insufficient information), for "explore other options" |
| `explore.hint` | Suggested wording for the explore prompt |
| `evidence` | `{level, answeredFactors[], share}`: how much the answers could support |
| `missingInformation[]` | Unanswered factors, **highest-value first**, each with `fields[]` and a `question` you can ask |
| `notes[]` | Whole-profile notes (e.g. "you selected many interests…") |
| `warnings[]` | Ignored input (see validation) |
| `meta` | Versions, scoring model and the factor `weights` |

Each **recommendation** contains:

| Field | Meaning |
|---|---|
| `rank`, `careerId`, `title`, `category`, `summary` | Stable career id (`career_*`) and KB text |
| `fit` | `{kind:"heuristic_fit_score", scale:"0-100", score, label, labelId, basis, disclaimer}`. **Always show `label` and `disclaimer` with the number.** `basis` is `limited_answers` when evidence was thin |
| `explanation` | `{headline, summary, reasons[], notes[]}`. `reasons[]` each have `factor`, `text`, `matched[]` |
| `matched` | The student's own answers that matched, as `{id,label}`: `interests, strengths, skillsToDevelop, workStyles, goals, subjects` |
| `factorBreakdown[]` | Per factor: `weightPercent` (effective, after renormalising), `score` 0–100, `contributionPoints`; contributions sum to `fit.score`. Unanswered factors have `status:"not_evaluated"` |
| `careerBasis[]` | The knowledge-base evidence behind this career's mapping |
| `skillGaps` | `skillsToBuild[]` (real KB skill records, beginner-first), `strengthsToBuild[]`, `prerequisites[]` (guidance, never a barrier), `bridgePath` (e.g. the real Intro-to-Coding path for a complete beginner, or null) |
| `firstStep` | `{text, stageId, resource{resourceId,title,url}, flags[], why}` — a concrete first action, or null if the KB has none |
| `roadmap` | `{startingPoint, stages[]}` overview. Fetch the full plan from `/v1/roadmaps` |
| `startingResources[]` | Up to 5 resources for the starting stage, ordered for the student's access needs |
| `projects[]` | Up to 3 KB projects, easiest first for beginners; `safetyNote` must be shown when present |
| `accessConsiderations[]`, `knowledgeGaps[]` | Cost/data/device notes and honest statements of what the KB lacks |
| `roadmapRequest` | `{method, path, body:{careerId}}` ready to POST (add the profile) |

### How a frontend should handle each `status`

| `status` | Meaning | UI guidance |
|---|---|---|
| `ok` | Enough answers for a reasonable reading | Show `recommendations`, `scoreNote`, and an "explore other careers" control |
| `exploratory` | Few answers (or nothing stood out) | Show them as an *early signal*; `fit.labelId` is `early_signal`. Invite more answers using `missingInformation` |
| `insufficient_information` | Not enough to rank. **HTTP 200, `recommendations: []`** | Don't show an error. Ask the first `missingInformation[].question`, and offer `explore.otherCareers` to browse |

Other states your UI needs: **loading** (request in flight), **validation error** (422 → highlight `error.details[].field`), **service unavailable** (503 → "try again later"), **unexpected error** (500 → show the `requestId`).

Fit labels: `strong_alignment` ≥ 75, `good_alignment` ≥ 60, `some_alignment` below that, `early_signal` for limited answers. Careers scoring under 40 are not returned as recommendations (they remain in `explore`). If nothing reaches 40 the closest three are returned as `exploratory`.

## POST /v1/roadmaps

```json
{ "careerId": "career_cybersecurity", "profile": { "budget": "none", "internet": "limited", "weeklyHours": 4 } }
```

`careerId` is required (from `GET /v1/careers`); `profile` is optional. Unknown career → **404** `CAREER_NOT_FOUND`.

| Field | Meaning |
|---|---|
| `startingPoint`, `firstAction` | Where to begin and one realistic first action. Everyone starts at stage 1 unless `experienceByCareer` says otherwise; earlier stages then get `status:"covered_by_your_answers"` but stay available |
| `pacing` | Only if `weeklyHours` was sent: `suggestedItemsPerWeek` and a `firstWeek` list. **A suggestion for ordering, not a deadline** |
| `stages[]` | The real roadmap stages in order. Each: `status`, `durationPerSource` (the source's own text, e.g. "Months 1–3"), `prerequisitesPerSource` (verbatim free text), `focus`, `actions`, `weeklyPlanPerSource`, `checkpoints`, `activities[]`, `resources[]`, `communities[]`, `gaps[]` |
| `prerequisiteGuidance` | Prerequisite hints and a `bridgePath` for beginners |
| `projects[]` | All KB projects for the career. The KB links projects to careers, **not to stages** (stated in `knowledgeGaps`) |
| `learningTracks[]` | Present for Data Careers (5 real tracks) |
| `opportunityLeads[]` | Leads only. `status` is **always** `unverified_lead`; show `statusNote`. Never present one as open or funded |
| `guidance[]` | Practitioner tips from the KB |
| `accessConsiderations[]` | Cost, data-use, account-setup and device notes derived from the student's constraints |
| `knowledgeGaps[]` | What the KB lacks (e.g. no resources for a stage, no maths resources) |
| `caveats[]` | Standing reminders to show once: links/prices are unverified; durations are not deadlines |

Resource lists are **unique across a plan** (by id and by URL). A tool used in several weeks (e.g. Replit in Intro to Coding) appears once in `resources`, and each `activity.resources[]` reference points to it, so day-by-day structure is preserved. `resources[].flags[]` (`check_cost`, `data_heavy`, `needs_account_setup`, `matches_preferred_format`) carry ready-to-show messages. Costs are only ever `may_involve_cost`, `source_mentions_free` or `unknown`, each with a `costNote` that includes a "verify" caveat; **the API never says a resource is free.** `url` is `null` when the KB supplied none (`linkStatus: "no_link_provided"`); links are never constructed.

## GET endpoints

- `GET /v1/options` → `{options:{interests[],strengths[],workStyles[],goals[],subjects[],mathConfidence[],programmingExperience[],...}, factorWeights, meta}`. `strengths` lists the ids valid for both `currentSkills` and `skillsToDevelop`.
- `GET /v1/careers` → `{careers:[{careerId,title,category,summary,stageCount,projectCount,scored}], meta}`
- `GET /v1/careers/{careerId}` → career with `audiences`, `quickStart`, `stages[]`, counts, `basis[]`
- `GET /v1/meta` → versions + weights. GET catalogue responses are cacheable (`max-age=300`).

## Errors

Every error uses one envelope:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "The request contains invalid answers.",
             "details": [{ "field": "interests", "code": "INVALID_TYPE", "message": "\"interests\" must be a list of option ids." }],
             "requestId": "9ffacafe-d16b-4dc9-a12b-1cfce1ae9a69" } }
```

| HTTP | `error.code` | When |
|---|---|---|
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 404 | `NOT_FOUND` / `CAREER_NOT_FOUND` | Unknown path / unknown career id |
| 405 | `METHOD_NOT_ALLOWED` | Wrong method (see `Allow` header) |
| 413 | `PAYLOAD_TOO_LARGE` | Body over the limit |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | POST without `Content-Type: application/json` |
| 422 | `VALIDATION_ERROR` | Wrong types or ranges; missing `profile` / `careerId`; bad `options.maxResults` |
| 503 | `KNOWLEDGE_BASE_UNAVAILABLE` | Knowledge base failed to load (see DEPLOYMENT.md) |
| 500 | `INTERNAL_ERROR` | Unexpected failure, **including a result that fails the server's own reference check**. Generic message; no stack or internals are ever returned |

`details` is present for 422 only. Real examples: [`examples/responses/error_*.json`](../examples/responses).

## CORS

Off by default. Set `CORS_ALLOWED_ORIGINS` (comma-separated origins, or `*`). Preflight `OPTIONS` returns 204 with `Access-Control-Allow-Methods: GET, POST, OPTIONS` and `Access-Control-Allow-Headers: Content-Type, X-Request-Id`.

## Example requests

```bash
# Options for the questionnaire
curl -s localhost:8080/v1/options

# Recommendations (real response: examples/responses/recommend_security_investigator.json)
curl -s -X POST localhost:8080/v1/recommendations -H 'content-type: application/json' \
  -d @examples/requests/recommend_security_investigator.json

# Not enough information (HTTP 200, status insufficient_information)
curl -s -X POST localhost:8080/v1/recommendations -H 'content-type: application/json' -d '{"profile":{}}'

# Roadmap for a student with no budget and a slow connection
curl -s -X POST localhost:8080/v1/roadmaps -H 'content-type: application/json' \
  -d @examples/requests/roadmap_cybersecurity_constrained.json

# A validation error (HTTP 422)
curl -s -X POST localhost:8080/v1/recommendations -H 'content-type: application/json' -d '{"profile":{"interests":"web_building"}}'
```

| Example file | Shows |
|---|---|
| `recommend_beginner_programming_ai` | Beginner → Full Stack, AI/ML, Intro to Coding; bridge path |
| `recommend_security_investigator` | Cybersecurity first, matched answers, safety notes |
| `recommend_project_organizer` | Project management |
| `recommend_ai_safety_governance`, `recommend_quantum_curious` | AI Safety and Quantum recommended when the profile supports them |
| `recommend_minimal_interests_only` | `exploratory` status |
| `recommend_insufficient_information` | `insufficient_information` (empty profile) |
| `recommend_constrained_access` | No budget, unreliable internet, phone only; same scores as unconstrained |
| `roadmap_cybersecurity_constrained`, `roadmap_quantum_experienced` | Access-aware ordering; skipping ahead |
| `error_*` | Each error status |

## Extension points (not implemented in V1)

These are designed for, but **do not exist yet**:

- **Feedback on usefulness:** responses include `meta` versions and stable `careerId`s so a future `POST /v1/feedback` can be correlated to the engine/KB version. Collecting feedback requires consent design and storage, which V1 deliberately omits.
- **Comparison of careers:** `GET /v1/careers/{id}` and `factorBreakdown` provide the building blocks.
- **Progress tracking and re-ranking:** `experienceByCareer` and `skillsToDevelop` already move the start stage and scoring; persistent progress needs storage the V1 API does not have.
- **Ghana-specific localisation:** needs local-availability fields in the knowledge base.
- **Evaluation of recommendation quality:** needs real, consented feedback.
