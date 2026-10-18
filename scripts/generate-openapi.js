// Generates docs/openapi.json (OpenAPI 3.1) from the same option lists and config the engine validates with,
// so the contract cannot drift from the code. Run `npm run openapi` after changing options or schemas.
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUESTIONNAIRE_OPTIONS as O, CONFIG, ENGINE_VERSION } from '../src/engine/index.js';

const ids = (list) => list.map((o) => (typeof o === 'string' ? o : o.id));
const arrayOf = (list, description) => ({ type: 'array', maxItems: CONFIG.limits.maxArrayAnswers, uniqueItems: true, items: { type: 'string', enum: ids(list) }, description });
const enumOf = (list, description) => ({ type: ['string', 'null'], enum: [...ids(list), null], description });
const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const obj = (properties, required = [], extra = {}) => ({ type: 'object', properties, required, ...extra });
const errorResponse = (description) => ({ description, content: { 'application/json': { schema: ref('ErrorResponse') } } });
const json = (schema, description = 'OK') => ({ description, content: { 'application/json': { schema } } });

const resourceRef = obj({ resourceId: { type: 'string' }, title: { type: 'string' }, url: { type: ['string', 'null'], description: 'Copied from the knowledge base; null when none was supplied. Never constructed.' } }, ['resourceId', 'title', 'url']);
const flag = obj({ code: { type: 'string', enum: ['check_cost', 'data_heavy', 'needs_account_setup', 'matches_preferred_format'] }, message: { type: 'string' } }, ['code', 'message']);
const item = obj({ id: { type: 'string' }, label: { type: 'string' } }, ['id', 'label']);
const warning = obj({ field: { type: 'string' }, code: { type: 'string' }, message: { type: 'string' } }, ['field', 'code', 'message']);

