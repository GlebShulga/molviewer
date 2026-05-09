import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';

/**
 * Smoke spec for the growth-feature flows:
 *  - PNG export with watermark (Feature 2)
 *  - Share link create + share-load via /s/:id (Feature 1)
 *
 * Uses route mocking for /api/share so the spec is hermetic — no live KV needed.
 */
test.describe('Share & Export', () => {
  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }) => {
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
    await moleculeViewer.loadSampleMolecule('caffeine');
  });

  test('[SX-01] toolbar export downloads a PNG', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await moleculeViewer.toolbar.exportButton.click({ force: true });
    await page.waitForTimeout(500);

    const download = await downloadPromise;
    expect(download).not.toBeNull();
    if (download) {
      expect(download.suggestedFilename()).toMatch(/\.png$/);
    }
  });

  test('[SX-02] Share Link button creates a link and copies it', async ({ page, context }) => {
    let capturedPayload: unknown = null;
    await page.route('**/api/share', async (route) => {
      capturedPayload = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'TEST12345678' }),
      });
    });

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const shareButton = page.getByRole('button', { name: /share link/i });
    await shareButton.click({ force: true });

    const urlInput = page.locator('input[readonly]').first();
    await expect(urlInput).toBeVisible({ timeout: 5000 });
    const value = await urlInput.inputValue();
    expect(value).toContain('/s/TEST12345678');

    expect(capturedPayload).toBeTruthy();
    const payload = capturedPayload as { schemaVersion: number; structures: Array<{ source: { type: string; id?: string } }> };
    expect(payload.schemaVersion).toBe(1);
    expect(payload.structures.length).toBeGreaterThan(0);
    expect(payload.structures[0].source.type).toBeDefined();
  });

  test('[SX-03] /s/:id loads the shared session', async ({ page }) => {
    // Build a minimal valid ShareableSession referencing a small RCSB entry.
    const fakeSession = {
      schemaVersion: 1,
      structures: [
        {
          id: 'orig-1',
          source: { type: 'rcsb', id: '1CRN' },
          name: '1CRN',
          representation: 'ball-and-stick',
          colorScheme: 'cpk',
          componentSettings: [],
          visible: true,
        },
      ],
      layoutMode: 'overlay',
      camera: null,
      measurements: [],
      labels: [],
      surfaceSettings: {
        type: 'vdw',
        opacity: 0.5,
        probeRadius: 1.4,
        wireframe: false,
        visible: false,
        color: '#ffffff',
      },
      autoRotate: false,
    };

    await page.route('**/api/share/TEST12345678', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fakeSession),
      });
    });

    await page.goto('/s/TEST12345678');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveTitle(/Shared session/i);
  });
});
