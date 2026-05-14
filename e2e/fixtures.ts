import { test as base } from '@playwright/test';

// Custom test fixture with one-time storage clearing
export const test = base.extend({
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
      // Skip the welcome screen by default. Onboarding tests that need the
      // first-visit state override this via their own addInitScript before goto().
      if (!localStorage.getItem('mol3d-onboarding-completed')) {
        localStorage.setItem('mol3d-onboarding-completed', 'true');
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
