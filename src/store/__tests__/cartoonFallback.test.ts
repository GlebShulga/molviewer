/**
 * Cartoon on a molecule it can't trace draws nothing: links and sessions that
 * ask for it, and a fresh load, show Ball & Stick (Spacefill over the
 * atom-style limit) with a color scheme the style shown can take.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useMoleculeStore, temporalStore } from '../moleculeStore';
import { useToastStore } from '../../utils/toast';
import type { Atom, ColorScheme, Molecule, RepresentationType, SecondaryStructure, Structure } from '../../types';
import type { ShareableStructure } from '../../utils/shareSession';

const SOURCE = { type: 'rcsb' as const, id: '1ABC' };
const CARTOON_TOAST = 'Showing Ball & Stick: Cartoon needs a protein or nucleic-acid backbone';
const store = () => useMoleculeStore.getState();
const only = (): Structure => [...store().structures.values()][0];
const component = (s: Structure, type: string) => s.componentSettings.find((c) => c.type === type)!;
const stubTouch = (coarse: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: coarse && query === '(pointer: coarse)' }));

/**
 * Two protein segments without chain IDs, both numbered from 1 (simulation
 * output): Cartoon would merge them into one zigzag, so it traces neither.
 */
function segments(residues: number, secondaryStructure?: SecondaryStructure): Molecule {
  const atoms: Atom[] = [];
  for (const y of [0, 30]) {
    for (let r = 1; r <= residues; r++) {
      for (const [name, element] of [['N', 'N'], ['CA', 'C'], ['C', 'C'], ['O', 'O']]) {
        atoms.push({
          id: atoms.length, element, name, residueName: 'ALA', residueNumber: r, x: r * 1.5, y, z: 0,
          ...(secondaryStructure ? { secondaryStructure } : {}),
        });
      }
    }
  }
  return { name: 'md', atoms, bonds: [] };
}

/** The same two segments with chain IDs: Cartoon traces them. */
function chainedSegments(residues: number): Molecule {
  const molecule = segments(residues);
  return { ...molecule, atoms: molecule.atoms.map((a) => ({ ...a, chainId: a.y === 0 ? 'A' : 'B' })) };
}

/** A DNA duplex without chain IDs, each strand numbered from 1. */
function chainlessDuplex(): Molecule {
  const atoms: Atom[] = [];
  for (const [y, names] of [[0, ['DA', 'DC', 'DG']], [20, ['DC', 'DG', 'DT']]] as const) {
    names.forEach((residueName, i) => {
      for (const [name, element] of [['P', 'P'], ["O5'", 'O'], ["C5'", 'C']]) {
        atoms.push({ id: atoms.length, element, name, residueName, residueNumber: i + 1, x: i * 6, y, z: 0 });
      }
    });
  }
  return { name: 'duplex', atoms, bonds: [] };
}

function openShare(molecule: Molecule, representation: RepresentationType, colorScheme: ColorScheme) {
  const shared: ShareableStructure = {
    id: 'orig',
    source: SOURCE,
    name: molecule.name,
    representation,
    colorScheme,
    visible: true,
    // Share links store each component's atom list too; loads rebuild it
    componentSettings: [{ type: 'protein', atomIndices: [], representation, colorScheme, visible: true }],
  };
  store().applyShareableSession({
    structures: [{ molecule, source: SOURCE, shareableStructure: shared }],
    skipped: [],
    layoutMode: 'overlay',
    camera: null,
    measurements: [],
    labels: [],
    surfaceSettings: { type: 'vdw', opacity: 0.7, probeRadius: 1.4, wireframe: false, visible: false, color: '#ffffff' },
    autoRotate: false,
    sourceStructures: [shared],
  });
}

/** A session saved with the molecule in Cartoon + Secondary structure (as main could save it), reopened on `touch`. */
function openSession(molecule: Molecule, touch: boolean) {
  stubTouch(false);
  const id = store().addStructure(molecule, molecule.name, SOURCE);
  store().setStructureRepresentation(id, 'cartoon');
  store().setStructureColorScheme(id, 'secondaryStructure');
  expect(only().representation).toBe('cartoon');
  const session = store().buildSession('saved', null);
  store().reset();
  useToastStore.setState({ message: null });
  stubTouch(touch);
  store().loadSession(session);
}

