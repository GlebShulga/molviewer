import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useMoleculeStore, temporalStore, withRepresentation, styleSafeStructure } from '../moleculeStore';
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
const colorOf = (s: Structure, type: string) => s.componentSettings.find((c) => c.type === type)?.colorScheme;
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

describe('withRepresentation and styleSafeStructure', () => {
  it('switches the polymer components to Cartoon and leaves the ligand alone', () => {
    const id = ballAndStickProtein();
    const before = store().structures.get(id)!;
    expect(before.classification?.hasMultipleTypes).toBe(true);
    const ligand = repOf(before, 'ligand');

    stubTouch(true);
    const { structure, fellBackFrom } = styleSafeStructure(before);
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
    const { structure, fellBackFrom } = styleSafeStructure(mixed);
    expect(fellBackFrom).toBe('ball-and-stick');
    expect(repOf(structure, 'protein')).toBe('cartoon');
  });

  it('leaves a surface view alone: its polymer components are not drawn', () => {
    const id = ballAndStickProtein();
    store().setStructureRepresentation(id, 'surface-vdw');
    const surface = store().structures.get(id)!;
    expect(repOf(surface, 'protein')).toBe('ball-and-stick');

    stubTouch(true);
    const result = styleSafeStructure(surface);
    expect(result.fellBackFrom).toBeUndefined();
    expect(result.structure).toBe(surface);
  });

  it('changes nothing on a desktop', () => {
    const id = ballAndStickProtein();
    const structure = store().structures.get(id)!;
    expect(styleSafeStructure(structure).structure).toBe(structure);
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

  it('opens a shared Ball & Stick + CPK view in Cartoon with Secondary structure, the heme still CPK', () => {
    const id = ballAndStickProtein();
    store().setStructureColorScheme(id, 'cpk');
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
    expect(only().colorScheme).toBe('secondaryStructure');
    expect(colorOf(only(), 'protein')).toBe('secondaryStructure');
    expect(colorOf(only(), 'ligand')).toBe('cpk');
  });

  it('opens a saved Ball & Stick + CPK session in Cartoon with Secondary structure', () => {
    const id = ballAndStickProtein();
    store().setStructureColorScheme(id, 'cpk');
    const session = store().buildSession('saved', null);
    store().reset();

    stubTouch(true);
    store().loadSession(session);

    expect(only().representation).toBe('cartoon');
    expect(only().colorScheme).toBe('secondaryStructure');
    expect(colorOf(only(), 'ligand')).toBe('cpk');
  });

  it('opens an old session saved with Cartoon + CPK in Secondary structure, on a desktop too', () => {
    const id = ballAndStickProtein();
    store().setStructureColorScheme(id, 'cpk');
    // Possible before the Cartoon rule: set directly, as the store can't now
    const structures = new Map(store().structures);
    structures.set(id, { ...structures.get(id)!, representation: 'cartoon' });
    useMoleculeStore.setState({ structures });
    const session = store().buildSession('saved', null);
    store().reset();

    store().loadSession(session);

    expect(only().representation).toBe('cartoon');
    expect(only().colorScheme).toBe('secondaryStructure');
    expect(colorOf(only(), 'protein')).toBe('secondaryStructure');
    expect(colorOf(only(), 'ligand')).toBe('cpk');
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

describe('a large protein Cartoon cannot trace (chainless segments numbered from 1)', () => {
  /** Two segments of `residues` residues each, no chain IDs, both numbered from 1. */
  const segments = (residues: number): Molecule => {
    const atoms: Atom[] = [];
    for (const y of [0, 30]) {
      for (let r = 1; r <= residues; r++) {
        for (const [name, element] of [['N', 'N'], ['CA', 'C'], ['C', 'C'], ['O', 'O']]) {
          atoms.push({ id: atoms.length, element, name, residueName: 'ALA', residueNumber: r, x: r * 1.5, y, z: 0 });
        }
      }
    }
    return { name: 'md', atoms, bonds: [] };
  };

  it('opens in Spacefill over the touch limit, not in Ball & Stick with every atom', () => {
    stubTouch(true);
    const id = store().addStructure(segments(150), 'md'); // 1,200 atoms
    const s = store().structures.get(id)!;
    expect(s.representation).toBe('spacefill');
    expect(repOf(s, 'protein')).toBe('spacefill');
  });

  it('opens in Ball & Stick under the limit', () => {
    stubTouch(true);
    const id = store().addStructure(segments(100), 'md'); // 800 atoms
    expect(repOf(store().structures.get(id)!, 'protein')).toBe('ball-and-stick');
    stubTouch(false);
    const desktop = store().addStructure(segments(150), 'md');
    expect(repOf(store().structures.get(desktop)!, 'protein')).toBe('ball-and-stick');
  });
});

describe('a ligand set over the limit beside a protein (each component counts its own atoms)', () => {
  /** 400 residues of N, CA, C, O (1,600 atoms) and 400 ligands of 3 atoms (1,200, over the touch limit on their own). */
  const proteinWithLargeLigandSet = (): Molecule => {
    const atoms: Atom[] = [];
    for (let r = 1; r <= 400; r++) {
      for (const [name, element] of [['N', 'N'], ['CA', 'C'], ['C', 'C'], ['O', 'O']]) {
        atoms.push({ id: atoms.length, element, name, residueName: 'ALA', residueNumber: r, chainId: 'A', x: r * 1.5, y: 0, z: 0 });
      }
    }
    for (let r = 1; r <= 400; r++) {
      for (const [name, element] of [['C1', 'C'], ['O1', 'O'], ['N1', 'N']]) {
        atoms.push({ id: atoms.length, element, name, residueName: 'LIG', residueNumber: 1000 + r, chainId: 'A', x: r * 1.5, y: 20, z: atoms.length % 3 });
      }
    }
    return { name: 'complex', atoms, bonds: [] };
  };
  const SOURCE_COMPLEX = { type: 'rcsb' as const, id: '1ABC' };
  const added = () => {
    const id = store().addStructure(proteinWithLargeLigandSet(), 'complex');
    return store().structures.get(id)!;
  };

  it('starts the protein in Cartoon and the ligands in Spacefill on a touch screen, Ball & Stick on a desktop', () => {
    stubTouch(true);
    const touch = added();
    expect(touch.representation).toBe('cartoon');
    expect(repOf(touch, 'protein')).toBe('cartoon');
    expect(repOf(touch, 'ligand')).toBe('spacefill');

    stubTouch(false);
    expect(repOf(added(), 'ligand')).toBe('ball-and-stick');
  });

  it('turns the ligands to Spacefill under a protein already in Cartoon', () => {
    stubTouch(false);
    const structure = added();
    expect(structure.representation).toBe('cartoon');
    expect(repOf(structure, 'ligand')).toBe('ball-and-stick');

    stubTouch(true);
    const safe = styleSafeStructure(structure);
    expect(safe.fellBackFrom).toBe('ball-and-stick');
    expect(safe.fellBackTo).toBe('spacefill');
    expect(safe.structure.representation).toBe('cartoon');
    expect(repOf(safe.structure, 'protein')).toBe('cartoon');
    expect(repOf(safe.structure, 'ligand')).toBe('spacefill');
  });

  it('opens a saved session with the ligands in Ball & Stick in Spacefill, with a toast', () => {
    stubTouch(false);
    store().addStructure(proteinWithLargeLigandSet(), 'complex', SOURCE_COMPLEX);
    const session = store().buildSession('saved', null);
    store().reset();

    stubTouch(true);
    store().loadSession(session);

    expect(only().representation).toBe('cartoon');
    expect(repOf(only(), 'ligand')).toBe('spacefill');
    expect(useToastStore.getState().message).toBe('Showing Spacefill: Ball & Stick is limited to 1,000 atoms on touch screens');
  });

  it('opens a saved Ball & Stick session with the protein in Cartoon and the ligands in Spacefill', () => {
    stubTouch(false);
    const id = store().addStructure(proteinWithLargeLigandSet(), 'complex', SOURCE_COMPLEX);
    store().setStructureRepresentation(id, 'ball-and-stick');
    const session = store().buildSession('saved', null);
    store().reset();

    stubTouch(true);
    store().loadSession(session);

    expect(only().representation).toBe('cartoon');
    expect(repOf(only(), 'protein')).toBe('cartoon');
    expect(repOf(only(), 'ligand')).toBe('spacefill');
    expect(useToastStore.getState().message).toBe('Showing Cartoon: Ball & Stick is limited to 1,000 atoms on touch screens');
  });
});

describe('the atom-style limit without a backbone (Spacefill instead of Cartoon)', () => {
  /** A small-molecule file of `count` atoms, no residue info (an XYZ or a large SDF). */
  const smallMolecules = (count: number): Molecule => ({
    name: 'xyz',
    atoms: Array.from({ length: count }, (_, id) => ({ id, element: id % 3 ? 'H' : 'O', x: id * 1.2, y: 0, z: 0 })),
    bonds: [],
  });

  it('opens a small-molecule file over the limit in Spacefill, and under it in Ball & Stick', () => {
    stubTouch(true);
    const big = store().addStructure(smallMolecules(1_200), 'big');
    expect(store().structures.get(big)!.representation).toBe('spacefill');
    const small = store().addStructure(smallMolecules(800), 'small');
    expect(store().structures.get(small)!.representation).toBe('ball-and-stick');
  });

  it('opens a saved Ball & Stick session of such a file in Spacefill, with a toast naming Spacefill', () => {
    stubTouch(false);
    const id = store().addStructure(smallMolecules(1_200), 'xyz');
    store().setStructureRepresentation(id, 'ball-and-stick');
    const session = store().buildSession('s', null);

    stubTouch(true);
    store().reset();
    store().loadSession(session);
    expect(only().representation).toBe('spacefill');
    expect(useToastStore.getState().message).toBe('Showing Spacefill: Ball & Stick is limited to 1,000 atoms on touch screens');
  });

  it('turns every atom-style component to Spacefill, not only the polymer ones', () => {
    // Ligand and ion components beside a protein Cartoon can't trace (no residue named like an amino acid has a CA here)
    const atoms: Atom[] = [];
    for (let r = 1; r <= 400; r++) {
      atoms.push({ id: atoms.length, element: 'C', name: 'C1', residueName: 'LIG', residueNumber: r, x: r, y: 0, z: 0 });
      atoms.push({ id: atoms.length, element: 'O', name: 'O1', residueName: 'LIG', residueNumber: r, x: r, y: 1, z: 0 });
      atoms.push({ id: atoms.length, element: 'Na', name: 'NA', residueName: 'NA', residueNumber: 1000 + r, x: r, y: 5, z: 0 });
    }
    stubTouch(false);
    const id = store().addStructure({ name: 'mix', atoms, bonds: [] }, 'mix');
    const structure = store().structures.get(id)!;
    const ballAndStick = { ...structure, representation: 'ball-and-stick' as const, componentSettings: structure.componentSettings.map((cs) => ({ ...cs, representation: 'ball-and-stick' as const })) };

    stubTouch(true);
    const safe = styleSafeStructure(ballAndStick);
    expect(safe.fellBackTo).toBe('spacefill');
    expect(safe.structure.representation).toBe('spacefill');
    expect(safe.structure.componentSettings.map((cs) => cs.representation)).toEqual(safe.structure.componentSettings.map(() => 'spacefill'));
  });
});
