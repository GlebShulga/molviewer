/**
 * AlphaFold confidence (pLDDT) colors, the four bands AlphaFold DB uses
 * (alphafold.ebi.ac.uk), so a model looks the same here as on its home page
 * and in every explanation of it. AlphaFold files store pLDDT in the B-factor
 * column, so this replaces the B-factor gradient for AlphaFold models.
 */
export const PLDDT_BANDS = [
  { min: 90, color: '#0053d6', label: 'Very high', range: '> 90' },
  { min: 70, color: '#65cbf3', label: 'Confident', range: '70-90' },
  { min: 50, color: '#ffdb13', label: 'Low', range: '50-70' },
  { min: -Infinity, color: '#ff7d45', label: 'Very low', range: '< 50' },
] as const;

/** Band color for a pLDDT value (0-100). Boundaries match site/upstream PlddtFractions. */
export function getPlddtColor(plddt: number): string {
  return (PLDDT_BANDS.find((b) => plddt > b.min) ?? PLDDT_BANDS[PLDDT_BANDS.length - 1]).color;
}
