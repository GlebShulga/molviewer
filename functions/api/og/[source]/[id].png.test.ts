// @vitest-environment node
import { afterEach, describe, it, expect, vi } from 'vitest';
import { onRequestGet } from './[id].png';

function get(source: string, id: string) {
  const request = new Request(`https://molviewer.bio/api/og/${source}/${id}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (onRequestGet as any)({ request, params: { source, id } }) as Promise<Response>;
}

function upstream(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/api/og/:source/:id.png', () => {
  it('sends curated entries to their static card', async () => {
    const fetchMock = upstream(new Error('not called'));
    const res = await get('pdb', '4hhb.png');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://molviewer.bio/og/pdb/4HHB.png');
    expect((await get('af', 'P69905.png')).headers.get('location')).toBe('https://molviewer.bio/og/af/P69905.png');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('streams the RCSB image for other PDB entries, never redirecting to itself', async () => {
    const fetchMock = upstream(new Response('jpeg-bytes', { headers: { 'content-type': 'image/jpeg' } }));
    const res = await get('pdb', '1ABC.png');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toMatch(/max-age=\d+/);
    expect(await res.text()).toBe('jpeg-bytes');
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.rcsb.org/images/structures/1abc_assembly-1.jpeg', expect.anything());
  });

  it('falls back to the square JPEG the page announced when RCSB has no image', async () => {
    for (const response of [new Response('nope', { status: 404 }), new Response('<html>', { headers: { 'content-type': 'text/html' } }), new Error('timeout')]) {
      upstream(response);
      const res = await get('pdb', 'ZZZZ.png');
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://molviewer.bio/og/square.jpg');
    }
  });

  it('releases an upstream body it does not use', async () => {
    const cancel = vi.fn();
    upstream(new Response(new ReadableStream({ cancel }), { status: 404 }));
    expect((await get('pdb', 'ZZZZ.png')).status).toBe(302);
    expect(cancel).toHaveBeenCalled();
  });

  it('rejects invalid IDs and AlphaFold models without a card, without calling upstream', async () => {
    const fetchMock = upstream(new Error('not called'));
    for (const [source, id] of [['pdb', 'TOOLONG.png'], ['pdb', '../x.png'], ['af', 'Q9ZZZ8.png'], ['other', '4HHB.png']]) {
      const res = await get(source, id);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://molviewer.bio/og-image.png');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
