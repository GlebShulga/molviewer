import { WelcomeMolecule } from './WelcomeMolecule';
import styles from './WelcomeScreen.module.css';

interface WelcomeScreenProps {
  onStart: () => void;
  isLoading: boolean;
}

export function WelcomeScreen({ onStart, isLoading }: WelcomeScreenProps) {
  return (
    <div className={styles.welcome} data-onboarding="welcome-screen">
      <WelcomeMolecule />
      <div className={styles.overlay}>
        <div className={styles.badge}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="4.5" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
            <circle cx="20" cy="14" r="3.5" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
            <circle cx="12" cy="21" r="3" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
            <line x1="13.5" y1="12" x2="17.5" y2="12.5" stroke="currentColor" strokeWidth="1" opacity="0.35" />
            <line x1="13" y1="18.5" x2="11.5" y2="13" stroke="currentColor" strokeWidth="1" opacity="0.35" />
          </svg>
          <span>MolViewer</span>
        </div>
        <h2 className={styles.title}>
          Interactive 3D<br />Molecule Viewer
        </h2>
        <p className={styles.description}>
          Explore protein structures, measure distances, and visualize molecules
          in multiple representations.
        </p>
        <button
          className={styles.cta}
          onClick={onStart}
          disabled={isLoading}
        >
          {isLoading && (
            <span className={styles.loadingOverlay}>
              <svg className={styles.spinnerIcon} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="6" fill="none" stroke="var(--border-color)" strokeWidth="2" />
                <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Loading...
            </span>
          )}
          <span className={isLoading ? styles.hidden : undefined}>
            Get started
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5.5 3L9.5 7L5.5 11" />
            </svg>
          </span>
        </button>
        <p className={styles.hint}>Supports PDB, SDF, MOL, XYZ</p>
      </div>
    </div>
  );
}
