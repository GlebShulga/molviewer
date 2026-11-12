/**
 * The activation funnel from one row per session (scripts/query-events.ts
 * --funnel): each session's final running totals, read as the max over its rows.
 */

/**
 * A session's totals as the SQL API returns them (numbers may come back as
 * strings). `samples_at_first_real` = the samples count on the session's first
 * row with a real load (1e6 when it has none): it tells "example, then own
 * structure" from "own structure, then example", which the maxima can't.
 */
export type SessionTotalsRow = Partial<
  Record<'samples' | 'real_loads' | 'pickers' | 'failures' | 'samples_at_first_real', unknown>
>;

export interface FunnelBuckets {
  sessions: number;
  /** Loaded their own structure before (or without) opening any example. */
  real_only: number;
  /** Opened an example, then loaded their own structure. */
  sample_then_real: number;
  /** Opened the file picker (or dragged a file in) but loaded nothing of their own. */
  tried_but_no_real_load: number;
  /** Examples only. */
  sample_only: number;
  /** Nothing loaded by hand (an automatic landing load at most). */
  no_user_load: number;
  /** Overlaps the five above: sessions that opened an example. */
  opened_sample: number;
  /** Overlaps the five above: sessions with a failed load they started. */
  with_failed_load: number;
}

/** The five buckets add up to `sessions`; the last two columns overlap them. */
export function funnelBuckets(rows: SessionTotalsRow[]): FunnelBuckets {
  const b: FunnelBuckets = {
    sessions: 0,
    real_only: 0,
    sample_then_real: 0,
    tried_but_no_real_load: 0,
    sample_only: 0,
    no_user_load: 0,
    opened_sample: 0,
    with_failed_load: 0,
  };
  for (const r of rows) {
    const samples = Number(r.samples);
    const real = Number(r.real_loads);
    const pickers = Number(r.pickers);
    b.sessions += 1;
    // Examples counted before the first own structure, not just both in the session
    if (real > 0) b[Number(r.samples_at_first_real) > 0 ? 'sample_then_real' : 'real_only'] += 1;
    else if (pickers > 0) b.tried_but_no_real_load += 1;
    else b[samples > 0 ? 'sample_only' : 'no_user_load'] += 1;
    if (samples > 0) b.opened_sample += 1;
    if (Number(r.failures) > 0) b.with_failed_load += 1;
  }
  return b;
}
