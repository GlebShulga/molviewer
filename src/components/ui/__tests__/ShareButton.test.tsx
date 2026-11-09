import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useMoleculeStore, temporalStore } from '../../../store/moleculeStore';
import { ShareButton } from '../ShareButton';
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts';

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

function ShareWithShortcuts() {
  useKeyboardShortcuts();
  return <ShareButton />;
}

describe('ShareButton modal', () => {
  let structureId: string;

  beforeEach(() => {
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
    act(() => {
      structureId = useMoleculeStore.getState().addStructure(
        { name: '1CRN', atoms: [{ id: 0, element: 'C', x: 0, y: 0, z: 0 }], bonds: [] },
        '1CRN',
        { type: 'rcsb', id: '1CRN' }
      );
      useMoleculeStore.getState().selectAtom(structureId, 0);
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  function openModal(response: Promise<Response>) {
    vi.stubGlobal('fetch', vi.fn(() => response));
    render(<ShareWithShortcuts />);
    const button = screen.getByTitle('Create a shareable link to this view');
    button.focus();
    fireEvent.click(button);
    return button;
  }

  /** Escape as the browser handles it: the key goes to the dialog, then the browser closes it. */
  function pressEscape(dialog: HTMLElement) {
    fireEvent.keyDown(dialog, { key: 'Escape' });
    act(() => (dialog as HTMLDialogElement).close());
  }

  it('is a native dialog, opened modally and labelled by its title', async () => {
    openModal(Promise.resolve(new Response(JSON.stringify({ id: 'abc' }), { status: 200 })));
    const dialog = (await screen.findByRole('dialog')) as HTMLDialogElement;
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog.open).toBe(true);
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Share this session');
  });

  it('closes on Escape without clearing the selection, and focus returns to the Share button', async () => {
    const button = openModal(Promise.resolve(new Response(JSON.stringify({ id: 'abc' }), { status: 200 })));
    const dialog = await screen.findByRole('dialog');
    await screen.findByDisplayValue(/\/s\/abc$/);

    pressEscape(dialog);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useMoleculeStore.getState().selectedAtoms).toEqual([{ structureId, atomIndex: 0 }]);
    expect(document.activeElement).toBe(button);
  });

  it('returns focus to the Share button when closed while the link is still being created', async () => {
    let resolve!: (r: Response) => void;
    const button = openModal(new Promise<Response>(r => { resolve = r; }));
    const dialog = await screen.findByRole('dialog');
    expect(screen.getAllByText('Creating link…').length).toBeGreaterThan(0);

    pressEscape(dialog);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
    // Still focusable while creating, and clicks are ignored
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => {
      resolve(new Response(JSON.stringify({ id: 'abc' }), { status: 200 }));
    });
  });

  it('keeps touches inside the modal from reaching the sheet behind it', async () => {
    const onTouchStart = vi.fn();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    render(
      <aside onTouchStart={onTouchStart}>
        <ShareButton />
      </aside>
    );
    fireEvent.click(screen.getByTitle('Create a shareable link to this view'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.touchStart(dialog, { touches: [{ clientY: 10 }] });
    expect(onTouchStart).not.toHaveBeenCalled();
  });
});
