import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useMoleculeStore, temporalStore } from '../../../store/moleculeStore';
import { ContextMenu } from '../ContextMenu';
import type { Molecule } from '../../../types';

/** Two residues and no chain IDs, as in many PDB files from older tools. */
function chainless(): Molecule {
  const atom = (id: number, name: string, residueNumber: number) => ({
    id, name, element: name.charAt(0), residueName: 'ALA', residueNumber, x: id * 1.5, y: 0, z: 0,
  });
  return { name: 'nochain', atoms: [atom(0, 'N', 1), atom(1, 'CA', 1), atom(2, 'N', 2), atom(3, 'CA', 2)], bonds: [] };
}

describe('ContextMenu on a file without chain IDs', () => {
  beforeEach(() => {
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
  });

  const open = () => {
    const id = useMoleculeStore.getState().addStructure(chainless(), 'nochain');
    const atom = useMoleculeStore.getState().structures.get(id)!.molecule.atoms[1];
    useMoleculeStore.getState().showContextMenu({
      x: 10, y: 10, atomIndex: 1, structureId: id,
      chainId: atom.chainId, residueName: atom.residueName, residueNumber: atom.residueNumber,
    });
    render(<ContextMenu />);
    return id;
  };
  const selected = (id: string) =>
    useMoleculeStore.getState().selectedAtoms.filter((r) => r.structureId === id).map((r) => r.atomIndex).sort();

  it('selects the residue', () => {
    const id = open();
    fireEvent.click(screen.getByText('Select residue'));
    expect(selected(id)).toEqual([0, 1]);
  });

  it('offers and selects the whole chain', () => {
    const id = open();
    fireEvent.click(screen.getByText(/Select chain/));
    expect(selected(id)).toEqual([0, 1, 2, 3]);
  });
});
