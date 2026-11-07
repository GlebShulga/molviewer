import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('does not offer Select chain (it would select everything)', () => {
    open();
    expect(screen.queryByText(/Select chain/)).toBeNull();
  });
});

describe('ContextMenu on a file with chain IDs', () => {
  beforeEach(() => {
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
  });

  it('offers Select chain A and selects only that chain', () => {
    const atom = (id: number, name: string, chainId: string) => ({
      id, name, element: name.charAt(0), residueName: 'ALA', residueNumber: 1, chainId, x: id * 1.5, y: 0, z: 0,
    });
    const id = useMoleculeStore.getState().addStructure(
      { name: 'two', atoms: [atom(0, 'N', 'A'), atom(1, 'CA', 'A'), atom(2, 'N', 'B'), atom(3, 'CA', 'B')], bonds: [] },
      'two'
    );
    useMoleculeStore.getState().showContextMenu({ x: 10, y: 10, atomIndex: 1, structureId: id, chainId: 'A', residueName: 'ALA', residueNumber: 1 });
    render(<ContextMenu />);
    fireEvent.click(screen.getByText('Select chain A'));
    expect(useMoleculeStore.getState().selectedAtoms.map((r) => r.atomIndex).sort()).toEqual([0, 1]);
  });
});

describe('Select residue picks one residue, not every one with its number', () => {
  beforeEach(() => {
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
  });

  const openOn = (molecule: Molecule, atomIndex: number) => {
    const id = useMoleculeStore.getState().addStructure(molecule, molecule.name);
    const atom = useMoleculeStore.getState().structures.get(id)!.molecule.atoms[atomIndex];
    useMoleculeStore.getState().showContextMenu({
      x: 10, y: 10, atomIndex, structureId: id,
      chainId: atom.chainId, residueName: atom.residueName, residueNumber: atom.residueNumber,
    });
    render(<ContextMenu />);
    fireEvent.click(screen.getByText('Select residue'));
    return useMoleculeStore.getState().selectedAtoms.filter((r) => r.structureId === id).map((r) => r.atomIndex).sort((a, b) => a - b);
  };

  it('selects the residue in its own segment of a chainless file whose segments restart at 1', () => {
    // Two segments of ALA 1, ALA 2 without chain IDs, as simulation packages write them
    const atom = (id: number, name: string, residueNumber: number) => ({
      id, name, element: name.charAt(0), residueName: 'ALA', residueNumber, x: id * 1.5, y: 0, z: 0,
    });
    const atoms = [
      atom(0, 'N', 1), atom(1, 'CA', 1), atom(2, 'N', 2), atom(3, 'CA', 2),
      atom(4, 'N', 1), atom(5, 'CA', 1), atom(6, 'N', 2), atom(7, 'CA', 2),
    ];
    expect(openOn({ name: 'segments', atoms, bonds: [] }, 5)).toEqual([4, 5]);
  });

  it('selects a ligand without the residue that shares its number in the chain', () => {
    const atom = (id: number, name: string, residueName: string) => ({
      id, name, element: name.charAt(0), residueName, residueNumber: 1, chainId: 'A', x: id * 1.5, y: 0, z: 0,
    });
    const atoms = [atom(0, 'N', 'MET'), atom(1, 'CA', 'MET'), atom(2, 'C1', 'LIG'), atom(3, 'O1', 'LIG')];
    expect(openOn({ name: 'complex', atoms, bonds: [] }, 3)).toEqual([2, 3]);
  });
});

describe('ContextMenu with insertion codes', () => {
  beforeEach(() => {
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
  });

  it('selects residue 52A without 52, and names it 52A', () => {
    const atom = (id: number, name: string, insertionCode?: string) => ({
      id, name, element: name.charAt(0), residueName: 'SER', residueNumber: 52, insertionCode, chainId: 'H', x: id * 1.5, y: 0, z: 0,
    });
    const id = useMoleculeStore.getState().addStructure(
      { name: 'ab', atoms: [atom(0, 'N'), atom(1, 'CA'), atom(2, 'N', 'A'), atom(3, 'CA', 'A')], bonds: [] },
      'ab'
    );
    useMoleculeStore.getState().showContextMenu({ x: 10, y: 10, atomIndex: 3, structureId: id, chainId: 'H', residueName: 'SER', residueNumber: 52 });
    render(<ContextMenu />);
    expect(screen.getByText(/SER52A CA/)).toBeTruthy();
    fireEvent.click(screen.getByText('Select residue'));
    expect(useMoleculeStore.getState().selectedAtoms.map((r) => r.atomIndex).sort()).toEqual([2, 3]);
  });
});

describe('ContextMenu Focus', () => {
  beforeEach(() => {
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
  });

  it('passes the structure and atom to onFocusAtom and closes', () => {
    useMoleculeStore.getState().addStructure(chainless(), 'first');
    const id = useMoleculeStore.getState().addStructure(chainless(), 'second');
    useMoleculeStore.getState().showContextMenu({ x: 10, y: 10, atomIndex: 2, structureId: id });
    const onFocusAtom = vi.fn();
    render(<ContextMenu onFocusAtom={onFocusAtom} />);
    fireEvent.click(screen.getByText('Focus'));
    expect(onFocusAtom).toHaveBeenCalledWith(id, 2);
    expect(useMoleculeStore.getState().contextMenu.visible).toBe(false);
  });
});
