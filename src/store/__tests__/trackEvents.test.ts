import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMoleculeStore, temporalStore } from '../moleculeStore';
import type { Molecule } from '../../types';

const track = vi.hoisted(() => vi.fn());
vi.mock('../../utils/track', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/track')>()),
  track,
}));

/** 46 carbons in a row: small enough that roundAtoms keeps the count as is. */
function chain(): Molecule {
  const atoms = Array.from({ length: 46 }, (_, i) => ({
    id: i, element: 'C', x: i * 1.5, y: 0, z: 0, residueName: 'LIG', residueNumber: 1, chainId: 'A',
  }));
  return { name: 'chain', atoms, bonds: [] };
}

const store = () => useMoleculeStore.getState();

let id: string;
beforeEach(() => {
  store().reset();
  temporalStore.getState().clear();
  id = store().addStructure(chain(), 'chain');
  track.mockClear();
});

describe('events of actions on a structure carry its style and size', () => {
  it('counts a style switch once, not a click on the style already shown', () => {
    const next = store().structures.get(id)!.representation === 'spacefill' ? 'stick' : 'spacefill';

    store().setRepresentation(next);
    store().setRepresentation(next);

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('representation_changed', { value: next, atoms: 46 });
  });

  it('reports a measurement with the style it was made in', () => {
    const style = store().structures.get(id)!.representation;
    store().setMeasurementMode('distance');

    store().selectAtom(id, 0);
    store().selectAtom(id, 1);

    expect(track).toHaveBeenCalledWith('measurement_added', { kind: 'distance', value: style, atoms: 46 });
  });

  it('reports a label', () => {
    const style = store().structures.get(id)!.representation;

    store().addLabel(id, 0, 'C1');

    expect(track).toHaveBeenCalledWith('label_added', { value: style, atoms: 46 });
  });

  it('reports the atom menu, on the active structure when the menu names none', () => {
    const style = store().structures.get(id)!.representation;

    store().showContextMenu({ x: 0, y: 0, atomIndex: 3 });

    expect(track).toHaveBeenCalledWith('atom_menu_opened', { value: style, atoms: 46 });
  });
});
