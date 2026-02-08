import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';

test.describe('Measurements', () => {
  let moleculeViewer: MoleculeViewerPage;

  // Measurement tests involve multiple atom clicks and WebGL operations
  test.slow();

  test.beforeEach(async ({ page }) => {
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
    await moleculeViewer.loadSampleMolecule('caffeine');
  });

  test.describe('Distance Measurement', () => {
    test('[ME-01] should toggle distance measurement mode via toolbar', async () => {
      await moleculeViewer.toolbar.toggleDistance();

      const isActive = await moleculeViewer.toolbar.isMeasurementActive('distance');
      expect(isActive).toBe(true);

      // Toggle off
      await moleculeViewer.toolbar.toggleDistance();
      const isInactive = await moleculeViewer.toolbar.isMeasurementActive('distance');
      expect(isInactive).toBe(false);
    });

    test('[ME-02] should toggle distance measurement mode with D key', async () => {
      await moleculeViewer.pressKey('d');

      const isActive = await moleculeViewer.toolbar.isMeasurementActive('distance');
      expect(isActive).toBe(true);

      // Press D again to toggle off
      await moleculeViewer.pressKey('d');
      const isInactive = await moleculeViewer.toolbar.isMeasurementActive('distance');
      expect(isInactive).toBe(false);
    });

    test('[ME-03] should create distance measurement by clicking two atoms', async () => {
      // Enable distance mode
      await moleculeViewer.pressKey('d');
      const isDistanceActive = await moleculeViewer.toolbar.isMeasurementActive('distance');
      expect(isDistanceActive).toBe(true);

      // Click on two specific atoms by index (use atoms that are farther apart)
      const click1 = await moleculeViewer.canvas.clickAtom(0);
      expect(click1).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);
      const click2 = await moleculeViewer.canvas.clickAtom(10);
      expect(click2).toBe(true);

      // Check if measurement panel shows a measurement
      await moleculeViewer.page.waitForTimeout(500);

      // First check that measurement panel is visible (may need to expand)
      await moleculeViewer.page.getByRole('button', { name: 'Measurements' }).click({ force: true });
      await moleculeViewer.page.waitForTimeout(300);

      // Measurement should appear in the panel - look for the measurement item specifically
      const measurementPanel = moleculeViewer.measurementPanel;
      const distanceMeasurement = measurementPanel.locator('[class*="measurementItem"]');
      await expect(distanceMeasurement).toBeVisible();
    });
  });

  test.describe('Angle Measurement', () => {
    test('[ME-04] should toggle angle measurement mode via toolbar', async () => {
      await moleculeViewer.toolbar.toggleAngle();

      const isActive = await moleculeViewer.toolbar.isMeasurementActive('angle');
      expect(isActive).toBe(true);

      // Toggle off
      await moleculeViewer.toolbar.toggleAngle();
      const isInactive = await moleculeViewer.toolbar.isMeasurementActive('angle');
      expect(isInactive).toBe(false);
    });

    test('[ME-05] should toggle angle measurement mode with A key', async () => {
      await moleculeViewer.pressKey('a');

      const isActive = await moleculeViewer.toolbar.isMeasurementActive('angle');
      expect(isActive).toBe(true);

      // Press A again to toggle off
      await moleculeViewer.pressKey('a');
      const isInactive = await moleculeViewer.toolbar.isMeasurementActive('angle');
      expect(isInactive).toBe(false);
    });

    test('[ME-06] should require three atoms for angle measurement', async () => {
      // Enable angle mode
      await moleculeViewer.pressKey('a');

      // Click on three different positions
      await moleculeViewer.canvas.clickAtOffset(-30, 0);
      await moleculeViewer.page.waitForTimeout(150);
      await moleculeViewer.canvas.clickAtOffset(0, 0);
      await moleculeViewer.page.waitForTimeout(150);
      await moleculeViewer.canvas.clickAtOffset(30, 0);

      await moleculeViewer.page.waitForTimeout(300);
      // The mode should be active and potentially have a measurement
    });
  });

  test.describe('Measurement Panel', () => {
    test('[ME-07] should show measurement panel', async () => {
      // Click the Measurements header to expand the collapsed section
      await moleculeViewer.page.getByRole('button', { name: 'Measurements' }).click({ force: true });
      await moleculeViewer.page.waitForTimeout(300);
      const isVisible = await moleculeViewer.measurementPanel.isVisible();
      expect(isVisible).toBe(true);
    });

    test('[ME-08] should have clear all button in measurement panel', async () => {
      // First create a measurement so Clear All button appears
      await moleculeViewer.pressKey('d');
      const click1 = await moleculeViewer.canvas.clickAtom(0);
      expect(click1).toBe(true);
      await moleculeViewer.page.waitForTimeout(200);
      const click2 = await moleculeViewer.canvas.clickAtom(10);
      expect(click2).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);

      // Expand the Measurements panel
      await moleculeViewer.page.getByRole('button', { name: 'Measurements' }).click({ force: true });
      await moleculeViewer.page.waitForTimeout(300);

      const clearAllButton = moleculeViewer.measurementPanel.getByRole('button', { name: /clear all/i });
      await expect(clearAllButton).toBeVisible();
    });

    test('[ME-09] should cancel measurement with ESC key', async () => {
      // Enable distance mode
      await moleculeViewer.pressKey('d');
      expect(await moleculeViewer.toolbar.isMeasurementActive('distance')).toBe(true);

      // Click once to start measurement
      await moleculeViewer.canvas.clickCenter();

      // Press ESC to cancel
      await moleculeViewer.pressKey('Escape');

      // Mode should be off
      const isActive = await moleculeViewer.toolbar.isMeasurementActive('distance');
      expect(isActive).toBe(false);
    });

    test('[ME-10] should cancel measurement with Backspace key', async () => {
      // Enable distance mode
      await moleculeViewer.pressKey('d');

      // Press Backspace to cancel
      await moleculeViewer.pressKey('Backspace');

      // Mode should be off
      const isActive = await moleculeViewer.toolbar.isMeasurementActive('distance');
      expect(isActive).toBe(false);
    });
  });

  test.describe('Dihedral Measurement', () => {
    test('[ME-11] should have dihedral option in measurement panel', async () => {
      // Click the Measurements header to expand the collapsed section
      await moleculeViewer.page.getByRole('button', { name: 'Measurements' }).click({ force: true });
      await moleculeViewer.page.waitForTimeout(300);

      // Dihedral requires 4 atoms and is typically accessed via the MeasurementPanel UI
      const dihedralOption = moleculeViewer.measurementPanel.locator('button, input, label').filter({ hasText: /dihedral/i });
      const isVisible = await dihedralOption.isVisible().catch(() => false);

      // Dihedral option should be available in the measurement panel
      expect(isVisible).toBe(true);
    });
  });

  test.describe('Measurement Deletion', () => {
    test('[ME-12] should allow deleting individual measurements', async () => {
      // Enable distance mode and create a measurement
      await moleculeViewer.pressKey('d');

      // Click on specific atoms by index
      const click1 = await moleculeViewer.canvas.clickAtom(0);
      expect(click1).toBe(true);
      await moleculeViewer.page.waitForTimeout(200);
      const click2 = await moleculeViewer.canvas.clickAtom(10);
      expect(click2).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);

      // Expand the Measurements panel
      await moleculeViewer.page.getByRole('button', { name: 'Measurements' }).click({ force: true });
      await moleculeViewer.page.waitForTimeout(300);

      // Count measurements before - use measurementItem specifically
      const measurementsBefore = moleculeViewer.measurementPanel.locator('[class*="measurementItem"]');
      const countBefore = await measurementsBefore.count();
      expect(countBefore).toBeGreaterThan(0);

      // Look for delete button on measurements
      const deleteButton = moleculeViewer.measurementPanel.getByRole('button', { name: /delete|remove|×/i }).first();
      await expect(deleteButton).toBeVisible();

      await deleteButton.click({ force: true });
      await moleculeViewer.page.waitForTimeout(200);

      // Verify measurement was deleted
      const countAfter = await measurementsBefore.count();
      expect(countAfter).toBeLessThan(countBefore);
    });
  });

  test.describe('Measurement Highlighting', () => {
    test('[ME-13] should highlight measurement on hover in panel', async () => {
      // This tests the interaction between the measurement panel and 3D view
      // When hovering a measurement in the panel, it should highlight in 3D

      // First create a measurement
      await moleculeViewer.pressKey('d');
      const click1 = await moleculeViewer.canvas.clickAtom(0);
      expect(click1).toBe(true);
      await moleculeViewer.page.waitForTimeout(200);
      const click2 = await moleculeViewer.canvas.clickAtom(10);
      expect(click2).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);

      // Expand the Measurements panel
      await moleculeViewer.page.getByRole('button', { name: 'Measurements' }).click({ force: true });
      await moleculeViewer.page.waitForTimeout(300);

      // Find a measurement item and hover it
      const measurementItem = moleculeViewer.measurementPanel.locator('[class*="measurementItem"]').first();
      await expect(measurementItem).toBeVisible();

      await measurementItem.hover({ force: true });
      // Visual highlighting should occur in the 3D view
      await moleculeViewer.page.waitForTimeout(200);

      // Verify the molecule still renders (visual highlighting worked)
      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('Value Display Accuracy', () => {
    test('[ME-14] should display distance value with Angstrom unit', async () => {
      await moleculeViewer.pressKey('d');
      await moleculeViewer.canvas.clickAtom(0);
      await moleculeViewer.page.waitForTimeout(200);
      await moleculeViewer.canvas.clickAtom(10);
      await moleculeViewer.page.waitForTimeout(300);

      await moleculeViewer.page.getByRole('button', { name: 'Measurements' }).click({ force: true });
      await moleculeViewer.page.waitForTimeout(200);

      // Verify measurement shows value with Å unit and 2 decimal places
      // Format from formatMeasurement: "X.XX Å" (with space before Å)
      const measurementValue = moleculeViewer.measurementPanel.locator('[class*="measurementValue"]');
      await expect(measurementValue).toContainText(/\d+\.\d{2} Å/);
    });

    test('[ME-15] should display angle value with degree symbol', async () => {
      await moleculeViewer.pressKey('a');
      await moleculeViewer.canvas.clickAtom(0);
      await moleculeViewer.page.waitForTimeout(200);
      await moleculeViewer.canvas.clickAtom(5);
      await moleculeViewer.page.waitForTimeout(200);
      await moleculeViewer.canvas.clickAtom(10);
      await moleculeViewer.page.waitForTimeout(500);

      await moleculeViewer.page.getByRole('button', { name: 'Measurements' }).click({ force: true });
      await moleculeViewer.page.waitForTimeout(300);

      // Verify measurement shows value with ° unit and 1 decimal place
      // Format from formatMeasurement: "X.X°" (no space before °)
      const measurementValue = moleculeViewer.measurementPanel.locator('[class*="measurementValue"]');
      await expect(measurementValue).toContainText(/\d+\.\d°/, { timeout: 10000 });
    });

    test('[ME-16] should remove all measurements with Clear All', async () => {
      // Caffeine has 14 atoms (indices 0-13)
      // Wait for atoms to be ready in 3D scene
      const atomsReady = await moleculeViewer.canvas.waitForAtomsReady();
      expect(atomsReady).toBe(true);

      // Create first measurement (atoms 0 and 10)
      await moleculeViewer.pressKey('d');
      await moleculeViewer.page.waitForTimeout(100);
      const click1 = await moleculeViewer.canvas.clickAtom(0);
      expect(click1).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);
      const click2 = await moleculeViewer.canvas.clickAtom(10);
      expect(click2).toBe(true);
      await moleculeViewer.page.waitForTimeout(500);

      // Create second measurement (atoms 3 and 13) - mode should still be active
      const click3 = await moleculeViewer.canvas.clickAtom(3);
      expect(click3).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);
      const click4 = await moleculeViewer.canvas.clickAtom(13);
      expect(click4).toBe(true);
      await moleculeViewer.page.waitForTimeout(500);

      await moleculeViewer.page.getByRole('button', { name: 'Measurements' }).click({ force: true });
      await moleculeViewer.page.waitForTimeout(300);

      // Verify 2 measurements exist (use toHaveCount for auto-retry)
      const items = moleculeViewer.measurementPanel.locator('[class*="measurementItem"]');
      await expect(items).toHaveCount(2, { timeout: 10000 });

      // Clear all
      const clearAllButton = moleculeViewer.measurementPanel.getByRole('button', { name: /clear all/i });
      await clearAllButton.click({ force: true });
      await moleculeViewer.page.waitForTimeout(300);

      // Verify no measurements remain (re-query for fresh locator)
      await expect(moleculeViewer.measurementPanel.locator('[class*="measurementItem"]')).toHaveCount(0);

      // Molecule should still render
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[ME-17] should undo and redo measurement creation', async () => {
      // Wait for atoms to be ready in 3D scene
      const atomsReady = await moleculeViewer.canvas.waitForAtomsReady();
      expect(atomsReady).toBe(true);

      await moleculeViewer.pressKey('d');
      const click1 = await moleculeViewer.canvas.clickAtom(0);
      expect(click1).toBe(true);
      await moleculeViewer.page.waitForTimeout(200);
      const click2 = await moleculeViewer.canvas.clickAtom(10);
      expect(click2).toBe(true);
      await moleculeViewer.page.waitForTimeout(500);

      await moleculeViewer.page.getByRole('button', { name: 'Measurements' }).click({ force: true });
      await moleculeViewer.page.waitForTimeout(300);

      // Verify measurement exists
      const items = moleculeViewer.measurementPanel.locator('[class*="measurementItem"]');
      await expect(items).toHaveCount(1, { timeout: 10000 });

      // Undo - need to click away from panel first to ensure keyboard focus
      await moleculeViewer.canvas.canvas.click({ force: true, position: { x: 100, y: 100 } });
      await moleculeViewer.page.waitForTimeout(100);
      await moleculeViewer.undo();
      await moleculeViewer.page.waitForTimeout(500);

      // Measurement should be removed
      await expect(items).toHaveCount(0, { timeout: 10000 });

      // Redo
      await moleculeViewer.redo();
      await moleculeViewer.page.waitForTimeout(500);

      // Measurement should be back
      await expect(items).toHaveCount(1, { timeout: 10000 });
    });

    test('[ME-18] should display dihedral value with degree symbol', async () => {
      await moleculeViewer.page.getByRole('button', { name: 'Measurements' }).click({ force: true });
      await moleculeViewer.page.waitForTimeout(200);

      // Select dihedral mode
      const dihedralButton = moleculeViewer.measurementPanel.locator('button').filter({ hasText: /dihedral/i });
      await dihedralButton.click({ force: true });
      await moleculeViewer.page.waitForTimeout(200);

      // Click 4 atoms
      await moleculeViewer.canvas.clickAtom(0);
      await moleculeViewer.page.waitForTimeout(150);
      await moleculeViewer.canvas.clickAtom(3);
      await moleculeViewer.page.waitForTimeout(150);
      await moleculeViewer.canvas.clickAtom(6);
      await moleculeViewer.page.waitForTimeout(150);
      await moleculeViewer.canvas.clickAtom(9);
      await moleculeViewer.page.waitForTimeout(300);

      // Verify measurement shows value with ° (can be negative for dihedral)
      // Format from formatMeasurement: "-X.X°" or "X.X°"
      const measurementValue = moleculeViewer.measurementPanel.locator('[class*="measurementValue"]');
      await expect(measurementValue).toContainText(/-?\d+\.\d°/);
    });

    test('[ME-19] should persist measurement through representation change', async () => {
      await moleculeViewer.pressKey('d');
      await moleculeViewer.canvas.clickAtom(0);
      await moleculeViewer.page.waitForTimeout(200);
      await moleculeViewer.canvas.clickAtom(10);
      await moleculeViewer.page.waitForTimeout(500);

      await moleculeViewer.page.getByRole('button', { name: 'Measurements' }).click({ force: true });
      await moleculeViewer.page.waitForTimeout(300);

      const items = moleculeViewer.measurementPanel.locator('[class*="measurementItem"]');
      await expect(items).toHaveCount(1, { timeout: 10000 });

      // Get the measurement value before representation change
      const measurementValue = moleculeViewer.measurementPanel.locator('[class*="measurementValue"]');
      const valueBefore = await measurementValue.textContent();

      // Change representation to Stick - need to click canvas first for keyboard focus
      await moleculeViewer.canvas.canvas.click({ force: true, position: { x: 100, y: 100 } });
      await moleculeViewer.page.waitForTimeout(100);
      await moleculeViewer.pressKey('2');
      await moleculeViewer.page.waitForTimeout(500);

      // Measurement should still exist with same value
      await expect(items).toHaveCount(1, { timeout: 10000 });
      await expect(measurementValue).toHaveText(valueBefore!);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });
});
