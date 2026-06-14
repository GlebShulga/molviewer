/**
 * GET /pdb/:id — landing page for an RCSB PDB entry.
 * Fetches structure metadata from data.rcsb.org and injects per-entry
 * meta tags into the SPA's index.html. The SPA then loads the structure
 * via the existing pathname routing.
 */
import { applyLandingMeta, clean, escapeHtml, type LandingMeta } from '../_shared/landingMeta';

const BOILERPLATE = `View this PDB structure interactively in 3D with MolViewer. Rotate, zoom, measure distances and angles, and explore secondary-structure annotations directly in your browser without installing any software.`;

const NOSCRIPT = `JavaScript is required to view the interactive 3D structure. Please enable JavaScript or visit the RCSB link above.`;

const PDB_ID_RE = /^[A-Za-z0-9]{4}$/;

interface RcsbEntry {
  struct?: { title?: string; pdbx_descriptor?: string };
  rcsb_primary_citation?: {
    title?: string;
    pdbx_database_id_pub_med?: number;
    journal_abbrev?: string;
    year?: number;
    rcsb_authors?: string[];
  };
  exptl?: Array<{ method?: string }>;
  rcsb_entry_info?: {
    resolution_combined?: number[];
    deposited_atom_count?: number;
    polymer_entity_count_protein?: number;
    polymer_entity_count_nucleic_acid?: number;
    molecular_weight?: number;
    structure_determination_methodology?: string;
  };
  rcsb_accession_info?: { initial_release_date?: string };
}

/** Structure-level data pulled from the RCSB entry response for body enrichment. */
interface PdbData {
  structTitle?: string;
  method?: string;
  resolution?: number;
  releaseYear?: string;
  atomCount?: number;
  proteinChains?: number;
  nucleicChains?: number;
  molecularWeight?: number;
  citationTitle?: string;
  citationAuthors?: string[];
  citationJournal?: string;
  citationYear?: number;
  pubmedId?: number;
}

function buildPdbBodyHtml(id: string, data: PdbData): string {
  const {
    structTitle,
    method,
    resolution,
    releaseYear,
    atomCount,
    proteinChains,
    nucleicChains,
    molecularWeight,
    citationTitle,
    citationAuthors,
    citationJournal,
    citationYear,
    pubmedId,
  } = data;

  const heading = structTitle ? `${id}: ${escapeHtml(clean(structTitle, 120))}` : `PDB Entry ${id}`;

  let lead: string;
  if (structTitle) {
    let s = `${escapeHtml(clean(structTitle, 300))}.`;
    if (method) {
      s += ` Determined by ${escapeHtml(clean(method.toLowerCase(), 60))}`;
      if (resolution) s += ` at ${resolution} Å resolution`;
      s += '.';
    }
    if (releaseYear) s += ` Released ${escapeHtml(releaseYear)}.`;
    lead = s;
  } else {
    lead = `Protein Data Bank entry ${id}.`;
  }

  const sections: string[] = [];

  if (atomCount || molecularWeight) {
    const parts: string[] = [];
    if (atomCount) {
      let comp = `This structure contains ${atomCount.toLocaleString('en-US')} atoms`;
      const chainBits: string[] = [];
      if (proteinChains) chainBits.push(`${proteinChains} protein chain${proteinChains === 1 ? '' : 's'}`);
      if (nucleicChains)
        chainBits.push(`${nucleicChains} nucleic acid chain${nucleicChains === 1 ? '' : 's'}`);
      if (chainBits.length) comp += ` across ${chainBits.join(' and ')}`;
      comp += '.';
      parts.push(comp);
    }
    if (molecularWeight) parts.push(`Molecular weight: ${molecularWeight} kDa.`);
    if (parts.length) sections.push(`<h2>Composition</h2>\n  <p>${parts.join(' ')}</p>`);
  }

  if (citationTitle) {
    let cite = `${escapeHtml(clean(citationTitle, 300))}.`;
    if (citationAuthors?.length) {
      const authors = citationAuthors
        .slice(0, 3)
        .map((a) => escapeHtml(clean(a, 60)))
        .join(', ');
      cite += ` ${authors}${citationAuthors.length > 3 ? ' et al.' : ''}`;
      if (citationJournal) cite += `,`;
    }
    if (citationJournal) cite += ` ${escapeHtml(clean(citationJournal, 80))}`;
    if (citationYear) cite += ` (${citationYear})`;
    cite += '.';
    if (pubmedId) cite += ` <a href="https://pubmed.ncbi.nlm.nih.gov/${pubmedId}/">PubMed</a>`;
    sections.push(`<h2>Primary citation</h2>\n  <p>${cite}</p>`);
  }

  const sectionsHtml = sections.length ? `\n  ${sections.join('\n  ')}` : '';

  return `<article class="seo-fallback">
  <h1>${heading}</h1>
  <p class="lead">${lead}</p>${sectionsHtml}
  <p>${BOILERPLATE}</p>
  <p><a href="https://www.rcsb.org/structure/${id}">Source: RCSB Protein Data Bank</a></p>
  <noscript>${NOSCRIPT}</noscript>
</article>`;
}

async function fetchPdbMeta(id: string, request: Request): Promise<LandingMeta> {
  const upper = id.toUpperCase();
  const canonicalUrl = `${new URL(request.url).origin}/pdb/${upper}`;
  const ogImageUrl = `${new URL(request.url).origin}/api/og/pdb/${upper}.png`;

  let title = `${upper} — MolViewer`;
  let description = `View PDB structure ${upper} in an interactive 3D viewer. Explore atoms, secondary structure, and surfaces.`;
  let pdbData: PdbData = {};

  try {
    const resp = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${upper}`, {
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
    if (resp.ok) {
      const data = (await resp.json()) as RcsbEntry;
      const structTitle = data.struct?.title;
      pdbData = {
        structTitle,
        method: data.exptl?.[0]?.method,
        resolution: data.rcsb_entry_info?.resolution_combined?.[0],
        releaseYear: data.rcsb_accession_info?.initial_release_date?.slice(0, 4),
        atomCount: data.rcsb_entry_info?.deposited_atom_count,
        proteinChains: data.rcsb_entry_info?.polymer_entity_count_protein,
        nucleicChains: data.rcsb_entry_info?.polymer_entity_count_nucleic_acid,
        molecularWeight: data.rcsb_entry_info?.molecular_weight,
        citationTitle: data.rcsb_primary_citation?.title,
        citationAuthors: data.rcsb_primary_citation?.rcsb_authors,
        citationJournal: data.rcsb_primary_citation?.journal_abbrev,
        citationYear: data.rcsb_primary_citation?.year,
        pubmedId: data.rcsb_primary_citation?.pdbx_database_id_pub_med,
      };
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
    bodyHtml: buildPdbBodyHtml(upper, pdbData),
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
