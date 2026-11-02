/**
 * Geometry for the social-card molecule art (site/moleculeArt.ts): orient a
 * structure on its principal axes, downsample big ones and quantize to the
 * compact BeadArt / BallStickArt records stored in data/og-art/*.json.
 */
import type { BallStickArt, BeadArt } from '../../site/moleculeArt';

export interface Vec {
  x: number;
  y: number;
  z: number;
}

/** At 520 px, more spheres than this add bytes and render time, not detail. */
export const MAX_BEADS = 1000;
/** Sphere radius for one residue (CA spacing is 3.8 Å), before downsampling. */
const BEAD_RADIUS = 2.4;
const QUANT = 127;

/** Eigen-decomposition of a symmetric 3x3 matrix (Jacobi). Columns of `vectors` are eigenvectors. */
function eigenSymmetric3(m: number[][]): { values: number[]; vectors: number[][] } {
  const a = m.map((row) => [...row]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2;
    if (off < 1e-18) break;
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      if (Math.abs(a[p][q]) < 1e-12) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p];
        const akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k];
        const aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p];
        const vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], vectors: v };
}

/**
 * Rotate points so the axis of largest spread is x, the next is y and the
 * thinnest is z (towards the viewer), centered on the bounding box.
 * Eigenvector signs are fixed (largest component positive) so the result is
 * deterministic.
 */
export function orient<T extends Vec>(points: T[]): T[] {
  if (!points.length) return [];
  const n = points.length;
  const c = { x: 0, y: 0, z: 0 };
  for (const p of points) {
    c.x += p.x / n;
    c.y += p.y / n;
    c.z += p.z / n;
  }
  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const p of points) {
    const d = [p.x - c.x, p.y - c.y, p.z - c.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += (d[i] * d[j]) / n;
  }
  const { values, vectors } = eigenSymmetric3(cov);
  const order = [0, 1, 2].sort((i, j) => values[j] - values[i]);
  const axes = order.map((col) => {
    const axis = [vectors[0][col], vectors[1][col], vectors[2][col]];
    const big = axis.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0);
    return big < 0 ? axis.map((x) => -x) : axis;
  });
  // Right-handed frame, so the picture is never mirrored: z = x cross y.
  const [ax, ay] = axes;
  const az = [ax[1] * ay[2] - ax[2] * ay[1], ax[2] * ay[0] - ax[0] * ay[2], ax[0] * ay[1] - ax[1] * ay[0]];
  const rotated = points.map((p) => {
    const d = [p.x - c.x, p.y - c.y, p.z - c.z];
    const dot = (axis: number[]) => axis[0] * d[0] + axis[1] * d[1] + axis[2] * d[2];
    return { ...p, x: dot(ax), y: dot(ay), z: dot(az) };
  });
  return recenter(rotated);
}

/** Move the bounding box center to the origin. */
export function recenter<T extends Vec>(points: T[]): T[] {
  const mid = (key: 'x' | 'y' | 'z') => {
    const vals = points.map((p) => p[key]);
    return (Math.min(...vals) + Math.max(...vals)) / 2;
  };
  const m = { x: mid('x'), y: mid('y'), z: mid('z') };
  return points.map((p) => ({ ...p, x: p.x - m.x, y: p.y - m.y, z: p.z - m.z }));
}

/** Keep every n-th point so at most `max` remain (chains stay continuous). */
export function downsample<T>(points: T[], max: number): { points: T[]; stride: number } {
  const stride = Math.max(1, Math.ceil(points.length / max));
  return { points: stride === 1 ? points : points.filter((_, i) => i % stride === 0), stride };
}

