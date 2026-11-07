/**
 * POST /api/share — store a ShareableSession in KV and return a short ID.
 * Body: ShareableSession JSON (≤ 1 MB). Posts from *.pages.dev hosts are
 * refused (they are outside the zone's WAF rate limit).
 */
import { readLimited } from '../../site/http/readLimited';

interface Env {
  SHARE_KV: KVNamespace;
}

const MAX_BODY_BYTES = 1_000_000;
const TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateId(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += BASE62[bytes[i] % 62];
  }
  return out;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // The WAF rate limit on share posts covers the molviewer.bio zone only, and
  // the Pages project also answers at molviewer.pages.dev and every preview
  // host, which may share the production KV. Nothing needs real share posts
  // there (the E2E share tests mock /api/share), so they are refused. Checked
  // here, not by path in the middleware: the router sends other spellings of
  // the path here too (/api/share/, /API/Share).
  if (new URL(request.url).hostname.endsWith('.pages.dev')) {
    return jsonResponse(403, { error: 'Sharing is not available on this address.' });
  }

  // Bytes, read no further than the limit: a client can't make us buffer
  // an arbitrarily large body.
  let raw: string | null;
  try {
    raw = await readLimited(request, MAX_BODY_BYTES);
  } catch {
    return jsonResponse(400, { error: 'Could not read body' });
  }
  if (raw === null) {
    return jsonResponse(413, { error: 'Share payload too large (1 MB max)' });
  }
  if (raw === '') {
    return jsonResponse(400, { error: 'Empty share payload' });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  if (!parsed || typeof parsed !== 'object') {
    return jsonResponse(400, { error: 'Invalid share payload' });
  }

  const id = generateId();
  try {
    await env.SHARE_KV.put(id, raw, { expirationTtl: TTL_SECONDS });
  } catch (err) {
    console.error('share: KV put failed', err);
    return jsonResponse(503, { error: 'Sharing is unavailable right now. Try again later.' });
  }

  return jsonResponse(200, { id });
};
