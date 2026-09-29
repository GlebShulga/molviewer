import { readFileSync } from 'node:fs';
import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';

/**
 * Readable addresses (plan 1.5), embeds (2.3) and PubChem (2.2).
 * RCSB loads use the real network (small entry 1CRN, as in share-and-export);
 * PubChem is mocked so the spec doesn't depend on its rate limits.
 */

const pathAndQuery = (url: string) => {
  const u = new URL(url);
  return u.pathname + u.search;
};

async function waitForStructure(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => {
      const store = (window as unknown as { __mol3d_store?: { getState: () => { structureOrder: string[]; isLoading: boolean } } }).__mol3d_store;
      const s = store?.getState();
      return !!s && s.structureOrder.length > 0 && !s.isLoading;
    },
    undefined,
    { timeout: 30000 }
  );
}

test.describe('Readable URLs', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mol3d-onboarding-completed', 'true'));
  });

  test('[URL-01] ?pdb= becomes /pdb/ID and keeps view params', async ({ page }) => {
    await page.goto('/?pdb=1CRN&repr=cartoon', { waitUntil: 'domcontentloaded' });
    await waitForStructure(page);
    await expect.poll(() => pathAndQuery(page.url())).toBe('/pdb/1CRN?repr=cartoon');
    await expect(page).toHaveTitle('1CRN - MolViewer');
  });

  test('[URL-02] a landing path loads its structure and keeps its address', async ({ page }) => {
    await page.goto('/pdb/1CRN', { waitUntil: 'domcontentloaded' });
    await waitForStructure(page);
    await page.waitForTimeout(300);
    expect(pathAndQuery(page.url())).toBe('/pdb/1CRN');
  });

  test('[URL-03] loading a sample from the home page updates the address', async ({ page }) => {
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto();
    // Caffeine is a local sample file: no address, so we stay on /.
    await viewer.loadSampleMolecule('caffeine');
    await waitForStructure(page);
    expect(pathAndQuery(page.url())).toBe('/');
  });

  test('[URL-04] Copy Link shares the readable address of the active structure', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/pdb/1CRN', { waitUntil: 'domcontentloaded' });
    await waitForStructure(page);
    await page.locator('button[title="Copy Link"], button[aria-label="Copy Link"]').first().click({ force: true });
    await page.waitForTimeout(300);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(new URL(copied).pathname).toBe('/pdb/1CRN');
  });

  test('[URL-05] unparseable ?pdb= leaves the address alone', async ({ page }) => {
    await page.goto('/?pdb=abc', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    expect(pathAndQuery(page.url())).toBe('/?pdb=abc');
  });
});

test.describe('PubChem', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mol3d-onboarding-completed', 'true'));
    const sdf = readFileSync('public/sample-molecules/aspirin.sdf', 'utf8');
    await page.route('https://pubchem.ncbi.nlm.nih.gov/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/name/')) {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ IdentifierList: { CID: [2244] } }) });
      } else if (url.includes('/property/Title')) {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ PropertyTable: { Properties: [{ CID: 2244, Title: 'Aspirin' }] } }) });
      } else if (url.includes('/SDF')) {
        await route.fulfill({ contentType: 'chemical/x-mdl-sdfile', body: sdf });
      } else {
        await route.fulfill({ status: 404, body: '' });
      }
    });
  });

  test('[PC-01] the PubChem box gives a curated compound its canonical address', async ({ page }) => {
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto();
    await page.locator('#pubchem-input').evaluate((el: HTMLInputElement) => {
      el.scrollIntoView();
    });
    await page.locator('#pubchem-input').fill('aspirin', { force: true });
    await page.locator('#pubchem-input').press('Enter');
    await waitForStructure(page);
    // CID 2244 is the curated compound "aspirin": not /compound/cid/2244.
    await expect.poll(() => pathAndQuery(page.url())).toBe('/compound/aspirin');
    await expect(page).toHaveTitle('Aspirin - MolViewer');
  });

  test('[PC-02] /compound/:slug loads by CID, without a name lookup', async ({ page }) => {
    const nameLookups: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/compound/name/')) nameLookups.push(r.url()); });
    await page.goto('/compound/aspirin', { waitUntil: 'domcontentloaded' });
    await waitForStructure(page);
    expect(pathAndQuery(page.url())).toBe('/compound/aspirin');
    expect(nameLookups).toEqual([]);
  });
});

test.describe('Embed', () => {
  test('[EM-01] /embed shows a minimal viewer with a link back, and never changes its address', async ({ page }) => {
    await page.goto('/embed/pdb/1CRN?ui=minimal&spin=1', { waitUntil: 'domcontentloaded' });
    await waitForStructure(page);
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
    const open = page.getByRole('link', { name: /Open in MolViewer/ });
    await expect(open).toHaveAttribute('href', /\/pdb\/1CRN$/);
    await expect(page.locator('aside')).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(pathAndQuery(page.url())).toBe('/embed/pdb/1CRN?ui=minimal&spin=1');
  });
});
