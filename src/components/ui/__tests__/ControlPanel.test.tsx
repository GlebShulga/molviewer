import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useMoleculeStore, temporalStore } from '../../../store/moleculeStore';
import type { Atom, Molecule } from '../../../types';
import { ControlPanel } from '../ControlPanel';

/** A protein over the old 500-atom cutoff: 150 residues of N, CA, C, O (600 atoms by default). */
function bigProtein(residues = 150): Molecule {
  const atoms: Atom[] = [];
  for (let r = 1; r <= residues; r++) {
    for (const [name, element] of [['N', 'N'], ['CA', 'C'], ['C', 'C'], ['O', 'O']]) {
      atoms.push({ id: atoms.length, element, name, residueName: 'ALA', residueNumber: r, chainId: 'A', x: r * 1.5, y: 0, z: 0, tempFactor: 20 });
    }
  }
  return { name: 'Big protein', atoms, bonds: [] };
}

const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  useMoleculeStore.getState().reset();
  temporalStore.getState().clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('ControlPanel availability', () => {
  it('matches the toolbar on a large protein: atom styles and CPK stay available', () => {
    act(() => {
      useMoleculeStore.getState().addStructure(bigProtein(), 'Big protein');
      // What the toolbar's Ball & Stick button does
      useMoleculeStore.getState().setRepresentation('ball-and-stick');
    });
    render(<ControlPanel />);

    expect(button('Ball & Stick')).toHaveProperty('disabled', false);
    expect(button('Ball & Stick').getAttribute('aria-pressed')).toBe('true');
    expect(button('Stick')).toHaveProperty('disabled', false);
    expect(button('Spacefill')).toHaveProperty('disabled', false);
    expect(button('CPK')).toHaveProperty('disabled', false);
    expect(button('Residue')).toHaveProperty('disabled', false);
    expect(screen.queryByText(/Cartoon does not draw/)).toBeNull();
  });

  it('follows the representation as it changes, with a visible reason', () => {
    act(() => {
      useMoleculeStore.getState().addStructure(bigProtein(), 'Big protein');
      useMoleculeStore.getState().setRepresentation('ball-and-stick');
    });
    render(<ControlPanel />);
    expect(button('CPK')).toHaveProperty('disabled', false);

    act(() => useMoleculeStore.getState().setRepresentation('cartoon'));
    expect(button('CPK')).toHaveProperty('disabled', true);
    expect(screen.getByText('CPK: colors atoms, which Cartoon does not draw')).toBeTruthy();

    act(() => useMoleculeStore.getState().setRepresentation('stick'));
    expect(button('CPK')).toHaveProperty('disabled', false);
    expect(screen.queryByText(/Cartoon does not draw/)).toBeNull();
  });

  it('on a touch screen, stops Ball & Stick and Stick over 1,000 atoms with a visible reason', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' }));
    act(() => {
      useMoleculeStore.getState().addStructure(bigProtein(300), 'Big protein');
    });
    render(<ControlPanel />);

    expect(button('Ball & Stick')).toHaveProperty('disabled', true);
    expect(button('Stick')).toHaveProperty('disabled', true);
    expect(button('Spacefill')).toHaveProperty('disabled', false);
    expect(button('Cartoon')).toHaveProperty('disabled', false);
    expect(screen.getByText('Ball & Stick: over 1,000 atoms on a touch screen; use Cartoon or Spacefill')).toBeTruthy();
    expect(screen.getByText('Stick: over 1,000 atoms on a touch screen; use Cartoon or Spacefill')).toBeTruthy();
  });

  it('explains a hidden structure once instead of greying everything out silently', () => {
    act(() => {
      const id = useMoleculeStore.getState().addStructure(bigProtein(), 'Big protein');
      useMoleculeStore.getState().setStructureVisibility(id, false);
    });
    render(<ControlPanel />);

    expect(button('Stick')).toHaveProperty('disabled', true);
    expect(screen.getAllByText(/The structure is hidden/)).toHaveLength(2);
  });
});
