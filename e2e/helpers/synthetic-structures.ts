import type { Page } from '@playwright/test';
import { waitForMoleculeLoaded } from './wait-for-render';

/**
 * A protein made up in the page, so a test doesn't depend on RCSB: residues of
 * N, CA, C, O (a backbone, so Cartoon is available), packed in a cube 2.5 Å
 * apart so Spacefill shows one solid block. Opens in Cartoon, like any protein.
 * `shift` moves every atom (Å), so two copies in Overlay don't coincide.
 * `spacing` (Å) packs the cube tighter, so small spheres (Stick, Ball & Stick)
 * come out larger on screen once it's framed.
 * @returns the structure id
 */
export async function addSyntheticProtein(
  page: Page,
  residues: number,
  shift: { x?: number; y?: number; z?: number } = {},
  spacing = 2.5
): Promise<string> {
  const id = await page.evaluate(({ residues, shift, spacing }) => {
    const names = [['N', 'N'], ['CA', 'C'], ['C', 'C'], ['O', 'O']];
    const count = residues * 4;
    const side = Math.ceil(Math.cbrt(count));
    const atoms = Array.from({ length: count }, (_, i) => ({
      id: i,
      name: names[i % 4][0],
      element: names[i % 4][1],
      residueName: 'ALA',
      residueNumber: Math.floor(i / 4) + 1,
      chainId: 'A',
      x: (i % side) * spacing + (shift.x ?? 0),
      y: (Math.floor(i / side) % side) * spacing + (shift.y ?? 0),
      z: Math.floor(i / (side * side)) * spacing + (shift.z ?? 0),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__mol3d_store;
    return store.getState().addStructure({ name: 'Synthetic protein', atoms, bonds: [] }, 'Synthetic protein') as string;
  }, { residues, shift, spacing });
  await waitForMoleculeLoaded(page);
  return id;
}
