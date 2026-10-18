import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { OptionsResponse } from '../api/types';
import { Arrow } from '../components/Icons';
import { PageHero, Title } from '../components/PageHero';
import { ProblemPanel } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import { useTitle } from '../lib/useTitle';
import { useAnswers } from '../survey/AnswersContext';
import { optionsFor, SURVEY_STEPS, type Field } from '../survey/model';

const TILE = ['', ' tile--lime', ' tile--pink', ' tile--peach'];

function Question({ f, options }: { f: Field; options: OptionsResponse['options'] }) {
  const { answers, setAnswer } = useAnswers();
  const val = answers[f.key];
  if (f.kind === 'number') {
    return (
      <div className="q"><h3>{f.label}</h3>{f.help && <p className="small">{f.help}</p>}
        <div className="num">
          <input id={`f-${f.key}`} type="number" inputMode="numeric" min={f.min} max={f.max} step={1} value={typeof val === 'number' ? val : ''} aria-label={f.label}
            onChange={(e) => setAnswer(f.key, e.target.value === '' ? null : Number(e.target.value))} />
          <span>hours a week</span>
        </div>
      </div>
    );
  }
  const multi = f.kind === 'multi';
  const chosen = multi ? (Array.isArray(val) ? val : []) : [];
  return (
    <fieldset className="q"><legend>{f.label}</legend>{f.help && <p className="small">{f.help}</p>}
      <div className={`opts${f.compact ? ' opts--compact' : ''}`}>
        {optionsFor(f, options).map((o) => {
          const on = multi ? chosen.includes(o.id) : String(val) === String(o.id);
          return (
            <label className="opt" key={o.id}>
              <input type={multi ? 'checkbox' : 'radio'} name={f.key} value={o.id} checked={on}
                onChange={multi ? () => setAnswer(f.key, on ? chosen.filter((x) => x !== o.id) : [...chosen, o.id]) : () => undefined}
                // Clicking a selected radio again clears it, so single-choice questions stay optional.
                onClick={multi ? undefined : () => setAnswer(f.key, on ? undefined : o.id)} />
              <span>{o.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Survey({ options }: { options: OptionsResponse['options'] }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(() => Math.max(0, Math.min(Number(params.get('step')) || 0, SURVEY_STEPS.length - 1)));
  const body = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const s = SURVEY_STEPS[step]!;
  const last = step === SURVEY_STEPS.length - 1;

  useEffect(() => {
    if (!moved.current) return;
    body.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    body.current?.focus({ preventScroll: true });
  }, [step]);
  const go = (n: number) => { moved.current = true; setStep(n); };

  return (
    <form className="panel survey-card" noValidate onSubmit={(e) => e.preventDefault()}>
      <ol className="steps" aria-label="Survey progress">
        {SURVEY_STEPS.map((x, i) => (
          <li key={x.short} className={i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className={`tile${TILE[i % 4]}`}>{i + 1}</span><em>{x.short}</em>
          </li>
        ))}
      </ol>
      <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={SURVEY_STEPS.length} aria-valuenow={step + 1}><i style={{ width: `${((step + 1) / SURVEY_STEPS.length) * 100}%` }} /></div>
      <div className="step-body" id="step-body" tabIndex={-1} ref={body}>
        <p className="small step-count">Step {step + 1} of {SURVEY_STEPS.length}{s.note ? ` · ${s.note}` : ''}</p>
        <h2 className="display h-md"><Title parts={s.title} /></h2>
        {s.help && <p className="lead">{s.help}</p>}
        {s.fields.map((f) => <Question key={f.key} f={f} options={options} />)}
      </div>
      <div className="survey-nav">
        <button className="btn" type="button" disabled={step === 0} onClick={() => go(step - 1)}>← Back</button>
        <span className="spacer" />
        {!last && <button className="btn btn--ghost" type="button" onClick={() => go(step + 1)}>Skip this step</button>}
        <button className="btn btn--primary" type="button" onClick={() => (last ? navigate('/results') : go(step + 1))}>
          {last ? 'See my paths' : 'Next'} <span className="arrow" aria-hidden="true"><Arrow width={18} height={18} /></span>
        </button>
      </div>
    </form>
  );
}

export function SurveyPage() {
  useTitle('Take the survey');
  const opts = useAsync((s) => api.options(s), 'options');
  return (
    <>
      <PageHero pill="AfriPath AI · about 5 minutes" title={['Tell us about ', { accent: 'you' }]} lead="Answer what you like. Every question is optional, and skipping one never counts against you." />
      <section className="wrap" style={{ paddingBottom: 'clamp(60px,8vw,130px)' }}>
        <div className="survey" aria-live="polite">
          {opts.status === 'loading' && <div className="panel survey-loading"><p>Loading the survey…</p></div>}
          {opts.status === 'error' && (
            <ProblemPanel title="Something got in the way"><p>{opts.error.message}</p><p><button className="btn btn--primary" type="button" onClick={opts.reload}>Try again</button></p></ProblemPanel>
          )}
          {opts.status === 'ready' && <Survey options={opts.data.options} />}
        </div>
        <p className="survey-privacy small">Your answers are sent to the AfriPath AI engine to work out your matches. The engine does not store or log them. They stay in this browser tab so you can go back and change them.</p>
      </section>
    </>
  );
}
