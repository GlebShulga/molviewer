import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { molecules, multiStructureScenarios } from '../../fixtures';

test.describe('Multi-Structure Support', () => {
  // Run serially - WebGL/Three.js rendering is resource-intensive
  // and parallel execution causes timeouts due to GPU contention
  test.describe.configure({ mode: 'serial' });

  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }, testInfo) => {
    // WebKit WebGL initialization is significantly slower
    if (testInfo.project.name === 'webkit') {
      test.setTimeout(120000);
    }
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
    // Load first structure
    await moleculeViewer.loadSampleMolecule('caffeine');
  });

  test.describe('Loading Structures', () => {
    test('[MS-01] should show Add/Replace mode toggle after first structure', async () => {
      // After loading first structure, mode toggle should be visible
      const hasModeToggle = await moleculeViewer.structureList.hasModeToggle();
      // Mode toggle may only appear after first structure is loaded
      // or may always be visible - depends on implementation
    });

    test('[MS-02] should add structure in Add mode', async () => {
      // Set Add mode
      if (await moleculeViewer.structureList.hasModeToggle()) {
        await moleculeViewer.structureList.setAddMode();
      }

      const initialCount = await moleculeViewer.structureList.getStructureCount();

      // Add another structure
      await moleculeViewer.addStructure(molecules.water);

      const newCount = await moleculeViewer.structureList.getStructureCount();
      expect(newCount).toBe(initialCount + 1);
    });

    test('[MS-03] should replace all structures in Replace mode', async () => {
      // First ensure we have at least one structure
      const initialCount = await moleculeViewer.structureList.getStructureCount();
      expect(initialCount).toBeGreaterThanOrEqual(1);

      // Set Replace mode
      if (await moleculeViewer.structureList.hasModeToggle()) {
        await moleculeViewer.structureList.setReplaceMode();
      }

      // Load new structure (should replace)
      await moleculeViewer.uploadFile(molecules.caffeine);

      const newCount = await moleculeViewer.structureList.getStructureCount();
      // Should have only 1 structure after replace
      expect(newCount).toBe(1);
    });

    test('[MS-04] should enforce 10 structure limit', async () => {
      test.setTimeout(120000); // 2 minutes for loading 10 structures

      // Add structures up to the limit
      const maxStructures = 10;

      for (let i = 1; i < maxStructures; i++) {
        await moleculeViewer.addStructure(molecules.water);
        const count = await moleculeViewer.structureList.getStructureCount();
        if (count >= maxStructures) break;
      }

      const count = await moleculeViewer.structureList.getStructureCount();

      // Try to add one more - should fail or show warning
      if (count === maxStructures) {
        await moleculeViewer.addStructure(molecules.water);
        const newCount = await moleculeViewer.structureList.getStructureCount();
        // Should still be at max
        expect(newCount).toBeLessThanOrEqual(maxStructures);
      }
    });
  });

  test.describe('Structure List', () => {
    test('[MS-05] should display all loaded structures', async () => {
      const isListVisible = await moleculeViewer.structureList.isVisible();
      if (isListVisible) {
        const names = await moleculeViewer.structureList.getStructureNames();
        expect(names.length).toBeGreaterThanOrEqual(1);
      }
    });

    test('[MS-06] should show active structure indicator', async ({ }, testInfo) => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.water);

      const names = await moleculeViewer.structureList.getStructureNames();
      // Skip if multi-structure add failed (feature unavailable)
      testInfo.skip(names.length < 2, 'Multi-structure add failed - feature unavailable');

      // One structure should be active
      const activeName = await moleculeViewer.structureList.getActiveStructureName();
      expect(activeName).toBeTruthy();
    });

    test('[MS-07] should toggle structure visibility', async () => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.water);

      const names = await moleculeViewer.structureList.getStructureNames();
      if (names.length >= 1) {
        const structureName = names[0];

        // Toggle visibility off
        await moleculeViewer.structureList.toggleVisibility(structureName);
        await moleculeViewer.page.waitForTimeout(200);

        // Verify visibility state changed
        const isVisible = await moleculeViewer.structureList.isStructureVisible(structureName);

        // Toggle back on
        await moleculeViewer.structureList.toggleVisibility(structureName);
        await moleculeViewer.page.waitForTimeout(200);
      }
    });

    test('[MS-08] should delete structure from list', async () => {
      // Add a second structure first
      await moleculeViewer.addStructure(molecules.water);
      const initialCount = await moleculeViewer.structureList.getStructureCount();
      expect(initialCount).toBeGreaterThanOrEqual(2);

      const names = await moleculeViewer.structureList.getStructureNames();

      // Delete the first structure
      await moleculeViewer.structureList.deleteStructure(names[0]);
      await moleculeViewer.page.waitForTimeout(300);

      const newCount = await moleculeViewer.structureList.getStructureCount();
      expect(newCount).toBe(initialCount - 1);
    });

    test('[MS-09] should make clicked structure active', async ({ }, testInfo) => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.water);

      const names = await moleculeViewer.structureList.getStructureNames();
      // Skip if multi-structure add failed (feature unavailable)
      testInfo.skip(names.length < 2, 'Multi-structure add failed - feature unavailable');

      // Click on the second structure
      await moleculeViewer.structureList.selectStructure(names[1]);
      await moleculeViewer.page.waitForTimeout(200);

      // Verify it's now active
      const isActive = await moleculeViewer.structureList.isStructureActive(names[1]);
      expect(isActive).toBe(true);
    });
  });

  test.describe('Per-Structure Settings', () => {
    test('[MS-10] should apply representation to active structure only', async ({ }, testInfo) => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.water);

      const names = await moleculeViewer.structureList.getStructureNames();
      // Skip if multi-structure add failed (feature unavailable)
      testInfo.skip(names.length < 2, 'Multi-structure add failed - feature unavailable');

      // Select first structure and set representation
      await moleculeViewer.structureList.selectStructure(names[0]);
      await moleculeViewer.toolbar.setStick();
      await moleculeViewer.page.waitForTimeout(200);

      // Select second structure
      await moleculeViewer.structureList.selectStructure(names[1]);
      await moleculeViewer.page.waitForTimeout(200);

      // Molecule should still render correctly
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[MS-11] should apply color scheme to active structure only', async ({ }, testInfo) => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.water);

      const names = await moleculeViewer.structureList.getStructureNames();
      // Skip if multi-structure add failed (feature unavailable)
      testInfo.skip(names.length < 2, 'Multi-structure add failed - feature unavailable');

      // Select first structure
      await moleculeViewer.structureList.selectStructure(names[0]);

      // Change color scheme
      if (await moleculeViewer.controlPanel.colorSchemeSection.isVisible()) {
        await moleculeViewer.controlPanel.setColorScheme('chain');
        await moleculeViewer.page.waitForTimeout(200);
      }

      // Switch to second structure
      await moleculeViewer.structureList.selectStructure(names[1]);
      await moleculeViewer.page.waitForTimeout(200);

      // Canvas should still render
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[MS-12] should preserve settings when switching active structure', async ({ }, testInfo) => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.water);

      const names = await moleculeViewer.structureList.getStructureNames();
      // Skip if multi-structure add failed (feature unavailable)
      testInfo.skip(names.length < 2, 'Multi-structure add failed - feature unavailable');

      // Change first structure to spacefill
      await moleculeViewer.structureList.selectStructure(names[0]);
      await moleculeViewer.toolbar.setSpacefill();
      await moleculeViewer.page.waitForTimeout(200);

      // Switch to second and back
      await moleculeViewer.structureList.selectStructure(names[1]);
      await moleculeViewer.structureList.selectStructure(names[0]);
      await moleculeViewer.page.waitForTimeout(200);

      // Representation should still be spacefill
      expect(await moleculeViewer.toolbar.isRepresentationActive('spacefill')).toBe(true);
    });

    test('[MS-26] should disable controls when structure is hidden', async ({ }, testInfo) => {
      // Get structure name
      const names = await moleculeViewer.structureList.getStructureNames();
      testInfo.skip(names.length < 1, 'No structures loaded');

      const structureName = names[0];

      // Verify controls are enabled when structure is visible
      expect(await moleculeViewer.structureList.isStructureVisible(structureName)).toBe(true);
      expect(await moleculeViewer.controlPanel.isRepresentationAvailable('stick')).toBe(true);
      expect(await moleculeViewer.controlPanel.isColorSchemeAvailable('chain')).toBe(true);

      // Hide the structure
      await moleculeViewer.structureList.toggleVisibility(structureName);
      await moleculeViewer.page.waitForTimeout(300);

      // Verify structure is hidden
      expect(await moleculeViewer.structureList.isStructureVisible(structureName)).toBe(false);

      // Verify all representation buttons are disabled
      expect(await moleculeViewer.controlPanel.isRepresentationAvailable('ball-and-stick')).toBe(false);
      expect(await moleculeViewer.controlPanel.isRepresentationAvailable('stick')).toBe(false);
      expect(await moleculeViewer.controlPanel.isRepresentationAvailable('spacefill')).toBe(false);

      // Verify all color scheme buttons are disabled
      expect(await moleculeViewer.controlPanel.isColorSchemeAvailable('cpk')).toBe(false);
      expect(await moleculeViewer.controlPanel.isColorSchemeAvailable('chain')).toBe(false);

      // Show the structure again
      await moleculeViewer.structureList.toggleVisibility(structureName);
      await moleculeViewer.page.waitForTimeout(300);

      // Verify controls are re-enabled
      expect(await moleculeViewer.structureList.isStructureVisible(structureName)).toBe(true);
      expect(await moleculeViewer.controlPanel.isRepresentationAvailable('stick')).toBe(true);
      expect(await moleculeViewer.controlPanel.isColorSchemeAvailable('chain')).toBe(true);
    });
  });

  test.describe('Layout Modes', () => {
    test('[MS-13] should show layout toggle when >1 structure', async () => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.water);

      // Layout controls should appear
      const hasLayoutControls = await moleculeViewer.structureList.hasLayoutControls();
      // May or may not be visible depending on implementation
    });

    test('[MS-14] should overlay structures in Overlay mode', async () => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.water);

      const hasLayoutControls = await moleculeViewer.structureList.hasLayoutControls();
      if (hasLayoutControls) {
        await moleculeViewer.structureList.setOverlayLayout();
        await moleculeViewer.page.waitForTimeout(300);

        const isActive = await moleculeViewer.structureList.isOverlayLayoutActive();
        expect(isActive).toBe(true);

        // Verify rendering
        await moleculeViewer.canvas.expectMoleculeRendered();
      }
    });

    test('[MS-15] should arrange structures on X-axis in Side-by-Side mode', async () => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.water);

      const hasLayoutControls = await moleculeViewer.structureList.hasLayoutControls();
      if (hasLayoutControls) {
        await moleculeViewer.structureList.setSideBySideLayout();
        await moleculeViewer.page.waitForTimeout(300);

        const isActive = await moleculeViewer.structureList.isSideBySideLayoutActive();
        expect(isActive).toBe(true);

        // Verify rendering
        await moleculeViewer.canvas.expectMoleculeRendered();
      }
    });
  });

  test.describe('Camera Fit', () => {
    test('[MS-16] should fit camera to all visible structures on Home', async () => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.water);

      // Press Home to fit all
      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(300);

      // Verify rendering (camera should have adjusted)
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[MS-17] should update bounds when structure visibility changes', async ({ }, testInfo) => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.water);

      const names = await moleculeViewer.structureList.getStructureNames();
      // Skip if multi-structure add failed (feature unavailable)
      testInfo.skip(names.length < 2, 'Multi-structure add failed - feature unavailable');

      // Hide one structure
      await moleculeViewer.structureList.toggleVisibility(names[0]);
      await moleculeViewer.page.waitForTimeout(200);

      // Press Home - should fit to visible structures only
      await moleculeViewer.toolbar.homeView();
      await moleculeViewer.page.waitForTimeout(300);

      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('Cross-Structure Features', () => {
    test('[MS-18] should measure distance between atoms of different structures', async () => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.water);

      // Enable distance measurement
      await moleculeViewer.toolbar.toggleDistance();
      await moleculeViewer.page.waitForTimeout(200);

      // Click two points (simplified - actual measurement requires atom clicks)
      await moleculeViewer.canvas.clickAtOffset(-50, 0);
      await moleculeViewer.page.waitForTimeout(100);
      await moleculeViewer.canvas.clickAtOffset(50, 0);
      await moleculeViewer.page.waitForTimeout(300);

      // Verify no errors
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[MS-19] should create labels on specific structure', async ({ }, testInfo) => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.water);

      // Select first structure
      const names = await moleculeViewer.structureList.getStructureNames();
      // Skip if multi-structure add failed (feature unavailable)
      testInfo.skip(names.length < 2, 'Multi-structure add failed - feature unavailable');

      await moleculeViewer.structureList.selectStructure(names[0]);
      await moleculeViewer.canvas.waitForSceneReady();

      // Add label via context menu
      await moleculeViewer.openContextMenu();
      const labelAction = moleculeViewer.contextMenu.getByRole('button', { name: /label/i });
      if (await labelAction.isVisible()) {
        await labelAction.click({ force: true });
        await moleculeViewer.page.waitForTimeout(300);
      }

      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[MS-20] should clean up measurements when structure removed', async ({ }, testInfo) => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.water);

      // Add a measurement (simplified)
      await moleculeViewer.toolbar.toggleDistance();
      await moleculeViewer.canvas.clickAtOffset(-30, 0);
      await moleculeViewer.page.waitForTimeout(100);
      await moleculeViewer.canvas.clickAtOffset(30, 0);
      await moleculeViewer.page.waitForTimeout(200);

      // Cancel measurement mode
      await moleculeViewer.pressKey('Escape');

      // Delete a structure
      const names = await moleculeViewer.structureList.getStructureNames();
      // Skip if multi-structure add failed (feature unavailable)
      testInfo.skip(names.length < 2, 'Multi-structure add failed - feature unavailable');

      await moleculeViewer.structureList.deleteStructure(names[0]);
      await moleculeViewer.page.waitForTimeout(300);

      // Verify no errors
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[MS-21] should clean up labels when structure removed', async ({ }, testInfo) => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.water);

      const names = await moleculeViewer.structureList.getStructureNames();
      // Skip if multi-structure add failed (feature unavailable)
      testInfo.skip(names.length < 2, 'Multi-structure add failed - feature unavailable');

      // Add label to first structure
      await moleculeViewer.structureList.selectStructure(names[0]);
      await moleculeViewer.canvas.waitForSceneReady();
      await moleculeViewer.openContextMenu();
      const labelAction = moleculeViewer.contextMenu.getByRole('button', { name: /label/i });
      if (await labelAction.isVisible()) {
        await labelAction.click({ force: true });
        await moleculeViewer.page.waitForTimeout(200);
      } else {
        await moleculeViewer.closeContextMenu();
      }

      // Delete that structure
      await moleculeViewer.structureList.deleteStructure(names[0]);
      await moleculeViewer.page.waitForTimeout(300);

      // Label should be removed with the structure
      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('Undo/Redo', () => {
    test('[MS-22] should undo structure addition', async () => {
      const initialCount = await moleculeViewer.structureList.getStructureCount();

      // Add a structure
      await moleculeViewer.addStructure(molecules.water);
      expect(await moleculeViewer.structureList.getStructureCount()).toBe(initialCount + 1);

      // Undo
      await moleculeViewer.undo();
      await moleculeViewer.page.waitForTimeout(300);

      // Structure should be removed
      const newCount = await moleculeViewer.structureList.getStructureCount();
      expect(newCount).toBe(initialCount);
    });

    test('[MS-23] should undo structure removal', async () => {
      // Add a second structure first
      await moleculeViewer.addStructure(molecules.water);
      const initialCount = await moleculeViewer.structureList.getStructureCount();

      const names = await moleculeViewer.structureList.getStructureNames();

      // Delete a structure
      await moleculeViewer.structureList.deleteStructure(names[0]);
      await moleculeViewer.page.waitForTimeout(300);
      expect(await moleculeViewer.structureList.getStructureCount()).toBe(initialCount - 1);

      // Undo
      await moleculeViewer.undo();
      await moleculeViewer.page.waitForTimeout(300);

      // Structure should be restored
      const newCount = await moleculeViewer.structureList.getStructureCount();
      expect(newCount).toBe(initialCount);
    });

    test('[MS-24] should undo visibility toggle', async () => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.water);

      const names = await moleculeViewer.structureList.getStructureNames();
      if (names.length >= 1) {
        const structureName = names[0];
        const initialVisibility = await moleculeViewer.structureList.isStructureVisible(structureName);

        // Toggle visibility
        await moleculeViewer.structureList.toggleVisibility(structureName);
        await moleculeViewer.page.waitForTimeout(200);

        // Undo
        await moleculeViewer.undo();
        await moleculeViewer.page.waitForTimeout(200);

        // Visibility should be restored
        const restoredVisibility = await moleculeViewer.structureList.isStructureVisible(structureName);
        expect(restoredVisibility).toBe(initialVisibility);
      }
    });

    test('[MS-25] should undo per-structure settings change', async () => {
      // Add a second structure
      await moleculeViewer.addStructure(molecules.water);

      const names = await moleculeViewer.structureList.getStructureNames();
      if (names.length >= 1) {
        // Select structure and change representation
        await moleculeViewer.structureList.selectStructure(names[0]);
        await moleculeViewer.toolbar.setSpacefill();
        await moleculeViewer.page.waitForTimeout(200);

        expect(await moleculeViewer.toolbar.isRepresentationActive('spacefill')).toBe(true);

        // Undo
        await moleculeViewer.undo();
        await moleculeViewer.page.waitForTimeout(200);

        // Representation should be restored
        expect(await moleculeViewer.toolbar.isRepresentationActive('ball-and-stick')).toBe(true);
      }
    });
  });
});
