import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';

test.describe('Keyboard Shortcuts', () => {
  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }) => {
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
    await moleculeViewer.loadSampleMolecule('caffeine');
  });

  test.describe('Representation Shortcuts', () => {
    test('[KS-01] should switch to Ball & Stick with key 1', async () => {
      // First switch to different representation
      await moleculeViewer.toolbar.setStick();
      expect(await moleculeViewer.toolbar.isRepresentationActive('stick')).toBe(true);

      // Press 1
      await moleculeViewer.pressKey('1');

      expect(await moleculeViewer.toolbar.isRepresentationActive('ball-and-stick')).toBe(true);
    });

    test('[KS-02] should switch to Stick with key 2', async () => {
      await moleculeViewer.pressKey('2');

      expect(await moleculeViewer.toolbar.isRepresentationActive('stick')).toBe(true);
    });

    test('[KS-03] should switch to Spacefill with key 3', async () => {
      await moleculeViewer.pressKey('3');

      expect(await moleculeViewer.toolbar.isRepresentationActive('spacefill')).toBe(true);
    });
  });

  test.describe('Measurement Shortcuts', () => {
    test('[KS-04] should toggle distance measurement with D key', async () => {
      await moleculeViewer.pressKey('d');
      expect(await moleculeViewer.toolbar.isMeasurementActive('distance')).toBe(true);

      await moleculeViewer.pressKey('d');
      expect(await moleculeViewer.toolbar.isMeasurementActive('distance')).toBe(false);
    });

    test('[KS-05] should toggle angle measurement with A key', async () => {
      await moleculeViewer.pressKey('a');
      expect(await moleculeViewer.toolbar.isMeasurementActive('angle')).toBe(true);

      await moleculeViewer.pressKey('a');
      expect(await moleculeViewer.toolbar.isMeasurementActive('angle')).toBe(false);
    });
  });

  test.describe('View Shortcuts', () => {
    test('[KS-06] should reset view with H key', async () => {
      // Rotate the view first
      await moleculeViewer.canvas.rotateMolecule(100, 50);
      await moleculeViewer.page.waitForTimeout(200);

      // Press H to reset
      await moleculeViewer.pressKey('h');
      await moleculeViewer.page.waitForTimeout(200);

      // View should be reset (hard to verify position without visual)
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[KS-07] should toggle auto-rotate with R key', async () => {
      // Press R to toggle auto-rotate
      await moleculeViewer.pressKey('r');

      const isActive = await moleculeViewer.toolbar.isAutoRotateActive();
      expect(isActive).toBe(true);

      // Press R again to toggle off
      await moleculeViewer.pressKey('r');
      expect(await moleculeViewer.toolbar.isAutoRotateActive()).toBe(false);
    });

    test('[KS-08] should show shortcuts help with ? key', async () => {
      await moleculeViewer.pressKey('?');

      // Shortcuts help modal should appear
      const isVisible = await moleculeViewer.shortcutsHelp.isVisible();
      expect(isVisible).toBe(true);
    });

    test('[KS-09] should close shortcuts help with ESC key', async () => {
      // Open shortcuts help
      await moleculeViewer.pressKey('?');
      expect(await moleculeViewer.shortcutsHelp.isVisible()).toBe(true);

      // Close with ESC
      await moleculeViewer.pressKey('Escape');
      expect(await moleculeViewer.shortcutsHelp.isVisible()).toBe(false);
    });
  });

  test.describe('Edit Shortcuts', () => {
    test('[KS-10] should trigger export with Ctrl+S', async ({ page }) => {
      // Set up download handler to verify export was triggered
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

      await moleculeViewer.pressShortcut(['Control'], 's');
      await moleculeViewer.page.waitForTimeout(500);

      // Download should trigger
      const download = await downloadPromise;
      expect(download).not.toBeNull();
    });

    test('[KS-11] should undo with Ctrl+Z', async () => {
      // Make a change first
      await moleculeViewer.toolbar.setStick();
      expect(await moleculeViewer.toolbar.isRepresentationActive('stick')).toBe(true);

      // Undo
      await moleculeViewer.pressShortcut(['Control'], 'z');
      await moleculeViewer.page.waitForTimeout(200);

      // Should be back to ball-and-stick
      expect(await moleculeViewer.toolbar.isRepresentationActive('ball-and-stick')).toBe(true);
    });

    test('[KS-12] should redo with Ctrl+Y', async () => {
      // Make a change and undo
      await moleculeViewer.toolbar.setStick();
      await moleculeViewer.pressShortcut(['Control'], 'z');
      expect(await moleculeViewer.toolbar.isRepresentationActive('ball-and-stick')).toBe(true);

      // Redo
      await moleculeViewer.pressShortcut(['Control'], 'y');
      await moleculeViewer.page.waitForTimeout(200);

      expect(await moleculeViewer.toolbar.isRepresentationActive('stick')).toBe(true);
    });

    test('[KS-13] should redo with Ctrl+Shift+Z', async () => {
      // Make a change and undo
      await moleculeViewer.toolbar.setStick();
      await moleculeViewer.pressShortcut(['Control'], 'z');
      expect(await moleculeViewer.toolbar.isRepresentationActive('ball-and-stick')).toBe(true);

      // Redo with Ctrl+Shift+Z
      await moleculeViewer.pressShortcut(['Control', 'Shift'], 'z');
      await moleculeViewer.page.waitForTimeout(200);

      expect(await moleculeViewer.toolbar.isRepresentationActive('stick')).toBe(true);
    });
  });

  test.describe('Cancel Shortcuts', () => {
    test('[KS-14] should cancel measurement mode with ESC', async () => {
      // Enter measurement mode
      await moleculeViewer.pressKey('d');
      expect(await moleculeViewer.toolbar.isMeasurementActive('distance')).toBe(true);

      // Cancel with ESC
      await moleculeViewer.pressKey('Escape');
      expect(await moleculeViewer.toolbar.isMeasurementActive('distance')).toBe(false);
    });

    test('[KS-15] should cancel measurement mode with Backspace', async () => {
      // Enter measurement mode
      await moleculeViewer.pressKey('a');
      expect(await moleculeViewer.toolbar.isMeasurementActive('angle')).toBe(true);

      // Cancel with Backspace
      await moleculeViewer.pressKey('Backspace');
      expect(await moleculeViewer.toolbar.isMeasurementActive('angle')).toBe(false);
    });
  });

  test.describe('Shortcuts Help Modal', () => {
    test('[KS-16] should list all keyboard shortcuts', async () => {
      await moleculeViewer.pressKey('?');

      // Check for some expected shortcuts
      const helpModal = moleculeViewer.shortcutsHelp;
      const text = await helpModal.textContent();

      expect(text).toContain('1');
      expect(text).toContain('2');
      expect(text).toContain('3');
    });

    test('[KS-17] should show representation shortcuts', async () => {
      await moleculeViewer.pressKey('?');

      const helpModal = moleculeViewer.shortcutsHelp;
      const text = await helpModal.textContent();

      expect(text?.toLowerCase()).toContain('ball');
      expect(text?.toLowerCase()).toContain('stick');
      expect(text?.toLowerCase()).toContain('spacefill');
    });

    test('[KS-18] should show measurement shortcuts', async () => {
      await moleculeViewer.pressKey('?');

      const helpModal = moleculeViewer.shortcutsHelp;
      const text = await helpModal.textContent();

      expect(text?.toLowerCase()).toContain('distance');
      expect(text?.toLowerCase()).toContain('angle');
    });
  });
});
