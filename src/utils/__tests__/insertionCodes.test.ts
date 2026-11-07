import { describe, expect, it } from 'vitest';
import { parsePDB } from '../../parsers/pdbParser';
import { parseMMCIF } from '../../parsers/mmcifParser';
import { analyzeResidues, residueKey, residueLabel } from '../residueAnalysis';
import { extractBackbone } from '../backboneExtraction';
import { classifyMolecule } from '../moleculeTypeClassifier';

/** Residues 52, 52A, 52B, 53 of chain H (Kabat numbering), N/CA/C each, given out of order. */
const residues: [number, string][] = [[52, ' '], [52, 'A'], [52, 'B'], [53, ' ']];
const atomLine = (serial: number, name: string, resSeq: number, iCode: string, x: number) =>
  `ATOM  ${String(serial).padStart(5)} ${name.padEnd(4)} SER H${String(resSeq).padStart(4)}${iCode}   ` +
  `${x.toFixed(3).padStart(8)}${'0.000'.padStart(8)}${'0.000'.padStart(8)}  1.00  0.00           ${name.trim().charAt(0)}`;
function pdb(helix?: string): string {
  const lines: string[] = helix ? [helix] : [];
  let serial = 1;
  // Written 53 first to check the sort
  for (const [num, ins] of [residues[3], residues[0], residues[1], residues[2]]) {
    const i = residues.findIndex(([n, c]) => n === num && c === ins);
    for (const [name, dx] of [[' N  ', 0], [' CA ', 1.2], [' C  ', 2.4]] as const) lines.push(atomLine(serial++, name, num, ins, i * 3.8 + dx));
  }
  return [...lines, 'END'].join('\n');
}

describe('insertion codes', () => {
  it('reads them from PDB column 27', () => {
    const m = parsePDB(pdb());
    expect(new Set(m.atoms.map((a) => `${a.residueNumber}${a.insertionCode ?? ''}`))).toEqual(new Set(['52', '52A', '52B', '53']));
  });

  it('gives 52, 52A, 52B and 53 four residues in order', () => {
    const [chain] = analyzeResidues(parsePDB(pdb()).atoms);
    expect(chain.residues.map((r) => residueLabel(r.number, r.insertionCode))).toEqual(['52', '52A', '52B', '53']);
  });

  it('traces them as four backbone residues in order', () => {
    const [chain] = extractBackbone(parsePDB(pdb()));
    expect(chain.residues.map((r) => residueLabel(r.residueNumber, r.insertionCode))).toEqual(['52', '52A', '52B', '53']);
  });

  it('keys the Cartoon filter by insertion code too', () => {
    const m = parsePDB(pdb());
    const filter = classifyMolecule(m).components.find((c) => c.type === 'protein')!.residueFilter!;
    for (const r of extractBackbone(m)[0].residues) expect(filter.has(residueKey(r.chainId, r.residueNumber, r.insertionCode))).toBe(true);
    expect(filter.size).toBe(4);
  });

  it('applies a PDB HELIX range that ends at 52B', () => {
    //       HELIX serial id  initRes c initSeq+iCode  endRes c endSeq+iCode
    const helix = 'HELIX    1   1 SER H   52  SER H   52B 1                                   3';
    const m = parsePDB(pdb(helix));
    const ss = new Map(m.atoms.map((a) => [`${a.residueNumber}${a.insertionCode ?? ''}`, a.secondaryStructure]));
    expect([...ss.entries()].sort()).toEqual([['52', 'helix'], ['52A', 'helix'], ['52B', 'helix'], ['53', 'coil']]);
  });

  it('reads mmCIF insertion codes and helix ranges that start at one', () => {
    const cif = `data_INS
loop_
_struct_conf.conf_type_id
_struct_conf.beg_auth_asym_id
_struct_conf.beg_auth_seq_id
_struct_conf.pdbx_beg_PDB_ins_code
_struct_conf.end_auth_seq_id
_struct_conf.pdbx_end_PDB_ins_code
HELX_P H 52 A 53 ?
#
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.auth_asym_id
_atom_site.auth_seq_id
_atom_site.pdbx_PDB_ins_code
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
ATOM 1 C CA SER H 52 ? 0.0 0 0
ATOM 2 C CA SER H 52 A 3.8 0 0
ATOM 3 C CA SER H 52 B 7.6 0 0
ATOM 4 C CA SER H 53 . 11.4 0 0
#
`;
    const m = parseMMCIF(cif);
    expect(m.atoms.map((a) => `${a.residueNumber}${a.insertionCode ?? ''}:${a.secondaryStructure}`)).toEqual([
      '52:coil', '52A:helix', '52B:helix', '53:helix',
    ]);
  });
});
