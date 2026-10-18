import { boot, esc } from './site.js';
import { api, ApiProblem } from './api.js';
import { renderLeads } from './render.js';
import { initReveal } from './site.js';

boot();
const box = document.getElementById('leads');
const filters = document.getElementById('filters');

async function load() {
  try {
    const { careers } = await api.careers();
    const plans = await Promise.all(careers.map((c) => api.roadmap(c.careerId, {}).then((p) => ({ c, p })).catch(() => null)));
    const seen = new Set(); const leads = [];
    for (const r of plans.filter(Boolean)) for (const o of r.p.opportunityLeads || []) {
      if (seen.has(o.opportunityId)) continue; seen.add(o.opportunityId);
      leads.push({ ...o, careerId: r.c.careerId, careerTitle: r.c.title });
    }
    if (!leads.length) { box.innerHTML = '<div class="notice">No leads could be loaded right now. Please try again later.</div>'; return; }
    const titles = [...new Map(leads.map((l) => [l.careerId, l.careerTitle])).entries()];
    let active = 'all';
    const draw = () => {
      filters.innerHTML = [['all', 'All paths'], ...titles].map(([id, t]) => `<button type="button" data-id="${esc(id)}" aria-pressed="${id === active}">${esc(t)}</button>`).join('');
      box.innerHTML = renderLeads(leads.filter((l) => active === 'all' || l.careerId === active));
      initReveal(box);
    };
    filters.addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (b) { active = b.dataset.id; draw(); } });
    draw();
  } catch (e) {
    box.innerHTML = `<div class="panel panel--peach"><p>${esc(e instanceof ApiProblem ? e.message : 'Something went wrong.')}</p></div>`;
  }
}
load();
