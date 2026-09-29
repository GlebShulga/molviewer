import { describe, it, expect } from 'vitest';
import { getWatermarkText } from '../watermark';

describe('getWatermarkText', () => {
  it('returns the host on regular pages', () => {
    expect(getWatermarkText({ host: 'molviewer.bio', pathname: '/' })).toBe('molviewer.bio');
  });

  it('ignores non-share paths', () => {
    expect(getWatermarkText({ host: 'molviewer.bio', pathname: '/viewer/abc' })).toBe(
      'molviewer.bio'
    );
  });

  it('appends the share path on share pages', () => {
    expect(getWatermarkText({ host: 'molviewer.bio', pathname: '/s/Ab12Cd34Ef56' })).toBe(
      'molviewer.bio/s/Ab12Cd34Ef56'
    );
    // Trailing slash tolerated, canonical form used.
    expect(getWatermarkText({ host: 'localhost:3000', pathname: '/s/Ab12Cd34Ef56/' })).toBe(
      'localhost:3000/s/Ab12Cd34Ef56'
    );
  });

  it('falls back to the host for paths that are not real routes', () => {
    expect(getWatermarkText({ host: 'molviewer.bio', pathname: '/s/xyz9/extra' })).toBe('molviewer.bio');
    expect(getWatermarkText({ host: 'molviewer.bio', pathname: '/embed/pdb/4HHB' })).toBe('molviewer.bio');
  });

  it('uses the readable structure address', () => {
    expect(getWatermarkText({ host: 'molviewer.bio', pathname: '/pdb/4HHB' })).toBe('molviewer.bio/pdb/4HHB');
    expect(getWatermarkText({ host: 'molviewer.bio', pathname: '/pdb/4hhb/' })).toBe('molviewer.bio/pdb/4HHB');
    expect(getWatermarkText({ host: 'molviewer.bio', pathname: '/af/P69905' })).toBe('molviewer.bio/af/P69905');
    expect(getWatermarkText({ host: 'molviewer.bio', pathname: '/compound/caffeine' })).toBe(
      'molviewer.bio/compound/caffeine'
    );
    expect(getWatermarkText({ host: 'molviewer.bio', pathname: '/compound/cid/2519' })).toBe(
      'molviewer.bio/compound/cid/2519'
    );
  });

  it('defaults to window.location', () => {
    expect(getWatermarkText()).toBe(window.location.host);
  });
});
