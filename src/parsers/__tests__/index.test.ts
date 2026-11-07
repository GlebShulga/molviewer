import { describe, expect, it } from 'vitest';
import { parseByFilename } from '..';
import { UnsupportedFormatError } from '../errors';

const V3000 = `methane
  MolViewer

  0  0  0     0  0            999 V3000
M  V30 BEGIN CTAB
M  V30 COUNTS 1 0 0 0 0
M  V30 BEGIN ATOM
M  V30 1 C 0.0 0.0 0.0 0
M  V30 END ATOM
M  V30 END CTAB
M  END
`;

describe('parseByFilename', () => {
  it('passes the reason a file is unsupported through, instead of the generic message', () => {
    expect(() => parseByFilename(V3000, 'methane.mol')).toThrow(UnsupportedFormatError);
    expect(() => parseByFilename(V3000, 'methane.mol')).toThrow(/V3000.*V2000/);
  });

  it('keeps the generic message for files that are just broken', () => {
    expect(() => parseByFilename('nonsense', 'x.pdb')).toThrow(/Could not parse file/);
  });
});
