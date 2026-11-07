import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSectorGeometry } from '../DihedralMeasurement';
import type { Atom } from '../../../../types';

const atoms = (shift = 0): [Atom, Atom, Atom, Atom] => [
  { id: 0, element: 'C', x: 0 + shift, y: 1, z: 0 },
  { id: 1, element: 'C', x: 0 + shift, y: 0, z: 0 },
  { id: 2, element: 'C', x: 1.5 + shift, y: 0, z: 0 },
  { id: 3, element: 'C', x: 1.5 + shift, y: 0, z: 1 },
];

describe('useSectorGeometry', () => {
  it('keeps the geometry for new atom objects at the same coordinates', () => {
    const { result, rerender } = renderHook(({ a }) => useSectorGeometry(...a), { initialProps: { a: atoms() } });
    const first = result.current.sectorGeometry;
    const dispose = vi.spyOn(first, 'dispose');
    rerender({ a: atoms() });
    expect(result.current.sectorGeometry).toBe(first);
    expect(dispose).not.toHaveBeenCalled();
  });

  it('disposes the old geometry when the coordinates change, and the last one on unmount', () => {
    const { result, rerender, unmount } = renderHook(({ a }) => useSectorGeometry(...a), { initialProps: { a: atoms() } });
    const first = result.current.sectorGeometry;
    const disposeFirst = vi.spyOn(first, 'dispose');
    rerender({ a: atoms(5) });
    const second = result.current.sectorGeometry;
    expect(second).not.toBe(first);
    expect(disposeFirst).toHaveBeenCalledTimes(1);
    const disposeSecond = vi.spyOn(second, 'dispose');
    unmount();
    expect(disposeSecond).toHaveBeenCalledTimes(1);
  });
});
