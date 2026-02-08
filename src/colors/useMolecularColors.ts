import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { getMolecularColors, type MolecularColorPalette } from './themes';

/**
 * Hook to get theme-aware molecular colors in React components
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const colors = useMolecularColors();
 *   return <div style={{ color: colors.secondaryStructureUI.helix }}>Helix</div>;
 * }
 * ```
 */
export function useMolecularColors(): MolecularColorPalette {
  const { theme } = useTheme();
  return useMemo(() => getMolecularColors(theme), [theme]);
}