const schemas = {
  StudentProfile: obj({
    interests: arrayOf(O.interests, 'Topics the student is interested in (multi-select).'),
    currentSkills: arrayOf(O.strengths, 'Strengths/skills the student already has.'),
    skillsToDevelop: arrayOf(O.strengths, 'Skills the student would like to develop. Kept separate from currentSkills.'),
    workStyles: arrayOf(O.workStyles, 'Preferred ways of working.'),
    goals: arrayOf(O.goals, 'What the student hopes to achieve.'),
    subjects: arrayOf(O.subjects, 'Subjects studied.'),
    mathConfidence: { type: ['integer', 'string', 'null'], minimum: 1, maximum: 5, description: 'Confidence in maths, 1 (low) to 5 (high). Numeric strings are accepted.' },
    programmingExperience: enumOf(O.programmingExperience, 'Prior programming experience.'),
    scienceBackground: enumOf(O.scienceBackground, 'Science background.'),
    educationLevel: enumOf(O.educationLevel, 'Accepted and echoed for the UI; not used in scoring.'),
    budget: enumOf(O.budget, 'Learning budget. NEVER affects the fit score; shapes resource ordering and cost warnings only.'),
    internet: enumOf(O.internet, 'Internet reliability. NEVER affects the fit score.'),
    device: enumOf(O.device, 'Device limits. NEVER affects the fit score.'),
    weeklyHours: { type: ['number', 'string', 'null'], minimum: 0, maximum: 80, description: 'Study hours per week. NEVER affects the fit score; drives the pacing suggestion.' },
    learningFormats: arrayOf(O.learningFormats, 'Preferred learning formats. Reorders resources; never removes any.'),
    experienceByCareer: { type: 'object', additionalProperties: { type: 'string', enum: ['none', 'some', 'solid'] }, description: 'Optional: prior experience per career id, so a returning student can start further along.' },
  }, [], { description: 'Every field is optional. A skipped question is treated as "not answered", never as lack of ability or interest. Unknown option ids and unknown fields are ignored with a warning; wrong types are rejected (422). Do not send personal information.' }),
  RecommendationRequest: obj({
    profile: ref('StudentProfile'),
    options: obj({ maxResults: { type: 'integer', minimum: 1, maximum: 3, default: 3 } }),
  }, ['profile']),
  RoadmapRequest: obj({ careerId: { type: 'string', description: 'A careerId from GET /v1/careers.' }, profile: ref('StudentProfile') }, ['careerId']),
  Warning: warning,
  Fit: obj({
    kind: { const: 'heuristic_fit_score' }, scale: { const: '0-100' }, score: { type: 'number', minimum: 0, maximum: 100 },
    label: { type: 'string' }, labelId: { type: 'string', enum: [...CONFIG.fitBands.map((b) => b.id), CONFIG.exploratoryBand.id] },
    basis: { type: 'string', enum: ['broad_answers', 'limited_answers'] }, disclaimer: { type: 'string' },
  }, ['kind', 'scale', 'score', 'label', 'labelId', 'basis', 'disclaimer'], { description: 'A heuristic fit between the answers and the career, NOT a probability of success. Show the label and disclaimer with the number.' }),
  FactorBreakdown: obj({
    factor: { type: 'string', enum: Object.keys(CONFIG.weights) }, label: { type: 'string' }, status: { type: 'string', enum: ['evaluated', 'not_evaluated'] },
    weightPercent: { type: 'number', description: 'Effective weight after renormalising over answered factors. Sums to 100 across evaluated factors.' },
    score: { type: ['number', 'null'], minimum: 0, maximum: 100 }, contributionPoints: { type: 'number', description: 'Points this factor adds. Contributions sum to fit.score (within rounding).' },
  }, ['factor', 'label', 'status', 'weightPercent', 'score', 'contributionPoints']),
  ResourceRef: resourceRef,
  Resource: obj({
    resourceId: { type: 'string' }, title: { type: 'string' }, provider: { type: ['string', 'null'] }, type: { type: ['string', 'null'] }, url: { type: ['string', 'null'] }, bestFor: { type: ['string', 'null'] },
    access: obj({ cost: { type: 'string', enum: ['may_involve_cost', 'source_mentions_free', 'unknown'] }, costNote: { type: 'string', description: 'Always includes a verification caveat. Display it next to any cost hint.' },
      dataUse: { type: 'string', enum: ['video_heavy', 'not_stated'] }, needsAccountSetup: { type: 'boolean' }, formats: { type: 'array', items: { type: 'string' } } }),
    notes: { type: 'array', items: { type: 'string' }, description: 'Source notes verbatim.' },
    verificationStatus: { type: 'string', description: 'From the knowledge base. Every v0.7 resource is not independently verified.' },
    linkStatus: { type: 'string', enum: ['unverified_link', 'no_link_provided'] },
    flags: { type: 'array', items: flag },
  }, ['resourceId', 'title', 'url', 'access', 'verificationStatus', 'linkStatus', 'flags']),
  Project: obj({
    projectId: { type: 'string' }, title: { type: 'string' }, description: { type: ['string', 'null'] }, type: { type: ['string', 'null'] },
    difficulty: { type: 'string', enum: ['beginner', 'intermediate', 'not_specified'] }, deliverable: { type: ['string', 'null'] },
    safetyNote: { type: ['string', 'null'], description: 'Show it. Present on security projects (authorised testing only).' }, notes: { type: 'array', items: { type: 'string' } }, skills: { type: 'array', items: { type: 'string' } },
  }, ['projectId', 'title', 'difficulty']),
  FirstAction: obj({ text: { type: 'string' }, stageId: { type: 'string' }, activityId: { type: ['string', 'null'] }, resource: { oneOf: [ref('ResourceRef'), { type: 'null' }] }, flags: { type: 'array', items: flag }, why: { type: 'string' } }, ['text', 'stageId', 'resource', 'flags', 'why']),
  AccessConsideration: obj({ code: { type: 'string', enum: ['cost_may_apply', 'data_use', 'account_setup', 'device'] }, message: { type: 'string' }, resourceIds: { type: 'array', items: { type: 'string' } } }, ['code', 'message']),
  StartingPoint: obj({ stageId: { type: 'string' }, order: { type: ['integer', 'null'] }, name: { type: 'string' }, reason: { type: 'string' } }, ['stageId', 'name', 'reason']),
  PrerequisiteGuidance: obj({ dimension: { type: 'string', enum: ['math', 'programming', 'science'] }, label: { type: 'string' }, yourLevel: { type: 'string' }, helpfulLevel: { type: 'string' }, message: { type: 'string' } }, ['dimension', 'label', 'message']),
  BridgePath: obj({ careerId: { type: 'string' }, title: { type: 'string' }, summary: { type: ['string', 'null'] }, setupRequirements: { type: ['string', 'null'] }, why: { type: 'string' } }, ['careerId', 'title', 'why']),
  Recommendation: obj({
    rank: { type: 'integer', minimum: 1, maximum: 3 }, careerId: { type: 'string' }, title: { type: 'string' }, category: { type: ['string', 'null'] }, summary: { type: ['string', 'null'] },
    fit: ref('Fit'),
    explanation: obj({ headline: { type: 'string' }, summary: { type: 'string' }, reasons: { type: 'array', items: obj({ factor: { type: 'string' }, text: { type: 'string' }, matched: { type: 'array', items: item } }, ['factor', 'text', 'matched']) }, notes: { type: 'array', items: { type: 'string' } } }, ['headline', 'summary', 'reasons', 'notes']),
    matched: obj({ interests: { type: 'array', items: item }, strengths: { type: 'array', items: item }, skillsToDevelop: { type: 'array', items: item }, workStyles: { type: 'array', items: item }, goals: { type: 'array', items: item }, subjects: { type: 'array', items: item } }),
    factorBreakdown: { type: 'array', items: ref('FactorBreakdown') },
    careerBasis: { type: 'array', items: { type: 'string' }, description: 'Knowledge-base evidence behind the career mapping.' },
    skillGaps: obj({
      skillsToBuild: { type: 'array', items: obj({ skillId: { type: 'string' }, name: { type: 'string' }, level: { type: ['string', 'null'] }, evidence: { type: ['string', 'null'] } }) },
      strengthsToBuild: { type: 'array', items: item }, prerequisites: { type: 'array', items: ref('PrerequisiteGuidance') }, bridgePath: { oneOf: [ref('BridgePath'), { type: 'null' }] },
    }),
    roadmap: obj({ startingPoint: ref('StartingPoint'), stages: { type: 'array', items: obj({ stageId: { type: 'string' }, order: { type: ['integer', 'null'] }, name: { type: 'string' }, status: { type: 'string', enum: ['start_here', 'upcoming', 'covered_by_your_answers'] }, durationPerSource: { type: ['string', 'null'] } }) } }),
    firstStep: { oneOf: [ref('FirstAction'), { type: 'null' }] },
    startingResources: { type: 'array', items: ref('Resource') }, projects: { type: 'array', items: ref('Project') },
    accessConsiderations: { type: 'array', items: ref('AccessConsideration') }, knowledgeGaps: { type: 'array', items: { type: 'string' } },
    roadmapRequest: obj({ method: { const: 'POST' }, path: { const: '/v1/roadmaps' }, body: obj({ careerId: { type: 'string' } }) }),
  }, ['rank', 'careerId', 'title', 'fit', 'explanation', 'matched', 'factorBreakdown', 'skillGaps', 'roadmap', 'firstStep', 'startingResources', 'projects', 'accessConsiderations', 'knowledgeGaps', 'roadmapRequest']),
  CareerSummary: obj({ careerId: { type: 'string' }, title: { type: 'string' }, category: { type: ['string', 'null'] }, summary: { type: ['string', 'null'] } }, ['careerId', 'title']),
  Meta: obj({ engineVersion: { type: 'string' }, knowledgeBaseVersion: { type: 'string' }, taxonomyVersion: { type: 'string' }, scoringModel: { type: 'string' }, weights: { type: 'object', additionalProperties: { type: 'number' } } }, ['engineVersion', 'knowledgeBaseVersion', 'taxonomyVersion', 'scoringModel']),
  RecommendationResponse: obj({
    status: { type: 'string', enum: ['ok', 'exploratory', 'insufficient_information'], description: 'ok: firm enough to show. exploratory: show as an early signal. insufficient_information: no ranking; ask the questions in missingInformation.' },
    message: { type: 'string' }, scoreNote: { type: 'string' },
    recommendations: { type: 'array', maxItems: 3, items: ref('Recommendation') },
    explore: obj({ otherCareers: { type: 'array', items: { allOf: [ref('CareerSummary'), obj({ fitScore: { type: ['number', 'null'] } })] } }, hint: { type: 'string' } }, ['otherCareers', 'hint']),
    evidence: obj({ level: { type: 'string', enum: ['insufficient', 'exploratory', 'sufficient'] }, answeredFactors: { type: 'array', items: { type: 'string' } }, share: { type: 'number', description: 'Percent of total factor weight the answers could support.' } }),
    missingInformation: { type: 'array', items: obj({ factor: { type: 'string' }, label: { type: 'string' }, fields: { type: 'array', items: { type: 'string' } }, question: { type: 'string' } }), description: 'Unanswered factors, most influential first.' },
    notes: { type: 'array', items: { type: 'string' } }, warnings: { type: 'array', items: warning }, meta: ref('Meta'),
  }, ['status', 'message', 'scoreNote', 'recommendations', 'explore', 'evidence', 'missingInformation', 'notes', 'warnings', 'meta']),
  Stage: obj({
    stageId: { type: 'string' }, order: { type: ['integer', 'null'] }, name: { type: 'string' }, status: { type: 'string', enum: ['start_here', 'upcoming', 'covered_by_your_answers'] },
    durationPerSource: { type: ['string', 'null'], description: 'Exactly as written by the source. Not a deadline or estimate.' },
    prerequisitesPerSource: { type: 'array', items: { type: 'string' }, description: 'Free text from the source; not machine-checked.' },
    focus: { type: ['string', 'null'] }, actions: { type: 'array', items: { type: 'string' } }, weeklyPlanPerSource: { type: 'array', items: obj({ weeks: { type: ['string', 'null'] }, goal: { type: ['string', 'null'] }, actions: { type: 'array', items: { type: 'string' } } }) },
    checkpoints: { type: 'array', items: { type: 'string' } },
    activities: { type: 'array', description: 'The stage\'s activities in source order. Their resources may have been introduced in an earlier stage (each resource is listed once per plan).', items: obj({ activityId: { type: ['string', 'null'] }, title: { type: ['string', 'null'] }, type: { type: ['string', 'null'] }, day: { type: ['string', 'null'] }, note: { type: ['string', 'null'] }, resources: { type: 'array', items: ref('ResourceRef') } }) },
    resources: { type: 'array', items: ref('Resource'), description: 'Resources introduced in this stage, ordered for the student\'s access needs. Unique across the whole plan.' },
    communities: { type: 'array', items: obj({ communityId: { type: 'string' }, name: { type: ['string', 'null'] }, url: { type: ['string', 'null'] }, type: { type: ['string', 'null'] }, verificationStatus: { type: 'string' } }) },
    gaps: { type: 'array', items: { type: 'string' } },
  }, ['stageId', 'name', 'status', 'activities', 'resources', 'communities', 'gaps']),
  RoadmapResponse: obj({
    career: ref('CareerSummary'), startingPoint: { oneOf: [ref('StartingPoint'), { type: 'null' }] }, firstAction: { oneOf: [ref('FirstAction'), { type: 'null' }] },
    pacing: { oneOf: [obj({ weeklyHours: { type: 'number' }, suggestedItemsPerWeek: { type: 'integer' }, firstWeek: { type: 'array', items: obj({ title: { type: 'string' }, resource: ref('ResourceRef') }) }, note: { type: 'string' } }), { type: 'null' }], description: 'Null unless weeklyHours was supplied.' },
    stages: { type: 'array', items: ref('Stage') },
    prerequisiteGuidance: obj({ prerequisites: { type: 'array', items: ref('PrerequisiteGuidance') }, bridgePath: { oneOf: [ref('BridgePath'), { type: 'null' }] } }),
    projects: { type: 'array', items: ref('Project') },
    learningTracks: { type: 'array', items: obj({ trackId: { type: 'string' }, title: { type: 'string' }, area: { type: ['string', 'null'] }, summary: { type: ['string', 'null'] }, provider: { type: ['string', 'null'] }, catalog: { oneOf: [ref('ResourceRef'), { type: 'null' }] }, note: { type: ['string', 'null'] }, verificationStatus: { type: 'string' } }) },
    opportunityLeads: { type: 'array', description: 'Leads only. status is always unverified_lead: never present one as open or funded.', items: obj({ opportunityId: { type: 'string' }, title: { type: 'string' }, type: { type: ['string', 'null'] }, url: { type: ['string', 'null'] }, eligibility: { type: ['string', 'null'] }, notes: { type: ['string', 'null'] }, status: { const: 'unverified_lead' }, statusNote: { type: 'string' }, verificationStatus: { type: 'string' } }, ['opportunityId', 'title', 'status', 'statusNote']) },
    guidance: { type: 'array', items: obj({ text: { type: 'string' }, type: { type: 'string' } }) },
    accessConsiderations: { type: 'array', items: ref('AccessConsideration') }, knowledgeGaps: { type: 'array', items: { type: 'string' } }, caveats: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: warning }, meta: ref('Meta'),
  }, ['career', 'startingPoint', 'firstAction', 'pacing', 'stages', 'prerequisiteGuidance', 'projects', 'learningTracks', 'opportunityLeads', 'guidance', 'accessConsiderations', 'knowledgeGaps', 'caveats', 'warnings', 'meta']),
  ErrorResponse: obj({ error: obj({
    code: { type: 'string', enum: ['INVALID_JSON', 'VALIDATION_ERROR', 'CAREER_NOT_FOUND', 'NOT_FOUND', 'METHOD_NOT_ALLOWED', 'PAYLOAD_TOO_LARGE', 'UNSUPPORTED_MEDIA_TYPE', 'KNOWLEDGE_BASE_UNAVAILABLE', 'INTERNAL_ERROR'] },
    message: { type: 'string' }, details: { type: 'array', items: warning }, requestId: { type: 'string' },
  }, ['code', 'message', 'requestId']) }, ['error']),
};

