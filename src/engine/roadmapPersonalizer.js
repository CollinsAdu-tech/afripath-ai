// Builds a personalised learning plan from the REAL roadmap records of the knowledge base.
//
// What personalisation may do:  choose the starting stage, order resources, flag access barriers,
//                               suggest pacing, order projects by difficulty, explain gaps.
// What it may NOT do:           invent stages, resources, links, durations, deadlines, prices,
//                               eligibility or opportunity status; or change a career's fit score.
//
// Constraints (budget, internet, device, study time, formats) only shape THIS output. They never
// reach the scoring code, so a student who cannot afford a course can still explore that career.

import { normalizeUrl } from '../knowledge/knowledgeBase.js';

const START_INDEX_BY_EXPERIENCE = { none: 0, some: 1, solid: 2 };
const BEGINNER_EXPERIENCE = new Set([null, 'none', 'some']);
const DIFFICULTY_RANK_BEGINNER = { beginner: 0, null: 1, intermediate: 2 };
const DIFFICULTY_RANK_EXPERIENCED = { intermediate: 0, null: 1, beginner: 2 };

export const FLAG_MESSAGES = Object.freeze({
  check_cost: 'May involve costs, so it is listed after other options in this stage. Check current pricing before you commit.',
  data_heavy: 'Video-based, so it may use a lot of data. It is listed after lighter options; consider using it when your connection is better.',
  needs_account_setup: 'Needs an account or platform setup. Check what it requires before you start.',
  matches_preferred_format: 'Matches a learning format you said you prefer.',
});

function makeContext(profile) {
  return {
    lowBudget: profile.budget === 'none' || profile.budget === 'low',
    limitedInternet: profile.internet === 'unreliable' || profile.internet === 'limited',
    limitedDevice: profile.device === 'phone_only' || profile.device === 'low_spec_computer',
    formats: new Set(profile.learningFormats || []),
  };
}

const ref = (r) => ({ resourceId: r.id, title: r.title || r.id, url: r.url });

function resourceView(kb, id, ctx) {
  const r = kb.resources.get(id);
  const a = r.access;
  const flags = [];
  const add = (code) => flags.push({ code, message: FLAG_MESSAGES[code] });
  if (ctx.lowBudget && a.cost === 'may_involve_cost') add('check_cost');
  if (ctx.limitedInternet && a.bandwidth === 'heavy_by_type') add('data_heavy');
  if (a.needsAccountSetup) add('needs_account_setup');
  if (ctx.formats.size && a.formats.some((f) => ctx.formats.has(f))) add('matches_preferred_format');
  return {
    resourceId: r.id, title: r.title || r.id, provider: r.provider, type: r.type, url: r.url, bestFor: r.bestFor,
    access: { cost: a.cost, costNote: a.costNote, dataUse: a.bandwidth === 'heavy_by_type' ? 'video_heavy' : 'not_stated', needsAccountSetup: a.needsAccountSetup, formats: a.formats },
    notes: [r.sourceNote, r.accessNote].filter(Boolean),
    verificationStatus: r.verificationStatus,
    linkStatus: r.url ? 'unverified_link' : 'no_link_provided',
    flags,
  };
}

