import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMoleculeStore, temporalStore, styleSafeStructure } from '../moleculeStore';
import { serializeShareableSession } from '../../utils/shareSession';
import { useToastStore } from '../../utils/toast';
import type { Atom, Molecule } from '../../types';

// The desktop limit (100,000 atoms) lowered to 1,000, so a 1,200-atom protein
// stands in for a ribosome without building 100k atoms per test
vi.mock('../../../site/appContract', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../site/appContract')>()),
  DESKTOP_ATOM_STYLE_LIMIT: 1_000,
}));

/** 300 residues of N, CA, C, O (1,200 atoms) plus a heme. */
function bigProteinWithLigand(): Molecule {
  const atoms: Atom[] = [];
  for (let r = 1; r <= 300; r++) {
    for (const [name, element] of [['N', 'N'], ['CA', 'C'], ['C', 'C'], ['O', 'O']]) {
      atoms.push({ id: atoms.length, element, name, residueName: 'ALA', residueNumber: r, chainId: 'A', x: r * 1.5, y: 0, z: 0 });
    }
  }
  atoms.push({ id: atoms.length, element: 'Fe', name: 'FE', residueName: 'HEM', residueNumber: 301, chainId: 'A', x: 0, y: 5, z: 0 });
  return { name: '4V6X', atoms, bonds: [] };
}

const SOURCE = { type: 'rcsb' as const, id: '4V6X' };
const store = () => useMoleculeStore.getState();
const only = () => [...store().structures.values()][0];

/** Ball & Stick set straight in the store, as a session saved before the limit holds it. */
function ballAndStickProtein(): string {
  const id = store().addStructure(bigProteinWithLigand(), '4V6X', SOURCE);
  store().setStructureRepresentation(id, 'ball-and-stick');
  return id;
}

beforeEach(() => {
  store().reset();
  temporalStore.getState().clear();
  useToastStore.setState({ message: null });
});

describe('the atom-style limit on a desktop', () => {
  it('turns Ball & Stick into Cartoon for a structure over the limit', () => {
    const id = ballAndStickProtein();
    const { structure, fellBackFrom } = styleSafeStructure(store().structures.get(id)!);
    expect(fellBackFrom).toBe('ball-and-stick');
    expect(structure.representation).toBe('cartoon');
  });

  it('opens a saved Ball & Stick session in Cartoon, with a toast naming the desktop limit', () => {
    ballAndStickProtein();
    const session = store().buildSession('saved', null);
    store().reset();
    store().loadSession(session);

    expect(only().representation).toBe('cartoon');
    expect(useToastStore.getState().message).toBe('Showing Cartoon: Ball & Stick is limited to 1,000 atoms');
  });

  it('opens a shared Stick view in Cartoon', () => {
    const id = ballAndStickProtein();
    store().setStructureRepresentation(id, 'stick');
    const share = serializeShareableSession(store(), null);
    store().applyShareableSession({
      structures: [{ molecule: bigProteinWithLigand(), source: SOURCE, shareableStructure: share.structures[0] }],
      skipped: [],
      layoutMode: share.layoutMode,
      camera: null,
      measurements: [],
      labels: [],
      surfaceSettings: share.surfaceSettings,
      autoRotate: false,
      sourceStructures: share.structures,
    });

    expect(only().representation).toBe('cartoon');
    expect(useToastStore.getState().message).toBe('Showing Cartoon: Stick is limited to 1,000 atoms');
  });
});
