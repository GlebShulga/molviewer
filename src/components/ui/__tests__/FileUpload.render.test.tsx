import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMoleculeStore, temporalStore } from '../../../store/moleculeStore';
import { FileUpload } from '../FileUpload';
import { MAX_STRUCTURES, type Molecule } from '../../../types';

const WATER_PDB = [
  'HETATM    1  O   HOH A   1       0.000   0.000   0.000  1.00  0.00           O',
  'HETATM    2  H1  HOH A   1       0.960   0.000   0.000  1.00  0.00           H',
  'END',
].join('\n');

/** jsdom's File has no text(); the component reads files with it. */
function pdbFile(name = 'water.pdb'): File {
  const file = new File([WATER_PDB], name, { type: 'chemical/x-pdb' });
  Object.defineProperty(file, 'text', { value: async () => WATER_PDB });
  return file;
}

const molecule = (name: string): Molecule => ({ name, atoms: [{ id: 0, element: 'O', x: 0, y: 0, z: 0 }], bonds: [] });
const store = () => useMoleculeStore.getState();
const input = () => document.getElementById('file-input') as HTMLInputElement;

describe('FileUpload', () => {
  beforeEach(() => {
    store().reset();
    temporalStore.getState().clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads the same file again when it is picked twice', async () => {
    const user = userEvent.setup();
    render(<FileUpload />);
    const file = pdbFile();
    await user.upload(input(), file);
    await vi.waitFor(() => expect(store().structureOrder).toHaveLength(1));
    await user.upload(input(), file);
    await vi.waitFor(() => expect(store().structureOrder).toHaveLength(2));
  });

  describe(`with ${MAX_STRUCTURES} structures in Add mode`, () => {
    beforeEach(() => {
      act(() => {
        for (let i = 0; i < MAX_STRUCTURES; i++) store().addStructure(molecule(`m${i}`), `m${i}`);
      });
    });

    it('keeps the Add toggle pressed (and disabled)', () => {
      render(<FileUpload />);
      const add = screen.getByRole('button', { name: /Add/ });
      expect(add.getAttribute('aria-pressed')).toBe('true');
      expect((add as HTMLButtonElement).disabled).toBe(true);
    });

    it('refuses an 11th file instead of replacing all 10', async () => {
      const user = userEvent.setup();
      render(<FileUpload />);
      const ids = [...store().structureOrder];
      await user.upload(input(), pdbFile());
      await vi.waitFor(() => expect(store().error).toMatch(/Maximum of 10 structures/));
      expect(store().structureOrder).toEqual(ids);
    });

    it('does not fetch an 11th PDB entry', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      const user = userEvent.setup();
      render(<FileUpload />);
      await user.type(screen.getByLabelText('PDB ID'), '1CRN');
      await user.click(screen.getByTitle('Fetch structure from RCSB PDB'));
      await vi.waitFor(() => expect(store().error).toMatch(/Maximum of 10 structures/));
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(store().structureOrder).toHaveLength(MAX_STRUCTURES);
      // The typed ID stays, ready for when there is room
      expect((screen.getByLabelText('PDB ID') as HTMLInputElement).value).toBe('1CRN');
    });
  });
});
