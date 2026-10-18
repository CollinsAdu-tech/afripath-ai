// Pure HTML renderers for engine responses (no DOM, no network), so they can be unit-tested in Node.
// Rules that keep the UI honest and safe:
//  - every string from the API goes through esc(); links only if safeUrl() accepts them (http/https)
//  - fit scores are always shown as a heuristic, never as a prediction
//  - costs are never called "free" unless the engine says the source mentions it, and always say to check
//  - opportunities are always shown as unverified leads
import { esc, safeUrl, ICONS } from './site.js';

const TILE = ['', 'tile--lime', 'tile--pink', 'tile--peach'];
const PANEL = ['panel--blue', 'panel--lime', 'panel--pink'];

export const COST_LABEL = {
  may_involve_cost: ['May involve cost', 'cost-warn'],
  source_mentions_free: ['Source mentions free', 'cost-ok'],
  unknown: ['Cost not stated', 'cost-unk'],
};
export const STAGE_STATUS = {
  start_here: 'Start here',
  covered_by_your_answers: 'Covered by your answers',
  upcoming: 'Up next',
};
const DATA_LABEL = { video_heavy: 'Data-heavy (video)', not_stated: null };

const link = (url, text, cls = 'link') => { const u = safeUrl(url); return u ? `<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(text)}<span class="sr-only"> (opens in a new tab)</span></a>` : esc(text); };
const list = (items, cls = '') => (items?.length ? `<ul class="${cls}">${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '');
const chips = (items) => (items?.length ? `<div class="chips chips--sm">${items.map((i) => `<span class="chip">${esc(i)}</span>`).join('')}</div>` : '');

export function renderFlags(flags) {
  return (flags || []).map((f) => `<p class="flag">${esc(f.message)}</p>`).join('');
}

// ---------------- Recommendations ----------------

export function renderFitRing(fit) {
  const s = Math.max(0, Math.min(100, Number(fit.score) || 0));
  return `<div class="fit" role="img" aria-label="Heuristic fit score ${esc(s)} out of 100. ${esc(fit.label)}">
    <div class="fit-ring" style="--p:${s}"><strong>${Math.round(s)}</strong><small>/100</small></div>
    <p class="fit-label">${esc(fit.label)}</p></div>`;
}

export function renderFactorBars(factorBreakdown) {
  return `<ul class="bars">${factorBreakdown.map((f) => f.status === 'evaluated'
    ? `<li><span>${esc(f.label)} <em>(${esc(f.weightPercent)}% of score)</em></span><span class="bar"><i style="width:${Math.max(0, Math.min(100, f.score))}%"></i></span><b>${Math.round(f.score)}</b></li>`
    : `<li class="skipped"><span>${esc(f.label)}</span><span class="bar"></span><b>skipped</b></li>`).join('')}</ul>`;
}

export function renderRecommendation(rec) {
  const i = rec.rank - 1;
  const gaps = rec.skillGaps || {};
  const reasons = rec.explanation.reasons.map((r) => esc(r.text));
  const build = [...(gaps.skillsToBuild || []).map((s) => s.name), ...(gaps.strengthsToBuild || []).map((s) => s.label)];
  const prereq = (gaps.prerequisites || []).map((p) => esc(p.message));
  const bridge = gaps.bridgePath
    ? `<div class="bridge"><b>A gentle on-ramp:</b> ${esc(gaps.bridgePath.title)}. ${esc(gaps.bridgePath.why)} <a class="link" href="roadmap.html?career=${encodeURIComponent(gaps.bridgePath.careerId)}">View this path</a></div>` : '';
  const first = rec.firstStep;
  return `<article class="rec reveal ${PANEL[i % 3]}" aria-labelledby="rec-${rec.rank}-t" style="--d:${i * 0.08}s">
    <header class="rec-head">
      <span class="tile ${TILE[i % 3]}">0${rec.rank}</span>
      <div class="rec-title"><span class="pill pill--plain pill--noDot">${esc(rec.category)}</span><h2 id="rec-${rec.rank}-t" class="display h-md">${esc(rec.title)}</h2></div>
      ${renderFitRing(rec.fit)}
    </header>
    <p class="rec-summary">${esc(rec.explanation.summary)}</p>
    <div class="rec-cols">
      <section><h3>Why this fits</h3>${list(reasons)}</section>
      <section><h3>What to build</h3>${chips(build) || '<p class="small">Nothing specific flagged from your answers.</p>'}${list(prereq, 'small-list')}${bridge}</section>
    </div>
    ${first ? `<div class="first-step"><h3>Your first step</h3><p>${first.resource ? `Start with ${link(first.resource.url, first.resource.title)}.` : esc(first.text)}</p>${first.why ? `<p class="small">${esc(first.why)}</p>` : ''}${renderFlags(first.flags)}</div>` : ''}
    ${rec.explanation.notes?.length ? `<p class="small note">${esc(rec.explanation.notes[0])}</p>` : ''}
    <details class="how-scored"><summary>How we scored this</summary>${renderFactorBars(rec.factorBreakdown)}<p class="small">${esc(rec.fit.disclaimer)} Questions you skipped are left out of the score, never counted as zero.</p></details>
    <footer class="rec-foot"><a class="btn btn--primary" href="roadmap.html?career=${encodeURIComponent(rec.careerId)}">See my full roadmap <span class="arrow" aria-hidden="true">→</span></a></footer>
  </article>`;
}

export function renderRecommendations(res) {
  if (res.status === 'insufficient_information') {
    return `<div class="panel panel--peach stack"><h2 class="display h-md">We need a little more from you</h2><p>${esc(res.message)}</p>
      ${list((res.missingInformation || []).map((m) => `<b>${esc(m.label)}:</b> ${esc(m.question)}`))}
      <p><a class="btn btn--primary" href="afripath-ai.html">Back to the survey</a></p></div>`;
  }
  const exploratory = res.status === 'exploratory';
  const head = `<div class="notice ${exploratory ? 'notice--early' : ''}"><b>${exploratory ? 'Early signal.' : 'Starting points.'}</b> ${esc(res.message)} ${esc(res.scoreNote)}</div>`;
  const missing = exploratory && res.missingInformation?.length
    ? `<div class="panel stack"><h3>Answer more for sharper matches</h3>${list(res.missingInformation.map((m) => `<b>${esc(m.label)}:</b> ${esc(m.question)}`))}<p><a class="btn" href="afripath-ai.html">Add more answers</a></p></div>` : '';
  const more = res.explore?.otherCareers?.length
    ? `<section class="explore"><h2 class="display h-md">Other paths to explore</h2><p class="lead">${esc(res.explore.hint)}</p><div class="explore-grid">${res.explore.otherCareers.map((c) =>
      `<a class="explore-card reveal" href="roadmap.html?career=${encodeURIComponent(c.careerId)}"><span class="pill pill--plain pill--noDot">${esc(c.category)}</span><h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p><span class="go">${ICONS.arrow}</span></a>`).join('')}</div></section>` : '';
  const notes = [...(res.notes || []), ...(res.warnings || []).map((w) => w.message)];
  return `${head}<div class="rec-list">${res.recommendations.map(renderRecommendation).join('')}</div>${missing}${more}${notes.length ? `<div class="notice stack">${notes.map((n) => `<p>${esc(n)}</p>`).join('')}</div>` : ''}`;
}

// ---------------- Roadmap ----------------

export function renderResource(r, done = false) {
  const [costText, costCls] = COST_LABEL[r.access?.cost] || COST_LABEL.unknown;
  const data = DATA_LABEL[r.access?.dataUse];
  return `<li class="res ${done ? 'is-done' : ''}">
    <label class="tick"><input type="checkbox" data-res="${esc(r.resourceId)}" ${done ? 'checked' : ''}><span class="sr-only">Mark “${esc(r.title)}” as done</span><i aria-hidden="true"></i></label>
    <div class="res-body">
      <h5>${link(r.url, r.title, 'res-link')}</h5>
      <p class="small">${esc(r.provider || '')}${r.type ? ` · ${esc(String(r.type).replace(/_/g, ' '))}` : ''}</p>
      <div class="badges"><span class="badge ${costCls}">${esc(costText)}</span>${data ? `<span class="badge cost-warn">${esc(data)}</span>` : ''}${r.access?.needsAccountSetup ? '<span class="badge cost-unk">Needs an account</span>' : ''}</div>
      ${r.access?.costNote ? `<p class="small">${esc(r.access.costNote)}</p>` : ''}
      ${(r.notes || []).map((n) => `<p class="small">${esc(n)}</p>`).join('')}
      ${renderFlags(r.flags)}
      <p class="small faint">Link not independently verified. Check it before relying on it.</p>
    </div></li>`;
}

export function renderStage(s, doneSet = new Set()) {
  const status = STAGE_STATUS[s.status] || '';
  const total = s.resources.length; const done = s.resources.filter((r) => doneSet.has(r.resourceId)).length;
  const weekly = (s.weeklyPlanPerSource || []).map((w) => `<li><b>Week ${esc(w.weeks)}:</b> ${esc(w.goal)}${w.actions?.length ? `<ul>${w.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}</li>`);
  const acts = (s.activities || []).map((a) => `<li><b>${esc(a.title)}</b>${a.resources?.length ? ' — ' + a.resources.map((r) => link(r.url, r.title)).join(', ') : ''}${a.note ? `<br><span class="small">${esc(a.note)}</span>` : ''}</li>`);
  return `<article class="stage panel reveal ${s.status === 'start_here' ? 'is-start' : ''} ${s.status === 'covered_by_your_answers' ? 'is-covered' : ''}" data-stage="${esc(s.stageId)}">
    <header class="stage-head"><span class="tile ${TILE[(s.order - 1) % 4]}">${esc(String(s.order).padStart(2, '0'))}</span>
      <div><h3>${esc(s.name)}</h3><p class="small">${esc(s.durationPerSource || '')}${s.durationPerSource ? ' · as written by the sources, not a deadline' : ''}</p></div>
      ${status ? `<span class="pill pill--${s.status === 'start_here' ? 'lime' : 'plain'}">${esc(status)}</span>` : ''}
      ${total ? `<span class="stage-count" data-count>${done}/${total} done</span>` : ''}</header>
    ${s.focus ? `<p>${esc(s.focus)}</p>` : ''}
    ${s.prerequisitesPerSource?.length ? `<p class="small"><b>Before you start (per source):</b> ${s.prerequisitesPerSource.map(esc).join('; ')}</p>` : ''}
    ${s.actions?.length ? `<h4>Actions</h4>${list(s.actions.map(esc))}` : ''}
    ${weekly.length ? `<h4>Weekly plan (per source)</h4><ul class="plain">${weekly.join('')}</ul>` : ''}
    ${acts.length ? `<h4>Activities</h4><ul class="plain">${acts.join('')}</ul>` : ''}
    ${total ? `<h4>Resources</h4><ul class="res-list">${s.resources.map((r) => renderResource(r, doneSet.has(r.resourceId))).join('')}</ul>` : ''}
    ${s.communities?.length ? `<h4>Communities</h4>${list(s.communities.map((c) => `${link(c.url, c.name)}${c.type ? ` <span class="small">(${esc(c.type)})</span>` : ''}`))}` : ''}
    ${s.checkpoints?.length ? `<h4>Checkpoints</h4>${list(s.checkpoints.map(esc))}` : ''}
    ${s.gaps?.length ? `<div class="notice">${s.gaps.map((g) => `<p>${esc(typeof g === 'string' ? g : g.message || '')}</p>`).join('')}</div>` : ''}
  </article>`;
}

