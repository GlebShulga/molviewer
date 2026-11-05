const matches = (query: string) =>
  typeof window !== 'undefined' && window.matchMedia?.(query).matches === true;

let lastPointerType: string | null = null;
if (typeof window !== 'undefined') {
  // Capture: seen before any handler can stop it
  window.addEventListener('pointerdown', (e) => { lastPointerType = e.pointerType; }, { capture: true, passive: true });
}

/**
 * Whether the person is using a finger: a phone or tablet (a coarse primary
 * pointer), or any screen they last touched. Hardware checks alone get this
 * wrong both ways: some touch screens report a fine pointer, and some desktop
 * browsers report touch support. For wording ("Tap" rather than "Click").
 */
export function usesTouch(): boolean {
  return lastPointerType === 'touch' || matches('(pointer: coarse)');
}

/**
 * A phone or tablet: a finger is the primary pointer. For limits that depend
 * on the device rather than on the last input (a mouse on a tablet doesn't
 * make it any faster).
 */
export function isTouchScreen(): boolean {
  return matches('(pointer: coarse)');
}

/**
 * Phone-sized viewer or a finger as the main pointer: the viewer docks its
 * atom card above the toolbar instead of floating a tooltip over the molecule.
 * 768px is where the toolbar moves to the bottom (Toolbar.module.css).
 */
export function prefersDockedCards(): boolean {
  return matches('(max-width: 768px)') || matches('(pointer: coarse)');
}
