import { boot, esc, initReveal } from './site.js';
import { api, ApiProblem } from './api.js';
import { renderRoadmap } from './render.js';
import { loadAnswers, buildProfile } from './survey-model.js';

boot();
const out = document.getElementById('roadmap');
const careerId = new URLSearchParams(location.search).get('career') || '';
const KEY = `afripath.progress.${careerId}`;

function loadDone() { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); } }
function saveDone(set) { try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch { /* storage unavailable: ticks last for this visit only */ } }

function problem(title, body, actions = '') {
  out.innerHTML = `<div class="panel panel--peach stack"><h2 class="display h-md">${esc(title)}</h2><p>${esc(body)}</p>${actions}</div>`;
}

function updateCounts(done) {
  out.querySelectorAll('.stage').forEach((st) => {
    const boxes = st.querySelectorAll('input[data-res]'); if (!boxes.length) return;
    const n = [...boxes].filter((b) => b.checked).length;
    const c = st.querySelector('[data-count]'); if (c) c.textContent = `${n}/${boxes.length} done`;
  });
  const all = out.querySelectorAll('input[data-res]'); const n = [...all].filter((b) => b.checked).length;
  const bar = out.querySelector('#overall'); if (bar) { bar.querySelector('i').style.width = all.length ? `${(n / all.length) * 100}%` : '0'; bar.querySelector('span').textContent = `${n} of ${all.length} resources done`; }
}

async function run() {
  if (!/^[a-z0-9_]{1,80}$/.test(careerId)) { problem('Choose a path first', 'Pick one of your matches to see its roadmap.', '<p><a class="btn btn--primary" href="results.html">See my matches</a></p>'); return; }
  try {
    const plan = await api.roadmap(careerId, buildProfile(loadAnswers()));
    const done = loadDone();
    document.getElementById('rm-cat').textContent = plan.career.category;
    document.getElementById('rm-title').textContent = plan.career.title;
    document.getElementById('rm-sum').textContent = plan.career.summary || '';
    document.title = `AfriPath AI — ${plan.career.title} roadmap`;
    out.innerHTML = `<div class="overall" id="overall"><span></span><div class="progress"><i></i></div><small class="small">Ticks are saved in this browser only.</small></div>` + renderRoadmap(plan, done);
    updateCounts(done);
    out.addEventListener('change', (e) => {
      const el = e.target; if (!el.dataset?.res) return;
      el.checked ? done.add(el.dataset.res) : done.delete(el.dataset.res);
      el.closest('.res')?.classList.toggle('is-done', el.checked);
      saveDone(done); updateCounts(done);
    });
    initReveal(out);
  } catch (e) {
    if (e instanceof ApiProblem && e.kind === 'not_found') problem('We could not find that path', 'It may have been renamed or removed.', '<p><a class="btn btn--primary" href="results.html">Back to my matches</a></p>');
    else problem('We could not build your roadmap', e.message || 'Something went wrong.', '<p><button class="btn btn--primary" id="retry" type="button">Try again</button></p>');
    document.getElementById('retry')?.addEventListener('click', () => { location.reload(); });
  }
}
run();
