/**
 * Decompress gzip-compressed data using the native DecompressionStream API.
 * Supported in all modern browsers (Chrome 80+, Firefox 113+, Safari 16.4+).
 *
 * @param data - The gzip-compressed data as an ArrayBuffer
 * @returns The decompressed content as a string
 */
export async function decompressGzip(data: ArrayBuffer): Promise<string> {
  const stream = new DecompressionStream('gzip');
  const blob = new Blob([data]);
  const decompressedStream = blob.stream().pipeThrough(stream);
  const decompressedResponse = new Response(decompressedStream);
  const decompressedBuffer = await decompressedResponse.arrayBuffer();
  return new TextDecoder().decode(decompressedBuffer);
}
