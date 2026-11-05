import { describe, it, expect, beforeEach } from 'vitest';
import { useMoleculeStore, temporalStore, withValidColor } from '../moleculeStore';
import { getAtomColor } from '../../utils/atomColor';
import type { Atom, Molecule, Structure } from '../../types';

/**
 * Residues of backbone atoms plus a heme. Every atom is 'coil', the ligand's
 * too, as the parsers mark them when a file has helix/sheet records.
 */
function protein(): Molecule {
  const atoms: Atom[] = [];
  for (let r = 1; r <= 20; r++) {
    for (const [name, element] of [['N', 'N'], ['CA', 'C'], ['C', 'C'], ['O', 'O']]) {
      atoms.push({ id: atoms.length, element, name, residueName: 'ALA', residueNumber: r, chainId: 'A', x: r * 1.5, y: 0, z: 0, secondaryStructure: 'coil' });
    }
  }
  atoms.push({ id: atoms.length, element: 'Fe', name: 'FE', residueName: 'HEM', residueNumber: 21, chainId: 'A', x: 0, y: 5, z: 0, secondaryStructure: 'coil' });
  atoms.push({ id: atoms.length, element: 'C', name: 'C1', residueName: 'HEM', residueNumber: 21, chainId: 'A', x: 1, y: 5, z: 0, secondaryStructure: 'coil' });
  return { name: '4HHB', atoms, bonds: [] };
}

function dna(): Molecule {
  const atoms: Atom[] = [];
  for (let r = 1; r <= 12; r++) {
    for (const [name, element] of [['P', 'P'], ["C4'", 'C'], ['N9', 'N']]) {
      atoms.push({ id: atoms.length, element, name, residueName: r % 2 ? 'DA' : 'DT', residueNumber: r, chainId: 'B', x: r * 3, y: 0, z: 0 });
    }
  }
  return { name: '1BNA', atoms, bonds: [] };
}

const store = () => useMoleculeStore.getState();
const colorOf = (s: Structure, type: string) => s.componentSettings.find((c) => c.type === type)?.colorScheme;
const add = (molecule: Molecule) => store().addStructure(molecule, molecule.name)!;
const get = (id: string) => store().structures.get(id)!;

/** A structure in Ball & Stick with CPK everywhere, as the Color picker sets it. */
function inCpk(molecule: Molecule): string {
  const id = add(molecule);
  store().setStructureRepresentation(id, 'ball-and-stick');
  store().setStructureColorScheme(id, 'cpk');
  return id;
}

beforeEach(() => {
  store().reset();
  temporalStore.getState().clear();
});

describe('withValidColor', () => {
  it('gives a protein in Cartoon + CPK Secondary structure, in the structure and its protein component', () => {
    const structure = withValidColor({ ...get(inCpk(protein())), representation: 'cartoon' });
    expect(structure.colorScheme).toBe('secondaryStructure');
    expect(colorOf(structure, 'protein')).toBe('secondaryStructure');
  });

  it('keeps CPK for the ligand, whose atoms are marked coil', () => {
    const structure = withValidColor({ ...get(inCpk(protein())), representation: 'cartoon' });
    expect(colorOf(structure, 'ligand')).toBe('cpk');

    // Why it matters: under Secondary structure the heme would be drawn coil grey
    const iron = structure.molecule.atoms.find((a) => a.element === 'Fe')!;
    expect(getAtomColor(iron, colorOf(structure, 'ligand')!)).toBe(getAtomColor(iron, 'cpk'));
    expect(getAtomColor(iron, 'secondaryStructure')).not.toBe(getAtomColor(iron, 'cpk'));
  });

  it('gives DNA in Cartoon + CPK Rainbow', () => {
    const structure = withValidColor({ ...get(inCpk(dna())), representation: 'cartoon' });
    expect(structure.classification?.primaryType).toBe('dna');
    expect(structure.colorScheme).toBe('rainbow');
    expect(colorOf(structure, 'dna')).toBe('rainbow');
  });

  it('repairs a ligand saved in a chain scheme (sessions from before the rule)', () => {
    const saved = get(inCpk(protein()));
    const old: Structure = {
      ...saved,
      colorScheme: 'secondaryStructure',
      componentSettings: saved.componentSettings.map((cs) => ({ ...cs, colorScheme: 'secondaryStructure' as const })),
    };
    const structure = withValidColor(old);
    expect(structure.colorScheme).toBe('secondaryStructure');
    expect(colorOf(structure, 'protein')).toBe('secondaryStructure');
    expect(colorOf(structure, 'ligand')).toBe('cpk');
  });

  it('leaves other colors, and CPK in other styles, untouched', () => {
    const id = inCpk(protein());
    const ballAndStick = get(id);
    expect(withValidColor(ballAndStick)).toBe(ballAndStick);

    store().setStructureColorScheme(id, 'chain');
    const chainCartoon = { ...get(id), representation: 'cartoon' as const };
    expect(withValidColor(chainCartoon)).toBe(chainCartoon);
  });
});

