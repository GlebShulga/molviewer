/**
 * Re-record the upstream fixtures from the live APIs:
 *   pnpm exec tsx site/upstream/__fixtures__/record.ts            (everything)
 *   pnpm exec tsx site/upstream/__fixtures__/record.ts --search   (MCP search fixtures only)
 * Runs the real fetchers with a recording fetch, then trims large fields so each
 * fixture stays small. Not part of the test run.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAfDetails } from '../af';
import { fetchPdbDetails } from '../pdb';
import { fetchPubchemCompound, resolvePubchemCid } from '../pubchem';
import { searchRcsb, searchUniProt } from '../search';
import { fixtureNameFor } from './routes';

const dir = dirname(fileURLToPath(import.meta.url));

type Trim = (name: string, body: unknown) => unknown;

/** `keepExisting`: never overwrite a fixture another test already relies on. */
function recordingFetch(opts: { failHost?: string; trim: Trim; keepExisting?: boolean }): typeof fetch {
  return async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (opts.failHost && new URL(url).host === opts.failHost) {
      return new Response('forced failure', { status: 500 });
    }
    const resp = await fetch(url, init);
    const text = await resp.text();
    const name = fixtureNameFor(url);
    if (name && opts.keepExisting && existsSync(join(dir, name))) {
      console.log(`kept ${name}`);
    } else if (name && resp.ok && text.trim()) {
      const trimmed = opts.trim(name, JSON.parse(text));
      writeFileSync(join(dir, name), JSON.stringify(trimmed, null, 1) + '\n');
      console.log(`recorded ${name} (${resp.status})`);
    } else {
      console.log(`skipped ${url.slice(0, 100)} (${resp.status})`);
    }
    return new Response(text, { status: resp.status, headers: resp.headers });
  };
}

const trim: Trim = (name, body) => {
  if (name.startsWith('uniprot-')) {
    const b = body as { uniProtKBCrossReferences?: unknown[] };
    // Keep a slice of PDB xrefs; enough to test sorting and the cap.
    if (b.uniProtKBCrossReferences)
      b.uniProtKBCrossReferences = b.uniProtKBCrossReferences.slice(0, 40);
    return b;
  }
  if (name.startsWith('af-')) {
    return (body as Array<Record<string, unknown>>).map((e) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(e)) if (!/Url$/.test(k)) out[k] = v;
      return out;
    });
  }
  if (name.startsWith('rcsb-gql-ss-')) {
    // Only secondary-structure features matter for the fallback.
    const b = body as {
      data: {
        entry: {
          polymer_entities: Array<{
            polymer_entity_instances: Array<{
              rcsb_polymer_instance_feature: Array<{ type: string }>;
            }>;
          }>;
        };
      };
    };
    for (const e of b.data.entry.polymer_entities) {
      for (const i of e.polymer_entity_instances) {
        i.rcsb_polymer_instance_feature = i.rcsb_polymer_instance_feature.filter(
          (f) => f.type === 'SHEET' || f.type === 'HELIX_P'
        );
      }
    }
    return b;
  }
  return body;
};

async function main(): Promise<void> {
  if (!process.argv.includes('--search')) await recordLandingPages();
  await recordSearches();
}

async function recordLandingPages(): Promise<void> {
  const pdb = await fetchPdbDetails('3DNI', {
    fetchImpl: recordingFetch({ trim }),
    timeoutMs: 20000,
  });
  console.log('3DNI', pdb.status, pdb.status === 'ok' ? pdb.data.partial : '');
  // Force PDBe down so the RCSB secondary-structure fallback is recorded too.
  await fetchPdbDetails('3DNI', {
    fetchImpl: recordingFetch({ trim, failHost: 'www.ebi.ac.uk' }),
    timeoutMs: 20000,
  });
  const af = await fetchAfDetails('P69905', {
    fetchImpl: recordingFetch({ trim }),
    timeoutMs: 20000,
  });
  console.log('P69905', af.status, af.status === 'ok' ? af.data.partial : '');
  // Isoform-selection fixture (AlphaFold only; UniProt is not recorded for it).
  await fetchAfDetails('P04637', {
    fetchImpl: recordingFetch({ trim, failHost: 'rest.uniprot.org' }),
    timeoutMs: 20000,
  });
}

/** MCP server searches (site/upstream/search.ts, pubchem.ts). */
async function recordSearches(): Promise<void> {
  const live = { fetchImpl: recordingFetch({ trim, keepExisting: true }), timeoutMs: 20000 };
  console.log('rcsb hemoglobin', (await searchRcsb('hemoglobin', 5, live)).status);
  console.log('uniprot p53', (await searchUniProt('p53', 3, live)).status);
  console.log('uniprot e. coli lacZ', (await searchUniProt('E. coli lacZ', 3, live)).status);
  console.log('pubchem caffeine', (await resolvePubchemCid('caffeine', live)).status);
  console.log('pubchem 2519', (await fetchPubchemCompound(2519, live)).status);
}

void main();
