import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { addSyntheticProtein } from '../../helpers';
import type { ImpostorAtomPosition } from '../../page-objects/Canvas3D';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Store = any;
type Point = { x: number; y: number };

/** Synthetic proteins in Spacefill, in the given layout, framed and settled. */
async function spacefillStructures(
  page: Page,
  residues: number,
  layout: 'overlay' | 'side-by-side',
  shifts: { x?: number; y?: number; z?: number }[]
): Promise<{ viewer: MoleculeViewerPage; ids: string[] }> {
  const viewer = new MoleculeViewerPage(page);
  await viewer.goto();
  const ids: string[] = [];
  for (const shift of shifts) ids.push(await addSyntheticProtein(page, residues, shift));
  await page.evaluate(({ ids, layout }) => {
    const state = (window as unknown as { __mol3d_store: Store }).__mol3d_store.getState();
    state.setLayoutMode(layout);
    for (const id of ids) state.setStructureRepresentation(id, 'spacefill');
  }, { ids, layout });
  for (let mesh = 0; mesh < ids.length; mesh++) {
    await expect.poll(async () => (await viewer.canvas.getImpostorAtomScreenPositions(mesh))?.all.length ?? 0).toBe(residues * 4);
  }
  await page.waitForTimeout(500); // Let the camera settle after framing
  return { viewer, ids };
}

const storeState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __mol3d_store: Store }).__mol3d_store.getState();
    return {
      hoveredStructureId: s.hoveredStructureId as string | null,
      hoveredAtomIndex: s.hoveredAtomIndex as number | null,
      menu: s.contextMenu
        ? { structureId: s.contextMenu.structureId as string, atomIndex: s.contextMenu.atomIndex as number | null }
        : null,
      selected: s.selectedAtoms as { structureId: string; atomIndex: number }[],
    };
  });

const isCanvasAt = (page: Page, p: Point) =>
  page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', p);

const distance = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);

async function rightClick(page: Page, p: Point) {
  await page.mouse.move(p.x, p.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
}

/**
 * Side-by-Side moves each structure by its group's position. The pointer
 * handlers take the atom the mesh's raycast found (world space, offset
 * included), not a second test of the world ray against local positions.
 */
test('Side-by-Side: hover and right-click on the second structure pick its own atom', async ({ page }) => {
  test.slow();
  const { viewer, ids } = await spacefillStructures(page, 600, 'side-by-side', [{}, {}]); // 2,400 atoms each
  const atom = (await viewer.canvas.getImpostorAtomScreenPositions(1))!.nearest;
  expect(await isCanvasAt(page, atom), 'no overlay over the atom').toBe(true);

  await page.mouse.move(atom.x, atom.y);
  await expect.poll(async () => {
    const s = await storeState(page);
    return { structureId: s.hoveredStructureId, atomIndex: s.hoveredAtomIndex };
  }).toEqual({ structureId: ids[1], atomIndex: atom.instance });

  await rightClick(page, atom);
  await expect(viewer.contextMenu).toBeVisible();
  expect((await storeState(page)).menu).toEqual({ structureId: ids[1], atomIndex: atom.instance });
});

/**
 * Overlay: where two structures overlap on screen, the ray goes through both
 * meshes and R3F calls both handlers, nearest first. The nearer one must win,
 * and moving onto it from the farther one must not lose the hover: R3F's
 * stopPropagation sends the farther mesh a pointer-out, which clears the hover.
 */
test('Overlay: where two structures overlap, hover and click pick the front one', async ({ page }) => {
  test.slow();
  // The home view looks from (1, 0.7, 1), so the screen's X axis is (1, 0, -1).
  // B goes about half the 35 Å cube's width along it, and 8 Å toward the
  // camera, so the screen has A alone, B alone and an overlap.
  const sideways = 25 / Math.SQRT2;
  const toCamera = 8 / Math.hypot(1, 0.7, 1);
  const shift = { x: sideways + toCamera, y: 0.7 * toCamera, z: -sideways + toCamera };
  const { viewer, ids } = await spacefillStructures(page, 600, 'overlay', [{}, shift]);
  const [a, b] = ids;
  const atomsA = (await viewer.canvas.getImpostorAtomScreenPositions(0))!.all;
  const atomsB = (await viewer.canvas.getImpostorAtomScreenPositions(1))!.all;

  // Where the ray through `p` meets the atom's sphere, in Å from the camera
  const surface = (atom: ImpostorAtomPosition, p: Point) => {
    const t = distance(atom, p) / atom.radiusPx;
    return t < 1 ? atom.depth - atom.radius * Math.sqrt(1 - t * t) : Infinity;
  };
  const frontmost = (atoms: ImpostorAtomPosition[], p: Point) => {
    let best: ImpostorAtomPosition | null = null;
    for (const atom of atoms) if (surface(atom, p) < (best ? surface(best, p) : Infinity)) best = atom;
    return best;
  };

  // R3F keeps hover per instance, and drops an instance the ray no longer hits
  // before any handler runs. So the pointer-out that stopPropagation sends
  // happens only when the same A atom is under both points. Inside one A
  // atom's disc, where it is A's front atom: the start is clear of B, the end
  // has B at least 0.5 Å in front of it.
  let start: Point | null = null;
  let end: Point | null = null;
  let startAtom: ImpostorAtomPosition | null = null;
  search: for (const atom of atomsA) {
    const touches = (other: ImpostorAtomPosition) => distance(other, atom) < other.radiusPx + atom.radiusPx;
    const nearB = atomsB.filter(touches);
    if (nearB.length === 0) continue;
    const nearA = atomsA.filter(touches);
    let clear: Point | null = null;
    let covered: Point | null = null;
    const r = Math.floor(atom.radiusPx * 0.8);
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const p = { x: atom.x + dx, y: atom.y + dy };
        if (distance(p, atom) > r || frontmost(nearA, p) !== atom) continue;
        const b = frontmost(nearB, p);
        if (!b && nearB.every((other) => distance(p, other) > other.radiusPx + 1)) clear ??= p;
        if (b && surface(b, p) + 0.5 < surface(atom, p)) covered ??= p;
      }
    }
    if (clear && covered && (await isCanvasAt(page, clear)) && (await isCanvasAt(page, covered))) {
      start = clear;
      end = covered;
      startAtom = atom;
      break search;
    }
  }
  expect(end, 'an A atom with a part clear of B and a part B is in front of').not.toBeNull();

  // 1. A's atom is hovered first
  await page.mouse.move(start!.x, start!.y);
  await expect.poll(async () => {
    const s = await storeState(page);
    return { structureId: s.hoveredStructureId, atomIndex: s.hoveredAtomIndex };
  }).toEqual({ structureId: a, atomIndex: startAtom!.instance });

  // 2. One move to where B covers that A atom, checked right after it: the
  // next move would set the hover again, so more moves would hide a lost one.
  // The atom may be another B atom in front of `end`: the structure counts.
  await page.mouse.move(end!.x, end!.y, { steps: 1 });
  const hovered = await storeState(page);
  expect(hovered.hoveredStructureId).toBe(b);

  // 3. A click there selects that B atom, and only it
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => (await storeState(page)).selected)
    .toEqual([{ structureId: b, atomIndex: hovered.hoveredAtomIndex }]);
});
