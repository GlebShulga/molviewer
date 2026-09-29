// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { onRequest } from './_middleware';
import { SHELL_MARKER, SHELL_MARKER_WINDOW, peekStream } from '../site/routing';

const SHELL = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const PAGE = SHELL.replace(SHELL_MARKER, '').replace('<body>', `<body>${'x'.repeat(10_000)}`);

/** Serve `html` as the downstream response, delivered in small chunks. HEAD gets no body, like the asset server. */
function run(method: string, path: string, html: string, contentType = 'text/html; charset=utf-8') {
  const next = async (input?: Request) => {
    const req = input ?? new Request(`https://molviewer.bio${path}`, { method });
    const bytes = new TextEncoder().encode(html);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 500) c.enqueue(bytes.slice(i, i + 500));
        c.close();
      },
    });
    return new Response(req.method === 'HEAD' ? null : stream, { status: 200, headers: { 'content-type': contentType } });
  };
  const request = new Request(`https://molviewer.bio${path}`, { method });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (onRequest as any)({ request, next }) as Promise<Response>;
}

describe('middleware', () => {
  it('404s the SPA fallback for unknown paths, for GET and HEAD', async () => {
    const get = await run('GET', '/random', SHELL);
    expect(get.status).toBe(404);
    expect(get.headers.get('x-robots-tag')).toBe('noindex');
    expect(await get.text()).toContain('content="noindex, follow"');

    const head = await run('HEAD', '/random', SHELL);
    expect(head.status).toBe(404);
    expect(await head.text()).toBe('');
  });

  it('streams real pages through unchanged, with a CSP header', async () => {
    const res = await run('GET', '/pdb/3DNI', PAGE);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
    expect(await res.text()).toBe(PAGE);

    const head = await run('HEAD', '/pdb/3DNI', PAGE);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('serves the home page shell as is, and lets embeds be framed', async () => {
    expect((await run('GET', '/', SHELL)).status).toBe(200);
    const embed = await run('GET', '/embed/pdb/4HHB', PAGE);
    expect(embed.headers.get('content-security-policy')).toContain('frame-ancestors *');
  });

  it('leaves non-HTML responses alone', async () => {
    const res = await run('GET', '/sitemap.xml', '<urlset/>', 'application/xml');
    expect(res.headers.get('content-security-policy')).toBeNull();
    expect(await res.text()).toBe('<urlset/>');
  });
});

describe('peekStream', () => {
  it('finds the marker within the peek window of the real shell', () => {
    expect(SHELL.indexOf(SHELL_MARKER) + SHELL_MARKER.length).toBeLessThan(SHELL_MARKER_WINDOW);
  });

  it('replays the whole body after peeking', async () => {
    const text = 'a'.repeat(5000) + 'end';
    const { head, stream } = await peekStream(new Response(text).body!, 100);
    expect(head.length).toBeLessThanOrEqual(100);
    expect(await new Response(stream).text()).toBe(text);
  });
});
