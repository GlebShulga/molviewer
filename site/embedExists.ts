/**
 * Does an embed target exist? Used by /embed/* and /oembed so unknown IDs
 * get a real 404 (and aren't turned into broken embeds by WordPress or
 * Notion), like the full landing pages.
 *
 * `unknown` means the upstream was unreachable: callers keep status 200.
 */
import type { EmbedTarget } from './embed';
import { cidForSlug } from './compoundSlugs';
import { getJson } from './upstream/http';
import { fetchPubchemSummary } from './upstream/pubchem';
import { isAlphaFoldMissing } from './upstream/af';
import type { UpstreamOptions } from './upstream/types';

export type Existence = 'yes' | 'no' | 'unknown';

export async function embedTargetExists(target: EmbedTarget, opts: UpstreamOptions = {}): Promise<Existence> {
  switch (target.kind) {
    case 'compound':
      // Only curated compounds have slug pages; no network needed.
      return cidForSlug(target.key) !== undefined ? 'yes' : 'no';
    case 'cid': {
      const r = await fetchPubchemSummary(Number(target.key), opts);
      return r.status === 'ok' ? 'yes' : r.status === 'not-found' ? 'no' : 'unknown';
    }
    case 'pdb': {
      const r = await getJson<unknown>(`https://data.rcsb.org/rest/v1/core/entry/${target.key}`, opts);
      if (r.ok) return 'yes';
      return r.status === 404 ? 'no' : 'unknown';
    }
    case 'af': {
      const r = await getJson<unknown[]>(`https://alphafold.ebi.ac.uk/api/prediction/${target.key}`, opts);
      if (r.ok) return Array.isArray(r.data) && r.data.length > 0 ? 'yes' : 'no';
      return isAlphaFoldMissing(r.status) ? 'no' : 'unknown';
    }
  }
}
