import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GPUPickingManager } from '../gpuPicking';

/** A renderer that "draws" one pixel color into every read, and counts renders. */
function fakeRenderer(pixel: [number, number, number, number]) {
  const renderer = {
    renders: 0,
    getSize: (target: THREE.Vector2) => target.set(800, 600),
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    getClearColor: (target: THREE.Color) => target,
    getClearAlpha: () => 1,
    setClearColor: () => {},
    clear: () => {},
    render: () => { renderer.renders++; },
    readRenderTargetPixels: (_t: unknown, _x: number, _y: number, _w: number, _h: number, buffer: Uint8Array) => {
      buffer.set(pixel);
    },
  };
  return renderer;
}

function picker(renderer: ReturnType<typeof fakeRenderer>) {
  return new GPUPickingManager(renderer as unknown as THREE.WebGLRenderer, new THREE.PerspectiveCamera());
}

describe('GPUPickingManager.pickNdc', () => {
  it('decodes the shader\'s index + 1, so atom 0 (drawn as 1) is pickable', () => {
    expect(picker(fakeRenderer([1, 0, 0, 255])).pickNdc(0, 0, new THREE.Scene())).toBe(0);
    expect(picker(fakeRenderer([0, 1, 0, 255])).pickNdc(0, 0, new THREE.Scene())).toBe(255);
  });

  it('finds no atom on the cleared background', () => {
    expect(picker(fakeRenderer([0, 0, 0, 0])).pickNdc(0, 0, new THREE.Scene())).toBeNull();
  });

  it('returns the last result without rendering within the throttle and 2 px', () => {
    const renderer = fakeRenderer([5, 0, 0, 255]);
    const manager = picker(renderer);
    const scene = new THREE.Scene();
    expect(manager.pickNdc(0, 0, scene)).toBe(4);
    // 1 CSS pixel on an 800 px wide canvas is 2 / 800 in NDC
    expect(manager.pickNdc(2 / 800, 0, scene)).toBe(4);
    expect(renderer.renders).toBe(1);
    // 3 px away: a new pick
    manager.pickNdc(6 / 800, 0, scene);
    expect(renderer.renders).toBe(2);
  });

  it('renders just the pixel under the point and restores the camera', () => {
    const renderer = fakeRenderer([5, 0, 0, 255]);
    const camera = new THREE.PerspectiveCamera();
    const projection = camera.projectionMatrix.clone();
    new GPUPickingManager(renderer as unknown as THREE.WebGLRenderer, camera).pickNdc(0.5, 0.5, new THREE.Scene());
    expect(camera.view?.enabled ?? false).toBe(false);
    expect(camera.projectionMatrix.equals(projection)).toBe(true);
  });

  it('finds nothing outside the canvas', () => {
    const renderer = fakeRenderer([5, 0, 0, 255]);
    expect(picker(renderer).pickNdc(1.5, 0, new THREE.Scene())).toBeNull();
    expect(renderer.renders).toBe(0);
  });
});
