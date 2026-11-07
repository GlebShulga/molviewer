import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface SentLog {
  message: string;
  level: string;
  attributes: Record<string, unknown>;
}

let fetchMock: ReturnType<typeof vi.fn>;

/** The module reads its license key at import, so each test imports it fresh. */
async function loadReporter() {
  vi.resetModules();
  return import('../errorReporter');
}

/** Everything sent so far, after the pending flush timer has run. */
function sentLogs(): SentLog[] {
  vi.advanceTimersByTime(10_000);
  return fetchMock.mock.calls.flatMap(([, init]) =>
    (JSON.parse((init as RequestInit).body as string) as { logs: SentLog[] }[]).flatMap((p) => p.logs)
  );
}

function errorAt(message: string, line: number): Error {
  const err = new Error(message);
  err.stack = `Error: ${message}\n    at somewhere (app.js:${line}:1)`;
  return err;
}

describe('errorReporter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_NEW_RELIC_LICENSE_KEY', 'test-key');
    fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 202 })));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends a repeated error once per window, then with the count of repeats', async () => {
    const { logError } = await loadReporter();
    for (let i = 0; i < 20; i++) logError(errorAt('render loop failed', 10));
    expect(sentLogs()).toHaveLength(1);

    vi.advanceTimersByTime(60_000);
    logError(errorAt('render loop failed', 10));
    const logs = sentLogs();
    expect(logs).toHaveLength(2);
    expect(logs[1].attributes['error.repeats']).toBe(19);
  });

  it('treats the same message from another place as a different error', async () => {
    const { logError } = await loadReporter();
    logError(errorAt('failed', 1));
    logError(errorAt('failed', 2));
    expect(sentLogs()).toHaveLength(2);
  });

  it('stops after a cap per session, with one note that it did', async () => {
    const { logError } = await loadReporter();
    for (let i = 0; i < 200; i++) logError(errorAt(`error ${i}`, i));
    const logs = sentLogs();
    const errors = logs.filter((l) => l.level === 'ERROR');
    const notes = logs.filter((l) => l.level === 'WARN');
    expect(errors.length).toBe(50);
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toMatch(/cap/i);
  });

  it('sends nothing without a license key', async () => {
    vi.stubEnv('VITE_NEW_RELIC_LICENSE_KEY', '');
    const { logError } = await loadReporter();
    logError(errorAt('x', 1));
    expect(sentLogs()).toHaveLength(0);
  });
});
