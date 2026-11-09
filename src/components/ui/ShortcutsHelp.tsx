import { useRef } from 'react';
import { X } from 'lucide-react';
import { KEYBOARD_SHORTCUTS } from '../../hooks/useKeyboardShortcuts';
import { useModalDialog } from '../../hooks/useModalDialog';
import styles from './ShortcutsHelp.module.css';

/** Keys of KEYBOARD_SHORTCUTS by section, in display order. */
const SECTION_KEYS: { title: string; keys: string[] }[] = [
  { title: 'Representations', keys: ['1', '2', '3'] },
  { title: 'Measurements', keys: ['D', 'A', 'Backspace'] },
  { title: 'Undo & Redo', keys: ['Ctrl+Z', 'Ctrl+Y', 'Ctrl+Shift+Z'] },
  { title: 'View & General', keys: ['H', 'R', 'Ctrl+S', '?', 'Esc'] },
];

// A shortcut added to KEYBOARD_SHORTCUTS without a section still shows, under Other
const listed = new Set(SECTION_KEYS.flatMap((section) => section.keys));
const SECTIONS = [
  ...SECTION_KEYS.map(({ title, keys }) => ({
    title,
    shortcuts: keys.flatMap((key) => KEYBOARD_SHORTCUTS.filter((s) => s.key === key)),
  })),
  { title: 'Other', shortcuts: KEYBOARD_SHORTCUTS.filter((s) => !listed.has(s.key)) },
].filter((section) => section.shortcuts.length > 0);

export interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsHelp({ isOpen, onClose }: ShortcutsHelpProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogProps = useModalDialog({ isOpen, onClose, initialFocusRef: closeButtonRef });

  if (!isOpen) return null;

  return (
    <dialog {...dialogProps} className={styles.modalContent} aria-label="Keyboard shortcuts">
      <div className={styles.modalHeader}>
        <h2 className={styles.modalTitle}>Keyboard Shortcuts</h2>
        <button
          ref={closeButtonRef}
          className={styles.modalClose}
          onClick={onClose}
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>
      <div className={styles.modalBody}>
        {SECTIONS.map((section) => (
          <div key={section.title} className={styles.shortcutsSection}>
            <h3 className={styles.sectionTitle}>{section.title}</h3>
            <div className={styles.shortcutsList}>
              {section.shortcuts.map((shortcut) => (
                <div key={shortcut.key} className={styles.shortcutRow}>
                  <kbd className={styles.shortcutKey}>{shortcut.key}</kbd>
                  <span className={styles.shortcutDesc}>{shortcut.description}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </dialog>
  );
}
