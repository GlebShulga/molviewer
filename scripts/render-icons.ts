/**
 * Rasterize public/favicon.svg into public/apple-touch-icon.png (180x180).
 * iOS rounds the corners itself, so the icon is drawn on a full square.
 *
 * Usage: pnpm exec tsx scripts/render-icons.ts
 */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const SIZE = 180;
const svg = readFileSync('public/favicon.svg', 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
await page.setContent(
  `<html><body style="margin:0;background:#0d1117">
    <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${SIZE}" height="${SIZE}" style="display:block">
  </body></html>`
);
await page.screenshot({ path: 'public/apple-touch-icon.png', omitBackground: false });
await browser.close();
console.log(`wrote public/apple-touch-icon.png (${SIZE}x${SIZE})`);
