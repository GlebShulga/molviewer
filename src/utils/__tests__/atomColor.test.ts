import { describe, expect, it } from 'vitest';
import { calculateColorSchemeContext, getAtomColor } from '../atomColor';
import { PLDDT_BANDS } from '../../colors';
import type { Atom, Molecule } from '../../types';

function atom(tempFactor: number): Atom {
  return { id: 0, element: 'C', x: 0, y: 0, z: 0, name: 'CA', residueNumber: 1, tempFactor } as Atom;
}

function molecule(name: string, bfactors: number[]): Molecule {
  return { name, atoms: bfactors.map(atom), bonds: [] };
}

describe('B-factor coloring', () => {
  it('uses the AlphaFold DB bands for AlphaFold models (high confidence is dark blue)', () => {
    const m = molecule('AF-P69905', [95, 80, 60, 30]);
    const ctx = calculateColorSchemeContext(m);
    expect(ctx.isPlddt).toBe(true);
    expect(m.atoms.map((a) => getAtomColor(a, 'bfactor', ctx))).toEqual(PLDDT_BANDS.map((b) => b.color));
  });

  it('puts band boundaries where AlphaFold DB does', () => {
    const ctx = calculateColorSchemeContext(molecule('AF-P69905', [0, 100]));
    expect(getAtomColor(atom(90), 'bfactor', ctx)).toBe(PLDDT_BANDS[1].color);
    expect(getAtomColor(atom(90.1), 'bfactor', ctx)).toBe(PLDDT_BANDS[0].color);
    expect(getAtomColor(atom(50), 'bfactor', ctx)).toBe(PLDDT_BANDS[3].color);
  });

  it('recognizes AlphaFold names by a valid accession only', () => {
    expect(calculateColorSchemeContext(molecule('AF-P69905-F1-model_v4', [1, 2])).isPlddt).toBe(true);
    expect(calculateColorSchemeContext(molecule('AF-DX 116', [1, 2])).isPlddt).toBe(false);
  });

  it('keeps the relative blue-white-red gradient for experimental structures', () => {
    const m = molecule('4HHB', [10, 50]);
    const ctx = calculateColorSchemeContext(m);
    expect(ctx.isPlddt).toBe(false);
    expect(getAtomColor(m.atoms[0], 'bfactor', ctx)).toBe('rgb(0, 0, 255)');
    expect(getAtomColor(m.atoms[1], 'bfactor', ctx)).toBe('rgb(255, 0, 0)');
  });
});

describe('Rainbow coloring', () => {
  const residue = (residueName: string, residueNumber: number): Atom =>
    ({ id: 0, element: 'C', x: 0, y: 0, z: 0, name: 'C1', residueName, residueNumber }) as Atom;
  const protein = [...Array.from({ length: 10 }, (_, i) => residue('ALA', i + 1)), residue('HEM', 11), residue('HOH', 500)];

  it('spans the polymer residues only, so the last one is red', () => {
    const ctx = calculateColorSchemeContext({ name: '4HHB', atoms: protein, bonds: [] });
    expect([ctx.minResNum, ctx.maxResNum]).toEqual([1, 10]);
    expect(getAtomColor(protein[9], 'rainbow', ctx)).toBe('hsl(0, 100%, 50%)');
  });

  it('counts a modified residue at the chain end, by its alpha carbon, but not calcium', () => {
    const mse = { ...residue('MSE', 11), name: 'CA' } as Atom;
    const calcium = { ...residue('CA', 300), name: 'CA', element: 'Ca' } as Atom;
    const ctx = calculateColorSchemeContext({ name: '1ABC', atoms: [...protein, mse, calcium], bonds: [] });
    expect([ctx.minResNum, ctx.maxResNum]).toEqual([1, 11]);
  });

  it('spans every residue when there is no polymer', () => {
    const ligands = [residue('ATP', 3), residue('MG', 7)];
    const ctx = calculateColorSchemeContext({ name: 'ATP', atoms: ligands, bonds: [] });
    expect([ctx.minResNum, ctx.maxResNum]).toEqual([3, 7]);
  });

  it('gives a residue past the range the red end, not a wrapped hue', () => {
    const ctx = calculateColorSchemeContext({ name: '4HHB', atoms: protein, bonds: [] });
    expect(getAtomColor(protein[11], 'rainbow', ctx)).toBe('hsl(0, 100%, 50%)');
  });
});
