/**
 * Browser error reporter: posts error reports to /api/log, a Pages Function
 * (functions/api/log.ts) that forwards them to the New Relic Log API.
 *
 * The New Relic key lives only in that Function (the Pages secret
 * NEW_RELIC_LICENSE_KEY), never in this bundle. Reports are trimmed here to
 * the limits in site/errorLog.ts, which the Function enforces too.
 *
 * On in production builds; VITE_ERROR_REPORTING=off turns it off (the chat
 * widget build does, since /api/log doesn't exist on the chat host's origin).
 */
import { FLUSH_AT_BYTES, LOG_ENDPOINT, MAX_MESSAGE, trimAttributes, type LogAttrs } from '../../site/errorLog';
import { beacon } from './beacon';

const ENABLED = import.meta.env.PROD && import.meta.env.VITE_ERROR_REPORTING !== 'off';
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

type SentEntry = Omit<LogEntry, 'attributes'> & { attributes: LogAttrs };

let buffer: SentEntry[] = [];
/** UTF-8 size of the buffered entries as JSON. */
let bufferBytes = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** Every error sent so far, by signature: its repeats not yet sent, and the last one of them. */
const seen = new Map<string, { repeats: number; last: { error: Error; attributes?: LogAttrs } }>();
let repeatsTimer: ReturnType<typeof setTimeout> | null = null;
let errorsSent = 0;

/**
 * Sends the buffer as the plain entry array (/api/log adds the common
 * attributes). While the page stays open, a plain fetch: sendBeacon and
 * keepalive fetch share one 64 KB budget per page, so two full batches in a
 * row would lose the second. Only the last send when the page is hidden or
 * unloads (`closing`) uses beacon(), which survives the page closing.
 */
function flush(closing = false): void {
  if (buffer.length === 0 || !ENABLED) return;

  const body = JSON.stringify(buffer);
  buffer = [];
  bufferBytes = 0;

  if (closing) {
    beacon(LOG_ENDPOINT, body, 'application/json');
    return;
  }
  try {
    void fetch(LOG_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body }).catch(() => {});
  } catch {
    // Error reporting must not cause errors.
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flush();
    flushTimer = null;
  }, FLUSH_INTERVAL_MS);
}

function enqueue(entry: LogEntry): void {
  if (!ENABLED) return;

  // Trimmed to the server's limits, and batches kept under the 64 KB that
  // /api/log and a closing page's beacon accept: a bigger one would be lost.
  const trimmed: SentEntry = { ...entry, message: entry.message.slice(0, MAX_MESSAGE), attributes: trimAttributes(entry.attributes) };
  // The limits count UTF-16 characters; escaping and UTF-8 can make the bytes
  // larger. A real entry is about 11 KB, so this skip only guards the batch.
  const size = new TextEncoder().encode(JSON.stringify(trimmed)).byteLength;
  if (size > FLUSH_AT_BYTES) return;
  if (buffer.length > 0 && bufferBytes + size > FLUSH_AT_BYTES) flush();

  buffer.push(trimmed);
  bufferBytes += size;

  if (buffer.length >= MAX_BUFFER_SIZE) {
    flush();
  } else {
    scheduleFlush();
  }
}

/** Queues one error, or a summary of its repeats, within the session cap. */
function sendError(err: Error, attributes?: LogAttrs, repeats = 0): void {
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
      url: window.location.href,
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
 * Report an error (through /api/log to New Relic).
 * Safe to call anywhere: a no-op when reporting is off (dev, tests, the widget).
 */
export function logError(error: Error | string, customAttributes?: LogAttrs): void {
  if (!ENABLED || errorsSent >= MAX_ERRORS_PER_SESSION) return;
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
  if (!ENABLED) return;

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

  // The page may be closing: the last send goes as a beacon. Batches that
  // sendRepeats() fills before it still go by plain fetch, so they don't use
  // up the beacon budget this one needs.
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      sendRepeats();
      flush(true);
    }
  });

  window.addEventListener('beforeunload', () => {
    sendRepeats();
    flush(true);
  });
}
