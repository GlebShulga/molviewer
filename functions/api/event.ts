/**
 * POST /api/event: store one anonymous product event in Workers Analytics
 * Engine (dataset bound as EVENTS in wrangler.toml).
 *
 * Layout of each data point, used when querying with the SQL API
 * (see scripts/query-events.ts):
 *   index1  = event name
 *   blob1   = event name
 *   blob2.. = STRING_FIELDS in order (source, entry, format, kind, ref, value)
 *   blob8   = page kind (PAGE_KINDS: home, pdb, af, compound, share, embed, widget, other; '' otherwise)
 *   blob9   = country (from Cloudflare)
 *   double1.. = NUMBER_FIELDS in order (scale, seconds, atoms)
 */
import { CROSS_ORIGIN_EVENTS, isEventName, isPageKind, NUMBER_FIELDS, STRING_FIELDS, type EventPayload } from '../../site/events';
import { isCrossOrigin } from '../../site/http/isCrossOrigin';
import { readLimited } from '../../site/http/readLimited';

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

function str(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 96) : '';
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
    // The page comes from the client: only a known kind is stored
    blobs: [payload.e, ...STRING_FIELDS.map((k) => str(props[k])), isPageKind(payload.page) ? payload.page : '', country],
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
