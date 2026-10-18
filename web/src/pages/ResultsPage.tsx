import { api } from '../api/client';
import { PageHero } from '../components/PageHero';
import { RecommendationsView } from '../components/Recommendations';
import { LinkButton, ProblemPanel, Reveal, Spinner } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import { useTitle } from '../lib/useTitle';
import { useAnswers } from '../survey/AnswersContext';
import { buildProfile, hasAnswers } from '../survey/model';

export function ResultsPage() {
  const { answers } = useAnswers();
  const profile = buildProfile(answers);
  const ready = hasAnswers(profile);
  const state = useAsync((s) => (ready ? api.recommend(profile, s) : Promise.reject(new Error('no answers'))), ready ? JSON.stringify(profile) : 'none');
  const top = state.status === 'ready' ? state.data.recommendations[0]?.title : undefined;
  useTitle(top ? `${top} and more` : 'Your results');

  return (
    <>
      <PageHero pill="Your AfriPath AI results" title={['Paths that may ', { accent: 'fit' }, ' you']} lead="Built only from the answers you gave. Use them as starting points to explore, not a verdict.">
        <Reveal delay={0.22} className="crumbs"><LinkButton to="/afripath-ai">← Change my answers</LinkButton></Reveal>
      </PageHero>
      <section className="wrap" style={{ paddingBottom: 'clamp(60px,8vw,130px)' }}>
        <div id="results" aria-live="polite">
          {!ready && (
            <ProblemPanel title="Take the survey first"><p>We need a few of your answers to work out your matches.</p><p><LinkButton to="/afripath-ai" variant="primary">Start the survey</LinkButton></p></ProblemPanel>
          )}
          {ready && state.status === 'loading' && <Spinner label="Working out your matches" />}
          {ready && state.status === 'error' && (state.error.kind === 'invalid' ? (
            <ProblemPanel title="Some answers could not be used">
              <p>{state.error.message}</p>
              <ul>{state.error.details.map((d) => <li key={`${d.field}-${d.message}`}>{d.message}</li>)}</ul>
              <p><LinkButton to="/afripath-ai" variant="primary">Review my answers</LinkButton></p>
            </ProblemPanel>
          ) : (
            <ProblemPanel title="We could not get your matches"><p>{state.error.message}</p><p><button className="btn btn--primary" type="button" onClick={state.reload}>Try again</button></p></ProblemPanel>
          ))}
          {ready && state.status === 'ready' && <RecommendationsView res={state.data} />}
        </div>
      </section>
    </>
  );
}
