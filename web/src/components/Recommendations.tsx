import { Link } from 'react-router-dom';
import type { FactorBreakdown, Fit, Recommendation, RecommendationResponse } from '../api/types';
import { Arrow } from './Icons';
import { ExtLink } from './ExtLink';
import { LinkButton, Pill, Reveal, RevealLink, type TileTone } from './ui';

const TONES: TileTone[] = ['blue', 'lime', 'pink'];
const PANELS = ['panel--blue', 'panel--lime', 'panel--pink'];

export function Flags({ flags }: { flags: { message: string }[] | undefined }) {
  return <>{(flags ?? []).map((f) => <p className="flag" key={f.message}>{f.message}</p>)}</>;
}

export function FitRing({ fit }: { fit: Fit }) {
  const s = Math.max(0, Math.min(100, Number(fit.score) || 0));
  return (
    <div className="fit" role="img" aria-label={`Heuristic fit score ${s} out of 100. ${fit.label}`}>
      <div className="fit-ring" style={{ '--p': s } as React.CSSProperties}><strong>{Math.round(s)}</strong><small>/100</small></div>
      <p className="fit-label">{fit.label}</p>
    </div>
  );
}

export function FactorBars({ factors }: { factors: FactorBreakdown[] }) {
  return (
    <ul className="bars">
      {factors.map((f) => f.status === 'evaluated' && f.score !== null ? (
        <li key={f.factor}><span>{f.label} <em>({f.weightPercent}% of score)</em></span><span className="bar"><i style={{ width: `${Math.max(0, Math.min(100, f.score))}%` }} /></span><b>{Math.round(f.score)}</b></li>
      ) : (
        <li key={f.factor} className="skipped"><span>{f.label}</span><span className="bar" /><b>skipped</b></li>
      ))}
    </ul>
  );
}

export function RecommendationCard({ rec }: { rec: Recommendation }) {
  const i = rec.rank - 1;
  const gaps = rec.skillGaps;
  const build = [...(gaps.skillsToBuild ?? []).map((s) => s.name ?? ''), ...(gaps.strengthsToBuild ?? []).map((s) => s.label)].filter(Boolean);
  const prereq = gaps.prerequisites ?? [];
  const bridge = gaps.bridgePath;
  const first = rec.firstStep;
  const titleId = `rec-${rec.rank}-t`;
  return (
    <Reveal as="article" delay={i * 0.08} className={`rec ${PANELS[i % 3]}`} aria-labelledby={titleId}>
      <header className="rec-head">
        <span className={`tile${i % 3 === 0 ? '' : ` tile--${TONES[i % 3]}`}`}>0{rec.rank}</span>
        <div className="rec-title"><Pill tone="plain" dot={false}>{rec.category ?? 'Career path'}</Pill><h2 id={titleId} className="display h-md">{rec.title}</h2></div>
        <FitRing fit={rec.fit} />
      </header>
      <p className="rec-summary">{rec.explanation.summary}</p>
      <div className="rec-cols">
        <section><h3>Why this fits</h3><ul>{rec.explanation.reasons.map((r) => <li key={r.text}>{r.text}</li>)}</ul></section>
        <section><h3>What to build</h3>
          {build.length ? <div className="chips chips--sm">{build.map((b) => <span className="chip" key={b}>{b}</span>)}</div> : <p className="small">Nothing specific flagged from your answers.</p>}
          {prereq.length > 0 && <ul className="small-list">{prereq.map((p) => <li key={p.dimension}>{p.message}</li>)}</ul>}
          {bridge && <div className="bridge"><b>A gentle on-ramp:</b> {bridge.title}. {bridge.why} <Link className="link" to={`/roadmap/${bridge.careerId}`}>View this path</Link></div>}
        </section>
      </div>
      {first && (
        <div className="first-step"><h3>Your first step</h3>
          <p>{first.resource ? <>Start with <ExtLink url={first.resource.url}>{first.resource.title}</ExtLink>.</> : first.text}</p>
          {first.why && <p className="small">{first.why}</p>}<Flags flags={first.flags} />
        </div>
      )}
      {rec.explanation.notes[0] && <p className="small note">{rec.explanation.notes[0]}</p>}
      <details className="how-scored"><summary>How we scored this</summary>
        <FactorBars factors={rec.factorBreakdown} />
        <p className="small">{rec.fit.disclaimer} Questions you skipped are left out of the score, never counted as zero.</p>
      </details>
      <footer className="rec-foot"><LinkButton to={`/roadmap/${rec.careerId}`} variant="primary" arrow>See my full roadmap</LinkButton></footer>
    </Reveal>
  );
}

export function RecommendationsView({ res }: { res: RecommendationResponse }) {
  if (res.status === 'insufficient_information') {
    return (
      <div className="panel panel--peach stack">
        <h2 className="display h-md">We need a little more from you</h2>
        <p>{res.message}</p>
        <ul>{res.missingInformation.map((m) => <li key={m.factor}><b>{m.label}:</b> {m.question}</li>)}</ul>
        <p><LinkButton to="/afripath-ai" variant="primary">Back to the survey</LinkButton></p>
      </div>
    );
  }
  const exploratory = res.status === 'exploratory';
  const notes = [...res.notes, ...res.warnings.map((w) => w.message)];
  return (
    <>
      <div className={`notice${exploratory ? ' notice--early' : ''}`}><b>{exploratory ? 'Early signal.' : 'Starting points.'}</b> {res.message} {res.scoreNote}</div>
      <div className="rec-list">{res.recommendations.map((r) => <RecommendationCard key={r.careerId} rec={r} />)}</div>
      {exploratory && res.missingInformation.length > 0 && (
        <div className="panel stack"><h3>Answer more for sharper matches</h3>
          <ul>{res.missingInformation.map((m) => <li key={m.factor}><b>{m.label}:</b> {m.question}</li>)}</ul>
          <p><LinkButton to="/afripath-ai">Add more answers</LinkButton></p>
        </div>
      )}
      {res.explore.otherCareers.length > 0 && (
        <section className="explore"><h2 className="display h-md">Other paths to explore</h2><p className="lead">{res.explore.hint}</p>
          <div className="explore-grid">{res.explore.otherCareers.map((c, i) => (
            <RevealLink key={c.careerId} delay={(i % 3) * 0.06} className="explore-card" to={`/roadmap/${c.careerId}`}>
              <Pill tone="plain" dot={false}>{c.category ?? 'Career path'}</Pill><h3>{c.title}</h3><p>{c.summary}</p><span className="go"><Arrow /></span>
            </RevealLink>
          ))}</div>
        </section>
      )}
      {notes.length > 0 && <div className="notice stack">{notes.map((n) => <p key={n}>{n}</p>)}</div>}
    </>
  );
}

