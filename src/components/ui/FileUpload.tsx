import { useCallback, useState } from 'react';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import { useMoleculeStore, MAX_STRUCTURES } from '../../store/moleculeStore';
import { parsePDB, parseSDF, parseXYZ, parseMMCIF } from '../../parsers';
import { SAMPLE_MOLECULES } from '../../config';
import { validateFile, getFileExtension, decompressGzip } from '../../utils';
import type { Molecule } from '../../types';
import { Download, Plus, RefreshCw } from 'lucide-react';
import styles from './FileUpload.module.css';

/** Timeout for fetching sample molecules in ms */
const SAMPLE_FETCH_TIMEOUT_MS = 10000;
/** Timeout for fetching PDB files from RCSB (larger files need more time) */
const PDB_FETCH_TIMEOUT_MS = 30000;

/**
 * Extract a user-friendly error message from an unknown error.
 * Handles AbortError specially for timeout scenarios.
 */
function getErrorMessage(err: unknown, fallbackMessage: string, timeoutMessage?: string): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError' && timeoutMessage) {
      return timeoutMessage;
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
  } = useMoleculeStore(useShallow(state => ({
    setMolecule: state.setMolecule,
    addStructure: state.addStructure,
    structureOrder: state.structureOrder,
    setLoading: state.setLoading,
    setError: state.setError,
    isLoading: state.isLoading,
  })));
  const [isDragging, setIsDragging] = useState(false);
  const [pdbId, setPdbId] = useState('');
  const [addMode, setAddMode] = useState(true); // true = Add, false = Replace

  // Check if we have existing structures
  const hasStructures = structureOrder.length > 0;
  const canAddMore = structureOrder.length < MAX_STRUCTURES;

  const parseFile = useCallback((content: string, filename: string) => {
    // Handle .cif.gz by stripping .gz first
    const normalizedFilename = filename.replace(/\.gz$/i, '');
    const extension = getFileExtension(normalizedFilename);

    switch (extension) {
      case 'pdb':
        return parsePDB(content);
      case 'cif':
      case 'mmcif':
        return parseMMCIF(content);
      case 'sdf':
      case 'mol':
        return parseSDF(content);
      case 'xyz':
        return parseXYZ(content);
      default:
        throw new Error(`Unsupported file format: .${extension}`);
    }
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
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to parse file'));
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

  const loadSample = useCallback(async (sampleFile: string, sampleName: string) => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SAMPLE_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(sampleFile, { signal: controller.signal });
      if (!response.ok) {
        throw new Error('Failed to load sample molecule');
      }
      const content = await response.text();
      const molecule = parseFile(content, sampleFile);
      loadMolecule(molecule, sampleName);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load sample', 'Request timed out. Please try again.'));
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [parseFile, loadMolecule, setLoading, setError]);

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
      setPdbId(''); // Clear input on success
    } catch (err) {
      setError(getErrorMessage(
        err,
        'Failed to fetch PDB',
        'Request timed out. The PDB file may be too large or the server is slow.'
      ));
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [loadMolecule, setLoading, setError]);

  const handlePdbSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    fetchPDB(pdbId);
  }, [fetchPDB, pdbId]);

  return (
    <div className={styles.fileUpload} role="region" aria-label="File upload">
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
        <span className={styles.pdbLabel}>Fetch from RCSB:</span>
        <div className={styles.pdbInputRow}>
          <input
            type="text"
            value={pdbId}
            onChange={(e) => setPdbId(e.target.value)}
            placeholder="e.g., 1CRN"
            className={styles.pdbInput}
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

      <div className={styles.sampleMolecules}>
        <span className={styles.sampleLabel}>Or try a sample:</span>
        <div className={styles.sampleButtons}>
          {SAMPLE_MOLECULES.map((sample) => (
            <button
              key={sample.name}
              onClick={() => loadSample(sample.file, sample.name)}
              className={styles.sampleButton}
            >
              {sample.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
