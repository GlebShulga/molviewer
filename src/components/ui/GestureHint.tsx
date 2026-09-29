import { useEffect, useState } from 'react';
import styles from './GestureHint.module.css';

const STORAGE_KEY = 'mol3d-gesture-hint-seen';
const VISIBLE_MS = 5000;

function shouldShow(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return false;
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'true';
  } catch {
    return false;
  }
}

/**
 * One-time hint for touch devices, shown over the viewer when the first
 * structure appears: how to rotate, zoom and pan. Never blocks input.
 */
export function GestureHint() {
  const [visible, setVisible] = useState(shouldShow);

  useEffect(() => {
    if (!visible) return;
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Storage blocked: the hint may show again next visit.
    }
    const hide = () => setVisible(false);
    const timer = setTimeout(hide, VISIBLE_MS);
    window.addEventListener('pointerdown', hide, { once: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', hide);
    };
  }, [visible]);

  if (!visible) return null;
  return (
    <div className={styles.hint} role="status">
      <span>One finger: rotate</span>
      <span>Pinch: zoom</span>
      <span>Two fingers: pan</span>
    </div>
  );
}
