/**
 * Atom tooltips on touch screens. The tooltip normally follows the mouse
 * (hover), which a finger can't do: around a tap the browser fires
 * pointermove/pointerout, and pointerout cleared the tooltip at once. So:
 *
 * - atom renderers (ImpostorAtoms, LODAtoms, SelectableAtom) ignore touch
 *   pointerover/pointermove/pointerout (isTouchPointer);
 * - a tap on an atom shows its tooltip (lastPointerWasTouch, in onClick);
 * - any new touch on the canvas hides it (this hook), so dragging to rotate or
 *   tapping empty space closes it, and tapping another atom shows that one.
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useMoleculeStore } from '../store/moleculeStore';

let lastPointerType = 'mouse';

/** Whether the last pointerdown on the canvas was a finger (clicks don't always carry pointerType). */
export function lastPointerWasTouch(): boolean {
  return lastPointerType === 'touch';
}

/** Whether a DOM or React Three Fiber pointer event comes from a finger. */
export function isTouchPointer(event: unknown): boolean {
  const e = event as { pointerType?: string; nativeEvent?: { pointerType?: string } } | undefined;
  return (e?.pointerType ?? e?.nativeEvent?.pointerType) === 'touch';
}

/** Call once inside the Canvas (MoleculeScene does). */
export function useTouchTooltip(): void {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const onPointerDown = (e: PointerEvent) => {
      lastPointerType = e.pointerType;
      if (e.pointerType === 'touch' && useMoleculeStore.getState().hoveredAtom) {
        useMoleculeStore.getState().setHoveredAtom(null, null, null, null);
      }
    };
    // Capture: runs before the renderers' own handlers for the same gesture.
    canvas.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => canvas.removeEventListener('pointerdown', onPointerDown, { capture: true });
  }, [gl]);
}
