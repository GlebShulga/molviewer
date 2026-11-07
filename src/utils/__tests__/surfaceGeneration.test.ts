import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as surface from '../surfaceGeneration';
import type { Atom } from '../../types';

beforeAll(() => {
  // generateSurface logs its grid; jsdom has no WebGL, so the CPU path runs
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const carbon = (id: number, x: number, y = 0, z = 0): Atom => ({ id, element: 'C', x, y, z });

describe('CPU surface grid', () => {
  it('reads a point inside one atom as inside, even when another atom\'s edge is closer', () => {
    // 0.5 Å from A's centre (1.2 Å inside it), 0.4 Å outside B's surface
    const atoms = [carbon(0, 0), carbon(1, 2.6)];
    const { sd, nearest } = surface.hardSphereSignedDistance({ x: 0.5, y: 0, z: 0 }, atoms, [1.7, 1.7], [0, 1]);
    expect(sd).toBeLessThan(0);
    expect(nearest).toBe(0);
  });

  it('samples on grid corners, with the last sample at or past the far bound', () => {
    const bounds = { minX: 0, minY: 0, minZ: 0, maxX: 10.2, maxY: 4, maxZ: 0.5 };
    const step = 4;
    expect(surface.gridSamplePosition(bounds, step, 0, 0, 0)).toEqual({ x: 0, y: 0, z: 0 });
    const { w, h, d } = surface.gridDims(bounds, step);
    const last = surface.gridSamplePosition(bounds, step, w - 1, h - 1, d - 1);
    expect(last.x).toBeGreaterThanOrEqual(bounds.maxX);
    expect(last.y).toBeGreaterThanOrEqual(bounds.maxY);
    expect(last.z).toBeGreaterThanOrEqual(bounds.maxZ);
  });

  it('centres a single atom\'s surface on the atom', () => {
    const { vertices } = surface.generateSurface([carbon(0, 0)], { type: 'vdw', resolution: 1.0 });
    expect(vertices.length).toBeGreaterThan(0);
    const centroid = [0, 1, 2].map((axis) => {
      let sum = 0;
      for (let i = axis; i < vertices.length; i += 3) sum += vertices[i];
      return sum / (vertices.length / 3);
    });
    for (const c of centroid) expect(Math.abs(c)).toBeLessThan(0.1);
  });
});

describe('surface winding', () => {
  it('winds triangles so a closed surface has positive volume (faces point outward)', () => {
    const { vertices, indices } = surface.generateSurface([carbon(0, 0)], { type: 'vdw', resolution: 1.0 });
    let volume = 0;
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]].map((i) => [vertices[3 * i], vertices[3 * i + 1], vertices[3 * i + 2]]);
      // Signed tetrahedron volume with the origin: a · (b × c) / 6
      volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    expect(volume).toBeGreaterThan(0);
  });
});
