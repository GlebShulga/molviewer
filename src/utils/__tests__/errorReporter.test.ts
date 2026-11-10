import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface SentLog {
  message: string;
  level: string;
  attributes: Record<string, unknown>;
}

let fetchMock: ReturnType<typeof vi.fn>;
/** Listeners each fresh reporter adds to window, removed after the test. */
let added: [string, EventListenerOrEventListenerObject][] = [];

/** The module reads whether it's enabled at import, so each test imports it fresh. */
async function loadReporter() {
  vi.resetModules();
  return import('../errorReporter');
}

/**
 * Everything sent so far, without moving the clock. jsdom has no
 * navigator.sendBeacon, so every batch goes through the fetch fallback.
 */
function logsSoFar(): SentLog[] {
  return fetchMock.mock.calls.flatMap(([, init]) => JSON.parse((init as RequestInit).body as string) as SentLog[]);
}

/** Everything sent so far, after the pending flush timer has run (moves the clock 10 s). */
function sentLogs(): SentLog[] {
  vi.advanceTimersByTime(10_000);
  return logsSoFar();
}

function errorAt(message: string, line: number): Error {
  const err = new Error(message);
  err.stack = `Error: ${message}\n    at somewhere (app.js:${line}:1)`;
  return err;
}

function hideTab() {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
}

