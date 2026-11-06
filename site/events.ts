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
  // Toolbar Copy Link; value: 'view' (with the camera) or 'plain'.
  'link_copied',
  'embed_view',
  'representation_changed',
  'measurement_added',
  // A 3D label added from the atom menu; value: the structure's style.
  'label_added',
  // The atom menu opened (right-click on an atom); value: the structure's style.
  'atom_menu_opened',
  'onboarding_completed',
  // The chat app widget (src/widget). The MCP server writes its own
  // `mcp_tool_call` points straight to the dataset (workers/mcp/src/analytics.ts).
  'widget_view',
  'widget_open_full',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/**
 * String fields, stored as Analytics Engine blobs in this order (blob2..).
 * blob1 is always the event name.
 */
export const STRING_FIELDS = ['source', 'entry', 'format', 'kind', 'ref', 'value'] as const;

/**
 * Numeric fields, stored as doubles in this order. New fields go at the end so
 * the columns of older ones don't move. `atoms`: the structure's atom count to
 * two significant figures (roundAtoms in src/utils/track.ts).
 */
export const NUMBER_FIELDS = ['scale', 'seconds', 'atoms'] as const;

export type EventProps = Partial<
  Record<(typeof STRING_FIELDS)[number], string> & Record<(typeof NUMBER_FIELDS)[number], number>
>;

export interface EventPayload {
  e: EventName;
  p?: EventProps;
  /** Page type the event happened on: home, pdb, af, compound, share, embed, widget, other. */
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
