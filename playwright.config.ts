import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for MolViewer E2E tests
 *
 * Key settings:
 * - WebGL browser flags for 3D rendering
 * - Auto-start dev server
 * - Visual regression with tolerance for WebGL variations
 */
export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [['html', { outputFolder: './playwright-report' }], ['list']],

  // Global test settings
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Default viewport
    viewport: { width: 1280, height: 720 },
  },

  // Visual regression settings for WebGL
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 150, // Allow minor WebGL variations
      threshold: 0.25, // 25% pixel difference tolerance
    },
    toMatchSnapshot: {
      maxDiffPixelRatio: 0.02, // Allow 2% pixel difference for snapshot comparisons
    },
  },

  // Start dev server before tests (disabled when testing external URL)
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },

  projects: [
    // ===== CORE TESTS - Chromium Only =====
    // Business logic, file I/O, data processing - browser-agnostic
    {
      name: 'chromium',
      testMatch: [
        '**/file-loading/**/*.spec.ts',
        '**/representations/**/*.spec.ts',
        '**/measurements/**/*.spec.ts',
        '**/context-menu/**/*.spec.ts',
        '**/labels/**/*.spec.ts',
        '**/keyboard/**/*.spec.ts',
        '**/multi-structure/**/*.spec.ts',
        '**/navigation/**/*.spec.ts',
        '**/ui/collapsible-persistence.spec.ts',
        '**/ui/component-settings.spec.ts',
        '**/edge-cases/error-handling.spec.ts',
        '**/undo-redo/**/*.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-gl=egl',
            '--enable-webgl',
            '--ignore-gpu-blocklist',
            '--disable-gpu-sandbox',
          ],
        },
      },
    },

    // ===== VISUAL TESTS - Cross-Browser =====
    // WebGL rendering, visual output, accessibility - browser-specific
    {
      name: 'chromium-visual',
      testMatch: [
        '**/ui/molecule-metadata.spec.ts',
        '**/ui/theme-toggle.spec.ts',
        '**/sequence-viewer/**/*.spec.ts',
        '**/edge-cases/large-molecules.spec.ts',
        '**/edge-cases/accessibility.spec.ts',
        '**/visual/**/*.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-gl=egl',
            '--enable-webgl',
            '--ignore-gpu-blocklist',
            '--disable-gpu-sandbox',
          ],
        },
      },
    },
    {
      name: 'webkit',
      testMatch: [
        '**/ui/molecule-metadata.spec.ts',
        '**/ui/theme-toggle.spec.ts',
        '**/sequence-viewer/**/*.spec.ts',
        '**/edge-cases/large-molecules.spec.ts',
        '**/edge-cases/accessibility.spec.ts',
        '**/visual/**/*.spec.ts',
      ],
      use: {
        ...devices['Desktop Safari'],
        // Longer action timeout for WebGL rendering
        actionTimeout: 30000,
      },
      // Higher tolerance for WebKit WebGL rendering differences
      expect: {
        toHaveScreenshot: {
          maxDiffPixels: 300, // Higher than global 150 for WebKit variations
          threshold: 0.3, // 30% vs global 25%
        },
        toMatchSnapshot: {
          maxDiffPixelRatio: 0.05, // 5% vs global 2% for WebKit variations
        },
      },
    },

    // ===== MOBILE TESTS =====
    {
      name: 'mobile-chrome',
      testMatch: '**/mobile/**/*.spec.ts',
      use: {
        ...devices['Pixel 5'],
        launchOptions: {
          args: [
            '--use-gl=egl',
            '--enable-webgl',
            '--ignore-gpu-blocklist',
            '--disable-gpu-sandbox',
          ],
        },
      },
    },
    {
      name: 'mobile-safari',
      testMatch: '**/mobile/**/*.spec.ts',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // Output directories
  outputDir: './test-results',
  snapshotDir: './e2e-snapshots',
});
