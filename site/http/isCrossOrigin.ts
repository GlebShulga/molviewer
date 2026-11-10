/** A missing Origin header counts as same-origin: older browsers omit it on same-origin beacons. */
export function isCrossOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return !!origin && origin !== new URL(request.url).origin;
}
