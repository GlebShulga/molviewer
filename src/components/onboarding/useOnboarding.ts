import { useState, useCallback, useRef, useEffect } from 'react';
import { useMoleculeStore } from '../../store/moleculeStore';
import { parseMMCIF } from '../../parsers';
import { parseMoleculeParams } from '../../utils/urlParams';
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
  if (parseMoleculeParams(window.location.search)) return 'idle';
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

    try {
      const resp = await fetch('https://files.rcsb.org/download/1CRN.cif', {
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error('Failed to fetch 1CRN');
      const content = await resp.text();

      if (controller.signal.aborted) return;

      const molecule = parseMMCIF(content);
      molecule.name = '1CRN';

      const { addStructure, setMoleculeSource } = useMoleculeStore.getState();
      addStructure(molecule, '1CRN');
      setMoleculeSource({ type: 'rcsb', id: '1CRN' });
      document.title = '1CRN - MolViewer';

      setPhase('touring');
      setTourStep(1);
    } catch (err) {
      if (controller.signal.aborted) return;
      const { setError } = useMoleculeStore.getState();
      setError(err instanceof Error ? err.message : 'Failed to load demo molecule');
      markOnboardingCompleted();
      setPhase('completed');
    }
  }, []);

  const nextStep = useCallback(() => {
    setTourStep(prev => {
      if (prev >= TOUR_STEPS.length) {
        markOnboardingCompleted();
        setPhase('completed');
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
  }, []);

  return { phase, tourStep, startTour, nextStep, prevStep, skipTour };
}
