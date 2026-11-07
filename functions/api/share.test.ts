// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { onRequestPost } from './share';

function post(
  body: BodyInit,
  opts: { url?: string; headers?: Record<string, string>; put?: () => Promise<void> } = {}
) {
  const stored: string[] = [];
  const env = { SHARE_KV: { put: opts.put ?? (async (_id: string, value: string) => void stored.push(value)) } };
  const url = opts.url ?? 'https://molviewer.bio/api/share';
  const request = new Request(url, { method: 'POST', body, headers: opts.headers, duplex: 'half' } as RequestInit);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { res: (onRequestPost as any)({ request, env }) as Promise<Response>, stored };
}

describe('/api/share', () => {
  it('stores a valid payload and returns its id', async () => {
    const { res, stored } = post(JSON.stringify({ schemaVersion: 1, structures: [] }));
    const r = await res;
    expect(r.status).toBe(200);
    expect(((await r.json()) as { id: string }).id).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(stored).toHaveLength(1);
  });

  it('rejects a large body by its declared length', async () => {
    expect((await post('{}', { headers: { 'content-length': '5000000' } }).res).status).toBe(413);
  });

  it('stops reading a streamed body once it exceeds 1 MB', async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        if (pulled > 5000) c.close();
        else c.enqueue(new Uint8Array(1024));
      },
    });
    expect((await post(stream).res).status).toBe(413);
    expect(pulled).toBeLessThan(1100);
  });

  it('counts bytes, not characters', async () => {
    // 400,000 three-byte characters: 1.2 MB, though only 400,000 UTF-16 units
    const big = JSON.stringify({ s: '€'.repeat(400_000) });
    expect((await post(big).res).status).toBe(413);
  });

  it('answers 400 when the body cannot be read', async () => {
    const stream = new ReadableStream<Uint8Array>({ pull(c) { c.error(new Error('connection reset')); } });
    expect((await post(stream).res).status).toBe(400);
  });

  it('answers 400 for an empty body', async () => {
    expect((await post('').res).status).toBe(400);
  });

  it('answers 503 with a message when storage fails, and logs it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { res } = post(JSON.stringify({ schemaVersion: 1 }), { put: async () => { throw new Error('KV down'); } });
    const r = await res;
    expect(r.status).toBe(503);
    expect(((await r.json()) as { error: string }).error).toBe('Sharing is unavailable right now. Try again later.');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('refuses posts on pages.dev hosts (production and previews), whatever the path spelling', async () => {
    const valid = JSON.stringify({ schemaVersion: 1, structures: [] });
    for (const host of ['https://molviewer.pages.dev', 'https://abc123.molviewer.pages.dev', 'https://fix-ui.molviewer.pages.dev']) {
      for (const path of ['/api/share', '/api/share/', '/API/Share']) {
        const { res, stored } = post(valid, { url: `${host}${path}` });
        const r = await res;
        expect(r.status, host + path).toBe(403);
        expect(((await r.json()) as { error: string }).error).toBe('Sharing is not available on this address.');
        expect(stored, host + path).toHaveLength(0);
      }
    }
  });

  it('stores posts on localhost', async () => {
    const { res, stored } = post(JSON.stringify({ schemaVersion: 1, structures: [] }), { url: 'http://localhost:8788/api/share' });
    expect((await res).status).toBe(200);
    expect(stored).toHaveLength(1);
  });
});
