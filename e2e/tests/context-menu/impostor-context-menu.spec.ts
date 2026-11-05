import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { addSyntheticProtein } from '../../helpers';

/**
 * Spacefill draws impostors from 2000 atoms (no mesh per atom), and the atom
 * menu comes from picking on the impostor mesh (ImpostorAtoms).
 */
test('right-click on an atom of a 2,400-atom Spacefill structure opens the atom menu', async ({ page }) => {
  test.slow();
  const viewer = new MoleculeViewerPage(page);
  await viewer.goto();
  const id = await addSyntheticProtein(page, 600); // 2,400 atoms
  await page.evaluate((id) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__mol3d_store.getState().setStructureRepresentation(id, 'spacefill');
  }, id);

  // 1. The impostor path is on: the impostor mesh, and no sphere meshes
  await expect.poll(async () => (await viewer.canvas.getImpostorAtomScreenPositions())?.all.length ?? 0).toBe(2400);
  expect(await viewer.canvas.getAtomScreenPosition(0)).toBeNull();
  await page.waitForTimeout(500); // Let the camera settle after framing

  // 2. Right-click the atom nearest the camera
  const positions = (await viewer.canvas.getImpostorAtomScreenPositions())!;
  expect(positions).not.toBeNull();
  const { x, y } = positions.nearest;
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, { x, y }), 'no overlay over the atom').toBe('CANVAS');
  await page.mouse.move(x, y);
  await page.waitForTimeout(100);
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });

  // 3. The menu is open, for an atom
  await expect(viewer.contextMenu).toBeVisible();
  const atomIndex = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__mol3d_store.getState().contextMenu.atomIndex;
  });
  expect(atomIndex).not.toBeNull();

  // 4. Control: on bare canvas, away from every atom, the menu stays closed.
  // The menu comes from atom picking, not from any right-click.
  await page.keyboard.press('Escape');
  await expect(viewer.contextMenu).toBeHidden();
  const empty = await page.evaluate((all) => {
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const corners = [
      { x: canvas.left + 20, y: canvas.top + 20 },
      { x: canvas.right - 20, y: canvas.top + 20 },
      { x: canvas.left + 20, y: canvas.bottom - 20 },
      { x: canvas.right - 20, y: canvas.bottom - 20 },
    ];
    // The toolbar and the chips over the viewer cover parts of the canvas
    return corners.find((c) =>
      document.elementFromPoint(c.x, c.y)?.tagName === 'CANVAS' &&
      all.every((p) => Math.hypot(p.x - c.x, p.y - c.y) > 30)
    ) ?? null;
  }, positions.all);
  expect(empty, 'a canvas corner with no atom and no overlay').not.toBeNull();
  await page.mouse.move(empty!.x, empty!.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(300);
  await expect(viewer.contextMenu).toBeHidden();
});
