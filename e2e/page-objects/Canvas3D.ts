import { Page, Locator, expect } from '@playwright/test';
import { waitForSceneReady, waitForMoleculeLoaded } from '../helpers/wait-for-render';

/** One impostor atom on screen (Canvas3DPage.getImpostorAtomScreenPositions). */
export interface ImpostorAtomPosition {
  instance: number;
  x: number;
  y: number;
  /** Distance from the camera along the view axis, in Å */
  depth: number;
  /** In Å */
  radius: number;
  /** On screen, in CSS pixels */
  radiusPx: number;
}

/**
 * Page object for the 3D canvas/viewer area
 */
export class Canvas3DPage {
  readonly page: Page;
  readonly canvas: Locator;
  readonly loadingOverlay: Locator;
  readonly errorMessage: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.canvas = page.locator('canvas');
    this.loadingOverlay = page.locator('[class*="loadingOverlay"]');
    this.errorMessage = page.locator('[class*="errorMessage"]');
    this.emptyState = page.locator('[class*="emptyState"]');
  }

  /**
   * Alias for canvas property (for backward compatibility)
   */
  get element(): Locator {
    return this.canvas;
  }

  /**
   * Wait for the WebGL scene to be ready
   */
  async waitForSceneReady(timeout = 30000): Promise<void> {
    await waitForSceneReady(this.page, timeout);
  }

  /**
   * Wait for a molecule to be loaded
   */
  async waitForMoleculeLoaded(timeout = 30000): Promise<void> {
    await waitForMoleculeLoaded(this.page, timeout);
  }

  /**
   * Check if the canvas is visible
   */
  async isCanvasVisible(): Promise<boolean> {
    return this.canvas.isVisible();
  }

  /**
   * Check if loading overlay is visible
   */
  async isLoading(): Promise<boolean> {
    return this.loadingOverlay.isVisible();
  }

  /**
   * Check if error message is visible
   */
  async hasError(): Promise<boolean> {
    return this.errorMessage.isVisible();
  }

  /**
   * Get error message text
   */
  async getErrorText(): Promise<string> {
    return (await this.errorMessage.textContent()) ?? '';
  }

  /**
   * Check if empty state is visible
   */
  async isEmpty(): Promise<boolean> {
    return this.emptyState.isVisible();
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
    await this.canvas.click({ force: true });
  }

  /**
   * Click at an offset from the canvas center
   * Uses mouse.move/down/up to avoid Playwright stability checks that hang on WebGL canvas
   */
  async clickAtOffset(offsetX: number, offsetY: number): Promise<void> {
    const box = await this.getBoundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await this.page.mouse.move(centerX + offsetX, centerY + offsetY);
    await this.page.waitForTimeout(50);
    await this.page.mouse.down();
    await this.page.mouse.up();
  }

  /**
   * Right-click at the center of the canvas (for context menu)
   */
  async rightClickCenter(): Promise<void> {
    await this.canvas.click({ button: 'right', force: true });
  }

  /**
   * Right-click at an offset from the canvas center
   * Uses mouse.move/down/up to avoid Playwright stability checks that hang on WebGL canvas
   */
  async rightClickAtOffset(offsetX: number, offsetY: number): Promise<void> {
    const box = await this.getBoundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await this.page.mouse.move(centerX + offsetX, centerY + offsetY);
    await this.page.waitForTimeout(50);
    await this.page.mouse.down({ button: 'right' });
    await this.page.mouse.up({ button: 'right' });
  }

  /**
   * Get the screen position of an atom by traversing the Three.js scene
   * Uses existing __mol3d_scene and __mol3d_camera globals
   */
  async getAtomScreenPosition(atomIndex: number = 0): Promise<{ x: number; y: number } | null> {
    return this.page.evaluate((targetIndex) => {
      // Access the exposed Three.js globals
      const scene = (window as unknown as { __mol3d_scene?: unknown }).__mol3d_scene as {
        traverse: (callback: (object: unknown) => void) => void;
      } | undefined;
      const camera = (window as unknown as { __mol3d_camera?: unknown }).__mol3d_camera;
      const canvas = document.querySelector('canvas');

      if (!scene || !camera || !canvas) return null;

      // Find atom meshes - SelectableAtom uses SphereGeometry
      const atomMeshes: Array<{
        position: { clone: () => { x: number; y: number; z: number; project: (cam: unknown) => void } };
        getWorldPosition: (target: { x: number; y: number; z: number }) => void;
      }> = [];

      scene.traverse((object: unknown) => {
        const obj = object as {
          isMesh?: boolean;
          geometry?: { type?: string };
          position: { clone: () => { x: number; y: number; z: number; project: (cam: unknown) => void } };
          getWorldPosition: (target: { x: number; y: number; z: number }) => void;
        };
        if (obj.isMesh && obj.geometry?.type === 'SphereGeometry') {
          atomMeshes.push(obj);
        }
      });

      if (atomMeshes.length === 0 || targetIndex >= atomMeshes.length) return null;

      const mesh = atomMeshes[targetIndex];

      // Get world position of the mesh
      const worldPos = mesh.position.clone();
      mesh.getWorldPosition(worldPos);

      // Project to normalized device coordinates
      worldPos.project(camera);

      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + (worldPos.x + 1) / 2 * rect.width,
        y: rect.top + (-worldPos.y + 1) / 2 * rect.height,
      };
    }, atomIndex);
  }

  /**
   * Screen positions of the atoms drawn as impostors (Spacefill from 2000 atoms,
   * Ball & Stick from 5000): one instanced mesh of billboards, no sphere meshes,
   * so getAtomScreenPosition finds nothing there. `nearest` is the on-screen atom
   * closest to the camera, which nothing covers. Null when there are no
   * impostors on screen, with no fallback click.
   *
   * `mesh` picks the structure: impostor meshes come in structure order, and the
   * default is the last one. Per atom: `instance` (the atom index for a whole
   * structure), `depth` and `radius` in Å along the view axis, and `radiusPx`,
   * the sphere's radius on screen.
   */
  async getImpostorAtomScreenPositions(mesh?: number): Promise<{
    nearest: ImpostorAtomPosition;
    all: ImpostorAtomPosition[];
  } | null> {
    return this.page.evaluate((meshNumber) => {
      interface Vec { set(x: number, y: number, z: number): Vec; applyMatrix4(m: unknown): Vec; clone(): Vec; x: number; y: number; z: number }
      interface ImpostorMesh {
        isInstancedMesh?: boolean;
        userData?: { exportAs?: string };
        count: number;
        instanceMatrix: { array: ArrayLike<number> };
        geometry: { getAttribute(name: string): { array: ArrayLike<number> } | undefined };
        matrixWorld: unknown;
        position: { clone(): Vec };
      }
      interface Camera { matrixWorldInverse: unknown; projectionMatrix: unknown }
      const win = window as unknown as { __mol3d_scene?: { traverse(cb: (o: unknown) => void): void }; __mol3d_camera?: Camera };
      const canvas = document.querySelector('canvas');
      const camera = win.__mol3d_camera;
      if (!win.__mol3d_scene || !camera || !canvas) return null;

      const meshes: ImpostorMesh[] = [];
      win.__mol3d_scene.traverse((o) => {
        const m = o as ImpostorMesh;
        if (m.isInstancedMesh && m.userData?.exportAs === 'spheres') meshes.push(m);
      });
      const found = meshes[meshNumber ?? meshes.length - 1];
      if (!found || found.count === 0) return null;

      // No THREE global in the page: a Vector3 cloned from the mesh does the math
      const center = found.position.clone();
      const rect = canvas.getBoundingClientRect();
      const array = found.instanceMatrix.array;
      const radii = found.geometry.getAttribute('instanceRadius')?.array;
      const all: ImpostorAtomPosition[] = [];
      let nearest: ImpostorAtomPosition | null = null;
      for (let i = 0; i < found.count; i++) {
        // An instance's translation is elements 12-14 of its 4x4 matrix, in view space here
        center.set(array[i * 16 + 12], array[i * 16 + 13], array[i * 16 + 14])
          .applyMatrix4(found.matrixWorld)
          .applyMatrix4(camera.matrixWorldInverse);
        const radius = radii?.[i] ?? 0;
        // The centre moved by the radius sideways, projected: the radius on screen
        const edge = center.clone();
        edge.x += radius;
        const depth = -center.z;
        center.applyMatrix4(camera.projectionMatrix);
        edge.applyMatrix4(camera.projectionMatrix);
        const atom = {
          instance: i,
          x: rect.left + ((center.x + 1) / 2) * rect.width,
          y: rect.top + ((-center.y + 1) / 2) * rect.height,
          depth,
          radius,
          radiusPx: ((edge.x - center.x) / 2) * rect.width,
        };
        all.push(atom);
        // Framing can leave the closest corner off screen: only atoms well inside count
        const onScreen = Math.abs(center.x) < 0.8 && Math.abs(center.y) < 0.8;
        if (onScreen && (!nearest || depth < nearest.depth)) nearest = atom;
      }
      return nearest ? { nearest, all } : null;
    }, mesh);
  }

  /**
   * Hover on a specific atom by index.
   * @returns true if exact atom position found, false if used fallback (canvas center)
   */
  async hoverAtom(atomIndex: number = 0): Promise<boolean> {
    const pos = await this.getAtomScreenPosition(atomIndex);
    if (pos) {
      await this.page.mouse.move(pos.x, pos.y);
      await this.page.waitForTimeout(100);
      return true;
    }
    // Fallback: hover at canvas center (molecule renders there)
    // This works for representations that don't use SphereGeometry (Cartoon, Stick, Surface)
    await this.hoverCenter();
    await this.page.waitForTimeout(100);
    return false;
  }

  /**
   * Wait for atoms to be available in the scene (for Ball & Stick representation)
   * Retries up to maxAttempts times with delay between attempts
   */
  async waitForAtomsReady(maxAttempts: number = 10, delay: number = 200): Promise<boolean> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const pos = await this.getAtomScreenPosition(0);
      if (pos) return true;
      await this.page.waitForTimeout(delay);
    }
    return false;
  }

  /**
   * Click on a specific atom by index.
   * Uses native mouse events which R3F intercepts for raycasting.
   * Retries once if atom position not immediately available.
   * @returns true if click was performed, false if atom position not found
   */
  async clickAtom(atomIndex: number = 0): Promise<boolean> {
    // Retry logic for timing issues
    let pos = await this.getAtomScreenPosition(atomIndex);
    if (!pos) {
      // Wait a bit for scene to be ready
      await this.page.waitForTimeout(300);
      pos = await this.getAtomScreenPosition(atomIndex);
    }
    if (!pos) return false;

    // Move mouse to position first to ensure proper hover detection
    await this.page.mouse.move(pos.x, pos.y);
    await this.page.waitForTimeout(150); // Allow R3F to detect hover

    // Click - R3F will do raycasting and fire onClick on the mesh
    await this.page.mouse.down();
    await this.page.mouse.up();
    await this.page.waitForTimeout(100); // Allow state update
    return true;
  }

  /**
   * Right-click on an atom at the given index.
   * Uses mouse.down()/up() pattern to avoid WebGL stability check issues.
   * @returns true if atom was found and clicked, false if fell back to center
   */
  async rightClickOnAtom(atomIndex: number = 0): Promise<boolean> {
    const pos = await this.getAtomScreenPosition(atomIndex);
    if (pos) {
      await this.page.mouse.move(pos.x, pos.y);
      await this.page.waitForTimeout(50);
      await this.page.mouse.down({ button: 'right' });
      await this.page.mouse.up({ button: 'right' });
      return true;
    } else {
      // Fallback to center if position not found
      await this.canvas.click({ button: 'right', force: true });
      return false;
    }
  }

  /**
   * Rotate the molecule by dragging
   * Includes explicit waits to avoid WebGL stability check issues
   */
  async rotateMolecule(deltaX: number, deltaY: number): Promise<void> {
    const box = await this.getBoundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await this.page.mouse.move(centerX, centerY);
    await this.page.waitForTimeout(100); // Wait for stability
    await this.page.mouse.down();
    await this.page.waitForTimeout(50); // Wait after mousedown
    await this.page.mouse.move(centerX + deltaX, centerY + deltaY, { steps: 5 });
    await this.page.mouse.up();
  }

  /**
   * Zoom in/out using scroll wheel
   */
  async zoom(delta: number): Promise<void> {
    const box = await this.getBoundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await this.page.mouse.move(centerX, centerY);
    await this.page.mouse.wheel(0, delta);
  }

  /**
   * Simulate pinch-to-zoom gesture using touch events
   * @param scale - The zoom scale (>1 zooms in, <1 zooms out)
   * @param browserName - Optional browser name, use 'webkit' for Safari fallback to wheel zoom
   */
  async pinchZoom(scale: number, browserName?: string): Promise<void> {
    // Safari doesn't allow programmatic TouchEvent construction
    // Use wheel zoom as fallback
    if (browserName === 'webkit') {
      const delta = scale > 1 ? -100 : 100; // zoom in = negative delta
      await this.zoom(delta);
      return;
    }

    const box = await this.getBoundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await this.page.evaluate(
      ({ x, y, scale }) => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return;

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
   * Take a screenshot of just the canvas
   */
  async screenshot(name?: string): Promise<Buffer> {
    await this.waitForSceneReady();
    await this.page.waitForTimeout(200);
    // Use page.screenshot with clip to bypass Playwright's element stability check
    // which hangs on WebGL canvas due to continuous 60fps repainting
    const box = await this.getBoundingBox();
    return this.page.screenshot({
      clip: { x: box.x, y: box.y, width: box.width, height: box.height },
      path: name ? `${name}.png` : undefined,
    });
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
    await this.canvas.dblclick({ force: true });
  }

  /**
   * Assert canvas has a molecule rendered (via WebGL globals)
   */
  async expectMoleculeRendered(): Promise<void> {
    await this.waitForSceneReady();
    const hasContent = await this.page.evaluate(() => {
      const scene = (window as unknown as { __mol3d_scene?: { children: unknown[] } }).__mol3d_scene;
      return scene && scene.children.length > 0;
    });
    expect(hasContent).toBe(true);
  }

  /**
   * Assert no error is displayed
   */
  async expectNoError(): Promise<void> {
    const hasError = await this.hasError();
    expect(hasError).toBe(false);
  }
}
