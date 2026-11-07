// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from './oembed';

function get(pageUrl: string) {
  const request = new Request(`https://molviewer.bio/oembed?url=${encodeURIComponent(pageUrl)}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (onRequestGet as any)({ request }) as Promise<Response>;
}

afterEach(() => vi.unstubAllGlobals());

describe('/oembed caching', () => {
  it('caches "not an embeddable URL" for a day', async () => {
    const r = await get('https://example.org/x');
    expect(r.status).toBe(404);
    expect(r.headers.get('cache-control')).toBe('public, max-age=86400');
  });

  it('caches an id the upstream does not know for 5 minutes only (it may be released soon)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    const r = await get('https://molviewer.bio/pdb/9ZZZ');
    expect(r.status).toBe(404);
    expect(r.headers.get('cache-control')).toBe('public, max-age=300');
  });

  it('caches a found entry for a day', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"rcsb_id":"4HHB"}', { status: 200 })));
    const r = await get('https://molviewer.bio/pdb/4HHB');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('public, max-age=86400');
  });
});
