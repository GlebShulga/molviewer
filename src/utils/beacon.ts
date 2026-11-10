/**
 * Posts a body that must arrive even if the page is closing: sendBeacon, or a
 * keepalive fetch where sendBeacon is missing or refuses (jsdom has none).
 * Best effort: never throws, never rejects.
 *
 * Both draw on one browser budget of 64 KB for everything a page still has
 * uploading this way, so a second large post right after a first one is
 * refused. Use this for small posts (product events) and for the last send
 * when the page is hidden or unloads; a page that stays open should use a
 * plain fetch.
 */
export function beacon(url: string, body: string, type: string): void {
  try {
    if (navigator.sendBeacon?.(url, new Blob([body], { type }))) return;
    void fetch(url, { method: 'POST', headers: { 'content-type': type }, body, keepalive: true }).catch(() => {});
  } catch {
    // Best effort.
  }
}
