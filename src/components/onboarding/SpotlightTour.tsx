import { useState, useEffect, useRef, useCallback } from 'react';
import { TOUR_STEPS } from './tourSteps';
import styles from './SpotlightTour.module.css';

interface SpotlightTourProps {
  step: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  setSidebarOpen: (open: boolean) => void;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;
const TOOLTIP_GAP = 12;
const MOBILE_BREAKPOINT = 768;
const TARGET_POLL_INTERVAL = 100;
const TARGET_POLL_MAX_ATTEMPTS = 30; // 3 seconds

export function SpotlightTour({ step, onNext, onPrev, onSkip, setSidebarOpen }: SpotlightTourProps) {
  const [rect, setRect] = useState<TargetRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const stepIndex = step - 1;
  const currentStep = TOUR_STEPS[stepIndex];
  const isLastStep = step >= TOUR_STEPS.length;
  const isMobile = typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;

  // Save/restore focus
  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    return () => {
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  // Focus tooltip on step change
  useEffect(() => {
    requestAnimationFrame(() => {
      tooltipRef.current?.focus();
    });
  }, [step]);

  // Mobile: open sidebar for step 1 (file-upload), close on other steps
  useEffect(() => {
    if (isMobile && step === 1) {
      setSidebarOpen(true);
    } else if (isMobile && step === 2) {
      setSidebarOpen(false);
    }
  }, [step, isMobile, setSidebarOpen]);

  // Find and track target element
  useEffect(() => {
    if (!currentStep) return;

    let attempts = 0;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let resizeObserver: ResizeObserver | null = null;

    function updateRect() {
      const el = document.querySelector(currentStep.target);
      if (!el) return false;

      const r = el.getBoundingClientRect();
      setRect({
        top: r.top - PADDING,
        left: r.left - PADDING,
        width: r.width + PADDING * 2,
        height: r.height + PADDING * 2,
      });
      return true;
    }

    function startObserving() {
      const el = document.querySelector(currentStep.target);
      if (!el) return;

      resizeObserver = new ResizeObserver(() => updateRect());
      resizeObserver.observe(el);

      window.addEventListener('resize', updateRect);
    }

    // Poll until target appears
    if (!updateRect()) {
      pollTimer = setInterval(() => {
        attempts++;
        if (updateRect()) {
          if (pollTimer) clearInterval(pollTimer);
          startObserving();
        } else if (attempts >= TARGET_POLL_MAX_ATTEMPTS) {
          if (pollTimer) clearInterval(pollTimer);
          // Target not found — skip this step
          onNext();
        }
      }, TARGET_POLL_INTERVAL);
    } else {
      startObserving();
    }

    return () => {
      if (pollTimer) clearInterval(pollTimer);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateRect);
    };
  }, [stepIndex, currentStep, onNext]);

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onSkip();
        return;
      }

      // Focus trap within tooltip
      if (e.key === 'Tab' && tooltipRef.current) {
        const focusable = tooltipRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onSkip]);

  // Calculate tooltip position
  const getTooltipStyle = useCallback((): React.CSSProperties => {
    if (!rect) return { opacity: 0 };

    const placement = isMobile && currentStep?.mobilePlacement
      ? currentStep.mobilePlacement
      : currentStep?.placement ?? 'bottom';

    const style: React.CSSProperties = { opacity: 1 };

    switch (placement) {
      case 'bottom':
        style.top = rect.top + rect.height + TOOLTIP_GAP;
        style.left = rect.left + rect.width / 2;
        style.transform = 'translateX(-50%)';
        break;
      case 'top':
        style.bottom = window.innerHeight - rect.top + TOOLTIP_GAP;
        style.left = rect.left + rect.width / 2;
        style.transform = 'translateX(-50%)';
        break;
      case 'right':
        style.top = rect.top + rect.height / 2;
        style.left = rect.left + rect.width + TOOLTIP_GAP;
        style.transform = 'translateY(-50%)';
        break;
      case 'left':
        style.top = rect.top + rect.height / 2;
        style.right = window.innerWidth - rect.left + TOOLTIP_GAP;
        style.transform = 'translateY(-50%)';
        break;
    }

    return style;
  }, [rect, isMobile, currentStep]);

  if (!currentStep || !rect) return null;

  return (
    <>
      {/* Click blocker */}
      <div className={styles.blocker} aria-hidden="true" />

      {/* Spotlight hole */}
      <div
        className={styles.spotlightHole}
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }}
        aria-hidden="true"
      />

      {/* Spotlight accent ring */}
      <div
        className={styles.spotlightRing}
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }}
        aria-hidden="true"
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className={styles.tooltip}
        style={getTooltipStyle()}
        role="dialog"
        aria-modal="true"
        aria-label={`Tour step ${step} of ${TOUR_STEPS.length}: ${currentStep.title}`}
        tabIndex={-1}
        data-onboarding="spotlight-tooltip"
      >
        <div className={styles.stepHeader}>
          <span className={styles.stepBadge}>{step} OF {TOUR_STEPS.length}</span>
          <div className={styles.progressDots}>
            {TOUR_STEPS.map((_, i) => (
              <div key={i} className={i === stepIndex ? styles.dotActive : styles.dot} />
            ))}
          </div>
        </div>
        <h3 className={styles.tooltipTitle}>{currentStep.title}</h3>
        <p className={styles.tooltipDescription}>{currentStep.description}</p>
        <div className={styles.tooltipActions}>
          <button className={styles.skipButton} onClick={onSkip}>
            Skip
          </button>
          <div className={styles.navButtons}>
            <button
              className={styles.backButton}
              onClick={onPrev}
              disabled={step <= 1}
            >
              Back
            </button>
            <button className={styles.nextButton} onClick={onNext}>
              {isLastStep ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
