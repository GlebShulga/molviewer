/**
 * Query product events from Workers Analytics Engine (dataset `molviewer_events`,
 * written by functions/api/event.ts). Analytics Engine has no dashboard; this
 * prints event counts for the last N days via the SQL API.
 *
 * Usage:
 *   CF_ACCOUNT_ID=... CF_API_TOKEN=... pnpm exec tsx scripts/query-events.ts [days=7]
 *   CF_ACCOUNT_ID=... CF_API_TOKEN=... pnpm exec tsx scripts/query-events.ts --sql "SELECT ..."
 *   CF_ACCOUNT_ID=... CF_API_TOKEN=... pnpm exec tsx scripts/query-events.ts --app [days=7]
 *   CF_ACCOUNT_ID=... CF_API_TOKEN=... pnpm exec tsx scripts/query-events.ts --search [days=7]
 *   CF_ACCOUNT_ID=... CF_API_TOKEN=... pnpm exec tsx scripts/query-events.ts --styles [days=7]
 *   CF_ACCOUNT_ID=... CF_API_TOKEN=... pnpm exec tsx scripts/query-events.ts --funnel [days=7]
 * The token can also come from .env (CF_API_TOKEN_ANALYTICS_READ), which tsx
 * doesn't read by itself: `pnpm exec tsx --env-file=.env scripts/query-events.ts ...`.
 *
 * --app summarizes the ChatGPT/Claude app: MCP tool calls (written by
 * workers/mcp: blob2 = tool, blob5 = kind, blob6 = client, blob7 = outcome,
 * double2 = seconds) and the widget's widget_view / widget_open_full events.
 *
 * --search breaks find_structures down by kind, outcome, query shape (blob3)
 * and what each source returned (blob4, e.g. "c0 p- r3 u0/2!", or "cache"),
 * to see why searches come back empty.
 *
 * --styles asks whether atom styles are used on large structures: loads, style
 * switches, measurements, labels and atom menus by structure size (double3),
 * also per 100 loads of that size, and how many of those picks ran on the GPU
 * (blob4 = 'gpu', see GPU_PICKING_THRESHOLD). A pick's style (blob7) is the one
 * its atom is drawn in: a ligand next to a Cartoon protein counts as Ball &
 * Stick. Touch screens and desktops are counted together. Size "?" is events
 * from before sizes were recorded.
 *
 * --funnel sorts the site's sessions (schema 3, real browsers off cloud
 * networks) into the activation buckets: own structure only, example then own
 * structure, opened the file picker without loading their own, examples only,
 * nothing loaded by hand. It reads the running totals, not the load events:
 * Analytics Engine drops some rows within busy sessions at write time, so
 * counting a session's own events can miss its one real load.
 *
 * Every query here counts production traffic only (PROD): events from preview
 * deployments and from the owner's browsers (?internal=1) are left out. Events
 * from before schema 2 have no environment and are kept. A --sql query gets no
 * such filter. Since schema 2, structure_loaded also counts Saved-panel loads
 * (source 'saved') and the onboarding tour's demo (source 'sample', value
 * 'onboarding'), which earlier events didn't.
 *
 * The token needs the "Account Analytics: Read" permission.
 * Column layout (site/events.ts): index1 = session id since schema 2 (the event name before),
 * blob1 = event, blob2..blob7 = source, entry, format, kind, ref, value,
 * blob8 = page kind, blob9 = country,
 * blob10..blob16 = env, device, entry_page, ref_type, version, schema, detail (schema 2),
 * double1 = scale, double2 = seconds, double3 = atoms,
 * double4..double10 = seq, elapsed, duration, kb, asn, webdriver, user (schema 2),
 * double11..double14 = the session's running samples, real_loads, pickers, failures (schema 3).
 */

import { funnelBuckets } from './funnel';

const accountId = process.env.CF_ACCOUNT_ID;
const token = process.env.CF_API_TOKEN ?? process.env.CF_API_TOKEN_ANALYTICS_READ;
if (!accountId || !token) {
  console.error('Set CF_ACCOUNT_ID and CF_API_TOKEN (or CF_API_TOKEN_ANALYTICS_READ).');
  process.exit(1);
}

