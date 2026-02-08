import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { molecules } from '../../fixtures';

test.describe('mmCIF File Loading', () => {
  // File loading tests involve file I/O and WebGL rendering
  test.slow();

  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }) => {
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
  });

  test.describe('mmCIF File Upload', () => {
    test('[CIF-01] should upload mmCIF file', async () => {
      await moleculeViewer.uploadFile(molecules.crambinCif);

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[CIF-02] should parse atom coordinates correctly from mmCIF', async () => {
      await moleculeViewer.uploadFile(molecules.crambinCif);
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Switch to Ball & Stick to see individual atoms
      await moleculeViewer.toolbar.setBallAndStick();
      await moleculeViewer.page.waitForTimeout(300);

      // Hover over an atom to trigger tooltip
      await moleculeViewer.canvas.hoverAtom(0);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      // Tooltip should contain atom info
      const text = await tooltip.textContent() || '';
      expect(text.length).toBeGreaterThan(0);
    });

    test('[CIF-03] should preserve residue information from mmCIF', async () => {
      await moleculeViewer.uploadFile(molecules.crambinCif);

      // Check that sequence viewer shows residues (indicates residue data preserved)
      const sequenceViewer = moleculeViewer.sequenceViewerPage;
      const isVisible = await sequenceViewer.isVisible();
      expect(isVisible).toBe(true);

      // Should have residues
      const residueCount = await sequenceViewer.getResidueCount();
      expect(residueCount).toBeGreaterThan(0);
    });

    test('[CIF-04] should preserve chain information from mmCIF', async () => {
      await moleculeViewer.uploadFile(molecules.crambinCif);

      // Color by chain should work
      const colorSchemeVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSchemeVisible, 'Color scheme section hidden (smart defaults active)');

      await moleculeViewer.controlPanel.setColorScheme('chain');
      const isActive = await moleculeViewer.controlPanel.isColorSchemeActive('chain');
      expect(isActive).toBe(true);
    });

    test('[CIF-05] should preserve secondary structure from mmCIF', async () => {
      await moleculeViewer.uploadFile(molecules.crambinCif);

      // Secondary structure color scheme should be available for proteins
      await moleculeViewer.controlPanel.colorSchemeSection
        .waitFor({ state: 'visible', timeout: 2000 })
        .catch(() => {});
      const colorSchemeVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSchemeVisible, 'Color scheme section hidden (smart defaults active)');

      const ssButton = moleculeViewer.controlPanel.secondaryStructureButton;
      await expect(ssButton).toBeVisible();

      const isEnabled = await ssButton.isEnabled();
      expect(isEnabled).toBe(true);
    });

    test('[CIF-06] should handle B-factor data from mmCIF', async () => {
      test.setTimeout(60000);
      await moleculeViewer.uploadFile(molecules.crambinCif);

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Try to set B-factor color scheme
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
  });

  test.describe('RCSB Fetch with mmCIF', () => {
    test('[CIF-07] should fetch mmCIF from RCSB by PDB ID', async ({ page }) => {
      test.setTimeout(60000);

      // RCSB fetch now uses mmCIF format
      await moleculeViewer.fetchFromRCSBAndWait('1CRN');

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[CIF-08] should parse secondary structure from RCSB mmCIF', async ({ page }) => {
      test.setTimeout(60000);

      await moleculeViewer.fetchFromRCSBAndWait('1CRN');
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Cartoon representation uses secondary structure
      // It should already be active for proteins, but let's verify it renders
      await moleculeViewer.controlPanel.setRepresentation('cartoon');
      await moleculeViewer.page.waitForTimeout(300);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[CIF-09] should handle multi-chain structure from RCSB mmCIF', async ({ page }) => {
      test.setTimeout(60000);

      // Fetch insulin which has multiple chains (A and B)
      await moleculeViewer.fetchFromRCSBAndWait('2INS');

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Check for chain color scheme availability
      const colorSchemeVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSchemeVisible, 'Color scheme section hidden (smart defaults active)');

      const chainButton = moleculeViewer.controlPanel.chainButton;
      await expect(chainButton).toBeVisible();
      await chainButton.click({ force: true });
      await moleculeViewer.page.waitForTimeout(200);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[CIF-10] should handle NMR structure (first model only) from RCSB mmCIF', async ({ page }) => {
      test.setTimeout(60000);

      // 1UBQ is a common NMR structure with multiple models
      await moleculeViewer.fetchFromRCSBAndWait('1UBQ');

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Should be able to interact with it
      await moleculeViewer.toolbar.setStick();
      expect(await moleculeViewer.toolbar.isRepresentationActive('stick')).toBe(true);
    });
  });

  test.describe('mmCIF vs PDB Compatibility', () => {
    test('[CIF-11] should produce similar structure from mmCIF as PDB', async () => {
      // Load PDB version of crambin
      await moleculeViewer.uploadFile(molecules.crambin);
      await moleculeViewer.canvas.expectMoleculeRendered();

      const pdbSequenceViewer = moleculeViewer.sequenceViewerPage;
      const pdbResidueCount = await pdbSequenceViewer.getResidueCount();

      // Switch to Replace mode and load mmCIF version
      const replaceButton = moleculeViewer.page.getByRole('button', { name: /Replace/i }).first();
      if (await replaceButton.isVisible()) {
        await replaceButton.click({ force: true });
        await moleculeViewer.page.waitForTimeout(100);
      }

      await moleculeViewer.uploadFile(molecules.crambinCif);
      await moleculeViewer.canvas.expectMoleculeRendered();

      const cifResidueCount = await pdbSequenceViewer.getResidueCount();

      // Both should have the same number of residues
      expect(cifResidueCount).toBe(pdbResidueCount);
    });
  });

  test.describe('mmCIF Representation Support', () => {
    test('[CIF-12] should support all representations with mmCIF', async () => {
      await moleculeViewer.uploadFile(molecules.crambinCif);
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Test Ball & Stick
      await moleculeViewer.toolbar.setBallAndStick();
      await moleculeViewer.page.waitForTimeout(200);
      await moleculeViewer.canvas.expectMoleculeRendered();
      expect(await moleculeViewer.toolbar.isRepresentationActive('ball-and-stick')).toBe(true);

      // Test Stick
      await moleculeViewer.toolbar.setStick();
      await moleculeViewer.page.waitForTimeout(200);
      await moleculeViewer.canvas.expectMoleculeRendered();
      expect(await moleculeViewer.toolbar.isRepresentationActive('stick')).toBe(true);

      // Test Spacefill
      await moleculeViewer.toolbar.setSpacefill();
      await moleculeViewer.page.waitForTimeout(200);
      await moleculeViewer.canvas.expectMoleculeRendered();
      expect(await moleculeViewer.toolbar.isRepresentationActive('spacefill')).toBe(true);

      // Test Cartoon (via ControlPanel - not available in Toolbar)
      await moleculeViewer.controlPanel.setRepresentation('cartoon');
      await moleculeViewer.page.waitForTimeout(200);
      await moleculeViewer.canvas.expectMoleculeRendered();
      expect(await moleculeViewer.controlPanel.isRepresentationActive('cartoon')).toBe(true);
    });
  });
});
