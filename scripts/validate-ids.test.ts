// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errors, fetchUniProt, resetReport, validateAf, validatePdbs } from './validate-ids';

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
