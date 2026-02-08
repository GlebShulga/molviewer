import type * as THREE from 'three';

interface ViewerRefs {
  gl: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  ready: boolean;
}

// Use a Proxy to keep window.__mol3d_* in sync for e2e tests
const storage: ViewerRefs = { gl: null, scene: null, camera: null, ready: false };

const keyMap: Record<string, string> = {
  gl: '__mol3d_gl',
  scene: '__mol3d_scene',
  camera: '__mol3d_camera',
  ready: '__mol3d_ready',
};

export const viewerRefs: ViewerRefs = new Proxy(storage, {
  set(target, prop, value) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (target as any)[prop] = value;
    const winKey = keyMap[prop as string];
    if (winKey) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any)[winKey] = value;
    }
    return true;
  },
});
