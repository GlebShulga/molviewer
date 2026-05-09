/**
 * GET /api/share/:id — return a stored ShareableSession.
 *
 * No TTL refresh on read: every read-triggered write would bill against the
 * KV write quota (free tier: 1k/day), so popular shares would burn the budget
 * faster than rare ones. The 1-year fixed TTL is already generous — shares
 * unread for that long can reasonably expire.
 */

interface Env {
  SHARE_KV: KVNamespace;
}

const ID_PATTERN = /^[A-Za-z0-9]{8,16}$/;

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const id = String(params.id ?? '');
  if (!ID_PATTERN.test(id)) {
    return new Response(JSON.stringify({ error: 'Invalid share ID' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const value = await env.SHARE_KV.get(id);
  if (value === null) {
    return new Response(JSON.stringify({ error: 'Share not found or expired' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(value, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=300',
    },
  });
};
