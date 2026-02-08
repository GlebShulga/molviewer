import { useCallback, useEffect, useRef, useState } from 'react';
import type { Atom, Bond } from '../types';

/**
 * Hook for using the compute worker to offload heavy calculations.
 *
 * Usage:
 * ```typescript
 * const { inferBonds, isProcessing, error } = useComputeWorker();
 *
 * const bonds = await inferBonds(atoms);
 * ```
 */

export interface UseComputeWorkerResult {
  /** Infer bonds from atoms (async) */
  inferBonds: (atoms: Atom[], tolerance?: number) => Promise<Bond[]>;
  /** Whether a computation is in progress */
  isProcessing: boolean;
  /** Current progress (0-1) for long operations */
  progress: number;
  /** Last error message */
  error: string | null;
  /** Whether the worker is available */
  isAvailable: boolean;
}

/** Threshold for using worker (smaller molecules are faster on main thread) */
const WORKER_THRESHOLD = 5000;

export function useComputeWorker(): UseComputeWorkerResult {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>>(
    new Map()
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const idCounterRef = useRef(0);

  // Initialize worker
  useEffect(() => {
    try {
      // Create worker using Vite's worker syntax
      workerRef.current = new Worker(
        new URL('../workers/computeWorker.ts', import.meta.url),
        { type: 'module' }
      );

      workerRef.current.onmessage = (event) => {
        const { type, id, bonds, error: errorMsg, progress: prog } = event.data;

        if (type === 'progress' && prog !== undefined) {
          setProgress(prog);
          return;
        }

        if (type === 'error') {
          setError(errorMsg);
          if (id && pendingRef.current.has(id)) {
            pendingRef.current.get(id)?.reject(new Error(errorMsg));
            pendingRef.current.delete(id);
          }
          setIsProcessing(false);
          return;
        }

        if (id && pendingRef.current.has(id)) {
          if (type === 'bondsComplete') {
            pendingRef.current.get(id)?.resolve(bonds);
          } else {
            pendingRef.current.get(id)?.resolve(event.data);
          }
          pendingRef.current.delete(id);

          if (pendingRef.current.size === 0) {
            setIsProcessing(false);
            setProgress(0);
          }
        }
      };

      workerRef.current.onerror = (err) => {
        console.error('[ComputeWorker] Error:', err);
        setError(err.message);
        setIsAvailable(false);
      };

      setIsAvailable(true);
    } catch (err) {
      console.warn('[ComputeWorker] Failed to create worker:', err);
      setIsAvailable(false);
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // Infer bonds using worker
  const inferBonds = useCallback(
    (atoms: Atom[], tolerance?: number): Promise<Bond[]> => {
      return new Promise((resolve, reject) => {
        // For small molecules, use main thread
        if (atoms.length < WORKER_THRESHOLD || !workerRef.current || !isAvailable) {
          // Fallback to sync (would need to import actual function)
          console.log(`[ComputeWorker] Using main thread for ${atoms.length} atoms`);
          reject(new Error('Worker not available, use main thread'));
          return;
        }

        const id = `bonds-${++idCounterRef.current}`;
        pendingRef.current.set(id, { resolve: resolve as (value: unknown) => void, reject });
        setIsProcessing(true);
        setError(null);

        workerRef.current.postMessage({
          type: 'inferBonds',
          id,
          atoms,
          tolerance,
        });
      });
    },
    [isAvailable]
  );

  return {
    inferBonds,
    isProcessing,
    progress,
    error,
    isAvailable,
  };
}
