import { PARSER_CONFIG, ALLOWED_EXTENSIONS } from '../config';

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileValidationError';
  }
}

/**
 * Validates a file before parsing.
 * Throws FileValidationError if validation fails.
 */
export function validateFile(file: File): void {
  if (!ALLOWED_EXTENSIONS.test(file.name)) {
    const ext = file.name.split('.').pop() || 'unknown';
    throw new FileValidationError(
      `Unsupported file format: .${ext}. Supported formats: PDB, CIF, SDF, MOL, XYZ`
    );
  }

  if (file.size > PARSER_CONFIG.maxFileSize) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    const maxMB = (PARSER_CONFIG.maxFileSize / (1024 * 1024)).toFixed(0);
    throw new FileValidationError(
      `File too large: ${sizeMB}MB. Maximum allowed: ${maxMB}MB`
    );
  }

  if (file.size === 0) {
    throw new FileValidationError('File is empty');
  }
}

/**
 * Gets the file extension in lowercase.
 */
export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

export type DetectedFileFormat = 'pdb' | 'cif' | 'sdf' | 'xyz';

/**
 * Detects molecular file format by inspecting content (first ~20 lines).
 * Used as a fallback when extension-based parsing fails.
 * Returns null if format cannot be determined.
 */
export function detectFormat(content: string): DetectedFileFormat | null {
  const lines = content.split('\n', 20);

  for (const line of lines) {
    // mmCIF: starts with "data_" or contains "_atom_site."
    if (/^data_/i.test(line) || line.includes('_atom_site.')) {
      return 'cif';
    }
    // PDB: line starts with "ATOM  " or "HETATM" (6-char column)
    if (/^(ATOM {2}|HETATM)/.test(line)) {
      return 'pdb';
    }
  }

  // SDF/MOL: line 4 contains V2000 or V3000 counts line
  if (lines.length >= 4 && /V[23]000/.test(lines[3])) {
    return 'sdf';
  }

  // XYZ: first line is a bare integer (atom count)
  if (lines.length >= 1 && /^\s*\d+\s*$/.test(lines[0])) {
    return 'xyz';
  }

  return null;
}
