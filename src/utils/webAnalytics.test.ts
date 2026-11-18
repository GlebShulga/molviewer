import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// public/web-analytics.js is served as is (no build step), so the test runs the file itself.
const source = readFileSync(resolve(__dirname, '../../public/web-analytics.js'), 'utf8');
const runOn = (hostname: string) => new Function('location', source)({ hostname });
const beacons = () => document.head.querySelectorAll('script[src*="cloudflareinsights"]');

describe('public/web-analytics.js', () => {
  afterEach(() => beacons().forEach((s) => s.remove()));

  it('loads the beacon with its token on molviewer.bio', () => {
    runOn('molviewer.bio');
    expect(beacons()).toHaveLength(1);
    expect(beacons()[0].getAttribute('data-cf-beacon')).toContain('"token"');
  });

  it('stays off on preview deployments and local runs', () => {
    runOn('abc123.molviewer.pages.dev');
    runOn('localhost');
    expect(beacons()).toHaveLength(0);
  });
});
