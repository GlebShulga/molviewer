/**
 * Product events: the names and fields accepted by /api/event, shared by the
 * client helper (src/utils/track.ts) and the Function that stores them in
 * Workers Analytics Engine (functions/api/event.ts).
 *
 * No cookies, no user ids: each data point is one anonymous event.
 */
import { parseRoute } from './routes';

export const EVENT_NAMES = [
  'structure_loaded',
  'export_png',
  'export_video',
  'export_model',
  'share_created',
  'embed_view',
  'representation_changed',
  'measurement_added',
  'onboarding_completed',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/**
 * String fields, stored as Analytics Engine blobs in this order (blob2..).
 * blob1 is always the event name.
 */
export const STRING_FIELDS = ['source', 'entry', 'format', 'kind', 'ref', 'value'] as const;

/** Numeric fields, stored as doubles in this order. */
export const NUMBER_FIELDS = ['scale', 'seconds'] as const;

export type EventProps = Partial<
  Record<(typeof STRING_FIELDS)[number], string> & Record<(typeof NUMBER_FIELDS)[number], number>
>;

export interface EventPayload {
  e: EventName;
  p?: EventProps;
  /** Page type the event happened on: home, pdb, af, compound, share, embed, other. */
  page?: string;
}

export function isEventName(value: unknown): value is EventName {
  return typeof value === 'string' && (EVENT_NAMES as readonly string[]).includes(value);
}

/** Classify a pathname into a coarse page type (no ids, so no free-form data is stored). */
export function pageKind(pathname: string): string {
  const route = parseRoute(pathname);
  switch (route.page) {
    case 'home':
      return 'home';
    case 'share':
      return 'share';
    case 'other':
      return 'other';
    case 'structure':
      if (route.embed) return 'embed';
      return route.structure.kind === 'cid' ? 'compound' : route.structure.kind;
  }
}
