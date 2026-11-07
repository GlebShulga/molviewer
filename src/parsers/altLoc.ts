import type { Atom } from '../types';

/**
 * Picks one alternate location per residue position: the first one seen.
 * Atoms without an altLoc are always kept. One choice per position (chain,
 * residue number and insertion code) also settles microheterogeneity, where
 * conformers A and B are different residues at the same position.
 *
 * Known limit: the choice is per position, not per file, so a file that lists
 * B before A in some residues mixes conformers across residues. wwPDB files
 * list A first. Choosing one conformer for the whole file would renumber
 * atoms again (ATOM_NUMBERING_VERSION, legacyIndexCutoff), so it isn't done.
 */
export function createAltLocFilter(): (
  atom: Pick<Atom, 'altLoc' | 'chainId' | 'residueNumber' | 'insertionCode'>
) => boolean {
  const chosen = new Map<string, string>();
  return (atom) => {
    if (!atom.altLoc) return true;
    const key = `${atom.chainId ?? ''}|${atom.residueNumber ?? ''}|${atom.insertionCode ?? ''}`;
    const pick = chosen.get(key);
    if (pick === undefined) {
      chosen.set(key, atom.altLoc);
      return true;
    }
    return pick === atom.altLoc;
  };
}
