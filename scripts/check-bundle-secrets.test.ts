// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findSecrets } from './check-bundle-secrets';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bundle-secrets-'));
  mkdirSync(join(dir, 'assets'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('findSecrets', () => {
  it('passes a clean bundle', () => {
    writeFileSync(join(dir, 'assets', 'index.js'), 'fetch("/api/log",{method:"POST"})');
    expect(findSecrets(dir)).toEqual([]);
  });

  // Fake keys are built at runtime so no key-shaped string sits in the source
  // (secret scanners would flag it).
  const euKey = 'eu01xx' + '0'.repeat(30) + 'NR' + 'AL';

  it.each([
    ['an EU license key', `x="${euKey}"`],
    ['a US license key', `x="${'a1'.repeat(18)}NR${'AL'}"`],
    ['a browser key', `x="NR${'JS'}-${'f'.repeat(19)}"`],
    ['a user key', `x="NR${'AK'}-${'A'.repeat(27)}"`],
    ['the Log API host', 'fetch("https://log-api.eu.newrelic.com/log/v1")'],
  ])('finds %s in a nested file, without printing it', (_name, text) => {
    writeFileSync(join(dir, 'assets', 'index.js'), text);
    const found = findSecrets(dir);
    expect(found).toHaveLength(1);
    expect(found[0].file).toBe(join('assets', 'index.js'));
    expect(found[0].patterns.join(' ')).not.toMatch(/0{10}|a1a1|f{10}|A{10}/);
  });

  it('ignores a key-shaped run inside longer base64-like data', () => {
    writeFileSync(join(dir, 'assets', 'scene.js'), `const img="data:image/png;base64,QUJD${euKey}RUZH";`);
    expect(findSecrets(dir)).toEqual([]);
  });

  it('finds a key at the very start or end of a file', () => {
    writeFileSync(join(dir, 'assets', 'a.js'), euKey);
    expect(findSecrets(dir)).toHaveLength(1);
  });

  it('skips binary files', () => {
    writeFileSync(join(dir, 'card.png'), euKey);
    expect(findSecrets(dir)).toEqual([]);
  });
});
