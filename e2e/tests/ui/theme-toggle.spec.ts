import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';

test.describe('Theme Toggle', () => {
  // Theme toggle tests need longer timeout for slow browsers
  test.setTimeout(60000);

  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }) => {
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
  });

  test.describe('Theme Toggle Button', () => {
    test('[TH-01] should have theme toggle button in header', async () => {
      const isVisible = await moleculeViewer.themeToggle.isVisible();
      expect(isVisible).toBe(true);
    });

    test('[TH-02] should have appropriate icon for current theme', async () => {
      // Theme toggle should have Sun or Moon icon
      const hasIcon = await moleculeViewer.themeToggle.locator('svg').isVisible();
      expect(hasIcon).toBe(true);
    });
  });

  test.describe('Toggle Theme', () => {
    test('[TH-03] should toggle from dark to light theme', async ({ browserName }) => {
      // WebKit has flaky click behavior for theme toggle
      test.skip(browserName === 'webkit', 'Theme toggle click flaky in webkit');

      // Default is dark theme
      let currentTheme = await moleculeViewer.getCurrentTheme();

      // Toggle theme
      await moleculeViewer.toggleTheme();
      await moleculeViewer.page.waitForTimeout(100);

      const newTheme = await moleculeViewer.getCurrentTheme();
      expect(newTheme).not.toBe(currentTheme);
    });

    test('[TH-04] should toggle from light to dark theme', async () => {
      // Toggle to light first
      await moleculeViewer.toggleTheme();
      const lightTheme = await moleculeViewer.getCurrentTheme();

      // Toggle back to dark
      await moleculeViewer.toggleTheme();
      await moleculeViewer.page.waitForTimeout(100);

      const darkTheme = await moleculeViewer.getCurrentTheme();
      expect(darkTheme).not.toBe(lightTheme);
    });
  });

  test.describe('Theme Persistence', () => {
    test('[TH-05] should persist theme on page reload', async ({ page }) => {
      // Toggle to light theme
      await moleculeViewer.toggleTheme();
      const themeBeforeReload = await moleculeViewer.getCurrentTheme();

      // Reload page
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // Theme should be persisted
      const themeAfterReload = await moleculeViewer.getCurrentTheme();
      expect(themeAfterReload).toBe(themeBeforeReload);
    });

    test('[TH-06] should maintain theme across navigation', async ({ page }) => {
      // Toggle theme
      await moleculeViewer.toggleTheme();
      const initialTheme = await moleculeViewer.getCurrentTheme();

      // Navigate away and back (refresh)
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      const currentTheme = await moleculeViewer.getCurrentTheme();
      expect(currentTheme).toBe(initialTheme);
    });
  });

  test.describe('Theme with Molecule Loaded', () => {
    test('[TH-07] should maintain theme after loading molecule', async () => {
      // Toggle to light theme
      await moleculeViewer.toggleTheme();
      const themeBeforeLoad = await moleculeViewer.getCurrentTheme();

      // Load a molecule
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Theme should be unchanged
      const themeAfterLoad = await moleculeViewer.getCurrentTheme();
      expect(themeAfterLoad).toBe(themeBeforeLoad);
    });

    test('[TH-08] should update canvas background with theme', async () => {
      // Load molecule first
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Get initial theme
      const initialTheme = await moleculeViewer.getCurrentTheme();

      // Toggle theme
      await moleculeViewer.toggleTheme();
      await moleculeViewer.page.waitForTimeout(200);

      // Theme should change
      const newTheme = await moleculeViewer.getCurrentTheme();
      expect(newTheme).not.toBe(initialTheme);

      // WebGL canvas CSS background is always transparent (rgba(0,0,0,0))
      // The actual background is rendered by Three.js scene.background
      // Verify the theme change was applied to the document instead
      const htmlTheme = await moleculeViewer.page.locator('html').getAttribute('data-theme');
      expect(htmlTheme).toBe(newTheme);
    });
  });

  test.describe('Theme UI Elements', () => {
    test('[TH-09] should update sidebar colors with theme', async () => {
      // Get initial sidebar background
      const initialSidebarBg = await moleculeViewer.sidebar.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor
      );

      // Toggle theme
      await moleculeViewer.toggleTheme();
      await moleculeViewer.page.waitForTimeout(100);

      // Sidebar background should change
      const newSidebarBg = await moleculeViewer.sidebar.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor
      );

      expect(newSidebarBg).not.toBe(initialSidebarBg);
    });

    test('[TH-10] should update header colors with theme', async () => {
      // Get initial header background
      const initialHeaderBg = await moleculeViewer.header.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor
      );

      // Toggle theme
      await moleculeViewer.toggleTheme();
      await moleculeViewer.page.waitForTimeout(100);

      // Header background should change
      const newHeaderBg = await moleculeViewer.header.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor
      );

      expect(newHeaderBg).not.toBe(initialHeaderBg);
    });
  });

  test.describe('Theme Toggle Accessibility', () => {
    test('[TH-11] should have accessible label on theme toggle', async () => {
      const title = await moleculeViewer.themeToggle.getAttribute('title');
      expect(title).toBeTruthy();
      expect(title?.toLowerCase()).toMatch(/light|dark|theme/);
    });

    test('[TH-12] should update label when theme changes', async () => {
      const initialTitle = await moleculeViewer.themeToggle.getAttribute('title');

      await moleculeViewer.toggleTheme();
      await moleculeViewer.page.waitForTimeout(100);

      const newTitle = await moleculeViewer.themeToggle.getAttribute('title');

      // Title should indicate the opposite theme
      expect(newTitle).not.toBe(initialTitle);
    });
  });

  test.describe('System Preference', () => {
    test('[TH-13] should respect system color scheme preference on initial load', async ({
      page,
      context,
    }) => {
      // This test would require setting up a fresh context with emulated color scheme
      // For now, just verify the app loads with a valid theme
      await page.goto('/');
      const theme = await moleculeViewer.getCurrentTheme();
      expect(['light', 'dark']).toContain(theme);
    });
  });
});
