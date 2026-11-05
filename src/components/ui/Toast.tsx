import { useEffect } from 'react';
import { useToastStore, hideToast } from '../../utils/toast';
import styles from './Toast.module.css';

const VISIBLE_MS = 2500;

/**
 * Confirmations of actions that leave nothing on screen, like a download or a
 * copied link. Rendered in the viewer's toolbar-side stack, next to the
 * toolbar where those actions are, so it doesn't cover the molecule.
 */
export function Toast() {
  const { message, id } = useToastStore();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(hideToast, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message, id]);

  return (
    <>
      {/* Always mounted, so screen readers announce each message; out of the stack's flow */}
      <div className="srOnly" role="status" aria-live="polite">{message ?? ''}</div>
      {message && (
        <div key={id} className={styles.toast} aria-hidden="true" data-testid="toast">
          {message}
        </div>
      )}
    </>
  );
}
