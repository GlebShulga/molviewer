import { useMoleculeStore } from '../../store/moleculeStore';
import { selectActiveStructure } from '../../store/selectors';
import { PLDDT_BANDS, useMolecularColors } from '../../colors';
import { isAlphaFoldMolecule } from '../../utils/atomColor';
import styles from './ViewerOverlays.module.css';

/**
 * A key for the two color schemes whose colors mean something you can't guess:
 * secondary structure and AlphaFold confidence (pLDDT, the B-factor scheme on
 * AF-* models). Other schemes (element, chain, rainbow) explain themselves.
 */
export function ColorLegend() {
  const structure = useMoleculeStore(selectActiveStructure);
  const { secondaryStructure } = useMolecularColors();
  if (!structure || !structure.visible) return null;

  let entries: { label: string; color: string }[] | null = null;
  let name = '';
  if (structure.colorScheme === 'secondaryStructure') {
    name = 'Secondary structure';
    entries = [
      { label: 'Helix', color: secondaryStructure.helix },
      { label: 'Sheet', color: secondaryStructure.sheet },
      { label: 'Coil', color: secondaryStructure.coil },
    ];
  } else if (structure.colorScheme === 'bfactor' && isAlphaFoldMolecule(structure.molecule)) {
    name = 'AlphaFold confidence (pLDDT)';
    entries = PLDDT_BANDS.map((band) => ({ label: band.range, color: band.color }));
  }
  if (!entries) return null;

  return (
    <ul className={styles.legend} aria-label={name} title={name} data-testid="color-legend">
      {entries.map((entry) => (
        <li key={entry.label} className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ backgroundColor: entry.color }} aria-hidden="true" />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}
