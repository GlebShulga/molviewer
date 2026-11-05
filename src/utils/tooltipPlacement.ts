interface Point {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

/** Gap between the pointer and the tooltip. */
const OFFSET = 10;
/** Closest the tooltip gets to a viewport edge. */
const MARGIN = 8;

/**
 * Where a pointer tooltip goes: below and right of the pointer, flipped to the
 * other side when it would leave the viewport there, and clamped so it stays
 * MARGIN inside it (a tooltip larger than the viewport starts at the margin).
 */
export function placeTooltip(anchor: Point, size: Size, viewport: Size): { left: number; top: number } {
  return {
    left: placeAxis(anchor.x, size.width, viewport.width),
    top: placeAxis(anchor.y, size.height, viewport.height),
  };
}

function placeAxis(anchor: number, size: number, viewport: number): number {
  let start = anchor + OFFSET;
  if (start + size > viewport - MARGIN) {
    start = anchor - OFFSET - size;
  }
  return Math.max(MARGIN, Math.min(start, viewport - MARGIN - size));
}
