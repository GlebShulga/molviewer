/**
 * The sidebar's load events: every started load ends in exactly one outcome,
 * with the reason a refused or failed load gives (src/utils/loadTracking.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const track = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/track', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/track')>()),
  track,
}));
vi.mock('../../../utils/errorReporter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/errorReporter')>()),
  logError: vi.fn(),
}));

import { useMoleculeStore, temporalStore } from '../../../store/moleculeStore';
import { FileUpload } from '../FileUpload';
import { MAX_STRUCTURES, type Molecule } from '../../../types';

const WATER_PDB = [
  'HETATM    1  O   HOH A   1       0.000   0.000   0.000  1.00  0.00           O',
  'HETATM    2  H1  HOH A   1       0.960   0.000   0.000  1.00  0.00           H',
  'END',
].join('\n');

/** jsdom's File has no text(); the component reads files with it. */
function file(name: string, content: string): File {
  const f = new File([content], name);
  Object.defineProperty(f, 'text', { value: async () => content });
  return f;
}

const molecule = (name: string): Molecule => ({ name, atoms: [{ id: 0, element: 'O', x: 0, y: 0, z: 0 }], bonds: [] });
const store = () => useMoleculeStore.getState();
const input = () => document.getElementById('file-input') as HTMLInputElement;
const loadEvents = () =>
  track.mock.calls.filter(([n]) => String(n).startsWith('structure_')).map(([n, p]) => [n, (p as { detail?: string }).detail]);

describe('FileUpload load events', () => {
  beforeEach(() => {
    store().reset();
    temporalStore.getState().clear();
    track.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reports a loaded file as a user load with its format and size', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<FileUpload />);
    await user.upload(input(), file('water.pdb', WATER_PDB));
    await vi.waitFor(() => expect(store().structureOrder).toHaveLength(1));
    expect(loadEvents()).toEqual([
      ['structure_load_started', undefined],
      ['structure_loaded', undefined],
    ]);
    expect(track).toHaveBeenCalledWith('structure_loaded', expect.objectContaining({ source: 'file', user: 1, format: 'pdb', atoms: 2 }));
  });

  it('reports a broken file and an unsupported one by class', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<FileUpload />);
    await user.upload(input(), file('broken.pdb', 'not a structure'));
    await vi.waitFor(() => expect(store().error).toBeTruthy());
    await user.upload(input(), file('notes.txt', 'hello'));
    await vi.waitFor(() => expect(loadEvents()).toHaveLength(4));
    expect(loadEvents()).toEqual([
      ['structure_load_started', undefined],
      ['structure_load_failed', 'parse'],
      ['structure_load_started', undefined],
      ['structure_load_failed', 'unsupported_format'],
    ]);
  });

  it('reports a missing PDB entry as not_found, and a mistyped ID as nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const user = userEvent.setup();
    render(<FileUpload />);
    await user.type(screen.getByLabelText('PDB ID'), '12');
    await user.click(screen.getByTitle('Fetch structure from RCSB PDB'));
    expect(loadEvents()).toEqual([]);
    await user.clear(screen.getByLabelText('PDB ID'));
    await user.type(screen.getByLabelText('PDB ID'), '9ZZZ');
    await user.click(screen.getByTitle('Fetch structure from RCSB PDB'));
    await vi.waitFor(() => expect(loadEvents()).toEqual([
      ['structure_load_started', undefined],
      ['structure_load_failed', 'not_found'],
    ]));
  });

  it('ends an offline lookup as a network failure', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    const user = userEvent.setup();
    render(<FileUpload />);
    await user.type(screen.getByLabelText('UniProt ID'), 'P69905');
    await user.click(screen.getByTitle('Fetch predicted structure from AlphaFold DB'));
    expect(loadEvents()).toEqual([
      ['structure_load_started', undefined],
      ['structure_load_failed', 'network'],
    ]);
    expect(track).toHaveBeenCalledWith('structure_load_started', expect.objectContaining({ source: 'af', user: 1 }));
  });

  it(`cancels an 11th structure with reason limit, and sends no structure_loaded`, async () => {
    act(() => {
      for (let i = 0; i < MAX_STRUCTURES; i++) store().addStructure(molecule(`m${i}`), `m${i}`);
    });
    const user = userEvent.setup();
    render(<FileUpload />);
    await user.upload(input(), file('water.pdb', WATER_PDB));
    await vi.waitFor(() => expect(store().error).toMatch(/Maximum of 10 structures/));
    expect(loadEvents()).toEqual([
      ['structure_load_started', undefined],
      ['structure_load_cancelled', 'limit'],
    ]);
  });

  it('counts one drag over the drop zone once, and a dialog opening', async () => {
    render(<FileUpload />);
    const zone = screen.getByRole('button', { name: 'Drop zone for molecule files' });
    const label = zone.querySelector('label')!;
    const files = { dataTransfer: { types: ['Files'], files: [] } };
    fireEvent.dragEnter(zone, files);
    fireEvent.dragEnter(label, files); // crossing into a child
    fireEvent.dragLeave(zone, files);
    fireEvent.dragEnter(zone, files);
    fireEvent.drop(zone, files);
    fireEvent.dragEnter(zone, files); // a new drag
    const opened = () => track.mock.calls.filter(([n]) => n === 'file_picker_opened').map(([, p]) => p);
    expect(opened()).toEqual([{ value: 'drop' }, { value: 'drop' }]);

    // Dragged text is not a file
    fireEvent.drop(zone, files);
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['text/plain'], files: [] } });
    expect(opened()).toHaveLength(2);

    fireEvent.click(input());
    expect(opened().at(-1)).toEqual({ value: 'dialog' });
  });
});
