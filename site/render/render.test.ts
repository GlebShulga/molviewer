// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyShellMeta, PAGE_INFO_EMPTY, pageInfoBlock } from './shell';
import { renderPdbLanding, shortName } from './pdbPage';
import { renderAfLanding } from './afPage';
import { renderShareLanding, UNAVAILABLE } from './sharePage';
import { methodNoun } from './format';
import { pdbCardSpec } from '../build/ogCards';
import { fetchPdbDetails } from '../upstream/pdb';
import { fetchAfDetails } from '../upstream/af';
import { fixtureFetch } from '../upstream/__fixtures__/fixtureFetch';
import { SHELL_MARKER } from '../routing';
import { LANDING_DATA_ELEMENT_ID } from '../landingData';
import { renderFooter, CHATGPT_APP_URL } from '../nav';
import { FEATURED_COLLECTIONS } from '../collections';

const ORIGIN = 'https://molviewer.bio';
// The shell as the build produces it: home content between the page-info markers,
// including nested <section> elements (which once broke the replacement).
const SHELL = readFileSync(resolve(__dirname, '../../index.html'), 'utf8').replace(
  PAGE_INFO_EMPTY,
  pageInfoBlock('<div><h1>Home</h1><section class="topic">A</section><section class="topic">B</section></div>')
);

/** Every schema.org Dataset anywhere in the JSON-LD, including nested ones. */
function findDatasets(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) node.forEach((n) => findDatasets(n, out));
  else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (obj['@type'] === 'Dataset') out.push(obj);
    Object.values(obj).forEach((v) => findDatasets(v, out));
  }
  return out;
}

// Search Console flags a Dataset without description (critical), creator or license.
function expectCompleteDatasets(jsonLd: unknown) {
  const datasets = findDatasets(jsonLd);
  expect(datasets.length).toBeGreaterThan(0);
  for (const ds of datasets) {
    expect(ds.description).toBeTruthy();
    expect(ds.creator).toBeTruthy();
    expect(ds.license).toBeTruthy();
  }
}

function between(html: string, start: string, end: string): string {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a);
  return a >= 0 && b > a ? html.slice(a, b) : '';
}

describe('applyShellMeta', () => {
  it('rewrites head tags, replaces the whole page-info block and embeds landing data', () => {
    const html = applyShellMeta(SHELL, {
      title: 'T & <x>',
      description: 'D "quoted"',
      canonicalUrl: `${ORIGIN}/pdb/1CRN`,
      ogImageUrl: `${ORIGIN}/og/pdb/1CRN.png`,
      jsonLd: { '@type': 'WebPage', name: '</script><b>' },
      pageInfoHtml: '<p>Landing</p>',
      landingData: { kind: 'pdb', id: '1CRN', title: 'Crambin', facts: [], links: [] },
    });
    expect(html).not.toContain(SHELL_MARKER);
    expect(html).toContain('<title>T &amp; &lt;x&gt;</title>');
    expect(html).toContain('<meta name="description" content="D &quot;quoted&quot;"');
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/pdb/1CRN"`);
    expect(html).toContain(`<meta property="og:image" content="${ORIGIN}/og/pdb/1CRN.png">`);
    expect(html).toContain(`<meta name="twitter:title" content="T &amp; &lt;x&gt;">`);
    // JSON-LD can't close its <script> early.
    expect(html).not.toContain('</script><b>');
    const pageInfo = between(html, '<!--page-info:start-->', '<!--page-info:end-->');
    expect(pageInfo).toContain('<p>Landing</p>');
    expect(pageInfo).not.toContain('Home');
    expect(html).not.toContain('class="topic"');
    expect(html).toContain(`id="${LANDING_DATA_ELEMENT_ID}"`);
  });

  it('can drop the canonical link and hide page-info for embeds', () => {
    const html = applyShellMeta(SHELL, {
      title: 't',
      description: 'd',
      canonicalUrl: null,
      robots: 'noindex, follow',
      hidePageInfo: true,
    });
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('id="page-info"');
    expect(html).toContain('<meta name="robots" content="noindex, follow">');
    expect(html).toContain('<script type="module"');
  });
});

