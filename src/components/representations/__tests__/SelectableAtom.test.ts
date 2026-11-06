import { describe, it, expect } from 'vitest';
import { getUnitSphere } from '../SelectableAtom';

describe('getUnitSphere', () => {
  it('shares one geometry per segment count', () => {
    expect(getUnitSphere(32, 16)).toBe(getUnitSphere(32, 16));
    expect(getUnitSphere(16, 8)).not.toBe(getUnitSphere(32, 16));
  });

  it('is a unit sphere with the asked segments', () => {
    const { radius, widthSegments, heightSegments } = getUnitSphere(16, 8).parameters;
    expect(radius).toBe(1);
    expect(widthSegments).toBe(16);
    expect(heightSegments).toBe(8);
  });
});
