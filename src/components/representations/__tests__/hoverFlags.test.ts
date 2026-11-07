import { describe, expect, it } from 'vitest';
import { hoverFlags } from '../ImpostorAtoms';

describe('hoverFlags', () => {
  const indices = [0, 1, 2, 3];

  it('marks the hovered atom of this structure', () => {
    expect(Array.from(hoverFlags(indices, 2, 'a', 'a'))).toEqual([0, 0, 1, 0]);
  });

  it('marks nothing when the hovered atom belongs to another structure with the same index', () => {
    expect(Array.from(hoverFlags(indices, 2, 'b', 'a'))).toEqual([0, 0, 0, 0]);
  });

  it('marks nothing when nothing is hovered', () => {
    expect(Array.from(hoverFlags(indices, null, null, 'a'))).toEqual([0, 0, 0, 0]);
  });
});
