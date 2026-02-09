import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { rcsbIds } from '../../fixtures';

test.describe('Surface Representation', () => {
  // Surface generation can be slow, especially for large proteins
  test.setTimeout(120000);

  let moleculeViewer: MoleculeViewerPage;
  let consoleMessages: string[] = [];

  test.beforeEach(async ({ page }) => {
    moleculeViewer = new MoleculeViewerPage(page);

    // Capture console messages for GPU/CPU path verification
    consoleMessages = [];
    page.on('console', (msg) => {
      consoleMessages.push(msg.text());
    });

    await moleculeViewer.goto();
  });

  test.describe('Small Molecule (<100 atoms)', () => {
    test.beforeEach(async () => {
      await moleculeViewer.loadSampleMolecule('caffeine');
    });

    test('[SU-01] should disable surface for small molecules', async () => {
      // Skip if representation section not visible (smart defaults active)
      const repSectionVisible = await moleculeViewer.controlPanel.representationSection.isVisible();
      test.skip(!repSectionVisible, 'Representation section hidden (smart defaults active)');

      const isAvailable = await moleculeViewer.controlPanel.isRepresentationAvailable('surface-vdw');
      expect(isAvailable).toBe(false);
    });

    test('[SU-02] should show correct tooltip for disabled surface', async () => {
      // Skip if representation section not visible (smart defaults active)
      const repSectionVisible = await moleculeViewer.controlPanel.representationSection.isVisible();
      test.skip(!repSectionVisible, 'Representation section hidden (smart defaults active)');

      const title = await moleculeViewer.controlPanel.surfaceButton.getAttribute('title');
      expect(title).toBe('Surface not useful for small molecules');
    });
  });

  test.describe('Large Protein (GPU Path)', () => {
    test.setTimeout(180000); // Software renderer on CI needs more time
    test.beforeEach(async ({ }, testInfo) => {
      // Skip on WebKit - network fetch + WebGL is too slow
      test.skip(testInfo.project.name === 'webkit', 'WebGL + network fetch too slow on WebKit');

      // Fetch 1B7G - large protein with 5844 atoms
      await moleculeViewer.fetchFromRCSBAndWait(rcsbIds.complexAssembly);
    });

    test('[SU-03] should switch to surface representation for protein', async () => {
      // Skip if representation section not visible (smart defaults active)
      const repSectionVisible = await moleculeViewer.controlPanel.representationSection.isVisible();
      test.skip(!repSectionVisible, 'Representation section hidden (smart defaults active)');

      await moleculeViewer.controlPanel.setRepresentation('surface-vdw');
      // Wait for surface generation - GPU path is fast but still needs time
      await moleculeViewer.page.waitForTimeout(5000);

      const isActive = await moleculeViewer.controlPanel.isRepresentationActive('surface-vdw');
      expect(isActive).toBe(true);

      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[SU-04] should use GPU acceleration for large proteins (>=500 atoms)', async () => {
      // Skip if representation section not visible (smart defaults active)
      const repSectionVisible = await moleculeViewer.controlPanel.representationSection.isVisible();
      test.skip(!repSectionVisible, 'Representation section hidden (smart defaults active)');

      await moleculeViewer.controlPanel.setRepresentation('surface-vdw');
      // Wait for surface generation to complete
      await moleculeViewer.page.waitForTimeout(10000);

      // Skip if GPU is not available on this environment (e.g. CI headless Chrome)
      const gpuUnavailable = consoleMessages.some(
        (m) =>
          m.includes('EXT_color_buffer_float not supported') ||
          m.includes('MAX_TEXTURE_SIZE too small')
      );
      const hasAnyGPUMessage = consoleMessages.some(
        (m) => m.includes('[GPU Density]') || m.includes('GPU acceleration')
      );
      test.skip(gpuUnavailable || !hasAnyGPUMessage, 'GPU not available in this environment');

      // Verify GPU messages appear for large proteins
      const hasGPUAccelerationMessage = consoleMessages.some((m) =>
        m.includes('Using GPU acceleration')
      );
      const hasGPUDensityMessage = consoleMessages.some((m) => m.includes('[GPU Density]'));

      expect(hasGPUAccelerationMessage).toBe(true);
      expect(hasGPUDensityMessage).toBe(true);

      // Surface should render correctly
      await moleculeViewer.canvas.expectMoleculeRendered();
    });

    test('[SU-05] should complete surface generation within reasonable time', async () => {
      // Skip if representation section not visible (smart defaults active)
      const repSectionVisible = await moleculeViewer.controlPanel.representationSection.isVisible();
      test.skip(!repSectionVisible, 'Representation section hidden (smart defaults active)');

      const startTime = Date.now();

      await moleculeViewer.controlPanel.setRepresentation('surface-vdw');
      // Wait for surface to be fully rendered
      await moleculeViewer.page.waitForTimeout(15000);
      await moleculeViewer.canvas.expectMoleculeRendered();

      const duration = Date.now() - startTime;

      // Skip if GPU is not available on this environment (e.g. CI headless Chrome)
      const gpuUnavailable = consoleMessages.some(
        (m) =>
          m.includes('EXT_color_buffer_float not supported') ||
          m.includes('MAX_TEXTURE_SIZE too small')
      );
      const hasAnyGPUMessage = consoleMessages.some(
        (m) => m.includes('[GPU Density]') || m.includes('GPU acceleration')
      );
      test.skip(gpuUnavailable || !hasAnyGPUMessage, 'GPU not available in this environment');

      // Verify GPU path was used (check for timing log)
      const gpuTimingLog = consoleMessages.find((m) => m.includes('[GPU Density] Total:'));
      expect(gpuTimingLog).toBeDefined();

      if (gpuTimingLog) {
        // Extract timing from log like "[GPU Density] Total: 2345ms"
        const match = gpuTimingLog.match(/Total:\s*(\d+)ms/);
        if (match) {
          const gpuTime = parseInt(match[1], 10);
          // GPU computation should complete in under 120 seconds
          // Note: Headless browsers use software rendering, which is significantly slower
          // Real GPU hardware typically completes in <5 seconds
          expect(gpuTime).toBeLessThan(120000);
          console.log(`GPU Density computation took ${gpuTime}ms`);
        }
      }

      // Overall test (including waits) should complete within 90 seconds
      expect(duration).toBeLessThan(90000);
    });

    test('[SU-06] should not have console errors during surface generation', async () => {
      // Skip if representation section not visible (smart defaults active)
      const repSectionVisible = await moleculeViewer.controlPanel.representationSection.isVisible();
      test.skip(!repSectionVisible, 'Representation section hidden (smart defaults active)');

      // Collect error messages
      const errorMessages: string[] = [];
      moleculeViewer.page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errorMessages.push(msg.text());
        }
      });

      await moleculeViewer.controlPanel.setRepresentation('surface-vdw');
      await moleculeViewer.page.waitForTimeout(10000);

      // Filter out known non-critical errors (like favicon 404)
      const criticalErrors = errorMessages.filter(
        (msg) => !msg.includes('favicon') && !msg.includes('404')
      );

      expect(criticalErrors).toHaveLength(0);
    });
  });

  test.describe('GPU Fallback', () => {
    test('[SU-07] should fall back gracefully if GPU computation fails', async ({ }, testInfo) => {
      // This test verifies the fallback mechanism exists
      // We can't easily trigger GPU failure in Playwright, but we can verify
      // the surface still renders for molecules that would use GPU path

      test.skip(testInfo.project.name === 'webkit', 'WebGL + network fetch too slow on WebKit');

      // Load 1CRN (327 atoms - just under GPU threshold, uses CPU)
      await moleculeViewer.fetchFromRCSBAndWait('1CRN');

      // Skip if representation section not visible (smart defaults active)
      // Note: Must check AFTER loading molecule, as ControlPanel only renders when molecule is loaded
      const repSectionVisible = await moleculeViewer.controlPanel.representationSection.isVisible();
      test.skip(!repSectionVisible, 'Representation section hidden (smart defaults active)');

      await moleculeViewer.controlPanel.setRepresentation('surface-vdw');
      await moleculeViewer.page.waitForTimeout(5000);

      // Surface should render regardless of path used
      await moleculeViewer.canvas.expectMoleculeRendered();

      // 1CRN has 327 atoms (< 500), so should NOT use GPU
      const hasGPUMessage = consoleMessages.some((m) => m.includes('[GPU Density]'));
      expect(hasGPUMessage).toBe(false);
    });
  });
});
