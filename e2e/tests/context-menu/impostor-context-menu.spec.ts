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

// GPU picking (from 5,000 atoms) reads a 1/4-resolution buffer, where one
// pixel covers 4x4 here: a point counts only if its neighbours 3 px away agree.
// The CPU raycast below that tests the spheres themselves: `margin` 0.
const around = (p: Point, margin = 3): Point[] => [
  p,
  ...[[margin, 0], [-margin, 0], [0, margin], [0, -margin]].map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy })),
];

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
 * Below 5,000 atoms the raycast tests the spheres; from 5,000 a GPU pick.
 */
for (const residues of [600, 1500]) {
  test(`Overlay (${(residues * 4).toLocaleString('en-US')} atoms): where two structures overlap, hover and click pick the front one`, async ({ page }) => {
    test.slow();
    // The home view looks from (1, 0.7, 1), so the screen's X axis is (1, 0, -1).
    // B goes about 3/4 of the cube's edge along it (25 Å for 2,400 atoms), and
    // 8 Å toward the camera, so the screen has A alone, B alone and an overlap.
    const edge = (Math.ceil(Math.cbrt(residues * 4)) - 1) * 2.5;
    const sideways = (0.77 * edge) / Math.SQRT2;
    const toCamera = 8 / Math.hypot(1, 0.7, 1);
    const shift = { x: sideways + toCamera, y: 0.7 * toCamera, z: -sideways + toCamera };
    const { viewer, ids } = await spacefillStructures(page, residues, 'overlay', [{}, shift]);
    const [a, b] = ids;
    const gpu = residues * 4 >= 5000;
    const margin = gpu ? 3 : 0;
    if (gpu) {
      // Two such cubes fit the view with atoms about 8 px in radius, too small
      // for the 3 px margins: zoom in about 2x toward the middle, where they
      // overlap, and let the damping settle. Then the pointer leaves the
      // canvas, so no atom tooltip covers it.
      const box = await viewer.canvas.getBoundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let step = 0; step < 6; step++) await page.mouse.wheel(0, -100);
      await page.mouse.move(box.x - 20, box.y + 20);
      await page.waitForTimeout(1500);
    }
    const atomsA = (await viewer.canvas.getImpostorAtomScreenPositions(0))!.all;
    const atomsB = (await viewer.canvas.getImpostorAtomScreenPositions(1))!.all;

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
          // Whole pixels, as a click's coordinates are: a pointer move's needn't
          // be, and a fraction of a pixel can move a GPU pick to the neighbour
          const p = { x: Math.round(atom.x) + dx, y: Math.round(atom.y) + dy };
          if (distance(p, atom) > r || around(p, margin).some((q) => frontmost(nearA, q) !== atom)) continue;
          if (nearB.every((other) => distance(p, other) > other.radiusPx + 1 + margin)) clear ??= p;
          const coveredByB = (q: Point) => {
            const b = frontmost(nearB, q);
            return !!b && surface(b, q) + 0.5 < surface(atom, q);
          };
          if (around(p, margin).every(coveredByB)) covered ??= p;
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
}

/**
 * From 5,000 atoms the atom comes from a GPU pick, which renders a copy of the
 * mesh in a scene of its own. The control (one structure, Overlay) tells a
 * pick that finds nothing from a copy that misses the structure's offset
 * (Side-by-Side). The exact atom: the shader draws atom i as i + 1, and an
 * off-by-one would pick a neighbour.
 */
for (const layout of ['overlay', 'side-by-side'] as const) {
  test(`GPU picking (6,000 atoms), ${layout}: hover and right-click pick the atom under the pointer`, async ({ page }) => {
    test.slow();
    const count = layout === 'overlay' ? 1 : 2;
    const shifts = Array.from({ length: count }, () => ({}));
    const { viewer, ids } = await spacefillStructures(page, 1500, layout, shifts);
    const atom = (await viewer.canvas.getImpostorAtomScreenPositions(count - 1))!.nearest;
    expect(await isCanvasAt(page, atom), 'no overlay over the atom').toBe(true);

    await page.mouse.move(atom.x, atom.y);
    await expect.poll(async () => {
      const s = await storeState(page);
      return { structureId: s.hoveredStructureId, atomIndex: s.hoveredAtomIndex };
    }).toEqual({ structureId: ids[count - 1], atomIndex: atom.instance });

    await rightClick(page, atom);
    await expect(viewer.contextMenu).toBeVisible();
    expect((await storeState(page)).menu).toEqual({ structureId: ids[count - 1], atomIndex: atom.instance });
  });
}

/**
 * The whole sphere picks its atom, not just the middle: three's own raycast
 * tests a 1x1 Å square per atom, so most of a sphere fired no event at all.
 */
test('GPU picking (6,000 atoms): hover near the edge of an atom picks that atom', async ({ page }) => {
  test.slow();
  const { viewer, ids } = await spacefillStructures(page, 1500, 'overlay', [{}]);
  const { all, nearest } = (await viewer.canvas.getImpostorAtomScreenPositions())!;
  const near = all.filter((other) => distance(other, nearest) < other.radiusPx + nearest.radiusPx);

  // A point 0.7 of the radius out from the centre where the atom is still in front
  let edge: Point | null = null;
  for (let step = 0; step < 16 && !edge; step++) {
    const angle = (step / 16) * 2 * Math.PI;
    const p = {
      x: nearest.x + 0.7 * nearest.radiusPx * Math.cos(angle),
      y: nearest.y + 0.7 * nearest.radiusPx * Math.sin(angle),
    };
    if (around(p).every((q) => frontmost(near, q) === nearest) && (await isCanvasAt(page, p))) edge = p;
  }
  expect(edge, 'a point near the edge where the atom is in front').not.toBeNull();

  await page.mouse.move(edge!.x, edge!.y);
  await expect.poll(async () => {
    const s = await storeState(page);
    return { structureId: s.hoveredStructureId, atomIndex: s.hoveredAtomIndex };
  }).toEqual({ structureId: ids[0], atomIndex: nearest.instance });
});

/**
 * A GPU pick on every event of an orbit drag or wheel zoom halved the frame
 * rate, so there is none mid-gesture: the hover clears while the camera turns,
 * and the next plain move picks again.
 */
test('GPU picking (6,000 atoms): no pick during an orbit drag, hover again after it', async ({ page }) => {
  test.slow();
  const { viewer, ids } = await spacefillStructures(page, 1500, 'overlay', [{}]);
  const hover = () => expect.poll(async () => {
    const s = await storeState(page);
    return { structureId: s.hoveredStructureId, atomIndex: s.hoveredAtomIndex };
  });
  const before = (await viewer.canvas.getImpostorAtomScreenPositions())!.nearest;
  await page.mouse.move(before.x, before.y);
  await hover().toEqual({ structureId: ids[0], atomIndex: before.instance });

  // Drag 40 px over the structure: the hover clears
  await page.mouse.down();
  await page.mouse.move(before.x + 40, before.y, { steps: 5 });
  await hover().toEqual({ structureId: null, atomIndex: null });
  await page.mouse.up();
  await page.waitForTimeout(1500); // Let the damping settle

  // The camera turned: the atom under the pointer now
  const after = (await viewer.canvas.getImpostorAtomScreenPositions())!.nearest;
  await page.mouse.move(after.x, after.y);
  await hover().toEqual({ structureId: ids[0], atomIndex: after.instance });
});
