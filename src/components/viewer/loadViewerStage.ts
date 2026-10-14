let pending: Promise<typeof import('./ViewerStage')> | undefined;
let failed = false;

/**
 * Starts (or reuses) the download of the 3D viewer chunk. Called as soon as a
 * structure is on its way, so the chunk loads alongside the structure fetch.
 */
export function loadViewerStage(): Promise<typeof import('./ViewerStage')> {
  pending ??= import('./ViewerStage').catch((err: unknown) => {
    failed = true;
    throw err;
  });
  return pending;
}

/**
 * The browser keeps a failed import() of a URL failed for the life of the
 * page (it never refetches it), so after this only a reload can load the
 * viewer. A reload also picks up new chunk hashes after a deploy.
 */
export function viewerLoadFailed(): boolean {
  return failed;
}
