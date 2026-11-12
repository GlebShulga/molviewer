import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingProvider } from '../components/onboarding';
import { EmptyOrWelcome } from '../App';

const track = vi.hoisted(() => vi.fn());
vi.mock('../utils/track', () => ({ track, entryKind: () => 'home' }));

const loadStructureFromParams = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => Promise.resolve({ structId: 's1', source: null }))
);
vi.mock('../hooks/useInitialUrlLoad', () => ({ loadStructureFromParams, useInitialUrlLoad: () => {} }));

beforeEach(() => {
  // Onboarding is over, so the empty state shows instead of the welcome screen
  localStorage.setItem('mol3d-onboarding-completed', 'true');
  track.mockClear();
  loadStructureFromParams.mockClear();
});

function renderEmptyState() {
  const onOpenSidebar = vi.fn();
  render(
    <OnboardingProvider>
      <EmptyOrWelcome onOpenSidebar={onOpenSidebar} />
    </OnboardingProvider>
  );
  return { onOpenSidebar };
}

describe('empty state', () => {
  it('opens the sheet from "Load a structure"', () => {
    const { onOpenSidebar } = renderEmptyState();
    fireEvent.click(screen.getByRole('button', { name: 'Load a structure' }));
    expect(onOpenSidebar).toHaveBeenCalledTimes(1);
  });

  it('offers the welcome screen examples as real links', () => {
    renderEmptyState();
    expect(screen.getByRole('link', { name: 'Hemoglobin 4HHB' })).toHaveProperty('href', 'http://localhost:3000/pdb/4HHB');
    expect(screen.getByText(/Supported formats: PDB, CIF, SDF, MOL, XYZ/)).toBeTruthy();
  });

  it('loads an example in place, tagged as an empty-state load, without ending onboarding again', async () => {
    renderEmptyState();
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole('link', { name: 'Caffeine' }), event);

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(loadStructureFromParams).toHaveBeenCalledTimes(1));
    // An example click is a load a person started
    expect(loadStructureFromParams.mock.calls[0][3]).toEqual({ userInitiated: true, via: 'empty_example' });
    expect(track).not.toHaveBeenCalledWith('onboarding_completed', expect.anything());
  });
});

describe('an example load and a Replace load started meanwhile', () => {
  /** Clicks the Caffeine example from the welcome screen; its load finishes when told to, with a warning. */
  async function startExample() {
    localStorage.removeItem('mol3d-onboarding-completed');
    let finish!: () => void;
    loadStructureFromParams.mockImplementationOnce(
      () => new Promise((resolve) => (finish = () => resolve({ structId: null, source: null, warning: 'A notice' } as never)))
    );
    render(
      <OnboardingProvider>
        <EmptyOrWelcome onOpenSidebar={vi.fn()} />
      </OnboardingProvider>
    );
    fireEvent.click(screen.getByRole('link', { name: 'Caffeine' }));
    await waitFor(() => expect(loadStructureFromParams).toHaveBeenCalledTimes(1));
    return () => finish();
  }

  it('overtaken by an applied Replace load, shows no warning and leaves onboarding as it was', async () => {
    const { beginSceneLoad, finishSceneLoad, applySceneLoad, useMoleculeStore } = await import('../store/moleculeStore');
    useMoleculeStore.getState().reset();
    const finish = await startExample();

    const replace = beginSceneLoad('replace');
    applySceneLoad(replace, () => {});
    finishSceneLoad(replace);
    finish();
    await waitFor(() => expect(useMoleculeStore.getState().isLoading).toBe(false));

    expect(useMoleculeStore.getState().error).toBeNull();
    expect(track).not.toHaveBeenCalledWith('onboarding_completed', expect.anything());
    expect(localStorage.getItem('mol3d-onboarding-completed')).toBeNull();
  });

  it('with a Replace load that applied nothing, still shows its warning', async () => {
    const { beginSceneLoad, finishSceneLoad, useMoleculeStore } = await import('../store/moleculeStore');
    useMoleculeStore.getState().reset();
    const finish = await startExample();

    finishSceneLoad(beginSceneLoad('replace'));
    finish();
    await waitFor(() => expect(useMoleculeStore.getState().error).toBe('A notice'));
  });
});
