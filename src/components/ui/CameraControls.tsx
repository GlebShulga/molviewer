import { useState } from 'react';
import clsx from 'clsx';
import {
  Home,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
} from 'lucide-react';
import { CAMERA_PRESETS, type CameraPreset } from '../../config/cameraPresets';
import styles from './CameraControls.module.css';

export interface CameraControlsProps {
  onPresetSelect?: (preset: CameraPreset) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onReset?: () => void;
  onAutoRotateToggle?: (enabled: boolean) => void;
  autoRotate?: boolean;
}

export function CameraControls({
  onPresetSelect,
  onZoomIn,
  onZoomOut,
  onReset,
  onAutoRotateToggle,
  autoRotate = false,
}: CameraControlsProps) {
  const [isRotating, setIsRotating] = useState(autoRotate);

  const handleAutoRotateToggle = () => {
    const newValue = !isRotating;
    setIsRotating(newValue);
    onAutoRotateToggle?.(newValue);
  };

  return (
    <div className={styles.cameraControls}>
      <div className={styles.cameraPresets}>
        {CAMERA_PRESETS.slice(0, 4).map((preset) => (
          <button
            key={preset.name}
            className={styles.cameraPresetBtn}
            onClick={() => onPresetSelect?.(preset)}
            title={preset.name}
          >
            {preset.name === 'Home' ? <Home size={14} /> : preset.name.charAt(0)}
          </button>
        ))}
      </div>

      <div className={styles.cameraActions}>
        <button
          className={styles.cameraActionBtn}
          onClick={onZoomIn}
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
        <button
          className={styles.cameraActionBtn}
          onClick={onZoomOut}
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>
        <button
          className={styles.cameraActionBtn}
          onClick={onReset}
          title="Reset View"
        >
          <RotateCcw size={16} />
        </button>
        <button
          className={clsx(styles.cameraActionBtn, isRotating && styles.active)}
          onClick={handleAutoRotateToggle}
          title={isRotating ? 'Stop Rotation' : 'Auto Rotate'}
        >
          {isRotating ? <Pause size={16} /> : <Play size={16} />}
        </button>
      </div>
    </div>
  );
}
