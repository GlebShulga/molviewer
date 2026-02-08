import { useEffect } from 'react';
import { X } from 'lucide-react';
import { KEYBOARD_SHORTCUTS } from '../../hooks/useKeyboardShortcuts';
import styles from './ShortcutsHelp.module.css';

export interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsHelp({ isOpen, onClose }: ShortcutsHelpProps) {
  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    // Use capture phase to intercept ESC before other handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Keyboard Shortcuts</h2>
          <button className={styles.modalClose} onClick={onClose} aria-label="Close">
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
