import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { PageHero } from '../components/PageHero';
import { RoadmapView } from '../components/Roadmap';
import { LinkButton, ProblemPanel, Reveal, Spinner } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import { useProgress } from '../lib/useProgress';
import { useTitle } from '../lib/useTitle';
import { useAnswers } from '../survey/AnswersContext';
import { buildProfile } from '../survey/model';

const VALID_ID = /^[a-z0-9_]{1,80}$/;

export function RoadmapPage() {
  const { careerId = '' } = useParams();
  const { answers } = useAnswers();
  const profile = buildProfile(answers);
  const valid = VALID_ID.test(careerId);
  const state = useAsync((s) => (valid ? api.roadmap(careerId, profile, s) : Promise.reject(new Error('bad id'))), valid ? `${careerId}|${JSON.stringify(profile)}` : 'invalid');
  const { done, toggle } = useProgress(careerId);
  const plan = state.status === 'ready' ? state.data : undefined;
  useTitle(plan ? `${plan.career.title} roadmap` : 'Your roadmap');

  return (
    <>
      <PageHero pill={plan?.career.category ?? 'Roadmap'} title={plan ? [plan.career.title] : ['Your ', { accent: 'roadmap' }]} lead={plan?.career.summary ?? undefined}>
        <Reveal delay={0.22} className="crumbs"><LinkButton to="/results">← Back to my matches</LinkButton></Reveal>
      </PageHero>
      <section className="wrap" style={{ paddingBottom: 'clamp(60px,8vw,130px)' }}>
        <div className="rm-sections" aria-live="polite">
          {!valid && <ProblemPanel title="Choose a path first"><p>Pick one of your matches to see its roadmap.</p><p><LinkButton to="/results" variant="primary">See my matches</LinkButton></p></ProblemPanel>}
          {valid && state.status === 'loading' && <Spinner label="Building your roadmap" />}
          {valid && state.status === 'error' && (state.error.kind === 'not_found'
            ? <ProblemPanel title="We could not find that path"><p>It may have been renamed or removed.</p><p><LinkButton to="/results" variant="primary">Back to my matches</LinkButton></p></ProblemPanel>
            : <ProblemPanel title="We could not build your roadmap"><p>{state.error.message}</p><p><button className="btn btn--primary" type="button" onClick={state.reload}>Try again</button></p></ProblemPanel>)}
          {plan && <RoadmapView plan={plan} done={done} onToggle={toggle} />}
        </div>
      </section>
    </>
  );
}