/** Lexicographic priority: affordable first, then lighter on data, then preferred format. Stable on KB order. */
function orderByConstraints(views, ctx) {
  const key = (v) => [
    ctx.lowBudget && v.access.cost === 'may_involve_cost' ? 1 : 0,
    ctx.limitedInternet && v.access.dataUse === 'video_heavy' ? 1 : 0,
    ctx.formats.size && !v.access.formats.some((f) => ctx.formats.has(f)) ? 1 : 0,
  ];
  return views
    .map((v, i) => ({ v, i, k: key(v) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2] || a.i - b.i)
    .map((x) => x.v);
}

function startIndex(profile, careerId, stageCount) {
  const lvl = profile.experienceByCareer?.[careerId] || 'none';
  return Math.min(START_INDEX_BY_EXPERIENCE[lvl] ?? 0, Math.max(stageCount - 1, 0));
}

const hasMathResources = (kb) => [...kb.resources.values()].some((r) => /\b(math|maths|mathematics|algebra|calculus|statistics)\b/i.test(`${r.title} ${r.bestFor || ''} ${r.sourceNote || ''}`));

/**
 * @param {{kb:object, careerId:string, profile:object, config:object, gaps?:object}} args
 *        `gaps` (optional) is the output of describeGaps, reused for prerequisite guidance.
 */
export function personalizeRoadmap({ kb, careerId, profile, config, gaps = null }) {
  const career = kb.careers.get(careerId);
  const ctx = makeContext(profile);
  const stageRecs = career.stageIds.map((id) => kb.stages.get(id));
  const begin = startIndex(profile, careerId, stageRecs.length);
  const knowledgeGaps = [];

  // ---- stages, with plan-wide de-duplication of resources (by id, then by normalised URL)
  const seenIds = new Set();
  const urlOwner = new Map();   // normalised url -> canonical resource id
  const alias = new Map();      // dropped duplicate id -> canonical id
  const stages = stageRecs.map((s, idx) => {
    const introduced = [];
    for (const rid of s.resourceIds) {
      const r = kb.resources.get(rid);
      const u = normalizeUrl(r.url);
      if (seenIds.has(rid)) continue;
      if (u && urlOwner.has(u)) { alias.set(rid, urlOwner.get(u)); continue; }
      seenIds.add(rid);
      if (u) urlOwner.set(u, rid);
      introduced.push(rid);
    }
    const hasDays = s.activities.some((a) => a.day);
    let views = introduced.map((rid) => resourceView(kb, rid, ctx));
    if (!hasDays) views = orderByConstraints(views, ctx); // keep day-by-day order when the source gives one

    const activities = s.activities.map((a) => ({
      activityId: a.id, title: a.title, type: a.type, day: a.day, note: a.note,
      resources: [...new Set(a.resourceIds.map((rid) => alias.get(rid) || rid))].map((rid) => ref(kb.resources.get(rid))),
    }));
    const communities = s.communityIds.map((cid) => kb.communities.get(cid)).map((c) => ({
      communityId: c.id, name: c.name, url: c.url, type: c.type, verificationStatus: c.verificationStatus,
    }));

    const gapsHere = [];
    if (s.resourceIds.length === 0) gapsHere.push('No resources are listed for this stage in the knowledge base yet.');
    if (gapsHere.length) knowledgeGaps.push(`${s.name || s.id}: ${gapsHere[0]}`);

    return {
      stageId: s.id, order: s.order, name: s.name || s.id,
      status: idx < begin ? 'covered_by_your_answers' : idx === begin ? 'start_here' : 'upcoming',
      durationPerSource: s.durationText,
      prerequisitesPerSource: s.prerequisites,
      focus: s.focus, actions: s.actions, weeklyPlanPerSource: s.weeklyPlan, checkpoints: s.checkpoints,
      activities, resources: views, communities, gaps: gapsHere,
    };
  });

  // ---- starting point and first action
  const start = stages[begin] || null;
  const startingPoint = start ? {
    stageId: start.stageId, order: start.order, name: start.name,
    reason: begin === 0
      ? 'Everyone starts at the first stage unless they tell us they have already covered it. Move on whenever you feel ready.'
      : 'You said you already have some experience here, so the plan starts at this stage. The earlier stages stay available if you want to revisit them.',
  } : null;

  let firstAction = null;
  let pacing = null;
  const entries = [];
  if (start) {
    const hasDays = start.activities.some((a) => a.day);
    const byId = new Map(start.resources.map((v) => [v.resourceId, v]));
    const withResources = start.activities.filter((a) => a.resources.length);
    const source = withResources.length
      ? withResources.map((a) => {
          const r = a.resources[0];
          const v = byId.get(r.resourceId) || resourceView(kb, r.resourceId, ctx);
          return { title: a.title || r.title, activityId: a.activityId, resource: r, flags: v.flags };
        })
      : start.resources.map((v) => ({ title: v.title, activityId: null, resource: { resourceId: v.resourceId, title: v.title, url: v.url }, flags: v.flags }));
    // Day-by-day plans keep the source order; otherwise prefer entries not flagged for cost or data use.
    const rank = (e) => (e.flags.some((f) => f.code === 'check_cost') ? 1 : 0) + (e.flags.some((f) => f.code === 'data_heavy') ? 1 : 0);
    entries.push(...(hasDays ? source : source.map((e, i) => ({ e, i })).sort((x, y) => rank(x.e) - rank(y.e) || x.i - y.i).map((x) => x.e)));
    if (entries.length) {
      const e = entries[0];
      firstAction = {
        text: `Start with “${e.title}”.`,
        stageId: start.stageId, activityId: e.activityId, resource: e.resource, flags: e.flags,
        why: 'It is the first item for the stage you are starting at, after taking your access needs into account.',
      };
    } else if (start.actions.length) {
      firstAction = { text: start.actions[0], stageId: start.stageId, activityId: null, resource: null, flags: [], why: 'The roadmap lists this as the first action for the stage you are starting at.' };
    } else {
      knowledgeGaps.push(`${start.name}: no specific first action or resource is listed in the knowledge base.`);
    }
  }
  if (profile.weeklyHours != null && start) {
    const n = config.pacing.find((p) => profile.weeklyHours <= p.maxHours).itemsPerWeek;
    pacing = {
      weeklyHours: profile.weeklyHours,
      suggestedItemsPerWeek: n,
      firstWeek: entries.slice(0, n).map((e) => ({ title: e.title, resource: e.resource })),
      note: 'A suggestion for pacing only. Stage durations are shown exactly as written by the sources and are not turned into deadlines.',
    };
  }

  // ---- projects (the knowledge base links projects to careers, not to stages)
  const beginner = BEGINNER_EXPERIENCE.has(profile.programmingExperience) && (profile.experienceByCareer?.[careerId] ?? 'none') !== 'solid';
  const diffRank = beginner ? DIFFICULTY_RANK_BEGINNER : DIFFICULTY_RANK_EXPERIENCED;
  const projects = career.projectIds
    .map((id, i) => ({ p: kb.projects.get(id), i }))
    .sort((a, b) => diffRank[a.p.difficulty] - diffRank[b.p.difficulty] || a.i - b.i)
    .map(({ p }) => ({
      projectId: p.id, title: p.title || p.id, description: p.description, type: p.type, difficulty: p.difficulty || 'not_specified',
      deliverable: p.deliverable, safetyNote: p.safetyNote, notes: p.notes, skills: p.skillRefs.map((s) => s.name).filter(Boolean),
    }));
  if (projects.length === 0) knowledgeGaps.push('No projects are listed for this path in the knowledge base yet.');
  else knowledgeGaps.push('The knowledge base links projects to the whole path, not to individual stages, so projects are not matched to a stage.');
  if (career.quarantinedProjectIds.length) knowledgeGaps.push(`${career.quarantinedProjectIds.length} project records are held back until a data review fixes their category.`);

  // ---- tracks, opportunities, communities-level guidance
  const learningTracks = career.trackIds.map((id) => kb.learningTracks.get(id)).map((t) => ({
    trackId: t.id, title: t.title, area: t.area, summary: t.summary, provider: t.provider,
    catalog: t.resourceId ? ref(kb.resources.get(t.resourceId)) : null, note: t.note, verificationStatus: t.verificationStatus,
  }));
  const opportunityLeads = career.opportunityIds.map((id) => kb.opportunities.get(id)).map((o) => ({
    opportunityId: o.id, title: o.title, type: o.type, url: o.url, eligibility: o.eligibility, notes: o.notes,
    status: 'unverified_lead',
    statusNote: 'Unverified lead. Do not assume it is open or funded. Check the official page for current dates, eligibility and costs.',
    verificationStatus: o.verificationStatus,
  }));
  const guidance = (kb.advice.get(careerId) || []).slice(0, config.limits.guidanceTips).map((a) => ({ text: a.text, type: a.type }));

  // ---- access considerations (derived only from KB flags and the student's own constraints)
  const all = stages.flatMap((s) => s.resources);
  const accessConsiderations = [];
  const costly = all.filter((v) => v.access.cost === 'may_involve_cost');
  if (ctx.lowBudget && costly.length) {
    accessConsiderations.push({
      code: 'cost_may_apply',
      message: `${costly.length} resources in this roadmap may involve costs. Within each stage they are listed after other options. Prices are not verified in the knowledge base, so compare before paying for anything, and consider practising with the other resources first.`,
      resourceIds: costly.map((v) => v.resourceId),
    });
  }
  const heavy = all.filter((v) => v.access.dataUse === 'video_heavy');
  if (ctx.limitedInternet && heavy.length) {
    accessConsiderations.push({
      code: 'data_use',
      message: `${heavy.length} resources are video-based and may use a lot of data. Lighter resources are listed first within each stage.`,
      resourceIds: heavy.map((v) => v.resourceId),
    });
  }
  const accounts = all.filter((v) => v.access.needsAccountSetup);
  if (accounts.length && (ctx.lowBudget || ctx.limitedDevice)) {
    accessConsiderations.push({
      code: 'account_setup',
      message: `${accounts.length} resources are platforms or cloud services that need an account or setup. Check their requirements and any charges before starting.`,
      resourceIds: accounts.map((v) => v.resourceId),
    });
  }
  if (ctx.limitedDevice) {
    accessConsiderations.push({
      code: 'device',
      message: career.setupRequirements
        ? `For this path the source says: ${career.setupRequirements}.`
        : 'The knowledge base does not state device requirements for this path. Check each resource before you start, especially tools you install or run locally.',
    });
  }

  // ---- prerequisite guidance
  const prerequisiteGuidance = gaps ? { prerequisites: gaps.prerequisites, bridgePath: gaps.bridgePath } : { prerequisites: [], bridgePath: null };
  if (prerequisiteGuidance.prerequisites.some((p) => p.dimension === 'math') && !hasMathResources(kb)) {
    knowledgeGaps.push('This path uses mathematics, but the current knowledge base contains no maths-specific resources. Ask a teacher or look for a maths course separately.');
  }

  return {
    career: { careerId: career.id, title: career.title, category: career.category, summary: career.summary },
    startingPoint, firstAction, pacing, stages,
    prerequisiteGuidance, projects, learningTracks, opportunityLeads, guidance, accessConsiderations, knowledgeGaps,
    caveats: [
      'Links, course availability, prices and opportunities come from a knowledge base that has not been independently verified. Check each one before relying on it.',
      'Stage durations are shown as written by the sources. They are not promises or deadlines.',
    ],
  };
}

/** Compact slice of a plan used inside a recommendation. */
export function summarizeForRecommendation(plan, config) {
  const start = plan.stages.find((s) => s.status === 'start_here') || null;
  return {
    roadmap: {
      startingPoint: plan.startingPoint,
      stages: plan.stages.map((s) => ({ stageId: s.stageId, order: s.order, name: s.name, status: s.status, durationPerSource: s.durationPerSource })),
    },
    firstStep: plan.firstAction,
    startingResources: start ? start.resources.slice(0, config.limits.startingResources) : [],
    projects: plan.projects.slice(0, config.limits.projectsPerRecommendation),
    accessConsiderations: plan.accessConsiderations,
    knowledgeGaps: plan.knowledgeGaps,
  };
}
