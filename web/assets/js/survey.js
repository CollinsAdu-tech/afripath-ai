import { boot, esc } from './site.js';
import { api, ApiProblem } from './api.js';
import { SURVEY_STEPS, loadAnswers, saveAnswers, optionsFor } from './survey-model.js';

boot();
const root = document.getElementById('survey-root');
let options = null;
let answers = loadAnswers();
let step = Math.min(Number(new URLSearchParams(location.search).get('step')) || 0, SURVEY_STEPS.length - 1);

function showError(p) {
  root.innerHTML = `<div class="panel panel--peach stack"><h2 class="display h-md">Something got in the way</h2><p>${esc(p.message)}</p><p><button class="btn btn--primary" id="retry" type="button">Try again</button></p></div>`;
  document.getElementById('retry').addEventListener('click', start);
}

function field(f) {
  const opts = optionsFor(f, options);
  const val = answers[f.key];
  if (f.kind === 'number') {
    return `<div class="q"><h3>${esc(f.label)}</h3>${f.help ? `<p class="small">${esc(f.help)}</p>` : ''}
      <div class="num"><input id="f-${f.key}" type="number" inputmode="numeric" min="${f.min}" max="${f.max}" step="1" value="${val ?? ''}" data-key="${f.key}" aria-label="${esc(f.label)}"><span>hours a week</span></div></div>`;
  }
  const type = f.kind === 'multi' ? 'checkbox' : 'radio';
  return `<fieldset class="q"><legend>${esc(f.label)}</legend>${f.help ? `<p class="small">${esc(f.help)}</p>` : ''}
    <div class="opts ${f.compact ? 'opts--compact' : ''}">${opts.map((o) => {
      const on = f.kind === 'multi' ? (val || []).includes(o.id) : String(val) === String(o.id);
      return `<label class="opt"><input type="${type}" name="${f.key}" value="${esc(o.id)}" data-key="${f.key}" data-kind="${f.kind}" ${on ? 'checked data-was="1"' : ''}><span>${esc(o.label)}</span></label>`;
    }).join('')}</div></fieldset>`;
}

function render() {
  const s = SURVEY_STEPS[step];
  const last = step === SURVEY_STEPS.length - 1;
  const dots = SURVEY_STEPS.map((x, i) => `<li class="${i < step ? 'done' : i === step ? 'now' : ''}" ${i === step ? 'aria-current="step"' : ''}><span class="tile ${['', 'tile--lime', 'tile--pink', 'tile--peach'][i % 4]}">${i + 1}</span><em>${esc(x.short)}</em></li>`).join('');
  root.innerHTML = `<form class="panel survey-card" novalidate>
    <ol class="steps" aria-label="Survey progress">${dots}</ol>
    <div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="${SURVEY_STEPS.length}" aria-valuenow="${step + 1}"><i style="width:${((step + 1) / SURVEY_STEPS.length) * 100}%"></i></div>
    <div class="step-body" id="step-body" tabindex="-1">
      <p class="small step-count">Step ${step + 1} of ${SURVEY_STEPS.length}${s.optionalNote ? ` · ${esc(s.optionalNote)}` : ''}</p>
      <h2 class="display h-md">${s.title}</h2>
      ${s.help ? `<p class="lead">${esc(s.help)}</p>` : ''}
      ${s.fields.map(field).join('')}
    </div>
    <div class="survey-nav">
      <button class="btn" type="button" data-act="back" ${step === 0 ? 'disabled' : ''}>← Back</button>
      <span class="spacer"></span>
      ${last ? '' : '<button class="btn btn--ghost" type="button" data-act="skip">Skip this step</button>'}
      <button class="btn btn--primary" type="button" data-act="${last ? 'finish' : 'next'}">${last ? 'See my paths' : 'Next'} <span class="arrow" aria-hidden="true">→</span></button>
    </div></form>`;
}

function read(e) {
  const el = e.target; if (!el.dataset?.key) return;
  const key = el.dataset.key;
  if (el.type === 'checkbox') {
    const set = new Set(answers[key] || []); el.checked ? set.add(el.value) : set.delete(el.value);
    answers[key] = [...set];
  } else if (el.type === 'radio') {
    answers[key] = el.value; // deselect handled in click handler
  } else if (el.type === 'number') {
    answers[key] = el.value === '' ? null : Number(el.value);
  }
  saveAnswers(answers);
}

root.addEventListener('change', read);
root.addEventListener('input', (e) => { if (e.target.type === 'number') read(e); });
// Clicking a selected radio again clears it, so single-choice questions stay optional.
root.addEventListener('click', (e) => {
  const el = e.target;
  if (el.matches?.('input[type=radio]')) {
    const was = el.dataset.was === '1';
    el.closest('.opts').querySelectorAll('input').forEach((r) => { r.dataset.was = ''; });
    if (was) { el.checked = false; delete answers[el.dataset.key]; saveAnswers(answers); } else el.dataset.was = '1';
  }
  const b = el.closest?.('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'back' && step > 0) { step--; go(); }
  else if (act === 'next' || act === 'skip') { step = Math.min(step + 1, SURVEY_STEPS.length - 1); go(); }
  else if (act === 'finish') { finish(); }
});
root.addEventListener('submit', (e) => e.preventDefault());

function go() { render(); const body = document.getElementById('step-body'); body?.scrollIntoView({ behavior: 'smooth', block: 'start' }); body?.focus({ preventScroll: true }); }

function finish() {
  saveAnswers(answers);
  location.href = 'results.html';
}

async function start() {
  root.innerHTML = '<div class="panel survey-loading"><p>Loading the survey…</p></div>';
  try { options = (await api.options()).options; render(); }
  catch (e) { showError(e instanceof ApiProblem ? e : new ApiProblem('network', 'Could not load the survey.')); }
}
start();
