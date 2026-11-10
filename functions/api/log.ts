/**
 * POST /api/log: browser error reports, forwarded to the New Relic Log API.
 *
 * The ingest key is the runtime secret NEW_RELIC_LICENSE_KEY and never reaches
 * the browser. Forwarding happens only on molviewer.bio, the one host covered
 * by the zone's WAF rate limit (20 req / 10 s per IP on /api/log). pages.dev
 * aliases and preview deployments run this same code with the same secret but
 * bypass the zone, so there it answers 204 and sends nothing.
 *
 * The body is the client's array of entries ({ message, level, timestamp,
 * attributes }); the common attributes are set here, and a client attribute
 * with one of their names is dropped. No country or IP is added: the privacy
 * page promises only the message, the page address and the browser version.
 */
import { MAX_BODY_BYTES, MAX_ENTRIES, MAX_MESSAGE, trimAttributes } from '../../site/errorLog';
import { isCrossOrigin } from '../../site/http/isCrossOrigin';
import { readLimited } from '../../site/http/readLimited';

interface Env {
  NEW_RELIC_LICENSE_KEY?: string;
}

const NR_URL = 'https://log-api.eu.newrelic.com/log/v1';
const FORWARD_HOST = 'molviewer.bio';
const LEVELS = new Set(['ERROR', 'WARN', 'INFO']);
/** Set by the server; a client attribute with one of these names is dropped. */
const SERVER_KEYS: ReadonlySet<string> = new Set(['logtype', 'application', 'environment', 'userAgent']);

type Entry = { message?: unknown; level?: unknown; timestamp?: unknown; attributes?: unknown };

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  if (url.hostname !== FORWARD_HOST) return new Response(null, { status: 204 });
  if (isCrossOrigin(request)) return new Response(null, { status: 403 });
  if (!env.NEW_RELIC_LICENSE_KEY) return new Response(null, { status: 204 });

  const raw = await readLimited(request, MAX_BODY_BYTES);
  if (raw === null) return new Response(null, { status: 413 });

  let entries: unknown;
  try {
    entries = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!Array.isArray(entries)) return new Response(null, { status: 400 });

  const logs = (entries as Entry[])
    .slice(0, MAX_ENTRIES)
    .filter((e) => typeof e?.message === 'string')
    .map((e) => {
      const level = typeof e.level === 'string' ? e.level.toUpperCase() : '';
      return {
        message: (e.message as string).slice(0, MAX_MESSAGE),
        level: LEVELS.has(level) ? level : 'ERROR',
        timestamp: typeof e.timestamp === 'number' && Number.isFinite(e.timestamp) ? e.timestamp : Date.now(),
        attributes: trimAttributes(e.attributes, SERVER_KEYS),
      };
    });
  if (logs.length === 0) return new Response(null, { status: 400 });

  const payload = [
    {
      common: {
        attributes: {
          logtype: 'browser',
          application: 'MolViewer',
          environment: 'production',
          userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? '',
        },
      },
      logs,
    },
  ];

  // A refused key (401/403 after a rotation or a typo) still answers the
  // browser 204, so it's logged here: it shows in the Pages Function logs.
  // The status only, never the key or the reports.
  waitUntil(
    fetch(NR_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'api-key': env.NEW_RELIC_LICENSE_KEY },
      body: JSON.stringify(payload),
    }).then(
      (res) => {
        if (!res.ok) console.error(`/api/log: New Relic Log API answered ${res.status}`);
      },
      (err: unknown) => console.error(`/api/log: New Relic Log API unreachable: ${err instanceof Error ? err.message : String(err)}`),
    ),
  );
  return new Response(null, { status: 204 });
};
