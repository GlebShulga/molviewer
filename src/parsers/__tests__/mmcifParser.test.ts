import { describe, it, expect } from 'vitest';
import { parseMMCIF } from '../mmcifParser';

describe('parseMMCIF', () => {
  it('parses a minimal mmCIF with atom data', () => {
    const cif = `data_TEST
#
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
ATOM   1  N  N    MET A 1   27.340  24.430   2.614  1.00  9.67
ATOM   2  C  CA   MET A 1   26.266  25.413   2.842  1.00  9.67
ATOM   3  C  C    MET A 1   26.913  26.639   3.531  1.00  9.67
#
`;

    const molecule = parseMMCIF(cif);

    expect(molecule.name).toBe('TEST');
    expect(molecule.atoms).toHaveLength(3);
    expect(molecule.atoms[0].element).toBe('N');
    expect(molecule.atoms[0].name).toBe('N');
    expect(molecule.atoms[0].residueName).toBe('MET');
    expect(molecule.atoms[0].chainId).toBe('A');
    expect(molecule.atoms[0].residueNumber).toBe(1);
    expect(molecule.atoms[0].x).toBeCloseTo(27.340);
    expect(molecule.atoms[0].y).toBeCloseTo(24.430);
    expect(molecule.atoms[0].z).toBeCloseTo(2.614);
    expect(molecule.atoms[0].tempFactor).toBeCloseTo(9.67);
  });

  it('prefers auth_ fields over label_ fields', () => {
    const cif = `data_TEST
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.auth_asym_id
_atom_site.auth_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
ATOM   1  N  N   MET A 1   B  100  27.340  24.430  2.614
`;

    const molecule = parseMMCIF(cif);

    expect(molecule.atoms[0].chainId).toBe('B');
    expect(molecule.atoms[0].residueNumber).toBe(100);
  });

  it('falls back to label_ fields when auth_ are missing', () => {
    const cif = `data_TEST
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
ATOM   1  N  N   MET A 5   27.340  24.430  2.614
`;

    const molecule = parseMMCIF(cif);

    expect(molecule.atoms[0].chainId).toBe('A');
    expect(molecule.atoms[0].residueNumber).toBe(5);
  });

  it('handles null values (. and ?) correctly', () => {
    const cif = `data_TEST
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.B_iso_or_equiv
ATOM   1  N  N   MET A ?   27.340  24.430  2.614  .
`;

    const molecule = parseMMCIF(cif);

    expect(molecule.atoms[0].residueNumber).toBeUndefined();
    expect(molecule.atoms[0].tempFactor).toBeUndefined();
  });

  it('handles quoted strings', () => {
    const cif = `data_TEST
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
ATOM   1  N  "N'"   MET A 1   27.340  24.430  2.614
`;

    const molecule = parseMMCIF(cif);

    expect(molecule.atoms[0].name).toBe("N'");
  });

  it('only parses first model for NMR structures', () => {
    const cif = `data_NMR
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.pdbx_PDB_model_num
ATOM   1  N  N   MET A 1   27.340  24.430  2.614  1
ATOM   2  C  CA  MET A 1   26.266  25.413  2.842  1
ATOM   3  N  N   MET A 1   28.000  25.000  3.000  2
ATOM   4  C  CA  MET A 1   27.000  26.000  4.000  2
`;

    const molecule = parseMMCIF(cif);

    expect(molecule.atoms).toHaveLength(2);
    expect(molecule.atoms[0].x).toBeCloseTo(27.340);
    expect(molecule.atoms[1].x).toBeCloseTo(26.266);
  });

  it('filters alternate conformations to keep only . or A', () => {
    const cif = `data_ALT
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.label_alt_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
ATOM   1  N  N   MET A 1  .  27.340  24.430  2.614
ATOM   2  C  CA  MET A 1  A  26.266  25.413  2.842
ATOM   3  C  CA  MET A 1  B  26.500  25.500  2.900
`;

    const molecule = parseMMCIF(cif);

    expect(molecule.atoms).toHaveLength(2);
  });

  it('parses helix secondary structure from _struct_conf', () => {
    const cif = `data_SS
loop_
_struct_conf.conf_type_id
_struct_conf.beg_auth_asym_id
_struct_conf.beg_auth_seq_id
_struct_conf.end_auth_seq_id
HELX_P  A  5  15
#
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.auth_asym_id
_atom_site.auth_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
ATOM   1  N  N   ALA A 1   0.0  0.0  0.0
ATOM   2  N  N   ALA A 10  1.0  1.0  1.0
ATOM   3  N  N   ALA A 20  2.0  2.0  2.0
`;

    const molecule = parseMMCIF(cif);

    expect(molecule.atoms[0].secondaryStructure).toBe('coil');
    expect(molecule.atoms[1].secondaryStructure).toBe('helix');
    expect(molecule.atoms[2].secondaryStructure).toBe('coil');
  });

  it('parses sheet secondary structure from _struct_sheet_range', () => {
    const cif = `data_SS
loop_
_struct_sheet_range.beg_auth_asym_id
_struct_sheet_range.beg_auth_seq_id
_struct_sheet_range.end_auth_seq_id
A  50  60
#
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.auth_asym_id
_atom_site.auth_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
ATOM   1  N  N   ALA A 40  0.0  0.0  0.0
ATOM   2  N  N   ALA A 55  1.0  1.0  1.0
ATOM   3  N  N   ALA A 70  2.0  2.0  2.0
`;

    const molecule = parseMMCIF(cif);

    expect(molecule.atoms[0].secondaryStructure).toBe('coil');
    expect(molecule.atoms[1].secondaryStructure).toBe('sheet');
    expect(molecule.atoms[2].secondaryStructure).toBe('coil');
  });

  it('infers bonds by default', () => {
    const cif = `data_WATER
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
HETATM  1  O  O   HOH A 1   0.000  0.000  0.000
HETATM  2  H  H1  HOH A 1   0.960  0.000  0.000
HETATM  3  H  H2  HOH A 1  -0.240  0.930  0.000
`;

    const molecule = parseMMCIF(cif);

    expect(molecule.atoms).toHaveLength(3);
    expect(molecule.bonds.length).toBeGreaterThan(0);
  });

  it('respects inferBonds option', () => {
    const cif = `data_WATER
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
HETATM  1  O  O   HOH A 1   0.000  0.000  0.000
HETATM  2  H  H1  HOH A 1   0.960  0.000  0.000
`;

    const molecule = parseMMCIF(cif, { inferBonds: false });
    expect(molecule.bonds).toHaveLength(0);
  });

  it('throws on missing coordinate columns', () => {
    const cif = `data_BAD
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
ATOM   1  N
`;

    expect(() => parseMMCIF(cif)).toThrow('Missing required column');
  });

  it('throws on empty atom list', () => {
    const cif = `data_EMPTY
loop_
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
#
`;

    expect(() => parseMMCIF(cif)).toThrow('No valid atoms found');
  });

  it('parses HETATM and ATOM records', () => {
    const cif = `data_HET
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
HETATM  1  O  O   HOH A 1   0.000  0.000  0.000
ATOM    2  N  N   ALA A 1   1.000  1.000  1.000
`;

    const molecule = parseMMCIF(cif);

    // Both HETATM and ATOM records should be parsed
    expect(molecule.atoms).toHaveLength(2);
    expect(molecule.atoms[0].element).toBe('O');
    expect(molecule.atoms[0].residueName).toBe('HOH');
    expect(molecule.atoms[1].element).toBe('N');
    expect(molecule.atoms[1].residueName).toBe('ALA');
  });

  it('extracts molecule name from _entry.id', () => {
    const cif = `data_1CRN
_entry.id   1CRN
loop_
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
0.0  0.0  0.0
`;

    const molecule = parseMMCIF(cif);
    expect(molecule.name).toBe('1CRN');
  });
});

