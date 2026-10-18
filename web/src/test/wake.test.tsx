import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { api, ApiProblem, retryPolicy } from '../api/client';
import { AnswersProvider } from '../survey/AnswersContext';
import { engine } from './engine';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const HEALTH = { status: 'ok', knowledgeBase: { counts: { careers: 9, stages: 36, resources: 157 } } };
const down = () => { throw new TypeError('Failed to fetch'); };

beforeEach(() => { Object.assign(retryPolicy, { attemptTimeoutMs: 200, maxWaitMs: 1500, retryDelayMs: 10, slowAfterMs: 30 }); });
afterEach(() => { retryPolicy.maxWaitMs = 0; vi.unstubAllGlobals(); });

describe('waking a sleeping engine', () => {
  it('keeps trying through "no answer" and 502/503 until the engine is up', async () => {
    let n = 0;
    const f = vi.fn(async () => { n += 1; if (n === 1) return down(); if (n === 2) return json({}, 502); if (n === 3) return json({}, 503); return json(HEALTH); });
    vi.stubGlobal('fetch', f);
    await expect(api.health()).resolves.toMatchObject({ status: 'ok' });
    expect(f).toHaveBeenCalledTimes(4);
  });

  it('retries a slow attempt that times out', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn((_u: string, init?: RequestInit) => {
      n += 1;
      if (n > 1) return Promise.resolve(json(HEALTH));
      return new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    }));
    await expect(api.health()).resolves.toMatchObject({ status: 'ok' });
    expect(n).toBe(2);
  });

  it('gives up after the waiting budget and reports a clear error', async () => {
    retryPolicy.maxWaitMs = 120;
    const f = vi.fn(async () => down());
    vi.stubGlobal('fetch', f);
    const err = await api.health().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiProblem);
    expect((err as ApiProblem).kind).toBe('network');
    expect(f.mock.calls.length).toBeGreaterThan(1);
    expect(f.mock.calls.length).toBeLessThan(40);
  });

  it('never retries answers that are not about start-up (422, 404, 500)', async () => {
    for (const status of [422, 404, 500]) {
      const f = vi.fn(async () => json({ error: { code: 'X', message: 'x', requestId: 'r' } }, status));
      vi.stubGlobal('fetch', f);
      await api.health().catch(() => undefined);
      expect(f, `status ${status}`).toHaveBeenCalledTimes(1);
    }
  });

  it('stops retrying when the page cancels the request', async () => {
    const f = vi.fn(async () => down());
    vi.stubGlobal('fetch', f);
    const ctl = new AbortController();
    const p = api.health(ctl.signal).catch((e: unknown) => e);
    setTimeout(() => ctl.abort(), 40);
    const err = await p;
    expect((err as ApiProblem).kind).toBe('aborted');
    const calls = f.mock.calls.length;
    await new Promise((r) => setTimeout(r, 80));
    expect(f.mock.calls.length).toBe(calls);
  });

  it('shows the waking notice only while the engine is slow, then recovers by itself', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      const url = String(u);
      if (url.endsWith('/v1/options')) {
        n += 1;
        if (n < 8) { await new Promise((r) => setTimeout(r, 15)); return down(); }
        return json(engine.options());
      }
      return json(HEALTH);
    }));
    render(<MemoryRouter initialEntries={['/afripath-ai']}><AnswersProvider><App /></AnswersProvider></MemoryRouter>);
    expect(screen.queryByText(/Waking up the server/)).toBeNull();
    expect(await screen.findByText(/Waking up the server/)).toBeInTheDocument();
    expect(await screen.findByText(/Step 1 of 6/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Waking up the server/)).toBeNull());
  });
});
