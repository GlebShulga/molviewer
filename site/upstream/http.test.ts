// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJson, rcsbGraphql, rcsbGraphqlUrl } from './http';

type Init = RequestInit & { cf?: unknown };

function recordingFetch(body: unknown, status = 200) {
  const calls: { url: string; init: Init }[] = [];
  const fetchImpl = vi.fn(async (url: string, init: Init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

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

afterEach(() => vi.unstubAllGlobals());

describe('upstream cache policy', () => {
  it('caches successes for a day and 404s for an hour, and never other errors', async () => {
    const { fetchImpl, calls } = recordingFetch({});
    await getJson('https://data.rcsb.org/rest/v1/core/entry/1CRN', { fetchImpl });
    expect(calls[0].init.cf).toEqual({
      cacheEverything: true,
      cacheTtlByStatus: { '200-299': 86400, '404': 3600, '400-403': -1, '405-499': -1, '500-599': -1 },
    });
  });

  it('sends no cf at all when asked', async () => {
    const { fetchImpl, calls } = recordingFetch({});
    await getJson('https://x.example/a', { fetchImpl, cf: null });
    expect('cf' in calls[0].init).toBe(false);
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
