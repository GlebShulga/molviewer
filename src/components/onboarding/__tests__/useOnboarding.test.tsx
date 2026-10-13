import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMoleculeStore, temporalStore } from '../../../store/moleculeStore';
import { useOnboarding } from '../useOnboarding';

const track = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/track', () => ({ track, entryKind: () => 'home' }));

const STORAGE_KEY = 'mol3d-onboarding-completed';

beforeEach(() => {
  useMoleculeStore.getState().reset();
  temporalStore.getState().clear();
  localStorage.clear();
  track.mockClear();
});

describe('completeWithExample', () => {
  it('ends onboarding, so the welcome screen does not come back on the next visit', () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.phase).toBe('welcome');

    act(() => result.current.completeWithExample());

    expect(result.current.phase).toBe('completed');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
    // A fresh mount is what the next visit sees.
    expect(renderHook(() => useOnboarding()).result.current.phase).toBe('idle');
  });

  it('stays finished when the viewer is emptied again', () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.completeWithExample());

    act(() => useMoleculeStore.getState().reset());

    expect(result.current.phase).toBe('completed');
  });

  it('reports the example as its own way through onboarding', () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.completeWithExample());

    expect(track).toHaveBeenCalledWith('onboarding_completed', { value: 'example' });
  });
});
