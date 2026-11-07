import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface ModalDialogOptions {
  isOpen: boolean;
  onClose: () => void;
  /** Focused when the dialog opens. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Focused when the dialog closes. Without it, focus goes back to whatever
   * had it when the dialog opened.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Keyboard behaviour of a modal dialog: focus moves in on open and back out
 * on close (however it closes), Escape closes it without reaching the app's
 * own shortcuts, and Tab stays inside. Returns the ref for the dialog element.
 */
export function useModalDialog<T extends HTMLElement = HTMLDivElement>({
  isOpen,
  onClose,
  initialFocusRef,
  returnFocusRef,
}: ModalDialogOptions): RefObject<T | null> {
  const dialogRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus in on open, back out on close or unmount
  useEffect(() => {
    if (!isOpen) return;
    const returnTarget = returnFocusRef?.current ?? document.activeElement;
    // The dialog renders in the same commit; wait a frame so it is laid out
    const frame = requestAnimationFrame(() => initialFocusRef?.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      if (returnTarget instanceof HTMLElement && returnTarget.isConnected) returnTarget.focus();
    };
  }, [isOpen, initialFocusRef, returnFocusRef]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // Capture phase on window runs first, so this keeps Escape from also
        // clearing the selection or closing the sidebar
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        const inside = dialogRef.current.contains(active);
        if (e.shiftKey) {
          if (active === first || !inside) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !inside) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen]);

  return dialogRef;
}
