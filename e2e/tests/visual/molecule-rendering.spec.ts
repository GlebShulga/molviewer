import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';

test.describe('Molecule Rendering Visual Tests', () => {
  // Visual tests are slow due to WebGL rendering and snapshot comparison
  test.slow();

  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }, testInfo) => {
    // WebKit WebGL needs longer timeout due to slower rendering
    if (testInfo.project.name === 'webkit') {
      test.setTimeout(120000); // 2 minutes for WebKit WebGL
    }
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
  });

  test.describe('Ball & Stick Representation', () => {
    test('[MR-01] should match snapshot for caffeine ball-and-stick', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Reset view to ensure consistent position
      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      // Take canvas screenshot
      const screenshot = await moleculeViewer.canvas.screenshot();
      expect(screenshot).toMatchSnapshot('caffeine-ball-and-stick.png');
    });

    test('[MR-02] should match snapshot for aspirin ball-and-stick', async () => {
      await moleculeViewer.loadSampleMolecule('aspirin');

      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      const screenshot = await moleculeViewer.canvas.screenshot();
      expect(screenshot).toMatchSnapshot('aspirin-ball-and-stick.png');
    });

    test('[MR-03] should match snapshot for water ball-and-stick', async () => {
      await moleculeViewer.loadSampleMolecule('water');

      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      const screenshot = await moleculeViewer.canvas.screenshot();
      expect(screenshot).toMatchSnapshot('water-ball-and-stick.png');
    });
  });

  test.describe('Stick Representation', () => {
    test('[MR-04] should match snapshot for caffeine stick', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.toolbar.setStick();

      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      const screenshot = await moleculeViewer.canvas.screenshot();
      expect(screenshot).toMatchSnapshot('caffeine-stick.png');
    });
  });

  test.describe('Spacefill Representation', () => {
    test('[MR-05] should match snapshot for caffeine spacefill', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.toolbar.setSpacefill();

      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      const screenshot = await moleculeViewer.canvas.screenshot();
      expect(screenshot).toMatchSnapshot('caffeine-spacefill.png');
    });
  });

  test.describe('Cartoon Representation', () => {
    test('[MR-06] should match snapshot for protein cartoon', async ({ page }) => {
      test.setTimeout(90000);

      await moleculeViewer.fetchFromRCSBAndWait('1CRN');

      // Switch to cartoon if available
      if (await moleculeViewer.controlPanel.representationSection.isVisible()) {
        const cartoonAvailable = await moleculeViewer.controlPanel.isRepresentationAvailable('cartoon');
        if (cartoonAvailable) {
          await moleculeViewer.controlPanel.setRepresentation('cartoon');

          await moleculeViewer.toolbar.homeView();
          await moleculeViewer.page.waitForTimeout(1000);

          const screenshot = await moleculeViewer.canvas.screenshot();
          expect(screenshot).toMatchSnapshot('protein-cartoon.png');
        }
      }
    });
  });

  test.describe('Color Schemes', () => {
    test('[MR-07] should match snapshot for CPK coloring', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      const screenshot = await moleculeViewer.canvas.screenshot();
      expect(screenshot).toMatchSnapshot('caffeine-cpk.png');
    });

    test('[MR-08] should match snapshot for chain coloring', async () => {
      // Ensure fresh state by reloading the page
      await moleculeViewer.goto();
      await moleculeViewer.loadSampleMolecule('caffeine');

      if (await moleculeViewer.controlPanel.colorSchemeSection.isVisible()) {
        await moleculeViewer.controlPanel.setColorScheme('chain');

        await moleculeViewer.toolbar.homeView();
        await moleculeViewer.page.waitForTimeout(500);

        const screenshot = await moleculeViewer.canvas.screenshot();
        expect(screenshot).toMatchSnapshot('caffeine-chain.png');
      }
    });

    test('[MR-09] should match snapshot for rainbow coloring on protein', async ({ page }) => {
      test.setTimeout(90000);

      await moleculeViewer.fetchFromRCSBAndWait('1CRN');

      if (await moleculeViewer.controlPanel.colorSchemeSection.isVisible()) {
        const isAvailable = await moleculeViewer.controlPanel.isColorSchemeAvailable('rainbow');
        if (isAvailable) {
          await moleculeViewer.controlPanel.setColorScheme('rainbow');

          await moleculeViewer.toolbar.homeView();
          await moleculeViewer.page.waitForTimeout(500);

          const screenshot = await moleculeViewer.canvas.screenshot();
          expect(screenshot).toMatchSnapshot('protein-rainbow.png');
        }
      }
    });
  });

  test.describe('Rotated Views', () => {
    test('[MR-10] should match snapshot after rotation', async () => {
      test.setTimeout(120000);
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Apply a consistent rotation
      await moleculeViewer.canvas.rotateMolecule(45, 30);
      await moleculeViewer.page.waitForTimeout(500);

      const screenshot = await moleculeViewer.canvas.screenshot();
      expect(screenshot).toMatchSnapshot('caffeine-rotated.png');
    });
  });

  test.describe('Zoomed Views', () => {
    test('[MR-11] should match snapshot when zoomed in', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(300);

      // Zoom in
      await moleculeViewer.canvas.zoom(-200);
      await moleculeViewer.page.waitForTimeout(500);

      const screenshot = await moleculeViewer.canvas.screenshot();
      expect(screenshot).toMatchSnapshot('caffeine-zoomed-in.png');
    });

    test('[MR-12] should match snapshot when zoomed out', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(300);

      // Zoom out
      await moleculeViewer.canvas.zoom(200);
      await moleculeViewer.page.waitForTimeout(500);

      const screenshot = await moleculeViewer.canvas.screenshot();
      expect(screenshot).toMatchSnapshot('caffeine-zoomed-out.png');
    });
  });
});
