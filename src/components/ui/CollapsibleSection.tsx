import { useState, useCallback, type ReactNode } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight } from 'lucide-react';
import styles from './CollapsibleSection.module.css';

const STORAGE_PREFIX = 'mol3d-collapsed-';

function getStoredState(key: string | undefined, defaultValue: boolean): boolean {
  if (!key) return defaultValue;
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (stored !== null) {
      return stored === 'true';
    }
  } catch {
    // localStorage not available
  }
  return defaultValue;
}

export interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  /** When provided, collapsed state persists to localStorage */
  storageKey?: string;
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  className,
  storageKey,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(() => getStoredState(storageKey, defaultOpen));

  const handleToggle = useCallback(() => {
    setIsOpen(prev => {
      const newValue = !prev;
      if (storageKey) {
        try {
          localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, String(newValue));
        } catch {
          // localStorage not available
        }
      }
      return newValue;
    });
  }, [storageKey]);

  return (
    <div className={clsx(styles.collapsibleSection, className)}>
      <button
        className={styles.collapsibleHeader}
        onClick={handleToggle}
        aria-expanded={isOpen}
      >
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className={styles.collapsibleTitle}>{title}</span>
      </button>
      <div
        className={clsx(styles.collapsibleContent, !isOpen && styles.collapsibleContentHidden)}
        aria-hidden={!isOpen}
      >
        {isOpen && children}
      </div>
    </div>
  );
}
