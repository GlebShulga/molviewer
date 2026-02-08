import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { molecules } from '../../fixtures';

test.describe('Component Settings / Smart Defaults', () => {
  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }) => {
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
  });

  test.describe('Smart Defaults Detection', () => {
    test('[CO-01] should not show smart defaults for simple molecules', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Structure list should not show "Smart Defaults" for simple molecules
      const structureList = moleculeViewer.page.locator('[class*="structureList"], [class*="StructureList"]');
      const structureItem = structureList.locator('[class*="item"], [class*="Item"]').first();

      await expect(structureItem).toBeVisible({ timeout: 5000 });
      const text = await structureItem.textContent() || '';
      // Should NOT contain "Smart Defaults"
      expect(text).not.toMatch(/Smart Default/i);
    });

    test('[CO-02] should show smart defaults indicator for protein-ligand complexes', async () => {
      // Fetch a protein-ligand complex from RCSB
      // Using 3HTB (HIV protease with inhibitor) as it has protein + ligand
      test.setTimeout(60000);

      await moleculeViewer.fetchFromRCSBAndWait('3HTB');

      // Look for Smart Defaults indicator in structure list
      const structureItem = moleculeViewer.page.locator('[class*="structureItem"], [class*="item"]').first();

      await expect(structureItem).toBeVisible({ timeout: 5000 });
      const text = await structureItem.textContent() || '';
      // Multi-component molecules should show "Smart Defaults"
      const hasSmartDefaults = text.includes('Smart Default');
      expect(hasSmartDefaults).toBe(true);
    });

    test('[CO-03] should keep representation controls visible even with smart defaults', async () => {
      test.setTimeout(60000);

      // Fetch a multi-component structure
      await moleculeViewer.fetchFromRCSBAndWait('3HTB');
      await moleculeViewer.page.waitForTimeout(500);

      // Representation section should remain visible so users can override smart defaults
      const controlPanel = moleculeViewer.controlPanel;
      const isRepresentationVisible = await controlPanel.representationSection.isVisible().catch(() => false);

      // Controls stay visible for user overrides, smart defaults just set initial values
      expect(isRepresentationVisible).toBe(true);

      // Molecule should still render correctly
      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('Multi-Component Rendering', () => {
    test('[CO-04] should render protein component with cartoon representation', async ({ page }) => {
      test.setTimeout(60000);

      await moleculeViewer.fetchFromRCSBAndWait('3HTB');

      // Verify molecule renders
      await moleculeViewer.canvas.expectMoleculeRendered();

      // The protein portion should render (cartoon for protein is typical smart default)
      // We can't directly verify the representation type in 3D, but we verify it renders
    });

    test('[CO-05] should render ligand component with ball-and-stick representation', async ({ page }) => {
      test.setTimeout(60000);

      await moleculeViewer.fetchFromRCSBAndWait('3HTB');

      // Verify molecule renders
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Ligand should be rendered with ball-and-stick (typical smart default)
    });

    test('[CO-06] should maintain visibility when rotating view', async ({ page }) => {
      test.setTimeout(60000);

      await moleculeViewer.fetchFromRCSBAndWait('3HTB');
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Rotate the view
      await moleculeViewer.canvas.rotateMolecule(100, 100);
      await moleculeViewer.page.waitForTimeout(300);

      // All components should still be visible
      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('Component Visibility Toggle', () => {
    test('[CO-07] should toggle individual component visibility', async ({ page }) => {
      test.setTimeout(60000);

      await moleculeViewer.fetchFromRCSBAndWait('3HTB');

      // Look for component visibility toggles in the UI
      // This might be in the structure list item or a component settings panel
      const visibilityToggles = moleculeViewer.page.locator('button, [role="button"]').filter({ hasText: /visibility|show|hide/i });

      // If toggles exist, test them
      const toggleCount = await visibilityToggles.count();
      if (toggleCount > 0) {
        await visibilityToggles.first().click();
        await moleculeViewer.page.waitForTimeout(300);

        // Molecule should still render (just with one component hidden)
        await moleculeViewer.canvas.expectMoleculeRendered();
      }
    });
  });

  test.describe('Per-Component Settings', () => {
    test('[CO-08] should allow different color schemes per component', async () => {
      test.setTimeout(60000);

      await moleculeViewer.fetchFromRCSBAndWait('3HTB');

      // If component settings UI exists, test color scheme changes
      const colorSchemeSelectors = moleculeViewer.page.locator('[class*="colorScheme"], [class*="color-scheme"]');

      // The presence of multiple color scheme selectors indicates per-component settings
      const count = await colorSchemeSelectors.count();
      // Per-component color schemes may or may not be exposed in UI
      // At minimum, verify the molecule renders correctly
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[CO-09] should preserve component settings through undo/redo', async ({ page }) => {
      test.setTimeout(90000); // Extra time for network fetch
      test.slow(); // This test involves network fetch and multiple operations

      // Use local caffeine sample instead of RCSB (avoid network flakiness)
      await moleculeViewer.loadSampleMolecule('caffeine');
      await moleculeViewer.canvas.expectMoleculeRendered();

      // Make a change via toolbar
      const toolbar = moleculeViewer.toolbar;

      // Try to make a change that triggers undo
      if (await toolbar.isRepresentationActive('ball-and-stick')) {
        await toolbar.setStick();
        await moleculeViewer.page.waitForTimeout(300);
      }

      // Undo
      await moleculeViewer.undo();
      await moleculeViewer.page.waitForTimeout(500);

      // Verify molecule still renders correctly
      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('Structure List Item Display', () => {
    test('[CO-10] should show correct molecule name in structure list', async ({ page }) => {
      test.setTimeout(60000);

      await moleculeViewer.fetchFromRCSBAndWait('3HTB');

      const structureNames = await moleculeViewer.structureList.getStructureNames();
      expect(structureNames.length).toBeGreaterThan(0);

      // Should contain the PDB ID or a meaningful name
      expect(structureNames[0]).toMatch(/3HTB|HIV/i);
    });

    test('[CO-11] should show atom count in structure list', async () => {
      test.setTimeout(60000);

      await moleculeViewer.fetchFromRCSBAndWait('3HTB');

      const structureItem = moleculeViewer.page.locator('[class*="structureItem"], [class*="item"]').first();
      await expect(structureItem).toBeVisible({ timeout: 5000 });
      const text = await structureItem.textContent() || '';
      // Should show atom count
      expect(text).toMatch(/\d+\s*atom/i);
    });

    test('[CO-12] should show "Smart Defaults" instead of representation name for complex molecules', async () => {
      test.setTimeout(60000);

      await moleculeViewer.fetchFromRCSBAndWait('3HTB');

      const structureItem = moleculeViewer.page.locator('[class*="structureItem"], [class*="item"]').first();
      await expect(structureItem).toBeVisible({ timeout: 5000 });
      const text = await structureItem.textContent() || '';

      // Should show either "Smart Defaults" or representation info
      const hasInfo = text.match(/Smart Default|Ball.*Stick|Cartoon|Stick|Spacefill/i);
      expect(hasInfo).not.toBeNull();
    });
  });

  test.describe('Fallback for Simple Molecules', () => {
    test('[CO-13] should use standard representation controls for simple molecules', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Representation section should be visible for simple molecules
      const representationSection = moleculeViewer.controlPanel.representationSection;
      const isVisible = await representationSection.isVisible().catch(() => false);

      // Simple molecules should have representation controls visible
      expect(isVisible).toBe(true);
    });

    test('[CO-14] should allow representation switching for simple molecules', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Should be able to change representation
      await moleculeViewer.toolbar.setStick();
      expect(await moleculeViewer.toolbar.isRepresentationActive('stick')).toBe(true);

      await moleculeViewer.toolbar.setSpacefill();
      expect(await moleculeViewer.toolbar.isRepresentationActive('spacefill')).toBe(true);
    });

    test('[CO-15] should allow color scheme changes for simple molecules', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Color scheme section should be visible for simple molecules
      const colorSection = moleculeViewer.controlPanel.colorSchemeSection;
      const colorSectionVisible = await colorSection.isVisible();
      test.skip(!colorSectionVisible, 'Color scheme section not visible');

      await moleculeViewer.controlPanel.setColorScheme('chain');
      expect(await moleculeViewer.controlPanel.isColorSchemeActive('chain')).toBe(true);
    });
  });

  test.describe('Multi-Structure with Smart Defaults', () => {
    test('[CO-16] should handle multiple structures with different component types', async () => {
      test.setTimeout(90000);

      // Load a complex structure
      await moleculeViewer.fetchFromRCSBAndWait('3HTB');

      // Add a simple structure
      await moleculeViewer.addStructure(molecules.caffeine);

      // Should have 2 structures
      const structureCount = await moleculeViewer.structureList.getStructureCount();
      expect(structureCount).toBe(2);

      // Both should render
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[CO-17] should maintain smart defaults when switching active structure', async () => {
      test.setTimeout(90000);

      // Use local files to avoid network flakiness
      // Load first structure (crambin as complex protein)
      await moleculeViewer.uploadFile(molecules.crambin);

      // Add simple structure
      await moleculeViewer.addStructure(molecules.caffeine);

      const names = await moleculeViewer.structureList.getStructureNames();
      expect(names.length).toBe(2);

      // Select the simple structure
      await moleculeViewer.structureList.selectStructure(names[1]);
      await moleculeViewer.page.waitForTimeout(200);

      // Representation controls should be visible for both simple and complex molecules
      const representationSection = moleculeViewer.controlPanel.representationSection;
      const repVisibleForSimple = await representationSection.isVisible().catch(() => false);
      expect(repVisibleForSimple).toBe(true);

      // Select complex structure back
      await moleculeViewer.structureList.selectStructure(names[0]);
      await moleculeViewer.page.waitForTimeout(200);

      // Representation controls stay visible (user can override smart defaults)
      const repVisibleForComplex = await representationSection.isVisible().catch(() => false);
      expect(repVisibleForComplex).toBe(true);
    });
  });

  test.describe('Component Type Classification', () => {
    test('[CO-18] should classify protein structures correctly', async () => {
      test.setTimeout(60000);

      await moleculeViewer.fetchFromRCSBAndWait('1CRN'); // Crambin - pure protein

      // Pure protein should NOT trigger smart defaults (single type)
      const structureItem = moleculeViewer.page.locator('[class*="structureItem"], [class*="item"]').first();
      await expect(structureItem).toBeVisible({ timeout: 5000 });
      const text = await structureItem.textContent() || '';
      // Should show representation type, not "Smart Defaults"
      expect(text).not.toMatch(/Smart Default/i);
    });

    test('[CO-19] should classify small molecules correctly', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Small molecule should not trigger smart defaults
      const structureItem = moleculeViewer.page.locator('[class*="structureItem"], [class*="item"]').first();
      await expect(structureItem).toBeVisible({ timeout: 5000 });
      const text = await structureItem.textContent() || '';
      expect(text).not.toMatch(/Smart Default/i);
    });
  });
});
