// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  fetchPdbDetails,
  normalizeEntities,
  normalizePdbeSecondaryStructure,
  normalizeRcsbSecondaryStructure,
} from './pdb';
import { fixtureFetch } from './__fixtures__/fixtureFetch';
import type { PdbDetails } from './types';

// Timeout for the tests where an upstream hangs or answers late. It caps every
// request in the test, not only the slow one, so it needs headroom on a busy machine.
const TIMEOUT_MS = 300;

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
    const d = await okData(await fetchPdbDetails('3DNI', { fetchImpl, timeoutMs: TIMEOUT_MS }));
    expect(d.partial).toContain('pdbeSecondaryStructure');
    expect(d.secondaryStructure?.source).toBe('rcsb');
  });

  it('falls back on a slow PDBe answer and lets it finish in the background', async () => {
    const { fetchImpl } = fixtureFetch({ 'pdbe-ss-3DNI.json': { delayMs: 2 * TIMEOUT_MS } });
    const background: Promise<unknown>[] = [];
    const d = await okData(
      await fetchPdbDetails('3DNI', { fetchImpl, timeoutMs: TIMEOUT_MS, waitUntil: (p) => void background.push(p) })
    );
    expect(d.partial).toContain('pdbeSecondaryStructure');
    expect(d.secondaryStructure?.source).toBe('rcsb');

    const finished = await Promise.all(background);
    expect(finished).toContainEqual(
      expect.objectContaining({ ok: true, data: expect.objectContaining({ '3dni': expect.anything() }) })
    );
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
    const d = await okData(await fetchPdbDetails('3DNI', { fetchImpl, timeoutMs: TIMEOUT_MS }));
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

// Upstream JSON has nulls where the types say string: the normalizers drop them.
type EntitiesInput = Parameters<typeof normalizeEntities>[0];
type PdbeInput = Parameters<typeof normalizePdbeSecondaryStructure>[1];
type RcsbInput = Parameters<typeof normalizeRcsbSecondaryStructure>[0];

describe('normalizeEntities missing and null fields', () => {
  it('returns empty sections for an entry without data', () => {
    expect(normalizeEntities({ entry: null })).toEqual({
      entities: [],
      ligands: [],
      excludedLigandIds: [],
      assembly: undefined,
    });
  });

  it('reads a polymer entity with no fields as an empty one of type other', () => {
    const out = normalizeEntities({ entry: { polymer_entities: [{}] } });
    expect(out.entities).toEqual([
      {
        entityId: '',
        description: undefined,
        chainIds: [],
        organisms: [],
        uniprotIds: [],
        sequence: undefined,
        length: undefined,
        type: 'other',
      },
    ]);
  });

  it('drops null and blank values, merges UniProt ids and sorts entities by id', () => {
    const out = normalizeEntities({
      entry: {
        polymer_entities: [
          {
            rcsb_polymer_entity_container_identifiers: { entity_id: '10', auth_asym_ids: ['C'] },
            entity_poly: { rcsb_entity_polymer_type: 'NA-hybrid' },
          },
          {
            rcsb_polymer_entity: { pdbx_description: '  ?  ' },
            rcsb_polymer_entity_container_identifiers: {
              entity_id: '2',
              auth_asym_ids: ['A', null, 'B'],
              uniprot_ids: ['P1', null],
              reference_sequence_identifiers: [
                { database_name: 'UniProt', database_accession: 'P1' },
                { database_name: 'UniProt', database_accession: 'P2' },
                { database_name: 'GenBank', database_accession: 'G1' },
                { database_name: 'UniProt' },
              ],
            },
            rcsb_entity_source_organism: [
              { scientific_name: 'Homo sapiens' },
              { scientific_name: null },
              { scientific_name: 'Homo sapiens' },
            ],
            entity_poly: {
              pdbx_seq_one_letter_code_can: 'MKV\nLAA ',
              rcsb_sample_sequence_length: null,
              rcsb_entity_polymer_type: 'DNA',
            },
          },
          {
            rcsb_polymer_entity_container_identifiers: { entity_id: '1' },
            entity_poly: { rcsb_entity_polymer_type: 'RNA', rcsb_sample_sequence_length: 76 },
          },
        ],
      },
    } as unknown as EntitiesInput);
    expect(out.entities.map((e) => [e.entityId, e.type])).toEqual([
      ['1', 'RNA'],
      ['2', 'DNA'],
      ['10', 'NA-hybrid'],
    ]);
    expect(out.entities[0].length).toBe(76);
    expect(out.entities[1]).toMatchObject({
      description: undefined,
      chainIds: ['A', 'B'],
      organisms: ['Homo sapiens'],
      uniprotIds: ['P1', 'P2'],
      sequence: 'MKVLAA',
      length: 6,
    });
  });

  it('names a ligand by its entity id when chem_comp is missing, and skips one without any id', () => {
    const out = normalizeEntities({
      entry: {
        nonpolymer_entities: [
          { rcsb_nonpolymer_entity_container_identifiers: { nonpolymer_comp_id: 'ATP', auth_asym_ids: null } },
          { nonpolymer_comp: { chem_comp: null } },
          { nonpolymer_comp: { chem_comp: { id: '  ' } } },
        ],
      },
    });
    expect(out.ligands).toEqual([
      { id: 'ATP', name: undefined, formula: undefined, formulaWeight: undefined, instanceCount: 1, chainIds: [] },
    ]);
  });

  it('counts a ligand by its chains when the molecule count is missing, and merges entities of one component', () => {
    const out = normalizeEntities({
      entry: {
        nonpolymer_entities: [
          {
            rcsb_nonpolymer_entity_container_identifiers: { auth_asym_ids: ['A', 'B'] },
            nonpolymer_comp: {
              chem_comp: { id: 'NAG', name: 'N-ACETYL-D-GLUCOSAMINE', formula: 'C8 H15 N O6', formula_weight: 221.208 },
            },
          },
          {
            rcsb_nonpolymer_entity_container_identifiers: { auth_asym_ids: ['B', 'C'] },
            rcsb_nonpolymer_entity: { pdbx_number_of_molecules: 5 },
            nonpolymer_comp: { chem_comp: { id: 'NAG' } },
          },
        ],
      },
    });
    expect(out.ligands).toEqual([
      {
        id: 'NAG',
        name: 'N-ACETYL-D-GLUCOSAMINE',
        formula: 'C8 H15 N O6',
        formulaWeight: 221.208,
        instanceCount: 7,
        chainIds: ['A', 'B', 'C'],
      },
    ]);
  });

  it('reads the first assembly, preferring global symmetry and dropping non-string stoichiometry', () => {
    const out = normalizeEntities({
      entry: {
        assemblies: [
          null,
          {
            pdbx_struct_assembly: { oligomeric_count: 4, oligomeric_details: 'tetrameric' },
            rcsb_struct_symmetry: [
              null,
              { kind: 'Pseudo Symmetry', oligomeric_state: 'Homo 4-mer', stoichiometry: ['A4'] },
              { kind: 'Global Symmetry', oligomeric_state: 'Hetero 4-mer', stoichiometry: ['A2', null, 'B2'] },
            ],
          },
        ],
      },
    } as unknown as EntitiesInput);
    expect(out.assembly).toEqual({
      chainCount: 4,
      oligomericDetails: 'tetrameric',
      oligomericState: 'Hetero 4-mer',
      stoichiometry: ['A2', 'B2'],
    });
  });

  it('falls back to the first symmetry, and drops an assembly with neither count nor details', () => {
    const withState = normalizeEntities({
      entry: {
        assemblies: [
          {
            pdbx_struct_assembly: { oligomeric_details: 'monomeric' },
            rcsb_struct_symmetry: [{ kind: 'Local Symmetry', oligomeric_state: 'Monomer' }],
          },
        ],
      },
    });
    expect(withState.assembly).toEqual({
      chainCount: undefined,
      oligomericDetails: 'monomeric',
      oligomericState: 'Monomer',
      stoichiometry: [],
    });
    const empty = normalizeEntities({
      entry: { assemblies: [{ pdbx_struct_assembly: null, rcsb_struct_symmetry: null }] },
    });
    expect(empty.assembly).toBeUndefined();
  });
});

describe('normalizePdbeSecondaryStructure missing and null fields', () => {
  const res = (n: number, auth = n, ins?: string | null) => ({
    residue_number: n,
    author_residue_number: auth,
    author_insertion_code: ins,
  });

  it('returns no chains for an empty answer', () => {
    expect(normalizePdbeSecondaryStructure('1abc', {})).toEqual({ source: 'pdbe', numbering: 'author', chains: [] });
  });

  it('reads the only entry when its key is not the requested id', () => {
    const out = normalizePdbeSecondaryStructure('1abc', {
      '9xyz': {
        molecules: [{ chains: [{ chain_id: 'A', secondary_structure: { helices: [{ start: res(1), end: res(4) }] } }] }],
      },
    });
    expect(out.chains.map((c) => c.chainId)).toEqual(['A']);
    expect(out.chains[0].entityId).toBeUndefined();
  });

  it('skips chains without an id or without segments, and segments with a missing number', () => {
    const out = normalizePdbeSecondaryStructure('1abc', {
      '1abc': {
        molecules: [
          {
            entity_id: 2,
            chains: [
              { secondary_structure: { helices: [{ start: res(1), end: res(4) }] } },
              { chain_id: 'C' },
              { chain_id: 'D', secondary_structure: { helices: [{ start: res(1) }, { end: res(4) }] } },
              {
                chain_id: 'B',
                secondary_structure: {
                  helices: [
                    { start: res(20, 120), end: res(25, 125) },
                    { start: { residue_number: 1 }, end: res(4) },
                    { start: res(5, 105, 'A'), end: res(9, 109, ' ') },
                  ],
                  strands: [
                    { start: res(40), end: res(44), sheet_id: 0 },
                    { start: res(30), end: res(33), sheet_id: null },
                    { start: res(50), end: res(52), sheet_id: 'B' },
                  ],
                },
              },
            ],
          },
          { chains: undefined },
        ],
      },
    } as unknown as PdbeInput);
    expect(out.chains).toHaveLength(1);
    const [chain] = out.chains;
    expect(chain.chainId).toBe('B');
    expect(chain.entityId).toBe('2');
    expect(chain.helices).toEqual([
      { start: { number: 105, insertionCode: 'A' }, end: { number: 109 }, seqStart: 5, seqEnd: 9, length: 5 },
      { start: { number: 120 }, end: { number: 125 }, seqStart: 20, seqEnd: 25, length: 6 },
    ]);
    expect(chain.strands.map((s) => [s.seqStart, s.sheetId])).toEqual([
      [30, undefined],
      [40, '0'],
      [50, 'B'],
    ]);
  });

  it('sorts chains by id', () => {
    const chain = (chain_id: string) => ({
      chain_id,
      secondary_structure: { strands: [{ start: res(1), end: res(3) }] },
    });
    const out = normalizePdbeSecondaryStructure('1abc', { '1abc': { molecules: [{ chains: [chain('B'), chain('A')] }] } });
    expect(out.chains.map((c) => c.chainId)).toEqual(['A', 'B']);
  });
});

describe('normalizeRcsbSecondaryStructure missing and null fields', () => {
  it('returns no chains for an entry without data', () => {
    expect(normalizeRcsbSecondaryStructure({ entry: null })).toEqual({ source: 'rcsb', numbering: 'label', chains: [] });
    const noInstances = normalizeRcsbSecondaryStructure({
      entry: { polymer_entities: [{ polymer_entity_instances: null }] },
    });
    expect(noInstances.chains).toEqual([]);
  });

  it('skips instances without a chain or features, other feature types and positions without a start', () => {
    const out = normalizeRcsbSecondaryStructure({
      entry: {
        polymer_entities: [
          {
            rcsb_polymer_entity_container_identifiers: null,
            polymer_entity_instances: [
              { rcsb_polymer_entity_instance_container_identifiers: null },
              {
                rcsb_polymer_entity_instance_container_identifiers: { auth_asym_id: 'C' },
                rcsb_polymer_instance_feature: null,
              },
              {
                rcsb_polymer_entity_instance_container_identifiers: { auth_asym_id: 'D' },
                rcsb_polymer_instance_feature: [
                  { type: 'UNASSIGNED_SEC_STRUCT', feature_positions: [{ beg_seq_id: 1, end_seq_id: 9 }] },
                ],
              },
              {
                rcsb_polymer_entity_instance_container_identifiers: { auth_asym_id: 'B' },
                rcsb_polymer_instance_feature: [
                  {
                    type: 'HELIX_P',
                    feature_positions: [{ beg_seq_id: 20, end_seq_id: 30 }, { end_seq_id: 5 }, { beg_seq_id: 7, end_seq_id: null }],
                  },
                  { type: 'SHEET', feature_id: 'S3', feature_positions: [{ beg_seq_id: 40, end_seq_id: 44 }] },
                  { type: 'SHEET', feature_id: 'sheet-x', feature_positions: [{ beg_seq_id: 50, end_seq_id: 52 }] },
                  { type: 'SHEET', feature_id: null, feature_positions: null },
                  { type: 'SHEET', feature_id: '  ', feature_positions: [{ beg_seq_id: 60, end_seq_id: 61 }] },
                ],
              },
            ],
          },
        ],
      },
    } as unknown as RcsbInput);
    expect(out.chains).toHaveLength(1);
    const [chain] = out.chains;
    expect(chain.chainId).toBe('B');
    expect(chain.entityId).toBeUndefined();
    expect(chain.helices.map((h) => [h.seqStart, h.seqEnd, h.length])).toEqual([
      [7, 7, 1],
      [20, 30, 11],
    ]);
    expect(chain.strands.map((s) => [s.seqStart, s.sheetId])).toEqual([
      [40, '3'],
      [50, 'sheet-x'],
      [60, undefined],
    ]);
  });

  it('sorts chains by id', () => {
    const instance = (auth_asym_id: string) => ({
      rcsb_polymer_entity_instance_container_identifiers: { auth_asym_id },
      rcsb_polymer_instance_feature: [{ type: 'HELIX_P', feature_positions: [{ beg_seq_id: 1, end_seq_id: 4 }] }],
    });
    const out = normalizeRcsbSecondaryStructure({
      entry: {
        polymer_entities: [
          {
            rcsb_polymer_entity_container_identifiers: { entity_id: '1' },
            polymer_entity_instances: [instance('B'), instance('A')],
          },
        ],
      },
    });
    expect(out.chains.map((c) => [c.chainId, c.entityId])).toEqual([
      ['A', '1'],
      ['B', '1'],
    ]);
  });
});
