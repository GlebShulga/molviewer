import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { addSyntheticProtein } from '../../helpers';

/**
 * Impostors (Spacefill from 2,000 atoms, Ball & Stick and Stick from 5,000)
 * draw each atom as a disc on a billboard. The disc must be the atom's full
 * radius, as the meshes below those sizes are: it once came out at half.
 *
 * The atom whose disc reaches furthest right is the one atom drawn on its
 * centre row past its own centre-to-edge span, so the first background pixel
 * going right from its centre is its edge, whatever lies in front of it. Other
 * directions run into a neighbour first: full-size spheres overlap.
 * The cube's spacing is chosen so each style's spheres are over 10 px on screen.
 */
const CASES = [
  { representation: 'spacefill', residues: 500, spacing: 2.5 }, // 2,000 atoms
  { representation: 'ball-and-stick', residues: 1250, spacing: 1.2 }, // 5,000 atoms
  { representation: 'stick', residues: 1250, spacing: 0.5 },
] as const;

/** Building the mesh for thousands of atoms takes CI's software WebGL more than the default 5 s. */
const MESH_TIMEOUT = 20_000;

for (const { representation, residues, spacing } of CASES) {
  test(`${representation} impostors (${(residues * 4).toLocaleString('en-US')} atoms) are drawn at the atom's full radius`, async ({ page }) => {
    test.slow();
    // Light theme: a sphere's dark rim stands out against the background
    await page.addInitScript(() => localStorage.setItem('mol3d-theme', 'light'));
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto();
    const id = await addSyntheticProtein(page, residues, {}, spacing);
    await page.evaluate(({ id, representation }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__mol3d_store.getState().setStructureRepresentation(id, representation);
    }, { id, representation });
    await expect.poll(async () => (await viewer.canvas.getImpostorAtomScreenPositions())?.all.length ?? 0, { timeout: MESH_TIMEOUT }).toBe(residues * 4);
    await page.waitForTimeout(500); // Let the camera settle after framing

    const { all } = (await viewer.canvas.getImpostorAtomScreenPositions())!;
    const atom = all.reduce((a, b) => (b.x + b.radiusPx > a.x + a.radiusPx ? b : a));
    expect(atom.radiusPx, 'large enough on screen to tell full from half').toBeGreaterThan(10);

    // The canvas keeps its last frame (preserveDrawingBuffer), so it can be copied
    const edge = await page.evaluate(({ x, y }) => {
      const canvas = document.querySelector('canvas')!;
      const rect = canvas.getBoundingClientRect();
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      const ctx = copy.getContext('2d')!;
      ctx.drawImage(canvas, 0, 0);
      const scale = canvas.width / rect.width;
      const background = ctx.getImageData(0, 0, 1, 1).data; // An empty corner
      const row = ctx.getImageData(0, Math.round((y - rect.top) * scale), canvas.width, 1).data;
      for (let px = Math.round((x - rect.left) * scale); px < canvas.width; px++) {
        const difference = [0, 1, 2].reduce((sum, c) => sum + Math.abs(row[px * 4 + c] - background[c]), 0);
        if (difference < 24) return rect.left + px / scale; // Antialiased edges blend in
      }
      return null;
    }, atom);

    expect(edge, 'background to the right of the atom').not.toBeNull();
    expect(Math.abs(edge! - (atom.x + atom.radiusPx)), `edge at ${edge}, full radius reaches ${atom.x + atom.radiusPx}`).toBeLessThan(2);
  });
}
