/**
 * New Relic Log API error reporter.
 *
 * The license key is a browser ingest key (BROWSER type) that is intentionally
 * bundled into client-side code. Its scope is limited to writing log data only —
 * it cannot read, query, or delete any New Relic data.
 */
const LOG_API_URL = 'https://log-api.eu.newrelic.com/log/v1';
const LICENSE_KEY = import.meta.env.VITE_NEW_RELIC_LICENSE_KEY ?? '';
const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 10;
/**
 * An error is sent the first time it occurs. Its repeats are counted, and
 * every error with repeats goes out as one summary (`error.repeats`) when
 * this shared timer runs, or at once when the tab is hidden or closed...
 */
const REPEATS_INTERVAL_MS = 60_000;
/** ...and a session sends at most this many errors (summaries included), so a loop can't flood the log. */
const MAX_ERRORS_PER_SESSION = 50;

interface LogEntry {
  message: string;
  level: 'ERROR' | 'WARN';
  timestamp: number;
  attributes: Record<string, string | number | boolean | undefined>;
}

type Attributes = Record<string, string | number | boolean>;

let buffer: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** Every error sent so far, by signature: its repeats not yet sent, and the last one of them. */
const seen = new Map<string, { repeats: number; last: { error: Error; attributes?: Attributes } }>();
let repeatsTimer: ReturnType<typeof setTimeout> | null = null;
let errorsSent = 0;

function isEnabled(): boolean {
  return LICENSE_KEY.length > 0;
}

function flush(): void {
  if (buffer.length === 0 || !isEnabled()) return;

  const payload = [
    {
      common: {
        attributes: {
          logtype: 'browser',
          application: 'MolViewer',
          environment: import.meta.env.MODE,
          url: window.location.href,
          userAgent: navigator.userAgent,
        },
      },
      logs: buffer.map((entry) => ({
        message: entry.message,
        level: entry.level,
        timestamp: entry.timestamp,
        attributes: entry.attributes,
      })),
    },
  ];

  fetch(LOG_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': LICENSE_KEY,
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Silently fail — error reporting must not cause errors
  });

  buffer = [];
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flush();
    flushTimer = null;
  }, FLUSH_INTERVAL_MS);
}

function enqueue(entry: LogEntry): void {
  if (!isEnabled()) return;

  buffer.push(entry);

  if (buffer.length >= MAX_BUFFER_SIZE) {
    flush();
  } else {
    scheduleFlush();
  }
}

/** Queues one error, or a summary of its repeats, within the session cap. */
function sendError(err: Error, attributes?: Attributes, repeats = 0): void {
  if (errorsSent >= MAX_ERRORS_PER_SESSION) return;
  errorsSent++;
  const now = Date.now();

  enqueue({
    message: err.message,
    level: 'ERROR',
    timestamp: now,
    attributes: {
      'error.name': err.name,
      'error.stack': err.stack ?? 'no stack',
      // Occurrences since this error was last sent
      ...(repeats ? { 'error.repeats': repeats } : {}),
      ...attributes,
    },
  });

  if (errorsSent === MAX_ERRORS_PER_SESSION) {
    enqueue({
      message: `Error report cap reached (${MAX_ERRORS_PER_SESSION}); further errors in this session are not sent`,
      level: 'WARN',
      timestamp: now,
      attributes: {},
    });
  }
}

/**
 * One summary for each error that repeated since it was last sent. Runs on
 * the shared timer, and when the tab is hidden or closed. A loop that keeps
 * failing while the tab is often switched away from sends a summary on each
 * hide, so it reaches the cap sooner; each of those still has its real count.
 */
function sendRepeats(): void {
  if (repeatsTimer) clearTimeout(repeatsTimer);
  repeatsTimer = null;
  for (const entry of seen.values()) {
    if (entry.repeats === 0) continue;
    sendError(entry.last.error, entry.last.attributes, entry.repeats);
    entry.repeats = 0;
  }
}

/**
 * Report an error to New Relic Log API.
 * Safe to call even if New Relic is not configured (no-ops gracefully).
 */
export function logError(error: Error | string, customAttributes?: Attributes): void {
  if (!isEnabled() || errorsSent >= MAX_ERRORS_PER_SESSION) return;
  const err = typeof error === 'string' ? new Error(error) : error;

  // Message, stack and the caller's attributes (sorted). Each call site passes
  // the same ones every time (source, op, a window.onerror's file and line),
  // so an error without stack frames, or made in a listener, is still told
  // apart by where it came from.
  const attributesKey = customAttributes ? JSON.stringify(customAttributes, Object.keys(customAttributes).sort()) : '';
  const signature = [err.message, err.stack ?? '', attributesKey].join('\n');

  const known = seen.get(signature);
  if (known) {
    known.repeats++;
    known.last = { error: err, attributes: customAttributes };
    repeatsTimer ??= setTimeout(sendRepeats, REPEATS_INTERVAL_MS);
    return;
  }
  seen.set(signature, { repeats: 0, last: { error: err, attributes: customAttributes } });
  sendError(err, customAttributes);
}

/**
 * Initialize global error handlers.
 * Call once at app startup before React renders.
 */
export function initErrorReporter(): void {
  if (!isEnabled()) return;

  window.addEventListener('error', (event) => {
    logError(
      event.error instanceof Error ? event.error : new Error(event.message),
      {
        source: 'window.onerror',
        filename: event.filename ?? 'unknown',
        lineno: event.lineno ?? 0,
        colno: event.colno ?? 0,
      }
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    const error =
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));
    logError(error, { source: 'unhandledrejection' });
  });

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      sendRepeats();
      flush();
    }
  });

  window.addEventListener('beforeunload', () => {
    sendRepeats();
    flush();
  });
}
