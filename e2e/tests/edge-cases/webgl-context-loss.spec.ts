import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';

/**
 * A browser can take the WebGL context away from a tab (usually a background
 * one) and give it back later. The viewer has to keep its canvas through the
 * loss, or there is nothing to restore.
 */

type LoseContextWindow = Window & { __loseContext?: WEBGL_lose_context | null };

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
    const banner = moleculeViewer.canvas.errorMessage;
    await expect(canvas).toHaveCount(1);

    // The extension object is kept: it can't be fetched from a lost context.
    const lost = await page.evaluate(() => {
      const el = document.querySelector('canvas') as HTMLCanvasElement;
      const gl = (el.getContext('webgl2') ?? el.getContext('webgl')) as WebGLRenderingContext | null;
      const ext = gl?.getExtension('WEBGL_lose_context') ?? null;
      (window as LoseContextWindow).__loseContext = ext;
      ext?.loseContext();
      return ext !== null;
    });
    expect(lost).toBe(true);

    // The banner's own render is the one that used to crash the viewer.
    await expect(banner).toContainText('WebGL context lost');
    await page.waitForTimeout(1000);
    await expect(canvas).toHaveCount(1);
    await expect(viewerError).toHaveCount(0);

    await page.evaluate(() => (window as LoseContextWindow).__loseContext?.restoreContext());

    await expect(banner).toHaveCount(0);
    await expect(canvas).toHaveCount(1);
    await expect(viewerError).toHaveCount(0);
    expect(await page.evaluate(() => {
      const el = document.querySelector('canvas') as HTMLCanvasElement;
      return (el.getContext('webgl2') ?? el.getContext('webgl'))?.isContextLost();
    })).toBe(false);

    // Rotating redraws through a composer built on the restored context.
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas has no bounding box');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy + 40, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    await expect(canvas).toHaveCount(1);
    await expect(viewerError).toHaveCount(0);
    expect(pageErrors).toEqual([]);

    // The molecule is on screen again: a blank canvas would be one colour.
    const colours = await page.evaluate(() => {
      const el = document.querySelector('canvas') as HTMLCanvasElement;
      const copy = document.createElement('canvas');
      copy.width = 64;
      copy.height = 64;
      const ctx = copy.getContext('2d')!;
      ctx.drawImage(el, 0, 0, 64, 64);
      const data = ctx.getImageData(0, 0, 64, 64).data;
      const seen = new Set<number>();
      for (let i = 0; i < data.length; i += 4) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      return seen.size;
    });
    expect(colours).toBeGreaterThan(10);
  });
});
