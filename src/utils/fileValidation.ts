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
