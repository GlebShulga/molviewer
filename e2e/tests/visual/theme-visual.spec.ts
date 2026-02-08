import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';

test.describe('Theme Visual Tests', () => {
  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }, testInfo) => {
    // WebKit WebGL needs longer timeout due to slower rendering
    if (testInfo.project.name === 'webkit') {
      test.setTimeout(120000); // 2 minutes for WebKit WebGL
    } else {
      test.setTimeout(60000);
    }
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
  });

  test.describe('Dark Theme', () => {
    test('[TV-01] should match snapshot for dark theme empty state', async () => {
      // Ensure we're in dark theme (default)
      const theme = await moleculeViewer.getCurrentTheme();
      if (theme !== 'dark') {
        await moleculeViewer.toggleTheme();
      }

      await moleculeViewer.page.waitForTimeout(300);
      const screenshot = await moleculeViewer.screenshot();
      expect(screenshot).toMatchSnapshot('dark-theme-empty.png');
    });

    test('[TV-02] should match snapshot for dark theme with molecule', async () => {
      const theme = await moleculeViewer.getCurrentTheme();
      if (theme !== 'dark') {
        await moleculeViewer.toggleTheme();
      }

      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      const screenshot = await moleculeViewer.screenshot();
      expect(screenshot).toMatchSnapshot('dark-theme-with-molecule.png');
    });

    test('[TV-03] should match snapshot for dark theme sidebar', async () => {
      const theme = await moleculeViewer.getCurrentTheme();
      if (theme !== 'dark') {
        await moleculeViewer.toggleTheme();
      }

      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.page.waitForTimeout(300);

      const sidebarScreenshot = await moleculeViewer.sidebar.screenshot();
      expect(sidebarScreenshot).toMatchSnapshot('dark-theme-sidebar.png');
    });

    test('[TV-04] should match snapshot for dark theme toolbar', async () => {
      const theme = await moleculeViewer.getCurrentTheme();
      if (theme !== 'dark') {
        await moleculeViewer.toggleTheme();
      }

      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.page.waitForTimeout(300);

      const toolbarScreenshot = await moleculeViewer.toolbar.toolbar.screenshot();
      expect(toolbarScreenshot).toMatchSnapshot('dark-theme-toolbar.png');
    });

    test('[TV-05] should match snapshot for dark theme canvas', async () => {
      const theme = await moleculeViewer.getCurrentTheme();
      if (theme !== 'dark') {
        await moleculeViewer.toggleTheme();
      }

      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      const canvasScreenshot = await moleculeViewer.canvas.screenshot();
      expect(canvasScreenshot).toMatchSnapshot('dark-theme-canvas.png');
    });
  });

  test.describe('Light Theme', () => {
    test('[TV-06] should match snapshot for light theme empty state', async () => {
      // Switch to light theme
      const theme = await moleculeViewer.getCurrentTheme();
      if (theme !== 'light') {
        await moleculeViewer.toggleTheme();
      }

      await moleculeViewer.page.waitForTimeout(300);
      const screenshot = await moleculeViewer.screenshot();
      expect(screenshot).toMatchSnapshot('light-theme-empty.png');
    });

    test('[TV-07] should match snapshot for light theme with molecule', async () => {
      const theme = await moleculeViewer.getCurrentTheme();
      if (theme !== 'light') {
        await moleculeViewer.toggleTheme();
      }

      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      const screenshot = await moleculeViewer.screenshot();
      expect(screenshot).toMatchSnapshot('light-theme-with-molecule.png');
    });

    test('[TV-08] should match snapshot for light theme sidebar', async () => {
      const theme = await moleculeViewer.getCurrentTheme();
      if (theme !== 'light') {
        await moleculeViewer.toggleTheme();
      }

      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.page.waitForTimeout(300);

      const sidebarScreenshot = await moleculeViewer.sidebar.screenshot();
      expect(sidebarScreenshot).toMatchSnapshot('light-theme-sidebar.png');
    });

    test('[TV-09] should match snapshot for light theme toolbar', async () => {
      const theme = await moleculeViewer.getCurrentTheme();
      if (theme !== 'light') {
        await moleculeViewer.toggleTheme();
      }

      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.page.waitForTimeout(300);

      const toolbarScreenshot = await moleculeViewer.toolbar.toolbar.screenshot();
      expect(toolbarScreenshot).toMatchSnapshot('light-theme-toolbar.png');
    });

    test('[TV-10] should match snapshot for light theme canvas', async () => {
      const theme = await moleculeViewer.getCurrentTheme();
      if (theme !== 'light') {
        await moleculeViewer.toggleTheme();
      }

      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      const canvasScreenshot = await moleculeViewer.canvas.screenshot();
      expect(canvasScreenshot).toMatchSnapshot('light-theme-canvas.png');
    });
  });

  test.describe('Theme Comparison', () => {
    test('[TV-11] should have visually distinct dark and light themes', async () => {
      test.setTimeout(90000);
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Ensure dark theme
      let theme = await moleculeViewer.getCurrentTheme();
      if (theme !== 'dark') {
        await moleculeViewer.toggleTheme();
      }

      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      // Take dark theme screenshot
      const darkScreenshot = await moleculeViewer.screenshot();

      // Switch to light theme
      await moleculeViewer.toggleTheme();
      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      // Take light theme screenshot
      const lightScreenshot = await moleculeViewer.screenshot();

      // Screenshots should be different
      expect(darkScreenshot).not.toEqual(lightScreenshot);
    });
  });

  test.describe('Theme with Different Representations', () => {
    test('[TV-12] should match snapshot for light theme spacefill', async () => {
      test.setTimeout(90000);
      const theme = await moleculeViewer.getCurrentTheme();
      if (theme !== 'light') {
        await moleculeViewer.toggleTheme();
      }

      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.toolbar.setSpacefill();
      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      const canvasScreenshot = await moleculeViewer.canvas.screenshot();
      expect(canvasScreenshot).toMatchSnapshot('light-theme-spacefill.png');
    });

    test('[TV-13] should match snapshot for dark theme spacefill', async () => {
      test.setTimeout(90000);
      const theme = await moleculeViewer.getCurrentTheme();
      if (theme !== 'dark') {
        await moleculeViewer.toggleTheme();
      }

      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.toolbar.setSpacefill();
      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(500);

      const canvasScreenshot = await moleculeViewer.canvas.screenshot();
      expect(canvasScreenshot).toMatchSnapshot('dark-theme-spacefill.png');
    });
  });

  test.describe('Modal Styling', () => {
    test('[TV-14] should match snapshot for shortcuts modal in dark theme', async () => {
      const theme = await moleculeViewer.getCurrentTheme();
      if (theme !== 'dark') {
        await moleculeViewer.toggleTheme();
      }

      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.pressKey('?');
      await moleculeViewer.page.waitForTimeout(300);

      if (await moleculeViewer.shortcutsHelp.isVisible()) {
        const modalScreenshot = await moleculeViewer.shortcutsHelp.screenshot();
        expect(modalScreenshot).toMatchSnapshot('shortcuts-modal-dark.png');
      }

      await moleculeViewer.pressKey('Escape');
    });

    test('[TV-15] should match snapshot for shortcuts modal in light theme', async () => {
      const theme = await moleculeViewer.getCurrentTheme();
      if (theme !== 'light') {
        await moleculeViewer.toggleTheme();
      }

      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.pressKey('?');
      await moleculeViewer.page.waitForTimeout(300);

      if (await moleculeViewer.shortcutsHelp.isVisible()) {
        const modalScreenshot = await moleculeViewer.shortcutsHelp.screenshot();
        expect(modalScreenshot).toMatchSnapshot('shortcuts-modal-light.png');
      }

      await moleculeViewer.pressKey('Escape');
    });
  });
});
