import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { viewports, molecules } from '../../fixtures';
import { waitForMoleculeLoaded } from '../../helpers/wait-for-render';

const MOBILE_PROJECTS = ['mobile-chrome', 'mobile-safari'];

test.describe('Mobile Onboarding', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !MOBILE_PROJECTS.includes(testInfo.project.name),
      'Mobile tests only run on mobile-chrome and mobile-safari'
    );
  });

  test('welcome screen visible on mobile', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto({ keepWelcome: true });

    await expect(page.locator('[data-onboarding="welcome-screen"]')).toBeVisible();
    await expect(page.locator('[class*="emptyState"]')).not.toBeVisible();
  });

  test('tour step 1 opens sidebar with FileUpload visible', async ({ page }) => {
    test.slow();
    await page.setViewportSize(viewports.mobile);
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto({ keepWelcome: true });

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
    await viewer.goto({ keepWelcome: true });

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

/**
 * "Get started" on a phone, at the device's own viewport (Pixel 5 is 393x851,
 * close to the iPhone 16 the bug was seen on). While the tour runs, a blocker
 * covers the page and only the tooltip's buttons respond, so a tour whose
 * tooltip or spotlight is off screen leaves the page unusable.
 */
test.describe('Mobile Onboarding: Get started', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      !MOBILE_PROJECTS.includes(testInfo.project.name),
      'Mobile tests only run on mobile-chrome and mobile-safari'
    );
    // The demo molecule from disk, so the test does not depend on RCSB.
    await page.route('**/files.rcsb.org/download/1CRN.cif', (route) =>
      route.fulfill({
        path: molecules.crambinCif,
        contentType: 'text/plain',
        headers: { 'access-control-allow-origin': '*' },
      })
    );
  });

  const TOOLTIP = '[data-onboarding="spotlight-tooltip"]';

  /** The targets of tour steps 1-4, as in src/components/onboarding/tourSteps.ts. */
  const STEP_TARGETS = [
    '[data-onboarding="file-upload"]',
    '[data-onboarding="repr-buttons"]',
    '[data-onboarding="measurement-buttons"]',
    // On phones the View group is in the "More" menu, and step 4 points at its button
    '[data-onboarding="more-menu"]',
  ];

  /** Where the tour's pieces are, in viewport pixels. */
  async function tourLayout(page: Page, targetSelector: string) {
    return page.evaluate((selector) => {
      const box = (el: Element | null) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      };
      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        tooltip: box(document.querySelector('[data-onboarding="spotlight-tooltip"]')),
        spotlight: box(document.querySelector('[class*="spotlightHole"]')),
        target: box(document.querySelector(selector)),
      };
    }, targetSelector);
  }

  type Layout = Awaited<ReturnType<typeof tourLayout>>;
  type Box = NonNullable<Layout['tooltip']>;

  const onScreen = (b: Box, l: Layout) => b.bottom > 0 && b.top < l.vh && b.right > 0 && b.left < l.vw;
  const fullyOnScreen = (b: Box, l: Layout) =>
    b.top >= 0 && b.bottom <= l.vh && b.left >= 0 && b.right <= l.vw;
  const overlaps = (a: Box, b: Box) =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  /** What is wrong with a running tour; none once it is over. */
  function tourProblems(l: Layout): string[] {
    if (!l.tooltip) return [];
    const problems: string[] = [];
    if (!fullyOnScreen(l.tooltip, l)) {
      problems.push(`tooltip not fully on screen (top ${Math.round(l.tooltip.top)}, bottom ${Math.round(l.tooltip.bottom)}, viewport ${l.vh})`);
    }
    if (!l.spotlight || !onScreen(l.spotlight, l)) {
      problems.push(`spotlight off screen (top ${l.spotlight ? Math.round(l.spotlight.top) : 'none'}, viewport ${l.vh})`);
    }
    return problems;
  }

  /**
   * Waits until the target is on screen and has stopped moving, and the
   * spotlight is drawn 8px around it. The spotlight trails the target by a
   * 0.3s transition, which headless WebKit can stretch to ~1s; and before the
   * sheet starts to slide, spotlight and target sit together off screen.
   */
  async function spotlightSettled(page: Page, targetSelector: string) {
    let previous: Box | null = null;
    await expect
      .poll(async () => {
        const l = await tourLayout(page, targetSelector);
        if (!l.spotlight || !l.target) return 'missing';
        const moved = !previous || previous.top !== l.target.top || previous.left !== l.target.left;
        previous = l.target;
        if (moved) return 'target moving';
        if (!onScreen(l.target, l)) return 'target off screen';
        const offset = Math.abs(l.spotlight.top - (l.target.top - 8)) + Math.abs(l.spotlight.left - (l.target.left - 8));
        return offset < 1 ? 'settled' : `spotlight ${Math.round(offset)}px from target`;
      }, { message: `spotlight on ${targetSelector}`, intervals: [100], timeout: 5000 })
      .toBe('settled');
  }

  async function getStarted(page: Page) {
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto({ keepWelcome: true });
    await page.getByRole('button', { name: 'Get started' }).click({ force: true });
    await expect(page.locator(TOOLTIP)).toBeVisible({ timeout: 15000 });
    // The sheet slides up for step 1, and the spotlight follows it.
    await spotlightSettled(page, STEP_TARGETS[0]);
  }

  /** Next, then wait for the spotlight to reach the step's target (after the toolbar scroll). */
  async function nextStep(page: Page, step: number) {
    await page.getByRole('button', { name: 'Next' }).click({ force: true });
    await expect(page.getByText(`${step} OF 4`)).toBeVisible();
    await spotlightSettled(page, STEP_TARGETS[step - 1]);
  }

  test('step 1 spotlights the sheet it opened', async ({ page }) => {
    await getStarted(page);

    const layout = await tourLayout(page, STEP_TARGETS[0]);
    await test.info().attach('step-1', { body: await page.screenshot(), contentType: 'image/png' });

    expect(layout.target, 'FileUpload panel').not.toBeNull();
    expect(layout.spotlight, 'spotlight').not.toBeNull();
    // The spotlight is drawn 8px around its target.
    expect(layout.spotlight!.top, 'spotlight top vs. FileUpload top').toBeCloseTo(layout.target!.top - 8, 0);
    expect(tourProblems(layout)).toEqual([]);
  });

  test('closing the sheet during step 1 ends the tour', async ({ page }) => {
    await getStarted(page);

    await page.getByRole('button', { name: 'Close menu' }).click({ force: true });
    await page.waitForTimeout(1000);

    const layout = await tourLayout(page, STEP_TARGETS[0]);
    await test.info().attach('after-close', { body: await page.screenshot(), contentType: 'image/png' });

    expect(tourProblems(layout)).toEqual([]);
    await expect(page.locator(TOOLTIP)).toHaveCount(0);
    const flag = await page.evaluate(() => localStorage.getItem('mol3d-onboarding-completed'));
    expect(flag).toBe('true');
  });

  test('steps 2-4 spotlight a target on screen', async ({ page }) => {
    await getStarted(page);

    for (let step = 2; step <= 4; step++) {
      await nextStep(page, step);

      const layout = await tourLayout(page, STEP_TARGETS[step - 1]);
      await test.info().attach(`step-${step}`, { body: await page.screenshot(), contentType: 'image/png' });

      expect(tourProblems(layout), `step ${step}`).toEqual([]);
      expect(layout.target, `step ${step} target`).not.toBeNull();
      expect(fullyOnScreen(layout.target!, layout), `step ${step} target fully on screen`).toBe(true);
      expect(overlaps(layout.spotlight!, layout.target!), `step ${step} spotlight on its target`).toBe(true);
    }
  });

  test('tapping the dimmed area ends the tour', async ({ page }) => {
    await getStarted(page);
    await nextStep(page, 2);

    // Halfway between the top of the screen and the tooltip, which sits above
    // the spotlit toolbar: dimmed, and outside both.
    const layout = await tourLayout(page, STEP_TARGETS[1]);
    const y = Math.min(layout.tooltip!.top, layout.spotlight!.top) / 2;
    await page.mouse.click(layout.vw / 2, y);
    await page.waitForTimeout(300);

    await expect(page.locator(TOOLTIP)).toHaveCount(0);
  });

  test('tapping inside the spotlight keeps the tour', async ({ page }) => {
    await getStarted(page);
    await nextStep(page, 2);

    const layout = await tourLayout(page, STEP_TARGETS[1]);
    const s = layout.spotlight!;
    await page.mouse.click((s.left + s.right) / 2, (s.top + s.bottom) / 2);
    await page.waitForTimeout(300);

    await expect(page.getByText('2 OF 4')).toBeVisible();
  });
});