describe('parseMMCIF occupancy', () => {
  const cif = (occ: string[]) => `data_OCC
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
${occ.map((o, i) => `ATOM ${i + 1} C CA ALA A ${i + 1} ${i * 3}.0 0.0 0.0 ${o}`).join('\n')}
#
`;

  it('keeps an occupancy of 0 and reads ? and . as 1', () => {
    expect(parseMMCIF(cif(['0.00', '?', '.', '0.50'])).atoms.map((a) => a.occupancy)).toEqual([0, 1, 1, 0.5]);
  });
});

describe('parseMMCIF alternate locations', () => {
  const cif = (rows: string[]) => `data_ALT
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_alt_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
${rows.join('\n')}
#
`;

  it('keeps a residue that only has a B conformer, and one conformer elsewhere', () => {
    const m = parseMMCIF(
      cif([
        'ATOM 1 C CA . SER A 1 0.0 0.0 0.0',
        'ATOM 2 C CB A SER A 1 1.5 0.0 0.0',
        'ATOM 3 C CB B SER A 1 1.6 0.0 0.0',
        'ATOM 4 C CA B GLY A 2 3.8 0.0 0.0',
      ])
    );
    expect(m.atoms.map((a) => `${a.residueName}${a.residueNumber}:${a.name}${a.altLoc ?? ''}`)).toEqual(['SER1:CA', 'SER1:CBA', 'GLY2:CAB']);
  });
});

