/**
 * Runs in front of every route that isn't excluded in public/_routes.json
 * (static assets like /assets/*.js are excluded, so they don't cost an
 * invocation).
 *
 * - Unknown paths: Cloudflare Pages answers them with index.html (SPA
 *   fallback) and status 200. We turn that into a 404 + noindex.
 * - Sets the Content-Security-Policy header on HTML responses (embed pages
 *   may be framed by any site; other pages only by ourselves).
 *
 * Only the first 2 KB of an HTML response is read to look for the shell
 * marker; the rest streams through. HEAD requests are answered from a GET,
 * because a HEAD response has no body to inspect.
 */
import { buildCsp } from '../site/csp';
import { isEmbedPath, isShellRoute, isSpaFallback, peekStream, toNotFoundHtml } from '../site/routing';

export const onRequest: PagesFunction = async ({ request, next }) => {
  const isHead = request.method === 'HEAD';
  const response = await (isHead ? next(new Request(request, { method: 'GET' })) : next());
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) {
    if (!isHead) return response;
    await response.body?.cancel();
    return new Response(null, response);
  }

  const url = new URL(request.url);
  const headers = new Headers(response.headers);
  headers.set('content-security-policy', buildCsp(isEmbedPath(url.pathname) ? 'embed' : 'default'));
  const init = { status: response.status, statusText: response.statusText, headers };

  let body = response.body;
  if (body && response.status === 200 && !isShellRoute(url.pathname)) {
    const { head, stream } = await peekStream(body);
    if (isSpaFallback(head)) {
      // Rare (unknown paths only), so reading the whole shell is fine here.
      const html = await new Response(stream).text();
      headers.set('x-robots-tag', 'noindex');
      headers.delete('content-length');
      headers.delete('etag');
      return new Response(isHead ? null : toNotFoundHtml(html), { status: 404, headers });
    }
    body = stream;
  }

  if (isHead) {
    await body?.cancel();
    return new Response(null, init);
  }
  return new Response(body, init);
};
