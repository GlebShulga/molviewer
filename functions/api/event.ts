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
  if (raw === null) return new Response(null, { status: 413 });

  let payload: EventPayload;
  try {
    payload = JSON.parse(raw) as EventPayload;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!payload || !isEventName(payload.e)) return new Response(null, { status: 400 });

  const props = (payload.p ?? {}) as Record<string, unknown>;
  const country = (request as Request & { cf?: { country?: string } }).cf?.country ?? '';

  env.EVENTS?.writeDataPoint({
    indexes: [payload.e],
    blobs: [payload.e, ...STRING_FIELDS.map((k) => str(props[k])), str(payload.page), country],
    doubles: NUMBER_FIELDS.map((k) => (typeof props[k] === 'number' && Number.isFinite(props[k]) ? (props[k] as number) : 0)),
  });

  return new Response(null, { status: 204 });
};
