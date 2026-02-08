let cachedResult: boolean | null = null;

export function isWebGL2Supported(): boolean {
  if (cachedResult !== null) return cachedResult;

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    cachedResult = gl !== null;
    // Clean up context
    if (gl) {
      const ext = gl.getExtension('WEBGL_lose_context');
      ext?.loseContext();
    }
  } catch {
    cachedResult = false;
  }

  return cachedResult;
}
