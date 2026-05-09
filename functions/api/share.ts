/**
 * POST /api/share — store a ShareableSession in KV and return a short ID.
 * Body: ShareableSession JSON (≤ 1 MB).
 */

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
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'Share payload too large (1 MB max)' });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return jsonResponse(400, { error: 'Could not read body' });
  }

  if (raw.length > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'Share payload too large (1 MB max)' });
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
  await env.SHARE_KV.put(id, raw, { expirationTtl: TTL_SECONDS });

  return jsonResponse(200, { id });
};
