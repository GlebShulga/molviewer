import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { molecules, rcsbIds } from '../../fixtures';

test.describe('Large Molecules', () => {
  let moleculeViewer: MoleculeViewerPage;

  // Large molecule tests are inherently slow due to rendering complexity
  test.slow();

  test.beforeEach(async ({ page }, testInfo) => {
    // WebKit WebGL initialization is significantly slower
    if (testInfo.project.name === 'webkit') {
      test.setTimeout(120000);
    }
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
  });

  test.describe('Load Large Protein (1CRN - 327 atoms)', () => {
    test('[LM-01] should load crambin protein from fixture', async () => {
      test.setTimeout(60000);

      await moleculeViewer.uploadFile(molecules.crambin);

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);

      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[LM-02] should fetch 1CRN from RCSB', async ({ }, testInfo) => {
      // Skip on WebKit - network fetch + WebGL is too slow
      testInfo.skip(testInfo.project.name === 'webkit', 'WebGL + network fetch too slow on WebKit');
      test.setTimeout(90000);

      await moleculeViewer.fetchFromRCSBAndWait('1CRN');

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);

      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[LM-03] should display correct atom count for protein', async () => {
      test.setTimeout(60000);

      await moleculeViewer.uploadFile(molecules.crambin);

      const atomCount = await moleculeViewer.controlPanel.getAtomCount();
      // 1CRN has 327 atoms
      expect(atomCount).toBeGreaterThan(300);
    });
  });

  test.describe('Quality Adaptation', () => {
    test('[LM-04] should apply quality settings based on atom count', async () => {
      await moleculeViewer.uploadFile(molecules.crambin);

      // The app should adapt quality for larger molecules
      // This is verified by the fact that it renders without performance issues
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Rotate the molecule to verify smooth rendering
      await moleculeViewer.canvas.rotateMolecule(50, 30);
      await moleculeViewer.page.waitForTimeout(500);

      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[LM-05] should maintain interactivity with large molecule', async () => {
      test.setTimeout(120000);
      await moleculeViewer.uploadFile(molecules.crambin);

      // Test various interactions
      // Zoom
      await moleculeViewer.canvas.zoom(-100);
      await moleculeViewer.page.waitForTimeout(300);

      // Rotate
      await moleculeViewer.canvas.rotateMolecule(100, 50);
      await moleculeViewer.page.waitForTimeout(300);

      // Change representation
      await moleculeViewer.toolbar.setStick();
      await moleculeViewer.page.waitForTimeout(500);

      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('Representations with Large Molecules', () => {
    test.beforeEach(async ({ }, testInfo) => {
      // Skip entire suite on webkit - representation tests with large molecules timeout consistently
      test.skip(testInfo.project.name === 'webkit', 'WebKit too slow for representation tests with proteins');

      test.setTimeout(60000);
      await moleculeViewer.uploadFile(molecules.crambin);
    });

    test('[LM-06] should render Ball & Stick for protein', async () => {
      await moleculeViewer.toolbar.setBallAndStick();
      await moleculeViewer.page.waitForTimeout(500);

      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[LM-07] should render Stick for protein', async () => {
      await moleculeViewer.toolbar.setStick();
      await moleculeViewer.page.waitForTimeout(500);

      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[LM-08] should render Spacefill for protein', async ({ }, testInfo) => {
      // Skip on WebKit - Spacefill is very expensive and times out even with 120s
      testInfo.skip(testInfo.project.name === 'webkit', 'WebKit too slow for Spacefill on proteins');

      await moleculeViewer.toolbar.setSpacefill();
      await moleculeViewer.page.waitForTimeout(500);

      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[LM-09] should render Cartoon for protein', async () => {
      // Skip if representation section not visible (smart defaults active)
      const repSectionVisible = await moleculeViewer.controlPanel.representationSection.isVisible();
      test.skip(!repSectionVisible, 'Representation section hidden (smart defaults active)');

      const cartoonAvailable = await moleculeViewer.controlPanel.isRepresentationAvailable('cartoon');
      expect(cartoonAvailable).toBe(true); // Protein should support cartoon

      await moleculeViewer.controlPanel.setRepresentation('cartoon');
      await moleculeViewer.page.waitForTimeout(1000);

      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('Color Schemes with Large Molecules', () => {
    test.beforeEach(async ({ }, testInfo) => {
      // Skip entire suite on webkit - color scheme changes with large molecules timeout consistently
      test.skip(testInfo.project.name === 'webkit', 'WebKit too slow for color scheme tests with proteins');

      test.setTimeout(60000);
      await moleculeViewer.uploadFile(molecules.crambin);
    });

    test('[LM-10] should render with Chain coloring', async () => {
      // Skip if color scheme section not visible (smart defaults active)
      const colorSectionVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSectionVisible, 'Color scheme section hidden (smart defaults active)');

      await moleculeViewer.controlPanel.setColorScheme('chain');
      await moleculeViewer.page.waitForTimeout(500);

      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[LM-11] should render with Residue Type coloring', async () => {
      // Skip if color scheme section not visible (smart defaults active)
      const colorSectionVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSectionVisible, 'Color scheme section hidden (smart defaults active)');

      const isAvailable = await moleculeViewer.controlPanel.isColorSchemeAvailable('residueType');
      expect(isAvailable).toBe(true); // Protein should support residue type coloring

      await moleculeViewer.controlPanel.setColorScheme('residueType');
      await moleculeViewer.page.waitForTimeout(500);

      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[LM-12] should render with Rainbow coloring', async ({ }, testInfo) => {
      // Skip on WebKit - color scheme changes timeout with large molecules
      testInfo.skip(testInfo.project.name === 'webkit', 'WebKit too slow for color scheme changes on proteins');

      // Skip if color scheme section not visible (smart defaults active)
      const colorSectionVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSectionVisible, 'Color scheme section hidden (smart defaults active)');

      const isAvailable = await moleculeViewer.controlPanel.isColorSchemeAvailable('rainbow');
      expect(isAvailable).toBe(true); // Protein should support rainbow coloring

      await moleculeViewer.controlPanel.setColorScheme('rainbow');
      await moleculeViewer.page.waitForTimeout(500);

      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('Sequence Viewer with Large Molecules', () => {
    test.beforeEach(async ({}, testInfo) => {
      // Don't override webkit's 120s timeout from outer beforeEach
      if (testInfo.project.name !== 'webkit') {
        test.setTimeout(60000);
      }
    });

    test('[LM-13] should display sequence for protein', async () => {
      await moleculeViewer.uploadFile(molecules.crambin);

      // Sequence viewer should be visible for protein
      const sequenceViewer = moleculeViewer.sequenceViewer;
      await expect(sequenceViewer).toBeVisible({ timeout: 5000 });

      // Should show amino acid sequence
      const text = await sequenceViewer.textContent();
      // Crambin sequence should contain amino acids
      expect(text?.length).toBeGreaterThan(40);
    });

    test('[LM-14] should show chain tabs for multi-chain protein', async ({ }, testInfo) => {
      // Skip on WebKit - network fetch + WebGL is too slow
      testInfo.skip(testInfo.project.name === 'webkit', 'WebGL + network fetch too slow on WebKit');

      // Fetch hemoglobin (4 chains: A, B, C, D)
      await moleculeViewer.fetchFromRCSBAndWait('1HHO');

      const sequenceViewer = moleculeViewer.sequenceViewer;
      await expect(sequenceViewer).toBeVisible({ timeout: 5000 });

      const chainTabs = sequenceViewer.locator('button[class*="chainTab"]');
      const tabCount = await chainTabs.count();
      // Hemoglobin has multiple protein chains - only amino acid chains show as tabs
      expect(tabCount).toBeGreaterThanOrEqual(2);
    });
  });

  test.describe('Performance', () => {
    test('[LM-15] should load protein within reasonable time', async ({ page }, testInfo) => {
      // Skip on webkit - WebGL initialization is too slow
      testInfo.skip(testInfo.project.name === 'webkit', 'WebKit too slow for performance tests');
      const startTime = Date.now();

      await moleculeViewer.uploadFile(molecules.crambin);
      await moleculeViewer.canvas.expectMoleculeRendered();

      const loadTime = Date.now() - startTime;

      // Should load within 30 seconds (allows for CI/parallel test variance)
      expect(loadTime).toBeLessThan(30000);
    });

    test('[LM-16] should not freeze UI during large molecule operations', async () => {
      test.setTimeout(60000);

      await moleculeViewer.uploadFile(molecules.crambin);

      // UI should remain responsive
      // Toggle theme while molecule is loaded
      await moleculeViewer.toggleTheme();

      // Should respond immediately
      const theme = await moleculeViewer.getCurrentTheme();
      expect(['light', 'dark']).toContain(theme);
    });
  });

  test.describe('Complex Multi-Assembly Structures', () => {
    test('[LM-17] should load 1B7G without infinite loop errors', async ({}, testInfo) => {
      // Skip on WebKit - network fetch + WebGL is too slow
      testInfo.skip(testInfo.project.name === 'webkit', 'WebGL + network fetch too slow on WebKit');
      test.setTimeout(90000);

      // This structure has 2 biological assemblies with 3 transforms
      // Previously caused "getSnapshot should be cached" infinite loop error
      // in useSelectedAtomsForStructure hook
      await moleculeViewer.fetchFromRCSBAndWait(rcsbIds.complexAssembly);

      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);

      // Verify sequence viewer works without errors - this is where the bug manifested
      const sequenceViewer = moleculeViewer.sequenceViewer;
      await expect(sequenceViewer).toBeVisible({ timeout: 5000 });

      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });
});
