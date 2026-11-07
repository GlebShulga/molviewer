import { describe, expect, it, vi } from 'vitest';
import { makeDensityContextGetter } from '../gpuDensity';

/** A canvas whose WebGL2 context can be "lost" by firing its listener. */
function stubCanvas() {
  const listeners: Record<string, (e: Event) => void> = {};
  let lost = false;
  const gl = { isContextLost: () => lost };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => gl),
    addEventListener: (type: string, fn: (e: Event) => void) => (listeners[type] = fn),
  };
  return { canvas, lose: () => { lost = true; listeners.webglcontextlost?.(new Event('webglcontextlost')); } };
}

describe('density WebGL context', () => {
  it('is created once and reused (the support check and every surface share it)', () => {
    const stubs: ReturnType<typeof stubCanvas>[] = [];
    const getContext = makeDensityContextGetter(() => { const s = stubCanvas(); stubs.push(s); return s.canvas as unknown as HTMLCanvasElement; });
    const first = getContext();
    expect(getContext()).toBe(first);
    expect(getContext()).toBe(first);
    expect(stubs).toHaveLength(1);
    expect(stubs[0].canvas.getContext).toHaveBeenCalledTimes(1);
  });

  it('is created again after the context is lost', () => {
    const stubs: ReturnType<typeof stubCanvas>[] = [];
    const getContext = makeDensityContextGetter(() => { const s = stubCanvas(); stubs.push(s); return s.canvas as unknown as HTMLCanvasElement; });
    const first = getContext();
    stubs[0].lose();
    const second = getContext();
    expect(second).not.toBe(first);
    expect(stubs).toHaveLength(2);
  });

  it('gives null where WebGL2 is unavailable', () => {
    const getContext = makeDensityContextGetter(() => ({ getContext: () => null, addEventListener() {} }) as unknown as HTMLCanvasElement);
    expect(getContext()).toBeNull();
  });
});
