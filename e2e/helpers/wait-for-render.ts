import { Page } from '@playwright/test';

/**
 * Wait for the WebGL scene to be fully initialized
 * Checks for the global refs set by MoleculeViewer's SceneController
 */
export async function waitForSceneReady(page: Page, timeout = 30000): Promise<void> {
  await page.waitForFunction(
    () => {
      const win = window as unknown as {
        __mol3d_ready?: boolean;
        __mol3d_gl?: unknown;
        __mol3d_scene?: unknown;
        __mol3d_camera?: unknown;
      };
      return win.__mol3d_ready === true && win.__mol3d_gl && win.__mol3d_scene && win.__mol3d_camera;
    },
    { timeout }
  );
}

/**
 * Wait for loading indicator to disappear (molecule loaded)
 */
export async function waitForMoleculeLoaded(page: Page, timeout = 30000): Promise<void> {
  // First wait for scene to be ready
  await waitForSceneReady(page, timeout);

  // Wait for any loading indicators to disappear
  const loadingIndicator = page.locator('[data-testid="loading-indicator"]');
  const hasLoadingIndicator = await loadingIndicator.isVisible().catch(() => false);

  if (hasLoadingIndicator) {
    await loadingIndicator.waitFor({ state: 'hidden', timeout });
  }

  // Wait for toolbar buttons to become enabled (indicates molecule store is populated)
  // Use Reset View button as a reliable indicator since it's always enabled when a molecule is loaded
  await page.waitForFunction(
    () => {
      const button = document.querySelector('button[title*="Reset View"]');
      return button && !button.hasAttribute('disabled');
    },
    { timeout: timeout }
  );

  // Additional small delay for Three.js to finish rendering
  await page.waitForTimeout(300);
}

/**
 * Wait for a specific element to stabilize (no layout changes)
 * Useful for waiting for animations to complete
 */
export async function waitForStableLayout(
  page: Page,
  selector: string,
  stabilityMs = 300
): Promise<void> {
  const element = page.locator(selector);
  let lastBounds = await element.boundingBox();
  let stableCount = 0;

  while (stableCount < 3) {
    await page.waitForTimeout(stabilityMs / 3);
    const currentBounds = await element.boundingBox();

    if (
      lastBounds &&
      currentBounds &&
      lastBounds.x === currentBounds.x &&
      lastBounds.y === currentBounds.y &&
      lastBounds.width === currentBounds.width &&
      lastBounds.height === currentBounds.height
    ) {
      stableCount++;
    } else {
      stableCount = 0;
      lastBounds = currentBounds;
    }
  }
}

/**
 * Wait for React to finish rendering (requestIdleCallback-based)
 */
export async function waitForReactIdle(page: Page, timeout = 5000): Promise<void> {
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => resolve(true), { timeout: 1000 });
        } else {
          setTimeout(() => resolve(true), 100);
        }
      }),
    { timeout }
  );
}

/**
 * Wait for molecule to load AND collapsible headers to render.
 * Use this in tests that need to interact with CollapsibleSection headers.
 *
 * After page.reload(), the Zustand store is reset (empty structureOrder),
 * so sidebar sections don't render until molecule is loaded again.
 */
export async function waitForMoleculeAndHeaders(page: Page, timeout = 30000): Promise<void> {
  await waitForMoleculeLoaded(page, timeout);

  // Wait for at least one CollapsibleSection header to render
  await page.waitForFunction(
    () => document.querySelectorAll('button[aria-expanded]').length > 0,
    { timeout: 5000 }
  );
}
