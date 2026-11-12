import { useState, useCallback, useRef, useEffect } from 'react';
import {
  applySceneLoad,
  beginSceneLoad,
  finishSceneLoad,
  isCurrentSceneLoad,
  notAppliedReason,
  useMoleculeStore,
} from '../../store/moleculeStore';
import { parseMMCIF } from '../../parsers';
import { getInitialUrlLoad } from '../../utils/urlParams';
import { track } from '../../utils/track';
import { startLoad } from '../../utils/loadTracking';
import { asParseError, LoadError } from '../../utils/loadErrors';
import { loadViewerStage } from '../viewer/loadViewerStage';
import { TOUR_STEPS } from './tourSteps';

const STORAGE_KEY = 'mol3d-onboarding-completed';

export type OnboardingPhase = 'idle' | 'welcome' | 'loading' | 'touring' | 'completed';

export interface OnboardingState {
  phase: OnboardingPhase;
  tourStep: number;
  startTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  /** The visitor started from an example link instead of the tour. */
  completeWithExample: () => void;
}

function isOnboardingCompleted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function markOnboardingCompleted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // localStorage unavailable — onboarding will show again next visit
  }
}

function getInitialPhase(): OnboardingPhase {
  if (isOnboardingCompleted()) return 'idle';
  if (getInitialUrlLoad(window.location)) return 'idle';
  if (useMoleculeStore.getState().structureOrder.length > 0) return 'idle';
  return 'welcome';
}

export function useOnboarding(): OnboardingState {
  const [phase, setPhase] = useState<OnboardingPhase>(getInitialPhase);
  const [tourStep, setTourStep] = useState(1);
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const startTour = useCallback(async () => {
    setPhase('loading');

    const controller = new AbortController();
    abortRef.current = controller;

    // The tour doesn't set isLoading (it keeps the welcome screen and its
    // button's "Loading..." up), so App's preload wouldn't start the viewer
    // download until 1CRN arrives. Start it alongside the fetch.
    loadViewerStage().catch(() => {});
    // The tour's demo is a built-in example the visitor asked for: a sample,
    // not their own structure, in the activation funnel
    const attempt = startLoad({ source: 'sample', userInitiated: true, via: 'onboarding' });
    const token = beginSceneLoad('add', { countsAsLoading: false });

    try {
      const resp = await fetch('https://files.rcsb.org/download/1CRN.cif', {
        signal: controller.signal,
      });
      if (!resp.ok) throw new LoadError('Failed to fetch 1CRN', resp.status === 404 ? 'not_found' : 'network');
      const content = await resp.text();

      if (controller.signal.aborted) {
        attempt.cancelled('aborted');
        return;
      }
      // Overtaken (a Replace load applied meanwhile): end onboarding, as
      // when the fetch fails, so the welcome screen doesn't stay on "Loading"
      if (!isCurrentSceneLoad(token)) {
        attempt.cancelled('superseded');
        markOnboardingCompleted();
        setPhase('completed');
        return;
      }

      let molecule;
      try {
        molecule = parseMMCIF(content);
      } catch (err) {
        throw asParseError(err);
      }
      molecule.name = '1CRN';

      const { addStructure } = useMoleculeStore.getState();
      // '' when the store refused it (the structure limit), which marks nothing
      let structureId = '';
      if (applySceneLoad(token, () => (structureId = addStructure(molecule, '1CRN', { type: 'rcsb', id: '1CRN' })) !== '')) {
        attempt.loaded(useMoleculeStore.getState().getStructure(structureId));
      } else {
        attempt.cancelled(notAppliedReason(token));
      }

      setPhase('touring');
      setTourStep(1);
    } catch (err) {
      if (controller.signal.aborted) {
        attempt.cancelled('aborted');
        return;
      }
      // Overtaken: the scene shown is another load's, so no error over it.
      // Onboarding still ends, as when overtaken after a good download.
      if (isCurrentSceneLoad(token)) {
        attempt.failed(err);
        const { setError } = useMoleculeStore.getState();
        setError(err instanceof Error ? err.message : 'Failed to load demo molecule');
      } else {
        attempt.cancelled('superseded');
      }
      markOnboardingCompleted();
      setPhase('completed');
    } finally {
      finishSceneLoad(token);
    }
  }, []);

  const nextStep = useCallback(() => {
    setTourStep(prev => {
      if (prev >= TOUR_STEPS.length) {
        markOnboardingCompleted();
        setPhase('completed');
        track('onboarding_completed', { value: 'finished' });
        return prev;
      }
      return prev + 1;
    });
  }, []);

  const prevStep = useCallback(() => {
    setTourStep(prev => Math.max(1, prev - 1));
  }, []);

  const skipTour = useCallback(() => {
    markOnboardingCompleted();
    setPhase('completed');
    track('onboarding_completed', { value: 'skipped' });
  }, []);

  // An example link is a way through onboarding too: the welcome screen does
  // not come back on the next visit, or if the viewer is emptied again.
  const completeWithExample = useCallback(() => {
    markOnboardingCompleted();
    setPhase('completed');
    track('onboarding_completed', { value: 'example' });
  }, []);

  return { phase, tourStep, startTour, nextStep, prevStep, skipTour, completeWithExample };
}
