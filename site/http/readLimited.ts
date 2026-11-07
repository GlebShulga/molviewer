/**
 * Read at most `max` bytes of a request body; null when it's larger (by its
 * declared length, or once the stream passes `max`), '' when there is no
 * body. Read errors propagate. For unauthenticated endpoints: never buffer
 * an arbitrarily large upload.
 */
export async function readLimited(request: Request, max: number): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? '0') > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
