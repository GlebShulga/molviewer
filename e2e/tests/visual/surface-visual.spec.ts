import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';

test.describe('Surface Representation Visual Tests', () => {
  // Surface generation can be slow, especially for proteins
  test.setTimeout(120000);

  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }, testInfo) => {
    // WebKit WebGL needs longer timeout due to slower rendering
    if (testInfo.project.name === 'webkit') {
      test.setTimeout(180000); // 3 minutes for WebKit surface generation
    }
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
  });

  test.describe('Small Molecule Surface (CPU Path)', () => {
    test('[VS-01] should match snapshot for caffeine surface', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Skip if representation section not visible (smart defaults active)
      const repSectionVisible = await moleculeViewer.controlPanel.representationSection.isVisible();
      test.skip(!repSectionVisible, 'Representation section hidden (smart defaults active)');

      await moleculeViewer.controlPanel.setRepresentation('surface-vdw');
      // Wait for surface generation
      await moleculeViewer.page.waitForTimeout(2000);

      // Reset view to ensure consistent position
      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      // Take canvas screenshot
      const screenshot = await moleculeViewer.canvas.screenshot();
      expect(screenshot).toMatchSnapshot('caffeine-surface.png', {
        maxDiffPixelRatio: 0.02, // Allow 2% difference for GPU rendering variance
      });
    });

    test('[VS-02] should match snapshot for water surface', async () => {
      await moleculeViewer.loadSampleMolecule('water');

      // Skip if representation section not visible (smart defaults active)
      const repSectionVisible = await moleculeViewer.controlPanel.representationSection.isVisible();
      test.skip(!repSectionVisible, 'Representation section hidden (smart defaults active)');

      await moleculeViewer.controlPanel.setRepresentation('surface-vdw');
      await moleculeViewer.page.waitForTimeout(2000);

      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      const screenshot = await moleculeViewer.canvas.screenshot();
      expect(screenshot).toMatchSnapshot('water-surface.png', {
        maxDiffPixelRatio: 0.02,
      });
    });
  });

  test.describe('Protein Surface (GPU Path)', () => {
    test('[VS-03] should match snapshot for 1CRN surface', async () => {
      await moleculeViewer.fetchFromRCSBAndWait('1CRN');

      // Skip if representation section not visible (smart defaults active)
      const repSectionVisible = await moleculeViewer.controlPanel.representationSection.isVisible();
      test.skip(!repSectionVisible, 'Representation section hidden (smart defaults active)');

      await moleculeViewer.controlPanel.setRepresentation('surface-vdw');
      // Wait for surface generation (1CRN is small protein, uses CPU)
      await moleculeViewer.page.waitForTimeout(8000);

      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      const screenshot = await moleculeViewer.canvas.screenshot();
      expect(screenshot).toMatchSnapshot('1crn-surface.png', {
        maxDiffPixelRatio: 0.03, // Slightly higher tolerance for protein surfaces
      });
    });
  });

  test.describe('Surface with Color Schemes', () => {
    test('[VS-04] should match snapshot for surface with chain coloring', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Skip if sections not visible
      const repSectionVisible = await moleculeViewer.controlPanel.representationSection.isVisible();
      const colorSectionVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!repSectionVisible || !colorSectionVisible, 'Control sections hidden');

      // Set surface representation
      await moleculeViewer.controlPanel.setRepresentation('surface-vdw');
      await moleculeViewer.page.waitForTimeout(2000);

      // Change color scheme
      await moleculeViewer.controlPanel.setColorScheme('chain');
      await moleculeViewer.page.waitForTimeout(500);

      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      const screenshot = await moleculeViewer.canvas.screenshot();
      expect(screenshot).toMatchSnapshot('caffeine-surface-chain-color.png', {
        maxDiffPixelRatio: 0.02,
      });
    });
  });

  test.describe('Surface Rotated Views', () => {
    test('[VS-05] should match snapshot for rotated surface', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Skip if representation section not visible
      const repSectionVisible = await moleculeViewer.controlPanel.representationSection.isVisible();
      test.skip(!repSectionVisible, 'Representation section hidden (smart defaults active)');

      await moleculeViewer.controlPanel.setRepresentation('surface-vdw');
      await moleculeViewer.page.waitForTimeout(2000);

      // Apply a consistent rotation
      await moleculeViewer.canvas.rotateMolecule(45, 30);
      await moleculeViewer.page.waitForTimeout(500);

      const screenshot = await moleculeViewer.canvas.screenshot();
      expect(screenshot).toMatchSnapshot('caffeine-surface-rotated.png', {
        maxDiffPixelRatio: 0.02,
      });
    });
  });
});
