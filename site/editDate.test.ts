// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { editDateProblem, isIsoDate } from './editDate';

describe('editDateProblem', () => {
  // 2026-11-06 23:30 UTC, already 2026-11-07 in UTC+1
  const now = Date.parse('2026-11-06T23:30:00Z');

  it('accepts a real past date, today and UTC tomorrow', () => {
    expect(editDateProblem('2026-09-29', now)).toBeNull();
    expect(editDateProblem('2026-11-06', now)).toBeNull();
    expect(editDateProblem('2026-11-07', now)).toBeNull();
  });

  it('rejects a missing, malformed or impossible date', () => {
    expect(editDateProblem(undefined, now)).toBe('missing updated');
    expect(editDateProblem('29/09/2026', now)).toMatch(/not a real YYYY-MM-DD date/);
    expect(editDateProblem('2026-9-29', now)).toMatch(/not a real YYYY-MM-DD date/);
    expect(editDateProblem('2026-02-30', now)).toMatch(/not a real YYYY-MM-DD date/);
    expect(editDateProblem('', now)).toMatch(/not a real YYYY-MM-DD date/);
    expect(editDateProblem(20260929, now)).toMatch(/not a real YYYY-MM-DD date/);
  });

  it('rejects a date after UTC tomorrow', () => {
    expect(editDateProblem('2026-11-08', now)).toBe('updated 2026-11-08 is in the future');
  });

  it('knows leap years', () => {
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
  });
});
