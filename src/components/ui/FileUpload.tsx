import { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import {
  useMoleculeStore,
  MAX_STRUCTURES,
  beginSceneLoad,
  finishSceneLoad,
  isCurrentSceneLoad,
  applySceneLoad,
  notAppliedReason,
  type SceneLoadMode,
  type SceneLoadToken,
} from '../../store/moleculeStore';
import { parseByFilename } from '../../parsers';
import { SAMPLE_MOLECULES, type SampleMolecule } from '../../config';
import { validateFile } from '../../utils/fileValidation';
import { decompressGzip } from '../../utils/decompressGzip';
import type { Molecule, StructureSource } from '../../types';
import { Download, Plus, RefreshCw } from 'lucide-react';
import { logError } from '../../utils/errorReporter';
import { track } from '../../utils/track';
import { startLoad, type LoadAttempt } from '../../utils/loadTracking';
import { asParseError, LoadError } from '../../utils/loadErrors';
import { loadStructureFromSource, resolvePubchemCid } from '../../utils/structureLoader';
import { slugForCid } from '../../../site/compoundSlugs';
import { UNIPROT_RE } from '../../../site/identifiers';
import styles from './FileUpload.module.css';

/** Timeout for fetching sample molecules in ms */
const SAMPLE_FETCH_TIMEOUT_MS = 10000;
/** Timeout for fetching PDB files from RCSB (larger files need more time) */
const PDB_FETCH_TIMEOUT_MS = 30000;
/** Timeout for fetching AlphaFold structures (two-step: metadata + CIF) */
const ALPHAFOLD_FETCH_TIMEOUT_MS = 30000;
/** Timeout for PubChem (name lookup + SDF download) */
const PUBCHEM_FETCH_TIMEOUT_MS = 20000;

function detectInlineFormat(filename: string): 'pdb' | 'cif' | 'sdf' | 'mol' | 'xyz' | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdb') || lower.endsWith('.ent')) return 'pdb';
  if (lower.endsWith('.cif') || lower.endsWith('.cif.gz') || lower.endsWith('.mmcif')) return 'cif';
  if (lower.endsWith('.sdf')) return 'sdf';
  if (lower.endsWith('.mol') || lower.endsWith('.mol2')) return 'mol';
  if (lower.endsWith('.xyz')) return 'xyz';
  return null;
}

/**
 * Extract a user-friendly error message from an unknown error.
 * Handles AbortError specially for timeout scenarios.
 */
function getErrorMessage(err: unknown, fallbackMessage: string, timeoutMessage?: string): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError' && timeoutMessage) {
      return timeoutMessage;
    }
    // 'Failed to fetch' is a generic TypeError from CSP/CORS/network — use the descriptive fallback instead
    if (err.message === 'Failed to fetch') {
      return fallbackMessage;
    }
    return err.message;
  }
  return fallbackMessage;
}

