import styles from './Header.module.css';

export function Header() {
  return (
    <header className={styles.appHeader} role="banner">
      <h1>MolViewer</h1>
      <span className={styles.tagline}>Interactive 3D Molecule Viewer</span>
    </header>
  );
}
