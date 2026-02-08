export interface ExportResolution {
  label: string;
  scale: number;
}

export const EXPORT_RESOLUTIONS: ExportResolution[] = [
  { label: '1x', scale: 1 },
  { label: '2x', scale: 2 },
  { label: '4x', scale: 4 },
];

export interface ExportBackground {
  label: string;
  value: string | null;
}

export const EXPORT_BACKGROUNDS: ExportBackground[] = [
  { label: 'Dark', value: '#0d1117' },
  { label: 'Light', value: '#ffffff' },
  { label: 'Transparent', value: null },
];

export const DEFAULT_EXPORT_SETTINGS = {
  resolution: 2,
  background: '#0d1117',
  filename: 'molecule',
};
