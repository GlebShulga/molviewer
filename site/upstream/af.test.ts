// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fetchAfDetails, MAX_PDB_XREFS } from './af';
import { fixtureFetch } from './__fixtures__/fixtureFetch';
import type { AfDetails } from './types';

function okData(result: Awaited<ReturnType<typeof fetchAfDetails>>): AfDetails {
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') throw new Error('expected ok');
  return result.data;
}

describe('fetchAfDetails (P69905 fixtures)', () => {
  it('normalizes the AlphaFold model metadata', async () => {
    const { fetchImpl } = fixtureFetch();
    const d = okData(await fetchAfDetails('p69905', { fetchImpl }));

    expect(d).toMatchObject({
      id: 'P69905',
      modelEntityId: 'AF-P69905-F1',
      description: 'Hemoglobin subunit alpha',
      gene: 'HBA1',
      organism: 'Homo sapiens',
      taxId: 9606,
      sequenceLength: 142,
      partial: [],
    });
    expect(d.modelCreatedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.latestVersion).toBeGreaterThanOrEqual(4);
    expect(d.meanPlddt).toBeGreaterThan(90);
    expect(d.plddtFractions).toBeDefined();
    const f = d.plddtFractions!;
    expect(f.veryHigh + f.confident + f.low + f.veryLow).toBeCloseTo(1, 2);
  });

  it('extracts UniProt annotation', async () => {
    const { fetchImpl } = fixtureFetch();
    const d = okData(await fetchAfDetails('P69905', { fetchImpl }));

    expect(d.uniprot).toMatchObject({
      proteinName: 'Hemoglobin subunit alpha',
      organism: 'Homo sapiens',
      organismCommonName: 'Human',
      geneName: 'HBA1',
      length: 142,
    });
    expect(d.uniprot?.functionText).toMatch(/oxygen/i);
    expect(d.uniprot?.subunit).toMatch(/Heterotetramer/);
    expect(d.uniprot?.diseases).toContain('Alpha-thalassemia (A-THAL)');
  });

  it('lists experimental PDB structures, best resolution first, capped', async () => {
    const { fetchImpl } = fixtureFetch();
    const d = okData(await fetchAfDetails('P69905', { fetchImpl }));

    expect(d.pdbStructureCount).toBe(40); // fixture is trimmed to 40 xrefs
    expect(d.pdbStructures).toHaveLength(MAX_PDB_XREFS);
    const res = d.pdbStructures.map((p) => p.resolution ?? Infinity);
    expect(res).toEqual([...res].sort((a, b) => a - b));
    const first = d.pdbStructures[0];
    expect(first.id).toMatch(/^[0-9][A-Z0-9]{3}$/);
    expect(first.method).toBeDefined();
    expect(first.chainIds.length).toBeGreaterThan(0);
  });

  it('prefers the canonical model when isoform models are returned', async () => {
    // P04637 returns 9 models (canonical + isoforms); UniProt is not recorded (404).
    const { fetchImpl } = fixtureFetch();
    const d = okData(await fetchAfDetails('P04637', { fetchImpl }));
    expect(d.modelEntityId).toBe('AF-P04637-F1');
    expect(d.sequenceLength).toBe(393);
    expect(d.uniprot).toBeUndefined();
    expect(d.partial).toEqual([]);
  });

  it('returns not-found on AlphaFold 404', async () => {
    const { fetchImpl } = fixtureFetch();
    expect(await fetchAfDetails('P00001', { fetchImpl })).toEqual({ status: 'not-found' });
  });

  it('returns not-found on AlphaFold 200 with an empty array', async () => {
    const { fetchImpl } = fixtureFetch({ 'af-P69905.json': { status: 200, body: '[]' } });
    expect(await fetchAfDetails('P69905', { fetchImpl })).toEqual({ status: 'not-found' });
  });

  it('returns error on AlphaFold 500, even though UniProt has the entry', async () => {
    const { fetchImpl } = fixtureFetch({ 'af-P69905.json': { status: 500 } });
    expect(await fetchAfDetails('P69905', { fetchImpl })).toEqual({
      status: 'error',
      message: 'HTTP 500 from alphafold.ebi.ac.uk',
    });
  });

  it('returns error on AlphaFold timeout', async () => {
    const { fetchImpl } = fixtureFetch({ 'af-P69905.json': { hang: true } });
    const r = await fetchAfDetails('P69905', { fetchImpl, timeoutMs: 30 });
    expect(r.status).toBe('error');
  });

  it('marks UniProt as partial when it fails, keeping AlphaFold data', async () => {
    const { fetchImpl } = fixtureFetch({ 'uniprot-P69905.json': { status: 503 } });
    const d = okData(await fetchAfDetails('P69905', { fetchImpl }));
    expect(d.partial).toEqual(['uniprot']);
    expect(d.uniprot).toBeUndefined();
    expect(d.pdbStructures).toEqual([]);
    expect(d.description).toBe('Hemoglobin subunit alpha');
  });

  it('ignores inactive UniProt entries', async () => {
    const { fetchImpl } = fixtureFetch({
      'uniprot-P69905.json': {
        status: 200,
        body: '{"entryType":"Inactive","primaryAccession":"P69905"}',
      },
    });
    const d = okData(await fetchAfDetails('P69905', { fetchImpl }));
    expect(d.uniprot).toBeUndefined();
    expect(d.partial).toEqual([]);
  });
});
