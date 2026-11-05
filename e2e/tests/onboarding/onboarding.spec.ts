import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { waitForMoleculeLoaded } from '../../helpers/wait-for-render';

test.describe('Onboarding Tour', () => {
  test('shows welcome screen on first visit', async ({ page }) => {
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto({ keepWelcome: true });
    // Welcome screen should be visible instead of empty state
    await expect(page.locator('[data-onboarding="welcome-screen"]')).toBeVisible();
    await expect(page.getByText('Get Started')).toBeVisible();
    // Empty state should NOT be visible
    await expect(page.locator('[class*="emptyState"]')).not.toBeVisible();
  });

  test('Get Started button loads molecule and starts tour', async ({ page }) => {
    test.slow(); // RCSB fetch
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto({ keepWelcome: true });
    await page.getByRole('button', { name: 'Get Started' }).click({ force: true });
    // Wait for molecule to load
    await waitForMoleculeLoaded(page, 60000);
    // Tour spotlight should appear (step 1)
    await expect(page.locator('[data-onboarding="spotlight-tooltip"]')).toBeVisible();
    await expect(page.getByText('Load Molecules')).toBeVisible();
    await expect(page.getByText('1 of 4')).toBeVisible();
  });

  test('navigates through all 4 tour steps', async ({ page }) => {
    test.slow();
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto({ keepWelcome: true });
    await page.getByRole('button', { name: 'Get Started' }).click({ force: true });
    await waitForMoleculeLoaded(page, 60000);

    // Step 1: Load Molecules
    await expect(page.getByText('1 of 4')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click({ force: true });
    await page.waitForTimeout(400);

    // Step 2: Representations
    await expect(page.getByText('2 of 4')).toBeVisible();
    await expect(page.getByText('Representations')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click({ force: true });
    await page.waitForTimeout(400);

    // Step 3: Measurements
    await expect(page.getByText('3 of 4')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click({ force: true });
    await page.waitForTimeout(400);

    // Step 4: View Controls
    await expect(page.getByText('4 of 4')).toBeVisible();
    await page.getByRole('button', { name: 'Finish' }).click({ force: true });
    await page.waitForTimeout(300);

    // Tour should be dismissed
    await expect(page.locator('[data-onboarding="spotlight-tooltip"]')).not.toBeVisible();
  });

  test('at exactly 768px the tour takes the phone path: the drawer, then the "More" menu', async ({ page }) => {
    test.slow();
    // The toolbar and the drawer switch at max-width: 768px, so 768 is a phone layout
    await page.setViewportSize({ width: 768, height: 1024 });
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto({ keepWelcome: true });
    await page.getByRole('button', { name: 'Get Started' }).click({ force: true });
    await waitForMoleculeLoaded(page, 60000);

    // Step 1 points into the drawer, so it opens it
    await expect(page.getByText('1 of 4')).toBeVisible();
    await expect(page.locator('aside')).toBeInViewport();

    for (const next of ['2 of 4', '3 of 4', '4 of 4']) {
      await page.getByRole('button', { name: 'Next' }).click({ force: true });
      await page.waitForTimeout(400);
      await expect(page.getByText(next)).toBeVisible();
    }

    // Step 4: the phone text, around the "More" button
    await expect(page.getByText('are in the ⋯ menu')).toBeVisible();
    const more = (await page.getByRole('button', { name: 'More', exact: true }).boundingBox())!;
    const ring = (await page.locator('[class*="spotlightRing"]').boundingBox())!;
    const center = { x: more.x + more.width / 2, y: more.y + more.height / 2 };
    expect(center.x).toBeGreaterThan(ring.x);
    expect(center.x).toBeLessThan(ring.x + ring.width);
    expect(center.y).toBeGreaterThan(ring.y);
    expect(center.y).toBeLessThan(ring.y + ring.height);
  });

  test('Skip button dismisses tour and sets flag', async ({ page }) => {
    test.slow();
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto({ keepWelcome: true });
    await page.getByRole('button', { name: 'Get Started' }).click({ force: true });
    await waitForMoleculeLoaded(page, 60000);

    await page.getByRole('button', { name: 'Skip' }).click({ force: true });
    await page.waitForTimeout(300);
    await expect(page.locator('[data-onboarding="spotlight-tooltip"]')).not.toBeVisible();

    // Verify localStorage flag was set
    const flag = await page.evaluate(() => localStorage.getItem('mol3d-onboarding-completed'));
    expect(flag).toBe('true');
  });

  test('ESC key dismisses tour', async ({ page }) => {
    test.slow();
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto({ keepWelcome: true });
    await page.getByRole('button', { name: 'Get Started' }).click({ force: true });
    await waitForMoleculeLoaded(page, 60000);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(page.locator('[data-onboarding="spotlight-tooltip"]')).not.toBeVisible();
  });

  test('click on the dimmed area dismisses tour', async ({ page }) => {
    test.slow();
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto({ keepWelcome: true });
    await page.getByRole('button', { name: 'Get Started' }).click({ force: true });
    await waitForMoleculeLoaded(page, 60000);
    await expect(page.locator('[data-onboarding="spotlight-tooltip"]')).toBeVisible();

    // Bottom right of the viewer: step 1 spotlights the sidebar on the left,
    // with the tooltip beside it.
    const viewport = page.viewportSize()!;
    await page.mouse.click(viewport.width - 40, viewport.height - 40);
    await page.waitForTimeout(300);
    await expect(page.locator('[data-onboarding="spotlight-tooltip"]')).not.toBeVisible();
  });

  test('returning user does not see onboarding', async ({ page }) => {
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto();
    // Should see normal empty state, not welcome screen
    await expect(page.locator('[class*="emptyState"]')).toBeVisible();
    await expect(page.locator('[data-onboarding="welcome-screen"]')).not.toBeVisible();
  });

  test('URL params bypass onboarding', async ({ page }) => {
    test.slow();
    await page.goto('/?pdb=1CRN', { waitUntil: 'domcontentloaded' });
    await waitForMoleculeLoaded(page, 60000);
    // No welcome screen or tour
    await expect(page.locator('[data-onboarding="welcome-screen"]')).not.toBeVisible();
    await expect(page.locator('[data-onboarding="spotlight-tooltip"]')).not.toBeVisible();
  });

  test('Back button returns to previous step', async ({ page }) => {
    test.slow();
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto({ keepWelcome: true });
    await page.getByRole('button', { name: 'Get Started' }).click({ force: true });
    await waitForMoleculeLoaded(page, 60000);

    // Step 1 → Next → Step 2
    await page.getByRole('button', { name: 'Next' }).click({ force: true });
    await page.waitForTimeout(400);
    await expect(page.getByText('2 of 4')).toBeVisible();

    // Step 2 → Back → Step 1
    await page.getByRole('button', { name: 'Back' }).click({ force: true });
    await page.waitForTimeout(400);
    await expect(page.getByText('1 of 4')).toBeVisible();
  });
});