describe('shortName', () => {
  const name = (title: string) => shortName({ id: 'XXXX', title, entities: [] });
  it('strips method and resolution boilerplate', () => {
    expect(name('CRYSTALLOGRAPHIC REFINEMENT AND STRUCTURE OF DNASE I AT 2 ANGSTROMS RESOLUTION')).toBe('DNase I');
    expect(name('THE CRYSTAL STRUCTURE OF HUMAN DEOXYHAEMOGLOBIN AT 1.74 ANGSTROMS RESOLUTION')).toBe('Human deoxyhaemoglobin');
    expect(name('Structure of the SARS-CoV-2 spike glycoprotein (closed state)')).toBe('SARS-CoV-2 spike glycoprotein');
    expect(name('The crystal structure of COVID-19 main protease in complex with an inhibitor N3')).toBe('COVID-19 main protease');
  });
});

describe('renderPdbLanding (3DNI fixtures)', () => {
  it('renders the target title, secondary structure and landing data', async () => {
    const { fetchImpl } = fixtureFetch();
    const { status, meta } = renderPdbLanding('3DNI', await fetchPdbDetails('3DNI', { fetchImpl }), ORIGIN);
    expect(status).toBe(200);
    expect(meta.title).toBe('3DNI – DNase I crystal structure (2.0 Å) · 3D viewer | MolViewer');
    expect(meta.description.length).toBeLessThanOrEqual(165);
    expect(meta.canonicalUrl).toBe(`${ORIGIN}/pdb/3DNI`);
    expect(meta.pageInfoHtml).toContain('<h1>3DNI: DNase I</h1>');
    expect(meta.pageInfoHtml).toContain('id="secondary-structure"');
    expect(meta.pageInfoHtml).toMatch(/α-helix<\/td><td>\d+-\d+<\/td>/);
    expect(meta.pageInfoHtml).toContain('href="/pdb/');
    expect(meta.landingData?.secondaryStructure?.[0].helices.length).toBeGreaterThan(0);
    expect(JSON.stringify(meta.jsonLd)).toContain('"@type":"Dataset"');
    expectCompleteDatasets(meta.jsonLd);
    expect(meta.extraHead).toContain('application/json+oembed');
  });

  it('404s unknown entries without a canonical', async () => {
    const { fetchImpl } = fixtureFetch();
    const { status, meta } = renderPdbLanding('ZZZZ', await fetchPdbDetails('ZZZZ', { fetchImpl }), ORIGIN);
    expect(status).toBe(404);
    expect(meta.robots).toBe('noindex, follow');
    expect(meta.canonicalUrl).toBeNull();
  });

  it('keeps 200 with defaults when RCSB is down', async () => {
    const { fetchImpl } = fixtureFetch({ 'rcsb-core-3DNI.json': { status: 503 } });
    const { status, meta } = renderPdbLanding('3DNI', await fetchPdbDetails('3DNI', { fetchImpl }), ORIGIN);
    expect(status).toBe(200);
    expect(meta.canonicalUrl).toBe(`${ORIGIN}/pdb/3DNI`);
  });
});

describe('renderAfLanding', () => {
  it('renders pLDDT bands and experimental structures', async () => {
    const { fetchImpl } = fixtureFetch();
    const { status, meta } = renderAfLanding('P69905', await fetchAfDetails('P69905', { fetchImpl }), ORIGIN);
    expect(status).toBe(200);
    expect(meta.title).toMatch(/^P69905 – Hemoglobin subunit alpha/);
    expect(meta.pageInfoHtml).toContain('id="confidence"');
    expect(meta.pageInfoHtml).toContain('href="/pdb/');
    expect(meta.ogImageUrl).toBe(`${ORIGIN}/og/af/P69905.png`);
    expectCompleteDatasets(meta.jsonLd);
  });

  it('404s accessions without an AlphaFold model', async () => {
    const { fetchImpl } = fixtureFetch();
    const { status } = renderAfLanding('Q9ZZZ8', await fetchAfDetails('Q9ZZZ8', { fetchImpl }), ORIGIN);
    expect(status).toBe(404);
  });
});

