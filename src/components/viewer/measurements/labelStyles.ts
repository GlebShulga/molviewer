import type { CSSProperties } from 'react';

const LABEL_FONT_SIZE_NORMAL = '14px';
const LABEL_FONT_SIZE_HIGHLIGHTED = '15px';

export const labelWrapperStyle: CSSProperties = { pointerEvents: 'none' };

/**
 * A theme-colored pill, so the value reads on any background; the
 * measurement's own color marks it as a left border. drei's Html renders into
 * the page, so the theme's CSS variables apply.
 */
export function getLabelStyle(color: string, isHighlighted: boolean): CSSProperties {
  return {
    color: 'var(--text-primary)',
    fontSize: isHighlighted ? LABEL_FONT_SIZE_HIGHLIGHTED : LABEL_FONT_SIZE_NORMAL,
    fontWeight: isHighlighted ? 'bold' : 600,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderLeft: `4px solid ${color}`,
    padding: '2px 8px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  };
}
