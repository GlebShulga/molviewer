import type { CSSProperties } from 'react';

const LABEL_FONT_SIZE_NORMAL = '12px';
const LABEL_FONT_SIZE_HIGHLIGHTED = '14px';

export const labelWrapperStyle: CSSProperties = { pointerEvents: 'none' };

export function getLabelStyle(color: string, isHighlighted: boolean): CSSProperties {
  return {
    color,
    fontSize: isHighlighted ? LABEL_FONT_SIZE_HIGHLIGHTED : LABEL_FONT_SIZE_NORMAL,
    fontWeight: isHighlighted ? 'bold' : 'normal',
    background: 'rgba(0,0,0,0.7)',
    padding: '2px 6px',
    borderRadius: '3px',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  };
}
