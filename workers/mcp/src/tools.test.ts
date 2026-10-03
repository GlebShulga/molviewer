// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fixtureFetch } from '../../../site/upstream/__fixtures__/fixtureFetch';
import { WIDGET_META_KEY, readWidgetPayload } from '../../../site/appContract';
import { findStructures, getStructureDetails, showStructure } from './tools';
import { compoundNameFrom, searchCatalog } from './catalog';
import { isDeniedCompound } from './safety';

function upstream(overrides?: Parameters<typeof fixtureFetch>[0]) {
  return { fetchImpl: fixtureFetch(overrides).fetchImpl };
}

describe('searchCatalog', () => {
  it('finds curated hemoglobin first, by collection label', () => {
    const r = searchCatalog('show me human hemoglobin in 3D', 'pdb', 3);
    expect(r[0]).toMatchObject({ kind: 'pdb', id: '4HHB' });
  });

  it('matches compounds by name and synonym', () => {
    expect(searchCatalog('caffeine', 'compound', 1)[0]).toMatchObject({ id: 'caffeine', subtitle: expect.stringContaining('C8H10N4O2') });
    expect(searchCatalog('aspirin', 'any', 1)[0]).toMatchObject({ kind: 'compound', id: 'aspirin' });
  });

  it('finds AlphaFold models by gene and organism', () => {
    expect(searchCatalog('human p53 alphafold', 'alphafold', 1)[0]).toMatchObject({ kind: 'alphafold', id: 'P04637' });
  });

  it('matches exact names as written, single letters included', () => {
    expect(searchCatalog('Vitamin A', 'compound', 1)[0]).toMatchObject({ id: 'vitamin-a' });
    expect(searchCatalog('show me retinol', 'any', 1)[0]).toMatchObject({ id: 'vitamin-a' });
  });

  it('returns nothing for filler-only queries', () => {
    expect(searchCatalog('show me the structure', 'any', 5)).toEqual([]);
  });
});

describe('find_structures', () => {
  it('answers catalog hits without network calls', async () => {
    const f = fixtureFetch();
    const r = await findStructures({ query: 'caffeine', kind: 'compound', limit: 1 }, { fetchImpl: f.fetchImpl });
    expect(f.calls).toEqual([]);
    expect(r.structuredContent?.results).toEqual([expect.objectContaining({ kind: 'compound', id: 'caffeine' })]);
    expect(r.text).toContain('best match first');
  });

  it('puts an exact PubChem name first, ahead of partial catalog matches', async () => {
    const r = await findStructures(
      { query: 'Coenzyme A', kind: 'compound', limit: 3 },
      upstream({
        'pubchem-name-coenzyme-a.json': { status: 200, body: '{"IdentifierList":{"CID":[87642]}}' },
        'pubchem-props-87642.json': {
          status: 200,
          body: '{"PropertyTable":{"Properties":[{"Title":"Coenzyme A","MolecularFormula":"C21H36N7O16P3S"}]}}',
        },
      })
    );
    const results = r.structuredContent?.results as { id: string; title: string }[];
    expect(results[0]).toMatchObject({ id: '87642', title: 'Coenzyme A' });
    expect(results).toHaveLength(3);
  });

  it('keeps structures first when PubChem names a macromolecule', async () => {
    const r = await findStructures(
      { query: 'zzpeptide', kind: 'any', limit: 10 },
      upstream({
        'pubchem-name-zzpeptide.json': { status: 200, body: '{"IdentifierList":{"CID":[111]}}' },
        'pubchem-props-111.json': { status: 200, body: '{"PropertyTable":{"Properties":[{"Title":"Zzpeptide","MolecularFormula":"C256H381N65O77S6"}]}}' },
        'rcsb-fulltext-zzpeptide.json': { status: 200, body: '{"result_set":[{"identifier":"9ABC"}]}' },
      })
    );
    const ids = (r.structuredContent?.results as { id: string }[]).map((x) => x.id);
    expect(ids.indexOf('9ABC')).toBeLessThan(ids.indexOf('111'));
  });

  it('skips PubChem when the catalog has the exact name', async () => {
    const f = fixtureFetch();
    await findStructures({ query: 'Vitamin A', kind: 'compound', limit: 3 }, { fetchImpl: f.fetchImpl });
    expect(f.calls).toEqual([]);
  });

  it('falls back to RCSB and UniProt for the rest', async () => {
    const r = await findStructures({ query: 'zzz-unknown hemoglobin', kind: 'pdb', limit: 3 }, upstream());
    // No fixture for this text: RCSB answers 404, reported as an empty search.
    expect(r.status).toBe('not_found');
    expect(r.isError).toBeUndefined();
  });

  it('refuses chemical warfare agents and drops them from mixed results', async () => {
    const compound = await findStructures({ query: 'sarin', kind: 'compound' }, upstream());
    expect(compound).toMatchObject({ isError: true, status: 'denied' });
    const any = await findStructures({ query: 'sarin', kind: 'any' }, upstream());
    const results = (any.structuredContent?.results ?? []) as { kind: string }[];
    expect(results.every((x) => x.kind !== 'compound')).toBe(true);
  });
});

