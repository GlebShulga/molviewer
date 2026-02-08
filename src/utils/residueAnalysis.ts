import type { Atom } from '../types';

export interface Residue {
  name: string;
  number: number;
  chainId: string;
  atoms: Atom[];
  startIndex: number;
}

export interface Chain {
  id: string;
  residues: Residue[];
  atomCount: number;
}

export function analyzeResidues(atoms: Atom[]): Chain[] {
  const chainMap = new Map<string, Map<string, Residue>>();

  atoms.forEach((atom, index) => {
    const chainId = atom.chainId || 'Unknown';
    const residueKey = `${atom.residueName || 'UNK'}_${atom.residueNumber ?? 0}`;

    if (!chainMap.has(chainId)) {
      chainMap.set(chainId, new Map());
    }

    const residueMap = chainMap.get(chainId)!;
    if (!residueMap.has(residueKey)) {
      residueMap.set(residueKey, {
        name: atom.residueName || 'UNK',
        number: atom.residueNumber ?? 0,
        chainId,
        atoms: [],
        startIndex: index,
      });
    }

    residueMap.get(residueKey)!.atoms.push(atom);
  });

  const chains: Chain[] = [];

  chainMap.forEach((residueMap, chainId) => {
    const residues = Array.from(residueMap.values()).sort(
      (a, b) => a.number - b.number
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
