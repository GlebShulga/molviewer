import type { Atom } from '../types';

export interface Residue {
  name: string;
  /** Missing when the file gives none (a ligand without a residue number): never 0, which is a real residue. */
  number: number | undefined;
  /** Insertion code: residue 52A follows 52 (antibody Kabat numbering). */
  insertionCode?: string;
  chainId: string;
  atoms: Atom[];
  /** Index in the molecule of each atom in `atoms`: a residue's atoms need not be contiguous in the file. */
  atomIndices: number[];
}

export interface Chain {
  id: string;
  residues: Residue[];
  atomCount: number;
}

/**
 * The chain an atom belongs to, for grouping and comparing: files without
 * chain IDs (blank column) put every atom in one chain, 'Unknown'. Use this
 * wherever atoms are matched or keyed by chain, so chainless files trace,
 * classify and select like any other.
 */
export function chainKey(atom: Pick<Atom, 'chainId'>): string {
  return atom.chainId || 'Unknown';
}

/**
 * Key of a residue position: chain, number and insertion code ("A:52",
 * "A:52A", "A:-3"). Used for the Cartoon residue filter and
 * secondary-structure lookups. A ligand numbered like a residue (MD and
 * docking output) shares its key: for one residue, use residueId. Built,
 * never parsed back.
 */
export function residueKey(chain: string, number: number | undefined, insertionCode?: string): string {
  return `${chain}:${number ?? 'none'}${insertionCode ?? ''}`;
}

/**
 * Id of one residue: chain, name, number and insertion code ("A:MET:1",
 * "A:LIG:1", "A:SER:52A"), 'UNK' for a missing name and 'none' for a
 * missing number, as analyzeResidues groups atoms. Pass the chain as
 * chainKey gives it. For UI keys, hover and highlight. Built, never parsed back.
 */
export function residueId(
  chain: string,
  name: string | undefined,
  number: number | undefined,
  insertionCode?: string
): string {
  return `${chain}:${name || 'UNK'}:${number ?? 'none'}${insertionCode ?? ''}`;
}

/** residueId of the residue an atom belongs to. */
export function atomResidueId(atom: Pick<Atom, 'chainId' | 'residueName' | 'residueNumber' | 'insertionCode'>): string {
  return residueId(chainKey(atom), atom.residueName, atom.residueNumber, atom.insertionCode);
}

type ResidueFields = Pick<Atom, 'chainId' | 'residueName' | 'residueNumber' | 'insertionCode'>;

/**
 * Whether two atoms are in the same residue by atomResidueId's fields
 * (chainKey, name with 'UNK' for none, number, insertion code), compared
 * without building strings: for scans over every atom.
 */
export function sameResidue(a: ResidueFields, b: ResidueFields): boolean {
  return (
    a.residueNumber === b.residueNumber &&
    (a.insertionCode ?? '') === (b.insertionCode ?? '') &&
    (a.residueName || 'UNK') === (b.residueName || 'UNK') &&
    chainKey(a) === chainKey(b)
  );
}

/** A residue number as shown to people: "52", "52A". */
export function residueLabel(number: number | undefined, insertionCode?: string): string {
  return `${number ?? ''}${insertionCode ?? ''}`;
}

const hasFiniteOrNoNumber = (atom: Atom) => atom.residueNumber === undefined || Number.isFinite(atom.residueNumber);

/**
 * The molecule with every residue number that isn't a finite number made
 * `undefined`, as parsers write a missing number now. Older PDB parsing
 * stored NaN for a blank column; IndexedDB keeps NaN and JSON (localStorage)
 * turns it into null, and residue sorting and keys read neither as missing.
 * For atoms stored by older builds: saved sessions and saved molecules.
 * Returns the same molecule when nothing changes.
 */
export function withFiniteResidueNumbers<M extends { atoms: Atom[] }>(molecule: M): M {
  if (molecule.atoms.every(hasFiniteOrNoNumber)) return molecule;
  return {
    ...molecule,
    atoms: molecule.atoms.map((atom) => (hasFiniteOrNoNumber(atom) ? atom : { ...atom, residueNumber: undefined })),
  };
}

