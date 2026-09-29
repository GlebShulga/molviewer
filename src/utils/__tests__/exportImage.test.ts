import { describe, it, expect } from 'vitest';
import { buildExportFilename } from '../exportImage';

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