describe('parseMMCIF single-row categories (no loop_)', () => {
  const atomLoop = (n: number) => `loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.auth_asym_id
_atom_site.auth_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
${Array.from({ length: n }, (_, i) => `ATOM ${i + 1} C CA ALA A ${i + 1} A ${i + 1} ${(i * 3.8).toFixed(1)} 0.0 0.0`).join('\n')}
#
`;

  it('reads a single helix written as key-value pairs, values on the same line', () => {
    const cif = `data_ONE
_struct_conf.conf_type_id HELX_P
_struct_conf.id HELX_P1
_struct_conf.beg_auth_asym_id A
_struct_conf.beg_auth_seq_id 2
_struct_conf.end_auth_seq_id 4
_struct_conf.details 'a short helix'
#
${atomLoop(5)}`;
    expect(parseMMCIF(cif).atoms.map((a) => a.secondaryStructure)).toEqual(['coil', 'helix', 'helix', 'helix', 'coil']);
  });

  it('reads values on the next line and ; text fields', () => {
    const cif = `data_TWO
_struct_conf.conf_type_id
HELX_P
_struct_conf.details
;a helix
described over two lines
;
_struct_conf.beg_auth_asym_id A
_struct_conf.beg_auth_seq_id 1
_struct_conf.end_auth_seq_id "3"
#
${atomLoop(4)}`;
    expect(parseMMCIF(cif).atoms.map((a) => a.secondaryStructure)).toEqual(['helix', 'helix', 'helix', 'coil']);
  });

  it('keeps the columns after a text field that starts with a quote and holds spaces', () => {
    const cif = `data_QUOTE
_struct_conf.conf_type_id HELX_P
_struct_conf.details
;'A' and B
;
_struct_conf.beg_auth_asym_id A
_struct_conf.beg_auth_seq_id 2
_struct_conf.end_auth_seq_id 3
#
${atomLoop(4)}`;
    expect(parseMMCIF(cif).atoms.map((a) => a.secondaryStructure)).toEqual(['coil', 'helix', 'helix', 'coil']);
  });

  it('reads a single atom after a text field that starts with a quote', () => {
    const cif = `data_ATOMQ
_atom_site.group_PDB HETATM
_atom_site.id 1
_atom_site.details
;'bound' ion, one site
;
_atom_site.type_symbol ZN
_atom_site.label_atom_id ZN
_atom_site.label_comp_id ZN
_atom_site.label_asym_id B
_atom_site.Cartn_x 1.5
_atom_site.Cartn_y -2.0
_atom_site.Cartn_z 3.25
#
`;
    const m = parseMMCIF(cif);
    expect(m.atoms).toHaveLength(1);
    expect(m.atoms[0]).toMatchObject({ element: 'Zn', chainId: 'B', x: 1.5, y: -2, z: 3.25 });
  });

  it('reads a single sheet strand', () => {
    const cif = `data_SHEET
_struct_sheet_range.sheet_id A
_struct_sheet_range.id 1
_struct_sheet_range.beg_auth_asym_id A
_struct_sheet_range.beg_auth_seq_id 1
_struct_sheet_range.end_auth_seq_id 2
#
${atomLoop(3)}`;
    expect(parseMMCIF(cif).atoms.map((a) => a.secondaryStructure)).toEqual(['sheet', 'sheet', 'coil']);
  });

  it('reads a file with a single atom written as key-value pairs', () => {
    const cif = `data_ATOM1
_atom_site.group_PDB HETATM
_atom_site.id 1
_atom_site.type_symbol ZN
_atom_site.label_atom_id ZN
_atom_site.label_comp_id ZN
_atom_site.label_asym_id B
_atom_site.label_seq_id .
_atom_site.Cartn_x 1.5
_atom_site.Cartn_y -2.0
_atom_site.Cartn_z 3.25
#
`;
    const m = parseMMCIF(cif);
    expect(m.atoms).toHaveLength(1);
    expect(m.atoms[0]).toMatchObject({ element: 'Zn', residueName: 'ZN', chainId: 'B', x: 1.5, y: -2, z: 3.25 });
  });
});

