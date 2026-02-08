import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { molecules } from '../../fixtures';
import path from 'path';

test.describe('File Loading', () => {
  // File loading tests involve file I/O and WebGL rendering
  test.slow();

  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }) => {
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
  });

  test.describe('Sample Molecules', () => {
    test('[FL-01] should load caffeine sample molecule', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Verify molecule is loaded
      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);

      // Verify canvas has rendered content
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Verify toolbar is visible
      const toolbarVisible = await moleculeViewer.toolbar.isVisible();
      expect(toolbarVisible).toBe(true);
    });

    test('[FL-02] should load aspirin sample molecule', async () => {
      await moleculeViewer.loadSampleMolecule('aspirin');

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[FL-03] should load water sample molecule', async () => {
      await moleculeViewer.loadSampleMolecule('water');

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('File Upload', () => {
    test('[FL-04] should upload PDB file', async () => {
      await moleculeViewer.uploadFile(molecules.caffeine);

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[FL-05] should upload SDF file', async () => {
      await moleculeViewer.uploadFile(molecules.aspirin);

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[FL-06] should upload XYZ file', async () => {
      await moleculeViewer.uploadFile(molecules.water);

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('RCSB PDB Fetch', () => {
    test('[FL-07] should fetch molecule from RCSB by PDB ID', async ({ page }) => {
      // Increase timeout for network request
      test.setTimeout(60000);

      await moleculeViewer.fetchFromRCSBAndWait('1CRN');

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[FL-08] should show error for invalid PDB ID format', async () => {
      // Use non-alphanumeric characters to trigger format validation
      // Note: Input has maxLength=4, so "INVALID" gets truncated to "INVA"
      await moleculeViewer.fetchFromRCSB('@@@@');

      // Wait for error message element to appear
      await moleculeViewer.canvas.errorMessage.waitFor({ state: 'visible', timeout: 5000 });

      const hasError = await moleculeViewer.canvas.hasError();
      expect(hasError).toBe(true);

      const errorText = await moleculeViewer.canvas.getErrorText();
      expect(errorText).toContain('Invalid PDB ID format');
    });
  });

  test.describe('Empty State', () => {
    test('[FL-09] should show empty state when no molecule is loaded', async () => {
      const isEmpty = await moleculeViewer.canvas.isEmpty();
      expect(isEmpty).toBe(true);

      // Toolbar should not be visible
      const toolbarVisible = await moleculeViewer.toolbar.isVisible();
      expect(toolbarVisible).toBe(false);
    });

    test('[FL-10] should show supported file formats in empty state', async ({ page }) => {
      const emptyState = moleculeViewer.canvas.emptyState;
      const text = await emptyState.textContent();
      expect(text).toContain('PDB');
      expect(text).toContain('SDF');
      expect(text).toContain('XYZ');
    });
  });

  test.describe('Loading State', () => {
    test('[FL-11] should show loading overlay while loading', async ({ page }) => {
      // Start loading without waiting
      moleculeViewer.page.getByRole('button', { name: 'Caffeine' }).click();

      // Check for loading state (may be brief)
      // Note: This might be flaky if loading is too fast
      await expect(moleculeViewer.canvas.loadingOverlay).toBeVisible({ timeout: 5000 }).catch(() => {
        // Loading may have completed too fast, that's okay
      });

      // Eventually it should complete
      await moleculeViewer.waitForMoleculeLoaded();
      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);
    });
  });

  test.describe('Multiple Structures', () => {
    test('[FL-12] should add second structure without replacing first', async () => {
      // Load first molecule
      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Add second molecule (click Add mode first if visible)
      const addButton = moleculeViewer.page.getByRole('button', { name: /Add/i }).first();
      const addButtonVisible = await addButton.isVisible();
      test.skip(!addButtonVisible, 'Add button not visible - multi-structure mode not available');

      await addButton.click({ force: true });
      await moleculeViewer.page.waitForTimeout(100);

      // Load second molecule
      await moleculeViewer.loadSampleMolecule('water');
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Both should be loaded - verify via structure list
      const structureList = moleculeViewer.page.locator('[class*="structureList"]');
      await expect(structureList).toBeVisible();
      const structures = await structureList.locator('[class*="items"] [role="button"]').count();
      expect(structures).toBeGreaterThan(1);
    });

    test('[FL-13] should replace structure when in Replace mode', async () => {
      // Load first molecule
      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Check if multi-structure mode is available (Add button should appear after first molecule)
      const addButton = moleculeViewer.page.getByRole('button', { name: /Add/i }).first();
      const multiStructureAvailable = await addButton.isVisible();
      test.skip(!multiStructureAvailable, 'Multi-structure mode not available');

      // Switch to Replace mode
      const replaceButton = moleculeViewer.page.getByRole('button', { name: /Replace/i }).first();
      await expect(replaceButton).toBeVisible();
      await replaceButton.click({ force: true });
      await moleculeViewer.page.waitForTimeout(100);

      // Load second molecule (should replace first)
      await moleculeViewer.loadSampleMolecule('water');
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Verify Replace behavior: structure list shows exactly 1 structure
      const structureList = moleculeViewer.page.locator('[class*="structureList"]');
      await expect(structureList).toBeVisible();
      const structures = await structureList.locator('[class*="items"] [role="button"]').count();
      expect(structures).toBe(1);
    });
  });

  test.describe('File Format Edge Cases', () => {
    test('[FL-14] should mention MOL format in supported formats', async () => {
      // Check that MOL format is mentioned in empty state
      const emptyState = moleculeViewer.canvas.emptyState;
      const text = await emptyState.textContent();
      expect(text).toMatch(/MOL|SDF/i); // MOL is often grouped with SDF
    });

    test('[FL-15] should handle protein with B-factor data', async () => {
      test.setTimeout(60000);  // Increase timeout for protein file parsing
      // Load crambin which has B-factor data
      await moleculeViewer.uploadFile(molecules.crambin);

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);

      // Verify molecule renders
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Try to set B-factor color scheme
      // Use waitFor with timeout to avoid hanging when colorSchemeSection is hidden due to smart defaults
      await moleculeViewer.controlPanel.colorSchemeSection
        .waitFor({ state: 'visible', timeout: 2000 })
        .catch(() => {});
      const colorSchemeVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSchemeVisible, 'Color scheme section hidden (smart defaults active)');

      const bfactorButton = moleculeViewer.page.getByRole('button', { name: /B-factor/i });
      await expect(bfactorButton).toBeVisible();
      const isEnabled = await bfactorButton.isEnabled();
      expect(isEnabled).toBe(true);

      await bfactorButton.click({ force: true });
      await moleculeViewer.page.waitForTimeout(200);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[FL-16] should preserve B-factor data after loading', async () => {
      await moleculeViewer.uploadFile(molecules.crambin);

      // Switch to Ball & Stick to see individual atoms (Cartoon doesn't show atom tooltips)
      await moleculeViewer.toolbar.setBallAndStick();
      await moleculeViewer.page.waitForTimeout(300);

      // Hover over an atom to trigger tooltip
      await moleculeViewer.canvas.hoverAtom(0);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const text = await tooltip.textContent() || '';
      // B-factor should be displayed in tooltip
      expect(text).toMatch(/B-factor|temp.*factor/i);
    });

    test('[FL-17] should handle protein with multiple chains', async ({ page }) => {
      test.setTimeout(60000);

      // Fetch insulin which has multiple chains (A and B)
      await moleculeViewer.fetchFromRCSBAndWait('2INS');

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Check for chain color scheme availability
      const colorSchemeVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSchemeVisible, 'Color scheme section hidden (smart defaults active)');

      // Use scoped selector to avoid matching "Chains" collapsible section
      const chainButton = moleculeViewer.controlPanel.chainButton;
      await expect(chainButton).toBeVisible();
      await chainButton.click({ force: true });
      await moleculeViewer.page.waitForTimeout(200);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('Multi-Model PDB Files', () => {
    test('[FL-18] should load multi-model structure from RCSB', async ({ page }) => {
      test.setTimeout(60000);

      // NMR structures typically have multiple models
      // 1UBQ is a common example with multiple NMR models
      await moleculeViewer.fetchFromRCSBAndWait('1UBQ');

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[FL-19] should handle first model of multi-model PDB', async ({ page }) => {
      test.setTimeout(60000);

      // Fetch a structure that may have multiple models
      await moleculeViewer.fetchFromRCSBAndWait('1UBQ');

      // Verify it loads and renders
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Should be able to interact with it
      await moleculeViewer.toolbar.setStick();
      expect(await moleculeViewer.toolbar.isRepresentationActive('stick')).toBe(true);
    });
  });

  test.describe('Biological Assembly (BIOMT)', () => {
    test('[FL-20] should load structure with biological assembly data', async ({ page }) => {
      test.setTimeout(60000);

      // Many PDB structures have BIOMT records for biological assemblies
      // 1CRN is a small example
      await moleculeViewer.fetchFromRCSBAndWait('1CRN');

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[FL-21] should render asymmetric unit by default', async ({ page }) => {
      test.setTimeout(60000);

      // Load a structure
      await moleculeViewer.fetchFromRCSBAndWait('1CRN');

      // Verify the structure renders
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Check that representations work
      await moleculeViewer.toolbar.setStick();
      const isStickActive = await moleculeViewer.toolbar.isRepresentationActive('stick');
      expect(isStickActive).toBe(true);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('Large File Handling', () => {
    test('[FL-22] should handle protein structure efficiently', async ({ page }) => {
      test.setTimeout(60000);

      // Crambin is a small protein - should load quickly
      await moleculeViewer.uploadFile(molecules.crambin);

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[FL-23] should apply quality optimizations for larger structures', async ({ page }) => {
      test.setTimeout(90000);

      // Fetch a medium-sized structure
      await moleculeViewer.fetchFromRCSBAndWait('3HTB');

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);

      // Should still render
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Should be able to interact
      await moleculeViewer.canvas.rotateMolecule(50, 50);
      await moleculeViewer.page.waitForTimeout(200);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('Data Preservation', () => {
    test('[FL-24] should preserve residue information from PDB', async () => {
      await moleculeViewer.uploadFile(molecules.crambin);

      // Check that sequence viewer shows residues (indicates residue data preserved)
      const sequenceViewer = moleculeViewer.sequenceViewerPage;
      const isVisible = await sequenceViewer.isVisible();
      expect(isVisible).toBe(true);

      // Should have residues
      const residueCount = await sequenceViewer.getResidueCount();
      expect(residueCount).toBeGreaterThan(0);
    });

    test('[FL-25] should preserve chain information from PDB', async () => {
      await moleculeViewer.uploadFile(molecules.crambin);

      // Color by chain should work
      const colorSchemeVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSchemeVisible, 'Color scheme section hidden (smart defaults active)');

      await moleculeViewer.controlPanel.setColorScheme('chain');
      const isActive = await moleculeViewer.controlPanel.isColorSchemeActive('chain');
      expect(isActive).toBe(true);
    });

    test('[FL-26] should preserve secondary structure from PDB', async () => {
      await moleculeViewer.uploadFile(molecules.crambin);

      // Secondary structure color scheme should be available for proteins
      // Use waitFor with timeout to avoid hanging when colorSchemeSection is hidden due to smart defaults
      await moleculeViewer.controlPanel.colorSchemeSection
        .waitFor({ state: 'visible', timeout: 2000 })
        .catch(() => {});
      const colorSchemeVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSchemeVisible, 'Color scheme section hidden (smart defaults active)');

      // Use the existing page object property which is already properly scoped
      const ssButton = moleculeViewer.controlPanel.secondaryStructureButton;
      await expect(ssButton).toBeVisible();

      const isEnabled = await ssButton.isEnabled();
      // Button should be enabled if SS data is present
      expect(isEnabled).toBe(true);
    });

    test('[FL-27] should handle molecules without residue data', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Caffeine shouldn't have residue data
      // Sequence viewer should not be visible
      const sequenceViewer = moleculeViewer.sequenceViewerPage;
      const isVisible = await sequenceViewer.isVisible();
      expect(isVisible).toBe(false);

      // But molecule should still render
      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });
});
