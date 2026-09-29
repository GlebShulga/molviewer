/**
 * Record the README hero GIF: a structure rotating in the real app.
 *
 * Usage: start the dev server (pnpm dev, port 3000), then
 *   pnpm exec tsx scripts/capture-hero-gif.ts [path=/pdb/4HHB?repr=cartoon&color=chain]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
// gifenc ships CommonJS without types.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import gifenc from 'gifenc';

const { GIFEncoder, quantize, applyPalette } = gifenc as {
  GIFEncoder: () => { writeFrame: (i: Uint8Array, w: number, h: number, o: object) => void; finish: () => void; bytes: () => Uint8Array };
  quantize: (rgba: Uint8ClampedArray, n: number) => number[][];
  applyPalette: (rgba: Uint8ClampedArray, palette: number[][]) => Uint8Array;
};

const BASE = 'http://localhost:3000';
const PATH = process.argv[2] ?? '/pdb/4HHB?repr=cartoon&color=chain';
const OUT_W = 640;
const OUT_H = 360;
const FRAMES = 48;
const DELAY_MS = 70;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await context.addInitScript(() => {
  localStorage.setItem('mol3d-onboarding-completed', 'true');
  localStorage.setItem('mol3d-theme', 'dark');
});
const page = await context.newPage();
await page.goto(`${BASE}${PATH}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => {
    const reset = document.querySelector('button[title*="Reset View"]');
    return (window as unknown as { __mol3d_ready?: boolean }).__mol3d_ready === true && reset && !reset.hasAttribute('disabled');
  },
  undefined,
  { timeout: 90_000 }
);
await page.waitForTimeout(2000);

const encoder = GIFEncoder();
for (let i = 0; i < FRAMES; i++) {
  // Rotate the scene, render one frame directly and read the canvas back.
  const base64 = await page.evaluate(
    ({ angle, w, h }) => {
      const win = window as unknown as {
        __mol3d_gl: { domElement: HTMLCanvasElement; render: (s: unknown, c: unknown) => void };
        __mol3d_scene: { rotation: { y: number } };
        __mol3d_camera: unknown;
      };
      win.__mol3d_scene.rotation.y = angle;
      win.__mol3d_gl.render(win.__mol3d_scene, win.__mol3d_camera);
      const src = win.__mol3d_gl.domElement;
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const ctx = out.getContext('2d')!;
      // Center-crop the viewer canvas to the output aspect ratio.
      const scale = Math.min(src.width / w, src.height / h);
      const sw = w * scale;
      const sh = h * scale;
      ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let bin = '';
      for (let j = 0; j < data.length; j += 0x8000) bin += String.fromCharCode(...data.subarray(j, j + 0x8000));
      return btoa(bin);
    },
    { angle: (2 * Math.PI * i) / FRAMES, w: OUT_W, h: OUT_H }
  );
  const rgba = new Uint8ClampedArray(Buffer.from(base64, 'base64'));
  const palette = quantize(rgba, 256);
  encoder.writeFrame(applyPalette(rgba, palette), OUT_W, OUT_H, { palette, delay: DELAY_MS });
}
encoder.finish();
await browser.close();

mkdirSync('docs/images', { recursive: true });
const bytes = encoder.bytes();
writeFileSync('docs/images/hero.gif', bytes);
console.log(`wrote docs/images/hero.gif (${(bytes.length / 1024).toFixed(0)} KB, ${FRAMES} frames)`);