describe('parseMMCIF blank and comment lines after loop_', () => {
  const atomHeaders = `_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.auth_asym_id
_atom_site.auth_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
ATOM 1 C CA ALA A 1 0.0 0.0 0.0
ATOM 2 C CA ALA A 2 3.8 0.0 0.0
ATOM 3 C CA ALA A 3 7.6 0.0 0.0
#
`;

  it('reads an atom loop with a blank line after loop_', () => {
    expect(parseMMCIF(`data_BLANK\nloop_\n\n${atomHeaders}`).atoms).toHaveLength(3);
  });

  it('reads an atom loop with a comment line after loop_', () => {
    expect(parseMMCIF(`data_COMMENT\nloop_\n# atoms\n${atomHeaders}`).atoms).toHaveLength(3);
  });

  it('reads a helix loop with a blank and a comment line after loop_', () => {
    const cif = `data_HELIX
loop_

# helices
_struct_conf.conf_type_id
_struct_conf.beg_auth_asym_id
_struct_conf.beg_auth_seq_id
_struct_conf.end_auth_seq_id
HELX_P A 2 3
#
loop_
${atomHeaders}`;
    expect(parseMMCIF(cif).atoms.map((a) => a.secondaryStructure)).toEqual(['coil', 'helix', 'helix']);
  });
});

describe('parseMMCIF loop rows and column fallbacks', () => {
  /** An atom loop with label_ and auth_ chain/number columns, one CA per row. */
  const atoms = (rows: string) => `loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.auth_asym_id
_atom_site.auth_seq_id
_atom_site.pdbx_PDB_ins_code
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
${rows}
#
`;
  const ss = (m: ReturnType<typeof parseMMCIF>) =>
    m.atoms.map((a) => `${a.chainId}${a.residueNumber}${a.insertionCode ?? ''}:${a.secondaryStructure}`);

  it('falls through an auth_ value of . or ? to the label_ column', () => {
    const m = parseMMCIF(`data_T
${atoms(`ATOM 1 C CA ALA A 7 . ? ? 0 0 0
ATOM 2 C CA ALA A 8 B 108 ? 3.8 0 0`)}`);
    expect(m.atoms.map((a) => [a.chainId, a.residueNumber])).toEqual([['A', 7], ['B', 108]]);
  });

  it('skips atom rows with fewer values than columns, and rows without coordinates', () => {
    const m = parseMMCIF(`data_T
${atoms(`ATOM 1 C CA ALA A 1 A 1 ? 0 0 0
ATOM 2 C CA ALA A 2 A 2 ? 3.8 0
ATOM 3 C CA ALA A 3 A 3 ? 7.6 x 0
ATOM 4 C CA ALA A 4 A 4 ? 11.4 0 0`)}`);
    expect(m.atoms.map((a) => a.residueNumber)).toEqual([1, 4]);
  });

  it('reads helix and sheet ranges from label_ columns when auth_ columns are missing', () => {
    const m = parseMMCIF(`data_T
loop_
_struct_conf.conf_type_id
_struct_conf.beg_label_asym_id
_struct_conf.beg_label_seq_id
_struct_conf.end_label_seq_id
HELX_P A 1 2
#
loop_
_struct_sheet_range.sheet_id
_struct_sheet_range.beg_label_asym_id
_struct_sheet_range.beg_label_seq_id
_struct_sheet_range.end_label_seq_id
S1 A 4 4
#
${atoms(`ATOM 1 C CA ALA A 1 ? ? ? 0 0 0
ATOM 2 C CA ALA A 2 ? ? ? 3.8 0 0
ATOM 3 C CA ALA A 3 ? ? ? 7.6 0 0
ATOM 4 C CA ALA A 4 ? ? ? 11.4 0 0`)}`);
    expect(ss(m)).toEqual(['A1:helix', 'A2:helix', 'A3:coil', 'A4:sheet']);
  });

  it('falls through auth_ values of . or ? in ranges to the label_ columns', () => {
    const m = parseMMCIF(`data_T
loop_
_struct_conf.conf_type_id
_struct_conf.beg_auth_asym_id
_struct_conf.beg_label_asym_id
_struct_conf.beg_auth_seq_id
_struct_conf.beg_label_seq_id
_struct_conf.end_auth_seq_id
_struct_conf.end_label_seq_id
HELX_P ? A . 2 ? 3
#
${atoms(`ATOM 1 C CA ALA A 1 ? ? ? 0 0 0
ATOM 2 C CA ALA A 2 ? ? ? 3.8 0 0
ATOM 3 C CA ALA A 3 ? ? ? 7.6 0 0`)}`);
    expect(ss(m)).toEqual(['A1:coil', 'A2:helix', 'A3:helix']);
  });

  it('ignores conf types other than HELX, rows without a type, short rows and unreadable ranges', () => {
    const m = parseMMCIF(`data_T
loop_
_struct_conf.conf_type_id
_struct_conf.beg_auth_asym_id
_struct_conf.beg_auth_seq_id
_struct_conf.end_auth_seq_id
TURN_P A 1 1
? A 2 2
HELX_P A 3
HELX_P A x 4
HELX_P ? 4 4
helx_lh_pp_p A 5 5
#
loop_
_struct_sheet_range.beg_auth_asym_id
_struct_sheet_range.beg_auth_seq_id
_struct_sheet_range.end_auth_seq_id
A 6
A 6 y
. 6 6
A 7 7
#
${atoms(`ATOM 1 C CA ALA A 1 A 1 ? 0 0 0
ATOM 2 C CA ALA A 2 A 2 ? 3.8 0 0
ATOM 3 C CA ALA A 3 A 3 ? 7.6 0 0
ATOM 4 C CA ALA A 4 A 4 ? 11.4 0 0
ATOM 5 C CA ALA A 5 A 5 ? 15.2 0 0
ATOM 6 C CA ALA A 6 A 6 ? 19.0 0 0
ATOM 7 C CA ALA A 7 A 7 ? 22.8 0 0`)}`);
    expect(ss(m)).toEqual(['A1:coil', 'A2:coil', 'A3:coil', 'A4:coil', 'A5:helix', 'A6:coil', 'A7:sheet']);
  });

  it('reads insertion codes on atoms and on both ends of helix and sheet ranges', () => {
    const m = parseMMCIF(`data_T
loop_
_struct_conf.conf_type_id
_struct_conf.beg_auth_asym_id
_struct_conf.beg_auth_seq_id
_struct_conf.pdbx_beg_PDB_ins_code
_struct_conf.end_auth_seq_id
_struct_conf.pdbx_end_PDB_ins_code
HELX_P A 10 A 10 B
#
loop_
_struct_sheet_range.beg_auth_asym_id
_struct_sheet_range.beg_auth_seq_id
_struct_sheet_range.pdbx_beg_PDB_ins_code
_struct_sheet_range.end_auth_seq_id
_struct_sheet_range.pdbx_end_PDB_ins_code
A 11 ? 11 A
#
${atoms(`ATOM 1 C CA ALA A 10 A 10 ? 0 0 0
ATOM 2 C CA ALA A 10 A 10 A 3.8 0 0
ATOM 3 C CA ALA A 10 A 10 B 7.6 0 0
ATOM 4 C CA ALA A 10 A 10 C 11.4 0 0
ATOM 5 C CA ALA A 11 A 11 . 15.2 0 0
ATOM 6 C CA ALA A 11 A 11 A 19.0 0 0
ATOM 7 C CA ALA A 11 A 11 B 22.8 0 0`)}`);
    expect(ss(m)).toEqual([
      'A10:coil', 'A10A:helix', 'A10B:helix', 'A10C:coil',
      'A11:sheet', 'A11A:sheet', 'A11B:coil',
    ]);
  });
});

