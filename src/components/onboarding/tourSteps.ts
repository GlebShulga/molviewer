export interface TourStep {
  target: string;
  title: string;
  description: string;
  /** Description on phones, when it differs (e.g. buttons that moved into a menu). */
  mobileDescription?: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
  mobilePlacement?: 'top' | 'bottom' | 'left' | 'right';
  /**
   * Scroll the target into view when the step starts. The toolbar scrolls
   * sideways on phones; the file panel lives in the sheet, which must not scroll.
   */
  scrollIntoView?: true;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-onboarding="file-upload"]',
    title: 'Load Molecules',
    description: 'Drop files, enter PDB IDs, or pick from sample molecules.',
    placement: 'right',
    mobilePlacement: 'bottom',
  },
  {
    target: '[data-onboarding="repr-buttons"]',
    title: 'Representations',
    description: 'Switch between Ball & Stick, Stick, and Spacefill views.',
    placement: 'bottom',
    mobilePlacement: 'top',
    scrollIntoView: true,
  },
  {
    target: '[data-onboarding="measurement-buttons"]',
    title: 'Measurements',
    description: 'Measure distances and angles between atoms.',
    placement: 'bottom',
    mobilePlacement: 'top',
    scrollIntoView: true,
  },
  {
    // The View group on wide screens; on phones it lives in the "More" menu
    target: '[data-onboarding="view-buttons"], [data-onboarding="more-menu"]',
    title: 'View Controls',
    description: 'Reset view, auto-rotate, export images, and share links.',
    mobileDescription: 'Undo, reset view, auto-rotate, export images, and share links are in the ⋯ menu.',
    placement: 'bottom',
    mobilePlacement: 'top',
    scrollIntoView: true,
  },
];
