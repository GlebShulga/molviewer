import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';

/**
 * A browser can take the WebGL context away from a tab (usually a background
 * one) and give it back later. The viewer has to keep its canvas through the
 * loss, or there is nothing to restore. If the context doesn't come back, the
 * viewer offers "Reload viewer", which builds a new canvas.
 */

type LoseContextWindow = Window & { __loseContext?: WEBGL_lose_context | null };
/** The app's renderer (set in onCreated). Read through it, a helper never creates a context. */
type RendererWindow = Window & {
  __mol3d_gl?: { domElement: HTMLCanvasElement; getContext(): WebGLRenderingContext };
};
type CameraWindow = Window & { __mol3d_camera?: { position: { x: number; y: number; z: number }; zoom: number } };
type StoreWindow = Window & {
  __mol3d_store: { getState(): { setPendingCameraSnapshot(snapshot: CameraView): void } };
};
interface CameraView {
  position: [number, number, number];
  target: [number, number, number];
  zoom: number;
}

/** Takes the context away. The extension object is kept: it can't be fetched from a lost context. */
async function loseContext(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const gl = (window as RendererWindow).__mol3d_gl?.getContext();
    const ext = gl?.getExtension('WEBGL_lose_context') ?? null;
    (window as LoseContextWindow).__loseContext = ext;
    ext?.loseContext();
    return ext !== null;
  });
}

/** Undefined until the canvas on screen has its renderer, which a new canvas gets only after a moment. */
async function isContextLost(page: Page): Promise<boolean | undefined> {
  return page.evaluate(() => {
    const renderer = (window as RendererWindow).__mol3d_gl;
    if (!renderer || renderer.domElement !== document.querySelector('canvas')) return undefined;
    return renderer.getContext().isContextLost();
  });
}

/** The canvas scaled to 64x64, as RGBA bytes. */
async function canvasPixels(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const el = document.querySelector('canvas') as HTMLCanvasElement;
    const copy = document.createElement('canvas');
    copy.width = 64;
    copy.height = 64;
    const ctx = copy.getContext('2d')!;
    ctx.drawImage(el, 0, 0, 64, 64);
    return Array.from(ctx.getImageData(0, 0, 64, 64).data);
  });
}

/** A blank canvas is one colour. */
function colourCount(pixels: number[]): number {
  const seen = new Set<number>();
  for (let i = 0; i < pixels.length; i += 4) seen.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
  return seen.size;
}

/** Mean difference per colour channel, 0 to 255. */
function meanDifference(a: number[], b: number[]): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    n += 3;
  }
  return sum / n;
}

/** Camera position and zoom: x, y, z, zoom. */
async function cameraNow(page: Page): Promise<number[] | null> {
  return page.evaluate(() => {
    const camera = (window as CameraWindow).__mol3d_camera;
    return camera ? [camera.position.x, camera.position.y, camera.position.z, camera.zoom] : null;
  });
}

/** The largest difference between the camera now and the expected x, y, z, zoom. */
async function cameraOffBy(page: Page, expected: number[]): Promise<number> {
  const now = await cameraNow(page);
  if (!now) return Infinity;
  return Math.max(...expected.map((value, i) => Math.abs(value - now[i])));
}

/**
 * The overlay shown while the context is lost. By class, not by role: it is
 * hidden for its first 2 s, and role locators skip hidden elements.
 */
const overlayOf = (page: Page) => page.locator('[class*="contextLost"]');

/** Drags across the canvas to rotate. */
async function rotate(page: Page): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 40, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

