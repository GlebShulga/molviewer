/**
 * Routing decisions for functions/_middleware.ts, kept pure so they're testable.
 *
 * How unknown paths get a real 404 without listing every file in public/:
 * `index.html` carries a marker meta tag. Every page that is a real route
 * (landing pages rendered by Functions, pages generated at build time) has no
 * marker, because the Functions strip it and the generator never emits it.
 * So an HTML response that still carries the marker is Cloudflare Pages' SPA
 * fallback for a path nobody handles, and should be a 404.
 */

export const SHELL_MARKER_NAME = 'mv-spa-shell';
export const SHELL_MARKER = `<meta name="${SHELL_MARKER_NAME}" content="fallback">`;

/** Paths where the untouched SPA shell is the correct response. */
export function isShellRoute(pathname: string): boolean {
  return pathname === '/' || pathname === '/index.html';
}

export function isEmbedPath(pathname: string): boolean {
  return pathname.startsWith('/embed/');
}

/** True when an HTML body is the unmodified SPA shell (the fallback). */
export function isSpaFallback(html: string): boolean {
  return html.includes(`name="${SHELL_MARKER_NAME}"`);
}

/** How far into an HTML response the marker can be (it's the second tag in <head>). */
export const SHELL_MARKER_WINDOW = 2048;

/**
 * Read the first `maxBytes` of a body without consuming it: returns the
 * decoded start and a stream that replays the whole body. Lets the
 * middleware check for the marker without buffering every page.
 */
export async function peekStream(
  body: ReadableStream<Uint8Array>,
  maxBytes = SHELL_MARKER_WINDOW
): Promise<{ head: string; stream: ReadableStream<Uint8Array> }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let done = false;
  while (size < maxBytes) {
    const r = await reader.read();
    if (r.done) {
      done = true;
      break;
    }
    chunks.push(r.value);
    size += r.value.byteLength;
  }
  const head = new TextDecoder().decode(concat(chunks)).slice(0, maxBytes);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      if (done) controller.close();
    },
    async pull(controller) {
      const r = await reader.read();
      if (r.done) controller.close();
      else controller.enqueue(r.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return { head, stream };
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Turn the SPA shell into a 404 page: keep the app (so people can try
 * another ID or search) but tell crawlers not to index it.
 */
export function toNotFoundHtml(html: string): string {
  const withoutMarker = html.replace(SHELL_MARKER, '');
  return withoutMarker.replace(
    /<meta name="robots"[^>]*>/,
    '<meta name="robots" content="noindex, follow">'
  );
}
