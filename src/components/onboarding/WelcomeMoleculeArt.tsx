import { useId } from 'react';
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

const BOND_WIDTH = 0.16;

/** Fixed tilt so the flat ring system shows some depth. */
const TILT_Y = (25 * Math.PI) / 180;
const TILT_X = (15 * Math.PI) / 180;

/**
 * Projected once at module load: rotate around Y then X, drop z. SVG y grows
 * downwards, so y is flipped. z is kept only for back-to-front ordering.
 */
const PROJECTED = ATOMS.map(({ element, position: [x, y, z] }, index) => {
  const x1 = x * Math.cos(TILT_Y) + z * Math.sin(TILT_Y);
  const z1 = -x * Math.sin(TILT_Y) + z * Math.cos(TILT_Y);
  const y2 = y * Math.cos(TILT_X) - z1 * Math.sin(TILT_X);
  const z2 = y * Math.sin(TILT_X) + z1 * Math.cos(TILT_X);
  return { index, element, x: x1, y: -y2, z: z2, r: ATOM_RADII[element] ?? 0.25 };
});

const ATOMS_BACK_TO_FRONT = [...PROJECTED].sort((a, b) => a.z - b.z);

const ELEMENTS_PRESENT = [...new Set(ATOMS.map((a) => a.element))];

// The old canvas framed the molecule at about three quarters of its height.
const VIEW_BOX = (() => {
  const minX = Math.min(...PROJECTED.map((a) => a.x - a.r));
  const maxX = Math.max(...PROJECTED.map((a) => a.x + a.r));
  const minY = Math.min(...PROJECTED.map((a) => a.y - a.r));
  const maxY = Math.max(...PROJECTED.map((a) => a.y + a.r));
  const margin = (maxY - minY) * 0.15;
  return [minX - margin, minY - margin, maxX - minX + 2 * margin, maxY - minY + 2 * margin]
    .map((v) => v.toFixed(2))
    .join(' ');
})();

/** Mixes a #rrggbb color towards white (t > 0) or black (t < 0). */
function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  const channel = (c: number) => Math.round(c + (target - c) * k);
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Static caffeine drawing behind the welcome text (no WebGL on first visit). */
export function WelcomeMoleculeArt({ className }: { className?: string }) {
  const idPrefix = useId();
  const gradientId = (element: string) => `${idPrefix}-atom-${element}`;

  return (
    <svg
      className={className}
      viewBox={VIEW_BOX}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {ELEMENTS_PRESENT.map((element) => {
          const color = getElementColor(element);
          return (
            <radialGradient key={element} id={gradientId(element)} cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor={shade(color, 0.6)} />
              <stop offset="55%" stopColor={color} />
              <stop offset="100%" stopColor={shade(color, -0.45)} />
            </radialGradient>
          );
        })}
      </defs>
      <g style={{ stroke: 'var(--text-secondary)' }} strokeWidth={BOND_WIDTH} strokeLinecap="round">
        {BONDS.map(([i, j]) => (
          <line
            key={`${i}-${j}`}
            x1={PROJECTED[i].x}
            y1={PROJECTED[i].y}
            x2={PROJECTED[j].x}
            y2={PROJECTED[j].y}
          />
        ))}
      </g>
      {ATOMS_BACK_TO_FRONT.map((atom) => (
        <circle key={atom.index} cx={atom.x} cy={atom.y} r={atom.r} fill={`url(#${gradientId(atom.element)})`} />
      ))}
    </svg>
  );
}