/**
 * Order of residues in a chain: by number, then insertion code (52 < 52A <
 * 52B < 53). Residues without a number come last.
 */
export function compareResidueIds(
  aNumber: number | undefined,
  aCode: string | undefined,
  bNumber: number | undefined,
  bCode: string | undefined
): number {
  if (aNumber !== bNumber) {
    if (aNumber === undefined) return 1;
    if (bNumber === undefined) return -1;
    return aNumber - bNumber;
  }
  return (aCode ?? '').localeCompare(bCode ?? '');
}

export function analyzeResidues(atoms: Atom[]): Chain[] {
  const chainMap = new Map<string, Map<string, Residue>>();

  atoms.forEach((atom, index) => {
    const chainId = chainKey(atom);
    // Atoms without a residue number get their own residue, not residue 0's
    const key = atomResidueId(atom);

    if (!chainMap.has(chainId)) {
      chainMap.set(chainId, new Map());
    }

    const residueMap = chainMap.get(chainId)!;
    if (!residueMap.has(key)) {
      residueMap.set(key, {
        name: atom.residueName || 'UNK',
        number: atom.residueNumber,
        ...(atom.insertionCode ? { insertionCode: atom.insertionCode } : {}),
        chainId,
        atoms: [],
        atomIndices: [],
      });
    }

    const residue = residueMap.get(key)!;
    residue.atoms.push(atom);
    residue.atomIndices.push(index);
  });

  const chains: Chain[] = [];

  chainMap.forEach((residueMap, chainId) => {
    const residues = Array.from(residueMap.values()).sort((a, b) =>
      compareResidueIds(a.number, a.insertionCode, b.number, b.insertionCode)
    );

    chains.push({
      id: chainId,
      residues,
      atomCount: residues.reduce((sum, r) => sum + r.atoms.length, 0),
    });
  });

  return chains.sort((a, b) => a.id.localeCompare(b.id));
}

export function getResidueCenter(residue: Residue): { x: number; y: number; z: number } {
  if (residue.atoms.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  const sum = residue.atoms.reduce(
    (acc, atom) => ({
      x: acc.x + atom.x,
      y: acc.y + atom.y,
      z: acc.z + atom.z,
    }),
    { x: 0, y: 0, z: 0 }
  );

  return {
    x: sum.x / residue.atoms.length,
    y: sum.y / residue.atoms.length,
    z: sum.z / residue.atoms.length,
  };
}

// Common amino acid 3-letter to 1-letter codes
const AMINO_ACID_CODES: Record<string, string> = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C',
  GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I',
  LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P',
  SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V',
};

export function getOneLetterCode(threeLetterCode: string): string {
  return AMINO_ACID_CODES[threeLetterCode.toUpperCase()] || threeLetterCode.charAt(0);
}

export function isAminoAcid(residueName: string): boolean {
  return residueName.toUpperCase() in AMINO_ACID_CODES;
}

/** DNA residue names (unambiguous deoxy-nucleotides). */
export const DNA_RESIDUES: ReadonlySet<string> = new Set(['DA', 'DT', 'DC', 'DG', 'DU']);

/** RNA residue names. One letter, so the classifier also asks for a phosphate or ribose atom. */
export const RNA_RESIDUES: ReadonlySet<string> = new Set(['A', 'U', 'C', 'G']);

/** Nucleotide residue names, RNA and DNA. */
export const NUCLEIC_ACID_RESIDUES: ReadonlySet<string> = new Set([...RNA_RESIDUES, ...DNA_RESIDUES]);

/** Water residue names, in PDB files and from simulation packages. */
const WATER_RESIDUES = new Set(['HOH', 'WAT', 'H2O', 'SOL', 'TIP', 'TIP3', 'TIP4', 'SPC']);

export function isWater(residueName: string | undefined): boolean {
  return !!residueName && WATER_RESIDUES.has(residueName.toUpperCase());
}
