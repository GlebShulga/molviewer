import { describe, it, expect, afterEach, vi } from 'vitest';
import { configureTracking, roundAtoms, track } from '../track';

describe('roundAtoms', () => {
  it('keeps two significant figures', () => {
    expect(roundAtoms(0)).toBe(0);
    expect(roundAtoms(46)).toBe(46);
    expect(roundAtoms(4782)).toBe(4800);
    expect(roundAtoms(123456)).toBe(120000);
  });
});

describe('track', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    configureTracking({ endpoint: '/api/event' });
  });

  it('sends only the widget events to another origin, which refuses the rest', () => {
    vi.stubEnv('DEV', false);
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon });
    configureTracking({ endpoint: 'https://molviewer.bio/api/event', page: 'widget' });

    track('atom_menu_opened', { value: 'spacefill' });
    expect(sendBeacon).not.toHaveBeenCalled();

    track('widget_view', { source: 'pdb' });
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });
});