export function renderRoadmap(plan, doneSet = new Set()) {
  const first = plan.firstAction;
  const week = plan.pacing?.firstWeek || [];
  const proj = (plan.projects || []).map((p) => `<article class="panel"><h3>${esc(p.title)}</h3><p>${esc(p.description || '')}</p>${p.difficulty && p.difficulty !== 'not_specified' ? `<p class="small">Difficulty: ${esc(p.difficulty)}</p>` : ''}${p.safetyNote ? `<p class="flag"><b>Safety:</b> ${esc(p.safetyNote)}</p>` : ''}</article>`);
  const tracks = (plan.learningTracks || []).map((t) => `<article class="panel"><h3>${esc(t.title)}</h3><p>${esc(t.summary || '')}</p><p class="small">${esc(t.provider || '')}${t.catalog ? ' · ' + link(t.catalog.url, t.catalog.title) : ''}</p><p class="small faint">${esc(t.note || '')}</p></article>`);
  const opps = (plan.opportunityLeads || []).map((o) => `<article class="panel"><span class="pill pill--peach">Unverified lead</span><h3>${link(o.url, o.title, 'res-link')}</h3>${o.type ? `<p class="small">${esc(String(o.type).replace(/_/g, ' '))}</p>` : ''}${o.eligibility ? `<p class="small">${esc(o.eligibility)}</p>` : ''}<p class="flag">${esc(o.statusNote)}</p></article>`);
  const pq = plan.prerequisiteGuidance || {};
  const access = (plan.accessConsiderations || []).map((a) => `<li>${esc(a.message)}</li>`);
  const guide = (plan.guidance || []).map((g) => `<li>${esc(g.text)}</li>`);
  return `
  <section class="rm-top">
    <div class="panel panel--lime first-action"><span class="pill pill--plain pill--noDot">Your first action</span>
      <h2 class="display h-md">${first?.resource ? link(first.resource.url, first.resource.title, 'big-link') : esc(first?.text || 'Start with the first stage')}</h2>
      <p>${esc(first?.why || '')}</p>${renderFlags(first?.flags)}</div>
    <div class="panel panel--blue"><h3>Where you start</h3><p><b>${esc(plan.startingPoint.name)}</b></p><p class="small">${esc(plan.startingPoint.reason)}</p>
      ${week.length ? `<h4>A first week${plan.pacing.weeklyHours ? ` at about ${esc(plan.pacing.weeklyHours)} h/week` : ''}</h4>${list(week.map((w) => (w.resource ? link(w.resource.url, w.title) : esc(w.title))))}` : ''}
      <p class="small">${esc(plan.pacing?.note || '')}</p></div>
  </section>
  ${pq.prerequisites?.length || pq.bridgePath ? `<section class="panel stack"><h3>Before you dive deep</h3>${list(pq.prerequisites.map((p) => esc(p.message)))}${pq.bridgePath ? `<div class="bridge"><b>A gentle on-ramp:</b> ${esc(pq.bridgePath.title)}. ${esc(pq.bridgePath.why)} <a class="link" href="roadmap.html?career=${encodeURIComponent(pq.bridgePath.careerId)}">View this path</a></div>` : ''}</section>` : ''}
  <section><h2 class="display h-md">Your stages</h2><div class="roadmap-line">${plan.stages.map((s) => renderStage(s, doneSet)).join('')}</div></section>
  ${proj.length ? `<section><h2 class="display h-md">Projects to build</h2><div class="grid-2">${proj.join('')}</div></section>` : ''}
  ${tracks.length ? `<section><h2 class="display h-md">Learning tracks</h2><div class="grid-2">${tracks.join('')}</div></section>` : ''}
  ${opps.length ? `<section><h2 class="display h-md">Opportunity leads</h2><p class="lead">These came from our source list. None has been checked by us, so confirm dates, eligibility and costs on the official page.</p><div class="grid-2">${opps.join('')}</div></section>` : ''}
  ${guide.length || access.length ? `<section class="grid-2">${guide.length ? `<div class="panel"><h3>Tips from the sources</h3><ul>${guide.join('')}</ul></div>` : ''}${access.length ? `<div class="panel"><h3>Access and cost</h3><ul>${access.join('')}</ul></div>` : ''}</section>` : ''}
  <section class="notice stack">${[...(plan.knowledgeGaps || []), ...(plan.caveats || []), ...(plan.warnings || []).map((w) => w.message)].map((c) => `<p>${esc(c)}</p>`).join('')}</section>`;
}

// ---------------- Opportunities (aggregated leads) ----------------

export function renderLeads(leads) {
  if (!leads.length) return '<div class="notice">No leads could be loaded right now.</div>';
  return `<div class="grid-3">${leads.map((o, i) => `<article class="panel lead reveal" style="--d:${(i % 3) * 0.07}s"><span class="pill pill--peach">Unverified lead</span>
    <h3>${link(o.url, o.title, 'res-link')}</h3><p class="small">${esc(o.careerTitle)}${o.type ? ` · ${esc(String(o.type).replace(/_/g, ' '))}` : ''}</p>
    ${o.eligibility ? `<p class="small">${esc(o.eligibility)}</p>` : ''}<p class="flag">${esc(o.statusNote)}</p></article>`).join('')}</div>`;
}
