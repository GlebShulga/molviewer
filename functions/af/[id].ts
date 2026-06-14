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
  organism?: { scientificName?: string; commonName?: string };
  genes?: Array<{ geneName?: { value?: string } }>;
  sequence?: { length?: number };
  comments?: Array<{
    commentType: 'FUNCTION' | 'SUBCELLULAR LOCATION' | 'DISEASE' | 'SUBUNIT' | string;
    texts?: Array<{ value?: string }>;
    subcellularLocations?: Array<{ location?: { value?: string } }>;
    disease?: { diseaseId?: string; acronym?: string };
  }>;
}

/** Protein-level data pulled from UniProt for body enrichment. */
interface UniProtData {
  desc?: string;
  organism?: string;
  geneName?: string;
  length?: number;
  functionText?: string;
  subcellularLocations?: string[];
  diseases?: string[];
  subunit?: string;
}

/**
 * Fetch protein name, organism and deep annotation fields from UniProt.
 * Called unconditionally — the deep fields (function, disease, subunit, …)
 * are only available here, never from the AlphaFold prediction API.
 */
async function fetchUniProtData(id: string): Promise<UniProtData> {
  try {
    const resp = await fetch(
      `https://rest.uniprot.org/uniprotkb/${id}.json?fields=protein_name,organism_name,gene_names,length,cc_function,cc_subcellular_location,cc_disease,cc_subunit`,
      { cf: { cacheTtl: 86400, cacheEverything: true }, headers: { accept: 'application/json' } }
    );
    if (!resp.ok) return {};
    const data = (await resp.json()) as UniProtResponse;

    const desc =
      data.proteinDescription?.recommendedName?.fullName?.value ??
      data.proteinDescription?.submissionNames?.[0]?.fullName?.value;
    const organism = data.organism?.scientificName;
    const geneName = data.genes?.[0]?.geneName?.value;
    const length = data.sequence?.length;

    let functionText: string | undefined;
    let subunit: string | undefined;
    const subcellularLocations: string[] = [];
    const diseases: string[] = [];

    for (const c of data.comments ?? []) {
      switch (c.commentType) {
        case 'FUNCTION':
          functionText = functionText ?? c.texts?.[0]?.value;
          break;
        case 'SUBUNIT':
          subunit = subunit ?? c.texts?.[0]?.value;
          break;
        case 'SUBCELLULAR LOCATION':
          for (const loc of c.subcellularLocations ?? []) {
            const v = loc.location?.value;
            if (v) subcellularLocations.push(v);
          }
          break;
        case 'DISEASE':
          if (c.disease?.diseaseId) {
            diseases.push(
              c.disease.acronym ? `${c.disease.diseaseId} (${c.disease.acronym})` : c.disease.diseaseId
            );
          }
          break;
      }
    }

    return {
      desc,
      organism,
      geneName,
      length,
      functionText,
      subunit,
      subcellularLocations: subcellularLocations.length ? subcellularLocations : undefined,
      diseases: diseases.length ? diseases : undefined,
    };
  } catch {
    return {};
  }
}

function buildAfBodyHtml(id: string, data: UniProtData): string {
  const { desc, organism, geneName, length, functionText, subcellularLocations, diseases, subunit } =
    data;

  const heading = desc ? `${id}: ${escapeHtml(clean(desc, 120))}` : `AlphaFold Prediction ${id}`;

  let lead: string;
  if (desc) {
    const genePart = geneName ? ` (${escapeHtml(clean(geneName, 40))})` : '';
    const lenPart = length ? ` is a ${length}-residue protein` : ' is a protein';
    const orgPart = organism ? ` from ${escapeHtml(clean(organism, 80))}` : '';
    lead = `${escapeHtml(clean(desc, 120))}${genePart}${lenPart}${orgPart}. UniProt accession: ${id}.`;
  } else {
    lead = `AlphaFold structure prediction for UniProt entry ${id}.`;
  }

  const sections: string[] = [];
  if (functionText) {
    sections.push(`<h2>Function</h2>\n  <p>${escapeHtml(clean(functionText, 600))}</p>`);
  }
  if (subcellularLocations?.length) {
    sections.push(
      `<h2>Subcellular location</h2>\n  <p>${escapeHtml(clean(subcellularLocations.join(', '), 300))}</p>`
    );
  }
  if (diseases?.length) {
    sections.push(
      `<h2>Disease associations</h2>\n  <p>${escapeHtml(clean(diseases.slice(0, 3).join('; '), 300))}</p>`
    );
  }
  if (subunit) {
    sections.push(`<h2>Subunit structure</h2>\n  <p>${escapeHtml(clean(subunit, 400))}</p>`);
  }

  const sectionsHtml = sections.length ? `\n  ${sections.join('\n  ')}` : '';

  return `<article class="seo-fallback">
  <h1>${heading}</h1>
  <p class="lead">${lead}</p>${sectionsHtml}
  <p>${BOILERPLATE}</p>
  <p><a href="https://alphafold.ebi.ac.uk/entry/${id}">Source: AlphaFold</a> · <a href="https://www.uniprot.org/uniprotkb/${id}">UniProt ${id}</a></p>
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

async function fetchAlphaFoldEntry(id: string): Promise<{ desc?: string; organism?: string }> {
  try {
    const resp = await fetch(`https://alphafold.ebi.ac.uk/api/prediction/${id}`, {
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
    if (!resp.ok) return {};
    const data = (await resp.json()) as AlphaFoldEntry[] | AlphaFoldEntry;
    const entry = Array.isArray(data) ? data[0] : data;
    return { desc: entry?.uniprotDescription, organism: entry?.organismScientificName };
  } catch {
    return {};
  }
}

async function fetchAfMeta(id: string, request: Request): Promise<LandingMeta> {
  const upper = id.toUpperCase();
  const canonicalUrl = `${new URL(request.url).origin}/af/${upper}`;
  const ogImageUrl = `${new URL(request.url).origin}/api/og/af/${upper}.png`;

  const af = await fetchAlphaFoldEntry(upper);
  const up = await fetchUniProtData(upper);

  // AlphaFold's prediction API often omits uniprotDescription in practice, so
  // UniProt fills the name/organism. The deep annotation fields only ever come
  // from UniProt, so it must run on every request.
  const desc = af.desc ?? up.desc;
  const organism = af.organism ?? up.organism;

  let title = `AF-${upper} — MolViewer`;
  let description = `View AlphaFold prediction for UniProt ${upper} in an interactive 3D viewer.`;
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
    bodyHtml: buildAfBodyHtml(upper, { ...up, desc, organism }),
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
