/**
 * Anonymous product events (see site/events.ts). Fire-and-forget: tracking
 * must never break or slow down the app. Disabled in development and tests.
 */
import { pageKind, type EventName, type EventProps, type EventPayload } from '../../site/events';

export type { EventName, EventProps };

/** Page the visit started on, captured before the address bar is synced. */
const ENTRY_PATH = typeof window !== 'undefined' ? window.location.pathname : '/';

/** How the visit entered the app: landing (structure page), share, embed or home. */
export function entryKind(): 'landing' | 'share' | 'embed' | 'home' {
  const kind = pageKind(ENTRY_PATH);
  if (kind === 'pdb' || kind === 'af' || kind === 'compound') return 'landing';
  if (kind === 'share' || kind === 'embed') return kind;
  return 'home';
}

/**
 * Where events go. The chat widget runs on the host's sandbox origin, so it
 * sets an absolute endpoint and its own page kind (src/widget/main.tsx).
 */
let config: { endpoint: string; page?: string } = { endpoint: '/api/event' };

export function configureTracking(next: { endpoint: string; page?: string }): void {
  config = next;
}

export function track(event: EventName, props?: EventProps): void {
  if (import.meta.env.DEV || typeof window === 'undefined') return;
  try {
    const payload: EventPayload = { e: event, p: props, page: config.page ?? pageKind(window.location.pathname) };
    const body = JSON.stringify(payload);
    // Same origin: JSON. Cross-origin: text/plain, a "simple" request that needs no CORS preflight.
    const sameOrigin = config.endpoint.startsWith('/');
    const type = sameOrigin ? 'application/json' : 'text/plain';
    if (navigator.sendBeacon?.(config.endpoint, new Blob([body], { type }))) return;
    void fetch(config.endpoint, {
      method: 'POST',
      headers: { 'content-type': type },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Tracking is best effort.
  }
}
