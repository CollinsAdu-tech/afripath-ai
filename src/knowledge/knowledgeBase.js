// Knowledge-base normalisation and validation (pure: no file or network access).
//
// Input : the raw `combined_*.json` collections of the Kareer Pathfinder v0.7 archive.
// Output: ONE internal, consistent shape plus a list of data-quality `issues`.
//
// The raw records have different shapes per career (verified by audit of the archive), e.g.
//   stage name:      `name` | `title`;   stage order: `level` | `stage_order`
//   stage resources: `learning_activities[].resource_id|resource_ids` | `recommended_resource_ids` | `resource_ids`
//   stage summary:   `focus` | `goal`;   stage checkpoints: `checkpoints` | `checkpoint`
//   career title:    `title` | `career_title`
//
// RULES: never invent values. Missing optional fields become null / []. Every irregularity is
// recorded in `kb.issues` instead of being silently "fixed". This module knows nothing about
// students, scoring or HTTP.

export class KnowledgeBaseError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'KnowledgeBaseError';
    this.code = 'KB_INVALID';
    this.issues = issues;
  }
}

export const SUPPORTED_KB_VERSION = '0.7';

const COLLECTIONS = ['careers', 'roadmap_stages', 'resources', 'skills', 'projects', 'communities', 'opportunities'];
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const strList = (v) => arr(v).map(str).filter(Boolean);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------------------
// Resource access classification. Only what the record itself supports; "unknown" otherwise.
// Every resource in v0.7 is `not_independently_verified`, so nothing is ever called plainly "free".
// ---------------------------------------------------------------------------
const CERT_TYPES = new Set(['certification', 'certification_provider', 'professional_certificate', 'certification_path', 'training_and_certification_path', 'cloud_account_and_pricing']);
const VIDEO_TYPES = new Set(['video', 'video_channel', 'video_playlist', 'video_course', 'interactive_video_course']);
const ACCOUNT_TYPES = new Set(['cloud_service', 'cloud_account_and_pricing', 'database_platform', 'database_and_backend_platform', 'deployment_platform', 'security_service']);

// Resource type -> learning format, used ONLY to order resources for a student's preferred format.
// Editorial table; types not listed have no format claim ("unknown"), never a guess.
const FORMAT_BY_TYPE = {
  video: ['video'], video_channel: ['video'], video_playlist: ['video'], video_course: ['video'], interactive_video_course: ['video', 'interactive'],
  interactive_course: ['interactive'], interactive_tutorial: ['interactive'], interactive_text: ['interactive'], interactive_experience: ['interactive'],
  coding_exercises: ['interactive'], gamified_learning: ['interactive'], browser_coding_tool: ['interactive'],
  practice_lab: ['hands_on'], hands_on_lab: ['hands_on'], applied_lab: ['hands_on'], practice_platform: ['hands_on'], guided_projects: ['hands_on'],
  project_challenge: ['hands_on'], challenge_event: ['hands_on'], hackathon_platform: ['hands_on'], competition_platform: ['hands_on'],
  documentation: ['text'], documentation_and_learning: ['text'], tutorial: ['text'], learning_articles: ['text'], reference: ['text'],
  publishing_guide: ['text'], career_guide: ['text'], newsletter: ['text'],
  community: ['community'], community_chat: ['community'], community_event: ['community'], community_program: ['community'],
  community_and_events: ['community'], learning_community: ['community'], programming_community: ['community'], research_community: ['community'],
  professional_community: ['community'], professional_network: ['community'], events_and_opportunities: ['community'], event_and_training: ['community'], conference: ['community'],
};

export const COST_NOTES = Object.freeze({
  may_involve_cost: 'The knowledge base notes this may involve costs or fees. Check current pricing before you start.',
  source_mentions_free: 'The source describes free access, but this has not been independently verified. Check current terms before you start.',
  unknown: 'The knowledge base does not state the cost. Check before you start.',
});

