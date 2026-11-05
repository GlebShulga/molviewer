import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { molecules } from '../../fixtures';
import { waitForMoleculeLoaded } from '../../helpers/wait-for-render';

/**
 * Wide screens after the mobile fixes: the toolbar keeps all its groups, and
 * the chips over the viewer (error, measurement hint, title, legend) and the
 * atom tooltip stay apart and on screen.
 */

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const insideViewport = (b: Box, vw: number, vh: number) => b.top >= 0 && b.left >= 0 && b.bottom <= vh && b.right <= vw;
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function withCrambin(page: Page) {
  await page.route('**/files.rcsb.org/download/1CRN.cif', (route) =>
    route.fulfill({ path: molecules.crambinCif, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' } })
  );
  await page.addInitScript(() => localStorage.setItem('mol3d-onboarding-completed', 'true'));
  await page.goto('/pdb/1CRN');
  await waitForMoleculeLoaded(page);
}

/** Shows the tooltip for 1CRN's first atom as if the pointer were at (x, y). */
async function hoverAtomAt(page: Page, x: number, y: number) {
  await page.evaluate(({ x, y }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__mol3d_store.getState();
    const id = s.structureOrder[0];
    s.setHoveredAtom(s.structures.get(id).molecule.atoms[0], 0, id, { x, y });
  }, { x, y });
}

test.describe('Viewer overlays on wide screens', () => {
  test('the toolbar keeps every group and no "More" button', async ({ page }) => {
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto();
    await viewer.loadSampleMolecule('caffeine');

    for (const name of ['Undo', 'Redo', 'Reset View', 'Auto Rotate', 'Export', 'Copy Link', 'Shortcuts']) {
      await expect(page.getByTestId('toolbar').getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'More', exact: true })).toBeHidden();
    // Shortcut in the tooltip and aria-keyshortcuts, not in the name
    await expect(viewer.toolbar.undoButton).toHaveAttribute('title', 'Undo (Ctrl+Z)');
    await expect(viewer.toolbar.undoButton).toHaveAttribute('aria-keyshortcuts', 'Control+Z');
  });

  test('the atom tooltip flips to stay inside the viewport near its edges', async ({ page }) => {
    await withCrambin(page);
    const { width, height } = page.viewportSize()!;
    for (const [x, y] of [[width - 5, height / 2], [width / 2, height - 5], [width - 5, height - 5]]) {
      await hoverAtomAt(page, x, y);
      const box = await page.getByTestId('atom-tooltip').evaluate((el) => el.getBoundingClientRect().toJSON());
      expect(box.left, `left at ${x},${y}`).toBeGreaterThanOrEqual(8);
      expect(box.top, `top at ${x},${y}`).toBeGreaterThanOrEqual(8);
      expect(box.right, `right at ${x},${y}`).toBeLessThanOrEqual(width - 8);
      expect(box.bottom, `bottom at ${x},${y}`).toBeLessThanOrEqual(height - 8);
    }
  });

  test('error, hint, title, legend and toolbar never overlap', async ({ page }) => {
    await withCrambin(page);
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).__mol3d_store.getState();
      s.setColorScheme('secondaryStructure');
      s.setMeasurementMode('distance');
      s.setError('Something went wrong while loading the second structure');
    });

    const testIds = ['toolbar', 'measurement-hint', 'color-legend', 'structure-title'];
    for (const id of testIds) await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId('measurement-hint')).toContainText('Click 2 atoms');

    const m = await page.evaluate((ids) => {
      const els: [string, Element | null][] = ids.map((id) => [id, document.querySelector(`[data-testid="${id}"]`)]);
      els.push(['error', document.querySelector('[role="alert"]')]);
      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        boxes: els.map(([name, el]) => ({ name, ...el!.getBoundingClientRect().toJSON() })),
      };
    }, testIds);

    for (const b of m.boxes) expect(insideViewport(b, m.vw, m.vh), `${b.name} on screen`).toBe(true);
    for (let i = 0; i < m.boxes.length; i++) {
      for (let j = i + 1; j < m.boxes.length; j++) {
        expect(overlaps(m.boxes[i], m.boxes[j]), `${m.boxes[i].name} overlaps ${m.boxes[j].name}`).toBe(false);
      }
    }
  });

  test('a phone-width window docks the atom card even with a mouse', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await withCrambin(page);
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__mol3d_store.getState().setMeasurementMode('distance');
    });
    await hoverAtomAt(page, 200, 400);

    await expect(page.getByTestId('atom-card')).toBeVisible();
    await expect(page.getByTestId('atom-tooltip')).toHaveCount(0);
    // Above the toolbar, clear of the hint
    const [card, hint, toolbar] = await Promise.all(
      ['atom-card', 'measurement-hint', 'toolbar'].map(async (id) => (await page.getByTestId(id).boundingBox())!)
    );
    expect(card.y + card.height).toBeLessThanOrEqual(hint.y);
    expect(hint.y + hint.height).toBeLessThanOrEqual(toolbar.y);
  });

  test('only toggles announce a pressed state', async ({ page }) => {
    await withCrambin(page);
    const toolbar = page.getByTestId('toolbar');
    await expect(toolbar.getByRole('button', { name: 'Copy Link' })).not.toHaveAttribute('aria-pressed');
    await expect(toolbar.getByRole('button', { name: 'Export', exact: true })).not.toHaveAttribute('aria-pressed');
    await expect(toolbar.getByRole('button', { name: 'Auto Rotate', exact: true })).toHaveAttribute('aria-pressed', 'false');
  });

  test('the structure chip scrolls the sidebar to Molecule Info, with no dialog', async ({ page }) => {
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto();
    await viewer.loadSampleMolecule('caffeine');
    const sidebar = page.locator('aside');

    await page.getByTestId('structure-title').click({ force: true });
    // Molecule Info at the top of the sidebar, or the sidebar scrolled to its end
    await expect.poll(() => sidebar.evaluate((aside) => {
      const target = document.getElementById('molecule-info')!.getBoundingClientRect().top - aside.getBoundingClientRect().top;
      return Math.abs(target - 16) < 4 || aside.scrollTop + aside.clientHeight >= aside.scrollHeight - 1;
    })).toBe(true);
    // Beside the viewer, not over it: no modal dialog
    await expect(sidebar).not.toHaveAttribute('role');
    await expect(sidebar).not.toHaveAttribute('aria-modal');

    // The chip didn't open a drawer that a narrower window would then show
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0);
    await expect(sidebar).not.toBeInViewport();

    // A drawer open while the window widens is closed when it narrows again
    await page.getByRole('button', { name: 'Open menu' }).click({ force: true });
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(sidebar).not.toHaveAttribute('role');
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0);
    await expect(sidebar).not.toBeInViewport();
  });

  test('Export downloads the image and says so', async ({ page }) => {
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto();
    await viewer.loadSampleMolecule('caffeine');

    const download = page.waitForEvent('download');
    await viewer.toolbar.exportButton.click({ force: true });
    expect((await download).suggestedFilename()).toMatch(/\.png$/);
    await expect(page.getByTestId('toast')).toHaveText('Image saved');
  });
});