describe('parseMMCIF indented loop headers', () => {
  const indent = (block: string) => block.replace(/^_/gm, '  _');
  const atomLoop = `loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.auth_asym_id
_atom_site.auth_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
ATOM 1 C CA ALA A 1 0.0 0.0 0.0
ATOM 2 C CA ALA A 2 3.8 0.0 0.0
ATOM 3 C CA ALA A 3 7.6 0.0 0.0
#
`;
  const helixLoop = `loop_
_struct_conf.conf_type_id
_struct_conf.beg_auth_asym_id
_struct_conf.beg_auth_seq_id
_struct_conf.end_auth_seq_id
HELX_P A 1 1
#
`;
  const sheetLoop = `loop_
_struct_sheet_range.beg_auth_asym_id
_struct_sheet_range.beg_auth_seq_id
_struct_sheet_range.end_auth_seq_id
A 3 3
#
`;

  it('reads an atom loop with indented headers', () => {
    const m = parseMMCIF(`data_T\n${indent(atomLoop)}`);
    expect(m.atoms.map((a) => a.residueNumber)).toEqual([1, 2, 3]);
  });

  it('reads helix and sheet loops with indented headers', () => {
    const m = parseMMCIF(`data_T\n${indent(helixLoop)}${indent(sheetLoop)}${atomLoop}`);
    expect(m.atoms.map((a) => a.secondaryStructure)).toEqual(['helix', 'coil', 'sheet']);
  });
});
