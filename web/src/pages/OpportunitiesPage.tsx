import { useMemo, useState } from 'react';
import { api } from '../api/client';
import type { OpportunityLead } from '../api/types';
import { LeadsGrid } from '../components/Roadmap';
import { PageHero } from '../components/PageHero';
import { Accent, ProblemPanel, Reveal, Spinner } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import { useTitle } from '../lib/useTitle';

interface Lead { lead: OpportunityLead; careerId: string; careerTitle: string }

/** There is no opportunities endpoint yet, so leads are gathered from each career's roadmap and de-duplicated. */
async function loadLeads(signal: AbortSignal): Promise<Lead[]> {
  const { careers } = await api.careers(signal);
  const plans = await Promise.all(careers.map((c) => api.roadmap(c.careerId, {}, signal).then((p) => ({ c, p })).catch(() => null)));
  const seen = new Set<string>();
  const out: Lead[] = [];
  for (const r of plans) {
    if (!r) continue;
    for (const o of r.p.opportunityLeads) {
      if (seen.has(o.opportunityId)) continue;
      seen.add(o.opportunityId);
      out.push({ lead: o, careerId: r.c.careerId, careerTitle: r.c.title });
    }
  }
  return out;
}

const COMING: [string, string, string][] = [['Scholarships', 'lime', ''], ['Internships', 'blue', '0.06'], ['Summer programmes', 'pink', '0.12'], ['Certifications & grants', 'peach', '0.18']];

export function OpportunitiesPage() {
  useTitle('Opportunities');
  const state = useAsync(loadLeads, 'leads');
  const [active, setActive] = useState('all');
  const leads = state.status === 'ready' ? state.data : [];
  const titles = useMemo(() => [...new Map(leads.map((l) => [l.careerId, l.careerTitle])).entries()], [leads]);
  const shown = leads.filter((l) => active === 'all' || l.careerId === active);

  return (
    <>
      <PageHero pill="Scholarships & Activities" title={['Opportunities worth ', { accent: 'exploring' }]} lead="Scholarships, internships, summer programmes and more. We are building a checked, curated list. Until it is ready, these are leads from our source list for each career path." />
      <section className="wrap" style={{ paddingBottom: 'clamp(40px,5vw,80px)' }}>
        <div className="coming-grid">
          {COMING.map(([name, tone, d]) => (
            <Reveal key={name} delay={Number(d) || 0} className={`panel panel--${tone}`}><span className="status-pill status-pill--soon">Coming</span><h3>{name}</h3></Reveal>
          ))}
        </div>
      </section>
      <section className="section band-lime"><div className="wrap">
        <div className="sec-head"><h2 className="display h-lg">Leads we have <Accent>found so far</Accent></h2>
          <p className="lead">Every lead below is <b>unverified</b>. We have not checked whether it is open, what it costs or who can apply. Always confirm on the official page.</p></div>
        {titles.length > 0 && (
          <div className="filters" role="group" aria-label="Filter leads by career path">
            {[['all', 'All paths'] as const, ...titles].map(([id, t]) => (
              <button key={id} type="button" aria-pressed={id === active} onClick={() => setActive(id)}>{t}</button>
            ))}
          </div>
        )}
        <div aria-live="polite">
          {state.status === 'loading' && <Spinner label="Loading leads" />}
          {state.status === 'error' && <ProblemPanel title="We could not load the leads"><p>{state.error.message}</p><p><button className="btn btn--primary" type="button" onClick={state.reload}>Try again</button></p></ProblemPanel>}
          {state.status === 'ready' && <LeadsGrid leads={shown.map(({ lead, careerTitle }) => ({ lead, careerTitle }))} />}
        </div>
      </div></section>
    </>
  );
}
