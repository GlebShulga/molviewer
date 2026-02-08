import { useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { Atom } from '../../../types';

export interface AngleMeasurementProps {
  atom1: Atom;
  atom2: Atom;
  atom3: Atom;
  label: string;
  color: string;
  outlineColor: string;
  isHighlighted?: boolean;
}

export function AngleMeasurement({
  atom1,
  atom2,
  atom3,
  label,
  color,
  outlineColor,
  isHighlighted = false,
}: AngleMeasurementProps) {
  const radius = 1.0; // same radius for lines and arc
  const { camera } = useThree();
  const labelRef = useRef<THREE.Group>(null);
  const pulseRef = useRef<THREE.Mesh>(null);

  // Calculate vertex and directions
  const { vertex, dir1, dir2, lineEnd1, lineEnd2 } = useMemo(() => {
    const v = new THREE.Vector3(atom2.x, atom2.y, atom2.z);
    const d1 = new THREE.Vector3(
      atom1.x - atom2.x,
      atom1.y - atom2.y,
      atom1.z - atom2.z
    ).normalize();
    const d2 = new THREE.Vector3(
      atom3.x - atom2.x,
      atom3.y - atom2.y,
      atom3.z - atom2.z
    ).normalize();

    return {
      vertex: v,
      dir1: d1,
      dir2: d2,
      lineEnd1: v.clone().add(d1.clone().multiplyScalar(radius)),
      lineEnd2: v.clone().add(d2.clone().multiplyScalar(radius)),
    };
  }, [atom1, atom2, atom3]);

  // Generate arc points using quaternion slerp
  const arcPoints = useMemo(() => {
    const segments = 20;
    const points: THREE.Vector3[] = [];

    const q1 = new THREE.Quaternion();
    const q2 = new THREE.Quaternion().setFromUnitVectors(dir1, dir2);
    const qTemp = new THREE.Quaternion();

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      qTemp.slerpQuaternions(q1, q2, t);
      const dir = dir1.clone().applyQuaternion(qTemp);
      points.push(vertex.clone().add(dir.multiplyScalar(radius)));
    }

    return points;
  }, [vertex, dir1, dir2]);

  // Pre-calculate arc midpoint (static)
  const arcMidpoint = useMemo(() => {
    const bisector = new THREE.Vector3().addVectors(dir1, dir2).normalize();
    return vertex.clone().add(bisector.multiplyScalar(radius));
  }, [vertex, dir1, dir2]);

  // Update label position every frame based on camera
  useFrame((state) => {
    if (labelRef.current) {
      const cameraDir = camera.position.clone().sub(arcMidpoint).normalize();
      const cameraOffset = 0.8;
      const labelPos = arcMidpoint.clone().add(cameraDir.multiplyScalar(cameraOffset));
      labelRef.current.position.copy(labelPos);
    }
    if (pulseRef.current && isHighlighted) {
      const scale = 1 + 0.3 * Math.sin(state.clock.elapsedTime * 4);
      pulseRef.current.scale.setScalar(scale);
    }
  });

  const lineWidth = isHighlighted ? 4 : 2;

  return (
    <group>
      {/* Line from vertex toward atom1 */}
      <Line points={[vertex, lineEnd1]} color={color} lineWidth={lineWidth} />
      {/* Line from vertex toward atom3 */}
      <Line points={[vertex, lineEnd2]} color={color} lineWidth={lineWidth} />
      {/* Arc connecting the lines */}
      <Line points={arcPoints} color={color} lineWidth={lineWidth} />
      {/* Label - position updated dynamically via useFrame */}
      <group ref={labelRef}>
        <Text
          fontSize={isHighlighted ? 0.9 : 0.7}
          color={color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.05}
          outlineColor={outlineColor}
        >
          {label}
        </Text>
        {isHighlighted && (
          <mesh ref={pulseRef}>
            <ringGeometry args={[0.7, 1.0, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
    </group>
  );
}
