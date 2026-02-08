/**
 * UI configuration constants.
 */

export const LAYOUT = {
  sidebarWidth: 300,
  headerHeight: 56,
} as const;

export const ANIMATION = {
  duration: '0.2s',
  easing: 'ease',
} as const;

export const TOOLTIP = {
  offsetX: 10,
  offsetY: 10,
} as const;

export const SAMPLE_MOLECULES = [
  { name: 'Caffeine', file: '/sample-molecules/caffeine.pdb' },
  { name: 'Aspirin', file: '/sample-molecules/aspirin.sdf' },
  { name: 'Water', file: '/sample-molecules/water.xyz' },
] as const;
