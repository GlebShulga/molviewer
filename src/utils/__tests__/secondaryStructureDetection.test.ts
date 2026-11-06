import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectSecondaryStructure } from '../secondaryStructureDetection';
import { parsePDB } from '../../parsers/pdbParser';

const pdb = readFileSync(resolve(__dirname, '../../../public/sample-molecules/1crn.pdb'), 'utf8');

describe('detectSecondaryStructure on Crambin without HELIX/SHEET records', () => {
  // The file's own records are the reference
  const reference = parsePDB(pdb);
  const stripped = parsePDB(
    pdb
      .split('\n')
      .filter((line) => !line.startsWith('HELIX') && !line.startsWith('SHEET'))
      .join('\n')
  );
  detectSecondaryStructure(stripped);

  const caIndices = stripped.atoms
    .map((a, i) => (a.name?.trim() === 'CA' ? i : -1))
    .filter((i) => i >= 0);

  const assigned = (residues: [number, number]) =>
    caIndices.filter((i) => {
      const r = stripped.atoms[i].residueNumber!;
      return r >= residues[0] && r <= residues[1];
    });

  it('agrees with the file on at least 85% of residues', () => {
    const agree = caIndices.filter(
      (i) => stripped.atoms[i].secondaryStructure === reference.atoms[i].secondaryStructure
    ).length;
    expect(agree / caIndices.length).toBeGreaterThanOrEqual(0.85);
  });

  it.each([
    [7, 19],
    [23, 30],
  ] as [number, number][])('finds the helix at residues %i-%i', (start, end) => {
    const cas = assigned([start, end]);
    const helix = cas.filter((i) => stripped.atoms[i].secondaryStructure === 'helix').length;
    expect(helix / cas.length).toBeGreaterThanOrEqual(0.75);
  });
});
