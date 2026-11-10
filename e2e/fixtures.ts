import { test as base } from '@playwright/test';

// Custom test fixture with one-time storage clearing
export const test = base.extend({
  // CI runs these tests against production (BASE_URL): keep them out of its
  // analytics, both Cloudflare Web Analytics and the product events, and out
  // of the error log (production builds report errors to /api/log). Answered
  // rather than aborted: an aborted request logs a console error, and some
  // tests fail on those.
  context: async ({ context }, use) => {
    await context.route(/cloudflareinsights\.com/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
    );
    await context.route('**/api/event', (route) => route.fulfill({ status: 204 }));
    await context.route('**/api/log', (route) => route.fulfill({ status: 204 }));
    await use(context);
  },

  // Override page fixture to clear storage once at start
  page: async ({ page }, use) => {
    // Add init script that clears storage ONCE using a sessionStorage flag
    // sessionStorage persists across reloads but is fresh per context (per test)
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('__mol3d_cleared')) {
        sessionStorage.setItem('__mol3d_cleared', 'true');
        localStorage.clear();
        // Don't sessionStorage.clear() - we need the flag to persist across reloads
        const req = indexedDB.deleteDatabase('mol3d-storage');
        req.onerror = () => {};
        req.onblocked = () => {};
      }
    });

    await use(page);
  },
});

export { expect } from '@playwright/test';

// Re-export test data from fixtures folder
export {
  molecules,
  rcsbIds,
  sampleMolecules,
  multiStructureScenarios,
  viewports,
} from './fixtures/index';
