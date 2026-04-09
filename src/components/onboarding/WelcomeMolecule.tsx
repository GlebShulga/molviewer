import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getElementColor } from '../../colors/domains/elements';

// Caffeine (C8H10N4O2) — fused purine ring system with 3 methyl groups
// Approximate positions in Angstroms
const ATOMS: { element: string; position: [number, number, number] }[] = [
  // Pyrimidine ring (6-membered)
  { element: 'N', position: [-1.2, 0.7, 0] }, // 0  N1
  { element: 'C', position: [0, 1.4, 0] }, // 1  C2
  { element: 'N', position: [1.2, 0.7, 0] }, // 2  N3
  { element: 'C', position: [1.2, -0.7, 0] }, // 3  C4
  { element: 'C', position: [0, -1.2, 0] }, // 4  C5
  { element: 'C', position: [-1.2, -0.5, 0] }, // 5  C6
  // Imidazole ring (5-membered, fused at C4-C5)
  { element: 'N', position: [0.3, -2.4, 0] }, // 6  N7
  { element: 'C', position: [1.6, -2.5, 0] }, // 7  C8
  { element: 'N', position: [2.2, -1.4, 0] }, // 8  N9
  // Exocyclic oxygens
  { element: 'O', position: [0, 2.6, 0] }, // 9  O (on C2)
  { element: 'O', position: [-2.3, -1.0, 0] }, // 10 O (on C6)
  // Methyl carbons
  { element: 'C', position: [-2.4, 1.3, 0.3] }, // 11 CH3 on N1
  { element: 'C', position: [2.4, 1.3, -0.3] }, // 12 CH3 on N3
  { element: 'C', position: [-0.5, -3.6, 0.3] }, // 13 CH3 on N7
  // H on C8
  { element: 'H', position: [2.1, -3.4, 0] }, // 14
  // H on methyl (N1)
  { element: 'H', position: [-3.0, 0.6, 0.8] }, // 15
  { element: 'H', position: [-3.0, 1.7, -0.3] }, // 16
  { element: 'H', position: [-2.1, 2.1, 1.0] }, // 17
  // H on methyl (N3)
  { element: 'H', position: [3.0, 0.6, -0.8] }, // 18
  { element: 'H', position: [3.0, 1.7, 0.3] }, // 19
  { element: 'H', position: [2.1, 2.1, -1.0] }, // 20
  // H on methyl (N7)
  { element: 'H', position: [-1.2, -3.9, -0.3] }, // 21
  { element: 'H', position: [-0.5, -4.1, 1.2] }, // 22
  { element: 'H', position: [0.3, -4.2, 0.0] }, // 23
];

const BONDS: [number, number][] = [
  // 6-membered ring
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 0],
  // 5-membered ring (fused)
  [4, 6],
  [6, 7],
  [7, 8],
  [8, 3],
  // Exocyclic double bonds
  [1, 9],
  [5, 10],
  // Methyl bonds
  [0, 11],
  [2, 12],
  [6, 13],
  // C-H
  [7, 14],
  // Methyl C-H
  [11, 15],
  [11, 16],
  [11, 17],
  [12, 18],
  [12, 19],
  [12, 20],
  [13, 21],
  [13, 22],
  [13, 23],
];

const ATOM_RADII: Record<string, number> = {
  C: 0.3,
  N: 0.28,
  O: 0.28,
  H: 0.2,
};

const BOND_RADIUS = 0.08;

function MoleculeGroup() {
  const groupRef = useRef<THREE.Group>(null);
  const prefersReducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  useFrame((_state, delta) => {
    if (groupRef.current && !prefersReducedMotion) {
      groupRef.current.rotation.y += delta * 0.3;
    }
  });

  // Pre-compute bond geometry data
  const bondData = useMemo(() => {
    return BONDS.map(([i, j]) => {
      const start = new THREE.Vector3(...ATOMS[i].position);
      const end = new THREE.Vector3(...ATOMS[j].position);
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      const direction = new THREE.Vector3().subVectors(end, start);
      const length = direction.length();

      // Quaternion to orient cylinder along bond direction
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());

      return { mid, length, quaternion };
    });
  }, []);

  return (
    <group ref={groupRef}>
      {/* Atoms */}
      {ATOMS.map((atom, i) => (
        <mesh key={`atom-${i}`} position={atom.position}>
          <sphereGeometry args={[ATOM_RADII[atom.element] ?? 0.25, 16, 16]} />
          <meshStandardMaterial color={getElementColor(atom.element)} />
        </mesh>
      ))}

      {/* Bonds */}
      {bondData.map((bond, i) => (
        <mesh key={`bond-${i}`} position={bond.mid} quaternion={bond.quaternion}>
          <cylinderGeometry args={[BOND_RADIUS, BOND_RADIUS, bond.length, 8]} />
          <meshStandardMaterial color="#888888" />
        </mesh>
      ))}
    </group>
  );
}

export function WelcomeMolecule() {
  return (
    <Canvas
      camera={{ position: [0, 1, 10], fov: 50 }}
      style={{ position: 'absolute', inset: 0, opacity: 0.5 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <MoleculeGroup />
    </Canvas>
  );
}