describe('errorReporter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('PROD', true);
    fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 202 })));
    vi.stubGlobal('fetch', fetchMock);
    const add = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
      added.push([type, listener]);
      add(type, listener, options);
    });
  });
  afterEach(() => {
    for (const [type, listener] of added) window.removeEventListener(type, listener);
    added = [];
    delete (document as { visibilityState?: string }).visibilityState;
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends the first occurrence at once, and its repeats as one summary a minute later', async () => {
    const { logError } = await loadReporter();
    for (let i = 0; i < 20; i++) logError(errorAt('render loop failed', 10));
    expect(sentLogs()).toHaveLength(1);

    vi.advanceTimersByTime(50_000);
    const logs = sentLogs();
    expect(logs).toHaveLength(2);
    expect(logs[0].attributes['error.repeats']).toBeUndefined();
    expect(logs[1].attributes['error.repeats']).toBe(19);
  });

  it('sends an endless loop as one entry a minute, losing and doubling no occurrence', async () => {
    const { logError } = await loadReporter();
    // Once a second for three minutes
    for (let t = 0; t < 180; t++) {
      logError(errorAt('render loop failed', 10));
      vi.advanceTimersByTime(1000);
    }
    const logs = sentLogs();
    expect(logs).toHaveLength(4);
    const repeats = logs.slice(1).map((l) => l.attributes['error.repeats'] as number);
    expect(repeats.reduce((a, b) => a + b, 0)).toBe(179);
  });

  it('sends the summary at once when the tab is hidden, and the next one a full minute later', async () => {
    const { logError, initErrorReporter } = await loadReporter();
    initErrorReporter();
    for (let i = 0; i < 3; i++) logError(errorAt('failed', 1));

    hideTab();
    let logs = logsSoFar();
    expect(logs).toHaveLength(2);
    expect(logs[1].attributes['error.repeats']).toBe(2);

    // The timer started before the hide is gone: a repeat 10 s later goes out
    // a minute after that repeat, not at the old timer's 60 s
    vi.advanceTimersByTime(10_000);
    logError(errorAt('failed', 1));
    vi.advanceTimersByTime(55_000);
    expect(logsSoFar()).toHaveLength(2);
    vi.advanceTimersByTime(10_000);
    logs = logsSoFar();
    expect(logs).toHaveLength(3);
    expect(logs[2].attributes['error.repeats']).toBe(1);
  });

  it('tells the same message apart by place, by caller, and by window.onerror file and line', async () => {
    const { logError, initErrorReporter } = await loadReporter();
    initErrorReporter();
    // Another place in the code (stack)
    logError(errorAt('failed', 1));
    logError(errorAt('failed', 2));
    // Another caller, same stack
    logError(errorAt('failed', 3), { source: 'A', op: 'x' });
    logError(errorAt('failed', 3), { source: 'A', op: 'y' });
    logError(errorAt('failed', 3), { source: 'B', op: 'x' });
    // The same caller with its attributes in another order is a repeat
    logError(errorAt('failed', 3), { op: 'x', source: 'A' });
    // A message-only window error: the reporter makes the Error in its own
    // listener, so only the file and line tell these apart. One dispatch line,
    // so the stacks match as in a browser (where a listener has no callers).
    const windowErrors: [string, number][] = [['a.js', 1], ['a.js', 2], ['b.js', 1], ['a.js', 1]];
    for (const [filename, lineno] of windowErrors) {
      window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.', filename, lineno }));
    }

    expect(sentLogs()).toHaveLength(8);
  });

  it('stops after a cap per session (summaries included), with one note, and no timer after it', async () => {
    const { logError } = await loadReporter();
    logError(errorAt('looping', 0));
    logError(errorAt('looping', 0));
    for (let i = 1; i < 200; i++) logError(errorAt(`error ${i}`, i));
    vi.advanceTimersByTime(60_000);
    // After the cap: neither counted nor timed
    logError(errorAt('looping', 0));
    logError(errorAt('error 1', 1));

    const logs = sentLogs();
    const errors = logs.filter((l) => l.level === 'ERROR');
    const notes = logs.filter((l) => l.level === 'WARN');
    expect(errors.length).toBe(50);
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toMatch(/cap/i);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sends nothing when reporting is off', async () => {
    vi.stubEnv('VITE_ERROR_REPORTING', 'off');
    const { logError } = await loadReporter();
    logError(errorAt('x', 1));
    expect(sentLogs()).toHaveLength(0);
  });

  it('sends nothing outside production builds', async () => {
    vi.stubEnv('PROD', false);
    const { logError } = await loadReporter();
    logError(errorAt('x', 1));
    expect(sentLogs()).toHaveLength(0);
  });

  it('posts the plain entries to /api/log, with no key, each with the page address', async () => {
    const { logError } = await loadReporter();
    logError(errorAt('a', 1), { source: 'test' });
    logError(errorAt('b', 2));
    const logs = sentLogs();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/log');
    expect(Object.keys(init.headers as Record<string, string>).map((h) => h.toLowerCase())).not.toContain('api-key');
    expect(logs).toHaveLength(2);
    for (const l of logs) expect(l.attributes.url).toBe(window.location.href);
    expect(logs[0].attributes.source).toBe('test');
  });

  it('sends by plain fetch while the page stays open, never touching the beacon budget', async () => {
    const beacon = vi.fn(() => true);
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { sendBeacon: beacon }));
    const { logError } = await loadReporter();
    // A burst that fills two full batches in one tick: in a browser the
    // second beacon would be refused (one 64 KB budget per page).
    for (let i = 0; i < 12; i++) {
      const err = new Error(`burst ${i}`);
      err.stack = `${i}`.repeat(4_000);
      logError(err, { componentStack: `c${i}`.repeat(2_000) });
    }
    expect(sentLogs()).toHaveLength(12);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    for (const [, init] of fetchMock.mock.calls) expect((init as RequestInit).keepalive).toBeUndefined();
    expect(beacon).not.toHaveBeenCalled();
  });

  it('sends the last batch as a beacon when the tab is hidden, and by keepalive fetch if it refuses', async () => {
    const beacon = vi.fn(() => true);
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { sendBeacon: beacon }));
    const { logError, initErrorReporter } = await loadReporter();
    initErrorReporter();
    logError(errorAt('a', 1));
    hideTab();
    expect(beacon).toHaveBeenCalledWith('/api/log', expect.any(Blob));
    expect(fetchMock).not.toHaveBeenCalled();

    beacon.mockReturnValue(false);
    logError(errorAt('b', 2));
    hideTab();
    expect(logsSoFar().map((l) => l.message)).toEqual(['b']);
    expect((fetchMock.mock.calls[0][1] as RequestInit).keepalive).toBe(true);
  });

  it('cuts a long stack to 4000 characters', async () => {
    const { logError } = await loadReporter();
    const err = new Error('deep');
    err.stack = 's'.repeat(10_000);
    logError(err);
    expect(sentLogs()[0].attributes['error.stack']).toHaveLength(4_000);
  });

  it('splits big batches by size, each request under 64 KB', async () => {
    const { logError } = await loadReporter();
    // Ten different errors (repeats of one would be merged into one entry)
    for (let i = 0; i < 10; i++) {
      const err = new Error(`big ${i}`);
      err.stack = `${i}`.repeat(5_000);
      logError(err, { componentStack: `c${i}`.repeat(3_000) });
    }
    const logs = sentLogs();
    expect(logs).toHaveLength(10);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new TextEncoder().encode((init as RequestInit).body as string).byteLength).toBeLessThan(65_536);
    }
  });
});
