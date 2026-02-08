import { useMemo } from 'react';
import clsx from 'clsx';
import { useMoleculeStore, type RepresentationType, type ColorScheme } from '../../store/moleculeStore';
import { useActiveStructure } from '../../hooks';
import { calculateColorSchemeContext } from '../../utils';
import styles from './ControlPanel.module.css';

const REPRESENTATIONS: { value: RepresentationType; label: string; description?: string; disabledDescription?: string }[] = [
  { value: 'ball-and-stick', label: 'Ball & Stick', description: 'Atoms as spheres, bonds as cylinders' },
  { value: 'stick', label: 'Stick', description: 'Bonds only' },
  { value: 'spacefill', label: 'Spacefill', description: 'Van der Waals spheres' },
  { value: 'cartoon', label: 'Cartoon', description: 'Protein/nucleic acid backbone', disabledDescription: 'Requires backbone atoms (CA or P)' },
  { value: 'surface-vdw', label: 'Surface', description: 'Van der Waals molecular surface' },
];

const COLOR_SCHEMES: { value: ColorScheme; label: string; description: string; disabledDescription: string; notForCartoon?: boolean }[] = [
  { value: 'cpk', label: 'CPK', description: 'Color by element', disabledDescription: 'Not available for Cartoon', notForCartoon: true },
  { value: 'chain', label: 'Chain', description: 'Color by chain ID', disabledDescription: '' },
  { value: 'residueType', label: 'Residue', description: 'Color by amino acid type', disabledDescription: 'No residue data available' },
  { value: 'bfactor', label: 'B-factor', description: 'Blue (low) → Red (high)', disabledDescription: 'No B-factor data available' },
  { value: 'rainbow', label: 'Rainbow', description: 'N-terminus → C-terminus', disabledDescription: 'No residue sequence data available' },
  { value: 'secondaryStructure', label: 'Structure', description: 'Helix/Sheet/Coil coloring', disabledDescription: 'No secondary structure data' },
];

export function ControlPanel() {
  // Use new hooks for cleaner access to active structure
  const activeStructure = useActiveStructure();
  // Use store actions directly - they handle activeStructureId internally
  const setRepresentation = useMoleculeStore(s => s.setRepresentation);
  const setColorScheme = useMoleculeStore(s => s.setColorScheme);

  // Derive properties from active structure
  const molecule = activeStructure?.molecule;
  const representation = activeStructure?.representation ?? 'ball-and-stick';
  const colorScheme = activeStructure?.colorScheme ?? 'cpk';
  const visible = activeStructure?.visible ?? true;

  const colorContext = useMemo(
    () => molecule ? calculateColorSchemeContext(molecule) : null,
    [molecule]
  );

  if (!molecule || !activeStructure) {
    return null;
  }

  const isSchemeAvailable = (scheme: ColorScheme, schemeConfig: typeof COLOR_SCHEMES[0]): boolean => {
    // Disable all schemes if structure is hidden
    if (!visible) return false;
    if (!colorContext) return false;

    const hasBackbone = colorContext.hasBackboneData === true;
    const atomCount = molecule?.atoms.length ?? 0;
    const isComplexProtein = hasBackbone && atomCount > 500;

    // CPK doesn't make sense for Cartoon or complex proteins
    if (schemeConfig.notForCartoon && (representation === 'cartoon' || isComplexProtein)) {
      return false;
    }

    // Residue Type creates noise at scale
    if (scheme === 'residueType' && isComplexProtein) {
      return false;
    }

    switch (scheme) {
      case 'residueType':
        return colorContext.hasResidueData === true;
      case 'bfactor':
        return colorContext.hasBfactorData === true;
      case 'rainbow':
        return colorContext.hasResidueNumbers === true;
      case 'secondaryStructure':
        // Available if we have SS data or backbone data (SS can be detected)
        return colorContext.hasSecondaryStructure === true || hasBackbone;
      default:
        return true;
    }
  };

  const isRepAvailable = (rep: typeof REPRESENTATIONS[0]): boolean => {
    // Disable all representations if structure is hidden
    if (!visible) return false;
    const hasBackbone = colorContext?.hasBackboneData === true;
    const atomCount = molecule?.atoms.length ?? 0;
    const isComplexProtein = hasBackbone && atomCount > 500;

    if (isComplexProtein) {
      // For complex proteins: only Cartoon and Surface make sense
      return rep.value === 'cartoon' || rep.value === 'surface-vdw';
    }

    // For simple molecules: Cartoon requires backbone
    if (rep.value === 'cartoon') {
      return hasBackbone;
    }

    // Surface, Ball & Stick, Stick, Spacefill always available for simple molecules
    return true;
  };

  return (
    <div className={styles.controlPanel}>
      {/* Representation Section */}
      <div className={styles.controlSection}>
        <h3 className={styles.controlTitle}>Representation</h3>
        <div className={styles.controlOptions}>
          {REPRESENTATIONS.map((rep) => {
            const available = isRepAvailable(rep);
            return (
              <button
                key={rep.value}
                className={clsx(styles.controlButton, representation === rep.value && styles.active)}
                onClick={() => setRepresentation(rep.value)}
                aria-pressed={representation === rep.value}
                title={!visible ? 'Structure is hidden' : (available ? rep.description : rep.disabledDescription)}
                disabled={!available}
              >
                {rep.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Color Scheme Section */}
      <div className={styles.controlSection}>
        <h3 className={styles.controlTitle}>Color Scheme</h3>
        <div className={styles.controlOptions}>
          {COLOR_SCHEMES.map((scheme) => {
            const available = isSchemeAvailable(scheme.value, scheme);
            return (
              <button
                key={scheme.value}
                className={clsx(styles.controlButton, colorScheme === scheme.value && styles.active)}
                onClick={() => setColorScheme(scheme.value)}
                aria-pressed={colorScheme === scheme.value}
                title={!visible ? 'Structure is hidden' : (available ? scheme.description : scheme.disabledDescription)}
                disabled={!available}
              >
                {scheme.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.moleculeInfo}>
        <h3 className={styles.controlTitle}>Molecule Info</h3>
        <p><strong>Name:</strong> {molecule.name}</p>
        <p><strong>Atoms:</strong> {molecule.atoms.length}</p>
        <p><strong>Bonds:</strong> {molecule.bonds.length}</p>
      </div>
    </div>
  );
}
