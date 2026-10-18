// Checks a recommendation result or roadmap plan against the knowledge base:
// valid ids, scores in range, no duplicate resources, and every link taken from the knowledge base.
// Used by tests and by the API as a last line of defence before a response leaves the server.

import { normalizeUrl } from '../knowledge/knowledgeBase.js';

function collectResources(list, where, kb, problems, seenIds, seenUrls) {
  for (const r of list) {
    const rec = kb.resources.get(r.resourceId);
    if (!rec) { problems.push(`${where}: unknown resource "${r.resourceId}"`); continue; }
    if (r.url !== rec.url) problems.push(`${where}: link for "${r.resourceId}" does not come from the knowledge base`);
    if (seenIds.has(r.resourceId)) problems.push(`${where}: duplicate resource "${r.resourceId}"`);
    seenIds.add(r.resourceId);
    const u = normalizeUrl(rec.url);
    if (u) { if (seenUrls.has(u)) problems.push(`${where}: duplicate URL for "${r.resourceId}"`); seenUrls.add(u); }
  }
}

export function validatePlan(plan, kb, careerId = plan?.career?.careerId) {
  const problems = [];
  if (!plan || !kb.careers.has(careerId)) return { valid: false, problems: [`unknown career "${careerId}"`] };
  const career = kb.careers.get(careerId);
  const seenIds = new Set(); const seenUrls = new Set();
  for (const s of plan.stages) {
    const rec = kb.stages.get(s.stageId);
    if (!rec || rec.careerId !== careerId) problems.push(`stage "${s.stageId}" does not belong to ${careerId}`);
    collectResources(s.resources, `stage ${s.stageId}`, kb, problems, seenIds, seenUrls);
    for (const a of s.activities) for (const r of a.resources) if (!kb.resources.has(r.resourceId)) problems.push(`activity in ${s.stageId}: unknown resource "${r.resourceId}"`);
    for (const c of s.communities) if (!kb.communities.has(c.communityId)) problems.push(`stage ${s.stageId}: unknown community "${c.communityId}"`);
  }
  const planIds = new Set(plan.stages.flatMap((s) => s.resources.map((r) => r.resourceId)));
  for (const s of plan.stages) for (const a of s.activities) for (const r of a.resources) if (!planIds.has(r.resourceId)) problems.push(`activity in ${s.stageId} references "${r.resourceId}", which is not in the plan`);
  for (const p of plan.projects) { const rec = kb.projects.get(p.projectId); if (!rec || rec.careerId !== careerId || rec.quarantined) problems.push(`project "${p.projectId}" is not valid for ${careerId}`); }
  for (const o of plan.opportunityLeads) {
    if (!career.opportunityIds.includes(o.opportunityId)) problems.push(`opportunity "${o.opportunityId}" is not linked to ${careerId}`);
    if (o.status !== 'unverified_lead') problems.push(`opportunity "${o.opportunityId}" must not claim a verified status`);
  }
  if (plan.firstAction?.resource && !kb.resources.has(plan.firstAction.resource.resourceId)) problems.push('firstAction references an unknown resource');
  if (plan.startingPoint && !plan.stages.some((s) => s.stageId === plan.startingPoint.stageId)) problems.push('startingPoint is not one of the stages');
  return { valid: problems.length === 0, problems };
}

export function validateRecommendationResult(result, kb) {
  const problems = [];
  const ids = new Set();
  for (const rec of result.recommendations || []) {
    if (!kb.careers.has(rec.careerId)) { problems.push(`unknown career "${rec.careerId}"`); continue; }
    if (ids.has(rec.careerId)) problems.push(`duplicate recommendation for "${rec.careerId}"`);
    ids.add(rec.careerId);
    if (!(rec.fit.score >= 0 && rec.fit.score <= 100)) problems.push(`score out of range for ${rec.careerId}`);
    for (const f of rec.factorBreakdown) if (!(f.score === null || (f.score >= 0 && f.score <= 100))) problems.push(`factor score out of range for ${rec.careerId}`);
    const seenIds = new Set(); const seenUrls = new Set();
    collectResources(rec.startingResources, `recommendation ${rec.careerId}`, kb, problems, seenIds, seenUrls);
    for (const s of rec.roadmap.stages) { const st = kb.stages.get(s.stageId); if (!st || st.careerId !== rec.careerId) problems.push(`stage "${s.stageId}" does not belong to ${rec.careerId}`); }
    for (const p of rec.projects) { const pr = kb.projects.get(p.projectId); if (!pr || pr.careerId !== rec.careerId || pr.quarantined) problems.push(`project "${p.projectId}" is not valid for ${rec.careerId}`); }
    if (rec.skillGaps?.bridgePath && !kb.careers.has(rec.skillGaps.bridgePath.careerId)) problems.push('bridgePath references an unknown career');
    for (const s of rec.skillGaps?.skillsToBuild || []) if (!kb.skills.has(s.skillId)) problems.push(`unknown skill "${s.skillId}"`);
  }
  for (const o of result.explore?.otherCareers || []) if (!kb.careers.has(o.careerId)) problems.push(`explore lists unknown career "${o.careerId}"`);
  return { valid: problems.length === 0, problems };
}
