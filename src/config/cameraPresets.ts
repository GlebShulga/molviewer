export interface CameraPreset {
  name: string;
  position: readonly [number, number, number];
  up?: readonly [number, number, number];
}

export const CAMERA_PRESETS: CameraPreset[] = [
  { name: 'Home', position: [0, 0, 50] },
  { name: 'Front', position: [0, 0, 50] },
  { name: 'Back', position: [0, 0, -50] },
  { name: 'Top', position: [0, 50, 0], up: [0, 0, -1] },
  { name: 'Bottom', position: [0, -50, 0], up: [0, 0, 1] },
  { name: 'Left', position: [-50, 0, 0] },
  { name: 'Right', position: [50, 0, 0] },
];

export const DEFAULT_CAMERA_POSITION: readonly [number, number, number] = [0, 0, 50];
export const DEFAULT_CAMERA_UP: readonly [number, number, number] = [0, 1, 0];
