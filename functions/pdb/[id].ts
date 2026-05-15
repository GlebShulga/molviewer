/**
 * GET /pdb/:id — landing page for an RCSB PDB entry.
 * Fetches structure metadata from data.rcsb.org and injects per-entry
 * meta tags into the SPA's index.html. The SPA then loads the structure
 * via the existing pathname routing.
 */
import { applyLandingMeta, clean, escapeHtml, type LandingMeta } from '../_shared/landingMeta';

const BOILERPLATE = `View this PDB structure interactively in 3D with MolViewer. Rotate, zoom, measure distances and angles, and explore secondary-structure annotations directly in your browser without installing any software.`;

const NOSCRIPT = `JavaScript is required to view the interactive 3D structure. Please enable JavaScript or visit the RCSB link above.`;

function buildPdbBodyHtml(id: string, structTitle: string | undefined): string {
  const heading = structTitle ? `${id}: ${escapeHtml(clean(structTitle, 120))}` : `PDB Entry ${id}`;
  const lead = structTitle
    ? escapeHtml(clean(structTitle, 400))
    : `Protein Data Bank entry ${id}.`;
  return `<article class="seo-fallback">
  <h1>${heading}</h1>
  <p>${lead}</p>
  <p>${BOILERPLATE}</p>
  <p><a href="https://www.rcsb.org/structure/${id}">Source: RCSB Protein Data Bank</a></p>
  <noscript>${NOSCRIPT}</noscript>
</article>`;
}

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
  let structTitle: string | undefined;

  try {
    const resp = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${upper}`, {
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
    if (resp.ok) {
      const data = (await resp.json()) as RcsbEntry;
      structTitle = data.struct?.title;
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
    bodyHtml: buildPdbBodyHtml(upper, structTitle),
  };
}

export const onRequestGet: PagesFunction = async ({ request, params, next }) => {
  const id = String(params.id ?? '');
  if (!PDB_ID_RE.test(id)) {
    return next();
  }

  // Canonicalize to uppercase via 301 so Search Console doesn't flag the
  // lowercase variant as "Page with redirect" via canonical mismatch.
  const upper = id.toUpperCase();
  if (id !== upper) {
    const url = new URL(request.url);
    url.pathname = `/pdb/${upper}`;
    return Response.redirect(url.toString(), 301);
  }

  const meta = await fetchPdbMeta(id, request);
  const indexResponse = await next();
  return applyLandingMeta(indexResponse, meta);
};
