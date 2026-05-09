/**
 * GET /sitemap.xml — sitemap with seed PDB and AlphaFold landing pages.
 * Submit to Google Search Console after deploy.
 */
import popular from '../data/popularPdbs.json';

interface PopularData {
  pdbs: string[];
}

const SEED_AF_IDS = [
  'P05067', 'P06213', 'P0DTD1', 'P38398', 'P53350',
  'P68871', 'P69905', 'P00533', 'Q9Y6K9', 'P31749',
];

const CACHE_TTL = 60 * 60 * 24; // 1 day

export const onRequestGet: PagesFunction = async ({ request }) => {
  const origin = new URL(request.url).origin;
  const data = popular as PopularData;
  const lastmod = new Date().toISOString().slice(0, 10);

  const urls: string[] = [origin + '/'];
  for (const id of data.pdbs) {
    urls.push(`${origin}/pdb/${id.toUpperCase()}`);
  }
  for (const id of SEED_AF_IDS) {
    urls.push(`${origin}/af/${id.toUpperCase()}`);
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${u}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n') +
    `\n</urlset>\n`;

  return new Response(xml, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_TTL}`,
    },
  });
};
