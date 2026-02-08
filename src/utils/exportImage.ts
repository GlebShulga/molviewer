import type { WebGLRenderer, Scene, Camera } from 'three';

export interface ExportOptions {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  scale?: number;
  background?: string | null;
  filename?: string;
}

export async function exportImage({
  renderer,
  scene,
  camera,
  scale = 2,
  background = null,
  filename = 'molecule',
}: ExportOptions): Promise<void> {
  const originalSize = renderer.getSize(new (await import('three')).Vector2());
  const originalPixelRatio = renderer.getPixelRatio();
  const originalBackground = scene.background;

  try {
    // Set higher resolution
    renderer.setPixelRatio(scale);
    renderer.setSize(originalSize.x, originalSize.y);

    // Set background
    if (background) {
      scene.background = new (await import('three')).Color(background);
    } else {
      scene.background = null;
    }

    // Render
    renderer.render(scene, camera);

    // Get canvas data
    const canvas = renderer.domElement;

    // Create download link
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = dataUrl;
    link.click();
  } finally {
    // Restore original settings
    renderer.setPixelRatio(originalPixelRatio);
    renderer.setSize(originalSize.x, originalSize.y);
    scene.background = originalBackground;
    renderer.render(scene, camera);
  }
}

export function getCanvasDataUrl(
  renderer: WebGLRenderer,
  format: 'png' | 'jpeg' = 'png',
  quality?: number
): string {
  return renderer.domElement.toDataURL(`image/${format}`, quality);
}
