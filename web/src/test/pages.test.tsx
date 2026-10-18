import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { NAV } from '../components/Layout';
import { AnswersProvider } from '../survey/AnswersContext';
import type { Answers } from '../survey/model';
import { buildProfile } from '../survey/model';
import { engine, profileOf } from './engine';

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Answers the API paths from the real engine, with per-test overrides for failure cases. */
function mockApi(over: Handler = () => undefined as never) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const o = await over(url, init);
    if (o) return o;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith('/health')) return json({ status: 'ok', knowledgeBase: { counts: { careers: 9, stages: 36, resources: 157 } } });
    if (url.endsWith('/v1/options')) return json(engine.options());
    if (url.endsWith('/v1/careers')) return json({ careers: engine.listCareers() });
    if (url.endsWith('/v1/recommendations')) return json(engine.recommend(body.profile));
    if (url.endsWith('/v1/roadmaps')) return json(engine.roadmap(body.profile ?? {}, body.careerId));
    return json({ error: { code: 'NOT_FOUND', message: 'nope', requestId: 'x' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const open = (path: string, answers: Answers = {}) =>
  render(<MemoryRouter initialEntries={[path]}><AnswersProvider initial={answers}><App /></AnswersProvider></MemoryRouter>);

const STRONG: Answers = { interests: ['web_building'], currentSkills: ['programming'], workStyles: ['building'], educationLevel: 'senior_secondary', subjects: ['ict_computing'], goals: ['technical_career'], programmingExperience: 'none' };

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('every page', () => {
  const routes = ['/', '/afripath-ai', '/about', '/opportunities', '/mentorship', '/login', '/privacy', '/nope'];
  for (const r of routes) {
    it(`${r} has exactly one h1 and a main landmark`, async () => {
      mockApi();
      open(r);
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('main')).toBeInTheDocument();
      await waitFor(() => expect(document.title).toMatch(/^AfriPath AI/));
    });
  }

  it('every nav link points at a real page', () => {
    mockApi();
    open('/');
    const header = screen.getAllByRole('navigation')[0]!;
    const hrefs = within(header).getAllByRole('link').map((a) => a.getAttribute('href'));
    for (const n of NAV) expect(hrefs).toContain(n.to);
    expect(NAV.map((n) => n.label)).toEqual(['Opportunities', 'Live Mentorship', 'About', 'AfriPath AI']);
  });
});

describe('home', () => {
  it('shows real engine counts, and hides them when the engine is unreachable', async () => {
    mockApi();
    const a = open('/');
    expect(await screen.findByText('157')).toBeInTheDocument();
    a.unmount();
    mockApi(() => { throw new TypeError('down'); });
    open('/');
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText('157')).toBeNull();
    expect(screen.getByText('Survey first')).toBeInTheDocument();
  });

  it('opens and closes FAQ answers', async () => {
    mockApi();
    open('/');
    const q = screen.getByRole('button', { name: 'Is mentorship guaranteed?' });
    expect(q).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(q);
    expect(q).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('survey', () => {
  it('walks every step, keeps answers in sessionStorage and lets a chosen radio be cleared', async () => {
    mockApi();
    open('/afripath-ai');
    const u = userEvent.setup();
    await screen.findByText(/Step 1 of 6/);
    await u.click(screen.getByLabelText('Programming and building websites'));
    expect(JSON.parse(sessionStorage.getItem('afripath.answers.v1')!)).toEqual({ interests: ['web_building'] });
    await u.click(screen.getByRole('button', { name: /^Skip this step/ }));
    await u.click(screen.getByRole('button', { name: /^Skip this step/ }));
    await u.click(screen.getByRole('button', { name: /^Skip this step/ }));
    await screen.findByText(/Step 4 of 6/);
    const radio = screen.getByLabelText('Senior high (SHS)');
    await u.click(radio);
    expect(radio).toBeChecked();
    await u.click(radio);
    expect(radio).not.toBeChecked();
    expect(JSON.parse(sessionStorage.getItem('afripath.answers.v1')!).educationLevel).toBeUndefined();
    await u.click(screen.getByRole('button', { name: /Back/ }));
    await screen.findByText(/Step 3 of 6/);
  });

  it('shows a retry when the options cannot load', async () => {
    let fail = true;
    mockApi((url) => (fail && url.endsWith('/v1/options') ? json({ error: { code: 'X', message: 'x', requestId: 'r' } }, 502) : undefined as never));
    open('/afripath-ai');
    const retry = await screen.findByRole('button', { name: 'Try again' });
    fail = false;
    await userEvent.click(retry);
    expect(await screen.findByText(/Step 1 of 6/)).toBeInTheDocument();
  });

  it('sends only survey fields to the engine', async () => {
    const f = mockApi();
    open('/results', { ...STRONG, email: 'a@b.c', name: 'x' } as Answers);
    await screen.findByText(/Starting points|Early signal/);
    const call = f.mock.calls.find(([u]) => String(u).endsWith('/v1/recommendations'))!;
    const body = JSON.parse(String(call[1]!.body));
    expect(Object.keys(body.profile)).not.toContain('email');
    expect(Object.keys(body.profile)).not.toContain('name');
    expect(body.profile).toEqual(buildProfile(STRONG));
  });
});

describe('results states', () => {
  it('asks for the survey when there are no answers, without calling the engine', () => {
    const f = mockApi();
    open('/results');
    expect(screen.getByText('Take the survey first')).toBeInTheDocument();
    expect(f.mock.calls.some(([u]) => String(u).includes('/v1/recommendations'))).toBe(false);
  });

  it('shows the matches and a heuristic notice', async () => {
    mockApi();
    open('/results', STRONG);
    expect(await screen.findAllByRole('article')).not.toHaveLength(0);
    expect(screen.getAllByText(/heuristic/i).length).toBeGreaterThan(0);
    await waitFor(() => expect(document.title).toMatch(/and more$/));
  });

  it('handles insufficient information', async () => {
    mockApi();
    open('/results', { budget: 'none' });
    expect(await screen.findByText('We need a little more from you')).toBeInTheDocument();
  });

  it('handles exploratory evidence', async () => {
    mockApi();
    open('/results', profileOf('recommend_minimal_interests_only') as Answers);
    expect(await screen.findByText('Early signal.')).toBeInTheDocument();
  });

  it('handles a 502 with retry, a network failure, and a 422 with the reasons', async () => {
    mockApi((u) => (u.endsWith('/v1/recommendations') ? json({ error: { code: 'BAD_GATEWAY', message: 'x', requestId: 'r' } }, 502) : undefined as never));
    const a = open('/results', STRONG);
    expect(await screen.findByText('We could not get your matches')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    a.unmount();

    mockApi((u) => { if (u.endsWith('/v1/recommendations')) throw new TypeError('Failed to fetch'); return undefined as never; });
    const b = open('/results', STRONG);
    expect(await screen.findByText('We could not get your matches')).toBeInTheDocument();
    b.unmount();

    mockApi((u) => (u.endsWith('/v1/recommendations')
      ? json({ error: { code: 'VALIDATION_ERROR', message: 'Some answers are not valid.', requestId: 'r', details: [{ field: 'goals', message: 'goals: unknown value "x"' }] } }, 422)
      : undefined as never));
    open('/results', STRONG);
    expect(await screen.findByText('Some answers could not be used')).toBeInTheDocument();
    expect(screen.getByText(/unknown value "x"/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review my answers' })).toHaveAttribute('href', '/afripath-ai');
  });
});

describe('roadmap page', () => {
  it('renders a roadmap and saves ticks for that career only, in this browser', async () => {
    mockApi();
    open('/roadmap/career_cybersecurity');
    const boxes = await screen.findAllByRole('checkbox');
    await userEvent.click(boxes[0]!);
    expect(boxes[0]).toBeChecked();
    const saved = JSON.parse(localStorage.getItem('afripath.progress.career_cybersecurity')!);
    expect(saved).toHaveLength(1);
    expect(Object.keys(localStorage).filter((k) => k.startsWith('afripath.progress.'))).toEqual(['afripath.progress.career_cybersecurity']);
    await userEvent.click(boxes[0]!);
    expect(JSON.parse(localStorage.getItem('afripath.progress.career_cybersecurity')!)).toEqual([]);
  });

  it('restores earlier ticks', async () => {
    const plan = engine.roadmap({}, 'career_cybersecurity');
    const id = plan.stages[0]!.resources[0]!.resourceId;
    localStorage.setItem('afripath.progress.career_cybersecurity', JSON.stringify([id]));
    mockApi();
    open('/roadmap/career_cybersecurity');
    await screen.findAllByRole('checkbox');
    expect(screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked)).toHaveLength(1);
  });

  it('rejects a malformed id without calling the engine, and explains a 404', async () => {
    const f = mockApi();
    const a = open('/roadmap/BAD%20ID!');
    expect(screen.getByText('Choose a path first')).toBeInTheDocument();
    expect(f.mock.calls.some(([u]) => String(u).includes('/v1/roadmaps'))).toBe(false);
    a.unmount();
    mockApi((u) => (u.endsWith('/v1/roadmaps') ? json({ error: { code: 'NOT_FOUND', message: 'x', requestId: 'r' } }, 404) : undefined as never));
    open('/roadmap/career_missing');
    expect(await screen.findByText('We could not find that path')).toBeInTheDocument();
  });
});

describe('opportunities page', () => {
  it('lists only unverified leads and filters by career', async () => {
    mockApi();
    open('/opportunities');
    const filters = await screen.findByRole('group', { name: /filter leads/i });
    const cards = () => document.querySelectorAll('article.lead');
    const all = cards().length;
    expect(all).toBeGreaterThan(0);
    expect(document.querySelectorAll('article.lead .pill--peach')).toHaveLength(all);
    const buttons = within(filters).getAllByRole('button');
    await userEvent.click(buttons[1]!);
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
    expect(cards().length).toBeLessThanOrEqual(all);
  });

  it('says so when the engine is down', async () => {
    mockApi(() => { throw new TypeError('down'); });
    open('/opportunities');
    expect(await screen.findByText('We could not load the leads')).toBeInTheDocument();
  });
});

describe('coming-soon pages make no claims', () => {
  it('mentorship says no mentors are announced and login is disabled', () => {
    mockApi();
    const a = open('/mentorship');
    expect(screen.getByText(/no mentors have been announced/i)).toBeInTheDocument();
    a.unmount();
    open('/login');
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByLabelText('Password')).toBeDisabled();
  });
});