describe('the store actions', () => {
  it('switching to Cartoon with CPK active gives Secondary structure', () => {
    const id = inCpk(protein());
    store().setStructureRepresentation(id, 'cartoon');
    expect(get(id).colorScheme).toBe('secondaryStructure');
    expect(colorOf(get(id), 'protein')).toBe('secondaryStructure');
    expect(colorOf(get(id), 'ligand')).toBe('cpk');
  });

  it('asking for CPK on Cartoon gives Secondary structure', () => {
    const id = add(protein());
    store().setStructureColorScheme(id, 'chain');
    expect(get(id).representation).toBe('cartoon');

    store().setStructureColorScheme(id, 'cpk');
    expect(get(id).colorScheme).toBe('secondaryStructure');
    expect(colorOf(get(id), 'protein')).toBe('secondaryStructure');
    expect(colorOf(get(id), 'ligand')).toBe('cpk');
  });

  it('a chain scheme leaves the ligand beside a polymer in CPK', () => {
    for (const scheme of ['secondaryStructure', 'rainbow'] as const) {
      const id = inCpk(protein());
      store().setStructureColorScheme(id, scheme);
      expect(get(id).colorScheme).toBe(scheme);
      expect(colorOf(get(id), 'protein')).toBe(scheme);
      expect(colorOf(get(id), 'ligand')).toBe('cpk');

      // The heme in its element colors, not coil grey
      const iron = get(id).molecule.atoms.find((a) => a.element === 'Fe')!;
      expect(getAtomColor(iron, colorOf(get(id), 'ligand')!)).toBe(getAtomColor(iron, 'cpk'));
    }
  });

  it('picking Secondary structure again repairs a ligand left grey', () => {
    const id = inCpk(protein());
    store().setStructureColorScheme(id, 'secondaryStructure');
    // As a session saved before the rule left it
    store().setStructureComponentSettings(id, get(id).componentSettings.map((cs) => ({ ...cs, colorScheme: 'secondaryStructure' as const })));
    store().setStructureColorScheme(id, 'secondaryStructure');
    expect(colorOf(get(id), 'ligand')).toBe('cpk');
  });

  it('Chain colors the ligand too', () => {
    const id = inCpk(protein());
    store().setStructureColorScheme(id, 'chain');
    expect(colorOf(get(id), 'protein')).toBe('chain');
    expect(colorOf(get(id), 'ligand')).toBe('chain');
  });

  it('a file of ligands alone takes Rainbow, as it has nothing else', () => {
    const atoms: Atom[] = [1, 2, 3].map((residueNumber, i) => (
      { id: i, element: 'C', name: `C${i}`, residueName: 'ATP', residueNumber, chainId: 'A', x: i * 1.5, y: 0, z: 0 }
    ));
    const id = inCpk({ name: 'ATP', atoms, bonds: [] });
    store().setStructureColorScheme(id, 'rainbow');
    expect(get(id).colorScheme).toBe('rainbow');
    expect(colorOf(get(id), 'ligand')).toBe('rainbow');
  });

  it('asking for CPK on a Cartoon already in Secondary structure records no undo step', () => {
    const id = add(protein());
    expect(get(id).colorScheme).toBe('secondaryStructure');
    const structures = store().structures;
    const steps = temporalStore.getState().pastStates.length;

    store().setStructureColorScheme(id, 'cpk');
    expect(store().structures).toBe(structures);
    expect(temporalStore.getState().pastStates.length).toBe(steps);
  });
});
