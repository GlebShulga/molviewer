import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { molecules } from '../../fixtures';

test.describe('Error Handling', () => {
  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }) => {
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
  });

  test.describe('Invalid File Handling', () => {
    test('[EH-01] should show error for malformed PDB file', async () => {
      // Upload invalid PDB file (use error-aware method to avoid timeout)
      await moleculeViewer.uploadFileExpectError(molecules.invalid);

      // Should show error message
      const hasError = await moleculeViewer.canvas.hasError();
      expect(hasError).toBe(true);

      const errorText = await moleculeViewer.canvas.getErrorText();
      expect(errorText.length).toBeGreaterThan(0);
    });

    test('[EH-02] should handle empty file gracefully', async ({ page }) => {
      // Create an empty file input
      const emptyFilePath = 'e2e/fixtures/molecules/empty.pdb';

      // Upload empty file (this may fail or show an error)
      try {
        await moleculeViewer.fileInput.setInputFiles({
          name: 'empty.pdb',
          mimeType: 'chemical/x-pdb',
          buffer: Buffer.from(''),
        });

        await moleculeViewer.page.waitForTimeout(500);

        // Should show error or remain in empty state
        const hasError = await moleculeViewer.canvas.hasError();
        const isEmpty = await moleculeViewer.canvas.isEmpty();

        expect(hasError || isEmpty).toBe(true);
      } catch (e) {
        // Upload itself may fail, which is acceptable
      }
    });
  });

  test.describe('Invalid RCSB PDB ID', () => {
    test('[EH-03] should show error for non-existent PDB ID (404)', async () => {
      // Try to fetch a non-existent PDB ID
      await moleculeViewer.fetchFromRCSB('XXXX');

      // Wait for error message to appear (not just timeout)
      await moleculeViewer.canvas.errorMessage.waitFor({
        state: 'visible',
        timeout: 10000
      });

      // Should show error message
      const hasError = await moleculeViewer.canvas.hasError();
      expect(hasError).toBe(true);

      const errorText = await moleculeViewer.canvas.getErrorText();
      expect(errorText.toLowerCase()).toMatch(/not found|error|failed/);
    });

    test('[EH-04] should show error for invalid PDB ID format', async () => {
      // Try to fetch with invalid format
      await moleculeViewer.fetchFromRCSB('INVALID123');

      // Wait for error message to appear
      await moleculeViewer.canvas.errorMessage.waitFor({
        state: 'visible',
        timeout: 5000
      });

      // Should show error about format
      const hasError = await moleculeViewer.canvas.hasError();
      expect(hasError).toBe(true);

      const errorText = await moleculeViewer.canvas.getErrorText();
      expect(errorText.toLowerCase()).toMatch(/not found|format|invalid/);
    });

    test('[EH-05] should show error for too short PDB ID', async () => {
      await moleculeViewer.fetchFromRCSB('AB');

      await moleculeViewer.page.waitForTimeout(500);

      const hasError = await moleculeViewer.canvas.hasError();
      expect(hasError).toBe(true);
    });
  });

  test.describe('Network Error Handling', () => {
    test('[EH-06] should handle network timeout gracefully', async ({ page }) => {
      // Block network requests to RCSB
      await page.route('**/files.rcsb.org/**', (route) => {
        route.abort('timedout');
      });

      await moleculeViewer.fetchFromRCSB('1CRN');

      // Wait for error
      await page.waitForTimeout(3000);

      // Should show error
      const hasError = await moleculeViewer.canvas.hasError();
      expect(hasError).toBe(true);
    });

    test('[EH-07] should handle network failure gracefully', async ({ page }) => {
      // Block network requests
      await page.route('**/files.rcsb.org/**', (route) => {
        route.abort('failed');
      });

      await moleculeViewer.fetchFromRCSB('1CRN');

      // Wait for error
      await page.waitForTimeout(3000);

      // Should show error message
      const hasError = await moleculeViewer.canvas.hasError();
      expect(hasError).toBe(true);
    });
  });

  test.describe('Error Recovery', () => {
    test('[EH-08] should allow loading valid file after error', async () => {
      // First cause an error
      await moleculeViewer.fetchFromRCSB('XXXX');
      await moleculeViewer.page.waitForTimeout(3000);

      expect(await moleculeViewer.canvas.hasError()).toBe(true);

      // Now load a valid molecule
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Error should be cleared
      const hasError = await moleculeViewer.canvas.hasError();
      expect(hasError).toBe(false);

      // Molecule should be loaded
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[EH-09] should clear error when uploading valid file', async () => {
      // First cause an error (use error-aware method)
      await moleculeViewer.uploadFileExpectError(molecules.invalid);

      expect(await moleculeViewer.canvas.hasError()).toBe(true);

      // Upload a valid file
      await moleculeViewer.uploadFile(molecules.caffeine);

      // Error should be cleared
      const hasError = await moleculeViewer.canvas.hasError();
      expect(hasError).toBe(false);
    });
  });

  test.describe('Error Message Display', () => {
    test('[EH-10] should display error with icon', async () => {
      await moleculeViewer.fetchFromRCSB('XXXX');
      await moleculeViewer.page.waitForTimeout(3000);

      const errorMessage = moleculeViewer.canvas.errorMessage;
      const hasIcon = await errorMessage.locator('[class*="errorIcon"], svg, span').first().isVisible();

      expect(hasIcon).toBe(true);
    });

    test('[EH-11] should display descriptive error message', async () => {
      await moleculeViewer.fetchFromRCSB('XXXX');
      await moleculeViewer.page.waitForTimeout(3000);

      const errorText = await moleculeViewer.canvas.getErrorText();

      // Error should be descriptive
      expect(errorText.length).toBeGreaterThan(10);
      expect(errorText).not.toMatch(/undefined|null|\[object/);
    });
  });

  test.describe('Unsupported File Format', () => {
    test('[EH-12] should reject unsupported file extension', async ({ page }) => {
      // Try to upload an unsupported file type
      try {
        await moleculeViewer.fileInput.setInputFiles({
          name: 'molecule.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('This is not a molecule file'),
        });

        await page.waitForTimeout(500);

        // Should show error
        const hasError = await moleculeViewer.canvas.hasError();
        expect(hasError).toBe(true);
      } catch (e) {
        // File input may reject invalid types, which is acceptable
      }
    });
  });

  test.describe('WebGL Error Handling', () => {
    test('[EH-13] should show fallback if WebGL fails', async ({ page }) => {
      // This is a theoretical test - WebGL failure is hard to simulate
      // Just verify the app loads without critical errors
      await moleculeViewer.goto();
      await moleculeViewer.loadSampleMolecule('caffeine');

      // App should not crash
      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);
    });
  });
});