const args = process.argv.slice(2);
const sqlIndex = args.indexOf('--sql');
const days = Number(args.find((a) => /^\d+$/.test(a)) ?? 7);
const SINCE = `timestamp > NOW() - INTERVAL '${days}' DAY`;
/** Production only: blob10 is the environment ('' on events from before schema 2, which had none). */
const PROD = "blob10 IN ('prod', '')";

const APP_SQL = `SELECT blob1 AS event, blob2 AS tool, blob6 AS client, blob7 AS outcome,
       SUM(_sample_interval) AS count, AVG(double2) AS avg_seconds
       FROM molviewer_events
       WHERE ${SINCE} AND ${PROD}
         AND (blob1 = 'mcp_tool_call' OR blob1 = 'widget_view' OR blob1 = 'widget_open_full')
       GROUP BY event, tool, client, outcome
       ORDER BY count DESC
       FORMAT JSON`;

const SEARCH_SQL = `SELECT blob5 AS kind, blob7 AS outcome, blob3 AS shape, blob4 AS sources,
       SUM(_sample_interval) AS count, AVG(double2) AS avg_seconds
       FROM molviewer_events
       WHERE ${SINCE} AND ${PROD}
         AND blob1 = 'mcp_tool_call' AND blob2 = 'find_structures'
       GROUP BY kind, outcome, shape, sources
       ORDER BY count DESC
       FORMAT JSON`;

const COUNTS_SQL = `SELECT blob1 AS event, blob2 AS source, blob8 AS page, SUM(_sample_interval) AS count
       FROM molviewer_events
       WHERE ${SINCE} AND ${PROD}
       GROUP BY event, source, page
       ORDER BY count DESC
       FORMAT JSON`;

/**
 * Size buckets at the code's limits: Ball & Stick and Stick on a touch screen
 * up to 1,000 atoms (TOUCH_ATOM_STYLE_LIMIT), GPU picking from 5,000
 * (GPU_PICKING_THRESHOLD in ImpostorAtoms.tsx), Ball & Stick and Stick on a
 * desktop up to 100,000 (DESKTOP_ATOM_STYLE_LIMIT). Sizes are rounded to two
 * significant figures, so a structure right at a bound can land next to it.
 */
const SIZES = ['?', '<1k', '1k-5k', '5k-20k', '20k-100k', '100k+'] as const;
const SIZE_SQL = `if(double3 = 0, '?', if(double3 <= 1000, '<1k', if(double3 < 5000, '1k-5k',
       if(double3 < 20000, '5k-20k', if(double3 <= 100000, '20k-100k', '100k+')))))`;
const ATOM_STYLES = new Set(['ball-and-stick', 'stick', 'spacefill']);
const PICK_EVENTS = ['measurement_added', 'label_added', 'atom_menu_opened'];
const STYLES = ['ball-and-stick', 'stick', 'spacefill', 'cartoon', 'surface-vdw', 'surface-sas'];

const LOADS_SQL = `SELECT ${SIZE_SQL} AS size, SUM(_sample_interval) AS loads
       FROM molviewer_events
       WHERE ${SINCE} AND ${PROD} AND blob1 = 'structure_loaded'
       GROUP BY size
       FORMAT JSON`;

const STYLE_EVENTS_SQL = `SELECT blob1 AS event, ${SIZE_SQL} AS size, blob7 AS style, blob5 AS kind,
       blob4 AS picking, SUM(_sample_interval) AS count
       FROM molviewer_events
       WHERE ${SINCE} AND ${PROD}
         AND blob1 IN ('representation_changed', 'measurement_added', 'label_added', 'atom_menu_opened')
       GROUP BY event, size, style, kind, picking
       ORDER BY count DESC
       FORMAT JSON`;

type Row = Record<string, unknown>;

async function query(sql: string): Promise<{ data?: Row[] }> {
  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: sql,
  });
  if (!resp.ok) {
    console.error(`SQL API error ${resp.status}: ${await resp.text()}`);
    process.exit(1);
  }
  return (await resp.json()) as { data?: Row[] };
}

