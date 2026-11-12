import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { EventPayload } from '../../../site/events';

const beacon = vi.hoisted(() => vi.fn());
vi.mock('../beacon', () => ({ beacon }));

import { configureTracking, referrerType, resetTrackingForTests, startTrackingSession, track } from '../track';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function sent(): EventPayload[] {
  return beacon.mock.calls.map(([, body]) => JSON.parse(body as string) as EventPayload);
}

describe('tracking sessions', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false);
    // jsdom has no WebGL: session_start reports 'none' without its "not implemented" log
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    sessionStorage.clear();
    localStorage.clear();
    beacon.mockClear();
    resetTrackingForTests();
    configureTracking({ endpoint: '/api/event' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('sends session_start once, then numbers every event of the tab under one id', () => {
    startTrackingSession();
    track('export_png', { scale: 2 });
    const [start, png] = sent();
    expect(start.e).toBe('session_start');
    expect(start.p?.detail).toBe('none');
    expect(start.sid).toMatch(UUID);
    expect(png.sid).toBe(start.sid);
    expect([start.p?.seq, png.p?.seq]).toEqual([1, 2]);
    expect(png.p).toMatchObject({ schema: '2', device: 'desktop', entry_page: 'home', ref_type: 'direct', webdriver: 0 });
  });

  it('keeps counting across a full page load in the same tab, with no second session_start', () => {
    startTrackingSession();
    track('export_png');
    // A new page load: the module state is gone, sessionStorage stays
    resetTrackingForTests();
    beacon.mockClear();
    startTrackingSession();
    track('export_png');
    const events = sent();
    expect(events.map((e) => e.e)).toEqual(['export_png']);
    expect(events[0].p?.seq).toBe(3);
  });

  it('reports the entry page and referrer stored by a static page', () => {
    sessionStorage.setItem('mv-session', JSON.stringify({ entry: '/learn/plddt-explained', ref: 'www.google.com', start: Date.now() - 5000 }));
    startTrackingSession();
    const [start] = sent();
    expect(start.p).toMatchObject({ entry_page: 'learn', ref_type: 'search' });
    expect(start.p?.elapsed).toBeGreaterThanOrEqual(5000);
  });

  it('stores and sends nothing while the opt-out is set', () => {
    localStorage.setItem('mv-analytics-off', '1');
    startTrackingSession();
    track('export_png');
    expect(beacon).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('mv-session')).toBeNull();
  });

  it('stops sending as soon as the opt-out is set in another tab, and deletes this tab\'s session', () => {
    startTrackingSession();
    expect(sessionStorage.getItem('mv-session')).not.toBeNull();
    localStorage.setItem('mv-analytics-off', '1');
    beacon.mockClear();
    track('export_png');
    expect(beacon).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('mv-session')).toBeNull();
  });

  it('deletes an entry a static page stored before the opt-out', () => {
    sessionStorage.setItem('mv-session', JSON.stringify({ entry: '/learn', ref: '', start: Date.now() }));
    localStorage.setItem('mv-analytics-off', '1');
    startTrackingSession();
    expect(sessionStorage.getItem('mv-session')).toBeNull();
  });

  it('keeps one id in memory when sessionStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage) {
      if (this === window.sessionStorage) throw new Error('blocked');
      return null;
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage) {
      if (this === window.sessionStorage) throw new Error('blocked');
    });
    startTrackingSession();
    track('export_png');
    const [start, png] = sent();
    expect(png.sid).toBe(start.sid);
    expect(png.p?.seq).toBe(2);
  });

  it('marks the owner\'s browser with ?internal=1 until ?internal=0', () => {
    window.history.replaceState(null, '', '/?internal=1');
    startTrackingSession();
    expect(sent()[0].p?.env).toBe('internal');
    expect(localStorage.getItem('mv-internal')).toBe('1');

    window.history.replaceState(null, '', '/?internal=0');
    resetTrackingForTests();
    startTrackingSession();
    track('export_png');
    expect(sent().at(-1)?.p?.env).toBe('preview'); // jsdom's host is not molviewer.bio
  });

  it('gives the widget a new id per event, no device or entry, and writes no session', () => {
    configureTracking({ endpoint: 'https://molviewer.bio/api/event', page: 'widget' });
    track('widget_view', { source: 'pdb' });
    track('widget_open_full');
    const [view, open] = sent();
    expect(view.sid).toMatch(UUID);
    expect(open.sid).not.toBe(view.sid);
    expect(view.p).toMatchObject({ env: 'prod', schema: '2' });
    expect(view.p).not.toHaveProperty('device');
    expect(view.p).not.toHaveProperty('entry_page');
    expect(view.p).not.toHaveProperty('seq');
    expect(sessionStorage.getItem('mv-session')).toBeNull();
  });

  it('sends session_hidden every time the tab is hidden', () => {
    startTrackingSession();
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    hidden.mockRestore();
    expect(sent().filter((e) => e.e === 'session_hidden')).toHaveLength(2);
  });
});

describe('referrerType', () => {
  it('sorts referrer hosts without keeping them', () => {
    expect(referrerType('', 'molviewer.bio')).toBe('direct');
    expect(referrerType('molviewer.bio', 'molviewer.bio')).toBe('internal');
    expect(referrerType('www.google.co.uk', 'molviewer.bio')).toBe('search');
    expect(referrerType('duckduckgo.com', 'molviewer.bio')).toBe('search');
    expect(referrerType('google.com', 'molviewer.bio')).toBe('search');
    expect(referrerType('scholar.google.de', 'molviewer.bio')).toBe('search');
    expect(referrerType('gemini.google.com', 'molviewer.bio')).toBe('ai');
    expect(referrerType('notebooklm.google.com', 'molviewer.bio')).toBe('ai');
    // Google's other apps are not search (their links usually arrive via www.google.com/url)
    expect(referrerType('mail.google.com', 'molviewer.bio')).toBe('other');
    expect(referrerType('cn.bing.com', 'molviewer.bio')).toBe('search');
    expect(referrerType('chatgpt.com', 'molviewer.bio')).toBe('ai');
    expect(referrerType('old.reddit.com', 'molviewer.bio')).toBe('social');
    expect(referrerType('t.co', 'molviewer.bio')).toBe('social');
    expect(referrerType('example.edu', 'molviewer.bio')).toBe('other');
  });
});
