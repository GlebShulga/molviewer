import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useMoleculeStore, temporalStore } from '../../../store/moleculeStore';
import { ShareButton } from '../ShareButton';

const reporter = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock('../../../utils/errorReporter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/errorReporter')>()),
  logError: reporter.logError,
}));

function addShareableStructure() {
  act(() => {
    useMoleculeStore.getState().addStructure(
      { name: '1CRN', atoms: [{ id: 0, element: 'C', x: 0, y: 0, z: 0 }], bonds: [] },
      '1CRN',
      { type: 'rcsb', id: '1CRN' }
    );
  });
}

async function shareWith(response: Response) {
  vi.stubGlobal('fetch', vi.fn(async () => response));
  render(<ShareButton />);
  fireEvent.click(screen.getByTitle('Create a shareable link to this view'));
}

describe('ShareButton errors', () => {
  beforeEach(() => {
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
    reporter.logError.mockClear();
    addShareableStructure();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the refusal on a pages.dev address (403) without reporting an error', async () => {
    await shareWith(new Response(JSON.stringify({ error: 'Sharing is not available on this address.' }), { status: 403 }));
    expect(await screen.findByText('Sharing is not available on this address.')).toBeTruthy();
    expect(reporter.logError).not.toHaveBeenCalled();
  });

  it('shows a readable message for a rate-limit block (429 HTML) without reporting an error', async () => {
    await shareWith(new Response('<html>blocked</html>', { status: 429, headers: { 'content-type': 'text/html' } }));
    expect(await screen.findByText('Too many share links in a short time. Try again in a few seconds.')).toBeTruthy();
    expect(reporter.logError).not.toHaveBeenCalled();
  });

  it("reports Cloudflare's own 403 page (WAF, bot protection)", async () => {
    await shareWith(new Response('<html>Access denied</html>', { status: 403, headers: { 'content-type': 'text/html' } }));
    expect(await screen.findByText('Share request failed (403)')).toBeTruthy();
    expect(reporter.logError).toHaveBeenCalled();
  });

  it("reports Cloudflare's own 503 page (platform outage)", async () => {
    await shareWith(new Response('<html>Service unavailable</html>', { status: 503, headers: { 'content-type': 'text/html' } }));
    expect(await screen.findByText('Share request failed (503)')).toBeTruthy();
    expect(reporter.logError).toHaveBeenCalled();
  });

  it('still reports unexpected failures', async () => {
    await shareWith(new Response(JSON.stringify({ error: 'Invalid share payload' }), { status: 400 }));
    expect(await screen.findByText('Invalid share payload')).toBeTruthy();
    expect(reporter.logError).toHaveBeenCalled();
  });
});