describe('renderShareLanding', () => {
  it('points single-structure shares at the landing page', () => {
    const { status, meta } = renderShareLanding('abcdefgh1234', { structures: [{ name: '4HHB', source: { type: 'rcsb', id: '4HHB' } }] }, ORIGIN);
    expect(status).toBe(200);
    expect(meta.canonicalUrl).toBe(`${ORIGIN}/pdb/4HHB`);
    expect(meta.robots).toBe('index, follow');
  });

  it('keeps multi-structure and local-file scenes out of the index', () => {
    const multi = renderShareLanding('abcdefgh1234', {
      structures: [
        { name: '4HHB', source: { type: 'rcsb', id: '4HHB' } },
        { name: 'P69905', source: { type: 'alphafold', id: 'P69905' } },
      ],
    }, ORIGIN);
    expect(multi.meta.canonicalUrl).toBeNull();
    expect(multi.meta.robots).toBe('noindex, follow');
    const local = renderShareLanding('abcdefgh1234', { structures: [{ name: 'mine', source: { type: 'inline' } }] }, ORIGIN);
    expect(local.meta.canonicalUrl).toBeNull();
    expect(local.meta.robots).toBe('noindex, follow');
  });

  it('404s unknown or expired shares', () => {
    const { status, meta } = renderShareLanding('abcdefgh1234', null, ORIGIN);
    expect(status).toBe(404);
    expect(meta.robots).toBe('noindex, follow');
  });
});

describe('citation punctuation', () => {
  it('never doubles full stops', async () => {
    const { fetchImpl } = fixtureFetch();
    const { meta } = renderPdbLanding('3DNI', await fetchPdbDetails('3DNI', { fetchImpl }), ORIGIN);
    const citation = between(meta.pageInfoHtml ?? '', 'id="citation"', '</p>');
    expect(citation).not.toMatch(/\.\./);
  });
});

describe('applyShellMeta with replacement patterns in upstream text', () => {
  it("inserts $&, $' and $` literally", () => {
    const nasty = "5'-nucleotidase $' $& $` $1";
    const html = applyShellMeta(SHELL, {
      title: nasty,
      description: nasty,
      canonicalUrl: `${ORIGIN}/compound/cid/1`,
      jsonLd: { name: nasty },
      extraHead: '<meta name="x" content="$\'">',
      landingData: { kind: 'compound', id: 'x', title: nasty, facts: [], links: [] },
    });
    expect(html).toContain(`<title>5&#39;-nucleotidase $&#39; $&amp; $\` $1</title>`);
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/<\/html>/g)).toHaveLength(1);
    expect(html).toContain('"name":"5\'-nucleotidase $\' $& $` $1"');
  });
});

