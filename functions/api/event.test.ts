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

  it('stores the numeric fields in order, atoms third', async () => {
    const { res, points } = post(JSON.stringify({ e: 'representation_changed', p: { value: 'spacefill', atoms: 4800 } }));
    await res;
    expect((points[0] as { doubles: number[] }).doubles).toEqual([0, 0, 4800, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('appends the schema 2 fields after page kind and country, and the numbers after atoms', async () => {
    const sid = '0b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b';
    const { res, points } = post(
      JSON.stringify({
        e: 'structure_loaded',
        sid,
        page: 'pdb',
        p: {
          source: 'rcsb',
          atoms: 4800,
          env: 'prod',
          device: 'mobile',
          entry_page: 'learn',
          ref_type: 'search',
          version: 'abc1234',
          schema: '2',
          detail: 'x',
          seq: 3,
          elapsed: 1200,
          duration: 450,
          kb: 12,
          asn: 99999,
          webdriver: 0,
          user: 1,
          samples: 2,
          real_loads: 1,
          pickers: 1,
          failures: 0,
        },
      })
    );
    await res;
    const p = points[0] as { indexes: string[]; blobs: string[]; doubles: number[] };
    expect(p.indexes).toEqual([sid]);
    expect(p.blobs[0]).toBe('structure_loaded');
    expect(p.blobs[1]).toBe('rcsb');
    expect(p.blobs[7]).toBe('pdb'); // blob8: page kind, unmoved
    expect(p.blobs.slice(9)).toEqual(['prod', 'mobile', 'learn', 'search', 'abc1234', '2', 'x']);
    // asn (double8) comes from Cloudflare, never from the client: none in this test
    // Then the session totals (double11..double14)
    expect(p.doubles).toEqual([0, 0, 4800, 3, 1200, 450, 12, 0, 0, 1, 2, 1, 1, 0]);
  });

  it('uses a new random id when the session id is not a UUID', async () => {
    const write = async (sid: unknown) => {
      const { res, points } = post(JSON.stringify({ e: 'structure_loaded', sid }));
      await res;
      return (points[0] as { indexes: string[] }).indexes[0];
    };
    const bad = await write('structure_loaded');
    expect(bad).not.toBe('structure_loaded');
    expect(bad).toMatch(/^[0-9a-f-]{36}$/);
    expect(await write('x'.repeat(200))).toMatch(/^[0-9a-f-]{36}$/);
    expect(await write(undefined)).not.toBe(await write(undefined));
  });

  it('stores only known entry page kinds', async () => {
    const entryOf = async (entry_page: string) => {
      const { res, points } = post(JSON.stringify({ e: 'session_start', p: { entry_page } }));
      await res;
      return (points[0] as { blobs: string[] }).blobs[11];
    };
    expect(await entryOf('learn')).toBe('learn');
    expect(await entryOf('pdb')).toBe('pdb');
    expect(await entryOf('/learn/plddt-explained')).toBe('');
  });

  it('records the network from Cloudflare, except for the widget events', async () => {
    const withAsn = (body: object, headers: Record<string, string> = {}) => {
      const points: { doubles: number[] }[] = [];
      const env = { EVENTS: { writeDataPoint: (p: { doubles: number[] }) => points.push(p) } };
      const request = new Request('https://molviewer.bio/api/event', { method: 'POST', body: JSON.stringify(body), headers });
      Object.defineProperty(request, 'cf', { value: { country: 'DE', asn: 3320 } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return Promise.resolve((onRequestPost as any)({ request, env })).then(() => points[0].doubles[7]);
    };
    expect(await withAsn({ e: 'structure_loaded', p: { asn: 1 } })).toBe(3320);
    expect(await withAsn({ e: 'widget_view', page: 'widget' })).toBe(0);
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

  it('stores only known page kinds, and an empty string for anything else', async () => {
    const pageOf = async (page: string) => {
      const { res, points } = post(JSON.stringify({ e: 'structure_loaded', page }));
      await res;
      return (points[0] as { blobs: string[] }).blobs[7];
    };
    expect(await pageOf('pdb')).toBe('pdb');
    expect(await pageOf('widget')).toBe('widget');
    expect(await pageOf('https://example.org/tracking-me?u=1')).toBe('');
    expect(await pageOf('PDB')).toBe('');
  });

  it('answers CORS preflights', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (await (onRequestOptions as any)({})) as Response;
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-methods')).toContain('POST');
  });
});
