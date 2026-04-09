export interface TourStep {
  target: string;
  title: string;
  description: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
  mobilePlacement?: 'top' | 'bottom' | 'left' | 'right';
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
  },
  {
    target: '[data-onboarding="measurement-buttons"]',
    title: 'Measurements',
    description: 'Measure distances and angles between atoms.',
    placement: 'bottom',
    mobilePlacement: 'top',
  },
  {
    target: '[data-onboarding="view-buttons"]',
    title: 'View Controls',
    description: 'Reset view, auto-rotate, export images, and share links.',
    placement: 'bottom',
    mobilePlacement: 'top',
  },
];
