import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useMoleculeStore, temporalStore } from '../../../../store/moleculeStore';
import { SequenceViewer } from '../SequenceViewer';
import { ThemeProvider } from '../../../../context/ThemeContext';
import type { Molecule } from '../../../../types';

/** A two-residue peptide; the water first shifts the residues' atom indices. */
function peptide(name: string, withWater = false): Molecule {
  const atoms = [];
  if (withWater) atoms.push({ id: 0, name: 'O', element: 'O', residueName: 'HOH', residueNumber: 100, chainId: 'W', x: 9, y: 9, z: 9 });
  for (const [n, res] of [[1, 'GLY'], [2, 'SER']] as const) {
    for (const [atomName, el] of [['N', 'N'], ['CA', 'C'], ['C', 'C']] as const) {
      atoms.push({ id: atoms.length, name: atomName, element: el, residueName: res, residueNumber: n, chainId: 'A', x: atoms.length * 1.4, y: 0, z: 0 });
    }
  }
  return { name, atoms, bonds: [] };
}

describe('SequenceViewer', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
  });

  it('reports clicks and hovers with the structure it shows, which need not be the active one', () => {
    let first = '';
    let second = '';
    act(() => {
      first = useMoleculeStore.getState().addStructure(peptide('First'), 'First');
      second = useMoleculeStore.getState().addStructure(peptide('Second', true), 'Second');
      useMoleculeStore.getState().setActiveStructure(first);
    });
    const onResidueClick = vi.fn();
    const onResidueHover = vi.fn();
    render(
      <ThemeProvider>
        <SequenceViewer onResidueClick={onResidueClick} onResidueHover={onResidueHover} />
      </ThemeProvider>
    );

    // Show the second structure in the panel, then make the first active
    // elsewhere (the structure list): the panel keeps showing the second
    fireEvent.change(screen.getByRole('combobox'), { target: { value: second } });
    act(() => useMoleculeStore.getState().setActiveStructure(first));
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe(second);

    const serine = screen.getByTitle(/^SER 2/);
    fireEvent.mouseEnter(serine);
    expect(onResidueHover).toHaveBeenLastCalledWith(second, expect.objectContaining({ name: 'SER', number: 2 }));
    fireEvent.click(serine);
    // SER 2's atoms in the second structure: after the water and GLY 1
    expect(onResidueClick).toHaveBeenCalledWith(second, [4, 5, 6]);
  });
});
