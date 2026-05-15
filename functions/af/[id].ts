/**
 * GET /af/:id — landing page for an AlphaFold prediction by UniProt ID.
 */
import { applyLandingMeta, clean, escapeHtml, type LandingMeta } from '../_shared/landingMeta';

const BOILERPLATE = `View this AlphaFold prediction interactively in 3D with MolViewer. Rotate, zoom, measure distances and angles, and explore the predicted structure directly in your browser without installing any software.`;

const NOSCRIPT = `JavaScript is required to view the interactive 3D structure. Please enable JavaScript or visit the AlphaFold link above.`;

interface UniProtResponse {
  proteinDescription?: {
    recommendedName?: { fullName?: { value?: string } };
    submissionNames?: Array<{ fullName?: { value?: string } }>;
  };
  organism?: { scientificName?: string };
}

async function fetchUniProtFallback(
  id: string
): Promise<{ desc?: string; organism?: string }> {
  try {
    const resp = await fetch(
      `https://rest.uniprot.org/uniprotkb/${id}.json?fields=protein_name,organism_name`,
      { cf: { cacheTtl: 86400, cacheEverything: true } }
    );
    if (!resp.ok) return {};
    const data = (await resp.json()) as UniProtResponse;
    const desc =
      data.proteinDescription?.recommendedName?.fullName?.value ??
      data.proteinDescription?.submissionNames?.[0]?.fullName?.value;
    const organism = data.organism?.scientificName;
    return { desc, organism };
  } catch {
    return {};
  }
}

function buildAfBodyHtml(
  id: string,
  desc: string | undefined,
  organism: string | undefined
): string {
  const heading = desc
    ? `${id}: ${escapeHtml(clean(desc, 120))}`
    : `AlphaFold Prediction ${id}`;
  const organismSuffix = organism ? ` from ${escapeHtml(clean(organism, 80))}` : '';
  const lead = desc
    ? `AlphaFold structure prediction for ${escapeHtml(clean(desc, 300))}${organismSuffix} (UniProt ${id}).`
    : `AlphaFold structure prediction for UniProt entry ${id}.`;
  return `<article class="seo-fallback">
  <h1>${heading}</h1>
  <p>${lead}</p>
  <p>${BOILERPLATE}</p>
  <p><a href="https://alphafold.ebi.ac.uk/entry/${id}">Source: AlphaFold Protein Structure Database</a> · <a href="https://www.uniprot.org/uniprotkb/${id}">UniProt ${id}</a></p>
  <noscript>${NOSCRIPT}</noscript>
</article>`;
}

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
  let desc: string | undefined;
  let organism: string | undefined;

  try {
    const resp = await fetch(`https://alphafold.ebi.ac.uk/api/prediction/${upper}`, {
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
    if (resp.ok) {
      const data = (await resp.json()) as AlphaFoldEntry[] | AlphaFoldEntry;
      const entry = Array.isArray(data) ? data[0] : data;
      desc = entry?.uniprotDescription;
      organism = entry?.organismScientificName;
    }
  } catch {
    // Use defaults.
  }

  // AlphaFold's prediction API often omits uniprotDescription in practice.
  // Fall back to UniProt for the protein name / organism so each page has
  // unique body content for SEO.
  if (!desc || !organism) {
    const up = await fetchUniProtFallback(upper);
    desc = desc ?? up.desc;
    organism = organism ?? up.organism;
  }

  if (desc) {
    title = `${upper}: ${clean(desc, 80)} — MolViewer`;
    description = `AlphaFold prediction of ${clean(desc, 160)}${organism ? ` (${clean(organism, 60)})` : ''}. View interactively in 3D with MolViewer.`;
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
    bodyHtml: buildAfBodyHtml(upper, desc, organism),
  };
}

export const onRequestGet: PagesFunction = async ({ request, params, next }) => {
  const id = String(params.id ?? '');
  const upper = id.toUpperCase();
  if (!UNIPROT_RE.test(upper)) {
    return next();
  }

  if (id !== upper) {
    const url = new URL(request.url);
    url.pathname = `/af/${upper}`;
    return Response.redirect(url.toString(), 301);
  }

  const meta = await fetchAfMeta(id, request);
  const indexResponse = await next();
  return applyLandingMeta(indexResponse, meta);
};
