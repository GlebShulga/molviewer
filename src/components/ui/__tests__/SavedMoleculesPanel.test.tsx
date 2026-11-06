import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useMoleculeStore, temporalStore } from '../../../store/moleculeStore';
import { SavedMoleculesPanel } from '../SavedMoleculesPanel';

const reporter = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock('../../../utils/errorReporter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/errorReporter')>()),
  logError: reporter.logError,
}));

/** One entry in the Saved panel's index, stored as the app writes it, with the given payload. */
function storeEntry(kind: 'session' | 'molecule', payload: string | null) {
  const id = `entry-${kind}`;
  localStorage.setItem(
    'mol3d_index',
    JSON.stringify({
      version: 2,
      entries: [
        {
          id,
          name: `Broken ${kind}`,
          savedAt: Date.now(),
          atomCount: 3,
          bondCount: 0,
          aromaticRingCount: 0,
          measurementCount: 0,
          storage: 'localStorage',
          ...(kind === 'session' && { kind }),
        },
      ],
    })
  );
  if (payload !== null) localStorage.setItem(`mol3d_${kind}_${id}`, payload);
}

async function clickLoad() {
  act(() => useMoleculeStore.getState().loadSavedMoleculesIndex());
  render(<SavedMoleculesPanel />);
  await act(async () => {
    screen.getByTitle('Load molecule').click();
  });
}

let alertSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  useMoleculeStore.getState().reset();
  temporalStore.getState().clear();
  reporter.logError.mockClear();
  alertSpy = vi.fn();
  vi.stubGlobal('alert', alertSpy);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SavedMoleculesPanel: an entry that cannot be read', () => {
  it('tells the user, without reporting an error for a missing session payload', async () => {
    storeEntry('session', null);
    await clickLoad();

    expect(alertSpy).toHaveBeenCalledWith('This saved session could not be read.');
    expect(reporter.logError).not.toHaveBeenCalled();
  });

  it('reports a corrupt session payload once, from the storage layer', async () => {
    storeEntry('session', '{not json');
    await clickLoad();

    expect(alertSpy).toHaveBeenCalledWith('This saved session could not be read.');
    expect(reporter.logError).toHaveBeenCalledTimes(1);
    expect(reporter.logError.mock.calls[0][1]).toMatchObject({ source: 'moleculeStorage' });
  });

  it('tells the user, without reporting an error for a missing saved molecule', async () => {
    storeEntry('molecule', null);
    await clickLoad();

    expect(alertSpy).toHaveBeenCalledWith('This saved molecule could not be read.');
    expect(reporter.logError).not.toHaveBeenCalled();
  });
});