describe('show_structure', () => {
  it('shows a PDB entry with facts and a widget payload', async () => {
    const r = await showStructure({ kind: 'pdb', id: '3dni' }, upstream());
    expect(r.status).toBe('ok');
    expect(r.structuredContent).toMatchObject({
      kind: 'pdb',
      id: '3DNI',
      method: 'X-ray diffraction',
      pageUrl: 'https://molviewer.bio/pdb/3DNI',
      shown: { style: 'cartoon', color: 'chain' },
    });
    const payload = readWidgetPayload(r.meta);
    expect(payload).toMatchObject({
      load: { kind: 'pdb', id: '3DNI' },
      view: { repr: 'cartoon', color: 'chain', spin: false },
      pageUrl: 'https://molviewer.bio/pdb/3DNI',
    });
    // Coordinates never go through the model.
    expect(JSON.stringify(r.structuredContent).length).toBeLessThan(4000);
  });

  it('says when the file is only part of the biological assembly (1HHO: 2 of 4 chains)', async () => {
    const r = await showStructure({ kind: 'pdb', id: '1HHO' }, upstream());
    expect(r.structuredContent).toMatchObject({
      polymerChainCount: 2,
      biologicalAssembly: { chains: 4, description: 'tetrameric', stoichiometry: ['A2', 'B2'] },
    });
    // In the text, first: the model reads it before writing its answer.
    expect(r.text).toMatch(/Note: This entry's file contains 2 of the 4 chains/);
    expect(r.text.indexOf('Note:')).toBeLessThan(r.text.indexOf('Full viewer'));
  });

  it('adds no note when the file is the whole assembly (4HHB)', async () => {
    const r = await showStructure({ kind: 'pdb', id: '4HHB' }, upstream());
    expect(r.structuredContent).toMatchObject({ polymerChainCount: 4, biologicalAssembly: { chains: 4 } });
    expect(r.structuredContent?.chainsNote).toBeUndefined();
    expect(r.text).not.toContain('Note:');
  });

  it('sends a one-line caption of key facts for the viewer, for every kind', async () => {
    const caption = async (args: Parameters<typeof showStructure>[0]) =>
      readWidgetPayload((await showStructure(args, upstream())).meta)?.caption;
    expect(await caption({ kind: 'compound', id: 'caffeine' })).toBe('Caffeine · C8H10N4O2 · 194.19 g/mol · stimulants');
    expect(await caption({ kind: 'pdb', id: '4HHB' })).toMatch(/^4HHB · .*haemoglobin · X-ray 1\.74 Å · 4 chains$/i);
    expect(await caption({ kind: 'pdb', id: '1HHO' })).toMatch(/ · 2 of 4 chains \(tetrameric\)$/);
    expect(await caption({ kind: 'alphafold', id: 'P69905' })).toMatch(/^AlphaFold P69905 · Hemoglobin subunit alpha \(HBA1\) · mean pLDDT \d+ · Homo sapiens$/);
  });

  it('leads with a request to answer, then the key facts, for every kind', async () => {
    const compound = await showStructure({ kind: 'compound', id: 'caffeine' }, upstream());
    expect(compound.text).toMatch(/Facts: Caffeine \(PubChem CID 2519\); .*formula C8H10N4O2/);
    // Compounds get substance beyond the formula: category and other names.
    expect(compound.text).toMatch(/catalog category: stimulants; also known as Guaranine, 1,3,7-Trimethylxanthine/);
    expect(compound.structuredContent).toMatchObject({ category: 'Stimulants', otherNames: expect.arrayContaining(['Theine']) });
    const pdb = await showStructure({ kind: 'pdb', id: '3DNI' }, upstream());
    expect(pdb.text).toMatch(/Facts: .*PDB 3DNI.*X-ray diffraction at 2 Å.*1 polymer chain in the file/);
    const af = await showStructure({ kind: 'alphafold', id: 'P69905' }, upstream());
    expect(af.text).toMatch(/Facts: AlphaFold model of .*mean pLDDT \d+\.\d.*very high \(>90\)/);
    for (const r of [compound, pdb, af]) {
      expect(r.lead).toMatch(/^The 3D viewer is already shown to the user, but it has no text\. You must now write a reply/);
      expect(r.text).not.toContain('You must now write');
    }
  });

  it('reports unknown PDB IDs clearly', async () => {
    const r = await showStructure({ kind: 'pdb', id: 'ZZZ9' }, upstream());
    expect(r).toMatchObject({ isError: true, status: 'not_found' });
    expect(r.text).toContain('No PDB entry "ZZZ9"');
    expect(r.meta).toBeUndefined();
  });

  it('rejects names passed as PDB IDs', async () => {
    const r = await showStructure({ kind: 'pdb', id: 'hemoglobin' }, upstream());
    expect(r).toMatchObject({ isError: true, status: 'invalid' });
    expect(r.text).toContain('find_structures');
  });

  it('shows the viewer even when RCSB details are down', async () => {
    const r = await showStructure({ kind: 'pdb', id: '3DNI' }, upstream({ 'rcsb-core-3DNI.json': { status: 503 } }));
    expect(r.status).toBe('ok');
    expect(r.cacheable).toBe(false);
    expect(readWidgetPayload(r.meta)?.load).toEqual({ kind: 'pdb', id: '3DNI' });
  });

  it('colors AlphaFold models by confidence by default', async () => {
    const r = await showStructure({ kind: 'alphafold', id: 'AF-P69905-F1' }, upstream());
    expect(readWidgetPayload(r.meta)?.view).toMatchObject({ repr: 'cartoon', color: 'bfactor' });
    expect(r.structuredContent).toMatchObject({ id: 'P69905', gene: 'HBA1', shown: { color: 'confidence' } });
    expect(r.structuredContent?.confidencePercent).toBeDefined();
  });

  it('shows catalog compounds without network calls and keeps them out of cartoon', async () => {
    const f = fixtureFetch();
    const r = await showStructure({ kind: 'compound', id: 'Caffeine', style: 'cartoon' }, { fetchImpl: f.fetchImpl });
    expect(f.calls).toEqual([]);
    expect(readWidgetPayload(r.meta)).toMatchObject({ load: { kind: 'compound', cid: 2519, slug: 'caffeine' }, view: { repr: 'ball-and-stick' } });
    expect(r.structuredContent).toMatchObject({ formula: 'C8H10N4O2', shown: { style: 'ball-and-stick' } });
  });

  it('maps confidence to B-factor outside AlphaFold, with a note', async () => {
    const r = await showStructure({ kind: 'pdb', id: '3DNI', color: 'confidence' }, upstream());
    expect(readWidgetPayload(r.meta)?.view.color).toBe('bfactor');
    expect(r.text).toContain('AlphaFold models');
  });

  it('refuses Schedule 1 agents by name, slug and CID', async () => {
    for (const id of ['sarin', 'Sarin', '7871', 'vx', 'mustard-gas']) {
      const r = await showStructure({ kind: 'compound', id }, upstream());
      expect(r, id).toMatchObject({ isError: true, status: 'denied' });
    }
  });

  it('keeps educational toxins available', async () => {
    const r = await showStructure({ kind: 'compound', id: 'tetrodotoxin' }, upstream());
    expect(r.status).toBe('ok');
  });

  it('puts the payload under the widget key only', async () => {
    const r = await showStructure({ kind: 'compound', id: 'caffeine' }, upstream());
    expect(Object.keys(r.meta ?? {})).toEqual([WIDGET_META_KEY]);
  });
});

describe('get_structure_details', () => {
  it('gives per-chain strand ranges from PDBe', async () => {
    const r = await getStructureDetails({ kind: 'pdb', id: '3DNI', sections: ['secondaryStructure'] }, upstream());
    const ss = r.structuredContent?.secondaryStructure as { source: string; chains: { chain: string; strands: string[] }[] };
    expect(ss.source).toBe('PDBe');
    expect(ss.chains[0].strands.length).toBeGreaterThan(0);
    expect(ss.chains[0].strands[0]).toMatch(/^\d+[A-Z]?-\d+[A-Z]?( \(sheet \w+\))?$/);
  });

  it('returns an error rather than empty facts when upstream is down', async () => {
    const r = await getStructureDetails({ kind: 'pdb', id: '3DNI' }, upstream({ 'rcsb-core-3DNI.json': { status: 503 } }));
    expect(r).toMatchObject({ isError: true, status: 'upstream_error' });
  });
});

describe('degraded answers are not cached', () => {
  it('find_structures: PubChem outage', async () => {
    const r = await findStructures({ query: 'zzunknownchem', kind: 'compound' }, upstream({ 'pubchem-name-zzunknownchem.json': { status: 503 } }));
    expect(r.cacheable).toBe(false);
    expect(r.text).toContain('PubChem did not answer');
  });

  it('find_structures: RCSB titles missing', async () => {
    const r = await findStructures(
      { query: 'zzz hemoglobin', kind: 'pdb', limit: 10 },
      upstream({ 'rcsb-fulltext-zzz-hemoglobin.json': { status: 200, body: '{"result_set":[{"identifier":"9ABC"}]}' } })
    );
    expect((r.structuredContent?.results as { id: string }[]).some((x) => x.id === '9ABC')).toBe(true);
    expect(r.cacheable).toBe(false);
  });

  it('get_structure_details and show_structure: secondary structure sources down', async () => {
    const down = { 'pdbe-ss-3DNI.json': { status: 503 }, 'rcsb-gql-ss-3DNI.json': { status: 503 } } as const;
    const details = await getStructureDetails({ kind: 'pdb', id: '3DNI' }, upstream(down));
    expect(details.status).toBe('ok');
    expect(details.cacheable).toBe(false);
    const shown = await showStructure({ kind: 'pdb', id: '3DNI' }, upstream(down));
    expect(shown.cacheable).toBe(false);
    expect((await getStructureDetails({ kind: 'pdb', id: '3DNI' }, upstream())).cacheable).not.toBe(false);
  });
});

describe('compoundNameFrom', () => {
  it('keeps the name as written and drops request words', () => {
    expect(compoundNameFrom('Vitamin A')).toBe('Vitamin A');
    expect(compoundNameFrom('Coenzyme A')).toBe('Coenzyme A');
    expect(compoundNameFrom('2,4-dinitrophenol')).toBe('2,4-dinitrophenol');
    expect(compoundNameFrom('Show me a caffeine molecule in 3D?')).toBe('caffeine');
    expect(compoundNameFrom('what does aspirin look like')).toBe('aspirin');
  });
});

describe('isDeniedCompound', () => {
  it('matches by CID or name', () => {
    expect(isDeniedCompound({ cid: 39793 })).toBe(true);
    expect(isDeniedCompound({ names: ['Sulfur mustard'] })).toBe(true);
    expect(isDeniedCompound({ cid: 2519, names: ['Caffeine'] })).toBe(false);
  });
});

describe('assemblyNote', () => {
  it('covers files with more copies than the assembly', async () => {
    const { assemblyNote } = await import('./summaries');
    expect(assemblyNote({ polymerChainCount: 4, assembly: { chainCount: 2, oligomericDetails: 'dimeric', stoichiometry: [] } })).toMatch(
      /several copies/
    );
    expect(assemblyNote({ polymerChainCount: 3, assembly: { chainCount: 3, stoichiometry: [] } })).toBeUndefined();
    expect(assemblyNote({ polymerChainCount: 3 })).toBeUndefined();
  });
});
