import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
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

/**
 * The first element matching the selector that has a size. A step can list
 * several targets of which CSS hides all but one (the View group on wide
 * screens, the "More" button on phones).
 */
function findVisibleTarget(selector: string): Element | null {
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export function SpotlightTour({ step, onNext, onPrev, onSkip, setSidebarOpen }: SpotlightTourProps) {
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [tooltipHeight, setTooltipHeight] = useState(160);
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
    let frame = 0;
    let lastKey = '';

    function updateRect() {
      // Looked up every time: a remounted target would leave a detached
      // element behind, whose rect is all zeros.
      const el = findVisibleTarget(currentStep.target);
      if (!el) return false;

      const r = el.getBoundingClientRect();
      const key = [r.top, r.left, r.width, r.height].map(Math.round).join(',');
      if (key !== lastKey) {
        lastKey = key;
        setRect({
          top: r.top - PADDING,
          left: r.left - PADDING,
          width: r.width + PADDING * 2,
          height: r.height + PADDING * 2,
        });
      }
      return true;
    }

    // Measure every frame: the phone sheet slides in with a transform and the
    // toolbar scrolls sideways, and neither fires a resize. This reads layout
    // only, so the 3D canvas does not repaint.
    function track() {
      updateRect();
      frame = requestAnimationFrame(track);
    }

    function startObserving() {
      if (currentStep.scrollIntoView) {
        findVisibleTarget(currentStep.target)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      frame = requestAnimationFrame(track);
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
      cancelAnimationFrame(frame);
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

  // Measure the tooltip, so the clamp below uses its real height (it varies
  // with the step's text)
  useLayoutEffect(() => {
    const height = tooltipRef.current?.offsetHeight;
    if (height && height !== tooltipHeight) setTooltipHeight(height);
  }, [step, rect, tooltipHeight]);

  // Calculate tooltip position with viewport clamping
  const getTooltipStyle = useCallback((): React.CSSProperties => {
    if (!rect) return { opacity: 0 };

    const placement = isMobile && currentStep?.mobilePlacement
      ? currentStep.mobilePlacement
      : currentStep?.placement ?? 'bottom';

    const style: React.CSSProperties = { opacity: 1 };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tooltipWidth = isMobile ? 260 : 300;
    const margin = 12; // min distance from viewport edge

    switch (placement) {
      case 'bottom':
        style.top = rect.top + rect.height + TOOLTIP_GAP;
        style.left = rect.left + rect.width / 2;
        style.transform = 'translateX(-50%)';
        break;
      case 'top':
        // As `top`, not `bottom`, so the vertical clamp below applies
        style.top = rect.top - TOOLTIP_GAP - tooltipHeight;
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
        style.right = vw - rect.left + TOOLTIP_GAP;
        style.transform = 'translateY(-50%)';
        break;
    }

    // Clamp tooltip within viewport
    if (style.top !== undefined && typeof style.top === 'number') {
      // If tooltip would overflow below viewport, pull it up
      if (style.top + tooltipHeight > vh - margin) {
        style.top = vh - tooltipHeight - margin;
      }
      // Don't let it go above viewport
      if (style.top < margin) {
        style.top = margin;
      }
    }

    if (style.left !== undefined && typeof style.left === 'number') {
      // Clamp horizontal: account for centering transform
      const effectiveLeft = style.transform?.includes('translateX(-50%)')
        ? style.left - tooltipWidth / 2
        : style.left;
      if (effectiveLeft < margin) {
        style.left = margin;
        style.transform = style.transform?.replace('translateX(-50%)', '') || undefined;
      } else if (effectiveLeft + tooltipWidth > vw - margin) {
        style.left = vw - tooltipWidth - margin;
        style.transform = style.transform?.replace('translateX(-50%)', '') || undefined;
      }
    }

    return style;
  }, [rect, isMobile, currentStep, tooltipHeight]);

  // A tap on the dimmed page ends the tour: phones have no Esc, so this is the
  // way out if the tooltip is ever out of reach. The spotlight lets taps
  // through to the blocker, so taps inside it are ignored, as before.
  const handleBlockerClick = useCallback((e: React.MouseEvent) => {
    if (
      rect &&
      e.clientX >= rect.left &&
      e.clientX <= rect.left + rect.width &&
      e.clientY >= rect.top &&
      e.clientY <= rect.top + rect.height
    ) {
      return;
    }
    onSkip();
  }, [rect, onSkip]);

  if (!currentStep || !rect) return null;

  return (
    <>
      {/* Click blocker */}
      <div className={styles.blocker} onClick={handleBlockerClick} aria-hidden="true" />

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
        <p className={styles.tooltipDescription}>
          {(isMobile && currentStep.mobileDescription) || currentStep.description}
        </p>
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
