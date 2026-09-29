/** Small formatting helpers for landing pages. */
import type { ResidueRef, SsSegment } from '../upstream/types';

/** 2 -> "2.0", 1.74 -> "1.74", 0.48 -> "0.48". */
export function formatResolution(r: number): string {
  const twoDecimals = r.toFixed(2);
  return twoDecimals.endsWith('0') ? r.toFixed(1) : twoDecimals;
}

/** "X-RAY DIFFRACTION" -> "X-ray diffraction". */
export function formatMethod(method: string): string {
  const lower = method.toLowerCase();
  return (lower.charAt(0).toUpperCase() + lower.slice(1)).replace(/\bnmr\b/i, 'NMR');
}

/** Short noun for page titles: "crystal structure", "cryo-EM structure", "NMR structure". */
export function methodNoun(method: string | undefined): string {
  if (!method) return 'structure';
  const m = method.toUpperCase();
  if (m.includes('X-RAY')) return 'crystal structure';
  if (m.includes('ELECTRON MICROSCOPY') || m.includes('CRYO')) return 'cryo-EM structure';
  if (m.includes('ELECTRON CRYSTALLOGRAPHY')) return 'electron crystallography structure';
  if (m.includes('NMR')) return 'NMR structure';
  if (m.includes('NEUTRON')) return 'neutron structure';
  return 'structure';
}

export function formatResidue(r: ResidueRef): string {
  return `${r.number}${r.insertionCode ?? ''}`;
}

/** "12-25" (a single-residue segment renders as "12"). */
export function formatRange(seg: SsSegment): string {
  const a = formatResidue(seg.start);
  const b = formatResidue(seg.end);
  return a === b ? a : `${a}-${b}`;
}

/** "2024-05-22" -> "22 May 2024". */
export function formatDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function pluralize(n: number, word: string, plural = `${word}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? word : plural}`;
}

/** Join names as "A, B and C". */
export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
