import { Link } from 'react-router-dom';
import type { OpportunityLead, Resource, RoadmapResponse, Stage } from '../api/types';
import { ExtLink } from './ExtLink';
import { Flags } from './Recommendations';
import { Pill, Reveal, Tile, type TileTone } from './ui';

const TONES: TileTone[] = ['blue', 'lime', 'pink', 'peach'];
const GRID_PANEL = ['panel--blue', 'panel--lime', 'panel--pink'];

export const COST_LABEL = {
  may_involve_cost: ['May involve cost', 'cost-warn'],
  source_mentions_free: ['Source mentions free', 'cost-ok'],
  unknown: ['Cost not stated', 'cost-unk'],
} as const;
export const STAGE_STATUS: Record<string, string> = { start_here: 'Start here', covered_by_your_answers: 'Covered by your answers', upcoming: 'Up next' };

const words = (s: string | null | undefined) => (s ? s.replace(/_/g, ' ') : '');

export function ResourceItem({ r, done, onToggle }: { r: Resource; done: boolean; onToggle?: (id: string, checked: boolean) => void }) {
  const [costText, costCls] = COST_LABEL[r.access.cost ?? 'unknown'];
  return (
    <li className={`res${done ? ' is-done' : ''}`}>
      <label className="tick">
        <input type="checkbox" checked={done} onChange={(e) => onToggle?.(r.resourceId, e.target.checked)} data-res={r.resourceId} />
        <span className="sr-only">Mark “{r.title}” as done</span><i aria-hidden="true" />
      </label>
      <div className="res-body">
        <h5><ExtLink url={r.url} className="res-link">{r.title}</ExtLink></h5>
        <p className="small">{r.provider}{r.type ? ` · ${words(r.type)}` : ''}</p>
        <div className="badges">
          <span className={`badge ${costCls}`}>{costText}</span>
          {r.access.dataUse === 'video_heavy' && <span className="badge cost-warn">Data-heavy (video)</span>}
          {r.access.needsAccountSetup && <span className="badge cost-unk">Needs an account</span>}
        </div>
        {r.access.costNote && <p className="small">{r.access.costNote}</p>}
        {(r.notes ?? []).map((n) => <p className="small" key={n}>{n}</p>)}
        <Flags flags={r.flags} />
        <p className="small faint">Link not independently verified. Check it before relying on it.</p>
      </div>
    </li>
  );
}

