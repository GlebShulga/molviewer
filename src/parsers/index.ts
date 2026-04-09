export { parsePDB, type PDBParserOptions } from './pdbParser';
export { parseSDF, type SDFParserOptions } from './sdfParser';
export { parseXYZ, type XYZParserOptions } from './xyzParser';
export { parseMMCIF, type MMCIFParserOptions } from './mmcifParser';

import { parsePDB } from './pdbParser';
import { parseSDF } from './sdfParser';
import { parseXYZ } from './xyzParser';
import { parseMMCIF } from './mmcifParser';
import { getFileExtension, detectFormat } from '../utils/fileValidation';
import type { Molecule } from '../types';

/**
 * Parse molecule content by format string (e.g. 'pdb', 'cif', 'sdf', 'xyz').
 */
export function parseByFormat(content: string, format: string): Molecule {
  switch (format) {
    case 'pdb':
      return parsePDB(content);
    case 'cif':
    case 'mmcif':
      return parseMMCIF(content);
    case 'sdf':
    case 'mol':
      return parseSDF(content);
    case 'xyz':
      return parseXYZ(content);
    default:
      throw new Error(`Unsupported file format: .${format}`);
  }
}

/**
 * Parse molecule content using filename for extension detection,
 * with content-based fallback if extension parsing fails.
 */
export function parseByFilename(content: string, filename: string): Molecule {
  const normalizedFilename = filename.replace(/\.gz$/i, '');
  const extension = getFileExtension(normalizedFilename);

  try {
    return parseByFormat(content, extension);
  } catch {
    const detected = detectFormat(content);
    if (detected && detected !== extension) {
      return parseByFormat(content, detected);
    }
    throw new Error(
      `Could not parse file. The file may be empty, corrupted, or in a format that doesn't match its .${extension} extension. Supported formats: PDB, mmCIF, SDF, MOL, XYZ.`
    );
  }
}
