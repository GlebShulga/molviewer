import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { waitForMoleculeLoaded } from '../../helpers/wait-for-render';

test.describe('Onboarding Tour', () => {
  test('shows welcome screen on first visit', async ({ page }) => {
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto();
    // Welcome screen should be visible instead of empty state
    await expect(page.locator('[data-onboarding="welcome-screen"]')).toBeVisible();
    await expect(page.getByText('Get Started')).toBeVisible();
    // Empty state should NOT be visible
    await expect(page.locator('[class*="emptyState"]')).not.toBeVisible();
  });

  test('Get Started button loads molecule and starts tour', async ({ page }) => {
    test.slow(); // RCSB fetch
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto();
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
    await viewer.goto();
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

  test('Skip button dismisses tour and sets flag', async ({ page }) => {
    test.slow();
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto();
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
    await viewer.goto();
    await page.getByRole('button', { name: 'Get Started' }).click({ force: true });
    await waitForMoleculeLoaded(page, 60000);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(page.locator('[data-onboarding="spotlight-tooltip"]')).not.toBeVisible();
  });

  test('returning user does not see onboarding', async ({ page }) => {
    // Set the flag before navigating
    await page.addInitScript(() => {
      localStorage.setItem('mol3d-onboarding-completed', 'true');
    });
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
    await viewer.goto();
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
