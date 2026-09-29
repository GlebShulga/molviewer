// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SHELL_MARKER, isShellRoute, isSpaFallback, toNotFoundHtml, isEmbedPath } from './routing';
import { buildCsp } from './csp';

const indexHtml = readFileSync(resolve(__dirname, '../index.html'), 'utf8');

describe('SPA fallback detection', () => {
  it('index.html carries the shell marker exactly once', () => {
    expect(indexHtml.split(SHELL_MARKER).length - 1).toBe(1);
    expect(isSpaFallback(indexHtml)).toBe(true);
  });

  it('only the home page may serve the untouched shell', () => {
    expect(isShellRoute('/')).toBe(true);
    expect(isShellRoute('/random')).toBe(false);
    expect(isShellRoute('/pdb/ZZZZ')).toBe(false);
  });

  it('404 version drops the marker and sets noindex', () => {
    const html = toNotFoundHtml(indexHtml);
    expect(isSpaFallback(html)).toBe(false);
    expect(html).toContain('<meta name="robots" content="noindex, follow">');
    expect(html).not.toContain('content="index, follow"');
  });
});

describe('CSP', () => {
  it('only embed pages can be framed by other sites', () => {
    expect(isEmbedPath('/embed/pdb/4HHB')).toBe(true);
    expect(isEmbedPath('/pdb/4HHB')).toBe(false);
    expect(buildCsp('embed')).toContain('frame-ancestors *');
    expect(buildCsp('default')).toContain("frame-ancestors 'self'");
  });

  it('keeps script-src locked to self plus the analytics beacon', () => {
    expect(buildCsp()).toMatch(/script-src 'self' https:\/\/static\.cloudflareinsights\.com;/);
  });
});
