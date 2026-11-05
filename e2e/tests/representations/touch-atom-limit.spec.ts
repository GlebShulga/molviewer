import { test, expect } from '../../fixtures';
import { MoleculeViewerPage, ControlPanelPage } from '../../page-objects';
import { addSyntheticProtein } from '../../helpers';

/**
 * The 1,000-atom limit on Ball & Stick and Stick is for touch screens only
 * (mobile/touch-atom-limit.spec.ts): a desktop keeps every style.
 */
test('a desktop keeps every style for a protein over 1,000 atoms', async ({ page }) => {
  const viewer = new MoleculeViewerPage(page);
  await viewer.goto();
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(false);

  await addSyntheticProtein(page, 300); // 1,200 atoms

  const toolbar = page.getByTestId('toolbar');
  await expect(toolbar.getByRole('button', { name: 'Ball & Stick', exact: true })).toBeEnabled();
  await expect(toolbar.getByRole('button', { name: 'Stick', exact: true })).toBeEnabled();

  const panel = new ControlPanelPage(page);
  await expect(panel.ballAndStickButton).toBeEnabled();
  await expect(panel.stickButton).toBeEnabled();
  await expect(page.getByText(/on a touch screen/)).toHaveCount(0);

  await panel.ballAndStickButton.click({ force: true });
  await expect(panel.ballAndStickButton).toHaveAttribute('aria-pressed', 'true');
});
