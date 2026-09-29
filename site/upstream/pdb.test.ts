// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fetchPdbDetails, normalizeEntities } from './pdb';
import { fixtureFetch } from './__fixtures__/fixtureFetch';
import type { PdbDetails } from './types';

async function okData(result: Awaited<ReturnType<typeof fetchPdbDetails>>): Promise<PdbDetails> {
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') throw new Error('expected ok');
  return result.data;
}

describe('fetchPdbDetails (3DNI fixtures)', () => {
  it('normalizes the core entry and citation', async () => {
    const { fetchImpl } = fixtureFetch();
    const d = await okData(await fetchPdbDetails('3dni', { fetchImpl }));

    expect(d.id).toBe('3DNI');
    expect(d.title).toMatch(/DNASE I/);
    expect(d.method).toBe('X-RAY DIFFRACTION');
    expect(d.resolution).toBe(2);
    expect(d.releaseDate).toBe('1994-01-31');
    expect(d.revisionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.atomCount).toBe(2494);
    expect(d.proteinEntityCount).toBe(1);
    expect(d.molecularWeight).toBeCloseTo(30.41);
    expect(d.citation).toMatchObject({
      authors: ['Oefner, C.', 'Suck, D.'],
      journal: 'J Mol Biol',
      year: 1986,
      pubmedId: 3560229,
      doi: '10.1016/0022-2836(86)90280-9',
    });
    expect(d.partial).toEqual([]);
  });

  it('returns polymer entities and ligands', async () => {
    const { fetchImpl } = fixtureFetch();
    const d = await okData(await fetchPdbDetails('3DNI', { fetchImpl }));

    expect(d.entities).toHaveLength(1);
    const [e] = d.entities;
    expect(e).toMatchObject({
      entityId: '1',
      description: 'DEOXYRIBONUCLEASE I',
      chainIds: ['A'],
      organisms: ['Bos taurus'],
      uniprotIds: ['P00639'],
      length: 260,
      type: 'protein',
    });
    expect(e.sequence).toMatch(/^LKIAAFNIRTFG[A-Z]+$/);
    expect(d.ligands).toEqual([
      {
        id: 'CA',
        name: 'CALCIUM ION',
        formula: 'Ca',
        formulaWeight: 40.078,
        instanceCount: 2,
        chainIds: ['A'],
      },
    ]);
  });

  it('returns author-numbered PDBe secondary structure for chain A', async () => {
    const { fetchImpl } = fixtureFetch();
    const d = await okData(await fetchPdbDetails('3DNI', { fetchImpl }));
    const ss = d.secondaryStructure;

    expect(ss?.source).toBe('pdbe');
    expect(ss?.numbering).toBe('author');
    const chainA = ss?.chains.find((c) => c.chainId === 'A');
    expect(chainA?.entityId).toBe('1');
    expect(chainA?.helices).toHaveLength(12);
    expect(chainA?.strands).toHaveLength(18);
    expect(chainA?.strands[0]).toEqual({
      start: { number: 2 },
      end: { number: 11 },
      seqStart: 2,
      seqEnd: 11,
      length: 10,
      sheetId: '1',
    });
    expect(chainA?.helices[0]).toMatchObject({ start: { number: 13 }, end: { number: 16 } });
    // Sorted by position.
    const starts = chainA?.strands.map((s) => s.seqStart) ?? [];
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('lists related entries sharing the UniProt accession, excluding itself', async () => {
    const { fetchImpl } = fixtureFetch();
    const d = await okData(await fetchPdbDetails('3DNI', { fetchImpl }));

    expect(d.relatedUniprotId).toBe('P00639');
    expect(d.related).toHaveLength(12);
    expect(d.related.map((r) => r.id)).not.toContain('3DNI');
    expect(d.related[0]).toMatchObject({
      id: '2A40',
      resolution: 1.8,
      method: 'X-RAY DIFFRACTION',
    });
    expect(d.related[0].title).toMatch(/Actin-DNAse I/);
  });

  it('returns not-found only on a 404 from the RCSB core entry', async () => {
    const { fetchImpl } = fixtureFetch();
    expect(await fetchPdbDetails('9ZZZ', { fetchImpl })).toEqual({ status: 'not-found' });
  });

  it('returns error on a 500 from the core entry', async () => {
    const { fetchImpl } = fixtureFetch({ 'rcsb-core-3DNI.json': { status: 500 } });
    const r = await fetchPdbDetails('3DNI', { fetchImpl });
    expect(r).toEqual({ status: 'error', message: 'HTTP 500 from data.rcsb.org' });
  });

  it('returns error when the core entry times out', async () => {
    const { fetchImpl } = fixtureFetch({ 'rcsb-core-3DNI.json': { hang: true } });
    const r = await fetchPdbDetails('3DNI', { fetchImpl, timeoutMs: 30 });
    expect(r.status).toBe('error');
    if (r.status === 'error') expect(r.message).toMatch(/Timeout/);
  });

  it('returns error on a network failure of the core entry', async () => {
    const { fetchImpl } = fixtureFetch({ 'rcsb-core-3DNI.json': { networkError: true } });
    expect((await fetchPdbDetails('3DNI', { fetchImpl })).status).toBe('error');
  });

  it('falls back to RCSB label-numbered secondary structure when PDBe is down', async () => {
    const { fetchImpl, calls } = fixtureFetch({ 'pdbe-ss-3DNI.json': { status: 503 } });
    const d = await okData(await fetchPdbDetails('3DNI', { fetchImpl }));

    expect(d.partial).toEqual(['pdbeSecondaryStructure']);
    expect(calls.some((u) => u.includes('rcsb_polymer_instance_feature'))).toBe(true);
    const ss = d.secondaryStructure;
    expect(ss?.source).toBe('rcsb');
    expect(ss?.numbering).toBe('label');
    const chainA = ss?.chains.find((c) => c.chainId === 'A');
    expect(chainA?.strands.length).toBeGreaterThan(0);
    expect(chainA?.helices.length).toBeGreaterThan(0);
    expect(chainA?.strands[0]).toMatchObject({
      start: { number: 2 },
      end: { number: 11 },
      sheetId: '1',
    });
    expect(chainA?.helices[0]).toMatchObject({ seqStart: 13, seqEnd: 16, length: 4 });
    // Everything else is intact.
    expect(d.entities).toHaveLength(1);
    expect(d.related).toHaveLength(12);
  });

  it('treats a PDBe timeout like an outage (fallback, partial)', async () => {
    const { fetchImpl } = fixtureFetch({ 'pdbe-ss-3DNI.json': { hang: true } });
    const d = await okData(await fetchPdbDetails('3DNI', { fetchImpl, timeoutMs: 50 }));
    expect(d.partial).toContain('pdbeSecondaryStructure');
    expect(d.secondaryStructure?.source).toBe('rcsb');
  });

  it('does not mark PDBe 404 (no data) as a failure', async () => {
    const { fetchImpl } = fixtureFetch({ 'pdbe-ss-3DNI.json': { status: 404 } });
    const d = await okData(await fetchPdbDetails('3DNI', { fetchImpl }));
    expect(d.partial).toEqual([]);
    expect(d.secondaryStructure?.source).toBe('rcsb');
  });

  it('leaves secondaryStructure undefined when PDBe and RCSB fallback both fail', async () => {
    const { fetchImpl } = fixtureFetch({
      'pdbe-ss-3DNI.json': { status: 500 },
      'rcsb-gql-ss-3DNI.json': { status: 502 },
    });
    const d = await okData(await fetchPdbDetails('3DNI', { fetchImpl }));
    expect(d.secondaryStructure).toBeUndefined();
    expect(d.partial).toEqual(['pdbeSecondaryStructure', 'rcsbSecondaryStructure']);
  });

  it('keeps the core data when entities and related fail', async () => {
    const { fetchImpl } = fixtureFetch({ 'rcsb-gql-entities-3DNI.json': { status: 500 } });
    const d = await okData(await fetchPdbDetails('3DNI', { fetchImpl }));
    expect(d.title).toMatch(/DNASE I/);
    expect(d.entities).toEqual([]);
    expect(d.ligands).toEqual([]);
    expect(d.related).toEqual([]);
    expect(d.partial).toEqual(['entities']);
    expect(d.secondaryStructure?.source).toBe('pdbe');
  });

  it('marks related as partial when the search API fails', async () => {
    const { fetchImpl } = fixtureFetch({ 'rcsb-search-P00639.json': { hang: true } });
    const d = await okData(await fetchPdbDetails('3DNI', { fetchImpl, timeoutMs: 50 }));
    expect(d.related).toEqual([]);
    expect(d.partial).toEqual(['related']);
  });

  it('keeps related IDs without titles when the titles query fails', async () => {
    const { fetchImpl } = fixtureFetch({ 'rcsb-gql-entries-12.json': { status: 500 } });
    const d = await okData(await fetchPdbDetails('3DNI', { fetchImpl }));
    expect(d.related).toHaveLength(12);
    expect(d.related[0]).toEqual({ id: '2A40' });
    expect(d.partial).toEqual(['relatedTitles']);
  });

  it('treats GraphQL errors (HTTP 200 with errors) as a failure', async () => {
    const { fetchImpl } = fixtureFetch({
      'rcsb-gql-entities-3DNI.json': {
        status: 200,
        body: '{"errors":[{"message":"boom"}],"data":null}',
      },
    });
    const d = await okData(await fetchPdbDetails('3DNI', { fetchImpl }));
    expect(d.partial).toContain('entities');
  });
});

describe('normalizeEntities ligand filtering', () => {
  const comp = (id: string, name: string, count: number, chains: string[]) => ({
    rcsb_nonpolymer_entity_container_identifiers: { auth_asym_ids: chains, nonpolymer_comp_id: id },
    rcsb_nonpolymer_entity: { pdbx_number_of_molecules: count },
    nonpolymer_comp: { chem_comp: { id, name, formula: null, formula_weight: null } },
  });

  it('drops water and crystallization additives but keeps metals and cofactors', () => {
    const out = normalizeEntities({
      entry: {
        polymer_entities: [],
        nonpolymer_entities: [
          comp('HEM', 'PROTOPORPHYRIN IX CONTAINING FE', 4, ['A', 'B', 'C', 'D']),
          comp('ZN', 'ZINC ION', 1, ['A']),
          comp('SO4', 'SULFATE ION', 3, ['A', 'B']),
          comp('GOL', 'GLYCEROL', 2, ['A']),
          comp('HOH', 'WATER', 100, ['A']),
          comp('MG', 'MAGNESIUM ION', 1, ['B']),
        ],
      },
    });
    expect(out.ligands.map((l) => `${l.id}x${l.instanceCount}`)).toEqual(['HEMx4', 'ZNx1', 'MGx1']);
    expect(out.excludedLigandIds).toEqual(['SO4', 'GOL', 'HOH']);
  });
});
