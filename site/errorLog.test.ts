import { describe, expect, it } from 'vitest';
import { trimAttributes } from './errorLog';

describe('trimAttributes', () => {
  it('gives stacks the long limit and other strings the short one', () => {
    const out = trimAttributes({ 'error.stack': 'a'.repeat(5_000), componentStack: 'b'.repeat(5_000), source: 'c'.repeat(800) });
    expect(out['error.stack']).toHaveLength(4_000);
    expect(out.componentStack).toHaveLength(4_000);
    expect(out.source).toHaveLength(500);
  });

  it('keeps finite numbers and booleans, drops everything else', () => {
    expect(trimAttributes({ n: 3, f: false, inf: Infinity, nan: NaN, u: undefined, o: { x: 1 }, a: [1] })).toEqual({ n: 3, f: false });
  });

  it('leaves out keys in the drop set and cuts long keys', () => {
    const long = 'k'.repeat(100);
    const out = trimAttributes({ application: 'x', keep: 'y', [long]: 1 }, new Set(['application']));
    expect(out).toEqual({ keep: 'y', ['k'.repeat(64)]: 1 });
  });

  it('keeps at most 30 attributes', () => {
    const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`a${i}`, i]));
    expect(Object.keys(trimAttributes(many))).toHaveLength(30);
  });

  it.each([null, undefined, 'text', 3, ['a']])('returns {} for %j', (value) => {
    expect(trimAttributes(value)).toEqual({});
  });
});
