import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { viewports } from '../../fixtures';
import { waitForMoleculeLoaded } from '../../helpers/wait-for-render';

const MOBILE_PROJECTS = ['mobile-chrome', 'mobile-safari'];

test.describe('Mobile Onboarding', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      !MOBILE_PROJECTS.includes(testInfo.project.name),
      'Mobile tests only run on mobile-chrome and mobile-safari'
    );
  });

  test('welcome screen visible on mobile', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto();

    await expect(page.locator('[data-onboarding="welcome-screen"]')).toBeVisible();
    await expect(page.locator('[class*="emptyState"]')).not.toBeVisible();
  });

  test('tour step 1 opens sidebar with FileUpload visible', async ({ page }) => {
    test.slow();
    await page.setViewportSize(viewports.mobile);
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto();

    await page.getByRole('button', { name: 'Get started' }).click({ force: true });
    await waitForMoleculeLoaded(page, 60000);

    // Sidebar should open for step 1
    const isSidebarOpen = await viewer.isSidebarOpen();
    expect(isSidebarOpen).toBe(true);

    // Tooltip should be visible above the sidebar
    await expect(page.locator('[data-onboarding="spotlight-tooltip"]')).toBeVisible();
    await expect(page.getByText('Load Molecules')).toBeVisible();

    // FileUpload should be visible (not hidden behind overlay)
    await expect(page.locator('[data-onboarding="file-upload"]')).toBeVisible();
  });

  test('tour step 2 closes sidebar', async ({ page }) => {
    test.slow();
    await page.setViewportSize(viewports.mobile);
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto();

    await page.getByRole('button', { name: 'Get started' }).click({ force: true });
    await waitForMoleculeLoaded(page, 60000);

    // Advance to step 2
    await page.getByRole('button', { name: 'Next' }).click({ force: true });
    await page.waitForTimeout(500);

    // Sidebar should close
    const isSidebarOpen = await viewer.isSidebarOpen();
    expect(isSidebarOpen).toBe(false);

    // Step 2 tooltip visible
    await expect(page.getByText('Representations')).toBeVisible();
  });
});
