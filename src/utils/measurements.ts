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

type Point = { x: number; y: number; z: number };

/**
 * Dihedral angle p1-p2-p3-p4 in degrees, in (-180, 180], with the IUPAC sign:
 * looking along p2→p3, a clockwise turn from the front bond to the back bond
 * is positive. Collinear atoms (no defined plane) give 0.
 */
export function dihedralAngle(p1: Point, p2: Point, p3: Point, p4: Point): number {
  const b1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
  const b2 = { x: p3.x - p2.x, y: p3.y - p2.y, z: p3.z - p2.z };
  const b3 = { x: p4.x - p3.x, y: p4.y - p3.y, z: p4.z - p3.z };

  const n1 = cross(b1, b2);
  const n2 = cross(b2, b3);
  if (Math.hypot(n1.x, n1.y, n1.z) < 1e-8 || Math.hypot(n2.x, n2.y, n2.z) < 1e-8) {
    return 0;
  }

  const b2Length = Math.hypot(b2.x, b2.y, b2.z);
  const y = b2Length * dot(b1, n2);
  const x = dot(n1, n2);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function calculateDihedral(
  atom1: Atom,
  atom2: Atom,
  atom3: Atom,
  atom4: Atom
): number {
  return dihedralAngle(atom1, atom2, atom3, atom4);
}

function cross(a: Point, b: Point) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Point, b: Point) {
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
 * Dihedral values recomputed from the atoms, for measurements read back from
 * storage: versions before the IUPAC sign fix stored the opposite sign.
 * Other types and dihedrals whose atoms are gone keep their stored value.
 */
export function refreshDihedrals(
  measurements: Measurement[],
  structures: Map<string, Structure>
): Measurement[] {
  return measurements.map((m) => {
    if (m.type !== 'dihedral') return m;
    const fresh = createMeasurementFromAtomRefs(m.type, m.atomRefs, structures);
    return fresh ? { ...m, value: fresh.value } : m;
  });
}

/**
 * Whether recomputing a stored measurement on these atoms gives back its stored
 * value. Dihedrals compare magnitudes, since versions before the IUPAC sign fix
 * stored the opposite sign. Used to tell whether a stored measurement belongs
 * to the atoms it now points at.
 */
export function matchesStoredValue(
  measurement: Measurement,
  structures: Map<string, Structure>
): boolean {
  const fresh = createMeasurementFromAtomRefs(measurement.type, measurement.atomRefs, structures);
  if (!fresh) return false;
  if (measurement.type === 'distance') return Math.abs(fresh.value - measurement.value) < 0.01;
  if (measurement.type === 'angle') return Math.abs(fresh.value - measurement.value) < 0.1;
  return Math.abs(Math.abs(fresh.value) - Math.abs(measurement.value)) < 0.1;
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
