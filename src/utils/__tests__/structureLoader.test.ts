/**
 * loadStructureFromSource and the PubChem lookups against a stubbed fetch:
 * each upstream answer maps to a structure, a warning or a classed LoadError.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadStructureFromSource, resolvePubchemCid } from '../structureLoader';
import { classifyLoadError, LoadError } from '../loadErrors';

const root = resolve(__dirname, '../../..');
const CRN_CIF = readFileSync(resolve(root, 'e2e/fixtures/molecules/1crn.cif'), 'utf8');
const ASPIRIN_SDF = readFileSync(resolve(root, 'e2e/fixtures/molecules/aspirin.sdf'), 'utf8');
const CAFFEINE_PROPS = readFileSync(resolve(root, 'site/upstream/__fixtures__/pubchem-props-2519.json'), 'utf8');

type Answer = [status: number, body?: string] | 'throw';

/** Stubs fetch: the first route whose key is in the URL answers. Unmatched URLs fail the test. */
function stubFetch(routes: Record<string, Answer>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (key === undefined) throw new Error(`unexpected fetch: ${url}`);
    const answer = routes[key];
    if (answer === 'throw') throw new TypeError('fetch failed');
    const [status, body = ''] = answer;
    return new Response(body, { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function failure(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => {
      throw new Error('expected a rejection');
    },
    (err: unknown) => err
  );
}

async function loadError(p: Promise<unknown>): Promise<LoadError> {
  const err = await failure(p);
  expect(err).toBeInstanceOf(LoadError);
  return err as LoadError;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadStructureFromSource: RCSB', () => {
  it('parses the mmCIF and names the structure by its id', async () => {
    const fetchMock = stubFetch({ 'files.rcsb.org/download/1CRN.cif': [200, CRN_CIF] });
    const r = await loadStructureFromSource({ type: 'rcsb', id: '1CRN' });
    expect(r.name).toBe('1CRN');
    expect(r.molecule.name).toBe('1CRN');
    expect(r.molecule.atoms.length).toBe(327);
    expect(r.warning).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads a 404 as not_found', async () => {
    stubFetch({ 'files.rcsb.org': [404] });
    const err = await loadError(loadStructureFromSource({ type: 'rcsb', id: '0XXX' }));
    expect(err.loadClass).toBe('not_found');
    expect(err.message).toBe('PDB ID "0XXX" not found');
  });

  it('reads any other failure as network', async () => {
    stubFetch({ 'files.rcsb.org': [500] });
    const err = await loadError(loadStructureFromSource({ type: 'rcsb', id: '1CRN' }));
    expect(err.loadClass).toBe('network');
    expect(err.message).toContain('500');
  });

  it('marks a parser failure as a parse error', async () => {
    stubFetch({ 'files.rcsb.org': [200, 'data_EMPTY\n#\n'] });
    const err = await failure(loadStructureFromSource({ type: 'rcsb', id: '1CRN' }));
    expect(classifyLoadError(err)).toBe('parse');
  });
});

describe('loadStructureFromSource: AlphaFold', () => {
  const meta = (entries: unknown): Answer => [200, JSON.stringify(entries)];

  it('picks the entry of the requested accession among isoforms and names it AF-<id>', async () => {
    const fetchMock = stubFetch({
      'api/prediction/P69905': meta([
        { uniprotAccession: 'P69905-2', cifUrl: 'https://alphafold.ebi.ac.uk/files/AF-P69905-2-F1.cif' },
        { uniprotAccession: 'P69905', cifUrl: 'https://alphafold.ebi.ac.uk/files/AF-P69905-F1.cif' },
      ]),
      'AF-P69905-F1.cif': [200, CRN_CIF],
    });
    const r = await loadStructureFromSource({ type: 'alphafold', id: 'P69905' });
    expect(r.name).toBe('AF-P69905');
    expect(r.molecule.name).toBe('AF-P69905');
    expect(r.molecule.atoms.length).toBeGreaterThan(0);
    expect(String(fetchMock.mock.calls[1][0])).toContain('AF-P69905-F1.cif');
  });

  it('takes the first entry when none matches, and accepts a single object', async () => {
    const fetchMock = stubFetch({
      'api/prediction/Q00001': meta({ uniprotAccession: 'OTHER', cifUrl: 'https://alphafold.ebi.ac.uk/files/one.cif' }),
      'one.cif': [200, CRN_CIF],
    });
    const r = await loadStructureFromSource({ type: 'alphafold', id: 'Q00001' });
    expect(r.name).toBe('AF-Q00001');
    expect(String(fetchMock.mock.calls[1][0])).toContain('one.cif');
  });

  it('reads a metadata 404 as not_found and other failures as network', async () => {
    stubFetch({ 'api/prediction': [404] });
    expect((await loadError(loadStructureFromSource({ type: 'alphafold', id: 'P00000' }))).loadClass).toBe('not_found');
    stubFetch({ 'api/prediction': [500] });
    expect((await loadError(loadStructureFromSource({ type: 'alphafold', id: 'P00000' }))).loadClass).toBe('network');
  });

  it('reads an entry without cifUrl as not_found', async () => {
    stubFetch({ 'api/prediction': meta([{ uniprotAccession: 'P69905' }]) });
    const err = await loadError(loadStructureFromSource({ type: 'alphafold', id: 'P69905' }));
    expect(err.loadClass).toBe('not_found');
  });

  it('reads an empty entry list as not_found', async () => {
    stubFetch({ 'api/prediction': meta([]) });
    expect((await loadError(loadStructureFromSource({ type: 'alphafold', id: 'P69905' }))).loadClass).toBe('not_found');
  });

  it('reads a failed CIF download as network', async () => {
    stubFetch({
      'api/prediction': meta([{ uniprotAccession: 'P69905', cifUrl: 'https://alphafold.ebi.ac.uk/files/x.cif' }]),
      'x.cif': [503],
    });
    expect((await loadError(loadStructureFromSource({ type: 'alphafold', id: 'P69905' }))).loadClass).toBe('network');
  });
});

describe('loadStructureFromSource: PubChem', () => {
  it('loads the 3D conformer and names it by the PubChem title', async () => {
    const fetchMock = stubFetch({
      'cid/2519/property/Title': [200, CAFFEINE_PROPS],
      'cid/2519/SDF?record_type=3d': [200, ASPIRIN_SDF],
    });
    const r = await loadStructureFromSource({ type: 'pubchem', cid: 2519 });
    expect(r.name).toBe('Caffeine');
    expect(r.molecule.name).toBe('Caffeine');
    expect(r.molecule.atoms.length).toBe(21);
    expect(r.warning).toBeUndefined();
    expect(fetchMock.mock.calls.map(([u]) => String(u)).some((u) => u.includes('record_type=2d'))).toBe(false);
  });

  it('falls back to the 2D record with a warning when there is no 3D conformer', async () => {
    stubFetch({
      'property/Title': [200, CAFFEINE_PROPS],
      'record_type=3d': [404],
      'record_type=2d': [200, ASPIRIN_SDF],
    });
    const r = await loadStructureFromSource({ type: 'pubchem', cid: 2519 });
    expect(r.molecule.atoms.length).toBe(21);
    expect(r.warning).toMatch(/flat 2D/);
  });

  it('reads 404 for both records as not_found', async () => {
    stubFetch({ 'property/Title': [404], 'record_type=3d': [404], 'record_type=2d': [404] });
    const err = await loadError(loadStructureFromSource({ type: 'pubchem', cid: 1 }));
    expect(err.loadClass).toBe('not_found');
    expect(err.message).toBe('PubChem compound CID 1 not found');
  });

  it('reads a 3D failure other than 404 as network, without trying 2D', async () => {
    const fetchMock = stubFetch({ 'property/Title': [200, CAFFEINE_PROPS], 'record_type=3d': [500] });
    expect((await loadError(loadStructureFromSource({ type: 'pubchem', cid: 2519 }))).loadClass).toBe('network');
    expect(fetchMock.mock.calls.map(([u]) => String(u)).some((u) => u.includes('record_type=2d'))).toBe(false);
  });

  it('reads a 2D failure other than 404 as network', async () => {
    stubFetch({ 'property/Title': [200, CAFFEINE_PROPS], 'record_type=3d': [404], 'record_type=2d': [500] });
    expect((await loadError(loadStructureFromSource({ type: 'pubchem', cid: 2519 }))).loadClass).toBe('network');
  });

  it.each<[string, Answer]>([
    ['a failed title request', [500]],
    ['a title request that throws', 'throw'],
    ['a title answer without a title', [200, '{"PropertyTable":{"Properties":[{}]}}']],
  ])('names the compound CID n after %s', async (_label, title) => {
    stubFetch({ 'property/Title': title, 'record_type=3d': [200, ASPIRIN_SDF] });
    const r = await loadStructureFromSource({ type: 'pubchem', cid: 2244 });
    expect(r.name).toBe('CID 2244');
    expect(r.molecule.name).toBe('CID 2244');
  });

  it('marks an unreadable SDF as a parse error', async () => {
    stubFetch({ 'property/Title': [500], 'record_type=3d': [200, 'not an sdf'] });
    const err = await failure(loadStructureFromSource({ type: 'pubchem', cid: 2244 }));
    expect(classifyLoadError(err)).toBe('parse');
  });
});

describe('loadStructureFromSource: inline and legacy sources', () => {
  it('parses inline data and keeps the parsed name', async () => {
    const fetchMock = stubFetch({});
    const r = await loadStructureFromSource({ type: 'inline', format: 'sdf', data: ASPIRIN_SDF });
    expect(r.name).toBe('Aspirin');
    expect(r.molecule.atoms.length).toBe(21);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the parser's default name when the data has none", async () => {
    // Every parser names a nameless file 'Molecule', so the loader's own
    // 'Structure' fallback is never reached through a real parser.
    const xyz = '1\n\nC 0 0 0\n';
    const r = await loadStructureFromSource({ type: 'inline', format: 'xyz', data: xyz });
    expect(r.molecule.atoms.length).toBe(1);
    expect(r.name).toBe('Molecule');
  });

  it('marks inline data the parser rejects as a parse error', async () => {
    const err = await failure(loadStructureFromSource({ type: 'inline', format: 'pdb', data: 'nothing here' }));
    expect(classifyLoadError(err)).toBe('parse');
  });

  it('refuses a source type this version no longer loads', async () => {
    const legacy = { type: 'url', url: 'https://example.org/x.pdb' } as unknown as Parameters<typeof loadStructureFromSource>[0];
    const err = await failure(loadStructureFromSource(legacy));
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("This structure's source (url) is no longer supported");
  });
});

describe('resolvePubchemCid', () => {
  it('takes a numeric query as the CID without a request', async () => {
    const fetchMock = stubFetch({});
    expect(await resolvePubchemCid('2519')).toBe(2519);
    expect(await resolvePubchemCid('  2244 ')).toBe(2244);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('looks up a name, trimmed and encoded, and takes the first CID', async () => {
    const fetchMock = stubFetch({ 'compound/name/': [200, JSON.stringify({ IdentifierList: { CID: [2519, 1] } })] });
    expect(await resolvePubchemCid('  caffeine citrate ')).toBe(2519);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/compound/name/caffeine%20citrate/cids/JSON');
  });

  it('reads a 404 and an empty list as not_found, other failures as network', async () => {
    stubFetch({ 'compound/name/': [404] });
    expect((await loadError(resolvePubchemCid('nothing'))).loadClass).toBe('not_found');
    stubFetch({ 'compound/name/': [200, JSON.stringify({ IdentifierList: { CID: [] } })] });
    expect((await loadError(resolvePubchemCid('nothing'))).loadClass).toBe('not_found');
    stubFetch({ 'compound/name/': [200, '{}'] });
    expect((await loadError(resolvePubchemCid('nothing'))).loadClass).toBe('not_found');
    stubFetch({ 'compound/name/': [500] });
    expect((await loadError(resolvePubchemCid('caffeine'))).loadClass).toBe('network');
  });
});
