/**
 * Build-time check that every internal link in generated HTML points at a
 * route that exists, so a renamed collection or compound can't ship as a
 * 404. PDB and AlphaFold IDs are checked for shape only: the curated lists
 * are validated against the APIs by scripts/validate-ids.ts.
 */
import { parseRoute, structurePath } from '../routes';

export interface LinkCheckInput {
  /** Pages generated as static files, e.g. `/pdb-viewer`, `/collections/enzymes`. */
  staticPaths: Set<string>;
  compoundSlugs: Set<string>;
  /** Files in public/ (root-relative), e.g. `/favicon.svg`. */
  publicFiles: Set<string>;
}

/**
 * Routes served by Functions (site/routes.ts). Links must use the canonical
 * form (/pdb/4HHB, not /pdb/4hhb), and compound slugs must be curated.
 */
function isDynamicRoute(path: string, compoundSlugs: Set<string>): boolean {
  const route = parseRoute(path);
  if (route.page === 'home' || route.page === 'share') return true;
  if (route.page !== 'structure') return false;
  const canonical = (route.embed ? '/embed' : '') + structurePath(route.structure);
  if (canonical !== path) return false;
  return route.structure.kind !== 'compound' || compoundSlugs.has(route.structure.slug);
}

export function findBrokenLinks(pages: { path: string; html: string }[], input: LinkCheckInput): string[] {
  const broken: string[] = [];
  for (const page of pages) {
    for (const match of page.html.matchAll(/href="(\/[^"#]*)(#[^"]*)?"/g)) {
      const raw = match[1].replace(/&amp;/g, '&');
      const path = raw.split('?')[0].replace(/\/$/, '') || '/';
      if (path.startsWith('/assets/')) continue;
      if (input.staticPaths.has(path) || input.publicFiles.has(path)) continue;
      if (isDynamicRoute(path, input.compoundSlugs)) continue;
      broken.push(`${page.path} -> ${raw}`);
    }
  }
  return [...new Set(broken)];
}
