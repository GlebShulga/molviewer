/**
 * POST /api/event: store one anonymous product event in Workers Analytics
 * Engine (dataset bound as EVENTS in wrangler.toml).
 *
 * Layout of each data point, used when querying with the SQL API
 * (see scripts/query-events.ts):
 *   index1  = session id (a UUID from the client; a new random one otherwise).
 *             Analytics Engine samples by index, so a session is kept or dropped whole.
 *   blob1   = event name
 *   blob2.. = STRING_FIELDS in order (source, entry, format, kind, ref, value)
 *   blob8   = page kind (PAGE_KINDS: home, pdb, af, compound, share, embed, widget, other; '' otherwise)
 *   blob9   = country (from Cloudflare)
 *   blob10..blob16 = CONTEXT_FIELDS (env, device, entry_page, ref_type, version, schema, detail)
 *   double1.. = NUMBER_FIELDS in order (scale, seconds, atoms, seq, elapsed,
 *             duration, kb, asn, webdriver, user); asn comes from Cloudflare, never the client
 * Events from before schema 2 have index1 = event name and blobs 10+ empty.
 */
import {
  CONTEXT_FIELDS,
  CROSS_ORIGIN_EVENTS,
  isEntryPageKind,
  isEventName,
  isPageKind,
  NUMBER_FIELDS,
  STRING_FIELDS,
  type EventPayload,
} from '../../site/events';
import { isCrossOrigin } from '../../site/http/isCrossOrigin';
import { readLimited } from '../../site/http/readLimited';

interface Env {
  EVENTS?: AnalyticsEngineDataset;
}

const MAX_BODY = 2048;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The chat app widget posts from the host's sandbox origin (any origin, by
 * design), so responses allow it. The widget sends text/plain, a simple
 * request with no preflight; OPTIONS is answered anyway for fetch() callers.
 */
const CORS = { 'access-control-allow-origin': '*' };

function str(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 96) : '';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
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
  const cf = (request as Request & { cf?: { country?: string; asn?: number } }).cf;
  const country = cf?.country ?? '';
  // The widget's events stay unlinkable and carry no network, like MCP events
  const asn = CROSS_ORIGIN_EVENTS.has(payload.e) ? 0 : num(cf?.asn);
  // The id comes from the client: only a UUID is used as the index
  const sid = typeof payload.sid === 'string' && UUID_RE.test(payload.sid) ? payload.sid.toLowerCase() : crypto.randomUUID();

  env.EVENTS?.writeDataPoint({
    indexes: [sid],
    blobs: [
      payload.e,
      ...STRING_FIELDS.map((k) => str(props[k])),
      // The page and the entry page come from the client: only known kinds are stored
      isPageKind(payload.page) ? payload.page : '',
      country,
      ...CONTEXT_FIELDS.map((k) => (k === 'entry_page' ? (isEntryPageKind(props[k]) ? props[k] : '') : str(props[k]))),
    ],
    doubles: NUMBER_FIELDS.map((k) => (k === 'asn' ? asn : num(props[k]))),
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
