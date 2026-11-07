// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { decompressGzip } from '../decompressGzip';
import { FileValidationError } from '../fileValidation';

const gz = (bytes: Uint8Array) => {
  const b = gzipSync(bytes);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe('decompressGzip', () => {
  it('decompresses text', async () => {
    expect(await decompressGzip(gz(new TextEncoder().encode('HETATM 1 C')))).toBe('HETATM 1 C');
  });

  it('stops past the size cap instead of expanding a gzip bomb', async () => {
    const zeros = gz(new Uint8Array(200_000));
    await expect(decompressGzip(zeros, 50_000)).rejects.toBeInstanceOf(FileValidationError);
    await expect(decompressGzip(zeros, 50_000)).rejects.toThrow(/too large/);
    expect((await decompressGzip(zeros, 300_000)).length).toBe(200_000);
  });
});
