import { describe, it, expect } from 'vitest';
import { placeTooltip } from '../tooltipPlacement';

const viewport = { width: 390, height: 844 };
const size = { width: 200, height: 300 };

describe('placeTooltip', () => {
  it('goes below and right of the pointer when there is room', () => {
    expect(placeTooltip({ x: 50, y: 100 }, size, viewport)).toEqual({ left: 60, top: 110 });
  });

  it('flips left near the right edge', () => {
    // 360 + 10 + 200 would end at 570, past 390 - 8
    expect(placeTooltip({ x: 360, y: 100 }, size, viewport).left).toBe(150);
  });

  it('flips up near the bottom edge', () => {
    expect(placeTooltip({ x: 50, y: 800 }, size, viewport).top).toBe(490);
  });

  it('stays 8px inside when neither side fits', () => {
    // Flipping left from x=150 would start at -60
    expect(placeTooltip({ x: 150, y: 100 }, { width: 300, height: 100 }, viewport).left).toBe(8);
  });

  it('starts at the margin when it is larger than the viewport', () => {
    expect(placeTooltip({ x: 100, y: 100 }, { width: 500, height: 100 }, viewport).left).toBe(8);
  });

  it('keeps every corner inside the viewport for taps anywhere', () => {
    for (let x = 0; x <= viewport.width; x += 15) {
      for (let y = 0; y <= viewport.height; y += 40) {
        const { left, top } = placeTooltip({ x, y }, size, viewport);
        expect(left).toBeGreaterThanOrEqual(8);
        expect(top).toBeGreaterThanOrEqual(8);
        expect(left + size.width).toBeLessThanOrEqual(viewport.width - 8);
        expect(top + size.height).toBeLessThanOrEqual(viewport.height - 8);
      }
    }
  });
});
