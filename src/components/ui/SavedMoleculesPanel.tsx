import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import { Save, Trash2, Download, Pencil, Check, X, RefreshCw } from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';
import { useMoleculeStore } from '../../store/moleculeStore';
import { useActiveStructure } from '../../hooks';
import { getStorageUsage } from '../../utils';
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
    saveMoleculeToStorage,
    updateSavedMolecule,
    loadSavedMolecule,
    deleteSavedMolecule,
    renameSavedMolecule,
    clearAllSavedMolecules,
  } = useMoleculeStore(useShallow(state => ({
    savedMolecules: state.savedMolecules,
    loadedMoleculeId: state.loadedMoleculeId,
    saveMoleculeToStorage: state.saveMoleculeToStorage,
    updateSavedMolecule: state.updateSavedMolecule,
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

  const handleSave = () => {
    saveMoleculeToStorage();
  };

  const handleUpdate = (id: string) => {
    updateSavedMolecule();
    setUpdatedId(id);
  };

  const handleLoad = (id: string) => {
    loadSavedMolecule(id);
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
    <CollapsibleSection title="Saved Molecules" defaultOpen={true} storageKey="saved-molecules">
      <div className={styles.savedMoleculesPanel}>
        <button
          className={styles.exportButton}
          onClick={handleSave}
          disabled={!molecule}
          title={molecule ? 'Save current molecule' : 'Load a molecule first'}
        >
          <Save size={16} />
          Save Current Molecule
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
                      {entry.atomCount} atoms, {entry.bondCount} bonds
                      {entry.aromaticRingCount > 0 && `, ${entry.aromaticRingCount} rings`}
                      {entry.measurementCount > 0 && `, ${entry.measurementCount} measurements`}
                    </span>
                    <span className={styles.savedItemDate}>{formatDate(entry.savedAt)}</span>
                  </div>
                  <div className={styles.savedItemActions}>
                    {loadedMoleculeId === entry.id && (
                      <button
                        className={clsx(styles.controlButton, styles.update, updatedId === entry.id && styles.success)}
                        onClick={() => handleUpdate(entry.id)}
                        title="Update saved molecule with current changes"
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
