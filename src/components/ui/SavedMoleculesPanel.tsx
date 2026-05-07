import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import { Save, Trash2, Download, Pencil, Check, X, RefreshCw } from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';
import { useMoleculeStore } from '../../store/moleculeStore';
import { useActiveStructure } from '../../hooks';
import { getStorageUsage } from '../../utils';
import { viewerHandle } from '../../utils/viewerHandle';
import styles from './SavedMoleculesPanel.module.css';

/** Duration in ms to show the update success indicator */
const UPDATED_INDICATOR_TIMEOUT_MS = 1500;

export function SavedMoleculesPanel() {
  // Use new hook for active structure access
  const activeStructure = useActiveStructure();
  const molecule = activeStructure?.molecule ?? null;

  const {
    savedMolecules,
    loadedMoleculeId,
    saveSession,
    updateSessionEntry,
    loadSavedSession,
    loadSavedMolecule,
    deleteSavedMolecule,
    renameSavedMolecule,
    clearAllSavedMolecules,
  } = useMoleculeStore(useShallow(state => ({
    savedMolecules: state.savedMolecules,
    loadedMoleculeId: state.loadedMoleculeId,
    saveSession: state.saveSession,
    updateSessionEntry: state.updateSessionEntry,
    loadSavedSession: state.loadSavedSession,
    loadSavedMolecule: state.loadSavedMolecule,
    deleteSavedMolecule: state.deleteSavedMolecule,
    renameSavedMolecule: state.renameSavedMolecule,
    clearAllSavedMolecules: state.clearAllSavedMolecules,
  })));

  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [updatedId, setUpdatedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (updatedId) {
      const timer = setTimeout(() => setUpdatedId(null), UPDATED_INDICATOR_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }
  }, [updatedId]);

  const handleSave = async () => {
    if (!molecule) return;
    const camera = viewerHandle.get()?.getCameraSnapshot() ?? null;
    const name = molecule.name || `Session ${new Date().toLocaleString()}`;
    try {
      await saveSession(name, camera);
    } catch (err) {
      console.error('[SavedMoleculesPanel] Failed to save session:', err);
      alert(err instanceof Error ? err.message : 'Failed to save session');
    }
  };

  const handleUpdate = async (id: string) => {
    const entry = savedMolecules.find((e) => e.id === id);
    if (!entry || entry.kind !== 'session') return;
    const camera = viewerHandle.get()?.getCameraSnapshot() ?? null;
    try {
      await updateSessionEntry(id, camera);
      setUpdatedId(id);
    } catch (err) {
      console.error('[SavedMoleculesPanel] Failed to update session:', err);
      alert(err instanceof Error ? err.message : 'Failed to update session');
    }
  };

  const handleLoad = async (id: string) => {
    const entry = savedMolecules.find((e) => e.id === id);
    if (!entry) return;
    if (entry.kind === 'session') {
      try {
        // Camera is enqueued onto the store and applied by App.tsx once the
        // scene is mounted (gated on controlsReady + boundingBoxData).
        await loadSavedSession(id);
      } catch (err) {
        console.error('[SavedMoleculesPanel] Failed to load session:', err);
        const message = err instanceof Error ? err.message : 'Failed to load session';
        alert(message);
      }
    } else {
      // Legacy single-molecule entry
      loadSavedMolecule(id);
    }
  };

  const handleDelete = (id: string) => {
    deleteSavedMolecule(id);
  };

  const handleStartRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const handleConfirmRename = () => {
    if (editingId && editName.trim()) {
      renameSavedMolecule(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName('');
  };

  const handleCancelRename = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirmRename();
    } else if (e.key === 'Escape') {
      handleCancelRename();
    }
  };

  const handleClearAll = () => {
    if (showConfirmClear) {
      clearAllSavedMolecules();
      setShowConfirmClear(false);
    } else {
      setShowConfirmClear(true);
    }
  };

  const storage = getStorageUsage();

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <CollapsibleSection title="Saved Sessions" defaultOpen={true} storageKey="saved-molecules">
      <div className={styles.savedMoleculesPanel}>
        <button
          className={styles.exportButton}
          onClick={handleSave}
          disabled={!molecule}
          title={molecule ? 'Save full viewer session (structures, view, measurements)' : 'Load a molecule first'}
        >
          <Save size={16} />
          Save Session
        </button>

        {savedMolecules.length > 0 ? (
          <>
            <div className={styles.savedList}>
              {savedMolecules.map((entry) => (
                <div key={entry.id} className={styles.savedItem}>
                  <div className={styles.savedItemInfo}>
                    {editingId === entry.id ? (
                      <div className={styles.savedItemEdit}>
                        <input
                          ref={inputRef}
                          type="text"
                          aria-label="Edit molecule name"
                          className={styles.savedItemInput}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onBlur={handleConfirmRename}
                        />
                        <button
                          className={clsx(styles.controlButton, styles.small)}
                          onClick={handleConfirmRename}
                          title="Confirm"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          className={clsx(styles.controlButton, styles.small)}
                          onClick={handleCancelRename}
                          title="Cancel"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <span
                        className={clsx(styles.savedItemName, styles.editable)}
                        onClick={() => handleStartRename(entry.id, entry.name)}
                        title="Click to rename"
                      >
                        {entry.name}
                        <Pencil size={10} className={styles.editIcon} />
                      </span>
                    )}
                    <span className={styles.savedItemMeta}>
                      {entry.kind === 'session' ? (
                        <span className={styles.kindBadge} title="Full session (multi-structure, camera, settings)">session</span>
                      ) : (
                        <span className={clsx(styles.kindBadge, styles.kindLegacy)} title="Legacy single-molecule entry">legacy</span>
                      )}
                      {entry.kind === 'session' && entry.structureCount && entry.structureCount > 1
                        ? `${entry.structureCount} structures, `
                        : ''}
                      {entry.atomCount} atoms, {entry.bondCount} bonds
                      {entry.aromaticRingCount > 0 && `, ${entry.aromaticRingCount} rings`}
                      {entry.measurementCount > 0 && `, ${entry.measurementCount} measurements`}
                    </span>
                    <span className={styles.savedItemDate}>{formatDate(entry.savedAt)}</span>
                  </div>
                  <div className={styles.savedItemActions}>
                    {loadedMoleculeId === entry.id && entry.kind === 'session' && (
                      <button
                        className={clsx(styles.controlButton, styles.update, updatedId === entry.id && styles.success)}
                        onClick={() => handleUpdate(entry.id)}
                        title="Update saved session with current changes"
                      >
                        {updatedId === entry.id ? <Check size={14} /> : <RefreshCw size={14} />}
                      </button>
                    )}
                    <button
                      className={styles.controlButton}
                      onClick={() => handleLoad(entry.id)}
                      title="Load molecule"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      className={clsx(styles.controlButton, styles.danger)}
                      onClick={() => handleDelete(entry.id)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {storage.percentage >= 90 && (
              <div className={styles.storageWarning}>
                Storage almost full ({storage.percentage}%)
              </div>
            )}

            <button
              className={clsx(styles.controlButton, styles.danger, styles.clearAll, showConfirmClear && styles.confirm)}
              onClick={handleClearAll}
              onBlur={() => setShowConfirmClear(false)}
            >
              <Trash2 size={14} />
              {showConfirmClear ? 'Click again to confirm' : 'Clear All Saved'}
            </button>
          </>
        ) : (
          <div className={styles.emptySaved}>
            <span>No saved molecules yet</span>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
