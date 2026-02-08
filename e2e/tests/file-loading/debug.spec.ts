import { test } from '@playwright/test';

test('[DB-01] debug: capture console errors on load', async ({ page }) => {
  // Capture all console messages
  const consoleMessages: string[] = [];
  const errors: string[] = [];

  page.on('console', msg => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  page.on('pageerror', error => {
    errors.push(`PageError: ${error.message}`);
  });

  // Navigate to page
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Click caffeine button
  const caffeineButton = page.getByRole('button', { name: 'Caffeine' });
  await caffeineButton.waitFor({ state: 'attached', timeout: 5000 });
  await caffeineButton.evaluate((el) => (el as HTMLElement).click());

  // Wait a bit for any errors
  await page.waitForTimeout(5000);

  // Print all console messages
  console.log('\n=== Console Messages ===');
  for (const msg of consoleMessages) {
    console.log(msg);
  }

  console.log('\n=== Errors ===');
  for (const err of errors) {
    console.log(err);
  }

  // Check if canvas exists
  const canvas = page.locator('canvas');
  const hasCanvas = await canvas.isVisible().catch(() => false);
  console.log(`\nCanvas visible: ${hasCanvas}`);

  // Check for error messages in the UI
  const errorMessage = page.locator('[class*="errorMessage"]');
  const hasError = await errorMessage.isVisible().catch(() => false);
  console.log(`Error message visible: ${hasError}`);
  if (hasError) {
    const errorText = await errorMessage.textContent();
    console.log(`Error text: ${errorText}`);
  }

  // Check for loading indicator
  const loading = page.locator('[class*="loadingOverlay"]');
  const isLoading = await loading.isVisible().catch(() => false);
  console.log(`Loading visible: ${isLoading}`);

  // Take a screenshot
  await page.screenshot({ path: 'debug-screenshot.png' });
});
