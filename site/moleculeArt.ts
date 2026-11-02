/**
 * Molecule pictures for the social cards (site/build/ogCards.ts), drawn as SVG
 * from the compact geometry in data/og-art/*.json (written by
 * scripts/build-og-art.ts).
 *
 * - Proteins, nucleic acids and AlphaFold models: one sphere per residue
 *   (CA, or P for nucleic acids), drawn back to front. Far spheres are mixed
 *   towards the background as a depth cue, in a few depth bins so the number
 *   of gradients stays at colors x bins. PDB entries are colored by chain and
 *   AlphaFold models by pLDDT band, as in the app.
 * - Compounds: ball-and-stick with CPK colors, the look of the home page art.
 *
 * Pure string building, so the same geometry always gives the same SVG (the
 * card cache key depends on it).
 */
import { getChainColor } from '../src/colors/domains/chains';
import { PLDDT_BANDS } from '../src/colors/domains/plddt';
import { getElementColor } from '../src/colors/domains/elements';

/**
 * Spheres for a protein, nucleic acid or AlphaFold model. Coordinates are
 * oriented (long axis along x, thinnest along z, towards the viewer) and
 * quantized to integers in -127..127.
 */
export interface BeadArt {
  /** Sphere radius, in coordinate units. */
  r: number;
  /** Base64 of int8 x, y, z and uint8 group per sphere. */
  a: string;
  /** PDB: chain ID per group. Absent for AlphaFold, where the group is the pLDDT band (0 = very high). */
  g?: string[];
}

/** Atoms and bonds of a small molecule, quantized like BeadArt. */
export interface BallStickArt {
  /** Coordinate units per ångström (sets atom and bond sizes). */
  k: number;
  /** Element symbols, indexed by the atom's element byte. */
  e: string[];
  /** Base64 of int8 x, y, z and uint8 element index per atom. */
  a: string;
  /** Bonded atom index pairs, flat. */
  b: number[];
}

export interface OgArtFile<T> {
  _comment?: string;
  entries: Record<string, T>;
}

/** Mixes a #rrggbb color towards white (t > 0) or black (t < 0). */
export function shade(hex: string, t: number): string {
  return mix(hex, t > 0 ? '#ffffff' : '#000000', Math.abs(t));
}

/** Mixes #rrggbb `a` towards `b` by `t` (0..1). */
export function mix(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const channel = (shift: number) => {
    const ca = (na >> shift) & 255;
    return Math.round(ca + (((nb >> shift) & 255) - ca) * t);
  };
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`;
}

export interface Point {
  x: number;
  y: number;
  z: number;
  /** Group (chain, pLDDT band) or element index. */
  g: number;
}

/** Decode the base64 int8/uint8 records of BeadArt.a and BallStickArt.a. */
export function decodePoints(b64: string): Point[] {
  const bin = atob(b64);
  const int8 = (i: number) => {
    const v = bin.charCodeAt(i);
    return v > 127 ? v - 256 : v;
  };
  const out: Point[] = [];
  for (let i = 0; i + 3 < bin.length; i += 4) {
    out.push({ x: int8(i), y: int8(i + 1), z: int8(i + 2), g: bin.charCodeAt(i + 3) });
  }
  return out;
}

const DEPTH_BINS = 4;
/** How far the back bin is mixed towards the background. */
const DEPTH_FADE = 0.55;

const fmt = (v: number) => String(Math.round(v * 10) / 10);

function gradient(id: string, color: string): string {
  return (
    `<radialGradient id="${id}" cx="35%" cy="35%" r="65%">` +
    `<stop offset="0%" stop-color="${shade(color, 0.5)}"/>` +
    `<stop offset="55%" stop-color="${color}"/>` +
    `<stop offset="100%" stop-color="${shade(color, -0.45)}"/>` +
    `</radialGradient>`
  );
}

/** viewBox around the points (SVG y grows downwards, so y is flipped by the callers). */
function viewBox(points: { x: number; y: number; r: number }[]): string {
  const minX = Math.min(...points.map((p) => p.x - p.r));
  const maxX = Math.max(...points.map((p) => p.x + p.r));
  const minY = Math.min(...points.map((p) => p.y - p.r));
  const maxY = Math.max(...points.map((p) => p.y + p.r));
  const m = Math.max(maxX - minX, maxY - minY) * 0.03;
  return [minX - m, minY - m, maxX - minX + 2 * m, maxY - minY + 2 * m].map(fmt).join(' ');
}

function svgDoc(size: number, box: string, defs: string[], body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${box}"><defs>${defs.join('')}</defs>${body}</svg>`;
}

