// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { conformerFlags, fetchProperties, fetchSynonyms, has3dConformer } from './validate-compounds';

/** fetch stub: `route(url)` gives [status, body]. */
function stubFetch(route: (url: string) => [number, unknown?]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const [status, body] = route(url);
    return new Response(body === undefined ? '' : JSON.stringify(body), { status });
  }));
}

/** Run a promise to completion through the throttle and retry backoff timers. */
async function settle<T>(p: Promise<T>): Promise<{ value?: T; error?: unknown }> {
  const result = p.then((value) => ({ value }), (error) => ({ error }));
  await vi.runAllTimersAsync();
  return result;
}

const props = (cid: number) => ({ PropertyTable: { Properties: [{ CID: cid, MolecularFormula: 'CH4', SMILES: 'C' }] } });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('validate-compounds: PubChem lookups', () => {
  it('treats a 404 for one CID as "not found" and keeps the rest', async () => {
    stubFetch((url) => {
      if (url.includes('/cid/1,2/')) return [404];
      if (url.includes('/cid/1/')) return [200, props(1)];
      return [404];
    });
    const { value } = await settle(fetchProperties([1, 2]));
    expect([...value!.keys()]).toEqual([1]);
  });

  it('aborts on a server error instead of treating it as "not found"', async () => {
    stubFetch(() => [503]);
    const { error } = await settle(fetchProperties([1, 2]));
    expect(error).toBeInstanceOf(Error);
  });

  it('aborts when synonyms for a single CID fail with a server error', async () => {
    stubFetch(() => [500]);
    const { error } = await settle(fetchSynonyms([7]));
    expect(error).toBeInstanceOf(Error);
  });

  it('retries a property batch that fails with a server error CID by CID', async () => {
    stubFetch((url) => {
      if (url.includes('/cid/1,2/')) return [504];
      if (url.includes('/cid/1/')) return [200, props(1)];
      if (url.includes('/cid/2/')) return [200, props(2)];
      return [404];
    });
    const { value, error } = await settle(fetchProperties([1, 2]));
    expect(error).toBeUndefined();
    expect([...value!.keys()]).toEqual([1, 2]);
  });

  it('retries a synonym batch that fails with a server error CID by CID', async () => {
    const syn = (cid: number) => ({ InformationList: { Information: [{ CID: cid, Synonym: [`name-${cid}`] }] } });
    stubFetch((url) => {
      if (url.includes('/cid/1,2/')) return [504];
      if (url.includes('/cid/1/')) return [200, syn(1)];
      if (url.includes('/cid/2/')) return [200, syn(2)];
      return [404];
    });
    const { value, error } = await settle(fetchSynonyms([1, 2]));
    expect(error).toBeUndefined();
    expect(value!.get(1)).toEqual(['name-1']);
    expect(value!.get(2)).toEqual(['name-2']);
  });

  it('still aborts when a CID retried on its own fails with a server error', async () => {
    stubFetch((url) => {
      if (url.includes('/cid/1,2/')) return [504];
      if (url.includes('/cid/1/')) return [200, props(1)];
      return [503];
    });
    const { error } = await settle(fetchProperties([1, 2]));
    expect(error).toBeInstanceOf(Error);
  });

  it('reads a 400 for a 3D conformer as "none" (PubChem\'s other "not found")', async () => {
    stubFetch(() => [400]);
    expect((await settle(has3dConformer(3))).value).toBe(false);
  });

  it('reads a 404 for a 3D conformer as "none", and aborts on other errors', async () => {
    stubFetch((url) => (url.includes('/cid/1/') ? [404] : [500]));
    expect((await settle(has3dConformer(1))).value).toBe(false);
    const { error } = await settle(conformerFlags([2]));
    expect(error).toBeInstanceOf(Error);
  });
});
