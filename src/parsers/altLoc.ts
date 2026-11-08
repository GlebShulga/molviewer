import type { Atom } from '../types';
import { chainKey, residueKey } from '../utils/residueAnalysis';

/**
 * Picks one alternate location per residue position: the first one seen.
 * Atoms without an altLoc are always kept. One choice per position (chain,
 * residue number and insertion code, residueKey) also settles
 * microheterogeneity, where conformers A and B are different residues at the
 * same position. Atoms without a residue number (ligands in files that leave
 * the column blank) have no position, so their residue name tells them
 * apart: one ligand's A doesn't drop another ligand's only conformer, B.
 *
 * Known limits: numberless ligands with the same name still share one choice.
 * The choice is per position, not per file, so a file that lists B before A
 * in some residues mixes conformers across residues. wwPDB files list A
 * first. Choosing one conformer for the whole file would renumber atoms
 * again (ATOM_NUMBERING_VERSION, legacyIndexCutoff), so it isn't done.
 */
export function createAltLocFilter(): (
  atom: Pick<Atom, 'altLoc' | 'chainId' | 'residueNumber' | 'insertionCode' | 'residueName'>
) => boolean {
  const chosen = new Map<string, string>();
  return (atom) => {
    if (!atom.altLoc) return true;
    const position = residueKey(chainKey(atom), atom.residueNumber, atom.insertionCode);
    const key = atom.residueNumber === undefined ? `${position}:${atom.residueName ?? ''}` : position;
    const pick = chosen.get(key);
    if (pick === undefined) {
      chosen.set(key, atom.altLoc);
      return true;
    }
    return pick === atom.altLoc;
  };
}
