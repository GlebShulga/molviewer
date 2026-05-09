/**
 * GET /pdb/:id — landing page for an RCSB PDB entry.
 * Fetches structure metadata from data.rcsb.org and injects per-entry
 * meta tags into the SPA's index.html. The SPA then loads the structure
 * via the existing pathname routing.
 */
import { applyLandingMeta, clean, type LandingMeta } from '../_shared/landingMeta';

const PDB_ID_RE = /^[A-Za-z0-9]{4}$/;

interface RcsbEntry {
  struct?: { title?: string };
  rcsb_primary_citation?: { title?: string };
  rcsb_entry_info?: {
    deposited_atom_count?: number;
    polymer_entity_count_protein?: number;
  };
}

async function fetchPdbMeta(id: string, request: Request): Promise<LandingMeta> {
  const upper = id.toUpperCase();
  const canonicalUrl = `${new URL(request.url).origin}/pdb/${upper}`;
  const ogImageUrl = `${new URL(request.url).origin}/api/og/pdb/${upper}.png`;

  let title = `${upper} — MolViewer`;
  let description = `View PDB structure ${upper} in an interactive 3D viewer. Explore atoms, secondary structure, and surfaces.`;

  try {
    const resp = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${upper}`, {
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
    if (resp.ok) {
      const data = (await resp.json()) as RcsbEntry;
      const structTitle = data.struct?.title;
      if (structTitle) {
        title = `${upper}: ${clean(structTitle, 80)} — MolViewer`;
        description = `${clean(structTitle, 200)}. View this PDB structure interactively in 3D with MolViewer.`;
      }
    }
  } catch {
    // Fall through to defaults — landing page still renders.
  }

  return {
    title,
    description,
    ogImageUrl,
    canonicalUrl,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: canonicalUrl,
      about: {
        '@type': 'Thing',
        name: `Protein Data Bank entry ${upper}`,
        identifier: upper,
        sameAs: `https://www.rcsb.org/structure/${upper}`,
      },
    },
  };
}

export const onRequestGet: PagesFunction = async ({ request, params, next }) => {
  const id = String(params.id ?? '');
  if (!PDB_ID_RE.test(id)) {
    return next();
  }

  const meta = await fetchPdbMeta(id, request);
  const indexResponse = await next();
  return applyLandingMeta(indexResponse, meta);
};
