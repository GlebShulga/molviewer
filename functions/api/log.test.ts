// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './log';

type Forwarded = { common: { attributes: Record<string, unknown> }; logs: { message: string; level: string; timestamp: number; attributes: Record<string, unknown> }[] }[];

let fetchMock: ReturnType<typeof vi.fn>;
/** What the Function handed to waitUntil. */
let pending: Promise<unknown>[] = [];

function post(body: BodyInit, { host = 'molviewer.bio', headers = {}, key = 'test-key' }: { host?: string; headers?: Record<string, string>; key?: string } = {}) {
  const request = new Request(`https://${host}/api/log`, { method: 'POST', body, headers, duplex: 'half' } as RequestInit);
  const env = key ? { NEW_RELIC_LICENSE_KEY: key } : {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (onRequestPost as any)({ request, env, waitUntil: (p: Promise<unknown>) => pending.push(p) }) as Promise<Response>;
}

/** The one forwarded payload. */
function forwarded(): Forwarded {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Forwarded;
}

const one = (entry: Record<string, unknown> = {}) => JSON.stringify([{ message: 'boom', level: 'ERROR', timestamp: 1, ...entry }]);

describe('/api/log', () => {
  beforeEach(() => {
    pending = [];
    fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 202 })));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards to the New Relic EU Log API with the key and the common attributes', async () => {
    const res = await post(one(), { headers: { 'user-agent': 'TestBrowser/1' } });
    expect(res.status).toBe(204);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://log-api.eu.newrelic.com/log/v1');
    expect((init.headers as Record<string, string>)['api-key']).toBe('test-key');
    const [batch] = forwarded();
    expect(batch.common.attributes).toEqual({ logtype: 'browser', application: 'MolViewer', environment: 'production', userAgent: 'TestBrowser/1' });
    expect(batch.logs).toEqual([{ message: 'boom', level: 'ERROR', timestamp: 1, attributes: {} }]);
  });

  it('adds no country or other cf.* attribute', async () => {
    await post(one());
    expect(Object.keys(forwarded()[0].common.attributes).some((k) => k.startsWith('cf.'))).toBe(false);
  });

  it.each(['molviewer.pages.dev', 'abc123.molviewer.pages.dev', 'localhost'])('answers 204 and sends nothing on %s', async (host) => {
    expect((await post(one(), { host })).status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a foreign Origin, accepts its own and a missing one', async () => {
    expect((await post(one(), { headers: { origin: 'https://example.com' } })).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await post(one(), { headers: { origin: 'https://molviewer.bio' } })).status).toBe(204);
    expect((await post(one())).status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('answers 204 and sends nothing without the secret', async () => {
    expect((await post(one(), { key: '' })).status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a body over 64 KB', async () => {
    const big = JSON.stringify([{ message: 'x'.repeat(70_000) }]);
    expect((await post(big)).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid JSON', '{'],
    ['an object', JSON.stringify({ logs: [] })],
    ['no entry with a message', JSON.stringify([{ level: 'ERROR' }, null, 3])],
    ['an empty body', ''],
  ])('rejects %s', async (_name, body) => {
    expect((await post(body)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stores levels in upper case, unknown ones as ERROR', async () => {
    const body = JSON.stringify([
      { message: 'a', level: 'error' },
      { message: 'b', level: 'Warn' },
      { message: 'c', level: 'info' },
      { message: 'd', level: 'debug' },
      { message: 'e' },
    ]);
    await post(body);
    expect(forwarded()[0].logs.map((l) => l.level)).toEqual(['ERROR', 'WARN', 'INFO', 'ERROR', 'ERROR']);
  });

  it('replaces a missing or non-finite timestamp with the current time', async () => {
    const before = Date.now();
    await post(JSON.stringify([{ message: 'a', timestamp: 'yesterday' }, { message: 'b' }]));
    for (const l of forwarded()[0].logs) expect(l.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('cuts message and attributes to their limits, and keeps at most 20 entries', async () => {
    const attributes: Record<string, unknown> = {
      'error.stack': 's'.repeat(10_000),
      componentStack: 'c'.repeat(10_000),
      source: 'x'.repeat(1_000),
    };
    for (let i = 0; i < 40; i++) attributes[`a${i}`] = i;
    await post(JSON.stringify([{ message: 'm'.repeat(5_000), attributes }]));
    const [log] = forwarded()[0].logs;
    expect(log.message).toHaveLength(2_000);
    expect(log.attributes['error.stack']).toHaveLength(4_000);
    expect(log.attributes.componentStack).toHaveLength(4_000);
    expect(log.attributes.source).toHaveLength(500);
    expect(Object.keys(log.attributes)).toHaveLength(30);

    fetchMock.mockClear();
    await post(JSON.stringify(Array.from({ length: 25 }, (_, i) => ({ message: `m${i}` }))));
    expect(forwarded()[0].logs).toHaveLength(20);
  });

  it('drops client attributes named like the common ones, and keeps the rest', async () => {
    await post(one({ attributes: { application: 'Evil', environment: 'dev', logtype: 'x', userAgent: 'y', source: 'ErrorBoundary', 'error.name': 'TypeError', url: 'https://molviewer.bio/pdb/4hhb' } }));
    const [batch] = forwarded();
    expect(batch.common.attributes.application).toBe('MolViewer');
    expect(batch.logs[0].attributes).toEqual({ source: 'ErrorBoundary', 'error.name': 'TypeError', url: 'https://molviewer.bio/pdb/4hhb' });
  });

  it('logs nothing when New Relic accepts', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    await post(one());
    await Promise.all(pending);
    expect(logged).not.toHaveBeenCalled();
  });

  it('answers 204 when New Relic refuses the key, and logs the status without the key', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 403 })));
    expect((await post(one())).status).toBe(204);
    await Promise.all(pending);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0][0])).toContain('403');
    expect(String(logged.mock.calls[0][0])).not.toContain('test-key');
  });

  it('answers 204 when New Relic is unreachable, and logs it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockImplementation(() => Promise.reject(new Error('down')));
    expect((await post(one())).status).toBe(204);
    await Promise.all(pending);
    expect(String(logged.mock.calls[0][0])).toContain('unreachable');
  });
});
