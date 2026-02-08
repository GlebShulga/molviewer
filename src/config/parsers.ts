/**
 * Parser configuration and format specifications.
 */

export const PARSER_CONFIG = {
  /** Tolerance for bond inference based on covalent radii */
  bondTolerance: 0.4,
  /** Minimum distance to consider a valid bond */
  minBondDistance: 0.4,
  /** Maximum file size in bytes (5MB) */
  maxFileSize: 5 * 1024 * 1024,
} as const;

/** PDB format column specifications (0-indexed) */
export const PDB_COLUMNS = {
  recordType: [0, 6],
  serial: [6, 11],
  atomName: [12, 16],
  residueName: [17, 20],
  chainId: [21, 22],
  residueNumber: [22, 26],
  x: [30, 38],
  y: [38, 46],
  z: [46, 54],
  occupancy: [54, 60],
  tempFactor: [60, 66],
  element: [76, 78],
} as const;

/** SDF/MOL format column specifications (0-indexed) */
export const SDF_COLUMNS = {
  atomCount: [0, 3],
  bondCount: [3, 6],
  atomX: [0, 10],
  atomY: [10, 20],
  atomZ: [20, 30],
  atomElement: [31, 34],
  bondAtom1: [0, 3],
  bondAtom2: [3, 6],
  bondType: [6, 9],
} as const;

export const ALLOWED_EXTENSIONS = /\.(pdb|mmcif|cif(\.gz)?|sdf|mol|xyz)$/i;
