import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { AromaticRing } from '../../types';
import { AROMATIC } from '../../config';

export interface AromaticRingsProps {
  rings: AromaticRing[];
  color?: string;
  opacity?: number;
  visible?: boolean;
}

/**
 * Creates dashed circle points for aromatic ring visualization.
 * Returns an array of line segments (each segment is an array of points).
 */
function createDashedCirclePoints(
  radius: number,
  dashCount: number = AROMATIC.dashCount
): [number, number, number][][] {
  const segments: [number, number, number][][] = [];
  const totalAngle = 2 * Math.PI;
  const dashAngle = totalAngle / (dashCount * 2);

  for (let i = 0; i < dashCount; i++) {
    const startAngle = i * dashAngle * 2;
    const endAngle = startAngle + dashAngle;

    const segmentPoints: [number, number, number][] = [];
    const pointsPerSegment = 6;

    for (let j = 0; j <= pointsPerSegment; j++) {
      const angle = startAngle + (endAngle - startAngle) * (j / pointsPerSegment);
      segmentPoints.push([
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0
      ]);
    }
    segments.push(segmentPoints);
  }

  return segments;
}

function AromaticRingIndicator({ ring, color, opacity }: {
  ring: AromaticRing;
  color: string;
  opacity: number;
}) {
  const { center, normal, radius } = ring;

  const segments = useMemo(() => {
    return createDashedCirclePoints(radius * AROMATIC.radiusScale);
  }, [radius]);

  // Calculate rotation to align with ring plane
  const quaternion = useMemo(() => {
    const up = new THREE.Vector3(0, 0, 1);
    const ringNormal = new THREE.Vector3(normal.x, normal.y, normal.z);
    return new THREE.Quaternion().setFromUnitVectors(up, ringNormal);
  }, [normal.x, normal.y, normal.z]);

  return (
    <group
      position={[center.x, center.y, center.z]}
      quaternion={quaternion}
    >
      {segments.map((segmentPoints, idx) => (
        <Line
          key={idx}
          points={segmentPoints}
          color={color}
          lineWidth={AROMATIC.lineWidth}
          transparent
          opacity={opacity}
        />
      ))}
    </group>
  );
}

export function AromaticRings({
  rings,
  color = AROMATIC.color,
  opacity = AROMATIC.opacity,
  visible = true,
}: AromaticRingsProps) {
  if (!visible || !rings || rings.length === 0) {
    return null;
  }

  return (
    <group>
      {rings.map((ring, index) => (
        <AromaticRingIndicator
          key={index}
          ring={ring}
          color={color}
          opacity={opacity}
        />
      ))}
    </group>
  );
}
