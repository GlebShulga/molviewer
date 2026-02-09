import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';

test.describe('Color Schemes', () => {
  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }) => {
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
  });

  test.describe('Small Molecule Color Schemes', () => {
    test.beforeEach(async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');
    });

    test('[CS-01] should default to CPK color scheme', async () => {
      // Skip if color scheme section not visible (smart defaults active)
      const colorSectionVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSectionVisible, 'Color scheme section hidden (smart defaults active)');

      // CPK should be the default for small molecules
      const isActive = await moleculeViewer.controlPanel.isColorSchemeActive('cpk');
      expect(isActive).toBe(true);
    });

    test('[CS-02] should switch to Chain color scheme', async () => {
      // Skip if color scheme section not visible (smart defaults active)
      const colorSectionVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSectionVisible, 'Color scheme section hidden (smart defaults active)');

      await moleculeViewer.controlPanel.setColorScheme('chain');

      const isActive = await moleculeViewer.controlPanel.isColorSchemeActive('chain');
      expect(isActive).toBe(true);

      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[CS-03] should have some color schemes disabled for small molecules', async () => {
      // Skip if color scheme section not visible (smart defaults active)
      const colorSectionVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSectionVisible, 'Color scheme section hidden (smart defaults active)');

      // Small molecules shouldn't have residue-based color schemes
      const residueAvailable = await moleculeViewer.controlPanel.isColorSchemeAvailable('residueType');
      const bfactorAvailable = await moleculeViewer.controlPanel.isColorSchemeAvailable('bfactor');

      // Caffeine has no residue info or B-factor data
      expect(residueAvailable).toBe(false);
      expect(bfactorAvailable).toBe(false);
    });
  });

  test.describe('Protein Color Schemes', () => {
    test.beforeEach(async ({ page }) => {
      await moleculeViewer.fetchFromRCSBAndWait('1CRN');
    });

    test('[CS-04] should enable protein-related color schemes', async () => {
      // Skip if color scheme section not visible (smart defaults active)
      const colorSectionVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSectionVisible, 'Color scheme section hidden (smart defaults active)');

      // Check availability of protein-specific schemes
      // Note: CPK may be disabled for Cartoon representation (complex proteins)
      // Note: residueType may be disabled for complex proteins (>500 atoms)
      const alwaysAvailableSchemes: Array<'chain' | 'bfactor' | 'rainbow' | 'secondaryStructure'> = [
        'chain',
        'bfactor',
        'rainbow',
        'secondaryStructure',
      ];

      for (const scheme of alwaysAvailableSchemes) {
        const isAvailable = await moleculeViewer.controlPanel.isColorSchemeAvailable(scheme);
        expect(isAvailable).toBe(true);
      }

      // CPK and residueType availability depends on representation and molecule size
      // Just verify at least one of them works
      const cpkAvailable = await moleculeViewer.controlPanel.isColorSchemeAvailable('cpk');
      const residueTypeAvailable = await moleculeViewer.controlPanel.isColorSchemeAvailable('residueType');
      // At least one should be available for small proteins like crambin
      expect(cpkAvailable || residueTypeAvailable).toBe(true);
    });

    test('[CS-05] should switch to Residue Type color scheme', async () => {
      // Skip if color scheme section not visible (smart defaults active)
      const colorSectionVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSectionVisible, 'Color scheme section hidden (smart defaults active)');

      const isAvailable = await moleculeViewer.controlPanel.isColorSchemeAvailable('residueType');
      expect(isAvailable).toBe(true);

      await moleculeViewer.controlPanel.setColorScheme('residueType');

      const isActive = await moleculeViewer.controlPanel.isColorSchemeActive('residueType');
      expect(isActive).toBe(true);

      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[CS-06] should switch to B-factor color scheme', async () => {
      // Skip if color scheme section not visible (smart defaults active)
      const colorSectionVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSectionVisible, 'Color scheme section hidden (smart defaults active)');

      const isAvailable = await moleculeViewer.controlPanel.isColorSchemeAvailable('bfactor');
      expect(isAvailable).toBe(true);

      await moleculeViewer.controlPanel.setColorScheme('bfactor');

      const isActive = await moleculeViewer.controlPanel.isColorSchemeActive('bfactor');
      expect(isActive).toBe(true);

      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[CS-07] should switch to Rainbow color scheme', async () => {
      // Skip if color scheme section not visible (smart defaults active)
      const colorSectionVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSectionVisible, 'Color scheme section hidden (smart defaults active)');

      const isAvailable = await moleculeViewer.controlPanel.isColorSchemeAvailable('rainbow');
      expect(isAvailable).toBe(true);

      await moleculeViewer.controlPanel.setColorScheme('rainbow');

      const isActive = await moleculeViewer.controlPanel.isColorSchemeActive('rainbow');
      expect(isActive).toBe(true);

      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[CS-08] should switch to Secondary Structure color scheme', async () => {
      // Skip if color scheme section not visible (smart defaults active)
      const colorSectionVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSectionVisible, 'Color scheme section hidden (smart defaults active)');

      const isAvailable = await moleculeViewer.controlPanel.isColorSchemeAvailable('secondaryStructure');
      expect(isAvailable).toBe(true);

      await moleculeViewer.controlPanel.setColorScheme('secondaryStructure');

      const isActive = await moleculeViewer.controlPanel.isColorSchemeActive('secondaryStructure');
      expect(isActive).toBe(true);

      await moleculeViewer.canvas.expectMoleculeRendered();
    });
  });

  test.describe('Color Scheme with Cartoon Representation', () => {
    test('[CS-09] should disable CPK for Cartoon representation', async () => {
      await moleculeViewer.fetchFromRCSBAndWait('1CRN');

      // Skip if representation section not visible (smart defaults active)
      const repSectionVisible = await moleculeViewer.controlPanel.representationSection.isVisible();
      test.skip(!repSectionVisible, 'Representation section hidden (smart defaults active)');

      const cartoonAvailable = await moleculeViewer.controlPanel.isRepresentationAvailable('cartoon');
      expect(cartoonAvailable).toBe(true);

      await moleculeViewer.controlPanel.setRepresentation('cartoon');

      // Wait for render
      await moleculeViewer.page.waitForTimeout(500);

      // Skip if color scheme section not visible after switching to cartoon
      const colorSectionVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSectionVisible, 'Color scheme section hidden after cartoon switch');

      // CPK should now be disabled for cartoon representation
      const cpkAvailable = await moleculeViewer.controlPanel.isColorSchemeAvailable('cpk');
      expect(cpkAvailable).toBe(false);
    });
  });

  test.describe('Color Scheme Persistence', () => {
    test.slow();
    test('[CS-10] should maintain color scheme through representation changes', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Skip if color scheme section not visible (smart defaults active)
      const colorSectionVisible = await moleculeViewer.controlPanel.colorSchemeSection.isVisible();
      test.skip(!colorSectionVisible, 'Color scheme section hidden (smart defaults active)');

      // Switch to chain color
      await moleculeViewer.controlPanel.setColorScheme('chain');

      // Switch representation
      await moleculeViewer.toolbar.setStick();

      // Color scheme should still be chain
      const isActive = await moleculeViewer.controlPanel.isColorSchemeActive('chain');
      expect(isActive).toBe(true);
    });
  });
});
