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
 * Get chain color by chain ID.
 *
 * A hash of every character (mmCIF chain ids like "AA", "AB" are common in
 * large assemblies). A single character hashes to its own code, so chains
 * A-Z keep the colours they always had; 37 is not 1 mod 10 (the palette
 * size), so the order of characters matters ("AB" and "BA" differ), which a
 * multiplier like 31 would not give.
 */
export function getChainColor(chainId: string | undefined): string {
  if (!chainId) return CHAIN_COLORS[0];
  let h = 0;
  for (let i = 0; i < chainId.length; i++) h = (h * 37 + chainId.charCodeAt(i)) >>> 0;
  return CHAIN_COLORS[h % CHAIN_COLORS.length];
}
