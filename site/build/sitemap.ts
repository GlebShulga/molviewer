/**
 * Sitemap index + per-type sitemaps, written as static files at build time
 * (no Function invocation per crawl). `lastmod` is only emitted when there's
 * a real date (RCSB revision, AlphaFold model date, page edit date).
 */
import { escapeHtml } from '../render/html';
import { SITE_ORIGIN } from '../nav';

export interface SitemapUrl {
  path: string;
  lastmod?: string;
}

export interface SitemapFile {
  name: string;
  urls: SitemapUrl[];
}

function urlset(urls: SitemapUrl[]): string {
  const body = urls
    .map((u) => `  <url><loc>${escapeHtml(`${SITE_ORIGIN}${u.path}`)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function sitemapIndex(files: SitemapFile[]): string {
  const body = files
    .map((f) => {
      const lastmod = f.urls.map((u) => u.lastmod).filter((d): d is string => !!d).sort().pop();
      return `  <sitemap><loc>${SITE_ORIGIN}/${f.name}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</sitemap>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

/** Returns filename -> contents, including `sitemap.xml` (the index). */
export function renderSitemaps(files: SitemapFile[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of files) out.set(f.name, urlset(f.urls));
  out.set('sitemap.xml', sitemapIndex(files));
  return out;
}