const errs = {
  400: errorResponse('INVALID_JSON: the body is not valid JSON.'),
  404: errorResponse('NOT_FOUND or CAREER_NOT_FOUND.'),
  405: errorResponse('METHOD_NOT_ALLOWED. The Allow header lists valid methods.'),
  413: errorResponse('PAYLOAD_TOO_LARGE (default limit 32 KB).'),
  415: errorResponse('UNSUPPORTED_MEDIA_TYPE: send Content-Type: application/json.'),
  422: errorResponse('VALIDATION_ERROR: wrong types or out-of-range values. See error.details[].field.'),
  503: errorResponse('KNOWLEDGE_BASE_UNAVAILABLE: the knowledge base failed to load.'),
};
const pick = (...codes) => Object.fromEntries(codes.map((c) => [c, errs[c]]));

const doc = {
  openapi: '3.1.0',
  info: {
    title: 'Kareer Pathfinder AI Recommendation Engine API', version: ENGINE_VERSION,
    description: 'Stateless, deterministic career-recommendation API. Frontend-agnostic: plain JSON over HTTP. No authentication, no database, no personal data stored. Scores are heuristic fit scores, not predictions of success. See docs/API.md for integration notes.',
  },
  servers: [{ url: 'http://localhost:8080', description: 'Local default (PORT env var)' }],
  tags: [{ name: 'Engine', description: 'Recommendation and roadmap computation.' }, { name: 'Catalogue', description: 'Questionnaire options and career listings.' }, { name: 'Operations', description: 'Health and version information.' }],
  paths: {
    '/health': { get: { tags: ['Operations'], operationId: 'getHealth', summary: 'Liveness and knowledge-base status', description: 'Use as the deployment health check. 200 when the knowledge base is loaded; 503 when it failed to load.',
      responses: { 200: json(obj({ status: { const: 'ok' }, service: { type: 'string' }, engineVersion: { type: 'string' }, knowledgeBase: obj({ loaded: { const: true }, version: { type: 'string' }, counts: { type: 'object', additionalProperties: { type: 'integer' } } }), uptimeSeconds: { type: 'integer' } }, ['status'])),
        503: json(obj({ status: { const: 'unavailable' }, service: { type: 'string' }, knowledgeBase: obj({ loaded: { const: false }, error: { type: 'string' } }) }, ['status']), 'Knowledge base failed to load.') } } },
    '/v1/meta': { get: { tags: ['Operations'], operationId: 'getMeta', summary: 'Engine, knowledge-base and taxonomy versions, factor weights', responses: { 200: json({ type: 'object' }), ...pick(503) } } },
    '/v1/options': { get: { tags: ['Catalogue'], operationId: 'getOptions', summary: 'Questionnaire option ids and labels', description: 'Everything a frontend needs to build the questionnaire. Send the `id` values back in the profile.',
      responses: { 200: json(obj({ options: { type: 'object' }, factorWeights: { type: 'object' }, meta: ref('Meta') })), ...pick(503) } } },
    '/v1/careers': { get: { tags: ['Catalogue'], operationId: 'listCareers', summary: 'List every career path', responses: { 200: json(obj({ careers: { type: 'array', items: { allOf: [ref('CareerSummary'), obj({ stageCount: { type: 'integer' }, projectCount: { type: 'integer' }, scored: { type: 'boolean' } })] } }, meta: ref('Meta') })), ...pick(503) } } },
    '/v1/careers/{careerId}': { get: { tags: ['Catalogue'], operationId: 'getCareer', summary: 'One career path', parameters: [{ name: 'careerId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: json({ type: 'object' }), ...pick(404, 503) } } },
    '/v1/recommendations': { post: { tags: ['Engine'], operationId: 'recommend', summary: 'Top career paths for a student profile', description: 'Deterministic: identical input and knowledge base give identical output. An empty profile is valid and returns status `insufficient_information` with HTTP 200.',
      requestBody: { required: true, content: { 'application/json': { schema: ref('RecommendationRequest'), example: { profile: { interests: ['security_investigation'], currentSkills: ['analytical_thinking'], workStyles: ['investigating'], goals: ['protect_people_orgs'], budget: 'none', weeklyHours: 3 } } } } },
      responses: { 200: json(ref('RecommendationResponse')), ...pick(400, 405, 413, 415, 422, 503) } } },
    '/v1/roadmaps': { post: { tags: ['Engine'], operationId: 'roadmap', summary: 'Personalised learning plan for one career', description: 'Built from the real roadmap records. The profile is optional; without it the plan starts at stage 1 with no access adjustments.',
      requestBody: { required: true, content: { 'application/json': { schema: ref('RoadmapRequest'), example: { careerId: 'career_cybersecurity', profile: { budget: 'none', internet: 'limited', weeklyHours: 4 } } } } },
      responses: { 200: json(ref('RoadmapResponse')), ...pick(400, 404, 405, 413, 415, 422, 503) } } },
  },
  components: { schemas },
};
await writeFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'openapi.json'), JSON.stringify(doc, null, 2) + '\n');
console.log(`Wrote docs/openapi.json (${Object.keys(doc.paths).length} paths, ${Object.keys(schemas).length} schemas)`);
