/**
 * Notify IndexNow (Bing, Yandex, Seznam, Naver...) about new or changed URLs
 * after a deploy. Google doesn't use IndexNow; submit the sitemap in Search
 * Console for Google.
 *
 * The key is the file public/<key>.txt (served at https://molviewer.bio/<key>.txt).
 *
 * Usage (after `pnpm build` and a deploy):
 *   pnpm exec tsx scripts/indexnow.ts                  # every URL in dist/sitemap-*.xml
 *   pnpm exec tsx scripts/indexnow.ts /pdb/3DNI /learn # just these paths
 *   pnpm exec tsx scripts/indexnow.ts --dry-run        # print what would be sent
 */
import { readdirSync, readFileSync } from 'node:fs';

const HOST = 'molviewer.bio';
const ORIGIN = `https://${HOST}`;
const BATCH = 10_000; // IndexNow's per-request limit

const keyFile = readdirSync('public').find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
if (!keyFile) {
  console.error('No IndexNow key file (public/<32 hex chars>.txt) found.');
  process.exit(1);
}
const key = keyFile.replace(/\.txt$/, '');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const paths = args.filter((a) => a.startsWith('/'));

let urls: string[];
if (paths.length) {
  urls = paths.map((p) => `${ORIGIN}${p}`);
} else {
  const sitemaps = readdirSync('dist').filter((f) => /^sitemap-.+\.xml$/.test(f));
  if (!sitemaps.length) {
    console.error('No dist/sitemap-*.xml found. Run `pnpm build` first.');
    process.exit(1);
  }
  urls = sitemaps.flatMap((f) => [...readFileSync(`dist/${f}`, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
}

console.log(`${urls.length} URL(s) to submit with key ${key}`);
if (dryRun) {
  console.log(urls.slice(0, 20).join('\n'), urls.length > 20 ? `\n... and ${urls.length - 20} more` : '');
  process.exit(0);
}

for (let i = 0; i < urls.length; i += BATCH) {
  const urlList = urls.slice(i, i + BATCH);
  const resp = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key, keyLocation: `${ORIGIN}/${key}.txt`, urlList }),
  });
  // 200 = accepted, 202 = accepted and the key is pending verification.
  console.log(`batch ${i / BATCH + 1}: HTTP ${resp.status} ${resp.statusText}`);
  if (resp.status >= 400) {
    console.error(await resp.text());
    process.exit(1);
  }
}

export {};