/** Scale centered points into int8 and pack them with a byte each (group or element index). */
function pack(points: (Vec & { g: number })[]): { a: string; k: number } {
  const maxAbs = Math.max(...points.flatMap((p) => [Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)])) || 1;
  const k = QUANT / maxAbs;
  const bytes = new Uint8Array(points.length * 4);
  points.forEach((p, i) => {
    bytes[i * 4] = Math.round(p.x * k) & 255;
    bytes[i * 4 + 1] = Math.round(p.y * k) & 255;
    bytes[i * 4 + 2] = Math.round(p.z * k) & 255;
    bytes[i * 4 + 3] = Math.min(255, p.g);
  });
  return { a: Buffer.from(bytes).toString('base64'), k };
}

/**
 * Residue spheres (CA or P) for a PDB entry or AlphaFold model. `group` is
 * the chain index into `groups` (PDB) or the pLDDT band (AlphaFold).
 */
export function beadArt(points: (Vec & { group: number })[], groups?: string[]): BeadArt | null {
  if (!points.length) return null;
  const { points: kept, stride } = downsample(points, MAX_BEADS);
  const { a, k } = pack(orient(kept).map((p) => ({ ...p, g: p.group })));
  // Fewer spheres cover the same volume: grow them with the cube root of the stride.
  const radius = beadRadius(points) * (stride > 1 ? 1.5 * Math.cbrt(stride) : 1);
  const r = Math.round(radius * k * 10) / 10;
  return groups ? { r, a, g: groups } : { r, a };
}

/**
 * Sphere radius from the typical spacing of consecutive residues in a chain:
 * 3.8 Å between CA atoms gives the protein default, the ~6 Å between
 * nucleic acid P atoms gives bigger spheres so the backbone stays closed.
 */
function beadRadius(points: (Vec & { group: number })[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1];
    const q = points[i];
    if (p.group !== q.group) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
    if (d < 9) gaps.push(d); // longer: a chain break, not a neighbor
  }
  if (!gaps.length) return BEAD_RADIUS;
  gaps.sort((x, y) => x - y);
  return (BEAD_RADIUS / 3.8) * gaps[Math.floor(gaps.length / 2)];
}

/** Heavy atoms and the bonds between them, for a compound. */
export function ballStickArt(atoms: (Vec & { element: string })[], bonds: [number, number][]): BallStickArt | null {
  const heavy = atoms.map((atom, index) => ({ ...atom, index })).filter((a) => a.element.toUpperCase() !== 'H');
  if (!heavy.length) return null;
  const newIndex = new Map(heavy.map((a, i) => [a.index, i]));
  const elements = [...new Set(heavy.map((a) => a.element))].sort();
  const b = bonds.flatMap(([i, j]) => {
    const ni = newIndex.get(i);
    const nj = newIndex.get(j);
    return ni === undefined || nj === undefined ? [] : [ni, nj];
  });
  // Rolling moves the bounding box off center.
  const posed = recenter(faceOn(orient(heavy), b));
  const { a, k } = pack(posed.map((p) => ({ ...p, g: elements.indexOf(p.element) })));
  return { k: Math.round(k * 1000) / 1000, e: elements, a, b };
}

/**
 * Roll the molecule about its long axis (x) to the angle where bonds look
 * longest on screen, so rings face the viewer instead of showing edge-on
 * (PCA alone puts cholesterol's ring system edge-on, for example).
 */
export function faceOn<T extends Vec>(points: T[], bonds: number[]): T[] {
  const roll = (deg: number) => {
    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    return points.map((p) => ({ ...p, y: p.y * c - p.z * s, z: p.y * s + p.z * c }));
  };
  let best = points;
  let bestScore = -1;
  for (let deg = 0; deg < 180; deg += 5) {
    const rolled = roll(deg);
    let score = 0;
    for (let i = 0; i + 1 < bonds.length; i += 2) {
      const p = rolled[bonds[i]];
      const q = rolled[bonds[i + 1]];
      score += Math.hypot(q.x - p.x, q.y - p.y);
    }
    // Strictly better only, so ties keep the smaller angle (deterministic).
    if (score > bestScore + 1e-9) {
      best = rolled;
      bestScore = score;
    }
  }
  return best;
}
