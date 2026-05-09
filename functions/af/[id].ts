/**
 * GET /af/:id — landing page for an AlphaFold prediction by UniProt ID.
 */
import { applyLandingMeta, clean, type LandingMeta } from '../_shared/landingMeta';

const UNIPROT_RE = /^[OPQ][0-9][A-Z0-9]{3}[0-9]$|^[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}$/;

interface AlphaFoldEntry {
  uniprotDescription?: string;
  organismScientificName?: string;
  uniprotAccession?: string;
  cifUrl?: string;
}

async function fetchAfMeta(id: string, request: Request): Promise<LandingMeta> {
  const upper = id.toUpperCase();
  const canonicalUrl = `${new URL(request.url).origin}/af/${upper}`;
  const ogImageUrl = `${new URL(request.url).origin}/api/og/af/${upper}.png`;

  let title = `AF-${upper} — MolViewer`;
  let description = `View AlphaFold prediction for UniProt ${upper} in an interactive 3D viewer.`;

  try {
    const resp = await fetch(`https://alphafold.ebi.ac.uk/api/prediction/${upper}`, {
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
    if (resp.ok) {
      const data = (await resp.json()) as AlphaFoldEntry[] | AlphaFoldEntry;
      const entry = Array.isArray(data) ? data[0] : data;
      const desc = entry?.uniprotDescription;
      const organism = entry?.organismScientificName;
      if (desc) {
        title = `${upper}: ${clean(desc, 80)} — MolViewer`;
        description = `AlphaFold prediction of ${clean(desc, 160)}${organism ? ` (${clean(organism, 60)})` : ''}. View interactively in 3D with MolViewer.`;
      }
    }
  } catch {
    // Use defaults.
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
        name: `AlphaFold prediction for UniProt ${upper}`,
        identifier: upper,
        sameAs: `https://alphafold.ebi.ac.uk/entry/${upper}`,
      },
    },
  };
}

export const onRequestGet: PagesFunction = async ({ request, params, next }) => {
  const id = String(params.id ?? '');
  if (!UNIPROT_RE.test(id.toUpperCase())) {
    return next();
  }

  const meta = await fetchAfMeta(id, request);
  const indexResponse = await next();
  return applyLandingMeta(indexResponse, meta);
};
