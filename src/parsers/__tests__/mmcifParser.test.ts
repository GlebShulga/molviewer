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
