// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { onRequestOptions, onRequestPost } from './event';

function post(body: BodyInit, headers: Record<string, string> = {}) {
  const points: unknown[] = [];
  const env = { EVENTS: { writeDataPoint: (p: unknown) => points.push(p) } };
  const request = new Request('https://molviewer.bio/api/event', { method: 'POST', body, headers, duplex: 'half' } as RequestInit);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { res: (onRequestPost as any)({ request, env }) as Promise<Response>, points };
}

describe('/api/event', () => {
  it('stores a valid event', async () => {
    const { res, points } = post(JSON.stringify({ e: 'structure_loaded', p: { source: 'rcsb', scale: 2 }, page: 'pdb' }));
    expect((await res).status).toBe(204);
    expect(points).toHaveLength(1);
  });

  it('rejects unknown events', async () => {
    expect((await post(JSON.stringify({ e: 'nope' })).res).status).toBe(400);
  });

  it('rejects a large body by its declared length without reading it', async () => {
    const { res } = post('{}', { 'content-length': '5000000' });
    expect((await res).status).toBe(413);
  });

  it('stops reading a streamed body once it exceeds the limit', async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        if (pulled > 1000) c.close();
        else c.enqueue(new Uint8Array(1024));
      },
    });
    const { res } = post(stream);
    expect((await res).status).toBe(413);
    expect(pulled).toBeLessThan(10);
  });

  it('accepts text/plain posts from the chat widget and allows any origin', async () => {
    const { res, points } = post(JSON.stringify({ e: 'widget_view', p: { source: 'pdb', ref: 'chatgpt' }, page: 'widget' }), {
      'content-type': 'text/plain',
    });
    const r = await res;
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(points).toHaveLength(1);
  });

  it('only accepts widget events from other origins', async () => {
    const site = post(JSON.stringify({ e: 'structure_loaded', page: 'pdb' }), { origin: 'https://evil.example', 'content-type': 'text/plain' });
    expect((await site.res).status).toBe(403);
    expect(site.points).toHaveLength(0);
    const widget = post(JSON.stringify({ e: 'widget_open_full', page: 'widget' }), { origin: 'https://abc.oaiusercontent.com' });
    expect((await widget.res).status).toBe(204);
    const sameOrigin = post(JSON.stringify({ e: 'structure_loaded', page: 'pdb' }), { origin: 'https://molviewer.bio' });
    expect((await sameOrigin.res).status).toBe(204);
  });

  it('answers CORS preflights', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (await (onRequestOptions as any)({})) as Response;
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-methods')).toContain('POST');
  });
});