/** Derive access hints for a resource. `cost` is one of may_involve_cost | source_mentions_free | unknown. */
export function classifyResource(r) {
  const note = `${r.sourceNote || ''} ${r.accessNote || ''}`.toLowerCase();
  let cost = 'unknown';
  if (CERT_TYPES.has(r.type) || /(incur|charges|pricing|\bfee|exam cost|paid|payment|subscription)/.test(note)) cost = 'may_involve_cost';
  else if (/(\bfree\b|no cost)/.test(note)) cost = 'source_mentions_free';
  return {
    cost,
    costNote: COST_NOTES[cost],
    bandwidth: VIDEO_TYPES.has(r.type) ? 'heavy_by_type' : 'unknown',
    needsAccountSetup: ACCOUNT_TYPES.has(r.type),
    formats: FORMAT_BY_TYPE[r.type] || [],
  };
}

export const normalizeUrl = (u) => (u ? u.trim().toLowerCase().replace(/\/+$/, '') : null);

/**
 * Build the normalised knowledge base from raw collections.
 * @param {object} raw {careers, roadmap_stages, resources, skills, projects, communities, opportunities, [learning_tracks], [advice]}
 * @returns normalised knowledge base: Maps keyed by id, plus `issues` and `counts`.
 * @throws {KnowledgeBaseError} when the data is missing, empty or structurally unusable.
 */
