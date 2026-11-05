import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useMoleculeStore, temporalStore, withRepresentation, touchSafeStructure } from '../moleculeStore';
import { serializeShareableSession } from '../../utils/shareSession';
import { useToastStore } from '../../utils/toast';
import type { Atom, Molecule, Structure } from '../../types';

/** 300 residues of N, CA, C, O (1,200 atoms, over the touch limit) plus a heme. */
function bigProteinWithLigand(): Molecule {
  const atoms: Atom[] = [];
  for (let r = 1; r <= 300; r++) {
    for (const [name, element] of [['N', 'N'], ['CA', 'C'], ['C', 'C'], ['O', 'O']]) {
      atoms.push({ id: atoms.length, element, name, residueName: 'ALA', residueNumber: r, chainId: 'A', x: r * 1.5, y: 0, z: 0 });
    }
  }
  atoms.push({ id: atoms.length, element: 'Fe', name: 'FE', residueName: 'HEM', residueNumber: 301, chainId: 'A', x: 0, y: 5, z: 0 });
  atoms.push({ id: atoms.length, element: 'C', name: 'C1', residueName: 'HEM', residueNumber: 301, chainId: 'A', x: 1, y: 5, z: 0 });
  return { name: '4HHB', atoms, bonds: [] };
}

const SOURCE = { type: 'rcsb' as const, id: '4HHB' };
const store = () => useMoleculeStore.getState();
const stubTouch = (coarse: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: coarse && query === '(pointer: coarse)' }));
const repOf = (s: Structure, type: string) => s.componentSettings.find((c) => c.type === type)?.representation;
const only = () => [...store().structures.values()][0];

/** A large protein in Ball & Stick, set up on a desktop. */
function ballAndStickProtein(): string {
  stubTouch(false);
  const id = store().addStructure(bigProteinWithLigand(), '4HHB', SOURCE);
  store().setStructureRepresentation(id, 'ball-and-stick');
  return id;
}

beforeEach(() => {
  store().reset();
  temporalStore.getState().clear();
  useToastStore.setState({ message: null });
});
afterEach(() => vi.unstubAllGlobals());

describe('withRepresentation and touchSafeStructure', () => {
  it('switches the polymer components to Cartoon and leaves the ligand alone', () => {
    const id = ballAndStickProtein();
    const before = store().structures.get(id)!;
    expect(before.classification?.hasMultipleTypes).toBe(true);
    const ligand = repOf(before, 'ligand');

    stubTouch(true);
    const { structure, fellBackFrom } = touchSafeStructure(before);
    expect(fellBackFrom).toBe('ball-and-stick');
    expect(structure.representation).toBe('cartoon');
    expect(repOf(structure, 'protein')).toBe('cartoon');
    expect(repOf(structure, 'ligand')).toBe(ligand);
  });

  it('repairs a polymer component in Ball & Stick under a structure already in Cartoon', () => {
    const id = ballAndStickProtein();
    const mixed: Structure = { ...store().structures.get(id)!, representation: 'cartoon' };
    expect(repOf(withRepresentation(mixed, 'cartoon'), 'protein')).toBe('cartoon');

    stubTouch(true);
    const { structure, fellBackFrom } = touchSafeStructure(mixed);
    expect(fellBackFrom).toBe('ball-and-stick');
    expect(repOf(structure, 'protein')).toBe('cartoon');
  });

  it('leaves a surface view alone: its polymer components are not drawn', () => {
    const id = ballAndStickProtein();
    store().setStructureRepresentation(id, 'surface-vdw');
    const surface = store().structures.get(id)!;
    expect(repOf(surface, 'protein')).toBe('ball-and-stick');

    stubTouch(true);
    const result = touchSafeStructure(surface);
    expect(result.fellBackFrom).toBeUndefined();
    expect(result.structure).toBe(surface);
  });

  it('changes nothing on a desktop', () => {
    const id = ballAndStickProtein();
    const structure = store().structures.get(id)!;
    expect(touchSafeStructure(structure).structure).toBe(structure);
  });
});

describe('sessions on a touch screen', () => {
  it('opens a shared Ball & Stick view of a large protein in Cartoon, with a toast', () => {
    ballAndStickProtein();
    const share = serializeShareableSession(store(), null);
    const [shared] = share.structures;

    stubTouch(true);
    store().applyShareableSession({
      structures: [{ molecule: bigProteinWithLigand(), source: SOURCE, shareableStructure: shared }],
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
    expect(repOf(only(), 'protein')).toBe('cartoon');
    expect(useToastStore.getState().message).toBe('Showing Cartoon: Ball & Stick is limited to 1,000 atoms on touch screens');
  });

  it('opens a saved Stick session of a large protein in Cartoon, with a toast', () => {
    const id = ballAndStickProtein();
    store().setStructureRepresentation(id, 'stick');
    const session = store().buildSession('saved', null);
    store().reset();

    stubTouch(true);
    store().loadSession(session);

    expect(only().representation).toBe('cartoon');
    expect(repOf(only(), 'protein')).toBe('cartoon');
    expect(useToastStore.getState().message).toBe('Showing Cartoon: Stick is limited to 1,000 atoms on touch screens');
  });

  it('keeps the saved style on a desktop', () => {
    ballAndStickProtein();
    const session = store().buildSession('saved', null);
    store().reset();
    store().loadSession(session);

    expect(only().representation).toBe('ball-and-stick');
    expect(useToastStore.getState().message).toBeNull();
  });
});
