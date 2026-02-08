import type { Atom, QualifiedAtomRef, Structure } from '../types';

export type MeasurementType = 'distance' | 'angle' | 'dihedral';

/**
 * Measurement with cross-structure support
 */
export interface Measurement {
  id: string;
  type: MeasurementType;
  /** @deprecated Use atomRefs instead for multi-structure support */
  atomIndices: number[];
  /** Qualified atom references with structure context */
  atomRefs: QualifiedAtomRef[];
  value: number;
  unit: string;
}

export function calculateDistance(atom1: Atom, atom2: Atom): number {
  const dx = atom2.x - atom1.x;
  const dy = atom2.y - atom1.y;
  const dz = atom2.z - atom1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function calculateAngle(atom1: Atom, atom2: Atom, atom3: Atom): number {
  // Vector from atom2 to atom1
  const v1 = {
    x: atom1.x - atom2.x,
    y: atom1.y - atom2.y,
    z: atom1.z - atom2.z,
  };

  // Vector from atom2 to atom3
  const v2 = {
    x: atom3.x - atom2.x,
    y: atom3.y - atom2.y,
    z: atom3.z - atom2.z,
  };

  // Dot product
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;

  // Magnitudes
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

  // Angle in radians, then convert to degrees
  const cosAngle = dot / (mag1 * mag2);
  const clampedCos = Math.max(-1, Math.min(1, cosAngle));
  return (Math.acos(clampedCos) * 180) / Math.PI;
}

export function calculateDihedral(
  atom1: Atom,
  atom2: Atom,
  atom3: Atom,
  atom4: Atom
): number {
  // Vectors along the bonds
  const b1 = {
    x: atom2.x - atom1.x,
    y: atom2.y - atom1.y,
    z: atom2.z - atom1.z,
  };

  const b2 = {
    x: atom3.x - atom2.x,
    y: atom3.y - atom2.y,
    z: atom3.z - atom2.z,
  };

  const b3 = {
    x: atom4.x - atom3.x,
    y: atom4.y - atom3.y,
    z: atom4.z - atom3.z,
  };

  // Cross products
  const n1 = cross(b1, b2);
  const n2 = cross(b2, b3);

  // Normalize b2 for reference
  const b2Mag = Math.sqrt(b2.x * b2.x + b2.y * b2.y + b2.z * b2.z);
  const b2Norm = {
    x: b2.x / b2Mag,
    y: b2.y / b2Mag,
    z: b2.z / b2Mag,
  };

  // m1 = n1 x b2_normalized
  const m1 = cross(n1, b2Norm);

  // Calculate dihedral
  const x = dot(n1, n2);
  const y = dot(m1, n2);

  return (Math.atan2(y, x) * 180) / Math.PI;
}

function cross(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function formatMeasurement(measurement: Measurement): string {
  switch (measurement.type) {
    case 'distance':
      return `${measurement.value.toFixed(2)} Å`;
    case 'angle':
      return `${measurement.value.toFixed(1)}°`;
    case 'dihedral':
      return `${measurement.value.toFixed(1)}°`;
  }
}

export function createMeasurement(
  type: MeasurementType,
  atoms: Atom[],
  atomIndices: number[],
  atomRefs?: QualifiedAtomRef[]
): Measurement {
  let value: number;
  let unit: string;

  switch (type) {
    case 'distance':
      value = calculateDistance(atoms[0], atoms[1]);
      unit = 'Å';
      break;
    case 'angle':
      value = calculateAngle(atoms[0], atoms[1], atoms[2]);
      unit = '°';
      break;
    case 'dihedral':
      value = calculateDihedral(atoms[0], atoms[1], atoms[2], atoms[3]);
      unit = '°';
      break;
  }

  return {
    id: `${type}-${Date.now()}`,
    type,
    atomIndices,
    atomRefs: atomRefs || atomIndices.map(idx => ({ structureId: '', atomIndex: idx })),
    value,
    unit,
  };
}

/**
 * Create a measurement from qualified atom references (supports cross-structure measurements)
 */
export function createMeasurementFromAtomRefs(
  type: MeasurementType,
  atomRefs: QualifiedAtomRef[],
  structures: Map<string, Structure>
): Measurement | null {
  // Resolve atoms from refs
  const atoms: Atom[] = [];
  for (const ref of atomRefs) {
    const structure = structures.get(ref.structureId);
    if (!structure) return null;
    const atom = structure.molecule.atoms[ref.atomIndex];
    if (!atom) return null;

    // For cross-structure measurements, we need to apply the structure offset
    // to get the correct world-space position
    atoms.push({
      ...atom,
      x: atom.x + structure.offset[0],
      y: atom.y + structure.offset[1],
      z: atom.z + structure.offset[2],
    });
  }

  let value: number;
  let unit: string;

  switch (type) {
    case 'distance':
      if (atoms.length < 2) return null;
      value = calculateDistance(atoms[0], atoms[1]);
      unit = 'Å';
      break;
    case 'angle':
      if (atoms.length < 3) return null;
      value = calculateAngle(atoms[0], atoms[1], atoms[2]);
      unit = '°';
      break;
    case 'dihedral':
      if (atoms.length < 4) return null;
      value = calculateDihedral(atoms[0], atoms[1], atoms[2], atoms[3]);
      unit = '°';
      break;
  }

  return {
    id: `${type}-${Date.now()}`,
    type,
    atomIndices: atomRefs.map(ref => ref.atomIndex), // For backward compatibility
    atomRefs,
    value,
    unit,
  };
}

export function getMeasurementAtomCount(type: MeasurementType): number {
  switch (type) {
    case 'distance':
      return 2;
    case 'angle':
      return 3;
    case 'dihedral':
      return 4;
  }
}
