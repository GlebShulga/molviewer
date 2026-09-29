/** Build the HTTP response for a landing page from the SPA shell response. */
import { applyShellMeta, type ShellMeta } from './shell';

export async function shellResponse(
  request: Request,
  shell: Response,
  meta: ShellMeta,
  status = 200
): Promise<Response> {
  // Anything but the HTML shell (e.g. an upstream dev-server error) passes through.
  if (!shell.ok || !(shell.headers.get('content-type') ?? '').includes('text/html')) return shell;
  const html = applyShellMeta(await shell.text(), meta);
  const headers = new Headers(shell.headers);
  headers.delete('content-length');
  headers.delete('etag');
  headers.set('content-type', 'text/html; charset=utf-8');
  if (status === 404) headers.set('x-robots-tag', 'noindex');
  return new Response(request.method === 'HEAD' ? null : html, { status, headers });
}

export function isGetOrHead(request: Request): boolean {
  return request.method === 'GET' || request.method === 'HEAD';
}
