import { ChevronDown } from 'lucide-react';
import { useLandingShown } from '../../hooks/useLandingShown';
import styles from './PageInfoLink.module.css';

/**
 * "Details ↓" on landing pages: the viewer fills the screen, so on phones in
 * particular people don't see that helix/sheet ranges, chains and citations
 * are just below it. Shown while that text is visible (useLandingShown).
 */
export function PageInfoLink() {
  const data = useLandingShown();
  if (!data) return null;

  return (
    <a
      className={styles.link}
      href="#page-info"
      onClick={(e) => {
        e.preventDefault();
        document.getElementById('page-info')?.scrollIntoView({ behavior: 'smooth' });
      }}
    >
      Details about {data.kind === 'compound' ? data.title : data.id}
      <ChevronDown size={16} aria-hidden="true" />
    </a>
  );
}
