import { FileValidationError } from './fileValidation';

/** Largest decompressed size accepted: well above any real structure file, far below a gzip bomb. */
export const MAX_DECOMPRESSED_BYTES = 100 * 1024 * 1024;

/**
 * Decompress gzip-compressed data using the native DecompressionStream API.
 * Supported in all modern browsers (Chrome 80+, Firefox 113+, Safari 16.4+).
 *
 * The stream is read chunk by chunk and given up past `maxBytes`, so a small
 * file that expands to gigabytes (a gzip bomb) can't exhaust memory.
 *
 * @param data - The gzip-compressed data as an ArrayBuffer
 * @param maxBytes - Decompressed size limit (a parameter for tests)
 * @returns The decompressed content as a string
 */
export async function decompressGzip(data: ArrayBuffer, maxBytes = MAX_DECOMPRESSED_BYTES): Promise<string> {
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FileValidationError(
        `This file is too large once decompressed (over ${Math.round(maxBytes / (1024 * 1024))} MB).`,
        'too_large'
      );
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(out);
}
