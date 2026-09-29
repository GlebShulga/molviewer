/**
 * Vite plugin for the crawlable parts of the site:
 * - fills the home-page content placeholder in index.html (dev and build);
 * - after a production build, generates the static pages and sitemaps
 *   (site/build/generate.ts).
 */
import { resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { renderHomeContent } from './home';
import { generateSite } from './generate';
import { PAGE_INFO_EMPTY, pageInfoBlock } from '../render/shell';

export function sitePlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'molviewer-site',
    configResolved(resolved) {
      config = resolved;
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(PAGE_INFO_EMPTY, pageInfoBlock(renderHomeContent()));
      },
    },
    async closeBundle() {
      if (config.command !== 'build') return;
      const outDir = resolve(config.root, config.build.outDir);
      const cacheDir = resolve(config.root, 'node_modules/.cache/molviewer-site');
      const result = await generateSite(outDir, config.publicDir, cacheDir);
      config.logger.info(
        `molviewer-site: ${result.pages} static pages, ${result.compounds} compound pages, ${result.sitemapUrls} sitemap URLs, ` +
          `${result.ogRendered + result.ogCached} social cards (${result.ogRendered} rendered, ${result.ogCached} cached)`
      );
    },
  };
}
