/**
 * Capture the app screenshots shown on the tool pages (plan 2.1) into
 * public/screenshots/, and write site/content/screenshots.ts.
 *
 * Usage: start the dev server (pnpm dev, port 3000), then
 *   pnpm exec tsx scripts/capture-screenshots.ts [baseUrl]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium, type Page } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const WIDTH = 1280;
const HEIGHT = 720;

interface Shot {
  /** Tool page that shows the screenshot. */
  page: string;
  file: string;
  alt: string;
  /** App URL to open, or a sample file to upload. */
  url?: string;
  upload?: string;
}

const SHOTS: Shot[] = [
  { page: '/pdb-viewer', file: 'pdb-viewer.jpg', url: '/pdb/4HHB?repr=cartoon&color=chain', alt: 'Hemoglobin (PDB 4HHB) as a cartoon colored by chain in the MolViewer online PDB viewer' },
  { page: '/alphafold-viewer', file: 'alphafold-viewer.jpg', url: '/af/P04637?repr=cartoon&color=bfactor', alt: 'AlphaFold model of p53 (P04637) colored by pLDDT confidence' },
  { page: '/mmcif-viewer', file: 'mmcif-viewer.jpg', url: '/pdb/6VXX?repr=cartoon&color=chain', alt: 'SARS-CoV-2 spike glycoprotein (6VXX) loaded from mmCIF, colored by chain' },
  { page: '/sdf-viewer', file: 'sdf-viewer.jpg', upload: 'public/sample-molecules/aspirin.sdf', alt: 'Aspirin opened from an SDF file, shown as ball-and-stick' },
  { page: '/xyz-viewer', file: 'xyz-viewer.jpg', url: '/compound/caffeine', alt: 'Caffeine in 3D with CPK colors' },
  { page: '/pymol-online-alternative', file: 'pymol-online-alternative.jpg', url: '/pdb/1HSG?repr=cartoon&color=secondaryStructure', alt: 'HIV-1 protease with a bound inhibitor (1HSG), cartoon colored by secondary structure' },
  { page: '/compare', file: 'compare.jpg', url: '/pdb/6LU7?repr=cartoon&color=rainbow', alt: 'SARS-CoV-2 main protease (6LU7) in rainbow coloring' },
];

async function waitForRender(page: Page) {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __mol3d_ready?: boolean };
      const reset = document.querySelector('button[title*="Reset View"]');
      return w.__mol3d_ready === true && reset && !reset.hasAttribute('disabled');
    },
    undefined,
    { timeout: 90_000 }
  );
  // Let the camera settle and ambient occlusion converge.
  await page.waitForTimeout(2500);
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  localStorage.setItem('mol3d-onboarding-completed', 'true');
  localStorage.setItem('mol3d-theme', 'dark');
});

mkdirSync('public/screenshots', { recursive: true });
const entries: string[] = [];

for (const shot of SHOTS) {
  const page = await context.newPage();
  if (shot.upload) {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="file"]').setInputFiles(shot.upload);
  } else {
    await page.goto(`${BASE}${shot.url}`, { waitUntil: 'domcontentloaded' });
  }
  await waitForRender(page);
  await page.screenshot({ path: `public/screenshots/${shot.file}`, type: 'jpeg', quality: 82 });
  await page.close();
  entries.push(
    `  '${shot.page}': { src: '/screenshots/${shot.file}', alt: ${JSON.stringify(shot.alt)}, width: ${WIDTH}, height: ${HEIGHT} },`
  );
  console.log(`captured ${shot.file}`);
}

await browser.close();

writeFileSync(
  'site/content/screenshots.ts',
  `/**
 * Screenshots shown on the tool pages, captured from the running app by
 * scripts/capture-screenshots.ts into public/screenshots/.
 */
import type { ContentPage } from './types';

export const SCREENSHOTS: Record<string, NonNullable<ContentPage['screenshot']>> = {
${entries.join('\n')}
};
`
);
console.log('wrote site/content/screenshots.ts');