function StageCard({ s, done, onToggle }: { s: Stage; done: Set<string>; onToggle: (id: string, checked: boolean) => void }) {
  const total = s.resources.length;
  const n = s.resources.filter((r) => done.has(r.resourceId)).length;
  const order = s.order ?? 1;
  const status = STAGE_STATUS[s.status];
  return (
    <Reveal as="article" className={`stage panel${s.status === 'start_here' ? ' is-start' : ''}${s.status === 'covered_by_your_answers' ? ' is-covered' : ''}`} data-stage={s.stageId}>
      <header className="stage-head">
        <Tile tone={TONES[(order - 1) % 4]}>{String(order).padStart(2, '0')}</Tile>
        <div><h3>{s.name}</h3><p className="small">{s.durationPerSource}{s.durationPerSource ? ' · as written by the sources, not a deadline' : ''}</p></div>
        {status && <Pill tone={s.status === 'start_here' ? 'lime' : 'plain'}>{status}</Pill>}
        {total > 0 && <span className="stage-count" data-count>{n}/{total} done</span>}
      </header>
      {s.focus && <p>{s.focus}</p>}
      {!!s.prerequisitesPerSource?.length && <p className="small"><b>Before you start (per source):</b> {s.prerequisitesPerSource.join('; ')}</p>}
      {!!s.actions?.length && <><h4>Actions</h4><ul>{s.actions.map((a) => <li key={a}>{a}</li>)}</ul></>}
      {!!s.weeklyPlanPerSource?.length && <><h4>Weekly plan (per source)</h4><ul className="plain">{s.weeklyPlanPerSource.map((w) => (
        <li key={`${w.weeks}-${w.goal}`}><b>Week {w.weeks}:</b> {w.goal}{!!w.actions?.length && <ul>{w.actions.map((a) => <li key={a}>{a}</li>)}</ul>}</li>
      ))}</ul></>}
      {s.activities.length > 0 && <><h4>Activities</h4><ul className="plain">{s.activities.map((a, i) => (
        <li key={a.activityId ?? i}><b>{a.title}</b>{!!a.resources?.length && <> — {a.resources.map((r, j) => <span key={r.resourceId}>{j > 0 && ', '}<ExtLink url={r.url}>{r.title}</ExtLink></span>)}</>}{a.note && <><br /><span className="small">{a.note}</span></>}</li>
      ))}</ul></>}
      {total > 0 && <><h4>Resources</h4><ul className="res-list">{s.resources.map((r) => <ResourceItem key={r.resourceId} r={r} done={done.has(r.resourceId)} onToggle={onToggle} />)}</ul></>}
      {!!s.communities.length && <><h4>Communities</h4><ul>{s.communities.map((c) => <li key={c.communityId ?? c.name}><ExtLink url={c.url}>{c.name}</ExtLink>{c.type && <> <span className="small">({c.type})</span></>}</li>)}</ul></>}
      {!!s.checkpoints?.length && <><h4>Checkpoints</h4><ul>{s.checkpoints.map((c) => <li key={c}>{c}</li>)}</ul></>}
      {s.gaps.length > 0 && <div className="notice">{s.gaps.map((g) => <p key={g}>{g}</p>)}</div>}
    </Reveal>
  );
}

export function LeadCard({ o, careerTitle, index = 0 }: { o: OpportunityLead; careerTitle?: string; index?: number }) {
  return (
    <Reveal as="article" delay={(index % 3) * 0.07} className="panel lead">
      <Pill tone="peach">Unverified lead</Pill>
      <h3><ExtLink url={o.url} className="res-link">{o.title}</ExtLink></h3>
      {(careerTitle || o.type) && <p className="small">{[careerTitle, words(o.type)].filter(Boolean).join(' · ')}</p>}
      {o.eligibility && <p className="small">{o.eligibility}</p>}
      <p className="flag">{o.statusNote}</p>
    </Reveal>
  );
}

