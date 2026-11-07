import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { segmentSplineByStructure, type SplinePoint } from '../splineGeneration';
import { splitAtChainBreaks, type BackboneResidue } from '../backboneExtraction';
import type { SecondaryStructure } from '../../types';

const point = (i: number, ss: SecondaryStructure): SplinePoint => ({
  position: new THREE.Vector3(i, 0, 0),
  tangent: new THREE.Vector3(1, 0, 0),
  normal: new THREE.Vector3(0, 1, 0),
  binormal: new THREE.Vector3(0, 0, 1),
  secondaryStructure: ss,
  residueIndex: Math.floor(i / 4),
  chainId: 'A',
});

describe('segmentSplineByStructure', () => {
  it('shares the boundary point between consecutive segments, so the cartoon has no gap', () => {
    const types: SecondaryStructure[] = ['coil', 'coil', 'coil', 'helix', 'helix', 'helix', 'sheet', 'sheet'];
    const segments = segmentSplineByStructure(types.map((t, i) => point(i, t)));
    expect(segments.map((s) => s.type)).toEqual(['coil', 'helix', 'sheet']);
    for (let k = 0; k + 1 < segments.length; k++) {
      expect(segments[k].points.at(-1)).toBe(segments[k + 1].points[0]);
    }
    for (const s of segments) expect(new Set(s.points).size).toBe(s.points.length);
  });
});

describe('splitAtChainBreaks', () => {
  const aa = (n: number, x: number): BackboneResidue => ({ residueNumber: n, chainId: 'A', residueName: 'ALA', ca: { x, y: 0, z: 0 }, secondaryStructure: 'coil', atomIndex: n });
  const nt = (n: number, x: number): BackboneResidue => ({ residueNumber: n, chainId: 'B', residueName: 'DA', ca: { x: 0, y: 0, z: 0 }, p: { x, y: 0, z: 0 }, secondaryStructure: 'coil', atomIndex: n });

  it('keeps a protein chain whole across a numbering gap when its alpha carbons are 3.8 Å apart', () => {
    expect(splitAtChainBreaks([aa(97, 0), aa(100, 3.8), aa(101, 7.6)]).map((p) => p.length)).toEqual([3]);
  });

  it('splits a protein chain at a real break', () => {
    expect(splitAtChainBreaks([aa(1, 0), aa(2, 3.8), aa(3, 11.8), aa(4, 15.6)]).map((p) => p.length)).toEqual([2, 2]);
  });

  it('keeps a nucleotide chain whole at its 6.5 Å phosphate spacing, numbering gap or not', () => {
    expect(splitAtChainBreaks([nt(1, 0), nt(2, 6.5), nt(5, 13)]).map((p) => p.length)).toEqual([3]);
  });

  it('splits a nucleotide chain at a 12 Å phosphate break', () => {
    expect(splitAtChainBreaks([nt(1, 0), nt(2, 6.5), nt(3, 18.5), nt(4, 25)]).map((p) => p.length)).toEqual([2, 2]);
  });
});
