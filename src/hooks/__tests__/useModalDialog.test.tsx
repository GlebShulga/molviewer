import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { useModalDialog } from '../useModalDialog';

function Harness({ onClose = () => {}, onInnerKey = () => {} }: { onClose?: () => void; onInnerKey?: () => void }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogProps = useModalDialog({
    isOpen: open,
    onClose: () => {
      onClose();
      setOpen(false);
    },
    initialFocusRef: closeRef,
  });
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <dialog {...dialogProps} aria-label="Test dialog">
          <p>Some text</p>
          <button ref={closeRef} onKeyDown={onInnerKey} onClick={() => setOpen(false)}>
            Close
          </button>
        </dialog>
      )}
    </>
  );
}

function openDialog(props: Parameters<typeof Harness>[0] = {}) {
  render(<Harness {...props} />);
  const opener = screen.getByText('Open');
  opener.focus();
  fireEvent.click(opener);
  return { opener, dialog: screen.getByRole('dialog') as HTMLDialogElement };
}

describe('useModalDialog', () => {
  const windowKeys = vi.fn();
  afterEach(() => {
    window.removeEventListener('keydown', windowKeys);
    windowKeys.mockReset();
  });

  it('opens a native dialog modally and focuses the initial element', () => {
    const { dialog } = openDialog();
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(screen.getByText('Close'));
  });

  it("calls onClose once when the browser closes it (Escape, back gesture)", () => {
    const onClose = vi.fn();
    const { dialog } = openDialog({ onClose });
    act(() => dialog.close());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not call onClose when React closes it', () => {
    const onClose = vi.fn();
    openDialog({ onClose });
    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps keys pressed in it from the app's window listeners, but not from handlers inside", () => {
    const onInnerKey = vi.fn();
    const { dialog } = openDialog({ onInnerKey });
    window.addEventListener('keydown', windowKeys);

    fireEvent.keyDown(screen.getByText('Close'), { key: 'Escape' });
    fireEvent.keyDown(screen.getByText('Close'), { key: '?' });
    expect(onInnerKey).toHaveBeenCalledTimes(2);

    // Clicking text in it focuses the dialog itself; keys then start there
    fireEvent.keyDown(dialog, { key: '1' });
    expect(windowKeys).not.toHaveBeenCalled();
  });

  it('takes focus itself when text in it is clicked (tabIndex -1)', () => {
    const { dialog } = openDialog();
    expect(dialog.tabIndex).toBe(-1);
  });

  it('closes on a backdrop click, not on a click inside', () => {
    const onClose = vi.fn();
    const { dialog } = openDialog({ onClose });
    // jsdom lays nothing out: every box is 0x0 at 0,0
    fireEvent.click(screen.getByText('Some text'), { clientX: 50, clientY: 50 });
    fireEvent.click(dialog, { clientX: 0, clientY: 0 });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(dialog, { clientX: 50, clientY: 50 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('returns focus to what had it when it opened', () => {
    const { opener, dialog } = openDialog();
    act(() => dialog.close());
    expect(document.activeElement).toBe(opener);
  });
});
