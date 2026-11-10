/**
 * Fails the build when a New Relic key, or the New Relic Log API host, is in
 * the built site (dist/). Runs at the end of `pnpm build`, so it runs in the
 * Cloudflare Pages build too. Only there would it catch the way a key leaked
 * on 2026-11-10: code reading a VITE_ variable whose value is set in the Pages
 * variables. In CI those variables are empty and the bundle looks clean.
 *
 * Reads text files only: dist/ also holds ~1,550 PNG social cards, where a
 * key pattern could match binary data by chance. Prints the file and the
 * pattern's name, never the match.
 *
 * Usage: tsx scripts/check-bundle-secrets.ts [dir]   (default: dist)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html', '.json', '.txt', '.xml', '.svg', '.map']);

/**
 * The license-key patterns are plain letters and digits, so inlined base64
 * data (MoleculeScene-*.js, widget/v1/viewer.js) could match by chance and
 * fail the deploy with no way to override. A key in a bundle sits in a
 * string, between quotes, so both patterns require a non-alphanumeric
 * character (or the file's start or end) on each side.
 */
export const PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'license key (…NRAL)', re: /(?<![0-9a-zA-Z])[0-9a-zA-Z]{36}NRAL(?![0-9a-zA-Z])/ },
  { name: 'EU license key (eu01xx…)', re: /(?<![0-9a-zA-Z])eu01xx[0-9a-zA-Z]{20,}(?![0-9a-zA-Z])/ },
  { name: 'browser key (NRJS-…)', re: /NRJS-[0-9a-f]{19}/ },
  { name: 'user key (NRAK-…)', re: /NRAK-[0-9A-Z]{20,}/ },
  // The browser must never post to New Relic directly; /api/log does.
  { name: 'New Relic Log API host', re: /log-api\.eu\.newrelic\.com/ },
];

function* textFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* textFiles(path);
    else if (TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) yield path;
  }
}

/** Each text file under `dir` with the names of the patterns it matches. */
export function findSecrets(dir: string): { file: string; patterns: string[] }[] {
  const found: { file: string; patterns: string[] }[] = [];
  for (const file of textFiles(dir)) {
    const text = readFileSync(file, 'utf8');
    const patterns = PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
    if (patterns.length) found.push({ file: relative(dir, file), patterns });
  }
  return found;
}

if (process.argv[1] && /check-bundle-secrets\.ts$/.test(process.argv[1])) {
  const dir = process.argv[2] ?? 'dist';
  const found = findSecrets(dir);
  if (found.length) {
    for (const f of found) console.error(`check-bundle-secrets: ${f.file}: ${f.patterns.join(', ')}`);
    console.error(`check-bundle-secrets: New Relic key or host found in ${dir}/. Is a VITE_ variable holding a key again?`);
    process.exit(1);
  }
  console.log(`check-bundle-secrets: ${dir}/ is clean`);
}
