/**
 * POST /api/event: store one anonymous product event in Workers Analytics
 * Engine (dataset bound as EVENTS in wrangler.toml).
 *
 * Layout of each data point, used when querying with the SQL API
 * (see scripts/query-events.ts):
 *   index1  = event name
 *   blob1   = event name
 *   blob2.. = STRING_FIELDS in order (source, entry, format, kind, ref, value)
 *   blob8   = page kind (home, pdb, af, compound, share, embed, other)
 *   blob9   = country (from Cloudflare)
 *   double1.. = NUMBER_FIELDS in order (scale, seconds)
 */
import { isEventName, NUMBER_FIELDS, STRING_FIELDS, type EventPayload } from '../../site/events';

interface Env {
  EVENTS?: AnalyticsEngineDataset;
}

const MAX_BODY = 2048;

/**
 * The chat app widget posts from the host's sandbox origin (any origin, by
 * design), so responses allow it. The widget sends text/plain, a simple
 * request with no preflight; OPTIONS is answered anyway for fetch() callers.
 */
const CORS = { 'access-control-allow-origin': '*' };

/**
 * Posts from another origin (the widget's sandbox, or anyone else's page)
 * may only send the widget's events. The site's own events must come from
 * the site. (A missing Origin header counts as same-origin: older browsers
 * omit it on same-origin beacons.)
 */
const CROSS_ORIGIN_EVENTS = new Set(['widget_view', 'widget_open_full']);

function isCrossOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return !!origin && origin !== new URL(request.url).origin;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 96) : '';
}

/**
 * Read at most `max` bytes of the body; null when it's larger. Unauthenticated
 * endpoint: never buffer an arbitrarily large upload.
 */
async function readLimited(request: Request, max: number): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? '0') > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const raw = await readLimited(request, MAX_BODY);
  if (raw === null) return new Response(null, { status: 413, headers: CORS });

  let payload: EventPayload;
  try {
    payload = JSON.parse(raw) as EventPayload;
  } catch {
    return new Response(null, { status: 400, headers: CORS });
  }
  if (!payload || !isEventName(payload.e)) return new Response(null, { status: 400, headers: CORS });
  if (isCrossOrigin(request) && !CROSS_ORIGIN_EVENTS.has(payload.e)) return new Response(null, { status: 403, headers: CORS });

  const props = (payload.p ?? {}) as Record<string, unknown>;
  const country = (request as Request & { cf?: { country?: string } }).cf?.country ?? '';

  env.EVENTS?.writeDataPoint({
    indexes: [payload.e],
    blobs: [payload.e, ...STRING_FIELDS.map((k) => str(props[k])), str(payload.page), country],
    doubles: NUMBER_FIELDS.map((k) => (typeof props[k] === 'number' && Number.isFinite(props[k]) ? (props[k] as number) : 0)),
  });

  return new Response(null, { status: 204, headers: CORS });
};

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, {
    status: 204,
    headers: {
      ...CORS,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
    },
  });