/**
 * Spheres colored by `colorOf(group)`, back to front, with a depth cue
 * towards `background`. Returns null when there is nothing to draw.
 */
export function beadSvg(art: BeadArt, colorOf: (group: number) => string, background: string, size: number): string | null {
  const points = decodePoints(art.a);
  if (!points.length) return null;
  const zs = points.map((p) => p.z);
  const zMin = Math.min(...zs);
  const zSpan = Math.max(...zs) - zMin;
  // A flat structure is all in front, not all at the back.
  const binOf = (z: number) => (zSpan ? Math.min(DEPTH_BINS - 1, Math.floor(((z - zMin) / zSpan) * DEPTH_BINS)) : DEPTH_BINS - 1);

  const colors = new Map<string, number>(); // color -> index in gradient ids
  const used = new Set<string>();
  const defs: string[] = [];
  const circles = [...points]
    .sort((a, b) => a.z - b.z)
    .map((p) => {
      const color = colorOf(p.g);
      if (!colors.has(color)) colors.set(color, colors.size);
      const bin = binOf(p.z);
      const id = `c${colors.get(color)}d${bin}`;
      if (!used.has(id)) {
        used.add(id);
        const fade = (DEPTH_FADE * (DEPTH_BINS - 1 - bin)) / (DEPTH_BINS - 1);
        defs.push(gradient(id, mix(color, background, fade)));
      }
      return `<circle cx="${p.x}" cy="${-p.y}" r="${fmt(art.r)}" fill="url(#${id})"/>`;
    });
  return svgDoc(size, viewBox(points.map((p) => ({ x: p.x, y: -p.y, r: art.r }))), defs, circles.join(''));
}

/** Atom radii in ångströms, as in the home page art (other elements: 0.3). */
const ATOM_RADII: Record<string, number> = { H: 0.2, C: 0.3, N: 0.28, O: 0.28 };
const BOND_WIDTH = 0.16;

/** Ball-and-stick drawing of a small molecule. Returns null when there is nothing to draw. */
export function ballStickSvg(art: BallStickArt, bondColor: string, size: number): string | null {
  const atoms = decodePoints(art.a).map((p, index) => {
    const element = art.e[p.g] ?? 'C';
    return { index, element, x: p.x, y: -p.y, z: p.z, r: (ATOM_RADII[element] ?? 0.3) * art.k };
  });
  if (!atoms.length) return null;
  const defs = [...new Set(atoms.map((a) => a.element))].sort().map((e) => gradient(`e${e}`, getElementColor(e)));
  const bonds: string[] = [];
  for (let i = 0; i + 1 < art.b.length; i += 2) {
    const a = atoms[art.b[i]];
    const b = atoms[art.b[i + 1]];
    if (a && b) bonds.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
  }
  const body =
    `<g stroke="${bondColor}" stroke-width="${fmt(BOND_WIDTH * art.k)}" stroke-linecap="round">${bonds.join('')}</g>` +
    [...atoms]
      .sort((a, b) => a.z - b.z || a.index - b.index)
      .map((a) => `<circle cx="${a.x}" cy="${a.y}" r="${fmt(a.r)}" fill="url(#e${a.element})"/>`)
      .join('');
  return svgDoc(size, viewBox(atoms), defs, body);
}

/** PDB entry, colored by chain like the app's chain scheme. */
export function pdbArtSvg(art: BeadArt, background: string, size: number): string | null {
  return beadSvg(art, (g) => getChainColor(art.g?.[g]), background, size);
}

/** AlphaFold model, colored by AlphaFold DB's pLDDT bands. */
export function afArtSvg(art: BeadArt, background: string, size: number): string | null {
  return beadSvg(art, (g) => PLDDT_BANDS[Math.min(g, PLDDT_BANDS.length - 1)].color, background, size);
}
