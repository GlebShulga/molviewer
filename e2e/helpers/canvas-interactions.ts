import { Page, Locator } from '@playwright/test';
import { waitForSceneReady } from './wait-for-render';

/**
 * Helper class for interacting with the 3D canvas
 * Since atoms are rendered in WebGL (not DOM elements), we use offset-based clicking
 */
export class Canvas3D {
  private canvas: Locator;

  constructor(private page: Page) {
    this.canvas = page.locator('canvas');
  }

  /**
   * Get the canvas element locator
   */
  get element(): Locator {
    return this.canvas;
  }

  /**
   * Get the bounding box of the canvas
   */
  async getBoundingBox() {
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Canvas not found or not visible');
    return box;
  }

  /**
   * Click at the center of the canvas
   */
  async clickCenter(): Promise<void> {
    await this.canvas.click();
  }

  /**
   * Click at an offset from the canvas center
   * @param offsetX - horizontal offset in pixels (positive = right)
   * @param offsetY - vertical offset in pixels (positive = down)
   */
  async clickAtOffset(offsetX: number, offsetY: number): Promise<void> {
    const box = await this.getBoundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await this.page.mouse.click(centerX + offsetX, centerY + offsetY);
  }

  /**
   * Right-click at the center of the canvas (for context menu)
   */
  async rightClickCenter(): Promise<void> {
    await this.canvas.click({ button: 'right' });
  }

  /**
   * Right-click at an offset from the canvas center
   */
  async rightClickAtOffset(offsetX: number, offsetY: number): Promise<void> {
    const box = await this.getBoundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await this.page.mouse.click(centerX + offsetX, centerY + offsetY, { button: 'right' });
  }

  /**
   * Rotate the molecule by dragging
   * @param deltaX - horizontal movement (positive = rotate right)
   * @param deltaY - vertical movement (positive = rotate down)
   */
  async rotateMolecule(deltaX: number, deltaY: number): Promise<void> {
    const box = await this.getBoundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await this.page.mouse.move(centerX, centerY);
    await this.page.mouse.down();
    await this.page.mouse.move(centerX + deltaX, centerY + deltaY, { steps: 10 });
    await this.page.mouse.up();
  }

  /**
   * Zoom in/out using scroll wheel
   * @param delta - negative values zoom in, positive zoom out
   */
  async zoom(delta: number): Promise<void> {
    const box = await this.getBoundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await this.page.mouse.move(centerX, centerY);
    await this.page.mouse.wheel(0, delta);
  }

  /**
   * Take a screenshot of just the canvas
   * @param name - screenshot filename (without extension)
   */
  async screenshot(name?: string): Promise<Buffer> {
    await waitForSceneReady(this.page);
    // Small delay to ensure render completes
    await this.page.waitForTimeout(200);
    return this.canvas.screenshot({ path: name ? `${name}.png` : undefined });
  }

  /**
   * Simulate pinch-to-zoom (for touch testing)
   */
  async pinchZoom(scale: number): Promise<void> {
    const box = await this.getBoundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    // Simulate pinch with two touch points
    // This is a simplified version - actual implementation depends on browser support
    await this.page.evaluate(
      ({ x, y, scale }) => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return;

        // Dispatch touch events for pinch zoom
        const touchStart = new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches: [
            new Touch({ identifier: 0, target: canvas, clientX: x - 50, clientY: y }),
            new Touch({ identifier: 1, target: canvas, clientX: x + 50, clientY: y }),
          ],
        });

        const spread = 50 * scale;
        const touchMove = new TouchEvent('touchmove', {
          bubbles: true,
          cancelable: true,
          touches: [
            new Touch({ identifier: 0, target: canvas, clientX: x - spread, clientY: y }),
            new Touch({ identifier: 1, target: canvas, clientX: x + spread, clientY: y }),
          ],
        });

        const touchEnd = new TouchEvent('touchend', {
          bubbles: true,
          cancelable: true,
          touches: [],
        });

        canvas.dispatchEvent(touchStart);
        canvas.dispatchEvent(touchMove);
        canvas.dispatchEvent(touchEnd);
      },
      { x: centerX, y: centerY, scale }
    );
  }

  /**
   * Hover at the center of the canvas
   */
  async hoverCenter(): Promise<void> {
    const box = await this.getBoundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await this.page.mouse.move(centerX, centerY);
  }

  /**
   * Hover at an offset from canvas center
   */
  async hoverAtOffset(offsetX: number, offsetY: number): Promise<void> {
    const box = await this.getBoundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await this.page.mouse.move(centerX + offsetX, centerY + offsetY);
  }

  /**
   * Double-click at the center
   */
  async doubleClickCenter(): Promise<void> {
    await this.canvas.dblclick();
  }
}
