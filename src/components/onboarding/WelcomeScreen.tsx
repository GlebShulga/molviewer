import type { MouseEvent } from 'react';
import { WelcomeMolecule } from './WelcomeMolecule';
import styles from './WelcomeScreen.module.css';

interface WelcomeScreenProps {
  onStart: () => void;
  isLoading: boolean;
  /** Loads an example into the viewer instead of following the link. */
  onExample: (path: string) => void;
}

const EXAMPLES = [
  { path: '/pdb/4HHB', label: 'Hemoglobin 4HHB' },
  { path: '/af/P04637', label: 'p53 AlphaFold' },
  { path: '/compound/caffeine', label: 'Caffeine' },
];

export function WelcomeScreen({ onStart, isLoading, onExample }: WelcomeScreenProps) {
  // Real links, so they can be opened in a new tab and copied, but a plain
  // click loads the structure in place instead of reloading the page. While the
  // tour's demo molecule is on its way the links are inert: a second structure
  // would load on top of it, and ending onboarding would close the tour that is
  // about to start.
  const handleExample = (e: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (isLoading) {
      e.preventDefault();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onExample(path);
  };

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
          Free online<br />3D molecule viewer
        </h2>
        <p className={styles.description}>
          View proteins, DNA, AlphaFold predictions and small molecules in 3D, right in
          your browser. Enter a PDB ID, a UniProt accession or a compound name, or open
          your own file. Free, open source, nothing to install.
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
        <p className={`${styles.examples} ${isLoading ? styles.examplesDisabled : ''}`}>
          or open an example:{' '}
          {EXAMPLES.map((example, i) => (
            <span key={example.path}>
              {i > 0 && <span className={styles.separator}>·</span>}
              <a
                href={example.path}
                aria-disabled={isLoading || undefined}
                onClick={(e) => handleExample(e, example.path)}
              >
                {example.label}
              </a>
            </span>
          ))}
        </p>
        <p className={styles.hint}>PDB, mmCIF, SDF, MOL, XYZ</p>
      </div>
    </div>
  );
}
