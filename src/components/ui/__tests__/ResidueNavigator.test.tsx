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

describe('ResidueNavigator with two residues numbered 1 in one chain', () => {
  beforeEach(() => {
    localStorage.clear();
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
  });
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
