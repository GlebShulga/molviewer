/**
 * What the link check needs to know about the site, without rendering it:
 * the static page paths the generator writes and the files in public/.
 * Shared by the build (generate.ts) and the tests that check links in pages
 * rendered at request time (PDB, AlphaFold, share and CID pages).
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pages as contentPages } from '../content/pages';
import { COLLECTIONS, collectionHref } from '../collections';
import type { Compound } from '../dataTypes';
import compoundData from '../../data/compounds.json';
import type { LinkCheckInput } from './linkCheck';

const COMPOUNDS = (compoundData as { compounds: Compound[] }).compounds;

/** Every page the generator writes as a static file. generate.ts checks it renders exactly these. */
export function staticPaths(): Set<string> {
  return new Set([
    ...contentPages.map((p) => p.path),
    '/learn',
    '/collections',
    ...COLLECTIONS.map((c) => collectionHref(c)),
    '/compounds',
    ...COMPOUNDS.map((c) => `/compound/${c.slug}`),
  ]);
}

/** Files in public/, root-relative (`/favicon.svg`). */
export function listPublicFiles(publicDir: string): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.add(`/${relative(publicDir, full).split('\\').join('/')}`);
    }
  };
  walk(publicDir);
  return out;
}

export function linkCheckInput(publicDir: string): LinkCheckInput {
  return {
    staticPaths: staticPaths(),
    compoundSlugs: new Set(COMPOUNDS.map((c) => c.slug)),
    publicFiles: listPublicFiles(publicDir),
  };
}
