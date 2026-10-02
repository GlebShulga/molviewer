// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { searchRcsb, searchUniProt } from './search';
import { fetchPubchemCompound, resolvePubchemCid } from './pubchem';
import { fixtureFetch } from './__fixtures__/fixtureFetch';

describe('searchRcsb', () => {
  it('returns ids in search order with titles', async () => {
    const { fetchImpl } = fixtureFetch();
    const r = await searchRcsb('hemoglobin', 5, { fetchImpl });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.map((e) => e.id)).toEqual(['2PGH', '3PEL', '3GOU', '6IHX', '20YJ']);
    expect(r.data[0].title).toMatch(/PORCINE HEMOGLOBIN/);
    expect(r.data[0].method).toBeTruthy();
  });

  it('keeps the ids when the title query fails', async () => {
    const { fetchImpl } = fixtureFetch({ 'rcsb-gql-entries-5.json': { status: 500 } });
    const r = await searchRcsb('hemoglobin', 5, { fetchImpl });
    expect(r.status === 'ok' && r.data.map((e) => [e.id, e.title])[0]).toEqual(['2PGH', undefined]);
  });

  it('reports no hits as not-found and outages as error', async () => {
    const empty = fixtureFetch({ 'rcsb-fulltext-hemoglobin.json': { status: 200, body: '{"result_set":[]}' } });
    expect((await searchRcsb('hemoglobin', 5, { fetchImpl: empty.fetchImpl })).status).toBe('not-found');
    const down = fixtureFetch({ 'rcsb-fulltext-hemoglobin.json': { status: 503 } });
    expect((await searchRcsb('hemoglobin', 5, { fetchImpl: down.fetchImpl })).status).toBe('error');
  });
});

describe('searchUniProt', () => {
  it('searches human proteins first', async () => {
    const { fetchImpl, calls } = fixtureFetch();
    const r = await searchUniProt('p53', 3, { fetchImpl });
    expect(calls[0]).toContain('organism_id%3A9606');
    expect(r.status === 'ok' && r.data[0]).toMatchObject({
      accession: 'P04637',
      proteinName: 'Cellular tumor antigen p53',
      gene: 'TP53',
      organism: 'Homo sapiens',
      taxId: 9606,
    });
  });

  it('skips the human filter when the query names an organism', async () => {
    const { fetchImpl, calls } = fixtureFetch();
    const r = await searchUniProt('E. coli lacZ', 3, { fetchImpl });
    expect(calls[0]).not.toContain('9606');
    expect(r.status === 'ok' && r.data[0].accession).toBe('P00722');
  });

  it('drops hits without an AlphaFold model but keeps hits whose check failed', async () => {
    const { fetchImpl } = fixtureFetch({
      'af-O15350.json': { status: 404 },
      'af-Q00987.json': { status: 503 },
    });
    const r = await searchUniProt('p53', 3, { fetchImpl });
    expect(r.status === 'ok' && r.data.map((h) => h.accession)).toEqual(['P04637', 'Q00987']);
  });

  it('falls back to all organisms when no human protein matches', async () => {
    const { fetchImpl, calls } = fixtureFetch({ 'uniprot-search-p53-human.json': { status: 200, body: '{"results":[]}' } });
    const r = await searchUniProt('p53', 3, { fetchImpl });
    expect(calls[1]).toContain('uniprotkb/search');
    expect(calls[1]).not.toContain('9606');
    // The unfiltered search has no fixture (404), which is reported as an error.
    expect(r.status).toBe('error');
  });
});

describe('PubChem', () => {
  it('resolves a name to a CID, and numeric text directly', async () => {
    const { fetchImpl, calls } = fixtureFetch();
    expect(await resolvePubchemCid('caffeine', { fetchImpl })).toEqual({ status: 'ok', data: 2519 });
    expect(await resolvePubchemCid(' 2244 ', { fetchImpl })).toEqual({ status: 'ok', data: 2244 });
    expect(calls).toHaveLength(1);
  });

  it('reports unknown names as not-found', async () => {
    const { fetchImpl } = fixtureFetch();
    expect((await resolvePubchemCid('notacompound', { fetchImpl })).status).toBe('not-found');
  });

  it('fetches compound properties', async () => {
    const { fetchImpl } = fixtureFetch();
    const r = await fetchPubchemCompound(2519, { fetchImpl });
    expect(r).toEqual({
      status: 'ok',
      data: {
        cid: 2519,
        title: 'Caffeine',
        formula: 'C8H10N4O2',
        weight: '194.19',
        iupac: '1,3,7-trimethylpurine-2,6-dione',
        smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C',
      },
    });
  });
});
