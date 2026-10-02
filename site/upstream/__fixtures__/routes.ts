/**
 * Maps an upstream URL to a fixture file name. Shared by the tests (to serve
 * fixtures) and by record.ts (to save real responses under the same names).
 */
export function fixtureNameFor(url: string): string | undefined {
  const u = new URL(url);
  const last = decodeURIComponent(u.pathname.split('/').pop() ?? '');

  if (u.host === 'data.rcsb.org' && u.pathname.startsWith('/rest/v1/core/entry/')) {
    return `rcsb-core-${last.toUpperCase()}.json`;
  }
  if (u.host === 'data.rcsb.org' && u.pathname === '/graphql') {
    const query = u.searchParams.get('query') ?? '';
    const vars = JSON.parse(u.searchParams.get('variables') ?? '{}') as {
      id?: string;
      ids?: string[];
    };
    if (query.includes('entries(')) return `rcsb-gql-entries-${(vars.ids ?? []).length}.json`;
    if (query.includes('rcsb_polymer_instance_feature')) return `rcsb-gql-ss-${vars.id}.json`;
    if (query.includes('nonpolymer_entities')) return `rcsb-gql-entities-${vars.id}.json`;
    return undefined;
  }
  if (u.host === 'search.rcsb.org') {
    const json = JSON.parse(u.searchParams.get('json') ?? '{}') as {
      query?: {
        service?: string;
        parameters?: { value?: string };
        nodes?: Array<{ parameters?: { value?: string } }>;
      };
    };
    if (json.query?.service === 'full_text') return `rcsb-fulltext-${slug(json.query.parameters?.value)}.json`;
    return `rcsb-search-${json.query?.nodes?.[0]?.parameters?.value}.json`;
  }
  if (u.host === 'www.ebi.ac.uk' && u.pathname.includes('/secondary_structure/')) {
    return `pdbe-ss-${last.toUpperCase()}.json`;
  }
  if (u.host === 'alphafold.ebi.ac.uk') return `af-${last.toUpperCase()}.json`;
  if (u.host === 'rest.uniprot.org' && u.pathname.endsWith('/search')) {
    const query = u.searchParams.get('query') ?? '';
    const human = query.includes('organism_id:9606') ? '-human' : '';
    return `uniprot-search-${slug(/^\((.*?)\) AND/.exec(query)?.[1])}${human}.json`;
  }
  if (u.host === 'rest.uniprot.org')
    return `uniprot-${last.replace(/\.json$/, '').toUpperCase()}.json`;
  if (u.host === 'pubchem.ncbi.nlm.nih.gov') {
    const name = /\/compound\/name\/([^/]+)\/cids/.exec(u.pathname)?.[1];
    if (name) return `pubchem-name-${slug(decodeURIComponent(name))}.json`;
    const cid = /\/compound\/cid\/(\d+)\/property\//.exec(u.pathname)?.[1];
    if (cid) return `pubchem-props-${cid}.json`;
  }
  return undefined;
}

function slug(text: string | undefined): string {
  return (text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
