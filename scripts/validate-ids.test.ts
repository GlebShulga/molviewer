// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errors, fetchAf, fetchUniProt, resetReport, validateAf, validatePdbs } from './validate-ids';

function stubFetch(route: (url: string) => [number, unknown?]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const [status, body] = route(url);
    return new Response(body === undefined ? '' : JSON.stringify(body), { status });
  }));
}

async function settle<T>(p: Promise<T>): Promise<{ value?: T; error?: unknown }> {
  const result = p.then((value) => ({ value }), (error) => ({ error }));
  await vi.runAllTimersAsync();
  return result;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetReport();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('validate-ids', () => {
  it('reads a UniProt 404 as "no record", and aborts on other errors', async () => {
    stubFetch((url) => (url.includes('P00001') ? [404] : [503]));
    expect((await settle(fetchUniProt('P00001'))).value).toBeNull();
    expect((await settle(fetchUniProt('P00002'))).error).toBeInstanceOf(Error);
  });

  it('keeps a PDB entry with an invalid id in fix mode (listed as an error), instead of dropping it', async () => {
    stubFetch(() => [200, { struct: { title: 'CRAMBIN' }, rcsb_accession_info: { initial_release_date: '1981-01-01' } }]);
    const old = { id: '12', title: 'kept as it was', revised: '2020-01-01' };
    const { value } = await settle(validatePdbs({ pdbs: ['1CRN', old] }, false));
    expect(value!.entries.map((e) => e.id)).toEqual(['1CRN']);
    expect(value!.invalid).toEqual([old]);
    expect(errors.some((e) => e.includes('"12" is not a valid id'))).toBe(true);
  });

  it('keeps an AlphaFold entry with an invalid accession in fix mode', async () => {
    stubFetch(() => [404]);
    const { value } = await settle(validateAf({ entries: ['not-an-accession'] }, false));
    expect(value!.invalid).toEqual(['not-an-accession']);
  });
});

describe('fetchAf', () => {
  const ALPHAFOLD = 'alphafold.ebi.ac.uk/api/prediction/';
  const UNIPROT = 'rest.uniprot.org/uniprotkb/';

  /** Answers AlphaFold and UniProt requests; UniProt is a 404 unless given. */
  function stubAfAndUniProt(prediction: [number, unknown?], uniprot: [number, unknown?] = [404]) {
    stubFetch((url) => {
      if (url.includes(ALPHAFOLD)) return prediction;
      if (url.includes(UNIPROT)) return uniprot;
      throw new Error(`unexpected fetch: ${url}`);
    });
  }

  const model = {
    modelEntityId: 'AF-P69905-F1',
    modelCreatedDate: '2022-06-01T00:00:00Z',
    uniprotDescription: 'Hemoglobin subunit alpha (AF)',
    gene: 'HBA1-af',
    organismScientificName: 'Homo sapiens (AF)',
    globalMetricValue: 92.4567,
    fractionPlddtVeryHigh: 0.81234,
    fractionPlddtConfident: 0.10456,
    fractionPlddtLow: 0.05,
    fractionPlddtVeryLow: 0.03333,
  };

  it('picks the F1 model and takes name, gene and organism from UniProt', async () => {
    stubAfAndUniProt([200, [{ modelEntityId: 'AF-P69905-F2', gene: 'other' }, model]], [
      200,
      {
        proteinDescription: { recommendedName: { fullName: { value: 'Hemoglobin subunit alpha' } } },
        genes: [{ geneName: { value: 'HBA1' } }],
        organism: { scientificName: 'Homo sapiens' },
      },
    ]);
    const { value } = await settle(fetchAf('P69905'));
    expect(value).toEqual({
      id: 'P69905',
      name: 'Hemoglobin subunit alpha',
      gene: 'HBA1',
      organism: 'Homo sapiens',
      revised: '2022-06-01',
      plddt: { mean: 92.5, veryHigh: 0.812, confident: 0.105, low: 0.05, veryLow: 0.033 },
    });
    // Fixed key order, so the written file diffs cleanly
    expect(Object.keys(value!)).toEqual(['id', 'name', 'gene', 'organism', 'revised', 'plddt']);
  });

  it('takes the first model when there is no F1', async () => {
    stubAfAndUniProt([200, [{ ...model, modelEntityId: 'AF-P69905-F2', gene: 'FIRST' }, { ...model, modelEntityId: 'AF-P69905-F3', gene: 'SECOND' }]]);
    expect((await settle(fetchAf('P69905'))).value?.gene).toBe('FIRST');
  });

  it('falls back to the UniProt submission name, then the AlphaFold description', async () => {
    stubAfAndUniProt([200, [model]], [200, { proteinDescription: { submissionNames: [{ fullName: { value: 'Submitted name' } }] } }]);
    expect((await settle(fetchAf('P69905'))).value?.name).toBe('Submitted name');

    stubAfAndUniProt([200, [model]], [200, { proteinDescription: {} }]);
    expect((await settle(fetchAf('P69905'))).value).toMatchObject({
      name: 'Hemoglobin subunit alpha (AF)',
      gene: 'HBA1-af',
      organism: 'Homo sapiens (AF)',
    });
  });

  it('uses the AlphaFold record for name, gene and organism when UniProt has no record', async () => {
    stubAfAndUniProt([200, [model]]);
    expect((await settle(fetchAf('P69905'))).value).toMatchObject({
      name: 'Hemoglobin subunit alpha (AF)',
      gene: 'HBA1-af',
      organism: 'Homo sapiens (AF)',
    });
  });

  it('leaves out gene, revised and pLDDT when neither source has them', async () => {
    stubAfAndUniProt([200, [{ modelEntityId: 'AF-P69905-F1', globalMetricValue: 90 }]]);
    const { value } = await settle(fetchAf('P69905'));
    expect(value).toEqual({ id: 'P69905', name: '', organism: '' });
  });

  it('fills missing pLDDT fractions with 0 when the very-high fraction is present', async () => {
    stubAfAndUniProt([200, [{ modelEntityId: 'AF-P69905-F1', globalMetricValue: 70, fractionPlddtVeryHigh: 0.5 }]]);
    expect((await settle(fetchAf('P69905'))).value?.plddt).toEqual({ mean: 70, veryHigh: 0.5, confident: 0, low: 0, veryLow: 0 });
  });

  it('returns null for an empty prediction list, a 404 and a 422', async () => {
    for (const prediction of [[200, []], [404], [422]] as [number, unknown?][]) {
      stubAfAndUniProt(prediction);
      expect((await settle(fetchAf('P69905'))).value).toBeNull();
    }
  });

  it('rethrows a server error after the retries', async () => {
    stubAfAndUniProt([503]);
    expect((await settle(fetchAf('P69905'))).error).toBeInstanceOf(Error);
  });
});
