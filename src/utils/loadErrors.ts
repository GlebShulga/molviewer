/**
 * Why a structure load failed, as a coarse class for structure_load_failed
 * (src/utils/loadTracking.ts). Messages and stack traces still go to New Relic
 * through logError; the event carries only the class.
 */
import { FileValidationError } from './fileValidation';
import { UnsupportedFormatError } from '../parsers/errors';

export type LoadErrorClass = 'parse' | 'unsupported_format' | 'too_large' | 'network' | 'not_found' | 'webgl' | 'timeout' | 'other';

/** An error whose class is known where it is thrown (a 404, a failed request). */
export class LoadError extends Error {
  constructor(
    message: string,
    readonly loadClass: LoadErrorClass
  ) {
    super(message);
    this.name = 'LoadError';
  }
}

/** Errors thrown while reading a file's content, marked without changing them. */
const parseErrors = new WeakSet<object>();

/**
 * Marks an error thrown by a parser (or gzip) as a parse failure and returns
 * it, for `catch (err) { throw asParseError(err) }` around parsing. The error
 * itself is unchanged, so its message and stack reach the user and New Relic as before.
 */
export function asParseError(err: unknown): unknown {
  if (typeof err === 'object' && err !== null) parseErrors.add(err);
  return err;
}

export function classifyLoadError(err: unknown): LoadErrorClass {
  if (err instanceof LoadError) return err.loadClass;
  if (err instanceof UnsupportedFormatError) return 'unsupported_format';
  if (err instanceof FileValidationError) return err.reason === 'empty' ? 'parse' : err.reason;
  if (typeof err !== 'object' || err === null) return 'other';
  if (parseErrors.has(err)) return 'parse';
  const { name, message } = err as { name?: unknown; message?: unknown };
  // The loaders' own timeouts abort their requests
  if (name === 'AbortError' || name === 'TimeoutError') return 'timeout';
  // fetch() rejects with a TypeError when the request never got an answer
  if (err instanceof TypeError && /fetch|network|load failed/i.test(String(message))) return 'network';
  return 'other';
}
