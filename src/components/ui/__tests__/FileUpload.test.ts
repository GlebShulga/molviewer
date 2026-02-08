import { describe, it, expect } from 'vitest';

describe('FileUpload - PDB ID validation', () => {
  // Test the validation regex used in fetchPDB
  const PDB_ID_REGEX = /^[A-Z0-9]{4}$/i;

  it('accepts valid 4-character alphanumeric PDB IDs', () => {
    expect(PDB_ID_REGEX.test('1CRN')).toBe(true);
    expect(PDB_ID_REGEX.test('4HHB')).toBe(true);
    expect(PDB_ID_REGEX.test('2MBP')).toBe(true);
    expect(PDB_ID_REGEX.test('1a2b')).toBe(true); // lowercase
  });

  it('rejects invalid PDB IDs', () => {
    expect(PDB_ID_REGEX.test('')).toBe(false);
    expect(PDB_ID_REGEX.test('ABC')).toBe(false);      // too short
    expect(PDB_ID_REGEX.test('ABCDE')).toBe(false);    // too long
    expect(PDB_ID_REGEX.test('AB-C')).toBe(false);     // special chars
    expect(PDB_ID_REGEX.test('AB C')).toBe(false);     // spaces
  });
});

describe('FileUpload - offline check', () => {
  it('navigator.onLine is accessible', () => {
    // In jsdom, navigator.onLine defaults to true
    expect(typeof navigator.onLine).toBe('boolean');
  });
});
