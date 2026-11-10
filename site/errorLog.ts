/**
 * Limits for browser error reports: the client (src/utils/errorReporter.ts)
 * trims to them before sending, and /api/log (functions/api/log.ts) enforces
 * them on whatever arrives.
 */
export const LOG_ENDPOINT = '/api/log';
/** sendBeacon's and keepalive fetch's limit. */
export const MAX_BODY_BYTES = 65_536;
/** The client flushes before a batch would pass this (headroom under MAX_BODY_BYTES). */
export const FLUSH_AT_BYTES = 56_000;
export const MAX_ENTRIES = 20;
export const MAX_MESSAGE = 2_000;
export const MAX_LONG_ATTR = 4_000;
export const MAX_ATTR = 500;
export const MAX_ATTRS = 30;
const MAX_KEY = 64;
/** Attributes that carry stacks and get the long limit. */
export const LONG_KEYS: ReadonlySet<string> = new Set(['error.stack', 'componentStack']);

export type LogAttrs = Record<string, string | number | boolean>;

const NONE: ReadonlySet<string> = new Set();

/** Trims attribute values to the limits above; keys in `drop` and values of other types are left out. */
export function trimAttributes(a: unknown, drop: ReadonlySet<string> = NONE): LogAttrs {
  const out: LogAttrs = {};
  if (!a || typeof a !== 'object' || Array.isArray(a)) return out;
  for (const [k, v] of Object.entries(a).slice(0, MAX_ATTRS)) {
    const key = k.slice(0, MAX_KEY);
    if (drop.has(key)) continue;
    if (typeof v === 'string') out[key] = v.slice(0, LONG_KEYS.has(key) ? MAX_LONG_ATTR : MAX_ATTR);
    else if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) out[key] = v;
  }
  return out;
}