async function printStyles(): Promise<void> {
  const [loads, events] = await Promise.all([query(LOADS_SQL), query(STYLE_EVENTS_SQL)]);
  const per100 = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 1000) / 10 : '-');
  const summary = SIZES.map((size) => {
    const rows = (events.data ?? []).filter((r) => r.size === size);
    const count = (names: string[], keep: (r: Row) => boolean = () => true) =>
      rows
        .filter((r) => names.includes(String(r.event)) && keep(r))
        .reduce((sum, r) => sum + Number(r.count), 0);
    const loadCount = Number((loads.data ?? []).find((r) => r.size === size)?.loads ?? 0);
    const toAtomStyle = count(['representation_changed'], (r) => ATOM_STYLES.has(String(r.style)));
    const measured = count(['measurement_added']);
    const labelled = count(['label_added']);
    const menus = count(['atom_menu_opened']);
    const gpuPicks = count(PICK_EVENTS, (r) => r.picking === 'gpu');
    return {
      size,
      loads: loadCount,
      ...Object.fromEntries(STYLES.map((s) => [`to ${s}`, count(['representation_changed'], (r) => r.style === s)])),
      measure: measured,
      label: labelled,
      menu: menus,
      'of them on GPU': gpuPicks,
      'to atom styles /100': per100(toAtomStyle, loadCount),
      'measure /100': per100(measured, loadCount),
      'label /100': per100(labelled, loadCount),
      'menu /100': per100(menus, loadCount),
    };
  });
  console.table(summary);
  console.table(events.data ?? events);
}

/**
 * Cloud and hosting networks: browsers there are almost always automation.
 * AWS, Google Cloud, Contabo, Alibaba, Tencent, DigitalOcean, Hetzner, OVH.
 * Microsoft (8075) is left out on purpose: it would also drop corporate users.
 * Written as floats in the SQL: the SQL API refuses to compare a double column with integers in IN.
 */
const CLOUD_ASNS = [16509, 14618, 396982, 51167, 40021, 45102, 132203, 14061, 24940, 16276];

/**
 * One row per session on the site itself, from schema 3 on, its funnel read
 * from the running totals every event carries (double11..double14). The max
 * over a session's rows is its final state even when Analytics Engine dropped
 * some of them at write time, which it does within busy sessions. Each
 * session counts once: whole sessions are not known to be dropped.
 *
 * - samples_at_first_real: the samples count on the first row with a real
 *   load, for the order of the two (the SQL API has no minIf). If that very
 *   row was dropped, the next one stands in.
 * - Embeds run the app on other sites (page kind 'embed'): not site sessions.
 * - Schema 3 and later as "not '' (before schema 2) and not '2'": the SQL API's
 *   toUInt32(blob15) doesn't compare as a number.
 */
const FUNNEL_SQL = `SELECT index1 AS session, MAX(double11) AS samples, MAX(double12) AS real_loads,
       MAX(double13) AS pickers, MAX(double14) AS failures,
       MIN(if(double12 > 0, double11, 1000000.0)) AS samples_at_first_real
       FROM molviewer_events
       WHERE ${SINCE} AND blob10 = 'prod' AND blob15 NOT IN ('', '2')
         AND blob8 NOT IN ('mcp', 'widget', 'embed')
         AND double9 = 0 AND double8 NOT IN (${CLOUD_ASNS.map((asn) => `${asn}.0`).join(', ')})
       GROUP BY session
       FORMAT JSON`;

if (args.includes('--styles')) {
  await printStyles();
} else if (args.includes('--funnel')) {
  const result = await query(FUNNEL_SQL);
  console.table(funnelBuckets(result.data ?? []));
} else {
  const sql =
    sqlIndex >= 0
      ? args[sqlIndex + 1]
      : args.includes('--app')
        ? APP_SQL
        : args.includes('--search')
          ? SEARCH_SQL
          : COUNTS_SQL;
  const result = await query(sql);
  console.table(result.data ?? result);
}

export {};
