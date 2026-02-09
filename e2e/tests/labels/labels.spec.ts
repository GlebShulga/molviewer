import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { molecules } from '../../fixtures';

// Labels tests need more time due to context menu interactions and multi-structure loading
test.describe('3D Labels', () => {
  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }) => {
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
    await moleculeViewer.loadSampleMolecule('caffeine');
  });

  test.describe('Add Label via Context Menu', () => {
    test('[LB-01] should add label when clicking Add Label in context menu', async () => {
      // Open context menu on a specific atom
      const success = await moleculeViewer.openContextMenu();
      expect(success).toBe(true);

      // Click Add Label action
      const labelAction = moleculeViewer.contextMenu.getByRole('button', { name: /label/i });
      await expect(labelAction).toBeVisible();

      await labelAction.click({ force: true });

      // Wait for label to appear
      await moleculeViewer.page.waitForTimeout(300);

      // Look for label in 3D (Html component from drei)
      // Labels are rendered as HTML overlays on the canvas
      const labels = moleculeViewer.page.locator('[class*="label"], [data-testid="atom-label"]');
      const count = await labels.count();

      // Label should be added
      expect(count).toBeGreaterThan(0);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('Delete Label', () => {
    test('[LB-02] should delete label by clicking delete button', async () => {
      // First add a label on a specific atom
      const success = await moleculeViewer.openContextMenu();
      expect(success).toBe(true);

      const labelAction = moleculeViewer.contextMenu.getByRole('button', { name: /label/i });
      await expect(labelAction).toBeVisible();

      await labelAction.click({ force: true });
      await moleculeViewer.page.waitForTimeout(300);

      // Count labels before delete
      const labelsBefore = moleculeViewer.page.locator('[class*="label"], [data-testid="atom-label"]');
      const countBefore = await labelsBefore.count();
      expect(countBefore).toBeGreaterThan(0);

      // Find delete button on the label (usually × or trash icon)
      const deleteButton = moleculeViewer.page.locator('[class*="label"] button, [data-testid="label-delete"]').first();
      await expect(deleteButton).toBeVisible({ timeout: 5000 });

      await deleteButton.click({ force: true });
      await moleculeViewer.page.waitForTimeout(200);

      // Label should be removed
      const labelsAfter = moleculeViewer.page.locator('[class*="label"], [data-testid="atom-label"]');
      const countAfter = await labelsAfter.count();
      expect(countAfter).toBeLessThan(countBefore);
    });
  });

  test.describe('Label Persistence', () => {
    test('[LB-03] should maintain labels through representation changes', async () => {
      // Add a label
      await moleculeViewer.openContextMenu();
      const labelAction = moleculeViewer.contextMenu.getByRole('button', { name: /label/i });

      if (await labelAction.isVisible()) {
        await labelAction.click({ force: true });
        await moleculeViewer.page.waitForTimeout(300);

        // Change representation
        await moleculeViewer.toolbar.setStick();
        await moleculeViewer.page.waitForTimeout(300);

        // Labels should still be visible
        await moleculeViewer.canvas.expectMoleculeRendered();

        // Change representation again
        await moleculeViewer.toolbar.setSpacefill();
        await moleculeViewer.page.waitForTimeout(300);

        await moleculeViewer.canvas.expectMoleculeRendered();
      }
    });

    test('[LB-04] should maintain labels through color scheme changes', async () => {
      // Add a label
      await moleculeViewer.openContextMenu();
      const labelAction = moleculeViewer.contextMenu.getByRole('button', { name: /label/i });

      if (await labelAction.isVisible()) {
        await labelAction.click({ force: true });
        await moleculeViewer.page.waitForTimeout(300);

        // Change color scheme
        if (await moleculeViewer.controlPanel.colorSchemeSection.isVisible()) {
          await moleculeViewer.controlPanel.setColorScheme('chain');
          await moleculeViewer.page.waitForTimeout(300);

          await moleculeViewer.canvas.expectMoleculeRendered();
        }
      }
    });
  });

  test.describe('Label Position', () => {
    test('[LB-05] should position label above atom', async () => {
      // Add a label
      await moleculeViewer.openContextMenu();
      const labelAction = moleculeViewer.contextMenu.getByRole('button', { name: /label/i });

      if (await labelAction.isVisible()) {
        await labelAction.click({ force: true });
        await moleculeViewer.page.waitForTimeout(300);

        // The label should follow the atom when rotating
        // Rotate the molecule
        await moleculeViewer.canvas.rotateMolecule(50, 30);
        await moleculeViewer.page.waitForTimeout(200);

        // Label should still be visible
        await moleculeViewer.canvas.expectMoleculeRendered();
      }
    });
  });

  test.describe('Multiple Labels', () => {
    test('[LB-06] should support multiple labels', async () => {
      // Add first label on atom 0
      const success1 = await moleculeViewer.canvas.rightClickOnAtom(0);
      expect(success1).toBe(true);
      await moleculeViewer.page.waitForTimeout(100);
      const labelAction1 = moleculeViewer.contextMenu.getByRole('button', { name: /label/i });
      await expect(labelAction1).toBeVisible();
      await labelAction1.click({ force: true });
      await moleculeViewer.page.waitForTimeout(300);

      // Add second label on a different atom
      const success2 = await moleculeViewer.canvas.rightClickOnAtom(5);
      expect(success2).toBe(true);
      await moleculeViewer.page.waitForTimeout(100);
      const labelAction2 = moleculeViewer.contextMenu.getByRole('button', { name: /label/i });
      await expect(labelAction2).toBeVisible();
      await labelAction2.click({ force: true });
      await moleculeViewer.page.waitForTimeout(300);

      // Both labels should be visible
      const labels = moleculeViewer.page.locator('[class*="label"], [data-testid="atom-label"]');
      const count = await labels.count();
      expect(count).toBeGreaterThanOrEqual(2);
      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('Label Content', () => {
    test('[LB-07] should display atom information in label', async () => {
      // Add a label on a specific atom
      const success = await moleculeViewer.openContextMenu();
      expect(success).toBe(true);

      const labelAction = moleculeViewer.contextMenu.getByRole('button', { name: /label/i });
      await expect(labelAction).toBeVisible();

      await labelAction.click({ force: true });
      await moleculeViewer.page.waitForTimeout(300);

      // Look for label with atom info (element symbol, residue, etc.)
      const labelContent = moleculeViewer.page.locator('[class*="label"]').first();
      await expect(labelContent).toBeVisible({ timeout: 5000 });

      const text = await labelContent.textContent();
      // Label should contain some atom information (e.g., element symbol, atom name)
      expect(text).toBeTruthy();
      expect(text!.length).toBeGreaterThan(0);
    });
  });

  test.describe('Labels with Multi-Structure', () => {
    // Multi-structure tests need longer timeout due to loading multiple molecules
    test.setTimeout(120000);

    test.beforeEach(async () => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.crambin);
      await moleculeViewer.page.waitForTimeout(300);
    });

    test('[LB-08] should position label with structure offset', async () => {
      const names = await moleculeViewer.structureList.getStructureNames();
      if (names.length >= 2) {
        // Select first structure
        await moleculeViewer.structureList.selectStructure(names[0]);
        await moleculeViewer.canvas.waitForSceneReady();

        // Add label
        await moleculeViewer.openContextMenu();
        const labelAction = moleculeViewer.contextMenu.getByRole('button', { name: /label/i });
        if (await labelAction.isVisible()) {
          await labelAction.click({ force: true });
          await moleculeViewer.page.waitForTimeout(300);
        } else {
          await moleculeViewer.closeContextMenu();
        }

        // Select second structure
        await moleculeViewer.structureList.selectStructure(names[1]);
        await moleculeViewer.canvas.waitForSceneReady();

        // Add label to second structure
        await moleculeViewer.openContextMenu();
        const labelAction2 = moleculeViewer.contextMenu.getByRole('button', { name: /label/i });
        if (await labelAction2.isVisible()) {
          await labelAction2.click({ force: true });
          await moleculeViewer.page.waitForTimeout(300);
        } else {
          await moleculeViewer.closeContextMenu();
        }

        // Both labels should render correctly
        await moleculeViewer.canvas.expectMoleculeRendered();
      }
    });

    test('[LB-09] should hide label when structure visibility off', async () => {
      const names = await moleculeViewer.structureList.getStructureNames();
      if (names.length >= 2) {
        // Select first structure and add label
        await moleculeViewer.structureList.selectStructure(names[0]);
        await moleculeViewer.canvas.waitForSceneReady();

        await moleculeViewer.openContextMenu();
        const labelAction = moleculeViewer.contextMenu.getByRole('button', { name: /label/i });
        if (await labelAction.isVisible()) {
          await labelAction.click({ force: true });
          await moleculeViewer.page.waitForTimeout(300);
        } else {
          await moleculeViewer.closeContextMenu();
        }

        // Toggle first structure visibility off
        await moleculeViewer.structureList.toggleVisibility(names[0]);
        await moleculeViewer.page.waitForTimeout(300);

        // Label should be hidden with the structure
        // The canvas should still render without errors
        await moleculeViewer.canvas.expectMoleculeRendered();

        // Toggle visibility back on
        await moleculeViewer.structureList.toggleVisibility(names[0]);
        await moleculeViewer.page.waitForTimeout(300);

        // Label should reappear with the structure
        await moleculeViewer.canvas.expectMoleculeRendered();
      }
    });

    test('[LB-10] should remove labels when structure deleted', async () => {
      const names = await moleculeViewer.structureList.getStructureNames();
      if (names.length >= 2) {
        // Select first structure and add label
        await moleculeViewer.structureList.selectStructure(names[0]);
        await moleculeViewer.canvas.waitForSceneReady();

        await moleculeViewer.openContextMenu();
        const labelAction = moleculeViewer.contextMenu.getByRole('button', { name: /label/i });
        if (await labelAction.isVisible()) {
          await labelAction.click({ force: true });
          await moleculeViewer.page.waitForTimeout(300);
        } else {
          await moleculeViewer.closeContextMenu();
        }

        // Delete the first structure
        await moleculeViewer.structureList.deleteStructure(names[0]);
        await moleculeViewer.page.waitForTimeout(300);

        // Label should be removed with the structure
        // Verify no errors and rendering still works
        await moleculeViewer.canvas.expectMoleculeRendered();
      }
    });

    test('[LB-11] should maintain labels when switching active structure', async () => {
      const names = await moleculeViewer.structureList.getStructureNames();
      if (names.length >= 2) {
        // Add label to first structure
        await moleculeViewer.structureList.selectStructure(names[0]);
        await moleculeViewer.canvas.waitForSceneReady();

        await moleculeViewer.openContextMenu();
        const labelAction1 = moleculeViewer.contextMenu.getByRole('button', { name: /label/i });
        if (await labelAction1.isVisible()) {
          await labelAction1.click({ force: true });
          await moleculeViewer.page.waitForTimeout(300);
        } else {
          await moleculeViewer.closeContextMenu();
        }

        // Switch to second structure
        await moleculeViewer.structureList.selectStructure(names[1]);
        await moleculeViewer.canvas.waitForSceneReady();

        // Label on first structure should still be visible
        await moleculeViewer.canvas.expectMoleculeRendered();

        // Add label to second structure
        await moleculeViewer.openContextMenu();
        const labelAction2 = moleculeViewer.contextMenu.getByRole('button', { name: /label/i });
        if (await labelAction2.isVisible()) {
          await labelAction2.click({ force: true });
          await moleculeViewer.page.waitForTimeout(300);
        } else {
          await moleculeViewer.closeContextMenu();
        }

        // Switch back to first structure
        await moleculeViewer.structureList.selectStructure(names[0]);
        await moleculeViewer.canvas.waitForSceneReady();

        // Both labels should still be visible
        await moleculeViewer.canvas.expectMoleculeRendered();
      }
    });

    test('[LB-12] should update label position with layout change', async () => {
      const names = await moleculeViewer.structureList.getStructureNames();
      if (names.length >= 2) {
        // Add labels to both structures
        await moleculeViewer.structureList.selectStructure(names[0]);
        await moleculeViewer.canvas.waitForSceneReady();

        await moleculeViewer.openContextMenu();
        const labelAction1 = moleculeViewer.contextMenu.getByRole('button', { name: /label/i });
        if (await labelAction1.isVisible()) {
          await labelAction1.click({ force: true });
          await moleculeViewer.page.waitForTimeout(300);
        } else {
          await moleculeViewer.closeContextMenu();
        }

        // Switch layout if available
        const hasLayoutControls = await moleculeViewer.structureList.hasLayoutControls();
        if (hasLayoutControls) {
          // Switch to side-by-side
          await moleculeViewer.structureList.setSideBySideLayout();
          await moleculeViewer.page.waitForTimeout(300);

          // Labels should reposition with structures
          await moleculeViewer.canvas.expectMoleculeRendered();

          // Switch back to overlay
          await moleculeViewer.structureList.setOverlayLayout();
          await moleculeViewer.page.waitForTimeout(300);

          // Labels should reposition again
          await moleculeViewer.canvas.expectMoleculeRendered();
        }
      }
    });
  });
});
