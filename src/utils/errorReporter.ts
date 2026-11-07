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
/** The same error (message and stack) is sent at most once per window... */
const REPEAT_WINDOW_MS = 60_000;
/** ...and a session sends at most this many errors, so a loop can't flood the log. */
const MAX_ERRORS_PER_SESSION = 50;

interface LogEntry {
  message: string;
  level: 'ERROR' | 'WARN';
  timestamp: number;
  attributes: Record<string, string | number | boolean | undefined>;
}

let buffer: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** Per error: when it was last sent, and how often it occurred since without being sent. */
const recent = new Map<string, { sentAt: number; repeats: number }>();
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

/**
 * Report an error to New Relic Log API.
 * Safe to call even if New Relic is not configured (no-ops gracefully).
 */
export function logError(
  error: Error | string,
  customAttributes?: Record<string, string | number | boolean>
): void {
  if (!isEnabled()) return;
  const err = typeof error === 'string' ? new Error(error) : error;
  const now = Date.now();

  const signature = `${err.message}\n${err.stack ?? ''}`;
  const seen = recent.get(signature);
  if (seen && now - seen.sentAt < REPEAT_WINDOW_MS) {
    seen.repeats++;
    return;
  }

  if (errorsSent >= MAX_ERRORS_PER_SESSION) return;
  errorsSent++;
  recent.set(signature, { sentAt: now, repeats: 0 });

  enqueue({
    message: err.message,
    level: 'ERROR',
    timestamp: now,
    attributes: {
      'error.name': err.name,
      'error.stack': err.stack ?? 'no stack',
      // Occurrences since this error was last sent
      ...(seen?.repeats ? { 'error.repeats': seen.repeats } : {}),
      ...customAttributes,
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
      flush();
    }
  });

  window.addEventListener('beforeunload', () => {
    flush();
  });
}
