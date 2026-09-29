/**
 * Query product events from Workers Analytics Engine (dataset `molviewer_events`,
 * written by functions/api/event.ts). Analytics Engine has no dashboard; this
 * prints event counts for the last N days via the SQL API.
 *
 * Usage:
 *   CF_ACCOUNT_ID=... CF_API_TOKEN=... pnpm exec tsx scripts/query-events.ts [days=7]
 *   CF_ACCOUNT_ID=... CF_API_TOKEN=... pnpm exec tsx scripts/query-events.ts --sql "SELECT ..."
 *
 * The token needs the "Account Analytics: Read" permission.
 * Column layout: blob1 = event, blob2..blob7 = source, entry, format, kind, ref, value,
 * blob8 = page kind, blob9 = country, double1 = scale, double2 = seconds.
 */

const accountId = process.env.CF_ACCOUNT_ID;
const token = process.env.CF_API_TOKEN;
if (!accountId || !token) {
  console.error('Set CF_ACCOUNT_ID and CF_API_TOKEN.');
  process.exit(1);
}

const args = process.argv.slice(2);
const sqlIndex = args.indexOf('--sql');
const days = Number(args.find((a) => /^\d+$/.test(a)) ?? 7);

const sql =
  sqlIndex >= 0
    ? args[sqlIndex + 1]
    : `SELECT blob1 AS event, blob2 AS source, blob8 AS page, SUM(_sample_interval) AS count
       FROM molviewer_events
       WHERE timestamp > NOW() - INTERVAL '${days}' DAY
       GROUP BY event, source, page
       ORDER BY count DESC
       FORMAT JSON`;

const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
  body: sql,
});

if (!resp.ok) {
  console.error(`SQL API error ${resp.status}: ${await resp.text()}`);
  process.exit(1);
}

const result = (await resp.json()) as { data?: Record<string, unknown>[] };
console.table(result.data ?? result);

export {};
