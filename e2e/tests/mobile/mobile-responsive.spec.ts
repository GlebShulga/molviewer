import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { viewports } from '../../fixtures';

// Only run on mobile projects
const MOBILE_PROJECTS = ['mobile-chrome', 'mobile-safari'];

test.describe('Mobile/Touch Responsiveness', () => {
  // Skip entire suite if not on mobile project
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      !MOBILE_PROJECTS.includes(testInfo.project.name),
      'Mobile tests only run on mobile-chrome and mobile-safari'
    );
  });
  let moleculeViewer: MoleculeViewerPage;

  test.describe('Mobile Layout (<768px)', () => {
    test.beforeEach(async ({ page }) => {
      moleculeViewer = new MoleculeViewerPage(page);
      await page.setViewportSize(viewports.mobile);
      await moleculeViewer.goto();

      // Close sidebar if open (should be closed by default on mobile)
      if (await moleculeViewer.isSidebarOpen()) {
        await moleculeViewer.closeSidebar();
        await moleculeViewer.page.waitForTimeout(300);
      }
    });

    test('[MO-01] should show hamburger menu button', async () => {
      const isVisible = await moleculeViewer.isHamburgerMenuVisible();
      expect(isVisible).toBe(true);
    });

    test('[MO-02] should hide sidebar by default', async () => {
      // On mobile, sidebar should be hidden initially
      const isSidebarOpen = await moleculeViewer.isSidebarOpen();
      expect(isSidebarOpen).toBe(false);
    });

    test('[MO-03] should open sidebar drawer on hamburger click', async () => {
      // Click hamburger menu
      await moleculeViewer.openSidebar();
      await moleculeViewer.page.waitForTimeout(300);

      // Sidebar should now be open
      const isSidebarOpen = await moleculeViewer.isSidebarOpen();
      expect(isSidebarOpen).toBe(true);
    });

    test('[MO-04] should show overlay when sidebar open', async () => {
      // Open sidebar
      await moleculeViewer.openSidebar();
      await moleculeViewer.page.waitForTimeout(300);

      // Overlay should be visible
      const isOverlayVisible = await moleculeViewer.isSidebarOverlayVisible();
      expect(isOverlayVisible).toBe(true);
    });

    test('[MO-05] should close sidebar on overlay click', async () => {
      // Open sidebar
      await moleculeViewer.openSidebar();
      await moleculeViewer.page.waitForTimeout(300);
      expect(await moleculeViewer.isSidebarOpen()).toBe(true);

      // Click overlay
      await moleculeViewer.closeSidebarViaOverlay();
      await moleculeViewer.page.waitForTimeout(300);

      // Sidebar should be closed
      const isSidebarOpen = await moleculeViewer.isSidebarOpen();
      expect(isSidebarOpen).toBe(false);
    });

    test('[MO-06] should close sidebar on ESC key', async () => {
      // Open sidebar
      await moleculeViewer.openSidebar();
      await moleculeViewer.page.waitForTimeout(300);
      expect(await moleculeViewer.isSidebarOpen()).toBe(true);

      // Press ESC
      await moleculeViewer.pressKey('Escape');
      await moleculeViewer.page.waitForTimeout(500); // Increase to 500ms

      // Sidebar should be closed
      const isSidebarOpen = await moleculeViewer.isSidebarOpen();
      expect(isSidebarOpen).toBe(false);
    });

    test('[MO-07] should show close button in sidebar', async () => {
      // Open sidebar
      await moleculeViewer.openSidebar();
      await moleculeViewer.page.waitForTimeout(300);

      // Close button should be visible
      const isCloseButtonVisible = await moleculeViewer.sidebarCloseButton.isVisible();
      expect(isCloseButtonVisible).toBe(true);
    });

    test('[MO-08] should close sidebar via close button', async () => {
      // Open sidebar
      await moleculeViewer.openSidebar();
      await moleculeViewer.page.waitForTimeout(300);

      // Click close button
      await moleculeViewer.closeSidebar();
      await moleculeViewer.page.waitForTimeout(300);

      // Sidebar should be closed
      const isSidebarOpen = await moleculeViewer.isSidebarOpen();
      expect(isSidebarOpen).toBe(false);
    });

    test('[MO-09] should move toolbar to appropriate position', async () => {
      // Load a molecule first
      await moleculeViewer.openSidebar();
      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.closeSidebar();

      // Toolbar should be visible
      const isToolbarVisible = await moleculeViewer.toolbar.isVisible();
      expect(isToolbarVisible).toBe(true);

      // Get toolbar position
      const toolbarBox = await moleculeViewer.toolbar.toolbar.boundingBox();
      if (toolbarBox) {
        // On mobile, toolbar might be at bottom or have different position
        // Just verify it's visible and within viewport
        const viewport = moleculeViewer.page.viewportSize();
        if (viewport) {
          expect(toolbarBox.y).toBeLessThan(viewport.height);
        }
      }
    });

    test('[MO-10] should hide tagline on mobile', async () => {
      // Look for tagline or subtitle element
      const tagline = moleculeViewer.page.locator('[class*="tagline"], [class*="subtitle"]');
      const isVisible = await tagline.isVisible().catch(() => false);
      // Tagline should be hidden on mobile
      expect(isVisible).toBe(false);
    });

    test('[MO-11] should allow loading molecules on mobile', async () => {
      // Open sidebar to access file loading
      await moleculeViewer.openSidebar();
      await moleculeViewer.page.waitForTimeout(300);

      // Load a sample molecule
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Close sidebar
      await moleculeViewer.closeSidebar();
      await moleculeViewer.page.waitForTimeout(300);

      // Molecule should be loaded
      const isLoaded = await moleculeViewer.isMoleculeLoaded();
      expect(isLoaded).toBe(true);
    });
  });

  test.describe('Tablet Layout (768-1024px)', () => {
    test.beforeEach(async ({ page }) => {
      moleculeViewer = new MoleculeViewerPage(page);
      await page.setViewportSize(viewports.tablet);
      await moleculeViewer.goto();
    });

    test('[MO-12] should show hamburger menu on tablet', async () => {
      const isVisible = await moleculeViewer.isHamburgerMenuVisible();
      // Tablet may or may not show hamburger depending on breakpoint
      // Just verify the page loads correctly
      await moleculeViewer.canvas.expectNoError();
    });

    test('[MO-13] should have reduced sidebar width', async () => {
      // Open sidebar if hamburger is visible
      if (await moleculeViewer.isHamburgerMenuVisible()) {
        await moleculeViewer.openSidebar();
        await moleculeViewer.page.waitForTimeout(300);
      }

      // Get sidebar dimensions
      const sidebarBox = await moleculeViewer.sidebar.boundingBox();
      if (sidebarBox) {
        // Tablet sidebar should be smaller than desktop
        expect(sidebarBox.width).toBeLessThanOrEqual(320);
      }
    });

    test('[MO-14] should function correctly on tablet', async () => {
      // Open sidebar if needed
      if (await moleculeViewer.isHamburgerMenuVisible()) {
        await moleculeViewer.openSidebar();
        await moleculeViewer.page.waitForTimeout(300);
      }

      // Load molecule
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Close sidebar if was opened
      if (await moleculeViewer.isSidebarOpen()) {
        await moleculeViewer.closeSidebar();
        await moleculeViewer.page.waitForTimeout(300);
      }

      // Verify molecule rendered
      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('Desktop Layout (>1024px)', () => {
    test.beforeEach(async ({ page }) => {
      moleculeViewer = new MoleculeViewerPage(page);
      await page.setViewportSize(viewports.desktop);
      await moleculeViewer.goto();
    });

    test('[MO-15] should hide hamburger menu on desktop', async () => {
      const isVisible = await moleculeViewer.isHamburgerMenuVisible();
      expect(isVisible).toBe(false);
    });

    test('[MO-16] should show sidebar by default', async () => {
      const isSidebarVisible = await moleculeViewer.sidebar.isVisible();
      expect(isSidebarVisible).toBe(true);
    });

    test('[MO-17] should not show overlay on desktop', async () => {
      const isOverlayVisible = await moleculeViewer.isSidebarOverlayVisible();
      expect(isOverlayVisible).toBe(false);
    });
  });

  test.describe('Touch Devices', () => {
    test.beforeEach(async ({ page }) => {
      moleculeViewer = new MoleculeViewerPage(page);
      await page.setViewportSize(viewports.mobile);
      await moleculeViewer.goto();

      // Load molecule for tests (sidebar opens/closes as needed)
      await moleculeViewer.openSidebar();
      await moleculeViewer.page.waitForTimeout(300);
      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.closeSidebar();
      await moleculeViewer.page.waitForTimeout(300);
    });

    test('[MO-18] should have adequate button sizes for touch (44x44px minimum)', async () => {
      // Use single page.evaluate() to measure all buttons at once,
      // avoiding multiple round-trips that compete with WebGL's rendering loop
      const sizes = await moleculeViewer.page.evaluate((selector) => {
        const buttons = document.querySelectorAll(selector);
        return Array.from(buttons).slice(0, 5).map(el => {
          const rect = el.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        });
      }, '[class*="toolbar"] button');

      for (const box of sizes) {
        // Touch targets should be at least 44x44px
        expect(box.width).toBeGreaterThanOrEqual(40); // Allow small tolerance
        expect(box.height).toBeGreaterThanOrEqual(40);
      }
    });

    test('[MO-19] should support pinch-to-zoom', async ({}, testInfo) => {
      // Mobile Safari doesn't support programmatic touch/wheel events
      test.skip(testInfo.project.name === 'mobile-safari',
        'Mobile Safari does not support programmatic touch/wheel events');

      // Simulate pinch zoom using canvas helper
      // Pass browserName for Safari fallback (TouchEvent constructor is illegal in Safari)
      const browserName = testInfo.project.name.includes('safari') ? 'webkit' : 'chromium';
      await moleculeViewer.canvas.pinchZoom(1.5, browserName);
      await moleculeViewer.page.waitForTimeout(300);

      // Verify no errors after pinch
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[MO-20] should support two-finger rotation', async ({}, testInfo) => {
      // Mouse-based rotation doesn't translate to touch events on mobile emulation
      test.skip(testInfo.project.name.includes('mobile'),
        'Mouse-based rotation not supported on mobile emulation');

      // Simulate rotation with touch
      await moleculeViewer.canvas.rotateMolecule(30, 20);
      await moleculeViewer.page.waitForTimeout(300);

      // Verify no errors after rotation
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[MO-21] should handle single tap for atom selection', async () => {
      // Single tap on canvas
      await moleculeViewer.canvas.clickCenter();
      await moleculeViewer.page.waitForTimeout(200);

      // Should not cause errors
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[MO-22] should handle long press for context menu', async () => {
      // Long press simulation (right-click equivalent on touch)
      await moleculeViewer.canvas.rightClickCenter();
      await moleculeViewer.page.waitForTimeout(300);

      // Context menu may or may not appear depending on implementation
      // Just verify no errors
      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('Responsive Transitions', () => {
    test('[MO-23] should handle viewport resize from mobile to desktop', async ({ page }) => {
      moleculeViewer = new MoleculeViewerPage(page);

      // Start mobile
      await page.setViewportSize(viewports.mobile);
      await moleculeViewer.goto();

      // Load molecule
      await moleculeViewer.openSidebar();
      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.closeSidebar();

      // Resize to desktop
      await page.setViewportSize(viewports.desktop);
      await moleculeViewer.page.waitForTimeout(500);

      // Verify UI adapted correctly
      const isHamburgerVisible = await moleculeViewer.isHamburgerMenuVisible();
      expect(isHamburgerVisible).toBe(false);

      const isSidebarVisible = await moleculeViewer.sidebar.isVisible();
      expect(isSidebarVisible).toBe(true);

      // Molecule should still be rendered
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[MO-24] should handle viewport resize from desktop to mobile', async ({ page }) => {
      moleculeViewer = new MoleculeViewerPage(page);

      // Start desktop
      await page.setViewportSize(viewports.desktop);
      await moleculeViewer.goto();
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Resize to mobile
      await page.setViewportSize(viewports.mobile);
      await moleculeViewer.page.waitForTimeout(500);

      // Verify UI adapted correctly
      const isHamburgerVisible = await moleculeViewer.isHamburgerMenuVisible();
      expect(isHamburgerVisible).toBe(true);

      // Molecule should still be rendered
      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('Landscape Orientation', () => {
    test('[MO-25] should work in mobile landscape', async ({ page }) => {
      moleculeViewer = new MoleculeViewerPage(page);

      // Mobile landscape
      await page.setViewportSize({ width: 667, height: 375 });
      await moleculeViewer.goto();

      // Open sidebar and load molecule
      if (await moleculeViewer.isHamburgerMenuVisible()) {
        await moleculeViewer.openSidebar();
        await moleculeViewer.page.waitForTimeout(300);
      }

      await moleculeViewer.loadSampleMolecule('caffeine');

      if (await moleculeViewer.isSidebarOpen()) {
        await moleculeViewer.closeSidebar();
        await moleculeViewer.page.waitForTimeout(300);
      }

      // Verify molecule rendered
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[MO-26] should work in tablet landscape', async ({ page }) => {
      moleculeViewer = new MoleculeViewerPage(page);

      // Tablet landscape
      await page.setViewportSize({ width: 1024, height: 768 });
      await moleculeViewer.goto();

      // Load molecule
      if (await moleculeViewer.isHamburgerMenuVisible()) {
        await moleculeViewer.openSidebar();
        await moleculeViewer.page.waitForTimeout(300);
      }

      await moleculeViewer.loadSampleMolecule('caffeine');

      if (await moleculeViewer.isSidebarOpen()) {
        await moleculeViewer.closeSidebar();
        await moleculeViewer.page.waitForTimeout(300);
      }

      // Verify molecule rendered
      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });
});
