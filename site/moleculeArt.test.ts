// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { afArtSvg, ballStickSvg, decodePoints, mix, pdbArtSvg, shade, type BeadArt } from './moleculeArt';
import { getChainColor } from '../src/colors/domains/chains';
import { PLDDT_BANDS } from '../src/colors/domains/plddt';
import { ballStickArt, beadArt, faceOn, MAX_BEADS, orient } from '../scripts/lib/ogArtGeometry';
import { cardKey, pdbCardSpec } from './build/ogCards';

const BG = '#0d1117';

/** Pack [x, y, z, group] records like scripts/lib/ogArtGeometry.ts does. */
function encode(points: number[][]): string {
  return Buffer.from(new Uint8Array(points.flatMap(([x, y, z, g]) => [x & 255, y & 255, z & 255, g]))).toString('base64');
}

const circles = (svg: string) => [...svg.matchAll(/<circle cx="(-?\d+)" cy="(-?\d+)"[^>]*fill="url\(#(\w+)\)"/g)];

describe('moleculeArt', () => {
  it('round-trips the packed points, negative coordinates included', () => {
    expect(decodePoints(encode([[-127, 0, 127, 3], [5, -6, 7, 0]]))).toEqual([
      { x: -127, y: 0, z: 127, g: 3 },
      { x: 5, y: -6, z: 7, g: 0 },
    ]);
  });

  it('draws spheres back to front, deterministically', () => {
    const art: BeadArt = { r: 10, a: encode([[0, 0, 50, 0], [10, 0, -50, 1], [20, 0, 0, 0]]), g: ['A', 'B'] };
    const svg = pdbArtSvg(art, BG, 520)!;
    expect(svg).toBe(pdbArtSvg(art, BG, 520));
    expect(circles(svg).map((m) => m[1])).toEqual(['10', '20', '0']);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="520" height="520"/);
  });

  it('colors PDB entries by chain and AlphaFold models by pLDDT band, fading the far ones', () => {
    const pdb = pdbArtSvg({ r: 10, a: encode([[0, 0, 0, 0], [30, 0, 100, 0]]), g: ['B'] }, BG, 520)!;
    // The front sphere has the chain color itself, the back one is mixed towards the background.
    expect(pdb).toContain(`stop-color="${getChainColor('B')}"`);
    expect(pdb).toContain(`stop-color="${mix(getChainColor('B'), BG, 0.55)}"`);
    const af = afArtSvg({ r: 10, a: encode([[0, 0, 0, 3], [30, 0, 0, 0]]) }, BG, 520)!;
    expect(af).toContain(PLDDT_BANDS[0].color);
    expect(af).toContain(PLDDT_BANDS[3].color);
  });

  it('keeps the gradient count at colors x depth bins', () => {
    const points = Array.from({ length: 400 }, (_, i) => [i % 100, (i * 7) % 100, (i * 13) % 200 - 100, i % 3]);
    const svg = pdbArtSvg({ r: 5, a: encode(points), g: ['A', 'B', 'C'] }, BG, 520)!;
    expect(circles(svg)).toHaveLength(400);
    expect(svg.match(/<radialGradient/g)!.length).toBeLessThanOrEqual(3 * 4);
  });

  it('returns null for empty geometry, so the card stays text-only', () => {
    expect(pdbArtSvg({ r: 1, a: '' }, BG, 520)).toBeNull();
    expect(ballStickSvg({ k: 1, e: [], a: '', b: [] }, '#999999', 520)).toBeNull();
  });

  it('draws compounds as CPK balls and sticks', () => {
    const art = ballStickArt(
      [
        { x: 0, y: 0, z: 0, element: 'C' },
        { x: 1.4, y: 0, z: 0, element: 'O' },
        { x: -0.5, y: 0.9, z: 0, element: 'H' },
      ],
      [
        [0, 1],
        [0, 2],
      ]
    )!;
    expect(art.e).toEqual(['C', 'O']);
    expect(art.b).toEqual([0, 1]); // the bond to hydrogen is dropped with the hydrogen
    const svg = ballStickSvg(art, '#999999', 520)!;
    expect(svg.match(/<line /g)).toHaveLength(1);
    expect(svg).toContain('id="eO"');
  });

  it('shade matches the home page art', () => {
    expect(shade('#808080', 0.5)).toBe('#c0c0c0');
    expect(shade('#808080', -0.5)).toBe('#404040');
  });
});

describe('og art geometry', () => {
  it('puts the long axis along x and the thinnest along z', () => {
    // A flat, elongated cloud tilted in space.
    const raw = Array.from({ length: 50 }, (_, i) => ({ u: i - 25, v: ((i * 7) % 11) - 5, w: ((i * 3) % 3) - 1 }));
    const tilted = raw.map(({ u, v, w }) => ({ x: 0.6 * u + 0.8 * w, y: v, z: -0.8 * u + 0.6 * w }));
    const spread = (pts: { x: number; y: number; z: number }[], k: 'x' | 'y' | 'z') => Math.max(...pts.map((p) => Math.abs(p[k])));
    const o = orient(tilted);
    expect(spread(o, 'x')).toBeGreaterThan(spread(o, 'y'));
    expect(spread(o, 'y')).toBeGreaterThan(spread(o, 'z'));
  });

  it('downsamples big structures and grows the spheres', () => {
    const chain = Array.from({ length: 3000 }, (_, i) => ({ x: i * 3.8, y: 0, z: 0, group: 0 }));
    const art = beadArt(chain, ['A'])!;
    expect(decodePoints(art.a).length).toBeLessThanOrEqual(MAX_BEADS);
    const small = beadArt(chain.slice(0, 900), ['A'])!;
    // Radius in ångströms (the straight chain spans ±127 units): keeping every
    // 3rd of 3000 residues needs bigger spheres than 900 residues kept whole.
    const radiusA = (a: BeadArt, n: number) => (a.r * ((n - 1) * 3.8)) / 2 / 127;
    expect(radiusA(art, 3000)).toBeGreaterThan(radiusA(small, 900) * 1.5);
  });

  it('rolls a ring to face the viewer', () => {
    // A hexagon in the x-z plane, seen edge-on.
    const ring = Array.from({ length: 6 }, (_, i) => ({ x: Math.cos((i * Math.PI) / 3) * 1.4, y: 0, z: Math.sin((i * Math.PI) / 3) * 1.4 }));
    const bonds = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 0];
    const faced = faceOn(ring, bonds);
    expect(Math.max(...faced.map((p) => Math.abs(p.y)))).toBeGreaterThan(1.2);
    expect(Math.max(...faced.map((p) => Math.abs(p.z)))).toBeLessThan(0.1);
  });
});

describe('og card cache key', () => {
  it('changes when the picture changes, and only then', () => {
    const seed = { id: '1XYZ', title: '', revised: '', method: 'X-RAY DIFFRACTION' };
    const a: BeadArt = { r: 10, a: encode([[0, 0, 0, 0]]), g: ['A'] };
    const b: BeadArt = { r: 10, a: encode([[0, 0, 0, 0], [20, 0, 0, 0]]), g: ['A'] };
    expect(cardKey(pdbCardSpec(seed, 'X', [], a))).toBe(cardKey(pdbCardSpec(seed, 'X', [], a)));
    expect(cardKey(pdbCardSpec(seed, 'X', [], a))).not.toBe(cardKey(pdbCardSpec(seed, 'X', [], b)));
    expect(cardKey(pdbCardSpec(seed, 'X', []))).not.toBe(cardKey(pdbCardSpec(seed, 'X', [], a)));
  });
});
