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

export function drawWatermark(
  sourceCanvas: HTMLCanvasElement,
  text: string
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = sourceCanvas.width;
  out.height = sourceCanvas.height;
  const ctx = out.getContext('2d');
  if (!ctx) return sourceCanvas;

  ctx.drawImage(sourceCanvas, 0, 0);

  const fontSize = Math.max(14, Math.round(sourceCanvas.width / 100));
  ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';

  const padX = Math.round(fontSize * 0.7);
  const padY = Math.round(fontSize * 0.4);
  const margin = Math.round(fontSize * 0.85);
  const metrics = ctx.measureText(text);
  const textW = metrics.width;
  const pillH = fontSize + padY * 2;
  const pillW = textW + padX * 2;
  const x = sourceCanvas.width - pillW - margin;
  const y = sourceCanvas.height - pillH - margin;
  const radius = pillH / 2;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + pillW - radius, y);
  ctx.arc(x + pillW - radius, y + radius, radius, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + radius, y + pillH);
  ctx.arc(x + radius, y + radius, radius, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillText(text, x + padX, y + pillH / 2);

  return out;
}
