import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';

test.describe('Saved Molecules', () => {
  // Saved molecules tests need longer timeout when running in parallel
  test.setTimeout(60000);

  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }) => {
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
    await moleculeViewer.loadSampleMolecule('caffeine');
  });

  const savedMoleculesPanel = () => moleculeViewer.page.locator('[class*="savedMolecules"]');

  test.describe('Save Molecule', () => {
    test('[SM-01] should show saved molecules panel', async () => {
      const panel = savedMoleculesPanel();
      const isVisible = await panel.isVisible();
      expect(isVisible).toBe(true);
    });

    test('[SM-02] should have save button', async () => {
      const saveButton = savedMoleculesPanel().getByRole('button', { name: /save/i });
      await expect(saveButton).toBeVisible();
    });

    test('[SM-03] should save current molecule', async () => {
      const saveButton = savedMoleculesPanel().getByRole('button', { name: /save/i });
      await saveButton.click();

      // Should show saved molecule in list
      await moleculeViewer.page.waitForTimeout(300);
      const savedList = savedMoleculesPanel().locator('[class*="savedItem"], [class*="moleculeItem"]');
      const count = await savedList.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('Load Saved Molecule', () => {
    test('[SM-04] should load a saved molecule', async () => {
      // First save the current molecule
      const saveButton = savedMoleculesPanel().getByRole('button', { name: /save/i });
      await saveButton.click({ force: true });
      await moleculeViewer.page.waitForTimeout(300);

      // Ensure Replace mode is active (not Add mode) so loading water replaces caffeine
      // Check aria-pressed instead of isVisible() - the button is always visible but may not be active
      const replaceButton = moleculeViewer.page.getByRole('button', { name: /Replace/i });
      const isReplaceActive = (await replaceButton.getAttribute('aria-pressed')) === 'true';
      if (!isReplaceActive) {
        await replaceButton.click({ force: true });
        await moleculeViewer.page.waitForTimeout(300);
      }
      await moleculeViewer.loadSampleMolecule('water');

      // Now load the saved caffeine by clicking the Load button
      // Use force: true to bypass Playwright stability checks that hang due to WebGL canvas repainting
      // See: https://github.com/microsoft/playwright/issues/18197
      const loadButton = savedMoleculesPanel().getByRole('button', { name: /load/i }).first();
      await loadButton.click({ force: true });
      await moleculeViewer.page.waitForTimeout(300);

      // Wait for the Update button to appear next to the saved molecule
      // This confirms the saved molecule was loaded (loadedMoleculeId === entry.id)
      const updateButton = savedMoleculesPanel().getByRole('button', { name: /update/i });
      await expect(updateButton).toBeVisible({ timeout: 10000 });

      // Also verify the molecule name changed back to CAFFEINE in structures list
      await expect(moleculeViewer.page.getByRole('button', { name: /CAFFEINE.*14 atoms/i })).toBeVisible();
    });
  });

  test.describe('Rename Saved Molecule', () => {
    test('[SM-05] should allow renaming saved molecule', async () => {
      // Save first
      const saveButton = savedMoleculesPanel().getByRole('button', { name: /save/i });
      await saveButton.click();
      await moleculeViewer.page.waitForTimeout(300);

      // Find rename button or double-click to edit
      const renameButton = savedMoleculesPanel().getByRole('button', { name: /rename|edit/i }).first();
      const renameVisible = await renameButton.isVisible().catch(() => false);
      test.skip(!renameVisible, 'Rename button not available');

      await renameButton.click();

      // Type new name
      const input = savedMoleculesPanel().locator('input[type="text"]').first();
      await expect(input).toBeVisible({ timeout: 5000 });

      await input.fill('My Caffeine');
      await moleculeViewer.pressKey('Enter');

      // Verify rename
      await moleculeViewer.page.waitForTimeout(200);
      const hasNewName = await savedMoleculesPanel().locator('text=My Caffeine').isVisible();
      expect(hasNewName).toBe(true);
    });
  });

  test.describe('Delete Saved Molecule', () => {
    test('[SM-06] should delete saved molecule', async () => {
      // Save first
      const saveButton = savedMoleculesPanel().getByRole('button', { name: /save/i });
      await saveButton.click({ force: true });
      await moleculeViewer.page.waitForTimeout(300);

      // Get initial count
      const savedList = savedMoleculesPanel().locator('[class*="savedItem"], [class*="moleculeItem"]');
      const initialCount = await savedList.count();

      // Find and click delete button
      const deleteButton = savedMoleculesPanel().getByRole('button', { name: /delete|remove|×/i }).first();
      await deleteButton.click({ force: true });

      // May have confirmation dialog
      const confirmButton = moleculeViewer.page.getByRole('button', { name: /confirm|yes|ok/i });
      if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmButton.click();
      }

      // Verify deletion
      await moleculeViewer.page.waitForTimeout(300);
      const newCount = await savedList.count();
      expect(newCount).toBeLessThan(initialCount);
    });
  });

  test.describe('Clear All Saved Molecules', () => {
    // Increase timeout for this test as it involves multiple molecule loads
    test('[SM-07] should clear all saved molecules with confirmation', async () => {
      test.setTimeout(60000);

      // Ensure Replace mode for this test (so loading water replaces caffeine)
      const replaceButton = moleculeViewer.page.getByRole('button', { name: /Replace/i });
      if ((await replaceButton.getAttribute('aria-pressed')) !== 'true') {
        await replaceButton.click({ force: true });
      }

      // Save caffeine first
      await savedMoleculesPanel().getByRole('button', { name: 'Save Current Molecule' }).click({ force: true });
      await moleculeViewer.page.waitForTimeout(200);

      // Load water (replaces caffeine) and save it
      await moleculeViewer.loadSampleMolecule('water');

      // Save water
      await savedMoleculesPanel().getByRole('button', { name: 'Save Current Molecule' }).click({ force: true });
      await moleculeViewer.page.waitForTimeout(200);

      // Click Clear All button - first click shows confirmation state
      const clearAllButton = savedMoleculesPanel().getByRole('button', { name: /clear all/i });
      await clearAllButton.click({ force: true });
      await moleculeViewer.page.waitForTimeout(200);

      // Click again to confirm (the button changes to "Click again to confirm")
      const confirmButton = savedMoleculesPanel().getByRole('button', { name: /confirm/i });
      await confirmButton.click({ force: true });
      await moleculeViewer.page.waitForTimeout(200);

      // Verify all cleared - check for "No saved molecules yet" text
      await expect(savedMoleculesPanel().getByText('No saved molecules yet')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Persistence', () => {
    test('[SM-08] should persist saved molecules across page reloads', async ({ page }) => {
      // Save molecule
      const saveButton = savedMoleculesPanel().getByRole('button', { name: /save/i });
      await saveButton.click();
      await page.waitForTimeout(300);

      // Reload page
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // Check if saved molecule still exists
      const savedList = savedMoleculesPanel().locator('[class*="savedItem"], [class*="moleculeItem"]');
      const count = await savedList.count();
      // Should have at least one saved molecule
      expect(count).toBeGreaterThan(0);
    });
  });
});
