import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildExportFilename, dataUrlToBlob, shareOrDownload } from '../exportImage';

describe('buildExportFilename', () => {
  it('appends the extension', () => {
    expect(buildExportFilename('1CRN', 'glb')).toBe('1CRN.glb');
    expect(buildExportFilename('crambin', '.STL')).toBe('crambin.stl');
  });

  it('does not double the extension', () => {
    expect(buildExportFilename('model.mp4', 'mp4')).toBe('model.mp4');
    expect(buildExportFilename('model.MP4', 'mp4')).toBe('model.mp4');
  });

  it('replaces characters that are invalid in file names', () => {
    expect(buildExportFilename('a/b\\c:d*e?f"g<h>i|j', 'webm')).toBe('a_b_c_d_e_f_g_h_i_j.webm');
  });

  it('falls back to "molecule" for empty names', () => {
    expect(buildExportFilename('', 'glb')).toBe('molecule.glb');
    expect(buildExportFilename('   ', 'glb')).toBe('molecule.glb');
    expect(buildExportFilename(undefined, 'stl')).toBe('molecule.stl');
    expect(buildExportFilename('.stl', 'stl')).toBe('molecule.stl');
  });
});

describe('dataUrlToBlob', () => {
  it('decodes the bytes and keeps the type', async () => {
    const blob = dataUrlToBlob('data:image/png;base64,' + btoa('PNGDATA'));
    expect(blob.type).toBe('image/png');
    // jsdom's Blob has no text()
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(blob);
    });
    expect(text).toBe('PNGDATA');
  });
});

describe('shareOrDownload', () => {
  const blob = new Blob(['x'], { type: 'image/png' });
  let clicked: string[] = [];

  function setUp({ coarse, canShare, share }: { coarse: boolean; canShare?: boolean; share?: () => Promise<void> }) {
    clicked = [];
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: coarse && query === '(pointer: coarse)' }));
    Object.assign(navigator, {
      canShare: canShare === undefined ? undefined : () => canShare,
      share: share ?? (canShare === undefined ? undefined : vi.fn(() => Promise.resolve())),
    });
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => {};
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Object.assign(navigator, { canShare: undefined, share: undefined });
  });

  it('opens the share sheet on a touch device that can share files', async () => {
    const share = vi.fn(() => Promise.resolve());
    setUp({ coarse: true, canShare: true, share });
    expect(await shareOrDownload(blob, 'mol.png')).toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    expect(clicked).toEqual([]);
  });

  it('downloads on a desktop, even where sharing exists', async () => {
    const share = vi.fn(() => Promise.resolve());
    setUp({ coarse: false, canShare: true, share });
    expect(await shareOrDownload(blob, 'mol.png')).toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(clicked).toEqual(['mol.png']);
  });

  it('downloads on a touch device that cannot share files', async () => {
    setUp({ coarse: true, canShare: false });
    expect(await shareOrDownload(blob, 'mol.png')).toBe('downloaded');
    expect(clicked).toEqual(['mol.png']);
  });

  it('does nothing more when the share sheet is closed', async () => {
    setUp({ coarse: true, canShare: true, share: () => Promise.reject(new DOMException('closed', 'AbortError')) });
    expect(await shareOrDownload(blob, 'mol.png')).toBe('cancelled');
    expect(clicked).toEqual([]);
  });

  it('falls back to a download when sharing fails', async () => {
    setUp({ coarse: true, canShare: true, share: () => Promise.reject(new DOMException('no', 'NotAllowedError')) });
    expect(await shareOrDownload(blob, 'mol.png')).toBe('downloaded');
    expect(clicked).toEqual(['mol.png']);
  });
});
