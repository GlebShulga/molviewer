import { useMemo } from 'react';
import clsx from 'clsx';
import { useMoleculeStore, type RepresentationType, type ColorScheme } from '../../store/moleculeStore';
import { useActiveStructure } from '../../hooks';
import { calculateColorSchemeContext } from '../../utils/atomColor';
import {
  colorSchemeAvailability,
  representationAvailability,
  type Availability,
} from '../../utils/representationAvailability';
import { isTouchScreen } from '../../utils/touch';
import styles from './ControlPanel.module.css';

const REPRESENTATIONS: { value: RepresentationType; label: string; description: string }[] = [
  { value: 'ball-and-stick', label: 'Ball & Stick', description: 'Atoms as spheres, bonds as cylinders' },
  { value: 'stick', label: 'Stick', description: 'Bonds only' },
  { value: 'spacefill', label: 'Spacefill', description: 'Van der Waals spheres' },
  { value: 'cartoon', label: 'Cartoon', description: 'Protein/nucleic acid backbone' },
  { value: 'surface-vdw', label: 'Surface', description: 'Van der Waals molecular surface' },
];

const COLOR_SCHEMES: { value: ColorScheme; label: string; description: string }[] = [
  { value: 'cpk', label: 'CPK', description: 'Color by element' },
  { value: 'chain', label: 'Chain', description: 'Color by chain ID' },
  { value: 'residueType', label: 'Residue', description: 'Color by amino acid type' },
  { value: 'bfactor', label: 'B-factor', description: 'Blue (low) → Red (high)' },
  { value: 'rainbow', label: 'Rainbow', description: 'N-terminus → C-terminus' },
  { value: 'secondaryStructure', label: 'Structure', description: 'Helix/Sheet/Coil coloring' },
];

interface Option<T> {
  value: T;
  label: string;
  title: string;
  availability: Availability;
}

/**
 * Why some options are greyed out, as visible text under them (touch screens
 * have no tooltips). A hidden structure greys out everything: one line says so.
 */
function UnavailableNotes<T>({ options, hidden }: { options: Option<T>[]; hidden: boolean }) {
  if (hidden) {
    return <p className={styles.unavailableNote}>The structure is hidden: show it in Structures to change this.</p>;
  }
  const unavailable = options.filter((o) => !o.availability.available);
  if (unavailable.length === 0) return null;
  return (
    <ul className={styles.unavailableNotes}>
      {unavailable.map((o) => (
        <li key={String(o.value)} className={styles.unavailableNote}>
          {o.label}: {o.availability.reason}
        </li>
      ))}
    </ul>
  );
}

export function ControlPanel() {
  // Use new hooks for cleaner access to active structure
  const activeStructure = useActiveStructure();
  // Use store actions directly - they handle activeStructureId internally
  const setRepresentation = useMoleculeStore(s => s.setRepresentation);
  const setColorScheme = useMoleculeStore(s => s.setColorScheme);

  // Derive properties from active structure (the same state the toolbar reads)
  const molecule = activeStructure?.molecule;
  const representation = activeStructure?.representation ?? 'ball-and-stick';
  const colorScheme = activeStructure?.colorScheme ?? 'cpk';
  const visible = activeStructure?.visible ?? true;

  const colorContext = useMemo(
    () => molecule ? calculateColorSchemeContext(molecule) : null,
    [molecule]
  );

  if (!molecule || !activeStructure || !colorContext) {
    return null;
  }

  // Same rule as the coloring itself (isAlphaFoldMolecule in utils/atomColor.ts).
  const isAlphaFold = colorContext.isPlddt ?? false;
  const atomCount = molecule.atoms.length;
  const hasBackbone = colorContext.hasBackboneData === true;
  const touch = isTouchScreen();

  const repOptions: Option<RepresentationType>[] = REPRESENTATIONS.map((rep) => {
    const availability = representationAvailability(rep.value, { visible, atomCount, hasBackbone, touch });
    let title = availability.available ? rep.description : `${rep.label}: ${availability.reason}`;
    if (availability.available && rep.value === 'surface-vdw' && atomCount > 20_000) {
      title = 'Surface quality reduced for large molecules';
    }
    return { value: rep.value, label: rep.label, title, availability };
  });

  const schemeOptions: Option<ColorScheme>[] = COLOR_SCHEMES.map((scheme) => {
    const availability = colorSchemeAvailability(scheme.value, {
      visible,
      representation,
      hasBackbone,
      hasResidueData: colorContext.hasResidueData === true,
      hasBfactorData: colorContext.hasBfactorData === true,
      hasResidueNumbers: colorContext.hasResidueNumbers === true,
      hasSecondaryStructure: colorContext.hasSecondaryStructure === true,
    });
    const description = scheme.value === 'bfactor' && isAlphaFold
      ? 'pLDDT confidence, AlphaFold DB colors: dark blue > 90, light blue 70-90, yellow 50-70, orange < 50'
      : scheme.description;
    const title = availability.available ? description : `${scheme.label}: ${availability.reason}`;
    return { value: scheme.value, label: scheme.label, title, availability };
  });

  return (
    <div className={styles.controlPanel}>
      {/* Representation Section */}
      <div className={styles.controlSection}>
        <h3 className={styles.controlTitle}>Representation</h3>
        <div className={styles.controlOptions}>
          {repOptions.map((rep) => (
            <button
              key={rep.value}
              className={clsx(styles.controlButton, representation === rep.value && styles.active)}
              onClick={() => setRepresentation(rep.value)}
              aria-pressed={representation === rep.value}
              title={rep.title}
              disabled={!rep.availability.available}
            >
              {rep.label}
            </button>
          ))}
        </div>
        <UnavailableNotes options={repOptions} hidden={!visible} />
      </div>

      {/* Color Scheme Section */}
      <div className={styles.controlSection}>
        <h3 className={styles.controlTitle}>Color Scheme</h3>
        <div className={styles.controlOptions}>
          {schemeOptions.map((scheme) => (
            <button
              key={scheme.value}
              className={clsx(styles.controlButton, colorScheme === scheme.value && styles.active)}
              onClick={() => setColorScheme(scheme.value)}
              aria-pressed={colorScheme === scheme.value}
              title={scheme.title}
              disabled={!scheme.availability.available}
            >
              {scheme.label}
            </button>
          ))}
        </div>
        <UnavailableNotes options={schemeOptions} hidden={!visible} />
      </div>
    </div>
  );
}
