import { useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { Atom } from '../../../types';

export interface DihedralMeasurementProps {
  atom1: Atom;
  atom2: Atom;
  atom3: Atom;
  atom4: Atom;
  label: string;
  color: string;
  outlineColor: string;
  isHighlighted?: boolean;
}

export function DihedralMeasurement({
  atom1,
  atom2,
  atom3,
  atom4,
  label,
  color,
  outlineColor,
  isHighlighted = false,
}: DihedralMeasurementProps) {
  const { camera } = useThree();
  const labelRef = useRef<THREE.Group>(null);
  const pulseRef = useRef<THREE.Mesh>(null);

  const points = useMemo(
    () => [
      new THREE.Vector3(atom1.x, atom1.y, atom1.z),
      new THREE.Vector3(atom2.x, atom2.y, atom2.z),
      new THREE.Vector3(atom3.x, atom3.y, atom3.z),
      new THREE.Vector3(atom4.x, atom4.y, atom4.z),
    ],
    [atom1, atom2, atom3, atom4]
  );

  // Calculate sector geometry (Mol*-style filled wedge)
  const { sectorGeometry, arcPoints, sectorCenter, armStart, armEnd } = useMemo(() => {
    const pos1 = new THREE.Vector3(atom1.x, atom1.y, atom1.z);
    const pos2 = new THREE.Vector3(atom2.x, atom2.y, atom2.z);
    const pos3 = new THREE.Vector3(atom3.x, atom3.y, atom3.z);
    const pos4 = new THREE.Vector3(atom4.x, atom4.y, atom4.z);

    // Central axis (bond 2-3)
    const axis = pos3.clone().sub(pos2).normalize();
    const center = pos2.clone().add(pos3).multiplyScalar(0.5);

    // Project atom1 and atom4 directions onto the perpendicular plane
    const v1 = pos1.clone().sub(center);
    const v4 = pos4.clone().sub(center);

    // Remove component along axis to get perpendicular projection
    const proj1 = v1.clone().sub(axis.clone().multiplyScalar(v1.dot(axis))).normalize();
    const proj4 = v4.clone().sub(axis.clone().multiplyScalar(v4.dot(axis))).normalize();

    // Sector radius
    const radius = 1.2;
    const segments = 24;

    // Calculate angle between projections
    let angle = Math.acos(Math.max(-1, Math.min(1, proj1.dot(proj4))));

    // Determine sign of angle using cross product
    const cross = new THREE.Vector3().crossVectors(proj1, proj4);
    if (cross.dot(axis) < 0) {
      angle = -angle;
    }

    // Generate sector triangles (fan from center)
    const vertices: number[] = [];
    const arcPts: THREE.Vector3[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const currentAngle = t * angle;

      // Rotate proj1 around axis by currentAngle
      const q = new THREE.Quaternion().setFromAxisAngle(axis, currentAngle);
      const dir = proj1.clone().applyQuaternion(q);
      const point = center.clone().add(dir.multiplyScalar(radius));
      arcPts.push(point);

      // Add triangle vertices (center, current point, next point)
      if (i < segments) {
        const nextAngle = ((i + 1) / segments) * angle;
        const qNext = new THREE.Quaternion().setFromAxisAngle(axis, nextAngle);
        const dirNext = proj1.clone().applyQuaternion(qNext);
        const nextPoint = center.clone().add(dirNext.multiplyScalar(radius));

        // Triangle: center -> current -> next
        vertices.push(center.x, center.y, center.z);
        vertices.push(point.x, point.y, point.z);
        vertices.push(nextPoint.x, nextPoint.y, nextPoint.z);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();

    // Arm endpoints (from center to arc start/end)
    const armStartPt = center.clone().add(proj1.clone().multiplyScalar(radius));
    const armEndPt = center.clone().add(proj4.clone().multiplyScalar(radius));

    return {
      sectorGeometry: geometry,
      arcPoints: arcPts,
      sectorCenter: center,
      armStart: armStartPt,
      armEnd: armEndPt,
    };
  }, [atom1, atom2, atom3, atom4]);

  // Update label position every frame based on camera
  useFrame((state) => {
    if (labelRef.current) {
      const cameraDir = camera.position.clone().sub(sectorCenter).normalize();
      labelRef.current.position.copy(sectorCenter.clone().add(cameraDir.multiplyScalar(0.8)));
    }
    if (pulseRef.current && isHighlighted) {
      const scale = 1 + 0.3 * Math.sin(state.clock.elapsedTime * 4);
      pulseRef.current.scale.setScalar(scale);
    }
  });

  const lineWidth = isHighlighted ? 4 : 2;

  return (
    <group>
      {/* Dashed line through all 4 atoms */}
      <Line
        points={points}
        color={color}
        lineWidth={isHighlighted ? 5 : 3}
        dashed
        dashSize={0.25}
        gapSize={0.12}
      />

      {/* Filled sector (wedge) showing dihedral angle */}
      <mesh geometry={sectorGeometry}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isHighlighted ? 0.5 : 0.35}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Arc outline */}
      <Line points={arcPoints} color={color} lineWidth={lineWidth} />

      {/* Arm lines from center to arc endpoints - shows the angle boundaries */}
      <Line points={[sectorCenter, armStart]} color={color} lineWidth={lineWidth} />
      <Line points={[sectorCenter, armEnd]} color={color} lineWidth={lineWidth} />

      {/* Label */}
      <group ref={labelRef}>
        <Text
          fontSize={isHighlighted ? 1.0 : 0.8}
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
            <ringGeometry args={[0.8, 1.2, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
    </group>
  );
}
