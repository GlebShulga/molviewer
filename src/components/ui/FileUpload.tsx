import { useCallback, useState } from 'react';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import { useMoleculeStore, MAX_STRUCTURES } from '../../store/moleculeStore';
import { parseMMCIF, parseByFilename } from '../../parsers';
import { SAMPLE_MOLECULES, type SampleMolecule } from '../../config';
import { validateFile, decompressGzip } from '../../utils';
import type { Molecule } from '../../types';
import { Download, Plus, RefreshCw } from 'lucide-react';
import { logError } from '../../utils/errorReporter';
import styles from './FileUpload.module.css';

/** Timeout for fetching sample molecules in ms */
const SAMPLE_FETCH_TIMEOUT_MS = 10000;
/** Timeout for fetching PDB files from RCSB (larger files need more time) */
const PDB_FETCH_TIMEOUT_MS = 30000;
/** Timeout for fetching AlphaFold structures (two-step: metadata + CIF) */
const ALPHAFOLD_FETCH_TIMEOUT_MS = 30000;
/** Matches classic 6-char (P69905) and new 10-char (A0A1B0GTW7) UniProt accession formats */
const UNIPROT_ID_REGEX = /^[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}$/;

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
    setLoading,
    setError,
    isLoading,
    setMoleculeSource,
  } = useMoleculeStore(useShallow(state => ({
    setMolecule: state.setMolecule,
    addStructure: state.addStructure,
    structureOrder: state.structureOrder,
    setLoading: state.setLoading,
    setError: state.setError,
    isLoading: state.isLoading,
    setMoleculeSource: state.setMoleculeSource,
  })));
  const [isDragging, setIsDragging] = useState(false);
  const [pdbId, setPdbId] = useState('');
  const [uniprotId, setUniprotId] = useState('');
  const [addMode, setAddMode] = useState(true); // true = Add, false = Replace

  // Check if we have existing structures
  const hasStructures = structureOrder.length > 0;
  const canAddMore = structureOrder.length < MAX_STRUCTURES;

  const parseFile = useCallback((content: string, filename: string) => {
    return parseByFilename(content, filename);
  }, []);

  const loadMolecule = useCallback((molecule: Molecule, name?: string) => {
    if (hasStructures && addMode && canAddMore) {
      // Add as new structure
      addStructure(molecule, name);
    } else {
      // Replace all structures
      setMolecule(molecule);
    }
  }, [hasStructures, addMode, canAddMore, addStructure, setMolecule]);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);

    try {
      validateFile(file);

      let content: string;
      // Handle gzip-compressed files
      if (file.name.toLowerCase().endsWith('.gz')) {
        const arrayBuffer = await file.arrayBuffer();
        content = await decompressGzip(arrayBuffer);
      } else {
        content = await file.text();
      }

      const molecule = parseFile(content, file.name);
      // Extract name from filename without extension(s)
      const name = file.name.replace(/\.(cif\.gz|[^/.]+)$/i, '');
      loadMolecule(molecule, name);
      setMoleculeSource(null); // Local files aren't shareable via URL
      document.title = `${name} - MolViewer`;
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to parse file'));
      logError(err instanceof Error ? err : new Error(String(err)), { source: 'FileUpload.handleFile' });
    } finally {
      setLoading(false);
    }
  }, [parseFile, loadMolecule, setLoading, setError]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const loadSample = useCallback(async (sample: SampleMolecule) => {
    if (!navigator.onLine) {
      setError('You appear to be offline. Please check your internet connection.');
      return;
    }

    setLoading(true);
    setError(null);

    const isRcsb = sample.file.startsWith('rcsb:');
    const timeoutMs = isRcsb ? PDB_FETCH_TIMEOUT_MS : SAMPLE_FETCH_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let content: string;
      let filename: string;

      if (isRcsb) {
        const pdbId = sample.file.slice(5); // strip 'rcsb:'
        const response = await fetch(`https://files.rcsb.org/download/${pdbId}.cif`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(response.status === 404 ? `PDB ID "${pdbId}" not found` : 'Failed to fetch from RCSB');
        }
        content = await response.text();
        filename = `${pdbId}.cif`;
      } else {
        const response = await fetch(sample.file, { signal: controller.signal });
        if (!response.ok) {
          throw new Error('Failed to load sample molecule');
        }
        content = await response.text();
        filename = sample.file;
      }

      const molecule = parseFile(content, filename);
      loadMolecule(molecule, sample.name);

      // Track source for URL sharing
      if (sample.pdbId) {
        setMoleculeSource({ type: 'rcsb', id: sample.pdbId });
      } else {
        setMoleculeSource(null);
      }
      document.title = `${sample.name} - MolViewer`;
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load sample', 'Request timed out. Please try again.'));
      logError(err instanceof Error ? err : new Error(String(err)), { source: 'FileUpload.loadSample' });
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [parseFile, loadMolecule, setLoading, setError, setMoleculeSource]);

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

    if (!navigator.onLine) {
      setError('You appear to be offline. Please check your internet connection.');
      return;
    }

    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PDB_FETCH_TIMEOUT_MS);

    try {
      // Fetch mmCIF format (preferred by RCSB, better coverage than legacy PDB format)
      const response = await fetch(`https://files.rcsb.org/download/${trimmedId}.cif`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`PDB ID "${trimmedId}" not found`);
        }
        throw new Error(`Failed to fetch structure: ${response.statusText}`);
      }
      const content = await response.text();
      const molecule = parseMMCIF(content);
      molecule.name = trimmedId;
      loadMolecule(molecule, trimmedId);
      setMoleculeSource({ type: 'rcsb', id: trimmedId });
      document.title = `${trimmedId} - MolViewer`;
      setPdbId(''); // Clear input on success
    } catch (err) {
      setError(getErrorMessage(
        err,
        'Failed to fetch PDB',
        'Request timed out. The PDB file may be too large or the server is slow.'
      ));
      logError(err instanceof Error ? err : new Error(String(err)), { source: 'FileUpload.fetchPDB' });
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [loadMolecule, setLoading, setError]);

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

    if (!UNIPROT_ID_REGEX.test(trimmedId)) {
      setError('Invalid UniProt ID format. Examples: P69905, A0A1B0GTW7');
      return;
    }

    if (!navigator.onLine) {
      setError('You appear to be offline. Please check your internet connection.');
      return;
    }

    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ALPHAFOLD_FETCH_TIMEOUT_MS);

    try {
      // Step 1: Fetch metadata from AlphaFold API
      const metaResponse = await fetch(
        `https://alphafold.ebi.ac.uk/api/prediction/${trimmedId}`,
        { signal: controller.signal }
      );
      if (!metaResponse.ok) {
        if (metaResponse.status === 404) {
          throw new Error(`UniProt ID "${trimmedId}" not found in AlphaFold DB`);
        }
        throw new Error(`Failed to fetch AlphaFold metadata: ${metaResponse.statusText}`);
      }
      const metadata = await metaResponse.json();
      const entry = Array.isArray(metadata) ? metadata[0] : metadata;
      const cifUrl = entry?.cifUrl;
      if (!cifUrl) {
        throw new Error('No structure file available for this UniProt ID');
      }

      // Step 2: Fetch the CIF file
      const cifResponse = await fetch(cifUrl, { signal: controller.signal });
      if (!cifResponse.ok) {
        throw new Error(`Failed to fetch AlphaFold structure: ${cifResponse.statusText}`);
      }
      const content = await cifResponse.text();
      const molecule = parseMMCIF(content);
      const structureName = `AF-${trimmedId}`;
      molecule.name = structureName;
      loadMolecule(molecule, structureName);
      setMoleculeSource({ type: 'alphafold', id: trimmedId });
      document.title = `AF-${trimmedId} - MolViewer`;
      setUniprotId(''); // Clear input on success
    } catch (err) {
      setError(getErrorMessage(
        err,
        'Failed to fetch AlphaFold structure',
        'Request timed out. Please try again.'
      ));
      logError(err instanceof Error ? err : new Error(String(err)), { source: 'FileUpload.fetchAlphaFold' });
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [loadMolecule, setLoading, setError]);

  const handleAlphaFoldSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    fetchAlphaFold(uniprotId);
  }, [fetchAlphaFold, uniprotId]);

  return (
    <div className={styles.fileUpload} role="region" aria-label="File upload" data-onboarding="file-upload">
      {/* Add/Replace mode toggle - only show when structures exist */}
      {hasStructures && (
        <div className={styles.modeToggle}>
          <button
            className={clsx(styles.modeButton, addMode && canAddMore && styles.active)}
            onClick={() => setAddMode(true)}
            disabled={!canAddMore}
            title={canAddMore ? 'Add new structure' : `Maximum ${MAX_STRUCTURES} structures`}
            aria-pressed={addMode && canAddMore}
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
          accept=".pdb,.cif,.mmcif,.sdf,.mol,.xyz"
          onChange={handleFileInput}
          id="file-input"
          className={styles.fileInput}
        />
        <label htmlFor="file-input" className={styles.fileLabel}>
          <span className={styles.uploadIcon}>+</span>
          <span>Drop a file here or click to upload</span>
          <span className={styles.fileTypes}>PDB, CIF, SDF, MOL, XYZ</span>
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
