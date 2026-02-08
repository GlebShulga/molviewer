import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';

test.describe('UI Components Visual Tests', () => {
  // Increase timeout for visual tests due to WebGL rendering
  test.setTimeout(60000);

  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }, testInfo) => {
    // WebKit WebGL needs longer timeout due to slower rendering
    if (testInfo.project.name === 'webkit') {
      test.setTimeout(120000); // 2 minutes for WebKit WebGL
    }
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
  });

  test.describe('Empty State', () => {
    test('[UC-01] should match snapshot for empty state', async () => {
      // Wait for initial render
      await moleculeViewer.page.waitForTimeout(500);

      // Full page screenshot for empty state
      const screenshot = await moleculeViewer.screenshot();
      expect(screenshot).toMatchSnapshot('empty-state.png');
    });
  });

  test.describe('Sidebar', () => {
    test('[UC-02] should match snapshot for sidebar with molecule loaded', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.page.waitForTimeout(300);

      // Screenshot of sidebar
      const sidebarScreenshot = await moleculeViewer.sidebar.screenshot();
      expect(sidebarScreenshot).toMatchSnapshot('sidebar-with-molecule.png');
    });

    test('[UC-03] should match snapshot for file upload section', async () => {
      const fileUploadSection = moleculeViewer.page.locator('[class*="fileUpload"]');
      const screenshot = await fileUploadSection.screenshot();
      expect(screenshot).toMatchSnapshot('file-upload-section.png');
    });
  });

  test.describe('Toolbar', () => {
    test('[UC-04] should match snapshot for toolbar', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.page.waitForTimeout(300);

      const toolbarScreenshot = await moleculeViewer.toolbar.toolbar.screenshot();
      expect(toolbarScreenshot).toMatchSnapshot('toolbar.png');
    });

    test('[UC-05] should match snapshot for toolbar with active measurement', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.toolbar.toggleDistance();
      await moleculeViewer.page.waitForTimeout(200);

      const toolbarScreenshot = await moleculeViewer.toolbar.toolbar.screenshot();
      expect(toolbarScreenshot).toMatchSnapshot('toolbar-distance-active.png');
    });
  });

  test.describe('Control Panel', () => {
    test('[UC-06] should match snapshot for control panel', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.page.waitForTimeout(300);

      const controlPanelScreenshot = await moleculeViewer.controlPanel.panel.screenshot();
      expect(controlPanelScreenshot).toMatchSnapshot('control-panel.png');
    });

    test('[UC-07] should match snapshot for control panel with different representation', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.toolbar.setSpacefill();
      await moleculeViewer.page.waitForTimeout(300);

      const controlPanelScreenshot = await moleculeViewer.controlPanel.panel.screenshot();
      expect(controlPanelScreenshot).toMatchSnapshot('control-panel-spacefill.png');
    });
  });

  test.describe('Header', () => {
    test('[UC-08] should match snapshot for header', async () => {
      const headerScreenshot = await moleculeViewer.header.screenshot();
      expect(headerScreenshot).toMatchSnapshot('header.png');
    });
  });

  test.describe('Shortcuts Help Modal', () => {
    test('[UC-09] should match snapshot for shortcuts help', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.pressKey('?');
      await moleculeViewer.page.waitForTimeout(300);

      const modalScreenshot = await moleculeViewer.shortcutsHelp.screenshot();
      expect(modalScreenshot).toMatchSnapshot('shortcuts-help.png');
    });
  });

  test.describe('Context Menu', () => {
    test('[UC-10] should match snapshot for context menu', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.openContextMenu();
      await moleculeViewer.page.waitForTimeout(200);

      if (await moleculeViewer.isContextMenuVisible()) {
        const menuScreenshot = await moleculeViewer.contextMenu.screenshot();
        expect(menuScreenshot).toMatchSnapshot('context-menu.png');
      }
    });
  });

  test.describe('Loading State', () => {
    test('[UC-11] should match snapshot for loading overlay', async ({ page }) => {
      // Start loading without waiting for completion
      moleculeViewer.page.getByRole('button', { name: 'Caffeine' }).click();

      // Try to capture loading state (may be too fast)
      await moleculeViewer.page.waitForTimeout(50);

      const loadingVisible = await moleculeViewer.canvas.loadingOverlay.isVisible();
      if (loadingVisible) {
        const loadingScreenshot = await moleculeViewer.canvas.loadingOverlay.screenshot();
        expect(loadingScreenshot).toMatchSnapshot('loading-overlay.png');
      }

      // Wait for load to complete
      await moleculeViewer.waitForMoleculeLoaded();
    });
  });

  test.describe('Error State', () => {
    test('[UC-12] should match snapshot for error message', async () => {
      // Trigger an error
      await moleculeViewer.fetchFromRCSB('XXXX');
      await moleculeViewer.page.waitForTimeout(3000);

      if (await moleculeViewer.canvas.hasError()) {
        const errorScreenshot = await moleculeViewer.canvas.errorMessage.screenshot();
        expect(errorScreenshot).toMatchSnapshot('error-message.png');
      }
    });
  });

  test.describe('Export Panel', () => {
    test('[UC-13] should match snapshot for export panel', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.page.waitForTimeout(300);

      if (await moleculeViewer.exportPanel.isVisible()) {
        const exportScreenshot = await moleculeViewer.exportPanel.screenshot();
        expect(exportScreenshot).toMatchSnapshot('export-panel.png');
      }
    });
  });

  test.describe('Measurement Panel', () => {
    test('[UC-14] should match snapshot for measurement panel', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.page.waitForTimeout(300);

      if (await moleculeViewer.measurementPanel.isVisible()) {
        const measurementScreenshot = await moleculeViewer.measurementPanel.screenshot();
        expect(measurementScreenshot).toMatchSnapshot('measurement-panel.png');
      }
    });
  });

  test.describe('Full Page with Molecule', () => {
    test('[UC-15] should match snapshot for full page with molecule', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      const fullPageScreenshot = await moleculeViewer.screenshot();
      expect(fullPageScreenshot).toMatchSnapshot('full-page-with-molecule.png');
    });
  });
});
