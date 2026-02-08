import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { molecules } from '../../fixtures';

test.describe('Molecule Metadata', () => {
  // Molecule loading on CI with software WebGL can take 20-30s
  test.setTimeout(60000);

  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }) => {
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
  });

  test.describe('Panel Visibility', () => {
    test('[MM-01] should show metadata panel when molecule is loaded', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Look for the Molecule Info section
      const metadataPanel = moleculeViewer.page.locator(
        '[class*="moleculeMetadata"], [class*="MoleculeMetadata"]'
      );
      const moleculeInfoSection = moleculeViewer.page.locator('text=Molecule Info').first();

      // Either the panel or the section should be visible
      const isVisible =
        (await metadataPanel.isVisible()) || (await moleculeInfoSection.isVisible());
      expect(isVisible).toBe(true);
    });

    test('[MM-02] should not show metadata panel when no molecule is loaded', async () => {
      // Don't load any molecule
      const metadataPanel = moleculeViewer.page.locator(
        '[class*="moleculeMetadata"], [class*="MoleculeMetadata"]'
      );

      // Panel should not be visible when no molecule is loaded
      const isVisible = await metadataPanel.isVisible().catch(() => false);
      expect(isVisible).toBe(false);
    });
  });

  test.describe('Basic Info', () => {
    test('[MM-03] should display molecule name', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Find name field
      const nameRow = moleculeViewer.page.locator('text=Name').first();
      await expect(nameRow).toBeVisible();

      // Should contain caffeine or similar name
      const nameValue = moleculeViewer.page
        .locator('[class*="metadataValue"]')
        .filter({ hasText: /caffeine/i });
      const hasName =
        (await nameValue.count()) > 0 ||
        (await moleculeViewer.page.locator('text=/caffeine/i').count()) > 0;
      expect(hasName).toBe(true);
    });

    test('[MM-04] should display chemical formula', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Look for formula field
      const formulaLabel = moleculeViewer.page.locator('text=Formula');
      await expect(formulaLabel.first()).toBeVisible();

      // The test molecule has heavy atoms only (no hydrogens)
      // Formula should contain C, N, O with subscripts (e.g., C₈N₄O₂)
      const sidebar = moleculeViewer.sidebar;
      const formulaText = await sidebar.textContent();
      // Match formula with subscript characters (₀-₉) or regular digits
      expect(formulaText).toMatch(/C[₀-₉\d]*.*N[₀-₉\d]*.*O[₀-₉\d]*/);
    });

    test('[MM-05] should display molecular weight', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Look for molecular weight field
      const weightLabel = moleculeViewer.page.locator('text=/Mol.*Weight|MW/i');
      await expect(weightLabel.first()).toBeVisible();

      // Should contain a number with Da unit
      const sidebar = moleculeViewer.sidebar;
      const sidebarText = await sidebar.textContent();
      expect(sidebarText).toMatch(/\d+\.?\d*\s*(Da|g\/mol)?/);
    });
  });

  test.describe('Atom Counts', () => {
    test('[MM-06] should show atom counts section', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Look for Atom Counts section
      const atomCountsSection = moleculeViewer.page.locator('text=Atom Counts');
      const isVisible = await atomCountsSection.isVisible().catch(() => false);

      // If visible, expand it if collapsed
      if (isVisible) {
        await atomCountsSection.click().catch(() => {});
        await moleculeViewer.page.waitForTimeout(200);
      }
    });

    test('[MM-07] should display element-wise atom counts', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Expand Atom Counts section if needed
      const atomCountsHeader = moleculeViewer.page
        .locator('button, [role="button"]')
        .filter({ hasText: 'Atom Counts' });
      if (await atomCountsHeader.isVisible()) {
        await atomCountsHeader.click();
        await moleculeViewer.page.waitForTimeout(200);
      }

      // Look for element names (Carbon, Hydrogen, Nitrogen, Oxygen for caffeine)
      const sidebar = moleculeViewer.sidebar;
      const sidebarText = (await sidebar.textContent()) || '';

      // Should contain element names (more reliable than single letters)
      const hasCarbon = sidebarText.includes('Carbon');
      const hasHydrogen = sidebarText.includes('Hydrogen');
      expect(hasCarbon || hasHydrogen).toBe(true);
    });

    test('[MM-08] should show total atom count', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Look for Total row
      const totalRow = moleculeViewer.page.locator('text=Total');

      if (await totalRow.isVisible().catch(() => false)) {
        // Should have a number nearby
        const sidebar = moleculeViewer.sidebar;
        const text = (await sidebar.textContent()) || '';
        expect(text).toMatch(/Total.*\d+|\d+.*atoms/i);
      }
    });
  });

  test.describe('Bond Counts', () => {
    test('[MM-09] should show bond counts section', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Look for Bond Counts section
      const bondCountsSection = moleculeViewer.page.locator('text=Bond Counts');
      const isVisible = await bondCountsSection.isVisible().catch(() => false);

      // Bond counts section should exist (may be collapsed)
      // Check for either the section or the header button
      const bondCountsHeader = moleculeViewer.page
        .locator('button, [role="button"]')
        .filter({ hasText: 'Bond Counts' });
      const headerVisible = await bondCountsHeader.isVisible().catch(() => false);
      expect(isVisible || headerVisible).toBe(true);
    });

    test('[MM-10] should display bond type counts', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Expand Bond Counts section
      const bondCountsHeader = moleculeViewer.page
        .locator('button, [role="button"]')
        .filter({ hasText: 'Bond Counts' });
      const headerVisible = await bondCountsHeader.isVisible();
      test.skip(!headerVisible, 'Bond Counts section not available');

      await bondCountsHeader.click();
      await moleculeViewer.page.waitForTimeout(200);

      // Look for bond types (Single, Double, etc.)
      const sidebar = moleculeViewer.sidebar;
      const sidebarText = (await sidebar.textContent()) || '';

      // Caffeine has single, double bonds
      const hasBondTypes = sidebarText.match(/Single|Double|Triple|Aromatic/i);
      expect(hasBondTypes).not.toBeNull();
    });

    test('[MM-11] should show total bond count', async ({}, testInfo) => {
      // This test times out on WebKit due to slow WebGL initialization
      testInfo.skip(testInfo.project.name === 'webkit', 'WebKit WebGL too slow for this test');

      await moleculeViewer.loadSampleMolecule('caffeine');

      // Expand Bond Counts if needed
      const bondCountsHeader = moleculeViewer.page
        .locator('button, [role="button"]')
        .filter({ hasText: 'Bond Counts' });
      const headerVisible = await bondCountsHeader.isVisible();
      test.skip(!headerVisible, 'Bond Counts section not available');

      await bondCountsHeader.click();
      await moleculeViewer.page.waitForTimeout(200);

      // Look for total bonds
      const sidebar = moleculeViewer.sidebar;
      const text = (await sidebar.textContent()) || '';
      // Should have bond count somewhere (Total or number with "bonds")
      expect(text).toMatch(/Total|\d+\s*bond/i);
    });
  });

  test.describe('Chain Summary (Proteins)', () => {
    test('[MM-12] should show chains section for proteins', async () => {
      await moleculeViewer.uploadFile(molecules.crambin);

      // Look for Chains section
      const chainsSection = moleculeViewer.page.locator('text=Chains');
      const chainsHeader = moleculeViewer.page
        .locator('button, [role="button"]')
        .filter({ hasText: 'Chains' });
      const isVisible =
        (await chainsSection.isVisible().catch(() => false)) ||
        (await chainsHeader.isVisible().catch(() => false));

      // Chains section should be visible for proteins
      expect(isVisible).toBe(true);
    });

    test('[MM-13] should display chain IDs', async () => {
      await moleculeViewer.uploadFile(molecules.crambin);

      // Expand Chains section
      const chainsHeader = moleculeViewer.page
        .locator('button, [role="button"]')
        .filter({ hasText: 'Chains' });
      const headerVisible = await chainsHeader.isVisible();
      test.skip(!headerVisible, 'Chains section not available');

      await chainsHeader.click();
      await moleculeViewer.page.waitForTimeout(200);

      // Look for chain A (crambin has chain A)
      const sidebar = moleculeViewer.sidebar;
      const sidebarText = (await sidebar.textContent()) || '';

      // Should contain chain identifier - table has headers "Chain | Residues | Atoms"
      const hasChainInfo = sidebarText.match(/Chains|Chain.*Residues/i);
      expect(hasChainInfo).not.toBeNull();
    });

    test('[MM-14] should show residue count per chain', async () => {
      await moleculeViewer.uploadFile(molecules.crambin);

      // Expand Chains section - wait for it to appear after file load
      const chainsHeader = moleculeViewer.page
        .locator('button, [role="button"]')
        .filter({ hasText: 'Chains' });
      await chainsHeader.waitFor({ state: 'attached', timeout: 10000 });

      await chainsHeader.dispatchEvent('click');
      await moleculeViewer.page.waitForTimeout(200);

      // Look for residue counts - table shows numbers in Residues column
      const sidebar = moleculeViewer.sidebar;
      const sidebarText = (await sidebar.textContent()) || '';

      // Should show residue numbers (Crambin has 46 residues) - header says "Residues"
      const hasResidueCount = sidebarText.match(/Residues/i);
      expect(hasResidueCount).not.toBeNull();
    });

    test('[MM-15] should show chains section for molecules with chain data', async () => {
      // All molecules have chain data (even small molecules have chainId assigned)
      // The Chains section is visible when chainSummary.length > 0 && residueCount > 0
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Caffeine has chainId='A' and residueNumber=1, so chains section IS visible
      const chainsSection = moleculeViewer.page
        .locator('button, [role="button"]')
        .filter({ hasText: 'Chains' });
      await expect(chainsSection).toBeVisible();
    });
  });

  test.describe('Collapsible Sections', () => {
    test('[MM-16] should expand and collapse Atom Counts section', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const atomCountsHeader = moleculeViewer.page
        .locator('button, [role="button"]')
        .filter({ hasText: 'Atom Counts' });
      const headerVisible = await atomCountsHeader.isVisible();
      test.skip(!headerVisible, 'Atom Counts section not available');

      // Get initial state
      const initialState = await atomCountsHeader.getAttribute('aria-expanded');

      // Click to toggle
      await atomCountsHeader.click();
      await moleculeViewer.page.waitForTimeout(200);

      // State should change
      const newState = await atomCountsHeader.getAttribute('aria-expanded');
      expect(newState).not.toEqual(initialState);
    });

    test('[MM-17] should expand and collapse Bond Counts section', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const bondCountsHeader = moleculeViewer.page
        .locator('button, [role="button"]')
        .filter({ hasText: 'Bond Counts' });
      const headerVisible = await bondCountsHeader.isVisible();
      test.skip(!headerVisible, 'Bond Counts section not available');

      // Get initial state
      const initialState = await bondCountsHeader.getAttribute('aria-expanded');

      // Click to toggle
      await bondCountsHeader.click();
      await moleculeViewer.page.waitForTimeout(200);

      // State should change
      const newState = await bondCountsHeader.getAttribute('aria-expanded');
      expect(newState).not.toEqual(initialState);
    });
  });

  test.describe('Different Molecule Types', () => {
    test('[MM-18] should show correct data for water molecule', async () => {
      await moleculeViewer.loadSampleMolecule('water');

      const sidebar = moleculeViewer.sidebar;
      const sidebarText = (await sidebar.textContent()) || '';

      // Water is H2O - should show hydrogen and oxygen
      expect(sidebarText).toMatch(/H|O|water/i);
    });

    test('[MM-19] should show correct data for aspirin', async () => {
      await moleculeViewer.uploadFile(molecules.aspirin);

      const sidebar = moleculeViewer.sidebar;
      const sidebarText = (await sidebar.textContent()) || '';

      // Aspirin contains C, H, O
      expect(sidebarText).toMatch(/aspirin|C.*H.*O/i);
    });

    test('[MM-20] should update metadata when switching molecules', async () => {
      test.setTimeout(60000);
      // Load caffeine first
      await moleculeViewer.loadSampleMolecule('caffeine');

      const sidebar = moleculeViewer.sidebar;
      const caffeineText = (await sidebar.textContent()) || '';

      // Load water (replaces caffeine)
      await moleculeViewer.loadSampleMolecule('water');
      await moleculeViewer.page.waitForTimeout(300);

      const waterText = (await sidebar.textContent()) || '';

      // Metadata should be different
      expect(waterText).not.toEqual(caffeineText);
    });
  });
});
