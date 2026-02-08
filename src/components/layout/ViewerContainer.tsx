import type { ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMoleculeStore } from '../../store/moleculeStore';
import { selectActiveStructureMolecule } from '../../store/selectors';
import styles from './ViewerContainer.module.css';

interface ViewerContainerProps {
  children: ReactNode;
}

function LoadingOverlay() {
  return (
    <div className={styles.loadingOverlay}>
      <div className={styles.spinner}></div>
      <span>Loading molecule...</span>
    </div>
  );
}

function ErrorMessage({ error }: { error: string }) {
  return (
    <div className={styles.errorMessage}>
      <span className={styles.errorIcon}>!</span>
      <span>{error}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>&#x2B21;</div>
      <p>Upload a molecule file to get started</p>
      <p className={styles.emptyHint}>Supported formats: PDB, SDF, MOL, XYZ</p>
    </div>
  );
}

export function ViewerContainer({ children }: ViewerContainerProps) {
  const molecule = useMoleculeStore(selectActiveStructureMolecule);
  const { isLoading, error } = useMoleculeStore(useShallow(state => ({
    isLoading: state.isLoading,
    error: state.error,
  })));

  return (
    <main className={styles.viewerContainer} role="main" aria-label="Molecule viewer">
      {isLoading && <LoadingOverlay />}
      {error && <ErrorMessage error={error} />}
      {!molecule && !isLoading && !error && <EmptyState />}
      {molecule && children}
    </main>
  );
}
