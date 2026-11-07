import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useMoleculeStore, temporalStore } from '../../../store/moleculeStore';
import { ResidueNavigator } from '../ResidueNavigator';
import type { Atom, Molecule } from '../../../types';

/** Chain A: MET 1 and ALA 2, and a ligand LIG that shares number 1 (as MD and docking output number them). */
function metAndLigandOne(): Molecule {
  const atoms: Atom[] = [];
  const add = (name: string, element: string, residueName: string, residueNumber: number) =>
    atoms.push({ id: atoms.length, name, element, residueName, residueNumber, chainId: 'A', x: atoms.length * 1.5, y: 0, z: 0 });
  for (const [name, element] of [['N', 'N'], ['CA', 'C'], ['C', 'C'], ['O', 'O']]) add(name, element, 'MET', 1);
  for (const [name, element] of [['N', 'N'], ['CA', 'C'], ['C', 'C'], ['O', 'O']]) add(name, element, 'ALA', 2);
  add('C1', 'C', 'LIG', 1);
  add('O1', 'O', 'LIG', 1);
  return { name: 'complex', atoms, bonds: [] };
}

/** Chain A: ALA 1, GLY 2. The GLY atoms come first in the file. */
function peptide(name: string): Molecule {
  const atom = (id: number, atomName: string, residueName: string, residueNumber: number) => ({
    id, name: atomName, element: atomName.charAt(0), residueName, residueNumber, chainId: 'A', x: id * 1.5, y: 0, z: 0,
  });
  return {
    name,
    atoms: [atom(0, 'N', 'GLY', 2), atom(1, 'CA', 'GLY', 2), atom(2, 'N', 'ALA', 1), atom(3, 'CA', 'ALA', 1)],
    bonds: [],
  };
}

beforeEach(() => {
  localStorage.clear();
  useMoleculeStore.getState().reset();
  temporalStore.getState().clear();
});

describe('ResidueNavigator with two residues numbered 1 in one chain', () => {
  afterEach(() => vi.restoreAllMocks());

  const open = () => {
    useMoleculeStore.getState().addStructure(metAndLigandOne(), 'complex');
    render(<ResidueNavigator />);
    fireEvent.click(screen.getByText('Residues'));
    fireEvent.click(screen.getByText('3 residues'));
  };
  const row = (name: string) => screen.getAllByText(name).find((el) => el.closest('button'))!.closest('button')!;

  it('lists both, with keys React can tell apart', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    open();
    expect(row('MET')).toBeTruthy();
    expect(row('LIG')).toBeTruthy();
    expect(error.mock.calls.flat().join(' ')).not.toMatch(/same key/);
  });

  it('highlights only the hovered one', () => {
    open();
    fireEvent.mouseEnter(row('LIG'));
    expect(row('LIG').className).toMatch(/hovered/);
    expect(row('MET').className).not.toMatch(/hovered/);
  });
});

describe('ResidueNavigator', () => {
  function renderWithTwoStructures() {
    const store = useMoleculeStore.getState();
    store.addStructure(peptide('first'), 'first');
    const second = store.addStructure(peptide('second'), 'second');
    store.setActiveStructure(second);
    const onResidueSelect = vi.fn();
    const onResidueHover = vi.fn();
    render(<ResidueNavigator onResidueSelect={onResidueSelect} onResidueHover={onResidueHover} />);
    fireEvent.click(screen.getByText('Residues'));
    fireEvent.click(screen.getByText('2 residues'));
    return { second, onResidueSelect, onResidueHover };
  }

  it('passes the active structure and the residue (with its atom indices) on click', () => {
    const { second, onResidueSelect } = renderWithTwoStructures();
    fireEvent.click(screen.getByText('GLY'));
    expect(onResidueSelect).toHaveBeenCalledTimes(1);
    const [structureId, residue] = onResidueSelect.mock.calls[0];
    expect(structureId).toBe(second);
    expect(residue).toMatchObject({ name: 'GLY', number: 2, atomIndices: [0, 1] });
  });

  it('passes the active structure on hover, and null when the pointer leaves', () => {
    const { second, onResidueHover } = renderWithTwoStructures();
    const ala = screen.getByText('ALA').closest('button')!;
    fireEvent.mouseEnter(ala);
    expect(onResidueHover).toHaveBeenLastCalledWith(second, expect.objectContaining({ name: 'ALA', atomIndices: [2, 3] }));
    fireEvent.mouseLeave(ala);
    expect(onResidueHover).toHaveBeenLastCalledWith(second, null);
  });
});
