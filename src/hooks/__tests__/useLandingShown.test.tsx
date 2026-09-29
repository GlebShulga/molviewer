import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMoleculeStore, temporalStore } from '../../store/moleculeStore';
import { useLandingShown } from '../useLandingShown';
import { resetLandingDataCache } from '../../utils/landingData';
import type { Molecule } from '../../types';

function molecule(name: string): Molecule {
  return {
    name,
    atoms: [0, 1].map((i) => ({ id: i, element: 'C', x: i * 1.5, y: 0, z: 0, residueName: 'ALA', residueNumber: 1, chainId: 'A' })),
    bonds: [{ atom1Index: 0, atom2Index: 1, order: 1 as const }],
  };
}

let script: HTMLScriptElement;

beforeEach(() => {
  useMoleculeStore.getState().reset();
  temporalStore.getState().clear();
  script = document.createElement('script');
  script.type = 'application/json';
  script.id = 'landing-data';
  script.textContent = JSON.stringify({ kind: 'pdb', id: '4HHB', title: 'Hemoglobin', facts: [], links: [] });
  document.body.appendChild(script);
  resetLandingDataCache();
});

afterEach(() => {
  script.remove();
  resetLandingDataCache();
});

describe('useLandingShown', () => {
  it('is set only while the landing structure is the one the address shows', () => {
    const { result } = renderHook(() => useLandingShown());
    expect(result.current).toBeNull();

    act(() => {
      useMoleculeStore.getState().addStructure(molecule('4HHB'), '4HHB', { type: 'rcsb', id: '4HHB' });
    });
    expect(result.current?.id).toBe('4HHB');

    // Replace with 1CRN, then add 4HHB back: the address is /pdb/1CRN, so no "Details about 4HHB".
    act(() => {
      useMoleculeStore.getState().setMolecule(molecule('1CRN'), { type: 'rcsb', id: '1CRN' });
      useMoleculeStore.getState().addStructure(molecule('4HHB'), '4HHB', { type: 'rcsb', id: '4HHB' });
    });
    expect(result.current).toBeNull();
  });

  it('skips local files when deciding which structure the address shows', () => {
    const { result } = renderHook(() => useLandingShown());
    act(() => {
      useMoleculeStore.getState().addStructure(molecule('mine'), 'mine', { type: 'inline', format: 'pdb', data: '' });
      useMoleculeStore.getState().addStructure(molecule('4HHB'), '4HHB', { type: 'rcsb', id: '4HHB' });
    });
    expect(result.current?.id).toBe('4HHB');
  });
});
