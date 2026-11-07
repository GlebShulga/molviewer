/**
 * A file the parser recognizes but can't read (for example a V3000 molfile).
 * Its message says why, and parseByFilename shows it as is instead of the
 * generic "could not parse" message.
 */
export class UnsupportedFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedFormatError';
  }
}