export function RoadmapView({ plan, done, onToggle }: { plan: RoadmapResponse; done: Set<string>; onToggle: (id: string, checked: boolean) => void }) {
  const first = plan.firstAction;
  const week = plan.pacing?.firstWeek ?? [];
  const pq = plan.prerequisiteGuidance;
  const hasPq = !!pq.prerequisites?.length || !!pq.bridgePath;
  const total = plan.stages.reduce((a, s) => a + s.resources.length, 0);
  const count = plan.stages.reduce((a, s) => a + s.resources.filter((r) => done.has(r.resourceId)).length, 0);
  const closing = [...plan.knowledgeGaps, ...plan.caveats, ...plan.warnings.map((w) => w.message)];
  return (
    <>
      <div className="overall" id="overall">
        <span>{count} of {total} resources done</span>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={count} aria-label="Roadmap progress"><i style={{ width: total ? `${(count / total) * 100}%` : '0' }} /></div>
        <small className="small">Ticks are saved in this browser only.</small>
      </div>
      <section className="rm-top">
        <div className="panel panel--lime first-action"><Pill tone="plain" dot={false}>Your first action</Pill>
          <h2 className="display h-md">{first?.resource ? <ExtLink url={first.resource.url} className="big-link">{first.resource.title}</ExtLink> : (first?.text ?? 'Start with the first stage')}</h2>
          <p>{first?.why}</p><Flags flags={first?.flags} />
        </div>
        <div className="panel panel--blue"><h3>Where you start</h3>
          {plan.startingPoint ? <><p><b>{plan.startingPoint.name}</b></p><p className="small">{plan.startingPoint.reason}</p></> : <p className="small">Begin at the first stage and move on when you feel ready.</p>}
          {week.length > 0 && <><h4>A first week{plan.pacing?.weeklyHours ? ` at about ${plan.pacing.weeklyHours} h/week` : ''}</h4>
            <ul>{week.map((w) => <li key={w.title}>{w.resource ? <ExtLink url={w.resource.url}>{w.title}</ExtLink> : w.title}</li>)}</ul></>}
          {plan.pacing?.note && <p className="small">{plan.pacing.note}</p>}
        </div>
      </section>
      {hasPq && (
        <section className="panel stack"><h3>Before you dive deep</h3>
          {!!pq.prerequisites?.length && <ul>{pq.prerequisites.map((p) => <li key={p.dimension}>{p.message}</li>)}</ul>}
          {pq.bridgePath && <div className="bridge"><b>A gentle on-ramp:</b> {pq.bridgePath.title}. {pq.bridgePath.why} <Link className="link" to={`/roadmap/${pq.bridgePath.careerId}`}>View this path</Link></div>}
        </section>
      )}
      <section><h2 className="display h-md">Your stages</h2>
        <div className="roadmap-line">{plan.stages.map((s) => <StageCard key={s.stageId} s={s} done={done} onToggle={onToggle} />)}</div>
      </section>
      {plan.projects.length > 0 && (
        <section><h2 className="display h-md">Projects to build</h2><div className="grid-2">{plan.projects.map((p) => (
          <article className="panel" key={p.projectId}><h3>{p.title}</h3><p>{p.description}</p>
            {p.difficulty !== 'not_specified' && <p className="small">Difficulty: {p.difficulty}</p>}
            {p.safetyNote && <p className="flag"><b>Safety:</b> {p.safetyNote}</p>}
          </article>
        ))}</div></section>
      )}
      {plan.learningTracks.length > 0 && (
        <section><h2 className="display h-md">Learning tracks</h2><div className="grid-2">{plan.learningTracks.map((t) => (
          <article className="panel" key={t.trackId ?? t.title}><h3>{t.title}</h3><p>{t.summary}</p>
            <p className="small">{t.provider}{t.catalog && <> · <ExtLink url={t.catalog.url}>{t.catalog.title}</ExtLink></>}</p><p className="small faint">{t.note}</p></article>
        ))}</div></section>
      )}
      {plan.opportunityLeads.length > 0 && (
        <section><h2 className="display h-md">Opportunity leads</h2>
          <p className="lead">These came from our source list. None has been checked by us, so confirm dates, eligibility and costs on the official page.</p>
          <div className="grid-2">{plan.opportunityLeads.map((o, i) => <LeadCard key={o.opportunityId} o={o} index={i} />)}</div></section>
      )}
      {(plan.guidance.length > 0 || plan.accessConsiderations.length > 0) && (
        <section className="grid-2">
          {plan.guidance.length > 0 && <div className="panel"><h3>Tips from the sources</h3><ul>{plan.guidance.map((g) => <li key={g.text}>{g.text}</li>)}</ul></div>}
          {plan.accessConsiderations.length > 0 && <div className="panel"><h3>Access and cost</h3><ul>{plan.accessConsiderations.map((a) => <li key={a.code}>{a.message}</li>)}</ul></div>}
        </section>
      )}
      {closing.length > 0 && <section className="notice stack">{closing.map((c) => <p key={c}>{c}</p>)}</section>}
    </>
  );
}

export function LeadsGrid({ leads }: { leads: { lead: OpportunityLead; careerTitle: string }[] }) {
  if (!leads.length) return <div className="notice">No leads could be loaded right now.</div>;
  return <div className="grid-3">{leads.map(({ lead, careerTitle }, i) => <LeadCard key={lead.opportunityId} o={lead} careerTitle={careerTitle} index={i} />)}</div>;
}

export { GRID_PANEL };
