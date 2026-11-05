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
    expect(loadStructureFromParams.mock.calls[0][2]).toBe('empty_example');
    expect(track).not.toHaveBeenCalledWith('onboarding_completed', expect.anything());
  });
});
