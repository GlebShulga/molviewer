import { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { KEYBOARD_SHORTCUTS } from '../../hooks/useKeyboardShortcuts';
import styles from './ShortcutsHelp.module.css';

export interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsHelp({ isOpen, onClose }: ShortcutsHelpProps) {
  const previousFocusRef = useRef<Element | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Save previous focus and focus close button on open
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      // Small delay to ensure the modal is rendered
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Restore focus on close
  const handleClose = useCallback(() => {
    onClose();
    if (previousFocusRef.current instanceof HTMLElement) {
      previousFocusRef.current.focus();
    }
  }, [onClose]);

  // Handle ESC key and focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
        return;
      }

      // Focus trap: intercept Tab
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    // Use capture phase to intercept ESC before other handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div
        ref={modalRef}
        className={styles.modalContent}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Keyboard Shortcuts</h2>
          <button
            ref={closeButtonRef}
            className={styles.modalClose}
            onClick={handleClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.shortcutsSection}>
            <h3 className={styles.sectionTitle}>Representations</h3>
            <div className={styles.shortcutsList}>
              {KEYBOARD_SHORTCUTS.filter((s) =>
                ['1', '2', '3'].includes(s.key)
              ).map((shortcut) => (
                <div key={shortcut.key} className={styles.shortcutRow}>
                  <kbd className={styles.shortcutKey}>{shortcut.key}</kbd>
                  <span className={styles.shortcutDesc}>{shortcut.description}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.shortcutsSection}>
            <h3 className={styles.sectionTitle}>Measurements</h3>
            <div className={styles.shortcutsList}>
              {KEYBOARD_SHORTCUTS.filter((s) =>
                ['D', 'A'].includes(s.key)
              ).map((shortcut) => (
                <div key={shortcut.key} className={styles.shortcutRow}>
                  <kbd className={styles.shortcutKey}>{shortcut.key}</kbd>
                  <span className={styles.shortcutDesc}>{shortcut.description}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.shortcutsSection}>
            <h3 className={styles.sectionTitle}>View & General</h3>
            <div className={styles.shortcutsList}>
              {KEYBOARD_SHORTCUTS.filter((s) =>
                ['H', 'Ctrl+S', '?', 'Esc'].includes(s.key)
              ).map((shortcut) => (
                <div key={shortcut.key} className={styles.shortcutRow}>
                  <kbd className={styles.shortcutKey}>{shortcut.key}</kbd>
                  <span className={styles.shortcutDesc}>{shortcut.description}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
