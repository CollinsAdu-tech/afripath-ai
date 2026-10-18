import { boot, esc, initReveal } from './site.js';
import { api, ApiProblem } from './api.js';
import { renderRecommendations } from './render.js';
import { loadAnswers, buildProfile } from './survey-model.js';

boot();
const out = document.getElementById('results');

function problem(title, body, actions = '') {
  out.innerHTML = `<div class="panel panel--peach stack"><h2 class="display h-md">${esc(title)}</h2><p>${esc(body)}</p>${actions}</div>`;
}

async function run() {
  const profile = buildProfile(loadAnswers());
  if (!Object.keys(profile).length) {
    problem('Take the survey first', 'We need a few of your answers to work out your matches.', '<p><a class="btn btn--primary" href="afripath-ai.html">Start the survey</a></p>');
    return;
  }
  try {
    const res = await api.recommend(profile);
    out.innerHTML = renderRecommendations(res);
    initReveal(out);
    if (res.recommendations?.length) document.title = `AfriPath AI — ${res.recommendations[0].title} and more`;
  } catch (e) {
    if (e instanceof ApiProblem && e.kind === 'invalid') {
      problem('Some answers could not be used', e.message, `<ul>${(e.details || []).map((d) => `<li>${esc(d.message)}</li>`).join('')}</ul><p><a class="btn btn--primary" href="afripath-ai.html">Review my answers</a></p>`);
    } else {
      problem('We could not get your matches', e.message || 'Something went wrong.', '<p><button class="btn btn--primary" id="retry" type="button">Try again</button></p>');
      document.getElementById('retry')?.addEventListener('click', () => { out.innerHTML = '<div class="status-block"><div class="spinner" role="status" aria-label="Working out your matches"></div></div>'; run(); });
    }
  }
}
run();
