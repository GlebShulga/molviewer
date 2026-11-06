import { describe, it, expect } from 'vitest';
import { roundAtoms } from '../track';

describe('roundAtoms', () => {
  it('keeps two significant figures', () => {
    expect(roundAtoms(0)).toBe(0);
    expect(roundAtoms(46)).toBe(46);
    expect(roundAtoms(4782)).toBe(4800);
    expect(roundAtoms(123456)).toBe(120000);
  });
});