describe('JSON-LD text', () => {
  it('uses plain text, not HTML entities', async () => {
    const { fetchImpl } = fixtureFetch();
    const result = await fetchPdbDetails('3DNI', { fetchImpl });
    if (result.status !== 'ok') throw new Error('fixture');
    result.data.title = "STRUCTURE OF 5'-NUCLEOTIDASE & FRIENDS";
    const { meta } = renderPdbLanding('3DNI', result, ORIGIN);
    const ld = JSON.stringify(meta.jsonLd);
    expect(ld).toContain("5'-nucleotidase & friends");
    expect(ld).not.toMatch(/&#39;|&amp;/);
    expect(meta.pageInfoHtml).toContain('5&#39;-nucleotidase &amp; friends');
  });
});

describe('AlphaFold links on PDB pages', () => {
  it('links to /af/ only when AlphaFold DB confirms a model', async () => {
    const missing = fixtureFetch(); // no AlphaFold fixture for P00639: the API answers 404
    const without = renderPdbLanding('3DNI', await fetchPdbDetails('3DNI', { fetchImpl: missing.fetchImpl }), ORIGIN);
    expect(without.meta.pageInfoHtml).not.toContain('href="/af/P00639"');
    expect(without.meta.pageInfoHtml).not.toContain('also has an AlphaFold model');
    expect(without.meta.pageInfoHtml).toContain('https://www.uniprot.org/uniprotkb/P00639');

    const present = fixtureFetch({ 'af-P00639.json': { status: 200, body: '[{"uniprotAccession":"P00639"}]' } });
    const withModel = renderPdbLanding('3DNI', await fetchPdbDetails('3DNI', { fetchImpl: present.fetchImpl }), ORIGIN);
    expect(withModel.meta.pageInfoHtml).toContain('href="/af/P00639"');
    expect(withModel.meta.pageInfoHtml).toContain('which also has an AlphaFold model');
  });
});

describe('renderShareLanding when the share store is unavailable', () => {
  it('renders a neutral 200 page instead of failing or claiming a 404', () => {
    const { status, meta } = renderShareLanding('abcdefgh1234', UNAVAILABLE, ORIGIN);
    expect(status).toBe(200);
    expect(meta.robots).toBe('noindex, follow');
    expect(meta.canonicalUrl).toBeNull();
  });
});

describe('methodNoun', () => {
  it('names each experimental method, and social cards use the same wording', () => {
    expect(methodNoun('X-RAY DIFFRACTION')).toBe('crystal structure');
    expect(methodNoun('ELECTRON MICROSCOPY')).toBe('cryo-EM structure');
    expect(methodNoun('ELECTRON CRYSTALLOGRAPHY')).toBe('electron crystallography structure');
    expect(methodNoun('SOLUTION NMR')).toBe('NMR structure');
    expect(methodNoun('FIBER DIFFRACTION')).toBe('structure');
    const card = pdbCardSpec({ id: '1XYZ', title: '', revised: '', method: 'ELECTRON CRYSTALLOGRAPHY' }, 'Aquaporin', []);
    expect(card.subtitle).toBe('Electron crystallography structure');
  });
});

describe('renderShareLanding with malformed stored shares', () => {
  it('never throws on shapes /api/share accepts but the app would not write', () => {
    for (const stored of [{}, { structures: {} }, { structures: [{ name: 5 }] }, { structures: [null, 'x'] }, { structures: [{ source: 'rcsb' }] }, [] as unknown]) {
      const { status, meta } = renderShareLanding('abcdefgh1234', stored, ORIGIN);
      expect(status).toBe(200);
      expect(meta.robots).toBe('noindex, follow');
    }
  });
});

describe('AlphaFold "no model" answers agree across pages', () => {
  it('treats 422 as not found on the landing page, like embeds and PDB links do', async () => {
    const { fetchImpl } = fixtureFetch({ 'af-P69905.json': { status: 422 } });
    const { status } = renderAfLanding('P69905', await fetchAfDetails('P69905', { fetchImpl }), ORIGIN);
    expect(status).toBe(404);
  });
});

describe('renderFooter', () => {
  const groups = (html: string) => [...html.matchAll(/<details open><summary><h2>([^<]+)<\/h2>/g)].map((m) => m[1]);

  it('ships four open groups with every featured collection in Topics', () => {
    const html = renderFooter(FEATURED_COLLECTIONS);
    expect(groups(html)).toEqual(['Viewers', 'Topics', 'Explore', 'Project']);
    for (const c of FEATURED_COLLECTIONS) expect(html).toContain(`href="/collections/${c.slug}"`);
    expect(FEATURED_COLLECTIONS).toHaveLength(8);
  });

  it('skips the Topics group rather than leaving an empty column', () => {
    expect(groups(renderFooter())).toEqual(['Viewers', 'Explore', 'Project']);
  });

  it('gives share and compound-CID pages their Topics column too', () => {
    const { meta } = renderShareLanding('abcdefgh1234', { structures: [] }, ORIGIN);
    expect(meta.pageInfoHtml).toContain('<h2>Topics</h2>');
  });

  it('links the ChatGPT app from Explore, not from Project', () => {
    const html = renderFooter(FEATURED_COLLECTIONS);
    const explore = html.slice(html.indexOf('<h2>Explore</h2>'), html.indexOf('<h2>Project</h2>'));
    expect(explore).toContain(CHATGPT_APP_URL);
    expect(html.slice(html.indexOf('<h2>Project</h2>'))).not.toContain(CHATGPT_APP_URL);
  });
});
