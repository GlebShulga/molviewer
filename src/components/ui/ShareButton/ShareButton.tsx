import { useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Share2, Check, Copy, X } from 'lucide-react';
import { useMoleculeStore } from '../../../store/moleculeStore';
import { viewerHandle } from '../../../utils/viewerHandle';
import {
  serializeShareableSession,
  createShareLink,
  UnshareableStructureError,
} from '../../../utils/shareSession';
import { logError } from '../../../utils/errorReporter';
import { track } from '../../../utils/track';
import { sourceToPath } from '../../../utils/urlParams';
import { useActiveStructure } from '../../../hooks';
import { embedSnippet, embedTarget } from '../../../../site/embed';
import styles from './ShareButton.module.css';

type Tab = 'link' | 'embed';

function useClipboard(onError: (message: string) => void) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((key: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {
      onError('Could not copy to clipboard');
    });
  }, [onError]);
  return { copied, copy, reset: () => setCopied(null) };
}

export function ShareButton() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('link');
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [spin, setSpin] = useState(false);
  const [lightBg, setLightBg] = useState(false);
  const { copied, copy, reset: resetCopied } = useClipboard(setError);

  const activeStructure = useActiveStructure();

  const handleShare = useCallback(async () => {
    setError(null);
    setUrl(null);
    setTab('link');
    setCreating(true);
    setOpen(true);

    try {
      const state = useMoleculeStore.getState();
      const camera = viewerHandle.get()?.getCameraSnapshot() ?? null;
      const payload = serializeShareableSession(
        {
          structureOrder: state.structureOrder,
          structures: state.structures,
          layoutMode: state.layoutMode,
          measurements: state.measurements,
          labels: state.labels,
          surfaceSettings: state.surfaceSettings,
          autoRotate: state.autoRotate,
        },
        camera
      );
      const id = await createShareLink(payload);
      const shareUrl = `${window.location.origin}/s/${id}`;
      setUrl(shareUrl);
      track('share_created');
    } catch (err) {
      if (err instanceof UnshareableStructureError) {
        setError(err.message);
      } else {
        const message = err instanceof Error ? err.message : 'Failed to create share link';
        setError(message);
        logError(err instanceof Error ? err : new Error(String(err)), { source: 'ShareButton' });
      }
    } finally {
      setCreating(false);
    }
  }, []);

  // The embed shows the active structure with its current representation and colors.
  const snippet = useMemo(() => {
    const path = sourceToPath(activeStructure?.source);
    const target = path ? embedTarget(path) : null;
    if (!target || !activeStructure) return null;
    return embedSnippet(window.location.origin, target, {
      repr: activeStructure.representation,
      color: activeStructure.colorScheme,
      spin,
      bg: lightBg ? 'light' : 'dark',
    });
  }, [activeStructure, spin, lightBg]);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    setUrl(null);
    resetCopied();
  }, [resetCopied]);

  const hasStructures = useMoleculeStore(s => s.structureOrder.length > 0);

  return (
    <>
      <button
        className={styles.shareButton}
        onClick={handleShare}
        disabled={!hasStructures || creating}
        title="Create a shareable link to this view"
      >
        <Share2 size={16} />
        {creating ? 'Creating link…' : 'Share Link'}
      </button>

      {open && (
        <div className={styles.modalBackdrop} onClick={close}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Share this session</h3>
              <button className={styles.closeButton} onClick={close} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className={styles.tabs} role="tablist" aria-label="Share options">
              <button
                role="tab"
                aria-selected={tab === 'link'}
                className={clsx(styles.tab, tab === 'link' && styles.tabActive)}
                onClick={() => setTab('link')}
              >
                Link
              </button>
              <button
                role="tab"
                aria-selected={tab === 'embed'}
                className={clsx(styles.tab, tab === 'embed' && styles.tabActive)}
                onClick={() => setTab('embed')}
              >
                Embed
              </button>
            </div>

            {tab === 'link' && (
              <div role="tabpanel">
                {creating && <p>Creating link…</p>}
                {error && <p className={styles.errorMessage}>{error}</p>}
                {url && (
                  <>
                    <div className={styles.urlRow}>
                      <input
                        type="text"
                        className={styles.urlInput}
                        value={url}
                        readOnly
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button className={styles.copyButton} onClick={() => copy('link', url)}>
                        {copied === 'link' ? <Check size={14} /> : <Copy size={14} />}
                        {copied === 'link' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className={styles.helpText}>
                      Anyone with this link can view your scene. Links expire 1 year after creation.
                    </p>
                  </>
                )}
              </div>
            )}

            {tab === 'embed' && (
              <div role="tabpanel">
                {snippet ? (
                  <>
                    <textarea
                      className={styles.snippet}
                      value={snippet}
                      readOnly
                      rows={4}
                      aria-label="Embed code"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <div className={styles.embedOptions}>
                      <label>
                        <input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} /> Rotate
                      </label>
                      <label>
                        <input type="checkbox" checked={lightBg} onChange={(e) => setLightBg(e.target.checked)} /> Light background
                      </label>
                      <button className={styles.copyButton} onClick={() => copy('embed', snippet)}>
                        {copied === 'embed' ? <Check size={14} /> : <Copy size={14} />}
                        {copied === 'embed' ? 'Copied' : 'Copy code'}
                      </button>
                    </div>
                    <p className={styles.helpText}>
                      Paste this into any web page, blog or course site to show the active structure in an
                      interactive 3D viewer. Pasting the page link into WordPress, Notion or Medium also embeds it.
                    </p>
                  </>
                ) : (
                  <p className={styles.helpText}>
                    Embedding works for structures from the PDB, AlphaFold DB and PubChem. Select one of those in
                    the structure list to get embed code.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
