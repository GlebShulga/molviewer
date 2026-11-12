/**
 * Anonymous product events (see site/events.ts). Fire-and-forget: tracking
 * must never break or slow down the app. Disabled in development and tests.
 *
 * Sessions (schema 2): the site's events of one browser tab share a random id
 * kept in sessionStorage under SESSION_KEY, with the entry page, the referring
 * host, the start time, an event counter and the funnel totals (schema 3). The static pages write the first
 * three (public/entry.js); the app adds the rest in startTrackingSession(),
 * called once from src/main.tsx. The chat widget never calls it: its events get
 * a new id each and carry no device or entry. A visitor can turn all of this
 * off on /privacy (OPT_OUT_KEY), and `?internal=1` marks the owner's browsers.
 */
import {
  CROSS_ORIGIN_EVENTS,
  entryPageKind,
  EXAMPLE_LOADS,
  pageKind,
  REAL_LOAD_SOURCES,
  SCHEMA_VERSION,
  type EventName,
  type EventProps,
  type EventPayload,
} from '../../site/events';
import { SITE_ORIGIN } from '../../site/nav';
import { beacon } from './beacon';

export type { EventName, EventProps };

/** Keep these three names in step with public/entry.js. */
const SESSION_KEY = 'mv-session';
const OPT_OUT_KEY = 'mv-analytics-off';
const INTERNAL_KEY = 'mv-internal';

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
 * A count to two significant figures (4,782 -> 4,800): enough to tell a ligand
 * from a large protein, too coarse to recognise someone's file. Used for atom
 * counts and file sizes.
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

interface SessionRecord {
  /** Path of the first page of the tab's visit. */
  entry: string;
  /** Host of that page's referrer ('' when none). */
  ref: string;
  /** Date.now() on that page. */
  start: number;
  id?: string;
  /** Events sent so far. */
  seq?: number;
  /** Running totals for the funnel, sent with every event (sessionTotals). */
  totals?: SessionTotals;
}

type SessionTotals = Record<'samples' | 'real_loads' | 'pickers' | 'failures', number>;

const NO_TOTALS: SessionTotals = { samples: 0, real_loads: 0, pickers: 0, failures: 0 };

/**
 * The session's totals after `event`: a person's loads split into examples
 * and their own structures, file picker openings and failed loads. Sent with
 * every event, so the funnel survives rows Analytics Engine drops.
 */
export function sessionTotals(before: SessionTotals, event: EventName, props: EventProps): SessionTotals {
  const t = { ...before };
  if (event === 'file_picker_opened') t.pickers += 1;
  if (props.user !== 1) return t;
  if (event === 'structure_load_failed') t.failures += 1;
  if (event === 'structure_loaded') {
    if (props.source === 'sample' || EXAMPLE_LOADS.has(props.value ?? '')) t.samples += 1;
    else if (REAL_LOAD_SOURCES.has(props.source ?? '')) t.real_loads += 1;
  }
  return t;
}

function readTotals(value: unknown): SessionTotals {
  const v = (value ?? {}) as Partial<Record<keyof SessionTotals, unknown>>;
  const n = (x: unknown) => (typeof x === 'number' && x >= 0 ? x : 0);
  return { samples: n(v.samples), real_loads: n(v.real_loads), pickers: n(v.pickers), failures: n(v.failures) };
}

/** Whether startTrackingSession() ran: only the site's own pages have a session. */
let sessionActive = false;
/** Used when sessionStorage throws (a sandboxed iframe, blocked storage). */
let memorySession: SessionRecord | null = null;
let listeningForHide = false;

function readSession(): SessionRecord | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return memorySession;
    const r = JSON.parse(raw) as Partial<SessionRecord> | null;
    if (!r || typeof r.entry !== 'string' || typeof r.start !== 'number') return memorySession;
    return {
      entry: r.entry,
      ref: typeof r.ref === 'string' ? r.ref : '',
      start: r.start,
      id: r.id,
      seq: r.seq,
      totals: readTotals(r.totals),
    };
  } catch {
    return memorySession;
  }
}

function writeSession(r: SessionRecord): void {
  memorySession = r;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(r));
  } catch {
    // The in-memory copy carries on.
  }
}

/** Deletes this tab's session record (the visitor opted out). */
function forgetSession(): void {
  memorySession = null;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing stored there.
  }
}

function localFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function setLocalFlag(key: string, on: boolean): void {
  try {
    if (on) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  } catch {
    // Storage blocked: the flag just doesn't stick.
  }
}

/** A random v4 UUID (crypto.randomUUID is missing on older Safari and outside secure contexts). */
export function newSessionId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Host of a referrer URL, '' when there is none or it doesn't parse. */
export function referrerHost(referrer: string): string {
  if (!referrer) return '';
  try {
    return new URL(referrer).hostname;
  } catch {
    return '';
  }
}

// Google: only the search hosts (www.google.*, and Scholar), not its other
// apps; links from Gmail or Docs pass through www.google.com/url anyway.
const SEARCH_HOSTS =
  /^((www\.)?google\.[a-z.]+|scholar\.google\.[a-z.]+)$|(^|\.)(bing\.com|duckduckgo\.com|ecosia\.org|yahoo\.com|baidu\.com|yandex\.[a-z.]+)$/;
const AI_HOSTS =
  /(^|\.)(chatgpt\.com|chat\.openai\.com|gemini\.google\.com|notebooklm\.google\.com|perplexity\.ai|copilot\.microsoft\.com|claude\.ai)$/;
const SOCIAL_HOSTS = /(^|\.)(reddit\.com|x\.com|t\.co|twitter\.com|linkedin\.com|lnkd\.in|facebook\.com|bsky\.app)$/;

