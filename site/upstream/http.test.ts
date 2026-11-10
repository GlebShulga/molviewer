// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BACKGROUND_LIMIT_MS, getJson, rcsbGraphql, rcsbGraphqlUrl } from './http';
import { fixtureFetch } from './__fixtures__/fixtureFetch';

type Init = RequestInit & { cf?: unknown };

function recordingFetch(body: unknown, status = 200) {
  const calls: { url: string; init: Init }[] = [];
  const fetchImpl = vi.fn(async (url: string, init: Init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function recordingWaitUntil() {
  const promises: Promise<unknown>[] = [];
  return { promises, waitUntil: (p: Promise<unknown>) => void promises.push(p) };
}

/**
 * A fetch that answers `status` (404 by default) with a body that never ends.
 * Like a real fetch, an abort errors the body; `cancelled` says whether the
 * body was cancelled.
 */
function endlessError(status = 404) {
  const state = { cancelled: false, signal: undefined as AbortSignal | undefined };
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    state.signal = init?.signal ?? undefined;
    const body = new ReadableStream({
      start(c) {
        init?.signal?.addEventListener('abort', () => c.error(new DOMException('Aborted', 'AbortError')));
      },
      cancel() {
        state.cancelled = true;
      },
    });
    return new Response(body, { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, state };
}

const MISSING = 'https://data.rcsb.org/rest/v1/core/entry/0XXX';
const MISSING_ANSWER = { ok: false, status: 404, message: 'HTTP 404 from data.rcsb.org' };

function mapCache() {
  const store = new Map<string, string>();
  vi.stubGlobal('caches', {
    default: {
      match: async (req: Request) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
      put: async (req: Request, resp: Response) => void store.set(req.url, await resp.text()),
    },
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('upstream cache policy', () => {
  it('caches successes for a day and 404s for an hour, and never other errors', async () => {
    const { fetchImpl, calls } = recordingFetch({});
    await getJson('https://data.rcsb.org/rest/v1/core/entry/1CRN', { fetchImpl });
    expect(calls[0].init.cf).toEqual({
      cacheEverything: true,
      cacheTtlByStatus: { '200-299': 86400, '404': 3600, '400-403': -1, '405-499': -1, '500-599': -1 },
    });
  });

  it('reads the body of an error answer in the background, so a 404 can be cached', async () => {
    let resp: Response | undefined;
    const fetchImpl = (async () => {
      resp = new Response('{"message":"not found"}', { status: 404 });
      return resp;
    }) as unknown as typeof fetch;
    const bg = recordingWaitUntil();
    const r = await getJson(MISSING, { fetchImpl, waitUntil: bg.waitUntil });
    expect(r).toEqual(MISSING_ANSWER);
    expect(bg.promises).toHaveLength(1);
    await expect(bg.promises[0]).resolves.toEqual(MISSING_ANSWER);
    expect(resp?.bodyUsed).toBe(true);
  });

  it('answers with the status at once, even when the error body is slow', async () => {
    // A body that never ends: the 404 must not turn into a timeout.
    const { fetchImpl } = endlessError();
    const r = await getJson(MISSING, { fetchImpl, timeoutMs: 50 });
    expect(r).toEqual(MISSING_ANSWER);
  });

  it('limits reading an error body in the background to BACKGROUND_LIMIT_MS since the start', async () => {
    vi.useFakeTimers();
    const { fetchImpl, state } = endlessError();
    const bg = recordingWaitUntil();
    const r = await getJson(MISSING, { fetchImpl, timeoutMs: 4000, waitUntil: bg.waitUntil });
    expect(r).toEqual(MISSING_ANSWER);
    expect(bg.promises).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(BACKGROUND_LIMIT_MS - 1);
    expect(state.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.signal?.aborted).toBe(true);
    await expect(bg.promises[0]).resolves.toEqual(MISSING_ANSWER);
  });

  it('cancels the error body without waitUntil', async () => {
    const { fetchImpl, state } = endlessError();
    expect(await getJson(MISSING, { fetchImpl })).toEqual(MISSING_ANSWER);
    await vi.waitFor(() => expect(state.cancelled).toBe(true));
  });

  it('cancels the error body without edge caching, even with waitUntil', async () => {
    const { fetchImpl, state } = endlessError();
    const bg = recordingWaitUntil();
    expect(await getJson(MISSING, { fetchImpl, cf: null, waitUntil: bg.waitUntil })).toEqual(MISSING_ANSWER);
    await vi.waitFor(() => expect(state.cancelled).toBe(true));
    expect(bg.promises).toHaveLength(0);
  });

  it('cancels an error body the edge cache never keeps (here 503), even with waitUntil', async () => {
    const { fetchImpl, state } = endlessError(503);
    const bg = recordingWaitUntil();
    const r = await getJson(MISSING, { fetchImpl, waitUntil: bg.waitUntil });
    expect(r).toEqual({ ok: false, status: 503, message: 'HTTP 503 from data.rcsb.org' });
    await vi.waitFor(() => expect(state.cancelled).toBe(true));
    await expect(bg.promises[0]).resolves.toEqual(r);
  });

  it('sends no cf at all when asked', async () => {
    const { fetchImpl, calls } = recordingFetch({});
    await getJson('https://x.example/a', { fetchImpl, cf: null });
    expect('cf' in calls[0].init).toBe(false);
  });
});

describe('getJson timeout', () => {
  // Served from __fixtures__/pdbe-ss-3DNI.json (see routes.ts).
  const PDBE_3DNI = 'https://www.ebi.ac.uk/pdbe/api/pdb/entry/secondary_structure/3dni';
  const FIXTURE = 'pdbe-ss-3DNI.json';

  it('answers at the timeout and lets an edge-cached request finish in the background', async () => {
    const { fetchImpl, inits } = fixtureFetch({ [FIXTURE]: { delayMs: 200 } });
    const bg = recordingWaitUntil();
    const r = await getJson(PDBE_3DNI, { fetchImpl, timeoutMs: 50, waitUntil: bg.waitUntil });
    expect(r).toEqual({ ok: false, message: 'Timeout after 50 ms from www.ebi.ac.uk' });
    expect(bg.promises).toHaveLength(1);

    const fixture = JSON.parse(readFileSync(new URL(`./__fixtures__/${FIXTURE}`, import.meta.url), 'utf8'));
    await expect(bg.promises[0]).resolves.toEqual({ ok: true, status: 200, data: fixture });
    expect(inits[0]?.signal?.aborted).toBe(false);
  });

  it('aborts at the timeout without waitUntil', async () => {
    const { fetchImpl, inits } = fixtureFetch({ [FIXTURE]: { delayMs: 200 } });
    const r = await getJson(PDBE_3DNI, { fetchImpl, timeoutMs: 50 });
    expect(r).toEqual({ ok: false, message: 'Timeout after 50 ms from www.ebi.ac.uk' });
    expect(inits[0]?.signal?.aborted).toBe(true);
  });

  it('aborts at the timeout without edge caching, even with waitUntil', async () => {
    const { fetchImpl, inits } = fixtureFetch({ [FIXTURE]: { delayMs: 200 } });
    const bg = recordingWaitUntil();
    const r = await getJson(PDBE_3DNI, { fetchImpl, timeoutMs: 50, cf: null, waitUntil: bg.waitUntil });
    expect(r.ok).toBe(false);
    expect(inits[0]?.signal?.aborted).toBe(true);
    expect(bg.promises).toHaveLength(0);
  });

  it('aborts the background request at BACKGROUND_LIMIT_MS since it started', async () => {
    vi.useFakeTimers();
    const { fetchImpl, inits } = fixtureFetch({ [FIXTURE]: { hang: true } });
    const bg = recordingWaitUntil();
    const p = getJson(PDBE_3DNI, { fetchImpl, timeoutMs: 4000, waitUntil: bg.waitUntil });
    await vi.advanceTimersByTimeAsync(4000);
    expect((await p).ok).toBe(false);
    expect(bg.promises).toHaveLength(1);

    const signal = inits[0]?.signal;
    await vi.advanceTimersByTimeAsync(BACKGROUND_LIMIT_MS - 4000 - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    await expect(bg.promises[0]).resolves.toMatchObject({ ok: false });
  });

  it('never cuts a request off before its own timeout, even one longer than BACKGROUND_LIMIT_MS', async () => {
    vi.useFakeTimers();
    const timeoutMs = BACKGROUND_LIMIT_MS + 5000;
    const { fetchImpl, inits } = fixtureFetch({ [FIXTURE]: { hang: true } });
    const bg = recordingWaitUntil();
    const p = getJson(PDBE_3DNI, { fetchImpl, timeoutMs, waitUntil: bg.waitUntil });
    await vi.advanceTimersByTimeAsync(timeoutMs - 1);
    expect(inits[0]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toEqual({ ok: false, message: `Timeout after ${timeoutMs} ms from www.ebi.ac.uk` });
  });

  it('hands a fast answer to waitUntil once, already settled', async () => {
    const { fetchImpl, inits } = fixtureFetch();
    const bg = recordingWaitUntil();
    const r = await getJson(PDBE_3DNI, { fetchImpl, waitUntil: bg.waitUntil });
    expect(r.ok).toBe(true);
    expect(bg.promises).toHaveLength(1);
    await expect(bg.promises[0]).resolves.toEqual(r);
    expect(inits[0]?.signal?.aborted).toBe(false);
  });
});

describe('rcsbGraphql', () => {
  const query = '{ entry(entry_id: "1CRN") { rcsb_id } }';

  it('stores a successful answer and serves it from the cache next time', async () => {
    const store = mapCache();
    const ok = recordingFetch({ data: { entry: { rcsb_id: '1CRN' } } });
    const first = await rcsbGraphql(query, {}, { fetchImpl: ok.fetchImpl });
    expect(first.ok).toBe(true);
    expect('cf' in ok.calls[0].init).toBe(false);
    expect(store.has(rcsbGraphqlUrl(query, {}))).toBe(true);

    const again = recordingFetch({ data: null });
    const second = await rcsbGraphql(query, {}, { fetchImpl: again.fetchImpl });
    expect(second).toMatchObject({ ok: true, data: { entry: { rcsb_id: '1CRN' } } });
    expect(again.calls).toHaveLength(0);
  });

  it('does not store a GraphQL error (HTTP 200 with errors)', async () => {
    const store = mapCache();
    const failing = recordingFetch({ errors: [{ message: 'rate limited' }] });
    const r = await rcsbGraphql(query, {}, { fetchImpl: failing.fetchImpl });
    expect(r.ok).toBe(false);
    expect(store.size).toBe(0);
  });

  it('just fetches where there is no Workers cache', async () => {
    const ok = recordingFetch({ data: { entry: { rcsb_id: '1CRN' } } });
    expect((await rcsbGraphql(query, {}, { fetchImpl: ok.fetchImpl })).ok).toBe(true);
    expect(ok.calls).toHaveLength(1);
  });
});