beforeEach(() => {
  store().reset();
  temporalStore.getState().clear();
  useToastStore.setState({ message: null });
  stubTouch(false);
});
afterEach(() => vi.unstubAllGlobals());

describe('a link or session asking for Cartoon on a molecule without a backbone', () => {
  it('opens a small share in Ball & Stick with the Cartoon toast (under the limit: the case a limit check alone skips)', () => {
    openShare(segments(5), 'cartoon', 'secondaryStructure');
    expect(only().representation).toBe('ball-and-stick');
    expect(component(only(), 'protein').representation).toBe('ball-and-stick');
    expect(useToastStore.getState().message).toBe(CARTOON_TOAST);
  });

  it('opens a small saved session in Ball & Stick with the Cartoon toast', () => {
    openSession(segments(5), false);
    expect(only().representation).toBe('ball-and-stick');
    expect(component(only(), 'protein').representation).toBe('ball-and-stick');
    expect(useToastStore.getState().message).toBe(CARTOON_TOAST);
  });

  it('opens in Spacefill over the touch limit, naming Spacefill', () => {
    stubTouch(true);
    openShare(segments(150), 'cartoon', 'secondaryStructure'); // 1,200 atoms
    expect(only().representation).toBe('spacefill');
    expect(component(only(), 'protein').representation).toBe('spacefill');
    expect(useToastStore.getState().message).toBe('Showing Spacefill: Cartoon needs a protein or nucleic-acid backbone');

    store().reset();
    openSession(segments(150), true);
    expect(only().representation).toBe('spacefill');
    expect(component(only(), 'protein').representation).toBe('spacefill');
  });

  it('colors in CPK, not a Secondary structure the controls grey out', () => {
    openShare(segments(5), 'cartoon', 'secondaryStructure');
    expect(only().colorScheme).toBe('cpk');
    expect(component(only(), 'protein').colorScheme).toBe('cpk');

    store().reset();
    openSession(segments(5), false);
    expect(only().colorScheme).toBe('cpk');
    expect(component(only(), 'protein').colorScheme).toBe('cpk');
  });

  it('keeps Secondary structure when the file has helix records', () => {
    openShare(segments(5, 'helix'), 'cartoon', 'secondaryStructure');
    expect(only().representation).toBe('ball-and-stick');
    expect(only().colorScheme).toBe('secondaryStructure');
    expect(component(only(), 'protein').colorScheme).toBe('secondaryStructure');
  });

  it('keeps Cartoon, without a toast, on a protein Cartoon can trace', () => {
    openShare(chainedSegments(5), 'cartoon', 'secondaryStructure');
    expect(only().representation).toBe('cartoon');
    expect(component(only(), 'protein').representation).toBe('cartoon');
    expect(only().colorScheme).toBe('secondaryStructure');
    expect(useToastStore.getState().message).toBeNull();
  });
});

describe('a fresh load without a backbone', () => {
  it('starts a protein in Ball & Stick and CPK', () => {
    store().addStructure(segments(5), 'md');
    expect(only().representation).toBe('ball-and-stick');
    expect(only().colorScheme).toBe('cpk');
    expect(component(only(), 'protein').colorScheme).toBe('cpk');
  });

  it('keeps Secondary structure with helix records', () => {
    store().addStructure(segments(5, 'helix'), 'md');
    expect(only().colorScheme).toBe('secondaryStructure');
  });

  it('starts a chainless DNA duplex numbered from 1 per strand in Ball & Stick, not an empty Cartoon', () => {
    store().addStructure(chainlessDuplex(), 'duplex');
    const dna = component(only(), 'dna');
    expect(dna.representation).toBe('ball-and-stick');
    expect(only().representation).toBe('ball-and-stick');
  });
});