/** Sort a referrer host into a coarse type, so no host is stored. */
export function referrerType(host: string, ownHost: string): 'search' | 'ai' | 'social' | 'direct' | 'internal' | 'other' {
  const h = host.toLowerCase();
  if (!h) return 'direct';
  if (h === ownHost.toLowerCase()) return 'internal';
  if (AI_HOSTS.test(h)) return 'ai';
  if (SEARCH_HOSTS.test(h)) return 'search';
  if (SOCIAL_HOSTS.test(h)) return 'social';
  return 'other';
}

/** mobile, tablet or desktop: a touch screen and the viewport's short side. */
function deviceClass(): 'mobile' | 'tablet' | 'desktop' {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  if (!coarse) return 'desktop';
  return Math.min(window.innerWidth, window.innerHeight) < 600 ? 'mobile' : 'tablet';
}

/** The owner's browsers (?internal=1), preview deployments, or production. */
function environment(): 'prod' | 'preview' | 'internal' {
  if (localFlag(INTERNAL_KEY)) return 'internal';
  // The widget runs on the chat host's origin: judge by where its events go
  const host = new URL(config.endpoint, window.location.href).hostname;
  return host === new URL(SITE_ORIGIN).hostname ? 'prod' : 'preview';
}

function webglSupport(): 'webgl2' | 'webgl1' | 'none' {
  try {
    const canvas = document.createElement('canvas');
    for (const [type, label] of [['webgl2', 'webgl2'], ['webgl', 'webgl1']] as const) {
      const gl = canvas.getContext(type) as WebGLRenderingContext | null;
      if (gl) {
        // Give the context back at once: browsers allow only a few
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return label;
      }
    }
  } catch {
    // Treated as no WebGL.
  }
  return 'none';
}

function disabled(): boolean {
  return import.meta.env.DEV || typeof window === 'undefined';
}

/**
 * `?internal=1` marks this browser as the owner's (env = internal) until
 * `?internal=0`; read before the address-bar sync drops the parameter.
 */
function readInternalParam(): void {
  const value = new URLSearchParams(window.location.search).get('internal');
  if (value === '1' || value === '0') setLocalFlag(INTERNAL_KEY, value === '1');
}

/**
 * Starts (or continues) the tab's session. Called once from src/main.tsx
 * before the first render; never from the widget, which writes nothing to
 * sessionStorage. Stores the entry page, referrer and start time if the tab
 * has none yet (a visit that starts in the app), and sends session_start for
 * a tab that hasn't sent an event yet.
 */
export function startTrackingSession(): void {
  if (disabled()) return;
  try {
    readInternalParam();
    if (localFlag(OPT_OUT_KEY)) {
      // A static page of this tab may have stored the entry before the opt-out
      forgetSession();
      return;
    }
    const r = readSession() ?? { entry: ENTRY_PATH, ref: referrerHost(document.referrer), start: Date.now() };
    if (!r.id) r.id = newSessionId();
    if (typeof r.seq !== 'number' || !(r.seq >= 0)) r.seq = 0;
    writeSession(r);
    sessionActive = true;
    if (r.seq === 0) track('session_start', { detail: webglSupport() });
    if (!listeningForHide) {
      listeningForHide = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') track('session_hidden');
      });
    }
  } catch {
    // Tracking is best effort.
  }
}

/** The fields every event carries, and the session id. */
function context(event: EventName, eventProps: EventProps): { sid: string; props: EventProps } {
  const props: EventProps = {
    env: environment(),
    version: String(import.meta.env.VITE_APP_VERSION ?? ''),
    schema: SCHEMA_VERSION,
    webdriver: navigator.webdriver ? 1 : 0,
  };
  if (!sessionActive) return { sid: newSessionId(), props };

  // Re-read: another page of this tab may have counted events since
  const r = readSession() ?? { entry: ENTRY_PATH, ref: referrerHost(document.referrer), start: Date.now() };
  if (!r.id) r.id = newSessionId();
  r.seq = (typeof r.seq === 'number' && r.seq >= 0 ? r.seq : 0) + 1;
  r.totals = sessionTotals(r.totals ?? NO_TOTALS, event, eventProps);
  writeSession(r);
  return {
    sid: r.id,
    props: {
      ...props,
      device: deviceClass(),
      entry_page: entryPageKind(r.entry),
      ref_type: referrerType(r.ref, window.location.hostname),
      seq: r.seq,
      elapsed: Math.max(0, Date.now() - r.start),
      ...r.totals,
    },
  };
}

export function track(event: EventName, props?: EventProps): void {
  if (disabled()) return;
  const sameOrigin = config.endpoint.startsWith('/');
  // The widget shares components (and so events) with the site, but another
  // origin may only post the widget's own events: the rest would get a 403.
  if (!sameOrigin && !CROSS_ORIGIN_EVENTS.has(event)) return;
  try {
    // Read every time: the toggle on /privacy may have changed it in another tab,
    // which can clear only its own session storage. Clear this tab's here.
    if (localFlag(OPT_OUT_KEY)) {
      forgetSession();
      return;
    }
    const { sid, props: ctx } = context(event, props ?? {});
    const payload: EventPayload = { e: event, p: { ...props, ...ctx }, page: config.page ?? pageKind(window.location.pathname), sid };
    const body = JSON.stringify(payload);
    // Same origin: JSON. Cross-origin: text/plain, a "simple" request that needs no CORS preflight.
    beacon(config.endpoint, body, sameOrigin ? 'application/json' : 'text/plain');
  } catch {
    // Tracking is best effort.
  }
}

/** For tests: forget the session state of this module. */
export function resetTrackingForTests(): void {
  sessionActive = false;
  memorySession = null;
}
