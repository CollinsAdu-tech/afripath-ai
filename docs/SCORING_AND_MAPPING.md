# Scoring model and career mapping

Everything numeric lives in two files: **`src/engine/config.js`** (weights, blends, thresholds) and **`src/engine/taxonomy.js`** (career mapping). Nothing else hard-codes a weight (a test enforces this).

## The formula

For each career `c`, over the factors `f` that can be evaluated for this student:

```
fitScore(c) = 100 × Σ ( weight_f × subscore_f(c) ) / Σ ( weight_f )
```

| Factor | Spec weight | Sub-score (0..1) comes from |
|---|---|---|
| Interests | 35% | The student's `interests` vs the career's interest affinities |
| Strengths and skills | 25% | `currentSkills` (70%) and `skillsToDevelop` (30%) vs the career's strength affinities. Only one list given → used alone |
| Work style | 15% | `workStyles` vs the career's work-style affinities |
| Academic preparation | 15% | `subjects` vs subject affinities (50%) and preparation levels (50%) |
| Goals | 10% | `goals` vs the career's goal affinities |

**Renormalisation.** A factor is evaluated only if the student answered it *and* the career has a mapping for it. Skipped factors are dropped and the remaining weights are rescaled to sum to 1. The response shows the effective `weightPercent` and `contributionPoints` per factor; contributions add up to `fit.score`. Skipping a question is therefore never read as "no interest" or "no ability".

**Several selections.** Affinity of a set of selected options = `0.5 × mean + 0.5 × best` (`config.selectionBlend`). The mean rewards overall alignment; the best-match term stops one strong fit being drowned out by unrelated extra selections.

**Academic preparation is guidance, not a barrier.** For each of maths / programming / science that the student answered, `fit = min(1, have / need)` and the dimension sub-score is `0.5 + 0.5 × fit` (`config.prepGapFloor = 0.5`). With a 15% weight, even a total gap moves a score by at most about 7.5 points (a test asserts this), and gaps feed *prerequisite guidance* and the roadmap, not exclusion. Levels use a 0–3 scale (none, some, comfortable, strong); `mathConfidence` 1–5 maps to 0,1,1,2,3.

**Foundation paths.** Careers flagged `foundationPath: true` (Intro to Coding) get a *redundancy* sub-score for the programming dimension instead (`none 1, some 1, comfortable 0.6, strong 0.3`): an experienced coder is told the intro path may be redundant, not that they lack ability.

**What never enters scoring:** budget, internet, device, weekly hours, learning formats, education level, popularity, number of resources. Tests prove identical scores with and without constraints, and with a career's resources removed.

## Ranking and status

1. Careers are sorted by score; ties (to 6 decimals) break by career id, so output is deterministic.
2. Evidence is the share of total spec weight the answers could support:
   - below 25%, or below 40% with neither interests nor strengths → **`insufficient_information`** (no ranking; asks for more, highest-weight factor first)
   - below 50% → **`exploratory`** (labelled `early_signal`)
   - otherwise → **`ok`**
3. Up to 3 careers with score ≥ 40 (`minMeaningfulScore`) are returned. If none reach 40, the closest three are returned as `exploratory`.
4. Labels: ≥ 75 strong, ≥ 60 good, below that "some alignment". These bands are editorial wording, not statistical confidence.
5. If the student chose ≥ 6 interests, a note says the choice leaves little to separate the paths.

Because renormalisation makes sparse answers produce extreme numbers (one interest can score 100), exploratory results **never** use the strong/good labels.

## The career taxonomy (`taxonomy.js`)

**Why it exists.** The v0.7 knowledge base has *no field* saying which interests, strengths, work styles or goals suit a career (verified against all 9 career records). Matching therefore needs an explicit, reviewable mapping.

**What it is.** An *editorial judgement*, not statistics. For each career: affinities from 0 (unrelated) to 1 (core fit) for every questionnaire option, plus `prep` levels and `evidence` strings quoting the KB records (summaries, audiences, skills, projects, Level 1 resources) that justify the numbers. Options a career has no entry for are *unknown* (excluded), not zero. The taxonomy has **not** been validated with students or educators; review it with them before treating it as more than a documented starting point.

`prep` means *helpful preparation for later stages*, not an entry requirement: the KB documents every career's first stage as beginner-friendly.

### Change a weight or threshold

1. Edit the value in `src/engine/config.js` (weights stay relative; they are renormalised).
2. `npm test`. Tests pinning the spec weights (`the weights in the shipped config are exactly the product spec`) and scenario rankings will tell you what moved. If the change is intentional, update those tests with the new decision.
3. `npm run examples` (refresh documented responses) and `npm run openapi` if enum/limit values changed.
4. Bump `ENGINE_VERSION` in `config.js`.

### Change a career mapping

1. Edit that career's entry in `taxonomy.js`. Keep a number only if you can point to evidence; add or update the `evidence` strings.
2. Bump `TAXONOMY_VERSION`.
3. `npm test` (the structural check `validateTaxonomy` runs when the engine is built and rejects missing options, values outside 0..1 or empty evidence), then `npm run examples`.

### Add a career (new KB version)

1. Add the career's records to the KB files; run `npm run data-quality`.
2. Add a taxonomy entry with the **same `career_id`** (all 9 option groups, `prep`, `evidence`). Until then the engine reports `NO_TAXONOMY` and does not score the career (it still appears in `GET /v1/careers` with `scored:false`).
3. `npm test`, `npm run examples`.

### Add a questionnaire option

Add it in `src/engine/options.js` (the single source for validation, `GET /v1/options` and the OpenAPI enums), add its affinity to every career in `taxonomy.js` (and the count in `validateTaxonomy`), then `npm run openapi && npm run examples && npm test`.

## Roadmap personalisation rules

- Stages, resources, projects, communities and opportunities come **only** from the KB records; links are copied, never built.
- **Starting stage:** stage 1 for everyone unless `experienceByCareer` says `some` (stage 2) or `solid` (stage 3). Earlier stages stay available.
- **Resource ordering within a stage** (never removal): (1) when budget is `none`/`low`, items the KB notes may involve cost go last; (2) when internet is `limited`/`unreliable`, video-type items go later; (3) preferred formats first; (4) otherwise KB order. Stages with a day-by-day schedule keep their source order.
- **De-duplication:** a resource appears once per plan (by id, then by normalised URL); activities keep their references.
- **Projects:** easiest first for beginners (by the KB's own `difficulty`), hardest first for experienced students.
- **Durations** are shown as the source's text ("per source"); nothing is converted to a deadline. **Pacing** is a count of items per week derived from `weeklyHours` and is labelled a suggestion.
- **Gaps are stated:** stages without resources, absent projects, projects not linked to stages, no maths resources, and no device requirements.
- **Safe wording:** nothing is called free, verified, open or funded; opportunity status is always `unverified_lead`.

## Reproducibility

Tests use only synthetic students (`examples/requests/*.json` and a seeded pseudo-random generator). The engine has no clock, randomness or environment access (enforced by an architecture test).
