import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches, re-rendering when that changes (the
 * window is resized past a breakpoint). Outside React, see utils/touch.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia?.(query);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(query).matches === true,
    () => false
  );
}
