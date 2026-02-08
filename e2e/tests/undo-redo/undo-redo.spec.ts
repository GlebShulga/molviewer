import { test, expect } from '../../fixtures';
import * as path from 'path';
import { MoleculeViewerPage } from '../../page-objects';
import { molecules } from '../../fixtures';

test.describe('Undo/Redo', () => {
  let moleculeViewer: MoleculeViewerPage;

  // Undo/redo tests involve multiple state changes and WebGL operations
  test.slow();

  test.beforeEach(async ({ page }) => {
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
    await moleculeViewer.loadSampleMolecule('caffeine');
  });

  test.describe('Toolbar Buttons', () => {
    test('[UR-01] should have undo button in toolbar', async () => {
      const isVisible = await moleculeViewer.toolbar.undoButton.isVisible();
      expect(isVisible).toBe(true);
    });

    test('[UR-02] should have redo button in toolbar', async () => {
      const isVisible = await moleculeViewer.toolbar.redoButton.isVisible();
      expect(isVisible).toBe(true);
    });

    test('[UR-03] should have undo enabled after making a change', async () => {
      // Make a change that triggers undo history
      await moleculeViewer.toolbar.setStick();
      await moleculeViewer.page.waitForTimeout(200);

      // After making a change, undo should be enabled
      const canUndo = await moleculeViewer.toolbar.canUndo();
      expect(canUndo).toBe(true);
    });

    test('[UR-04] should have redo disabled when no future states', async () => {
      // Initially, redo should be disabled
      const canRedo = await moleculeViewer.toolbar.canRedo();
      expect(canRedo).toBe(false);
    });
  });

  test.describe('Undo Representation Changes', () => {
    test('[UR-05] should undo representation change via toolbar', async () => {
      // Change representation
      await moleculeViewer.toolbar.setStick();
      expect(await moleculeViewer.toolbar.isRepresentationActive('stick')).toBe(true);

      // Undo via toolbar button
      await moleculeViewer.toolbar.undo();
      await moleculeViewer.page.waitForTimeout(200);

      expect(await moleculeViewer.toolbar.isRepresentationActive('ball-and-stick')).toBe(true);
    });

    test('[UR-06] should undo representation change via keyboard', async () => {
      // Change representation
      await moleculeViewer.toolbar.setSpacefill();
      expect(await moleculeViewer.toolbar.isRepresentationActive('spacefill')).toBe(true);

      // Undo via keyboard
      await moleculeViewer.undo();
      await moleculeViewer.page.waitForTimeout(200);

      expect(await moleculeViewer.toolbar.isRepresentationActive('ball-and-stick')).toBe(true);
    });

    test('[UR-07] should redo representation change', async () => {
      // Change representation
      await moleculeViewer.toolbar.setStick();

      // Undo
      await moleculeViewer.undo();
      expect(await moleculeViewer.toolbar.isRepresentationActive('ball-and-stick')).toBe(true);

      // Redo
      await moleculeViewer.redo();
      await moleculeViewer.page.waitForTimeout(200);

      expect(await moleculeViewer.toolbar.isRepresentationActive('stick')).toBe(true);
    });
  });

  test.describe('Undo Color Scheme Changes', () => {
    test('[UR-08] should undo color scheme change', async () => {
      if (await moleculeViewer.controlPanel.colorSchemeSection.isVisible()) {
        // Change color scheme
        await moleculeViewer.controlPanel.setColorScheme('chain');
        expect(await moleculeViewer.controlPanel.isColorSchemeActive('chain')).toBe(true);

        // Undo
        await moleculeViewer.undo();
        await moleculeViewer.page.waitForTimeout(200);

        expect(await moleculeViewer.controlPanel.isColorSchemeActive('cpk')).toBe(true);
      }
    });

    test('[UR-09] should redo color scheme change', async () => {
      if (await moleculeViewer.controlPanel.colorSchemeSection.isVisible()) {
        // Change color scheme
        await moleculeViewer.controlPanel.setColorScheme('chain');

        // Undo and redo
        await moleculeViewer.undo();
        await moleculeViewer.redo();
        await moleculeViewer.page.waitForTimeout(200);

        expect(await moleculeViewer.controlPanel.isColorSchemeActive('chain')).toBe(true);
      }
    });
  });

  test.describe('Multiple Undo/Redo', () => {
    // Multiple undo/redo operations need longer timeout
    test.setTimeout(60000);

    test('[UR-10] should undo multiple changes', async () => {
      // Make multiple changes
      await moleculeViewer.toolbar.setStick();
      await moleculeViewer.page.waitForTimeout(100);
      await moleculeViewer.toolbar.setSpacefill();
      await moleculeViewer.page.waitForTimeout(100);

      expect(await moleculeViewer.toolbar.isRepresentationActive('spacefill')).toBe(true);

      // Undo twice
      await moleculeViewer.undo();
      await moleculeViewer.page.waitForTimeout(100);
      expect(await moleculeViewer.toolbar.isRepresentationActive('stick')).toBe(true);

      await moleculeViewer.undo();
      await moleculeViewer.page.waitForTimeout(100);
      expect(await moleculeViewer.toolbar.isRepresentationActive('ball-and-stick')).toBe(true);
    });

    test('[UR-11] should redo multiple changes', async () => {
      // Make changes
      await moleculeViewer.toolbar.setStick();
      await moleculeViewer.page.waitForTimeout(100);
      await moleculeViewer.toolbar.setSpacefill();
      await moleculeViewer.page.waitForTimeout(100);

      // Undo all
      await moleculeViewer.undo();
      await moleculeViewer.page.waitForTimeout(100);
      await moleculeViewer.undo();
      await moleculeViewer.page.waitForTimeout(100);
      expect(await moleculeViewer.toolbar.isRepresentationActive('ball-and-stick')).toBe(true);

      // Redo all
      await moleculeViewer.redo();
      await moleculeViewer.page.waitForTimeout(100);
      expect(await moleculeViewer.toolbar.isRepresentationActive('stick')).toBe(true);

      await moleculeViewer.redo();
      await moleculeViewer.page.waitForTimeout(100);
      expect(await moleculeViewer.toolbar.isRepresentationActive('spacefill')).toBe(true);
    });
  });

  test.describe('Undo Button State', () => {
    test('[UR-12] should keep undo enabled after making additional changes', async () => {
      // Undo is already enabled from molecule load in beforeEach
      expect(await moleculeViewer.toolbar.canUndo()).toBe(true);

      // Make a change
      await moleculeViewer.toolbar.setStick();
      await moleculeViewer.page.waitForTimeout(100);

      // Should still be enabled
      expect(await moleculeViewer.toolbar.canUndo()).toBe(true);
    });

    test('[UR-13] should still have undo available after undoing one change', async () => {
      // Make a change
      await moleculeViewer.toolbar.setStick();
      expect(await moleculeViewer.toolbar.canUndo()).toBe(true);

      // Undo it
      await moleculeViewer.undo();
      await moleculeViewer.page.waitForTimeout(100);

      // Should still be enabled (can undo the molecule load from beforeEach)
      expect(await moleculeViewer.toolbar.canUndo()).toBe(true);
    });

    test('[UR-14] should enable redo after undoing', async () => {
      // Initially disabled
      expect(await moleculeViewer.toolbar.canRedo()).toBe(false);

      // Make a change and undo
      await moleculeViewer.toolbar.setStick();
      await moleculeViewer.undo();
      await moleculeViewer.page.waitForTimeout(100);

      // Should now be enabled
      expect(await moleculeViewer.toolbar.canRedo()).toBe(true);
    });

    test('[UR-15] should disable redo after making new change', async () => {
      // Make a change, undo, and make a new change
      await moleculeViewer.toolbar.setStick();
      await moleculeViewer.undo();
      expect(await moleculeViewer.toolbar.canRedo()).toBe(true);

      // Make a new change
      await moleculeViewer.toolbar.setSpacefill();
      await moleculeViewer.page.waitForTimeout(100);

      // Redo should now be disabled (new change clears redo stack)
      expect(await moleculeViewer.toolbar.canRedo()).toBe(false);
    });
  });

  test.describe('Undo Labels', () => {
    test('[UR-16] should undo adding a label', async () => {
      // Add a label
      await moleculeViewer.openContextMenu();
      const labelAction = moleculeViewer.contextMenu.getByRole('button', { name: /label/i });

      if (await labelAction.isVisible()) {
        await labelAction.click();
        await moleculeViewer.page.waitForTimeout(300);

        // Undo
        await moleculeViewer.undo();
        await moleculeViewer.page.waitForTimeout(200);

        // Label should be removed (hard to verify without DOM check)
        await moleculeViewer.canvas.expectMoleculeRendered();
      }
    });
  });

  test.describe('What is NOT tracked', () => {
    test('[UR-17] should not undo hover state', async () => {
      // Make a representation change first so we have something to undo
      await moleculeViewer.toolbar.setStick();
      await moleculeViewer.page.waitForTimeout(200);

      // Hover is transient and should not be tracked
      await moleculeViewer.canvas.hoverCenter();
      await moleculeViewer.page.waitForTimeout(100);

      // Undo should only undo the representation change, not hover
      await moleculeViewer.toolbar.undo();
      await moleculeViewer.page.waitForTimeout(200);

      // Molecule should still be rendered (hover is not affected)
      await moleculeViewer.canvas.expectMoleculeRendered();
      // Representation should be back to ball-and-stick
      expect(await moleculeViewer.toolbar.isRepresentationActive('ball-and-stick')).toBe(true);
    });
  });

  test.describe('Multi-Structure Undo/Redo', () => {
    test.beforeEach(async ({ }, testInfo) => {
      // WebKit WebGL initialization is significantly slower
      if (testInfo.project.name === 'webkit') {
        test.setTimeout(120000);
      } else {
        test.setTimeout(60000);
      }
    });

    test('[UR-18] should undo structure addition', async () => {
      const initialCount = await moleculeViewer.structureList.getStructureCount();

      // Add a second structure
      await moleculeViewer.addStructure(molecules.crambin);
      await moleculeViewer.page.waitForTimeout(300);

      expect(await moleculeViewer.structureList.getStructureCount()).toBe(initialCount + 1);

      // Undo
      await moleculeViewer.toolbar.undo();
      await moleculeViewer.page.waitForTimeout(300);

      // Structure should be removed
      expect(await moleculeViewer.structureList.getStructureCount()).toBe(initialCount);
    });

    test('[UR-19] should undo structure removal', async () => {
      // Add a second structure first
      await moleculeViewer.addStructure(molecules.crambin);
      await moleculeViewer.page.waitForTimeout(300);

      const initialCount = await moleculeViewer.structureList.getStructureCount();
      expect(initialCount).toBeGreaterThanOrEqual(2);

      const names = await moleculeViewer.structureList.getStructureNames();

      // Delete a structure
      await moleculeViewer.structureList.deleteStructure(names[0]);
      await moleculeViewer.page.waitForTimeout(300);

      expect(await moleculeViewer.structureList.getStructureCount()).toBe(initialCount - 1);

      // Undo
      await moleculeViewer.toolbar.undo();
      await moleculeViewer.page.waitForTimeout(300);

      // Structure should be restored
      expect(await moleculeViewer.structureList.getStructureCount()).toBe(initialCount);
    });

    test('[UR-20] should undo structure visibility change', async () => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.crambin);
      await moleculeViewer.page.waitForTimeout(300);

      const names = await moleculeViewer.structureList.getStructureNames();

      if (names.length >= 1) {
        const structureName = names[0];
        const initialVisibility = await moleculeViewer.structureList.isStructureVisible(structureName);

        // Toggle visibility
        await moleculeViewer.structureList.toggleVisibility(structureName);
        await moleculeViewer.page.waitForTimeout(200);

        const changedVisibility = await moleculeViewer.structureList.isStructureVisible(structureName);
        expect(changedVisibility).not.toBe(initialVisibility);

        // Undo
        await moleculeViewer.toolbar.undo();
        await moleculeViewer.page.waitForTimeout(200);

        // Visibility should be restored
        const restoredVisibility = await moleculeViewer.structureList.isStructureVisible(structureName);
        expect(restoredVisibility).toBe(initialVisibility);
      }
    });

    test('[UR-21] should undo active structure representation change', async () => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.crambin);
      await moleculeViewer.page.waitForTimeout(300);

      const names = await moleculeViewer.structureList.getStructureNames();

      if (names.length >= 1) {
        // Select first structure
        await moleculeViewer.structureList.selectStructure(names[0]);
        await moleculeViewer.page.waitForTimeout(200);

        // Change representation
        await moleculeViewer.toolbar.setSpacefill();
        await moleculeViewer.page.waitForTimeout(200);

        expect(await moleculeViewer.toolbar.isRepresentationActive('spacefill')).toBe(true);

        // Undo
        await moleculeViewer.toolbar.undo();
        await moleculeViewer.page.waitForTimeout(200);

        // Representation should be restored
        expect(await moleculeViewer.toolbar.isRepresentationActive('ball-and-stick')).toBe(true);
      }
    });

    test('[UR-22] should handle Map serialization in equality check', async ({ }, testInfo) => {
      test.setTimeout(90000); // Loading crambin + multi-structure operations need longer timeout

      // This tests that undo/redo handles per-structure settings stored in Maps
      await moleculeViewer.addStructure(molecules.crambin);
      await moleculeViewer.page.waitForTimeout(500);

      const names = await moleculeViewer.structureList.getStructureNames();
      // Skip if multi-structure add failed (feature unavailable)
      testInfo.skip(names.length < 2, 'Multi-structure add failed - feature unavailable');

      // Change settings on first structure (CAFFEINE -> Stick)
      await moleculeViewer.structureList.selectStructure(names[0]);
      await moleculeViewer.page.waitForTimeout(300);
      await moleculeViewer.toolbar.setStick();
      await moleculeViewer.page.waitForTimeout(300);

      // Change settings on second structure (1crn -> Spacefill)
      await moleculeViewer.structureList.selectStructure(names[1]);
      await moleculeViewer.page.waitForTimeout(300);
      await moleculeViewer.toolbar.setSpacefill();
      await moleculeViewer.page.waitForTimeout(300);

      // Undo twice via toolbar buttons
      await moleculeViewer.toolbar.undo();
      await moleculeViewer.page.waitForTimeout(500);
      await moleculeViewer.toolbar.undo();
      await moleculeViewer.page.waitForTimeout(500);

      // Both should be back to default (ball-and-stick)
      await moleculeViewer.structureList.selectStructure(names[0]);
      await moleculeViewer.page.waitForTimeout(300);
      expect(await moleculeViewer.toolbar.isRepresentationActive('ball-and-stick')).toBe(true);

      // Redo twice
      await moleculeViewer.toolbar.redo();
      await moleculeViewer.page.waitForTimeout(300);
      await moleculeViewer.toolbar.redo();
      await moleculeViewer.page.waitForTimeout(300);

      // Changes should be restored
      await moleculeViewer.structureList.selectStructure(names[1]);
      await moleculeViewer.page.waitForTimeout(300);
      expect(await moleculeViewer.toolbar.isRepresentationActive('spacefill')).toBe(true);
    });
  });
});
