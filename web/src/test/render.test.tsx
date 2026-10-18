import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Resource, RoadmapResponse } from '../api/types';
import { LeadsGrid, ResourceItem, RoadmapView } from '../components/Roadmap';
import { RecommendationsView } from '../components/Recommendations';
import { safeUrl } from '../lib/safeUrl';
import { engine, profileOf, REQUEST_NAMES } from './engine';

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const noop = () => undefined;
const LEAK = /undefined|\[object Object\]|NaN/;

describe('recommendation rendering (real engine output)', () => {
  for (const name of REQUEST_NAMES) {
    it(name, () => {
      const res = engine.recommend(profileOf(name));
      const { container } = wrap(<RecommendationsView res={res} />);
      expect(container.textContent!.length).toBeGreaterThan(50);
      expect(container.textContent).not.toMatch(LEAK);
      if (res.status === 'insufficient_information') {
        expect(container.querySelector('a[href="/afripath-ai"]')).not.toBeNull();
      }
      for (const r of res.recommendations) {
        expect(container.querySelector(`a[href="/roadmap/${r.careerId}"]`)).not.toBeNull();
        expect(container.textContent).toContain(r.fit.disclaimer);
      }
      if (res.status === 'exploratory') expect(container.textContent).toMatch(/Early signal/);
    });
  }
});

describe('roadmap rendering', () => {
  it('renders every career with honest labelling', () => {
    for (const c of engine.listCareers()) {
      const plan = engine.roadmap(profileOf('recommend_constrained_access'), c.careerId);
      const { container, unmount } = wrap(<RoadmapView plan={plan} done={new Set()} onToggle={noop} />);
      const text = container.textContent ?? '';
      expect(text, `${c.careerId}: no leaked placeholders`).not.toMatch(LEAK);
      expect(container.querySelectorAll('.pill--peach').length, `${c.careerId}: every opportunity unverified`).toBe(plan.opportunityLeads.length);
      expect(Array.from(container.querySelectorAll('.badge')).some((b) => b.textContent?.trim().toLowerCase() === 'free')).toBe(false);
      expect(text).toContain('Link not independently verified');
      for (const s of plan.stages) expect(container.querySelector(`[data-stage="${s.stageId}"]`)).not.toBeNull();
      unmount();
    }
  });

  it('copes with a missing starting point, first action and pacing', () => {
    const plan = { ...engine.roadmap({}, 'career_cybersecurity'), startingPoint: null, firstAction: null, pacing: null } as RoadmapResponse;
    const { container } = wrap(<RoadmapView plan={plan} done={new Set()} onToggle={noop} />);
    expect(container.textContent).not.toMatch(LEAK);
    expect(container.textContent).toMatch(/Begin at the first stage/);
  });

  it('shows "Source mentions free" only when the engine says so', () => {
    const base = { resourceId: 'r1', title: 'T', provider: 'P', type: 'course', url: 'https://example.org', notes: [], flags: [] };
    const item = (cost: string) => ({ ...base, access: { cost, costNote: 'n' } }) as unknown as Resource;
    const html = (cost: string) => render(<ul><ResourceItem r={item(cost)} done={false} /></ul>).container.textContent ?? '';
    expect(html('source_mentions_free')).toMatch(/Source mentions free/);
    expect(html('unknown')).not.toMatch(/free/i);
    expect(html('may_involve_cost')).toMatch(/May involve cost/);
  });

  it('shows ticks as checked and counts them', () => {
    const plan = engine.roadmap({}, 'career_cybersecurity');
    const id = plan.stages[0]!.resources[0]!.resourceId;
    const { container } = wrap(<RoadmapView plan={plan} done={new Set([id])} onToggle={noop} />);
    expect((container.querySelector(`input[data-res="${id}"]`) as HTMLInputElement).checked).toBe(true);
    expect(container.textContent).toMatch(/1\/\d+ done/);
    expect(screen.getByRole('progressbar', { name: /roadmap progress/i })).toHaveAttribute('aria-valuenow', '1');
  });

  it('marks every lead on the opportunities list as unverified', () => {
    const plan = engine.roadmap({}, 'career_cybersecurity');
    const leads = plan.opportunityLeads.map((lead) => ({ lead, careerTitle: 'Cybersecurity' }));
    const { container } = wrap(<LeadsGrid leads={leads} />);
    expect(container.querySelectorAll('.pill--peach').length).toBe(leads.length);
    const empty = render(<LeadsGrid leads={[]} />);
    expect(empty.container.textContent).toMatch(/No leads/);
  });
});

describe('escaping and unsafe links', () => {
  it('renders API text as text and never makes javascript: links', () => {
    const res = structuredClone(engine.recommend(profileOf('recommend_beginner_programming_ai')));
    const rec = res.recommendations[0]!;
    rec.title = '<img src=x onerror=alert(1)>';
    rec.explanation.summary = '<script>alert(1)</script>';
    rec.firstStep = { ...rec.firstStep!, resource: { resourceId: 'x', title: 'x', url: 'javascript:alert(1)' } as never };
    const { container } = wrap(<RecommendationsView res={res} />);
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a[href^="javascript:" i]')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');

    const plan = structuredClone(engine.roadmap({}, 'career_cybersecurity'));
    plan.opportunityLeads[0]!.url = 'javascript:alert(1)';
    plan.opportunityLeads[0]!.title = '<b>t</b>';
    const r2 = wrap(<RoadmapView plan={plan} done={new Set()} onToggle={noop} />);
    expect(r2.container.querySelector('a[href^="javascript:" i]')).toBeNull();
    expect(Array.from(r2.container.querySelectorAll('b')).some((b) => b.textContent === 't')).toBe(false);
    expect(r2.container.textContent).toContain('<b>t</b>');
  });

  it('safeUrl accepts only http(s)', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,x')).toBeNull();
    expect(safeUrl(null)).toBeNull();
    expect(safeUrl('https://example.org/a')).toBeTruthy();
  });
});
