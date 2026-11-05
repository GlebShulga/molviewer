import { test, expect } from '../../fixtures';
import { MoleculeViewerPage, ControlPanelPage } from '../../page-objects';
import { addSyntheticProtein } from '../../helpers';

/**
 * Ball & Stick and Stick stop at 1,000 atoms on touch screens
 * (utils/representationAvailability). The desktop side is in
 * representations/touch-atom-limit.spec.ts.
 */

const MOBILE_PROJECTS = ['mobile-chrome', 'mobile-safari'];
const REASON = 'over 1,000 atoms on a touch screen; use Cartoon or Spacefill';

test.beforeEach(async ({}, testInfo) => {
  test.skip(!MOBILE_PROJECTS.includes(testInfo.project.name), 'Mobile tests only run on mobile-chrome and mobile-safari');
});

test('Ball & Stick and Stick are unavailable over 1,000 atoms, with the reason; Spacefill and Cartoon work', async ({ page }) => {
  const viewer = new MoleculeViewerPage(page);
  await viewer.goto();
  // The rule reads this: if the emulation doesn't report a touch screen, say so here
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'emulated device reports (pointer: coarse)').toBe(true);

  await addSyntheticProtein(page, 300); // 1,200 atoms

  const toolbar = page.getByTestId('toolbar');
  await expect(toolbar.getByRole('button', { name: 'Ball & Stick', exact: true })).toBeDisabled();
  await expect(toolbar.getByRole('button', { name: 'Stick', exact: true })).toBeDisabled();
  await expect(toolbar.getByRole('button', { name: 'Spacefill', exact: true })).toBeEnabled();

  await viewer.openSidebar();
  const panel = new ControlPanelPage(page);
  await expect(panel.ballAndStickButton).toBeDisabled();
  await expect(panel.stickButton).toBeDisabled();
  await expect(panel.representationSection.getByText(`Ball & Stick: ${REASON}`)).toBeVisible();
  await expect(panel.representationSection.getByText(`Stick: ${REASON}`, { exact: true })).toBeVisible();

  // A DOM click, as loadSampleMolecule does: Playwright places the sheet's
  // buttons outside the viewport while it slides
  await panel.spacefillButton.evaluate((el: HTMLElement) => el.click());
  await expect(panel.spacefillButton).toHaveAttribute('aria-pressed', 'true');
  await panel.cartoonButton.evaluate((el: HTMLElement) => el.click());
  await expect(panel.cartoonButton).toHaveAttribute('aria-pressed', 'true');
});

test('a small protein keeps every style', async ({ page }) => {
  const viewer = new MoleculeViewerPage(page);
  await viewer.goto();
  await addSyntheticProtein(page, 250); // 1,000 atoms: at the limit, not over it

  const toolbar = page.getByTestId('toolbar');
  await expect(toolbar.getByRole('button', { name: 'Ball & Stick', exact: true })).toBeEnabled();
  await expect(toolbar.getByRole('button', { name: 'Stick', exact: true })).toBeEnabled();
});
