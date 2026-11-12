import { describe, it, expect } from 'vitest';
import { CONTEXT_FIELDS, entryPageKind, isEntryPageKind, NUMBER_FIELDS, STRING_FIELDS } from './events';
import { pages } from './content/pages';

describe('entryPageKind', () => {
  it('keeps the app page kinds', () => {
    expect(entryPageKind('/')).toBe('home');
    expect(entryPageKind('/pdb/4HHB')).toBe('pdb');
    expect(entryPageKind('/compound/caffeine')).toBe('compound');
    expect(entryPageKind('/embed/af/P69905')).toBe('embed');
    expect(entryPageKind('/s/abcdefgh12')).toBe('share');
  });

  it('names the static pages', () => {
    expect(entryPageKind('/learn')).toBe('learn');
    expect(entryPageKind('/learn/plddt-explained/')).toBe('learn');
    expect(entryPageKind('/collections')).toBe('collection');
    expect(entryPageKind('/collections/hemoglobin')).toBe('collection');
    expect(entryPageKind('/compounds')).toBe('compounds');
    expect(entryPageKind('/privacy')).toBe('info');
    expect(entryPageKind('/pdb-viewer')).toBe('tool');
    expect(entryPageKind('/nope')).toBe('other');
  });

  it('knows every content page, and every tool page as a tool', () => {
    for (const page of pages) {
      const kind = entryPageKind(page.path);
      expect(kind, page.path).not.toBe('other');
      if (page.kind === 'tool') expect(kind, page.path).toBe('tool');
      expect(isEntryPageKind(kind)).toBe(true);
    }
  });
});

describe('the data point layout', () => {
  it('stays within Analytics Engine limits (20 blobs, 20 doubles)', () => {
    // blob1 event + strings + page kind + country + context
    expect(1 + STRING_FIELDS.length + 2 + CONTEXT_FIELDS.length).toBeLessThanOrEqual(20);
    expect(NUMBER_FIELDS.length).toBeLessThanOrEqual(20);
  });

  it('keeps the columns the queries name', () => {
    expect(1 + STRING_FIELDS.length + 2 + CONTEXT_FIELDS.indexOf('entry_page') + 1).toBe(12); // blob12
    expect(1 + STRING_FIELDS.length + 2 + CONTEXT_FIELDS.indexOf('detail') + 1).toBe(16); // blob16
    expect(NUMBER_FIELDS.indexOf('asn') + 1).toBe(8); // double8
    expect(NUMBER_FIELDS.indexOf('user') + 1).toBe(10); // double10
  });
});
