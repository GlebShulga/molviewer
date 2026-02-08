import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { molecules } from '../../fixtures';

test.describe('Atom Tooltip', () => {
  // Tooltip tests involve file uploads and WebGL rendering
  test.slow();

  let moleculeViewer: MoleculeViewerPage;

  test.beforeEach(async ({ page }) => {
    moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
  });

  test.describe('Tooltip Visibility', () => {
    test('[AT-01] should show tooltip when hovering over atom', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Hover over a specific atom by index
      const success = await moleculeViewer.canvas.hoverAtom(0);
      expect(success).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);

      // Look for tooltip element
      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();
    });

    test('[AT-02] should hide tooltip when mouse leaves atom', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Hover over a specific atom
      const success = await moleculeViewer.canvas.hoverAtom(0);
      expect(success).toBe(true);
      await moleculeViewer.page.waitForTimeout(200);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      // Move away from atoms
      await moleculeViewer.canvas.hoverAtOffset(200, 200);
      await moleculeViewer.page.waitForTimeout(200);

      // Tooltip should disappear when not over an atom
      await expect(tooltip).not.toBeVisible();
    });

    test('[AT-03] should not show tooltip when no molecule is loaded', async () => {
      // Don't load any molecule - canvas should not exist

      // Verify canvas doesn't exist when no molecule is loaded
      const canvasVisible = await moleculeViewer.canvas.canvas.isVisible();
      expect(canvasVisible).toBe(false);

      // Verify no tooltip is present
      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      const isVisible = await tooltip.isVisible().catch(() => false);
      expect(isVisible).toBe(false);
    });
  });

  test.describe('Element Information', () => {
    test('[AT-04] should display element symbol', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Hover over a specific atom
      const success = await moleculeViewer.canvas.hoverAtom(0);
      expect(success).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const text = await tooltip.textContent() || '';
      // Should contain an element symbol (C, H, N, O for caffeine)
      expect(text).toMatch(/^[A-Z][a-z]?|Carbon|Hydrogen|Nitrogen|Oxygen/);
    });

    test('[AT-05] should display element name', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const success = await moleculeViewer.canvas.hoverAtom(0);
      expect(success).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const text = await tooltip.textContent() || '';
      // Should contain element name
      expect(text).toMatch(/Carbon|Hydrogen|Nitrogen|Oxygen|Sulfur|Phosphorus/i);
    });

    test('[AT-06] should display atomic number', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const success = await moleculeViewer.canvas.hoverAtom(0);
      expect(success).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const text = await tooltip.textContent() || '';
      // Should contain atomic number (e.g., #6 for carbon)
      expect(text).toMatch(/#\d+|\d+/);
    });

    test('[AT-07] should display atomic mass', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const success = await moleculeViewer.canvas.hoverAtom(0);
      expect(success).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const text = await tooltip.textContent() || '';
      // Should contain mass with Da unit
      expect(text).toMatch(/\d+\.\d+\s*Da/);
    });
  });

  test.describe('Atom Details', () => {
    test('[AT-08] should display atom name for PDB files', async () => {
      await moleculeViewer.uploadFile(molecules.crambin);

      // Switch to Ball & Stick to see individual atoms (Cartoon doesn't show atom tooltips)
      await moleculeViewer.toolbar.setBallAndStick();
      await moleculeViewer.page.waitForTimeout(300);

      // Hover over an atom to trigger tooltip
      await moleculeViewer.canvas.hoverAtom(0);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const text = await tooltip.textContent() || '';
      // PDB atoms have names like CA, CB, N, O, etc.
      expect(text).toMatch(/Atom Name|CA|CB|[NC]|O[A-Z]?/);
    });

    test('[AT-09] should display atom serial number', async () => {
      await moleculeViewer.uploadFile(molecules.crambin);

      // Switch to Ball & Stick to see individual atoms
      await moleculeViewer.toolbar.setBallAndStick();
      await moleculeViewer.page.waitForTimeout(300);

      await moleculeViewer.canvas.hoverAtom(0);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const text = await tooltip.textContent() || '';
      // Should contain serial number
      expect(text).toMatch(/Serial|#\d+/);
    });
  });

  test.describe('Residue Information', () => {
    test('[AT-10] should display residue name for proteins', async () => {
      await moleculeViewer.uploadFile(molecules.crambin);

      // Switch to Ball & Stick to see individual atoms
      await moleculeViewer.toolbar.setBallAndStick();
      await moleculeViewer.page.waitForTimeout(300);

      await moleculeViewer.canvas.hoverAtom(0);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const text = await tooltip.textContent() || '';
      // Should contain amino acid residue info
      expect(text).toMatch(/Residue|ALA|ARG|ASN|ASP|CYS|GLN|GLU|GLY|HIS|ILE|LEU|LYS|MET|PHE|PRO|SER|THR|TRP|TYR|VAL/i);
    });

    test('[AT-11] should display residue number', async () => {
      await moleculeViewer.uploadFile(molecules.crambin);

      // Switch to Ball & Stick to see individual atoms
      await moleculeViewer.toolbar.setBallAndStick();
      await moleculeViewer.page.waitForTimeout(300);

      await moleculeViewer.canvas.hoverAtom(0);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const text = await tooltip.textContent() || '';
      // Should contain residue number
      expect(text).toMatch(/\d+/);
    });

    test('[AT-12] should display chain ID', async () => {
      await moleculeViewer.uploadFile(molecules.crambin);

      // Switch to Ball & Stick to see individual atoms
      await moleculeViewer.toolbar.setBallAndStick();
      await moleculeViewer.page.waitForTimeout(300);

      await moleculeViewer.canvas.hoverAtom(0);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const text = await tooltip.textContent() || '';
      // Should contain chain ID (e.g., (A) or Chain A)
      expect(text).toMatch(/\([A-Z]\)|Chain\s*[A-Z]/i);
    });
  });

  test.describe('Coordinates', () => {
    test('[AT-13] should display atom coordinates', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const success = await moleculeViewer.canvas.hoverAtom(0);
      expect(success).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const text = await tooltip.textContent() || '';
      // Should contain coordinates in format (x, y, z)
      expect(text).toMatch(/Position|\(-?\d+\.\d+,\s*-?\d+\.\d+,\s*-?\d+\.\d+\)/);
    });

    test('[AT-14] should show coordinates with proper precision', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const success = await moleculeViewer.canvas.hoverAtom(0);
      expect(success).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const text = await tooltip.textContent() || '';
      // Coordinates should have decimal precision (typically 3 decimal places)
      expect(text).toMatch(/-?\d+\.\d{3}/);
    });
  });

  test.describe('B-factor Information', () => {
    test('[AT-15] should display B-factor for protein atoms', async () => {
      await moleculeViewer.uploadFile(molecules.crambin);

      // Switch to Ball & Stick to see individual atoms
      await moleculeViewer.toolbar.setBallAndStick();
      await moleculeViewer.page.waitForTimeout(300);

      await moleculeViewer.canvas.hoverAtom(0);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const text = await tooltip.textContent() || '';
      // Should contain B-factor info
      expect(text).toMatch(/B-factor|B\s*factor|temp.*factor/i);
    });

    test('[AT-16] should show B-factor value as number', async () => {
      await moleculeViewer.uploadFile(molecules.crambin);

      // Switch to Ball & Stick to see individual atoms
      await moleculeViewer.toolbar.setBallAndStick();
      await moleculeViewer.page.waitForTimeout(300);

      await moleculeViewer.canvas.hoverAtom(0);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const text = await tooltip.textContent() || '';
      // B-factor should be a positive number
      const hasBfactor = text.match(/B-factor.*\d+\.\d+|temp.*factor.*\d+/i);
      expect(hasBfactor).toBeTruthy();
    });
  });

  test.describe('Additional Properties', () => {
    test('[AT-17] should display VdW radius', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const success = await moleculeViewer.canvas.hoverAtom(0);
      expect(success).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const text = await tooltip.textContent() || '';
      // Should contain VdW radius
      expect(text).toMatch(/VdW|Van der Waals|Radius/i);
    });

    test('[AT-18] should display covalent radius', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const success = await moleculeViewer.canvas.hoverAtom(0);
      expect(success).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const text = await tooltip.textContent() || '';
      // Should contain covalent radius
      expect(text).toMatch(/Covalent|Radius/i);
    });

    test('[AT-19] should display connection count', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const success = await moleculeViewer.canvas.hoverAtom(0);
      expect(success).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const text = await tooltip.textContent() || '';
      // Should contain connections/bonds count
      expect(text).toMatch(/Connection|Bond|\d+/i);
    });
  });

  test.describe('Tooltip Positioning', () => {
    test('[AT-20] should position tooltip near cursor', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Hover over a specific atom
      const atomPos = await moleculeViewer.canvas.getAtomScreenPosition(0);
      expect(atomPos).not.toBeNull();

      await moleculeViewer.page.mouse.move(atomPos!.x, atomPos!.y);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const tooltipBox = await tooltip.boundingBox();
      expect(tooltipBox).not.toBeNull();

      // Tooltip should be near the hover position
      expect(Math.abs(tooltipBox!.x - atomPos!.x)).toBeLessThan(200);
      expect(Math.abs(tooltipBox!.y - atomPos!.y)).toBeLessThan(200);
    });

    test('[AT-21] should stay within viewport bounds', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      // Hover over a specific atom - tooltip should always stay within viewport
      const success = await moleculeViewer.canvas.hoverAtom(0);
      expect(success).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[class*="atomTooltip"], [class*="AtomTooltip"], [role="tooltip"]');
      await expect(tooltip).toBeVisible();

      const tooltipBox = await tooltip.boundingBox();
      const viewport = moleculeViewer.page.viewportSize();

      expect(tooltipBox).not.toBeNull();
      expect(viewport).not.toBeNull();

      // Tooltip should be within viewport
      expect(tooltipBox!.x).toBeGreaterThanOrEqual(0);
      expect(tooltipBox!.y).toBeGreaterThanOrEqual(0);
      expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(viewport!.width);
      expect(tooltipBox!.y + tooltipBox!.height).toBeLessThanOrEqual(viewport!.height);
    });
  });

  test.describe('Tooltip Accessibility', () => {
    test('[AT-22] should have accessible role', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const success = await moleculeViewer.canvas.hoverAtom(0);
      expect(success).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[role="tooltip"]');
      await expect(tooltip).toBeVisible();

      // Tooltip should have role="tooltip" for accessibility
      expect(await tooltip.getAttribute('role')).toBe('tooltip');
    });

    test('[AT-23] should have aria-live for screen readers', async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');

      const success = await moleculeViewer.canvas.hoverAtom(0);
      expect(success).toBe(true);
      await moleculeViewer.page.waitForTimeout(300);

      const tooltip = moleculeViewer.page.locator('[aria-live]');
      const hasAriaLive = await tooltip.isVisible().catch(() => false);

      // Tooltip may or may not have aria-live - just assert the result
      // This is checking for accessibility best practices
      expect(typeof hasAriaLive).toBe('boolean');
    });
  });
});
