/**
 * Anonymous product events (see site/events.ts). Fire-and-forget: tracking
 * must never break or slow down the app. Disabled in development and tests.
 */
import { CROSS_ORIGIN_EVENTS, pageKind, type EventName, type EventProps, type EventPayload } from '../../site/events';
import { beacon } from './beacon';

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
 * A structure's atom count to two significant figures (4,782 -> 4,800): enough
 * to tell a ligand from a large protein, too coarse to recognise someone's file.
 */
export function roundAtoms(count: number): number {
  if (!(count > 0)) return 0;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(count)) - 1);
  return Math.round(count / step) * step;
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
  const sameOrigin = config.endpoint.startsWith('/');
  // The widget shares components (and so events) with the site, but another
  // origin may only post the widget's own events: the rest would get a 403.
  if (!sameOrigin && !CROSS_ORIGIN_EVENTS.has(event)) return;
  try {
    const payload: EventPayload = { e: event, p: props, page: config.page ?? pageKind(window.location.pathname) };
    const body = JSON.stringify(payload);
    // Same origin: JSON. Cross-origin: text/plain, a "simple" request that needs no CORS preflight.
    beacon(config.endpoint, body, sameOrigin ? 'application/json' : 'text/plain');
  } catch {
    // Tracking is best effort.
  }
}
