import { create } from 'zustand';

interface ToastState {
  message: string | null;
  /** Bumped on every show, so the same message twice restarts the timer. */
  id: number;
}

export const useToastStore = create<ToastState>(() => ({ message: null, id: 0 }));

/** A short confirmation over the viewer ("Image saved"), rendered by <Toast>. */
export function showToast(message: string): void {
  useToastStore.setState((s) => ({ message, id: s.id + 1 }));
}

export function hideToast(): void {
  useToastStore.setState({ message: null });
}
