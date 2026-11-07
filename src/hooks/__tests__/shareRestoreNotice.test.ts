import { describe, expect, it } from 'vitest';
import { shareRestoreNotice } from '../useInitialUrlLoad';

describe('shareRestoreNotice', () => {
  it('names skipped structures and counts dropped references', () => {
    expect(shareRestoreNotice([], 0)).toBeNull();
    expect(shareRestoreNotice(['X'], 0)).toBe('Some structures in this share could not be restored: X');
    expect(shareRestoreNotice([], 2)).toBe('2 labels or measurements no longer match the structure and were left out.');
    expect(shareRestoreNotice([], 1)).toBe('1 label or measurement no longer matches the structure and was left out.');
    expect(shareRestoreNotice(['X', 'Y'], 1)).toBe(
      'Some structures in this share could not be restored: X, Y. 1 label or measurement no longer matches the structure and was left out.'
    );
  });
});
