/**
 * Product events: the names and fields accepted by /api/event, shared by the
 * client helper (src/utils/track.ts) and the Function that stores them in
 * Workers Analytics Engine (functions/api/event.ts).
 *
 * No cookies, no user ids. Since schema 2 the events of one browser tab share
 * a random session id (kept in sessionStorage, gone with the tab), so a visit
 * can be followed as a funnel; the chat widget and the MCP server use a new id
 * per event, so nothing links one person's chat calls.
 */
import { normalizePath, parseRoute } from './routes';

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
  // measurement_added, label_added (from the atom menu) and atom_menu_opened
  // (right-click on an atom): value = the style the picked atom is drawn in,
  // format = 'gpu' or 'cpu', how it was picked (pickProps in moleculeStore.ts).
  'measurement_added',
  'label_added',
  'atom_menu_opened',
  'onboarding_completed',
  // The chat app widget (src/widget). The MCP server writes its own
  // `mcp_tool_call` points straight to the dataset (workers/mcp/src/analytics.ts).
  'widget_view',
  'widget_open_full',
  // Schema 2 (src/utils/track.ts, src/utils/loadTracking.ts). session_start:
  // detail = WebGL support. file_picker_opened: value = 'dialog' or 'drop'.
  'session_start',
  'session_hidden',
  'file_picker_opened',
  // Every load: started, then exactly one of structure_loaded,
  // structure_load_failed (detail = LoadErrorClass) or structure_load_cancelled
  // (detail = aborted, superseded, limit); structure_rendered after the first frame.
  'structure_load_started',
  'structure_load_failed',
  'structure_load_cancelled',
  'structure_rendered',
  'webgl_context_lost',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/**
 * The only events /api/event takes from another origin (the widget's sandbox,
 * or anyone else's page). The site's own events must come from the site, so
 * the widget doesn't send them either (track() in src/utils/track.ts).
 */
export const CROSS_ORIGIN_EVENTS: ReadonlySet<EventName> = new Set(['widget_view', 'widget_open_full']);

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
export const NUMBER_FIELDS = [
  'scale',
  'seconds',
  'atoms',
  // Schema 2, double4..double10:
  /** Event number within the session (1, 2, 3...). */
  'seq',
  /** ms since the session started (the start time stored on the entry page). */
  'elapsed',
  /** ms: fetch + parse for structure_loaded, start to first frame for structure_rendered. */
  'duration',
  /** File size in KB, two significant figures. */
  'kb',
  /** The client's network (request.cf.asn), set by /api/event only: a client value is ignored. */
  'asn',
  /** navigator.webdriver as 0/1. */
  'webdriver',
  /** 1 when a person started the load in this tab, 0 for an automatic load from the URL. */
  'user',
  // Schema 3, double11..double14: the session's running totals, this event
  // included (src/utils/track.ts). They only grow, so a session's funnel is
  // the max over its rows: Analytics Engine drops some rows of a busy session
  // at write time, and any later row still carries what they counted.
  /** Built-in examples a person loaded: sidebar samples, welcome and empty-state examples, the tour. */
  'samples',
  /** Structures a person loaded that are not examples: files, RCSB/AlphaFold/PubChem lookups, Saved entries. */
  'real_loads',
  /** file_picker_opened events. */
  'pickers',
  /** Loads a person started that failed. */
  'failures',
] as const;

/**
 * Schema 2 context strings, stored after page kind and country (blob10..blob16)
 * so the older columns don't move.
 */
export const CONTEXT_FIELDS = [
  /** prod, preview or internal. */
  'env',
  /** mobile, tablet or desktop; empty on widget and MCP events. */
  'device',
  /** ENTRY_PAGE_KINDS: where the tab's visit started; /api/event stores nothing else. */
  'entry_page',
  /** search, ai, social, direct, internal or other, from the entry page's referrer. */
  'ref_type',
  /** Short commit hash of the build. */
  'version',
  /** SCHEMA_VERSION. */
  'schema',
  /** Event-specific: error class, cancel reason, 'hidden', WebGL support. */
  'detail',
] as const;

/** '2': sessions and load outcomes. '3': also the session totals (double11..double14). */
export const SCHEMA_VERSION = '3';

/** `value` of the example loads that count as samples, not as a person's own structure. */
export const EXAMPLE_LOADS: ReadonlySet<string> = new Set(['welcome_example', 'empty_example']);
/** Load sources that are a person's own structure (unless an example). */
export const REAL_LOAD_SOURCES: ReadonlySet<string> = new Set(['file', 'rcsb', 'pubchem', 'af', 'saved']);

export type EventProps = Partial<
  Record<(typeof STRING_FIELDS)[number] | (typeof CONTEXT_FIELDS)[number], string> &
    Record<(typeof NUMBER_FIELDS)[number], number>
>;

export interface EventPayload {
  e: EventName;
  p?: EventProps;
  /** Page type the event happened on: home, pdb, af, compound, share, embed, widget, other. */
  page?: string;
  /** Session id (a UUID): one per tab on the site, one per event in the widget. */
  sid?: string;
}

export function isEventName(value: unknown): value is EventName {
  return typeof value === 'string' && (EVENT_NAMES as readonly string[]).includes(value);
}

/** Page kinds an event can carry; /api/event stores anything else as ''. */
export const PAGE_KINDS = ['home', 'pdb', 'af', 'compound', 'share', 'embed', 'widget', 'other'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export function isPageKind(value: unknown): value is PageKind {
  return typeof value === 'string' && (PAGE_KINDS as readonly string[]).includes(value);
}

/** Classify a pathname into a coarse page type (no ids, so no free-form data is stored). */
export function pageKind(pathname: string): PageKind {
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

/**
 * Where a visit can start besides the app: the static pages built by
 * site/build (src/utils/track.ts reads the entry path public/entry.js stored).
 */
export const STATIC_ENTRY_KINDS = ['learn', 'tool', 'collection', 'compounds', 'info'] as const;
export const ENTRY_PAGE_KINDS = [...PAGE_KINDS, ...STATIC_ENTRY_KINDS] as const;
export type EntryPageKind = (typeof ENTRY_PAGE_KINDS)[number];

export function isEntryPageKind(value: unknown): value is EntryPageKind {
  return typeof value === 'string' && (ENTRY_PAGE_KINDS as readonly string[]).includes(value);
}

/** Tool pages (site/content/pages, kind 'tool'); a test keeps this list in step. */
export const TOOL_PATHS: ReadonlySet<string> = new Set([
  '/pdb-viewer',
  '/alphafold-viewer',
  '/mmcif-viewer',
  '/sdf-viewer',
  '/xyz-viewer',
  '/pymol-online-alternative',
  '/compare',
]);

const INFO_PATHS: ReadonlySet<string> = new Set(['/about', '/privacy', '/terms', '/support']);

/** Classify the page a visit started on: an app page kind, or a static page kind. */
export function entryPageKind(pathname: string): EntryPageKind {
  const app = pageKind(pathname);
  if (app !== 'other') return app;
  const path = normalizePath(pathname);
  if (path === '/learn' || path.startsWith('/learn/')) return 'learn';
  if (path === '/collections' || path.startsWith('/collections/')) return 'collection';
  if (path === '/compounds') return 'compounds';
  if (INFO_PATHS.has(path)) return 'info';
  if (TOOL_PATHS.has(path)) return 'tool';
  return 'other';
}
