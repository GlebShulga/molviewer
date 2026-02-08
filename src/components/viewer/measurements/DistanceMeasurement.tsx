import { useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Atom } from '../../../types';
import { getLabelStyle, labelWrapperStyle } from './labelStyles';

// Constants for measurement visualization
const LABEL_CAMERA_OFFSET = 0.8;
const PULSE_AMPLITUDE = 0.3;
const PULSE_SPEED = 4;
const LINE_WIDTH_NORMAL = 2;
const LINE_WIDTH_HIGHLIGHTED = 4;
const DASH_SIZE = 0.3;
const GAP_SIZE = 0.15;
const RING_INNER_RADIUS = 0.8;
const RING_OUTER_RADIUS = 1.2;
const RING_SEGMENTS = 32;
const RING_OPACITY = 0.4;

// Pre-allocated vectors for useFrame to avoid GC pressure
const _cameraDir = new THREE.Vector3();
const _labelPos = new THREE.Vector3();

export interface DistanceMeasurementProps {
  atom1: Atom;
  atom2: Atom;
  label: string;
  color: string;
  isHighlighted?: boolean;
}

export function DistanceMeasurement({
  atom1,
  atom2,
  label,
  color,
  isHighlighted = false,
}: DistanceMeasurementProps) {
  const { camera } = useThree();
  const labelRef = useRef<THREE.Group>(null);
  const pulseRef = useRef<THREE.Mesh>(null);

  const points = useMemo(
    () => [
      new THREE.Vector3(atom1.x, atom1.y, atom1.z),
      new THREE.Vector3(atom2.x, atom2.y, atom2.z),
    ],
    [atom1, atom2]
  );

  const midpoint = useMemo(
    () =>
      new THREE.Vector3(
        (atom1.x + atom2.x) / 2,
        (atom1.y + atom2.y) / 2,
        (atom1.z + atom2.z) / 2
      ),
    [atom1, atom2]
  );

  // Update label position every frame based on camera, and animate pulse if highlighted
  // Uses pre-allocated vectors to avoid GC pressure from frame-by-frame allocations
  useFrame((state) => {
    if (labelRef.current) {
      _cameraDir.copy(camera.position).sub(midpoint).normalize();
      _labelPos.copy(midpoint).addScaledVector(_cameraDir, LABEL_CAMERA_OFFSET);
      labelRef.current.position.copy(_labelPos);
    }
    if (pulseRef.current && isHighlighted) {
      const scale = 1 + PULSE_AMPLITUDE * Math.sin(state.clock.elapsedTime * PULSE_SPEED);
      pulseRef.current.scale.setScalar(scale);
    }
  });

  return (
    <group>
      <Line
        points={points}
        color={color}
        lineWidth={isHighlighted ? LINE_WIDTH_HIGHLIGHTED : LINE_WIDTH_NORMAL}
        dashed
        dashSize={DASH_SIZE}
        gapSize={GAP_SIZE}
      />
      <group ref={labelRef}>
        <Html center style={labelWrapperStyle}>
          <span style={getLabelStyle(color, isHighlighted)}>
            {label}
          </span>
        </Html>
        {isHighlighted && (
          <mesh ref={pulseRef}>
            <ringGeometry args={[RING_INNER_RADIUS, RING_OUTER_RADIUS, RING_SEGMENTS]} />
            <meshBasicMaterial color={color} transparent opacity={RING_OPACITY} side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
    </group>
  );
}
