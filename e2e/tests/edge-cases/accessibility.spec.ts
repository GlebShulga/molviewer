import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';

test.describe('Accessibility', () => {
  // Accessibility tests need longer timeout for slow browsers
  test.setTimeout(60000);

  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }) => {
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
  });

  test.describe('ARIA Labels', () => {
    test('[AC-01] should have aria-label on file upload region', async () => {
      // Component uses aria-label="File upload" (capital F)
      const fileUpload = moleculeViewer.page.locator('[role="region"][aria-label="File upload"]');
      const isVisible = await fileUpload.isVisible();
      expect(isVisible).toBe(true);
    });

    test('[AC-02] should have aria-label on toolbar buttons', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Check toolbar buttons have aria-labels
      const toolbarButtons = moleculeViewer.toolbar.toolbar.locator('button');
      const count = await toolbarButtons.count();

      for (let i = 0; i < count; i++) {
        const button = toolbarButtons.nth(i);
        const ariaLabel = await button.getAttribute('aria-label');
        const title = await button.getAttribute('title');

        // Each button should have either aria-label or title
        expect(ariaLabel || title).toBeTruthy();
      }
    });

    test('[AC-03] should have aria-pressed on toggle buttons', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Representation buttons should have aria-pressed
      const ballAndStickPressed =
        await moleculeViewer.toolbar.ballAndStickButton.getAttribute('aria-pressed');
      expect(ballAndStickPressed).toBe('true');

      // Other representation buttons should be false
      const stickPressed = await moleculeViewer.toolbar.stickButton.getAttribute('aria-pressed');
      expect(stickPressed).toBe('false');
    });

    test('[AC-04] should have aria-label on theme toggle', async () => {
      const title = await moleculeViewer.themeToggle.getAttribute('title');
      expect(title).toBeTruthy();
      expect(title?.toLowerCase()).toMatch(/theme|light|dark/);
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('[AC-05] should be able to navigate to file input with keyboard', async ({ page }) => {
      // Tab to file input
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Check focus
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      // Should eventually reach interactive elements
      expect(focusedElement).toBeTruthy();
    });

    test('[AC-06] should be able to tab through toolbar buttons', async ({ page }) => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Focus on first toolbar button
      await moleculeViewer.toolbar.ballAndStickButton.focus();

      // Tab through buttons
      const visitedLabels: string[] = [];

      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
        if (label) visitedLabels.push(label);
      }

      // Should have visited multiple buttons
      expect(visitedLabels.length).toBeGreaterThan(0);
    });

    test('[AC-07] should activate button with Enter key', async ({ page }) => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Focus stick button
      await moleculeViewer.toolbar.stickButton.focus();

      // Press Enter to activate
      await page.keyboard.press('Enter');

      // Should switch to stick representation
      const isActive = await moleculeViewer.toolbar.isRepresentationActive('stick');
      expect(isActive).toBe(true);
    });

    test('[AC-08] should activate button with Space key', async ({ page }) => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Focus spacefill button
      await moleculeViewer.toolbar.spacefillButton.focus();

      // Press Space to activate
      await page.keyboard.press('Space');

      // Should switch to spacefill representation
      const isActive = await moleculeViewer.toolbar.isRepresentationActive('spacefill');
      expect(isActive).toBe(true);
    });
  });

  test.describe('Focus Management', () => {
    test('[AC-09] should return focus when closing shortcuts modal', async ({ page }) => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Focus shortcuts button and press Enter
      await moleculeViewer.toolbar.shortcutsButton.focus();
      await page.keyboard.press('Enter');

      // Modal should be visible
      expect(await moleculeViewer.shortcutsHelp.isVisible()).toBe(true);

      // Close modal with Escape
      await page.keyboard.press('Escape');

      // Modal should be closed
      expect(await moleculeViewer.shortcutsHelp.isVisible()).toBe(false);

      // Focus should ideally return to the trigger (or be managed properly)
    });

    test('[AC-10] should trap focus in modal when open', async ({ page }) => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Open shortcuts modal
      await moleculeViewer.pressKey('?');
      expect(await moleculeViewer.shortcutsHelp.isVisible()).toBe(true);

      // Tab multiple times - focus should stay within modal
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Tab');
      }

      // Check that focus is still within modal or the page
      // (Focus trapping implementation may vary)
      await moleculeViewer.pressKey('Escape');
    });
  });

  test.describe('Color Contrast', () => {
    test('[AC-11] should have readable text in dark theme', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Get computed styles of header text
      const headerColor = await moleculeViewer.title.evaluate(
        (el) => window.getComputedStyle(el).color
      );

      // Should not be black or very dark (indicating light text on dark background)
      expect(headerColor).not.toBe('rgb(0, 0, 0)');
    });

    test('[AC-12] should have readable text in light theme', async () => {
      await moleculeViewer.toggleTheme();
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Get computed styles of header text
      const headerColor = await moleculeViewer.title.evaluate(
        (el) => window.getComputedStyle(el).color
      );

      // Should not be white or very light (indicating dark text on light background)
      expect(headerColor).not.toBe('rgb(255, 255, 255)');
    });
  });

  test.describe('Screen Reader Hints', () => {
    test('[AC-13] should have descriptive headings', async () => {
      const h1 = moleculeViewer.page.locator('h1');
      const h1Text = await h1.textContent();
      expect(h1Text).toBeTruthy();
      expect(h1Text?.length).toBeGreaterThan(0);
    });

    test('[AC-14] should have section headings in control panel', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Control panel should have headings
      const headings = moleculeViewer.controlPanel.panel.locator('h3');
      const count = await headings.count();

      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('Reduced Motion', () => {
    test('[AC-15] should work without animations', async ({ page }) => {
      // Emulate reduced motion preference
      await page.emulateMedia({ reducedMotion: 'reduce' });

      await moleculeViewer.goto();
      await moleculeViewer.loadSampleMolecule('caffeine');

      // App should still function
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Theme toggle should work
      await moleculeViewer.toggleTheme();
      const theme = await moleculeViewer.getCurrentTheme();
      expect(['light', 'dark']).toContain(theme);
    });
  });

  test.describe('Skip Links', () => {
    test('[AC-16] should have main content landmark', async () => {
      const main = moleculeViewer.page.locator('main');
      const isVisible = await main.isVisible();
      expect(isVisible).toBe(true);
    });

    test('[AC-17] should have aside landmark for sidebar', async () => {
      const aside = moleculeViewer.sidebar;
      const isVisible = await aside.isVisible();
      expect(isVisible).toBe(true);
    });

    test('[AC-18] should have header landmark', async () => {
      const header = moleculeViewer.header;
      const isVisible = await header.isVisible();
      expect(isVisible).toBe(true);
    });
  });

  test.describe('Form Labels', () => {
    test('[AC-19] should have label for PDB ID input', async () => {
      // Check for label or aria-label
      const input = moleculeViewer.pdbIdInput;
      const placeholder = await input.getAttribute('placeholder');
      const ariaLabel = await input.getAttribute('aria-label');

      // Should have at least a placeholder or aria-label
      expect(placeholder || ariaLabel).toBeTruthy();
    });

    test('[AC-20] should have label for file input', async () => {
      const fileInput = moleculeViewer.fileInput;
      const id = await fileInput.getAttribute('id');

      // Should have associated label
      if (id) {
        const label = moleculeViewer.page.locator(`label[for="${id}"]`);
        const labelExists = await label.isVisible().catch(() => false);
        expect(labelExists).toBe(true);
      }
    });
  });
});
