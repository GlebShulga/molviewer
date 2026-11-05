import type { Page } from '@playwright/test';
import { waitForMoleculeLoaded } from './wait-for-render';

/**
 * A protein made up in the page, so a test doesn't depend on RCSB: residues of
 * N, CA, C, O (a backbone, so Cartoon is available), packed in a cube 2.5 Å
 * apart so Spacefill shows one solid block. Opens in Cartoon, like any protein.
 * @returns the structure id
 */
export async function addSyntheticProtein(page: Page, residues: number): Promise<string> {
  const id = await page.evaluate((residues) => {
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
      x: (i % side) * 2.5,
      y: (Math.floor(i / side) % side) * 2.5,
      z: Math.floor(i / (side * side)) * 2.5,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__mol3d_store;
    return store.getState().addStructure({ name: 'Synthetic protein', atoms, bonds: [] }, 'Synthetic protein') as string;
  }, residues);
  await waitForMoleculeLoaded(page);
  return id;
}
