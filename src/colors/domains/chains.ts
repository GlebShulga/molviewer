/**
 * Chain colors for coloring by chain ID
 * Standard 10-color palette for multi-chain structures
 */
export const CHAIN_COLORS: string[] = [
  "#1f77b4", // blue
  "#ff7f0e", // orange
  "#2ca02c", // green
  "#d62728", // red
  "#9467bd", // purple
  "#8c564b", // brown
  "#e377c2", // pink
  "#7f7f7f", // gray
  "#bcbd22", // olive
  "#17becf", // cyan
];

/**
 * Get chain color by chain ID
 * Uses character code modulo to cycle through colors
 */
export function getChainColor(chainId: string | undefined): string {
  if (!chainId) return CHAIN_COLORS[0];
  const index = chainId.charCodeAt(0) % CHAIN_COLORS.length;
  return CHAIN_COLORS[index];
}
