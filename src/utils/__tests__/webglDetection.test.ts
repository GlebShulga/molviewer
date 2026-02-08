import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must re-import fresh each test since the module caches its result
describe('isWebGL2Supported', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns true when WebGL2 context is available', async () => {
    // Mock canvas getContext to return a truthy value
    const mockGl = { getExtension: vi.fn().mockReturnValue({ loseContext: vi.fn() }) };
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue({
        getContext: vi.fn().mockReturnValue(mockGl),
      }),
    });

    const { isWebGL2Supported } = await import('../webglDetection');
    expect(isWebGL2Supported()).toBe(true);
  });

  it('returns false when WebGL2 context is not available', async () => {
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue({
        getContext: vi.fn().mockReturnValue(null),
      }),
    });

    const { isWebGL2Supported } = await import('../webglDetection');
    expect(isWebGL2Supported()).toBe(false);
  });

  it('returns false when an error is thrown', async () => {
    vi.stubGlobal('document', {
      createElement: vi.fn().mockImplementation(() => {
        throw new Error('No canvas');
      }),
    });

    const { isWebGL2Supported } = await import('../webglDetection');
    expect(isWebGL2Supported()).toBe(false);
  });
});