export function buildKnowledgeBase(raw, { version = SUPPORTED_KB_VERSION } = {}) {
  const issues = [];
  const issue = (severity, code, message, ref) => issues.push({ severity, code, message, ...(ref ? { ref } : {}) });

  if (!isObj(raw)) throw new KnowledgeBaseError('Knowledge base data is missing or is not an object.');
  for (const c of COLLECTIONS) {
    if (!Array.isArray(raw[c])) {
      throw new KnowledgeBaseError(`Knowledge base is invalid: "${c}" must be a list.`, [{ severity: 'error', code: 'KB_NOT_LIST', message: c }]);
    }
  }
  if (raw.careers.length === 0) {
    throw new KnowledgeBaseError('Knowledge base is empty: no career records were found.', [{ severity: 'error', code: 'KB_EMPTY', message: 'careers is empty' }]);
  }

  const dedupe = (list, idField, label) => {
    const seen = new Map();
    for (const rec of list) {
      const id = isObj(rec) ? str(rec[idField]) : null;
      if (!id) { issue('warning', 'MISSING_ID', `A ${label} record has no ${idField}; skipped.`); continue; }
      if (seen.has(id)) { issue('warning', 'DUPLICATE_ID', `Duplicate ${label} id "${id}"; kept the first.`, id); continue; }
      seen.set(id, rec);
    }
    return seen;
  };

  // ---- resources
  const resources = new Map();
  for (const [id, r] of dedupe(raw.resources, 'resource_id', 'resource')) {
    const rec = {
      id, title: str(r.title), provider: str(r.provider), url: str(r.url), type: str(r.resource_type),
      sourceNote: str(r.source_note), accessNote: str(r.access_note), bestFor: str(r.best_for),
      verificationStatus: str(r.verification_status) || 'unverified',
    };
    if (!rec.title) issue('warning', 'RESOURCE_NO_TITLE', `Resource "${id}" has no title.`, id);
    if (!rec.url) issue('info', 'RESOURCE_NO_URL', `Resource "${id}" has no URL; it is shown without a link.`, id);
    rec.access = classifyResource(rec);
    resources.set(id, rec);
  }

  // ---- careers
  const careers = new Map();
  const careerBySource = new Map();
  for (const [id, c] of dedupe(raw.careers, 'career_id', 'career')) {
    const rec = {
      id, title: str(c.title) || str(c.career_title), category: str(c.category), summary: str(c.summary),
      audiences: strList(c.intended_audiences).length ? strList(c.intended_audiences) : strList(c.audience),
      quickStart: strList(c.source_quick_start), usageAdvice: strList(c.roadmap_usage_advice),
      sourceId: str(c.source_id), coreSkillIds: strList(c.core_skill_ids), trackIds: strList(c.learning_track_ids),
      weeklyTimeCommitment: str(c.weekly_time_commitment), setupRequirements: str(c.setup_requirements),
      verificationStatus: str(c.verification_status) || 'unverified',
      // filled in below from the other collections:
      stageIds: [], projectIds: [], skillIds: [], opportunityIds: [], quarantinedProjectIds: [],
      _declaredProjectIds: strList(c.project_ids),
    };
    if (!rec.title) { issue('error', 'CAREER_NO_TITLE', `Career "${id}" has no title; excluded.`, id); continue; }
    if (rec.sourceId) careerBySource.set(rec.sourceId, id);
    careers.set(id, rec);
  }
  if (careers.size === 0) throw new KnowledgeBaseError('Knowledge base has no usable career records.', issues);

  // ---- roadmap stages
  const stages = new Map();
  for (const [id, s] of dedupe(raw.roadmap_stages, 'stage_id', 'roadmap stage')) {
    if (!careers.has(s.career_id)) { issue('error', 'STAGE_UNKNOWN_CAREER', `Stage "${id}" references unknown career "${s.career_id}"; excluded.`, id); continue; }
    const activities = [];
    const resourceIds = [];
    const addRes = (rid) => { if (typeof rid === 'string' && rid && !resourceIds.includes(rid)) resourceIds.push(rid); };
    for (const a of arr(s.learning_activities)) {
      if (!isObj(a)) continue;
      const rids = [a.resource_id, ...arr(a.resource_ids)].filter((x) => typeof x === 'string' && x);
      activities.push({ id: str(a.activity_id), title: str(a.title), type: str(a.activity_type), day: str(a.day), note: str(a.source_note), resourceIds: rids });
      if (rids.length === 0) issue('info', 'ACTIVITY_NO_RESOURCE', `Activity "${a.activity_id}" in stage "${id}" has no resource (a milestone or networking activity).`, id);
      rids.forEach(addRes);
    }
    arr(s.recommended_resource_ids).forEach(addRes);
    arr(s.resource_ids).forEach(addRes);
    for (const rid of resourceIds.filter((x) => !resources.has(x))) issue('error', 'DANGLING_RESOURCE_REF', `Stage "${id}" references missing resource "${rid}"; reference dropped.`, id);
    const known = (rid) => resources.has(rid);
    for (const a of activities) a.resourceIds = a.resourceIds.filter(known);
    stages.set(id, {
      id, careerId: s.career_id,
      order: Number.isFinite(s.level) ? s.level : (Number.isFinite(s.stage_order) ? s.stage_order : null),
      name: str(s.name) || str(s.title),
      durationText: str(s.duration_text) || str(s.source_duration), // shown only as "per source"; never turned into a deadline
      prerequisites: strList(s.prerequisites),                       // free text in the source, not machine-checkable
      focus: str(s.focus) || str(s.goal),
      actions: strList(s.actions),
      weeklyPlan: arr(s.weekly_plan).filter(isObj).map((w) => ({ weeks: str(String(w.weeks ?? '')), goal: str(w.goal), actions: strList(w.actions) })),
      checkpoints: strList(s.checkpoints).length ? strList(s.checkpoints) : strList(Array.isArray(s.checkpoint) ? s.checkpoint : [s.checkpoint]),
      activities, resourceIds: resourceIds.filter(known), communityIds: strList(s.community_ids),
    });
    if (!str(s.name) && !str(s.title)) issue('warning', 'STAGE_NO_NAME', `Stage "${id}" has no name.`, id);
  }
  for (const [cid, c] of careers) {
    const own = [...stages.values()].filter((s) => s.careerId === cid).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.id.localeCompare(b.id));
    c.stageIds = own.map((s) => s.id);
    if (own.length === 0) issue('warning', 'CAREER_NO_STAGES', `Career "${cid}" has no roadmap stages.`, cid);
  }

  // ---- communities
  const communities = new Map();
  for (const [id, m] of dedupe(raw.communities, 'community_id', 'community')) {
    communities.set(id, {
      id, name: str(m.name), url: str(m.url), resourceId: resources.has(m.resource_id) ? m.resource_id : null,
      type: str(m.category) || str(m.community_type), verificationStatus: str(m.verification_status) || 'unverified',
    });
  }
  for (const s of stages.values()) {
    const missing = s.communityIds.filter((x) => !communities.has(x));
    for (const x of missing) issue('warning', 'DANGLING_COMMUNITY_REF', `Stage "${s.id}" references missing community "${x}"; dropped.`, s.id);
    s.communityIds = s.communityIds.filter((x) => communities.has(x));
  }

  // ---- skills (linked to a career via core_skill_ids, else via the shared source_id)
  const skills = new Map();
  for (const [id, k] of dedupe(raw.skills, 'skill_id', 'skill')) {
    let careerId = [...careers.values()].find((c) => c.coreSkillIds.includes(id))?.id || null;
    let linkedBy = careerId ? 'career.core_skill_ids' : null;
    if (!careerId && careerBySource.has(k.source_id)) { careerId = careerBySource.get(k.source_id); linkedBy = 'source_id'; }
    if (!careerId) issue('info', 'SKILL_UNLINKED', `Skill "${id}" could not be linked to a career.`, id);
    skills.set(id, { id, name: str(k.name), level: str(k.level), description: str(k.description), evidence: str(k.evidence), careerId, linkedBy });
  }

  // ---- projects
  const projects = new Map();
  for (const [id, p] of dedupe(raw.projects, 'project_id', 'project')) {
    let careerId = null; let linkedBy = null; let quarantined = false;
    if (p.career_id && careers.has(p.career_id)) { careerId = p.career_id; linkedBy = 'project.career_id'; }
    else {
      const owner = [...careers.values()].find((c) => c._declaredProjectIds.includes(id));
      if (owner) { careerId = owner.id; linkedBy = 'career.project_ids'; }
      else if (p.source_fit === 'review_required_category_mismatch') {
        // The archive itself flags these as attached to the wrong category. We do not guess a new
        // category: they are held back until the data is corrected.
        quarantined = true;
        issue('warning', 'PROJECT_CATEGORY_MISMATCH', `Project "${id}" is flagged "review_required_category_mismatch" (source ${p.source_id}); it is not attached to any career until the data is corrected.`, id);
      } else if (careerBySource.has(p.source_id)) { careerId = careerBySource.get(p.source_id); linkedBy = 'source_id'; }
    }
    if (!careerId && !quarantined) issue('info', 'PROJECT_UNLINKED', `Project "${id}" could not be linked to a career.`, id);
    const rawSkills = strList(p.skills);
    projects.set(id, {
      id, title: str(p.title), description: str(p.description), type: str(p.project_type),
      difficulty: p.difficulty && p.difficulty !== 'not_specified' ? str(p.difficulty) : null,
      deliverable: str(p.expected_deliverable), safetyNote: str(p.safety_note),
      notes: strList(Array.isArray(p.notes) ? p.notes : [p.notes]),
      // Older projects reference skill ids; newer ones use plain skill names. Keep what the record says.
      skillRefs: rawSkills.map((x) => (skills.has(x) ? { id: x, name: skills.get(x).name } : { id: null, name: x })),
      sourceId: str(p.source_id), careerId, linkedBy, quarantined,
    });
    if (!str(p.title)) issue('warning', 'PROJECT_NO_TITLE', `Project "${id}" has no title.`, id);
  }
  const unresolvedSkillRefs = [...projects.values()].filter((p) => p.skillRefs.some((x) => !x.id)).length;
  if (unresolvedSkillRefs) issue('info', 'PROJECT_SKILLS_BY_NAME', `${unresolvedSkillRefs} projects list skills by plain name rather than skill_id; shown as text, not linked to skill records.`);

  // ---- opportunities (leads only; no application status or deadline exists in the data)
  const opportunities = new Map();
  for (const [id, o] of dedupe(raw.opportunities, 'opportunity_id', 'opportunity')) {
    opportunities.set(id, {
      id, title: str(o.title), type: str(o.opportunity_type), url: str(o.url),
      eligibility: str(o.eligibility) || str(o.eligibility_note), notes: str(o.notes),
      resourceId: resources.has(o.resource_id) ? o.resource_id : null,
      careerId: careerBySource.get(o.source_id) || null,
      status: 'unverified_lead', // NEVER assumed open; the dataset has no verified dates
      verificationStatus: str(o.verification_status) || 'unverified',
    });
  }

  // ---- learning tracks (Data Careers)
  const learningTracks = new Map();
  for (const [id, t] of dedupe(arr(raw.learning_tracks), 'track_id', 'learning track')) {
    learningTracks.set(id, {
      id, title: str(t.title), area: str(t.track_area), summary: str(t.summary), provider: str(t.provider),
      resourceId: resources.has(t.catalog_resource_id) ? t.catalog_resource_id : null, note: str(t.note),
      verificationStatus: str(t.verification_status) || 'unverified',
    });
  }

  // ---- advice (shape differs by career: a list of {advice_id,text} or an object of string lists)
  const advice = new Map();
  if (isObj(raw.advice)) {
    for (const [key, val] of Object.entries(raw.advice)) {
      const cid = careers.has(`career_${key}`) ? `career_${key}` : null;
      if (!cid) { issue('info', 'ADVICE_UNLINKED', `Advice group "${key}" does not match a career id; ignored.`, key); continue; }
      const items = [];
      if (Array.isArray(val)) for (const a of val) { if (isObj(a) && str(a.text)) items.push({ text: str(a.text), type: str(a.advice_type) || 'guidance' }); }
      else if (isObj(val)) for (const [type, list] of Object.entries(val)) if (Array.isArray(list)) for (const t of list) if (str(t)) items.push({ text: str(t), type });
      advice.set(cid, items);
    }
  }

  // ---- link children to careers
  for (const p of projects.values()) {
    if (p.quarantined) { const owner = careerBySource.get(p.sourceId); if (owner) careers.get(owner).quarantinedProjectIds.push(p.id); }
    else if (p.careerId) careers.get(p.careerId).projectIds.push(p.id);
  }
  for (const k of skills.values()) if (k.careerId) careers.get(k.careerId).skillIds.push(k.id);
  for (const o of opportunities.values()) if (o.careerId) careers.get(o.careerId).opportunityIds.push(o.id);
  for (const c of careers.values()) {
    const missing = c.trackIds.filter((t) => !learningTracks.has(t));
    for (const t of missing) issue('warning', 'DANGLING_TRACK_REF', `Career "${c.id}" references missing learning track "${t}"; dropped.`, c.id);
    c.trackIds = c.trackIds.filter((t) => learningTracks.has(t));
    delete c._declaredProjectIds;
  }

  // ---- informational reports
  const byUrl = new Map();
  for (const r of resources.values()) { const u = normalizeUrl(r.url); if (u) byUrl.set(u, [...(byUrl.get(u) || []), r.id]); }
  for (const [u, ids] of byUrl) if (ids.length > 1) issue('info', 'DUPLICATE_URL', `Resources ${ids.join(', ')} share the URL ${u}; recommendations de-duplicate by URL.`);
  const used = new Set([...stages.values()].flatMap((s) => s.resourceIds));
  const orphans = [...resources.keys()].filter((id) => !used.has(id));
  if (orphans.length) issue('info', 'RESOURCES_NOT_IN_ANY_STAGE', `${orphans.length} resources are not referenced by any roadmap stage and are therefore never recommended: ${orphans.join(', ')}.`);
  const noUrl = [...opportunities.values()].filter((o) => !o.url).length;
  if (noUrl) issue('info', 'OPPORTUNITY_NO_URL', `${noUrl} opportunity leads have no URL.`);

  return {
    version, careers, stages, resources, skills, projects, communities, opportunities, learningTracks, advice,
    issues,
    counts: {
      careers: careers.size, stages: stages.size, resources: resources.size, skills: skills.size, projects: projects.size,
      communities: communities.size, opportunities: opportunities.size, learningTracks: learningTracks.size,
    },
  };
}