export function FileUpload() {
  const {
    setMolecule,
    addStructure,
    structureOrder,
    setError,
    isLoading,
  } = useMoleculeStore(useShallow(state => ({
    setMolecule: state.setMolecule,
    addStructure: state.addStructure,
    structureOrder: state.structureOrder,
    setError: state.setError,
    isLoading: state.isLoading,
  })));
  const [isDragging, setIsDragging] = useState(false);
  const [pdbId, setPdbId] = useState('');
  const [uniprotId, setUniprotId] = useState('');
  const [compoundQuery, setCompoundQuery] = useState('');
  const [addMode, setAddMode] = useState(true); // true = Add, false = Replace

  // Check if we have existing structures
  const hasStructures = structureOrder.length > 0;
  const canAddMore = structureOrder.length < MAX_STRUCTURES;
  // Decided when a load starts: Add-mode loads coexist, a Replace load that
  // applies wins over the loads started before it (beginSceneLoad)
  const loadMode: SceneLoadMode = hasStructures && addMode ? 'add' : 'replace';

  const parseFile = useCallback((content: string, filename: string) => {
    return parseByFilename(content, filename);
  }, []);

  // In Add mode at the limit nothing is read or fetched: the user picks
  // Replace or removes a structure first (Add mode used to replace all 10)
  const atLimit = hasStructures && addMode && !canAddMore;
  const refuseAtLimit = useCallback((): boolean => {
    if (!atLimit) return false;
    setError(`Maximum of ${MAX_STRUCTURES} structures: remove one or switch to Replace`);
    return true;
  }, [atLimit, setError]);

  /** Offline: nothing is fetched, and the started load ends as a network failure. */
  const refuseOffline = useCallback((attempt: LoadAttempt): boolean => {
    if (navigator.onLine) return false;
    setError('You appear to be offline. Please check your internet connection.');
    attempt.failed(new LoadError('Offline', 'network'));
    return true;
  }, [setError]);

  /**
   * Adds or replaces. Returns the new structure's id, or '' when the store
   * refused it (the limit was reached meanwhile).
   */
  const loadMolecule = useCallback((molecule: Molecule, name?: string, source?: StructureSource): string => {
    if (hasStructures && addMode) {
      // Add as new structure; the store refuses an 11th with its own message
      return addStructure(molecule, name, source);
    }
    // Replace all structures
    setMolecule(molecule, source);
    return useMoleculeStore.getState().activeStructureId ?? '';
  }, [hasStructures, addMode, addStructure, setMolecule]);

  /**
   * Applies a loaded molecule through the token and reports the outcome: the
   * structure, or why it wasn't added (the limit, or a later Replace load).
   */
  const applyLoaded = useCallback((
    token: SceneLoadToken,
    attempt: LoadAttempt,
    molecule: Molecule,
    name?: string,
    source?: StructureSource
  ): boolean => {
    let structureId = '';
    if (!applySceneLoad(token, () => (structureId = loadMolecule(molecule, name, source)) !== '')) {
      attempt.cancelled(notAppliedReason(token));
      return false;
    }
    attempt.loaded(useMoleculeStore.getState().getStructure(structureId));
    return true;
  }, [loadMolecule]);

  const handleFile = useCallback(async (file: File) => {
    const attempt = startLoad({
      source: 'file',
      userInitiated: true,
      format: detectInlineFormat(file.name) ?? 'other',
      bytes: file.size,
    });
    if (refuseAtLimit()) return attempt.cancelled('limit');
    const token = beginSceneLoad(loadMode);
    setError(null);

    try {
      validateFile(file);

      let content: string;
      let molecule: Molecule;
      try {
        // Handle gzip-compressed files
        if (file.name.toLowerCase().endsWith('.gz')) {
          const arrayBuffer = await file.arrayBuffer();
          content = await decompressGzip(arrayBuffer);
        } else {
          content = await file.text();
        }
        molecule = parseFile(content, file.name);
      } catch (err) {
        throw asParseError(err);
      }
      // Extract name from filename without extension(s)
      const name = file.name.replace(/\.(cif\.gz|[^/.]+)$/i, '');
      const inlineFormat = detectInlineFormat(file.name);
      const inlineSource: StructureSource | undefined =
        inlineFormat ? { type: 'inline', format: inlineFormat, data: content } : undefined;
      applyLoaded(token, attempt, molecule, name, inlineSource);
    } catch (err) {
      if (!isCurrentSceneLoad(token)) return attempt.cancelled('superseded');
      attempt.failed(err);
      setError(getErrorMessage(err, 'Failed to parse file'));
      logError(err instanceof Error ? err : new Error(String(err)), { source: 'FileUpload.handleFile' });
    } finally {
      finishSceneLoad(token);
    }
  }, [parseFile, applyLoaded, refuseAtLimit, loadMode, setError]);

  // dragenter/dragleave fire for every child the pointer crosses: count the
  // depth so a drag over the drop zone is one file_picker_opened
  const dragDepth = useRef(0);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    dragDepth.current = 0;

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    // Only files: dragged text or a link is not an attempt to open one
    if (dragDepth.current === 1 && Array.from(e.dataTransfer?.types ?? []).includes('Files')) {
      track('file_picker_opened', { value: 'drop' });
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Cleared so picking the same file again fires a change (and loads it again)
    e.target.value = '';
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const loadSample = useCallback(async (sample: SampleMolecule) => {
    const isRcsb = sample.file.startsWith('rcsb:');
    const attempt = startLoad({
      source: 'sample',
      userInitiated: true,
      ...(isRcsb ? {} : { format: detectInlineFormat(sample.file) ?? 'other' }),
    });
    if (refuseAtLimit()) return attempt.cancelled('limit');
    if (refuseOffline(attempt)) return;

    const token = beginSceneLoad(loadMode);
    setError(null);

    const timeoutMs = isRcsb ? PDB_FETCH_TIMEOUT_MS : SAMPLE_FETCH_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      if (isRcsb) {
        const pdbId = sample.file.slice(5); // strip 'rcsb:'
        const { molecule } = await loadStructureFromSource({ type: 'rcsb', id: pdbId }, controller.signal);
        applyLoaded(token, attempt, molecule, sample.name, { type: 'rcsb', id: sample.pdbId ?? pdbId });
      } else {
        const response = await fetch(sample.file, { signal: controller.signal });
        if (!response.ok) {
          throw new LoadError('Failed to load sample molecule', response.status === 404 ? 'not_found' : 'network');
        }
        const content = await response.text();
        let molecule: Molecule;
        try {
          molecule = parseFile(content, sample.file);
        } catch (err) {
          throw asParseError(err);
        }
        const inlineFormat = detectInlineFormat(sample.file);
        const sampleSource: StructureSource | undefined = sample.pdbId
          ? { type: 'rcsb', id: sample.pdbId }
          : inlineFormat
            ? { type: 'inline', format: inlineFormat, data: content }
            : undefined;
        applyLoaded(token, attempt, molecule, sample.name, sampleSource);
      }
    } catch (err) {
      if (!isCurrentSceneLoad(token)) return attempt.cancelled('superseded');
      attempt.failed(err);
      setError(getErrorMessage(err, 'Failed to load sample', 'Request timed out. Please try again.'));
      logError(err instanceof Error ? err : new Error(String(err)), { source: 'FileUpload.loadSample' });
    } finally {
      clearTimeout(timeout);
      finishSceneLoad(token);
    }
  }, [parseFile, applyLoaded, refuseAtLimit, refuseOffline, loadMode, setError]);

  const fetchPDB = useCallback(async (id: string) => {
    const trimmedId = id.trim().toUpperCase();
    if (!trimmedId) {
      setError('Please enter a PDB ID');
      return;
    }

    // Validate PDB ID format (4 characters, alphanumeric)
    if (!/^[A-Z0-9]{4}$/i.test(trimmedId)) {
      setError('Invalid PDB ID format. Must be 4 alphanumeric characters (e.g., 1CRN)');
      return;
    }

    // Format checks above come first: a mistyped ID is not an attempt
    const attempt = startLoad({ source: 'rcsb', userInitiated: true });
    if (refuseAtLimit()) return attempt.cancelled('limit');
    if (refuseOffline(attempt)) return;

    const token = beginSceneLoad(loadMode);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PDB_FETCH_TIMEOUT_MS);

    try {
      const source = { type: 'rcsb', id: trimmedId } as const;
      const { molecule } = await loadStructureFromSource(source, controller.signal);
      if (!applyLoaded(token, attempt, molecule, trimmedId, source)) return;
      setPdbId(''); // Clear input on success
    } catch (err) {
      if (!isCurrentSceneLoad(token)) return attempt.cancelled('superseded');
      attempt.failed(err);
      setError(getErrorMessage(
        err,
        'Failed to fetch PDB',
        'Request timed out. The PDB file may be too large or the server is slow.'
      ));
      logError(err instanceof Error ? err : new Error(String(err)), { source: 'FileUpload.fetchPDB' });
    } finally {
      clearTimeout(timeout);
      finishSceneLoad(token);
    }
  }, [applyLoaded, refuseAtLimit, refuseOffline, loadMode, setError]);

  const handlePdbSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    fetchPDB(pdbId);
  }, [fetchPDB, pdbId]);

  const fetchAlphaFold = useCallback(async (id: string) => {
    const trimmedId = id.trim().toUpperCase();
    if (!trimmedId) {
      setError('Please enter a UniProt ID');
      return;
    }

    if (!UNIPROT_RE.test(trimmedId)) {
      setError('Invalid UniProt ID format. Examples: P69905, A0A1B0GTW7');
      return;
    }

    const attempt = startLoad({ source: 'af', userInitiated: true });
    if (refuseAtLimit()) return attempt.cancelled('limit');
    if (refuseOffline(attempt)) return;

    const token = beginSceneLoad(loadMode);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ALPHAFOLD_FETCH_TIMEOUT_MS);

    try {
      const source = { type: 'alphafold', id: trimmedId } as const;
      const { molecule, name } = await loadStructureFromSource(source, controller.signal);
      if (!applyLoaded(token, attempt, molecule, name, source)) return;
      setUniprotId(''); // Clear input on success
    } catch (err) {
      if (!isCurrentSceneLoad(token)) return attempt.cancelled('superseded');
      attempt.failed(err);
      setError(getErrorMessage(
        err,
        'Failed to fetch AlphaFold structure',
        'Request timed out. Please try again.'
      ));
      logError(err instanceof Error ? err : new Error(String(err)), { source: 'FileUpload.fetchAlphaFold' });
    } finally {
      clearTimeout(timeout);
      finishSceneLoad(token);
    }
  }, [applyLoaded, refuseAtLimit, refuseOffline, loadMode, setError]);

  const handleAlphaFoldSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    fetchAlphaFold(uniprotId);
  }, [fetchAlphaFold, uniprotId]);

  const fetchPubchem = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setError('Please enter a compound name or PubChem CID');
      return;
    }

    const attempt = startLoad({ source: 'pubchem', userInitiated: true });
    if (refuseAtLimit()) return attempt.cancelled('limit');
    if (refuseOffline(attempt)) return;

    const token = beginSceneLoad(loadMode);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PUBCHEM_FETCH_TIMEOUT_MS);

    try {
      const cid = await resolvePubchemCid(trimmed, controller.signal);
      // Curated compounds keep their canonical address (/compound/caffeine).
      const source = { type: 'pubchem', cid, slug: slugForCid(cid) } as const;
      const { molecule, name, warning } = await loadStructureFromSource(source, controller.signal);
      if (!applyLoaded(token, attempt, molecule, name, source)) return;
      setCompoundQuery('');
      // Loading clears errors; show the 2D notice after the structure is in.
      if (warning) setError(warning);
    } catch (err) {
      if (!isCurrentSceneLoad(token)) return attempt.cancelled('superseded');
      attempt.failed(err);
      setError(getErrorMessage(err, 'Failed to fetch compound from PubChem', 'Request timed out. Please try again.'));
      logError(err instanceof Error ? err : new Error(String(err)), { source: 'FileUpload.fetchPubchem' });
    } finally {
      clearTimeout(timeout);
      finishSceneLoad(token);
    }
  }, [applyLoaded, refuseAtLimit, refuseOffline, loadMode, setError]);

  const handlePubchemSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    fetchPubchem(compoundQuery);
  }, [fetchPubchem, compoundQuery]);

  return (
    <div className={styles.fileUpload} role="region" aria-label="File upload" data-onboarding="file-upload">
      {/* Add/Replace mode toggle - only show when structures exist */}
      {hasStructures && (
        <div className={styles.modeToggle}>
          <button
            className={clsx(styles.modeButton, addMode && styles.active)}
            onClick={() => setAddMode(true)}
            disabled={!canAddMore}
            title={canAddMore ? 'Add new structure' : `Maximum ${MAX_STRUCTURES} structures`}
            aria-pressed={addMode}
          >
            <Plus size={14} />
            Add
          </button>
          <button
            className={clsx(styles.modeButton, !addMode && styles.active)}
            onClick={() => setAddMode(false)}
            title="Replace all structures"
            aria-pressed={!addMode}
          >
            <RefreshCw size={14} />
            Replace
          </button>
        </div>
      )}

      <div
        className={clsx(styles.dropZone, isDragging && styles.dragging)}
        onDrop={handleDrop}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            document.getElementById('file-input')?.click();
          }
        }}
        role="button"
        aria-label="Drop zone for molecule files"
        tabIndex={0}
      >
        <input
          type="file"
          accept=".pdb,.cif,.cif.gz,.mmcif,.sdf,.mol,.xyz"
          onChange={handleFileInput}
          // The label, the drop zone's Enter key and a direct click all open the dialog through here
          onClick={() => track('file_picker_opened', { value: 'dialog' })}
          id="file-input"
          className={styles.fileInput}
        />
        <label htmlFor="file-input" className={styles.fileLabel}>
          <span className={styles.uploadIcon}>+</span>
          <span>Drop a file here or click to upload</span>
          <span className={styles.fileTypes}>PDB, CIF, CIF.GZ, SDF, MOL, XYZ</span>
        </label>
      </div>

      <form className={styles.pdbFetch} onSubmit={handlePdbSubmit}>
        <label htmlFor="pdb-input" className={styles.pdbLabel}>Fetch from RCSB:</label>
        <div className={styles.pdbInputRow}>
          <input
            type="text"
            id="pdb-input"
            value={pdbId}
            onChange={(e) => setPdbId(e.target.value)}
            placeholder="e.g., 1CRN"
            className={styles.pdbInput}
            aria-label="PDB ID"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={4}
            disabled={isLoading}
          />
          <button
            type="submit"
            className={styles.pdbFetchBtn}
            disabled={isLoading || !pdbId.trim()}
            title="Fetch structure from RCSB PDB"
          >
            <Download size={16} />
            Fetch
          </button>
        </div>
      </form>

      <form className={styles.pdbFetch} onSubmit={handleAlphaFoldSubmit}>
        <label htmlFor="uniprot-input" className={styles.pdbLabel}>Fetch from AlphaFold DB:</label>
        <div className={styles.pdbInputRow}>
          <input
            type="text"
            id="uniprot-input"
            value={uniprotId}
            onChange={(e) => setUniprotId(e.target.value)}
            placeholder="e.g., P69905"
            className={styles.pdbInput}
            aria-label="UniProt ID"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={10}
            disabled={isLoading}
          />
          <button
            type="submit"
            className={styles.pdbFetchBtn}
            disabled={isLoading || !uniprotId.trim()}
            title="Fetch predicted structure from AlphaFold DB"
          >
            <Download size={16} />
            Fetch
          </button>
        </div>
      </form>

      <form className={styles.pdbFetch} onSubmit={handlePubchemSubmit}>
        <label htmlFor="pubchem-input" className={styles.pdbLabel}>Small molecule from PubChem:</label>
        <div className={styles.pdbInputRow}>
          <input
            type="text"
            id="pubchem-input"
            value={compoundQuery}
            onChange={(e) => setCompoundQuery(e.target.value)}
            placeholder="e.g., caffeine or 2519"
            className={styles.pdbInput}
            aria-label="Compound name or PubChem CID"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={120}
            disabled={isLoading}
          />
          <button
            type="submit"
            className={styles.pdbFetchBtn}
            disabled={isLoading || !compoundQuery.trim()}
            title="Fetch 3D structure from PubChem"
          >
            <Download size={16} />
            Fetch
          </button>
        </div>
      </form>

      <div className={styles.sampleMolecules}>
        <span className={styles.sampleLabel}>Or try a sample:</span>
        {(['small-molecule', 'protein', 'nucleic-acid', 'complex'] as const).map(category => {
          const samples = SAMPLE_MOLECULES.filter(s => s.category === category);
          if (samples.length === 0) return null;
          const categoryLabels = {
            'small-molecule': 'Small Molecules',
            'protein': 'Proteins',
            'nucleic-acid': 'Nucleic Acids',
            'complex': 'Complexes',
          } as const;
          return (
            <div key={category} className={styles.sampleCategory}>
              <span className={styles.categoryLabel}>{categoryLabels[category]}</span>
              <div className={styles.sampleButtons}>
                {samples.map((sample) => (
                  <button
                    key={sample.name}
                    onClick={() => loadSample(sample)}
                    className={styles.sampleButton}
                    title={sample.description}
                    disabled={isLoading}
                  >
                    {sample.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
