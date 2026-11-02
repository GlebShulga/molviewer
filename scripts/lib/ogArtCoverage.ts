/**
 * Which curated entries have no social-card picture in data/og-art/ yet, for
 * the validators to warn about (never an error: those cards fall back to text).
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OG_ART_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/og-art');

export async function missingOgArt(file: 'pdb.json' | 'af.json' | 'compound.json', ids: string[]): Promise<string | null> {
  let entries: Record<string, unknown> = {};
  try {
    entries = (JSON.parse(await readFile(resolve(OG_ART_DIR, file), 'utf8')) as { entries: Record<string, unknown> }).entries;
  } catch {
    // No file yet: every entry is missing.
  }
  const missing = ids.filter((id) => !entries[id]);
  if (!missing.length) return null;
  const shown = missing.slice(0, 10).join(', ');
  return `data/og-art/${file}: ${missing.length} entries have no card picture (${shown}${missing.length > 10 ? ', ...' : ''}); run pnpm og:art`;
}
