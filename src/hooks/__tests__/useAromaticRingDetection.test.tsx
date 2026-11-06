import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMoleculeStore, temporalStore } from '../../store/moleculeStore';
import { useAromaticRingDetection } from '../useAromaticRingDetection';
import type { Molecule } from '../../types';

function benzene(): Molecule {
  return {
    name: 'benzene',
    atoms: Array.from({ length: 6 }, (_, i) => ({
      id: i,
      element: 'C',
      x: 1.39 * Math.cos((i * Math.PI) / 3),
      y: 1.39 * Math.sin((i * Math.PI) / 3),
      z: 0,
    })),
    bonds: Array.from({ length: 6 }, (_, i) => ({
      atom1Index: i,
      atom2Index: (i + 1) % 6,
      order: (i % 2 === 0 ? 2 : 1) as 1 | 2,
    })),
  };
}

const ringsOf = (id: string) => useMoleculeStore.getState().structures.get(id)?.molecule.aromaticRings;

describe('useAromaticRingDetection', () => {
  beforeEach(() => {
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
  });

  it('detects rings for the structure it is given', () => {
    const id = useMoleculeStore.getState().addStructure(benzene(), 'benzene');
    renderHook(() => useAromaticRingDetection(id, true));
    expect(ringsOf(id)).toHaveLength(1);
  });

  it('does nothing while disabled', () => {
    const id = useMoleculeStore.getState().addStructure(benzene(), 'benzene');
    renderHook(() => useAromaticRingDetection(id, false));
    expect(ringsOf(id)).toBeUndefined();
  });

  it('detects again when a session with the same structure IDs is loaded over it', () => {
    // Reloading the session on screen keeps the structure IDs, so the
    // representation stays mounted while the load drops the rings.
    const id = useMoleculeStore.getState().addStructure(benzene(), 'benzene');
    renderHook(() => useAromaticRingDetection(id, true));
    expect(ringsOf(id)).toHaveLength(1);
    const session = useMoleculeStore.getState().buildSession('on screen', null);

    act(() => {
      useMoleculeStore.getState().loadSession(session);
    });

    expect(useMoleculeStore.getState().structures.has(id)).toBe(true);
    expect(ringsOf(id)).toHaveLength(1);
  });
});
