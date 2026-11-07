import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useMoleculeStore, temporalStore } from '../../../store/moleculeStore';
import { SequenceViewer } from '../SequenceViewer';
import { ThemeProvider } from '../../../context/ThemeContext';
import type { Atom, Molecule } from '../../../types';

/** Chain A: MET 1 and ALA 2, and a ligand LIG that shares number 1 (as MD and docking output number them). */
function metAndLigandOne(): Molecule {
  const atoms: Atom[] = [];
  const add = (name: string, element: string, residueName: string, residueNumber: number) =>
    atoms.push({ id: atoms.length, name, element, residueName, residueNumber, chainId: 'A', x: atoms.length * 1.5, y: 0, z: 0 });
  for (const [name, element] of [['N', 'N'], ['CA', 'C'], ['C', 'C'], ['O', 'O']]) add(name, element, 'MET', 1);
  for (const [name, element] of [['N', 'N'], ['CA', 'C'], ['C', 'C'], ['O', 'O']]) add(name, element, 'ALA', 2);
  add('C1', 'C', 'LIG', 1); // atom 8
  add('O1', 'O', 'LIG', 1);
  return { name: 'complex', atoms, bonds: [] };
}

describe('SequenceViewer and an atom hovered in 3D', () => {
  const scrollIntoView = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
    scrollIntoView.mockClear();
    // jsdom has no scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView;
    // jsdom has no matchMedia (ThemeProvider reads the system theme)
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const open = () => {
    const id = useMoleculeStore.getState().addStructure(metAndLigandOne(), 'complex');
    render(<ThemeProvider><SequenceViewer /></ThemeProvider>);
    return id;
  };
  const hover = (id: string, atomIndex: number) => {
    const atom = useMoleculeStore.getState().structures.get(id)!.molecule.atoms[atomIndex];
    act(() => useMoleculeStore.getState().setHoveredAtom(atom, atomIndex, id, null));
  };
  const residueButton = (title: RegExp) => screen.getByTitle(title);
  const highlighted = () => document.querySelectorAll('[class*="highlighted"]');

  it('highlights MET 1 and scrolls to it for a MET 1 atom', () => {
    const id = open();
    hover(id, 1);
    expect(residueButton(/^MET 1 /).className).toMatch(/highlighted/);
    expect(highlighted()).toHaveLength(1);
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('highlights nothing for an atom of the ligand numbered 1 (not in the sequence)', () => {
    const id = open();
    hover(id, 8);
    expect(residueButton(/^MET 1 /).className).not.toMatch(/highlighted/);
    expect(highlighted()).toHaveLength(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
