import { useLandingShown } from '../../hooks/useLandingShown';
import { CollapsibleSection } from './CollapsibleSection';
import styles from './LandingInfo.module.css';

/**
 * "About this structure": the facts from the landing page (#landing-data),
 * shown in the sidebar while the address shows the page's own structure.
 * The same content is rendered as crawlable text below the viewer.
 */
export function LandingInfo() {
  const data = useLandingShown();
  if (!data) return null;

  return (
    <div className={styles.landingInfo} data-testid="landing-info">
      <CollapsibleSection title="About this structure" storageKey="landing-info">
        <div className={styles.content}>
          <p className={styles.title}>{data.title}</p>
          {data.subtitle && <p className={styles.subtitle}>{data.subtitle}</p>}
          {data.summary && <p className={styles.summary}>{data.summary}</p>}

          {data.facts.length > 0 && (
            <dl className={styles.facts}>
              {data.facts.map((f) => (
                <div key={f.label} className={styles.fact}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {data.secondaryStructure && data.secondaryStructure.length > 0 && (
            <div className={styles.ss}>
              <p className={styles.sectionLabel}>Secondary structure</p>
              {data.secondaryStructure.map((c) => (
                <div key={c.chain} className={styles.ssChain}>
                  <span className={styles.chain}>Chain {c.chain}</span>
                  {c.helices.length > 0 && (
                    <p>
                      <span className={styles.helix}>Helices</span> {c.helices.join(', ')}
                    </p>
                  )}
                  {c.strands.length > 0 && (
                    <p>
                      <span className={styles.strand}>Strands</span> {c.strands.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <ul className={styles.links}>
            {data.links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  {...(/^https?:/.test(l.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </CollapsibleSection>
    </div>
  );
}
