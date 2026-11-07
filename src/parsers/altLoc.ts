import type { Atom } from '../types';

/**
 * Picks one alternate location per residue position: the first one seen.
 * Atoms without an altLoc are always kept. One choice per position (chain,
 * residue number and insertion code) also settles microheterogeneity, where
 * conformers A and B are different residues at the same position.
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
