import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type RefObject } from 'react';

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

/** Props for the `<dialog>` element; spread them onto it. */
export interface ModalDialogProps {
  ref: RefObject<HTMLDialogElement | null>;
  tabIndex: -1;
  onKeyDown: (e: KeyboardEvent<HTMLDialogElement>) => void;
  onClick: (e: MouseEvent<HTMLDialogElement>) => void;
}

/**
 * A native modal `<dialog>`, rendered only while `isOpen`. The browser opens
 * it with `showModal()` and supplies the rest: the top layer (no z-index),
 * the page behind made inert, Tab kept inside, Escape to close.
 *
 * - Any close by the browser (Escape, Android's back gesture) calls `onClose`,
 *   so React state follows. Focus goes back out on close, however it closes.
 * - Keys pressed in the dialog stop at it: the app's own listeners on window
 *   and document (shortcuts, the sidebar's Escape, the context menu) never
 *   see them, while handlers inside the dialog still run. The dialog itself
 *   takes focus (tabIndex -1) when text in it is clicked, so those keys start
 *   in it too, not on <body>.
 * - A click on the backdrop closes it.
 *
 * Two capture listeners run before React and are not stopped: the Toolbar
 * menu's on document (only while that menu is open) and SpotlightTour's.
 */
export function useModalDialog({
  isOpen,
  onClose,
  initialFocusRef,
  returnFocusRef,
}: ModalDialogOptions): ModalDialogProps {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const returnTarget = returnFocusRef?.current ?? document.activeElement;
    const handleClose = () => onCloseRef.current();
    dialog.addEventListener('close', handleClose);
    if (!dialog.open) dialog.showModal();
    initialFocusRef?.current?.focus();
    return () => {
      // Off first: closing it here is React's doing, not news for onClose
      dialog.removeEventListener('close', handleClose);
      if (dialog.open) dialog.close();
      if (returnTarget instanceof HTMLElement && returnTarget.isConnected) returnTarget.focus();
    };
  }, [isOpen, initialFocusRef, returnFocusRef]);

  return {
    ref: dialogRef,
    tabIndex: -1,
    onKeyDown: (e) => e.stopPropagation(),
    onClick: (e) => {
      // The backdrop counts as the dialog itself, outside its box. Checking
      // the box, not just the target, keeps clicks on its padding inside.
      const dialog = e.currentTarget;
      if (e.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      const inside = e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
      if (!inside) onCloseRef.current();
    },
  };
}
