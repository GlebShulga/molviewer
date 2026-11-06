/**
 * The rule for hand-written edit dates (`updated` in data/collections.json),
 * shared by the site build, which fails on a bad one, and
 * scripts/validate-ids.ts. JSON is only cast to its type, so typecheck can't
 * catch a missing or malformed date, and the sitemap writes whatever it gets.
 */

/** A YYYY-MM-DD string that names a real calendar date (no 2026-02-30). */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/**
 * Why `value` is not a usable edit date, or null when it is. "Future" means
 * after UTC tomorrow: one day of slack, so a date set to the local date passes
 * both just after local midnight in UTC+ zones and on a CI runner in UTC.
 */
export function editDateProblem(value: unknown, now: number = Date.now()): string | null {
  if (value === undefined) return 'missing updated';
  if (!isIsoDate(value)) return `updated "${String(value)}" is not a real YYYY-MM-DD date`;
  const latest = new Date(now + 86_400_000).toISOString().slice(0, 10);
  if (value > latest) return `updated ${value} is in the future`;
  return null;
}
