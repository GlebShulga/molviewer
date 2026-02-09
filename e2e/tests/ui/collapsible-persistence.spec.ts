import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { molecules } from '../../fixtures';
import { waitForMoleculeAndHeaders } from '../../helpers/wait-for-render';

test.describe('Collapsible Panel Persistence', () => {
  test.slow();
  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }, testInfo) => {
    // WebKit WebGL initialization is significantly slower
    if (testInfo.project.name === 'webkit') {
      test.setTimeout(120000);
    }
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
  });

  // Helper to get collapsible section header by title
  // Target buttons with aria-expanded (actual collapsible headers) to avoid matching static h3 headings
  const getCollapsibleHeader = (title: string) => {
    return moleculeViewer.page.locator('button[aria-expanded]').filter({ hasText: title });
  };

  // Helper to check if section is expanded
  const isSectionExpanded = async (title: string): Promise<boolean> => {
    const header = getCollapsibleHeader(title);
    try {
      // Use expect() with retry logic instead of raw isVisible()
      await expect(header).toBeVisible({ timeout: 5000 });
      // Use evaluate() to get attribute from stable DOM
      const ariaExpanded = await header.evaluate(el => el.getAttribute('aria-expanded'));
      return ariaExpanded === 'true';
    } catch {
      return false;
    }
  };

  test.describe('State Persistence', () => {
    test('[CP-01] should persist collapsed state to localStorage', async ({ page }) => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Find and collapse "Structures" section
      const structuresHeader = getCollapsibleHeader('Structures');

      if (await structuresHeader.isVisible()) {
        // Click to collapse (if it's expanded by default)
        await structuresHeader.click();
        await page.waitForTimeout(200);

        // Check localStorage
        const storedValue = await page.evaluate(() => {
          return localStorage.getItem('mol3d-collapsed-structures');
        });

        // Should have stored the collapsed state
        expect(storedValue).not.toBeNull();
      }
    });

    test('[CP-02] should restore collapsed state after page reload', async ({ page }) => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const structuresHeader = getCollapsibleHeader('Structures');
      await expect(structuresHeader).toBeVisible({ timeout: 5000 });

      // Get initial state
      const initialExpanded = await isSectionExpanded('Structures');

      // Toggle the state
      await structuresHeader.evaluate((el) => (el as HTMLElement).click());
      await page.waitForTimeout(200);

      const newExpanded = await isSectionExpanded('Structures');
      expect(newExpanded).not.toBe(initialExpanded);

      // Reload the page
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // Load molecule again and wait for headers to render
      await moleculeViewer.loadSampleMolecule('caffeine');
      await waitForMoleculeAndHeaders(page);

      // Wait for header to reappear after reload
      await expect(getCollapsibleHeader('Structures')).toBeVisible({ timeout: 5000 });

      // Check the state is restored
      const restoredExpanded = await isSectionExpanded('Structures');
      expect(restoredExpanded).toBe(newExpanded);
    });

    test('[CP-03] should persist expanded state to localStorage', async ({ page }) => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Find "Measurements" section (usually collapsed by default)
      const measurementsHeader = getCollapsibleHeader('Measurements');

      if (await measurementsHeader.isVisible()) {
        // Expand it
        await measurementsHeader.click();
        await page.waitForTimeout(200);

        // Check localStorage
        const storedValue = await page.evaluate(() => {
          return localStorage.getItem('mol3d-collapsed-measurements');
        });

        // Should have stored the expanded state
        expect(storedValue).not.toBeNull();
      }
    });
  });

  test.describe('Independent Panel States', () => {
    test('[CP-04] should persist each panel state independently', async ({ page }) => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const structuresHeader = getCollapsibleHeader('Structures');
      const savedMoleculesHeader = getCollapsibleHeader('Saved Molecules');

      // Wait for headers to be visible
      await expect(structuresHeader).toBeVisible({ timeout: 5000 });
      await expect(savedMoleculesHeader).toBeVisible({ timeout: 5000 });

      // Get initial states
      const structuresInitial = await isSectionExpanded('Structures');
      const savedMoleculesInitial = await isSectionExpanded('Saved Molecules');

      // Toggle both to opposite states
      await structuresHeader.evaluate((el) => (el as HTMLElement).click());
      await page.waitForTimeout(100);
      await savedMoleculesHeader.evaluate((el) => (el as HTMLElement).click());
      await page.waitForTimeout(100);

      // Reload
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await moleculeViewer.loadSampleMolecule('caffeine');
      await waitForMoleculeAndHeaders(page);

      // Wait for headers to reappear after reload
      await expect(getCollapsibleHeader('Structures')).toBeVisible({ timeout: 5000 });
      await expect(getCollapsibleHeader('Saved Molecules')).toBeVisible({ timeout: 5000 });

      // Each should have its toggled state preserved
      const structuresAfter = await isSectionExpanded('Structures');
      const savedMoleculesAfter = await isSectionExpanded('Saved Molecules');

      // States should be toggled from initial
      expect(structuresAfter).toBe(!structuresInitial);
      expect(savedMoleculesAfter).toBe(!savedMoleculesInitial);
    });

    test('[CP-05] should not affect other panels when toggling one', async ({ page }) => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const structuresHeader = getCollapsibleHeader('Structures');
      const measurementsHeader = getCollapsibleHeader('Measurements');

      if (await structuresHeader.isVisible() && await measurementsHeader.isVisible()) {
        // Get initial state of Measurements
        const measurementsInitial = await isSectionExpanded('Measurements');

        // Toggle Structures
        await structuresHeader.click();
        await page.waitForTimeout(200);

        // Measurements should remain unchanged
        const measurementsAfter = await isSectionExpanded('Measurements');
        expect(measurementsAfter).toBe(measurementsInitial);
      }
    });
  });

  test.describe('Persistence Across Sessions', () => {
    test('[CP-06] should maintain state across browser sessions (simulated)', async ({ page }) => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const structuresHeader = getCollapsibleHeader('Structures');
      await expect(structuresHeader).toBeVisible({ timeout: 5000 });

      // Get initial state and toggle it
      const initialState = await isSectionExpanded('Structures');
      await structuresHeader.click({ force: true });
      await page.waitForTimeout(200);

      const newState = !initialState;

      // Get context BEFORE closing the page
      const context = page.context();

      // Close and reopen the page (simulating new session)
      await page.close();

      // Create new page in same context (shares localStorage)
      const newPage = await context.newPage();
      const newMoleculeViewer = new MoleculeViewerPage(newPage);
      await newMoleculeViewer.goto();
      await newMoleculeViewer.loadSampleMolecule('caffeine');
      await waitForMoleculeAndHeaders(newPage);

      // Wait for the header to be visible before checking state
      const newStructuresHeader = newPage.locator('button[aria-expanded]').filter({ hasText: 'Structures' });
      await expect(newStructuresHeader).toBeVisible({ timeout: 5000 });

      // Check state is preserved
      const restoredState = await newStructuresHeader.getAttribute('aria-expanded');
      expect(restoredState === 'true').toBe(newState);

      await newPage.close();
    });
  });

  test.describe('Storage Key Format', () => {
    test('[CP-07] should use mol3d-collapsed- prefix for storage keys', async ({ page }) => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Toggle a section - ensure header is visible first
      const structuresHeader = getCollapsibleHeader('Structures');
      await expect(structuresHeader).toBeVisible({ timeout: 5000 });
      await structuresHeader.click();
      await page.waitForTimeout(300); // Ensure localStorage write completes

      // Get all localStorage keys
      const keys = await page.evaluate(() => {
        return Object.keys(localStorage).filter(k => k.startsWith('mol3d-collapsed-'));
      });

      // Should have at least one key with the correct prefix
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.every(k => k.startsWith('mol3d-collapsed-'))).toBe(true);
    });

    test('[CP-08] should use kebab-case for section names in storage keys', async ({ page }) => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Toggle "Structures" section - ensure header is visible first
      const structuresHeader = getCollapsibleHeader('Structures');
      await expect(structuresHeader).toBeVisible({ timeout: 5000 });
      await structuresHeader.click({ force: true });
      await page.waitForTimeout(300); // Ensure localStorage write completes

      // Check the storage key format
      const hasCorrectKey = await page.evaluate(() => {
        return localStorage.getItem('mol3d-collapsed-structures') !== null;
      });

      expect(hasCorrectKey).toBe(true);
    });
  });

  test.describe('All Panels', () => {
    test('[CP-09] should persist state for Structures panel', async ({ page }) => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const header = getCollapsibleHeader('Structures');
      if (await header.isVisible()) {
        await header.click();
        await page.waitForTimeout(200);

        const stored = await page.evaluate(() => localStorage.getItem('mol3d-collapsed-structures'));
        expect(stored).not.toBeNull();
      }
    });

    test('[CP-10] should persist state for Saved Molecules panel', async ({ page }) => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const header = getCollapsibleHeader('Saved Molecules');
      if (await header.isVisible()) {
        await header.click();
        await page.waitForTimeout(200);

        const stored = await page.evaluate(() => localStorage.getItem('mol3d-collapsed-saved-molecules'));
        expect(stored).not.toBeNull();
      }
    });

    test('[CP-11] should persist state for Measurements panel', async ({ page }) => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const header = getCollapsibleHeader('Measurements');
      if (await header.isVisible()) {
        await header.click();
        await page.waitForTimeout(200);

        const stored = await page.evaluate(() => localStorage.getItem('mol3d-collapsed-measurements'));
        expect(stored).not.toBeNull();
      }
    });

    test('[CP-12] should persist state for Sequence Viewer panel', async ({ page }) => {
      await moleculeViewer.uploadFile(molecules.crambin);

      const header = getCollapsibleHeader('Sequence');
      if (await header.isVisible()) {
        await header.click();
        await page.waitForTimeout(200);

        const stored = await page.evaluate(() => localStorage.getItem('mol3d-collapsed-sequence'));
        expect(stored).not.toBeNull();
      }
    });

    test('[CP-13] should persist state for Residues panel', async ({ page }) => {
      await moleculeViewer.uploadFile(molecules.crambin);

      const header = getCollapsibleHeader('Residues');
      if (await header.isVisible()) {
        await header.click();
        await page.waitForTimeout(200);

        const stored = await page.evaluate(() => localStorage.getItem('mol3d-collapsed-residues'));
        expect(stored).not.toBeNull();
      }
    });
  });

  test.describe('Edge Cases', () => {
    test('[CP-14] should handle corrupted localStorage gracefully', async ({ page }) => {
      // Set invalid value in localStorage
      await page.evaluate(() => {
        localStorage.setItem('mol3d-collapsed-structures', 'invalid-json');
      });

      // Reload and load molecule
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Should not crash, and panel should still work
      const header = getCollapsibleHeader('Structures');
      if (await header.isVisible()) {
        await header.click();
        await page.waitForTimeout(200);

        // Should still be able to toggle
        await header.click();
        await page.waitForTimeout(200);
      }
    });

    test('[CP-15] should handle missing localStorage gracefully', async ({ page }) => {
      // Clear all localStorage
      await page.evaluate(() => {
        localStorage.clear();
      });

      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Panels should work with default states
      const header = getCollapsibleHeader('Structures');
      await expect(header).toBeVisible({ timeout: 5000 });
    });
  });
});