test.describe('WebGL context loss', () => {
  test('[EH-WGL-01] the viewer survives a context loss and draws again after restore', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
    // Caffeine is small enough to be drawn through the effect composer, the
    // part that used to throw on a lost context.
    await moleculeViewer.loadSampleMolecule('caffeine');

    const canvas = page.locator('canvas');
    const viewerError = page.getByRole('heading', { name: 'Viewer error' });
    const overlay = overlayOf(page);
    const reloadButton = page.getByRole('button', { name: 'Reload viewer' });
    await expect(canvas).toHaveCount(1);

    expect(await loseContext(page)).toBe(true);

    // The overlay is there but stays hidden for its first 2 s, so a loss that
    // is restored at once shows nothing.
    await expect(overlay).toHaveCount(1);
    await expect(reloadButton).toBeHidden({ timeout: 1 });

    // A render during the loss is what used to crash the viewer.
    await page.waitForTimeout(1000);
    await expect(canvas).toHaveCount(1);
    await expect(viewerError).toHaveCount(0);

    // Export during the loss says so instead of saving a blank image. The
    // toolbar sits above the overlay, so the button is reachable.
    await page.locator('button[aria-label="Export"]').click({ force: true });
    await page.waitForTimeout(300);
    await expect(moleculeViewer.canvas.errorMessage).toContainText('not available right now');

    await page.evaluate(() => (window as LoseContextWindow).__loseContext?.restoreContext());

    await expect(overlay).toHaveCount(0);
    await expect(canvas).toHaveCount(1);
    await expect(viewerError).toHaveCount(0);
    await expect.poll(() => isContextLost(page)).toBe(false);

    // Rotating redraws through a composer built on the restored context.
    await rotate(page);

    await expect(canvas).toHaveCount(1);
    await expect(viewerError).toHaveCount(0);
    expect(pageErrors).toEqual([]);

    // The molecule is on screen again.
    expect(colourCount(await canvasPixels(page))).toBeGreaterThan(10);
  });

  test('[EH-WGL-02] Reload viewer brings the scene and the camera back when the context is not restored', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
    await moleculeViewer.loadSampleMolecule('caffeine');

    const canvas = page.locator('canvas');
    const viewerError = page.getByRole('heading', { name: 'Viewer error' });
    const overlay = overlayOf(page);
    const reloadButton = page.getByRole('button', { name: 'Reload viewer' });

    // A view that is not the default one, so a reset camera would show. Set
    // through the store, the way a saved session is: a drag would leave the
    // camera drifting on the controls' damping.
    const view: CameraView = { position: [7, 5, 9], target: [0.5, 0.25, 0], zoom: 1.3 };
    const expected = [...view.position, view.zoom];
    await page.evaluate((v) => (window as unknown as StoreWindow).__mol3d_store.getState().setPendingCameraSnapshot(v), view);
    await expect.poll(() => cameraOffBy(page, expected)).toBeLessThan(0.001);
    await page.waitForTimeout(500);
    const before = await canvasPixels(page);
    expect(colourCount(before)).toBeGreaterThan(10);

    expect(await loseContext(page)).toBe(true);

    // Shown 2 s after the loss; the rest of the allowance is for a busy machine.
    await expect(reloadButton).toBeVisible({ timeout: 15_000 });
    await reloadButton.click({ force: true });

    // Also the wait for the new canvas's renderer, before any pixel check.
    await expect.poll(() => isContextLost(page)).toBe(false);
    await expect(overlay).toHaveCount(0);
    await expect(canvas).toHaveCount(1);
    await expect(viewerError).toHaveCount(0);

    // The new canvas needs a moment for its first frame.
    await expect.poll(async () => colourCount(await canvasPixels(page))).toBeGreaterThan(10);

    // The camera is where it was, and so is the picture.
    await expect.poll(() => cameraOffBy(page, expected)).toBeLessThan(0.001);
    await expect.poll(async () => meanDifference(before, await canvasPixels(page))).toBeLessThan(4);

    expect(pageErrors).toEqual([]);
  });

  test('[EH-WGL-03] 3D labels go under the context-lost overlay', async ({ page }) => {
    const moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
    await moleculeViewer.loadSampleMolecule('caffeine');

    expect(await moleculeViewer.openContextMenu()).toBe(true);
    await moleculeViewer.contextMenu.getByRole('button', { name: /label/i }).click({ force: true });
    await page.waitForTimeout(300);

    // Labels are DOM elements over the canvas with a z-index of their own.
    const deleteLabel = page.locator('button[title="Remove label"]').first();
    await expect(deleteLabel).toHaveCount(1);
    const box = await deleteLabel.boundingBox();
    if (!box) throw new Error('label has no bounding box');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    expect(await loseContext(page)).toBe(true);
    await expect(page.getByRole('button', { name: 'Reload viewer' })).toBeVisible({ timeout: 15_000 });

    const coveredByOverlay = await page.evaluate(
      ([px, py]) =>
        document.elementFromPoint(px, py)?.closest('[role="status"]')?.textContent?.includes('paused 3D graphics') ?? false,
      [x, y]
    );
    expect(coveredByOverlay).toBe(true);
  });

  test('[EH-WGL-04] a reload that gets no WebGL context says so, once', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const moleculeViewer = new MoleculeViewerPage(page);
    await moleculeViewer.goto();
    await moleculeViewer.loadSampleMolecule('caffeine');

    const overlay = overlayOf(page);
    const reloadButton = page.getByRole('button', { name: 'Reload viewer' });

    expect(await loseContext(page)).toBe(true);

    // The browser refuses every new WebGL context from now on, as it does when
    // it has blocked 3D graphics for the page.
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      const blocked = new Set(['webgl2', 'webgl', 'experimental-webgl']);
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (blocked.has(type)) return null;
        return (original as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });

    await expect(reloadButton).toBeVisible({ timeout: 15_000 });
    // A remounted overlay would lose this mark and be hidden again for 2 s.
    await overlay.evaluate((el: HTMLElement) => { el.dataset.mark = '1'; });
    await reloadButton.click({ force: true });

    await expect(page.getByText('3D graphics are not available')).toBeVisible();
    await expect(overlay).toHaveAttribute('data-mark', '1');
    // A refused context has no 2 s delay: the same class shows the text at
    // once when the first context of a page is refused.
    await expect(overlay).toHaveCSS('animation-name', 'none');
    await expect(reloadButton).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Viewer error' })).toHaveCount(0);

    // A render of the whole viewer: a Canvas still mounted would try again.
    await page.getByRole('button', { name: /Switch to (light|dark) mode/ }).click({ force: true });
    await page.waitForTimeout(500);

    // The rethrown creation error is an unhandled rejection by design; a
    // second one means R3F tried again.
    expect(pageErrors).toHaveLength(1);
    expect(pageErrors[0]).toContain('Error creating WebGL context');

    // Model export names the real problem: the old Canvas's emptied scene is
    // no longer what it reads. Not by role="status": the overlay has it too.
    await moleculeViewer.openExportPanel();
    await moleculeViewer.exportPanel.getByRole('button', { name: 'Export GLB' }).click({ force: true });
    await expect(moleculeViewer.exportPanel.locator('[class*="exportStatus"]')).toContainText(
      'Viewer is not ready for model export'
    );
  });
});
