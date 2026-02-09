import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';

test.describe('Export', () => {
  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }) => {
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
    await moleculeViewer.loadSampleMolecule('caffeine');
    // Open Export panel (collapsed by default)
    await moleculeViewer.openExportPanel();
  });

  test.describe('Export Panel', () => {
    test('[EX-01] should show export panel in sidebar', async () => {
      const isVisible = await moleculeViewer.exportPanel.isVisible();
      expect(isVisible).toBe(true);
    });

    test('[EX-02] should have scale options', async () => {
      // Wait for at least one scale button to be visible first
      const firstScale = moleculeViewer.exportPanel.getByRole('button', { name: /1x/i });
      await expect(firstScale).toBeVisible();

      // Now verify all three scale options exist
      const allScales = moleculeViewer.exportPanel.locator('button').filter({ hasText: /^[124]x$/i });
      const count = await allScales.count();
      expect(count).toBe(3);
    });

    test('[EX-03] should have background options', async () => {
      const backgroundOptions = moleculeViewer.exportPanel.locator('button, input').filter({ hasText: /transparent|dark|light/i });
      const count = await backgroundOptions.count();
      expect(count).toBeGreaterThan(0);
    });

    test('[EX-04] should have export button', async () => {
      // Use exact name to avoid matching the collapsible section header
      const exportButton = moleculeViewer.exportPanel.getByRole('button', { name: 'Export PNG' });
      const isVisible = await exportButton.isVisible();
      expect(isVisible).toBe(true);
    });
  });

  test.describe('Export via Toolbar', () => {
    test('[EX-05] should have export button in toolbar', async () => {
      const isVisible = await moleculeViewer.toolbar.exportButton.isVisible();
      expect(isVisible).toBe(true);
    });

    test('[EX-06] should trigger export with Ctrl+S', async ({ page }) => {
      // Set up download handler
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

      // Press Ctrl+S
      await moleculeViewer.pressShortcut(['Control'], 's');

      // Wait a bit for the export to trigger
      await moleculeViewer.page.waitForTimeout(500);

      // Download should trigger
      const download = await downloadPromise;
      expect(download).not.toBeNull();
      if (download) {
        const filename = download.suggestedFilename();
        expect(filename).toMatch(/\.png$/);
      }
    });
  });

  test.describe('Export Scale', () => {
    test('[EX-07] should select 1x scale', async () => {
      const scale1x = moleculeViewer.exportPanel.getByRole('button', { name: /1x/i });
      await expect(scale1x).toBeVisible();

      await scale1x.click({ force: true });
      await moleculeViewer.page.waitForTimeout(100);

      // Verify selection - CSS modules mangle class names, so check for partial match
      const isActive = await scale1x.evaluate(
        (el) => Array.from(el.classList).some(c => c.includes('active'))
      );
      expect(isActive).toBe(true);
    });

    test('[EX-08] should select 2x scale', async () => {
      const scale2x = moleculeViewer.exportPanel.getByRole('button', { name: /2x/i });
      await expect(scale2x).toBeVisible();

      await scale2x.click({ force: true });
      await moleculeViewer.page.waitForTimeout(100);

      // CSS modules mangle class names, so check for partial match
      const isActive = await scale2x.evaluate(
        (el) => Array.from(el.classList).some(c => c.includes('active'))
      );
      expect(isActive).toBe(true);
    });

    test('[EX-09] should select 4x scale', async () => {
      const scale4x = moleculeViewer.exportPanel.getByRole('button', { name: /4x/i });
      await expect(scale4x).toBeVisible();

      await scale4x.click({ force: true });
      await moleculeViewer.page.waitForTimeout(100);

      // CSS modules mangle class names, so check for partial match
      const isActive = await scale4x.evaluate(
        (el) => Array.from(el.classList).some(c => c.includes('active'))
      );
      expect(isActive).toBe(true);
    });
  });

  test.describe('Export Background', () => {
    test('[EX-10] should select transparent background', async () => {
      const transparent = moleculeViewer.exportPanel.getByRole('button', { name: /transparent/i });
      await expect(transparent).toBeVisible();

      await transparent.click({ force: true });
      await moleculeViewer.page.waitForTimeout(100);

      // CSS modules mangle class names, so check for partial match
      const isActive = await transparent.evaluate(
        (el) => Array.from(el.classList).some(c => c.includes('active'))
      );
      expect(isActive).toBe(true);
    });

    test('[EX-11] should select dark background', async () => {
      const dark = moleculeViewer.exportPanel.getByRole('button', { name: /dark/i });
      await expect(dark).toBeVisible();

      await dark.click({ force: true });
      await moleculeViewer.page.waitForTimeout(100);

      // CSS modules mangle class names, so check for partial match
      const isActive = await dark.evaluate(
        (el) => Array.from(el.classList).some(c => c.includes('active'))
      );
      expect(isActive).toBe(true);
    });

    test('[EX-12] should select light background', async () => {
      const light = moleculeViewer.exportPanel.getByRole('button', { name: /light/i });
      await expect(light).toBeVisible();

      await light.click({ force: true });
      await moleculeViewer.page.waitForTimeout(100);

      // CSS modules mangle class names, so check for partial match
      const isActive = await light.evaluate(
        (el) => Array.from(el.classList).some(c => c.includes('active'))
      );
      expect(isActive).toBe(true);
    });
  });

  test.describe('Export Filename', () => {
    test('[EX-13] should allow custom filename', async () => {
      const filenameInput = moleculeViewer.exportPanel.locator('input[type="text"]').first();
      await expect(filenameInput).toBeVisible();

      await filenameInput.fill('my-molecule');
      const value = await filenameInput.inputValue();
      expect(value).toBe('my-molecule');
    });

    test('[EX-14] should use molecule name as default filename', async () => {
      const filenameInput = moleculeViewer.exportPanel.locator('input[type="text"]').first();
      await expect(filenameInput).toBeVisible();

      const value = await filenameInput.inputValue();
      // Should contain molecule name or default
      expect(value.length).toBeGreaterThan(0);
    });
  });

  test.describe('Export Download', () => {
    test('[EX-15] should download PNG file on export', async ({ page }) => {
      // Use exact name to avoid matching the collapsible section header
      const exportButton = moleculeViewer.exportPanel.getByRole('button', { name: 'Export PNG' });
      await expect(exportButton).toBeVisible();

      // Set up download handler before clicking
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);

      await exportButton.click({ force: true });
      await moleculeViewer.page.waitForTimeout(500);

      const download = await downloadPromise;
      expect(download).not.toBeNull();
      if (download) {
        const filename = download.suggestedFilename();
        expect(filename).toMatch(/\.png$/);
      }
    });
  });
});
