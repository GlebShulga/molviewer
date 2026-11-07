import { describe, expect, it } from 'vitest';
import { DEFAULT_ELEMENT, getElement } from '../elements';

describe('element table', () => {
  it('knows selenium (selenomethionine is common in crystal structures)', () => {
    const se = getElement('Se');
    expect(se).not.toBe(DEFAULT_ELEMENT);
    expect(se.atomicMass).toBeCloseTo(78.97, 1);
    expect(se.covalentRadius).toBeCloseTo(1.2, 2);
    expect(se.color).not.toBe(DEFAULT_ELEMENT.color);
  });

  it('knows the metals found in PDB entries and metal complexes', () => {
    for (const symbol of ['Mn', 'Hg', 'Cd', 'Pt', 'Cr', 'Mo', 'W', 'Au', 'Ag', 'As', 'Sn', 'Gd', 'Cs', 'Ga', 'In', 'Tl', 'Pb', 'Bi']) {
      const el = getElement(symbol);
      expect(el.symbol, symbol).toBe(symbol);
      expect(el.covalentRadius, symbol).toBeGreaterThan(1);
      expect(el.vdwRadius, symbol).toBeGreaterThan(1.4);
    }
  });

  it('reads uppercase symbols as written in PDB files', () => {
    expect(getElement('SE').symbol).toBe('Se');
    expect(getElement('HG').symbol).toBe('Hg');
  });
});
