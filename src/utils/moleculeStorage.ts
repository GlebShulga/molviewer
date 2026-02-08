import type { Molecule, Atom, Bond, AromaticRing, BiologicalAssembly } from '../types';
import type { Measurement } from './measurements';

/**
 * Molecule storage with IndexedDB support for large molecules.
 *
 * - Small molecules (<5MB): Use localStorage for compatibility
 * - Large molecules (>5MB): Use IndexedDB with chunked storage
 *
 * IndexedDB benefits:
 * - No size limit (quota-based, typically 50%+ of disk)
 * - Async API doesn't block UI
 * - Structured data (no JSON serialization overhead for reading)
 * - Chunk-based loading for progressive restore
 */

const STORAGE_PREFIX = 'mol3d_';
const INDEX_KEY = `${STORAGE_PREFIX}index`;
const MOLECULE_PREFIX = `${STORAGE_PREFIX}molecule_`;
const STORAGE_VERSION = 2; // Bumped for IndexedDB support
const MAX_LOCALSTORAGE_BYTES = 5 * 1024 * 1024; // 5MB localStorage limit
const LARGE_MOLECULE_THRESHOLD = 50000; // Atoms - use IndexedDB above this
const CHUNK_SIZE = 100000; // Atoms per chunk for IndexedDB

const DB_NAME = 'mol3d-storage';
const DB_VERSION = 1;

export interface SavedMoleculeEntry {
  id: string;
  name: string;
  savedAt: number;
  atomCount: number;
  bondCount: number;
  aromaticRingCount: number;
  measurementCount: number;
  /** Storage backend used */
  storage?: 'localStorage' | 'indexedDB';
  /** Number of chunks if stored in IndexedDB */
  chunkCount?: number;
}

interface StoredMoleculeData {
  molecule: Molecule;
  measurements: Measurement[];
}

interface StorageIndex {
  version: number;
  entries: SavedMoleculeEntry[];
}

// IndexedDB chunk structure
interface MoleculeChunk {
  moleculeId: string;
  chunkIndex: number;
  atoms: Atom[];
}

interface MoleculeMetadata {
  id: string;
  name: string;
  bonds: Bond[];
  aromaticRings?: AromaticRing[];
  assemblies?: BiologicalAssembly[];
  measurements: Measurement[];
  chunkCount: number;
}

// IndexedDB instance
let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open or create the IndexedDB database.
 */
function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[MoleculeStorage] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Store for molecule metadata (bonds, name, etc.)
      if (!db.objectStoreNames.contains('molecules')) {
        db.createObjectStore('molecules', { keyPath: 'id' });
      }

      // Store for atom chunks
      if (!db.objectStoreNames.contains('chunks')) {
        const chunkStore = db.createObjectStore('chunks', {
          keyPath: ['moleculeId', 'chunkIndex'],
        });
        chunkStore.createIndex('byMolecule', 'moleculeId');
      }
    };
  });

  return dbPromise;
}

/**
 * Check if IndexedDB is available.
 */
function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getIndex(): StorageIndex {
  try {
    const data = localStorage.getItem(INDEX_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to read molecule index:', e);
  }
  return { version: STORAGE_VERSION, entries: [] };
}

function saveIndex(index: StorageIndex): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

/**
 * Save molecule to IndexedDB in chunks.
 */
async function saveMoleculeToIndexedDB(
  id: string,
  molecule: Molecule,
  measurements: Measurement[]
): Promise<number> {
  const db = await openDatabase();
  const chunkCount = Math.ceil(molecule.atoms.length / CHUNK_SIZE);

  // Save metadata
  const metadata: MoleculeMetadata = {
    id,
    name: molecule.name,
    bonds: molecule.bonds,
    aromaticRings: molecule.aromaticRings,
    assemblies: molecule.assemblies,
    measurements,
    chunkCount,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['molecules', 'chunks'], 'readwrite');
    const moleculeStore = tx.objectStore('molecules');
    const chunkStore = tx.objectStore('chunks');

    moleculeStore.put(metadata);

    // Save atoms in chunks
    for (let i = 0; i < chunkCount; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, molecule.atoms.length);
      const chunk: MoleculeChunk = {
        moleculeId: id,
        chunkIndex: i,
        atoms: molecule.atoms.slice(start, end),
      };
      chunkStore.put(chunk);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return chunkCount;
}

/**
 * Load molecule from IndexedDB.
 */
async function loadMoleculeFromIndexedDB(
  id: string
): Promise<{ molecule: Molecule; measurements: Measurement[] } | null> {
  try {
    const db = await openDatabase();

    // Load metadata
    const metadata = await new Promise<MoleculeMetadata | undefined>((resolve, reject) => {
      const tx = db.transaction('molecules', 'readonly');
      const request = tx.objectStore('molecules').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (!metadata) return null;

    // Load all chunks
    const atoms: Atom[] = [];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('chunks', 'readonly');
      const index = tx.objectStore('chunks').index('byMolecule');
      const request = index.openCursor(IDBKeyRange.only(id));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const chunk = cursor.value as MoleculeChunk;
          atoms.push(...chunk.atoms);
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });

    // Sort atoms by chunk index to maintain order
    // (IDB may not return in order)

    const molecule: Molecule = {
      name: metadata.name,
      atoms,
      bonds: metadata.bonds,
      aromaticRings: metadata.aromaticRings,
      assemblies: metadata.assemblies,
    };

    return { molecule, measurements: metadata.measurements };
  } catch (error) {
    console.error('[MoleculeStorage] Failed to load from IndexedDB:', error);
    return null;
  }
}

/**
 * Delete molecule from IndexedDB.
 */
async function deleteMoleculeFromIndexedDB(id: string): Promise<void> {
  try {
    const db = await openDatabase();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['molecules', 'chunks'], 'readwrite');

      // Delete metadata
      tx.objectStore('molecules').delete(id);

      // Delete all chunks
      const chunkStore = tx.objectStore('chunks');
      const index = chunkStore.index('byMolecule');
      const request = index.openCursor(IDBKeyRange.only(id));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('[MoleculeStorage] Failed to delete from IndexedDB:', error);
  }
}

export function saveMolecule(
  molecule: Molecule,
  measurements: Measurement[] = [],
  customName?: string
): SavedMoleculeEntry {
  const id = generateId();
  const useIndexedDB =
    isIndexedDBAvailable() && molecule.atoms.length >= LARGE_MOLECULE_THRESHOLD;

  const entry: SavedMoleculeEntry = {
    id,
    name: customName || molecule.name,
    savedAt: Date.now(),
    atomCount: molecule.atoms.length,
    bondCount: molecule.bonds.length,
    aromaticRingCount: molecule.aromaticRings?.length ?? 0,
    measurementCount: measurements.length,
    storage: useIndexedDB ? 'indexedDB' : 'localStorage',
  };

  if (useIndexedDB) {
    // Save to IndexedDB asynchronously
    saveMoleculeToIndexedDB(id, molecule, measurements)
      .then((chunkCount) => {
        entry.chunkCount = chunkCount;
        // Update index with chunk count
        const index = getIndex();
        const existingEntry = index.entries.find((e) => e.id === id);
        if (existingEntry) {
          existingEntry.chunkCount = chunkCount;
          saveIndex(index);
        }
        console.log(`[MoleculeStorage] Saved ${molecule.atoms.length} atoms to IndexedDB in ${chunkCount} chunks`);
      })
      .catch((error) => {
        console.error('[MoleculeStorage] Failed to save to IndexedDB:', error);
      });
  } else {
    // Save to localStorage
    const moleculeKey = `${MOLECULE_PREFIX}${id}`;
    const storedData: StoredMoleculeData = { molecule, measurements };
    try {
      localStorage.setItem(moleculeKey, JSON.stringify(storedData));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        throw new Error('Storage is full. Please delete some saved molecules.');
      }
      throw e;
    }
  }

  // Update index
  const index = getIndex();
  index.entries.unshift(entry);
  saveIndex(index);

  return entry;
}

export function updateMolecule(
  id: string,
  molecule: Molecule,
  measurements: Measurement[] = []
): SavedMoleculeEntry | null {
  const index = getIndex();
  const entry = index.entries.find((e) => e.id === id);
  if (!entry) return null;

  const useIndexedDB =
    isIndexedDBAvailable() && molecule.atoms.length >= LARGE_MOLECULE_THRESHOLD;

  // Update entry metadata
  entry.savedAt = Date.now();
  entry.atomCount = molecule.atoms.length;
  entry.bondCount = molecule.bonds.length;
  entry.aromaticRingCount = molecule.aromaticRings?.length ?? 0;
  entry.measurementCount = measurements.length;
  entry.storage = useIndexedDB ? 'indexedDB' : 'localStorage';

  if (useIndexedDB) {
    // If switching from localStorage to IndexedDB, delete old data
    if (entry.storage === 'localStorage') {
      localStorage.removeItem(`${MOLECULE_PREFIX}${id}`);
    }

    saveMoleculeToIndexedDB(id, molecule, measurements)
      .then((chunkCount) => {
        entry.chunkCount = chunkCount;
        saveIndex(index);
      })
      .catch(console.error);
  } else {
    // If switching from IndexedDB to localStorage, delete old data
    if (entry.storage === 'indexedDB') {
      deleteMoleculeFromIndexedDB(id).catch(console.error);
    }

    const moleculeKey = `${MOLECULE_PREFIX}${id}`;
    const storedData: StoredMoleculeData = { molecule, measurements };
    try {
      localStorage.setItem(moleculeKey, JSON.stringify(storedData));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        throw new Error('Storage is full. Please delete some saved molecules.');
      }
      throw e;
    }
  }

  saveIndex(index);
  return entry;
}

export function loadMolecule(id: string): { molecule: Molecule; measurements: Measurement[] } | null {
  const index = getIndex();
  const entry = index.entries.find((e) => e.id === id);

  // Try IndexedDB first if entry indicates it
  if (entry?.storage === 'indexedDB') {
    // Return a promise-like sync wrapper that triggers async load
    // For now, return null and let caller use loadMoleculeAsync
    console.log('[MoleculeStorage] Use loadMoleculeAsync for IndexedDB entries');
    return null;
  }

  // Try localStorage
  try {
    const data = localStorage.getItem(`${MOLECULE_PREFIX}${id}`);
    if (data) {
      const parsed = JSON.parse(data);
      if (parsed.atoms && parsed.bonds) {
        return { molecule: parsed as Molecule, measurements: [] };
      }
      return parsed as StoredMoleculeData;
    }
  } catch (e) {
    console.error('Failed to load molecule from localStorage:', e);
  }

  return null;
}

/**
 * Async version of loadMolecule that supports IndexedDB.
 */
export async function loadMoleculeAsync(
  id: string
): Promise<{ molecule: Molecule; measurements: Measurement[] } | null> {
  const index = getIndex();
  const entry = index.entries.find((e) => e.id === id);

  // Try IndexedDB if entry indicates it
  if (entry?.storage === 'indexedDB' && isIndexedDBAvailable()) {
    return loadMoleculeFromIndexedDB(id);
  }

  // Fallback to localStorage
  return loadMolecule(id);
}

export function getSavedMolecules(): SavedMoleculeEntry[] {
  return getIndex().entries;
}

export function deleteMolecule(id: string): void {
  const index = getIndex();
  const entry = index.entries.find((e) => e.id === id);

  // Delete from appropriate storage
  if (entry?.storage === 'indexedDB') {
    deleteMoleculeFromIndexedDB(id).catch(console.error);
  }
  localStorage.removeItem(`${MOLECULE_PREFIX}${id}`);

  // Update index
  index.entries = index.entries.filter((e) => e.id !== id);
  saveIndex(index);
}

export function clearAllMolecules(): void {
  const index = getIndex();

  // Clear IndexedDB
  if (isIndexedDBAvailable()) {
    openDatabase()
      .then((db) => {
        const tx = db.transaction(['molecules', 'chunks'], 'readwrite');
        tx.objectStore('molecules').clear();
        tx.objectStore('chunks').clear();
      })
      .catch(console.error);
  }

  // Clear localStorage
  index.entries.forEach((entry) => {
    localStorage.removeItem(`${MOLECULE_PREFIX}${entry.id}`);
  });
  localStorage.removeItem(INDEX_KEY);
}

export function renameMolecule(id: string, newName: string): void {
  const index = getIndex();
  const entry = index.entries.find((e) => e.id === id);
  if (entry) {
    entry.name = newName;
    saveIndex(index);
  }
}

export function getStorageUsage(): { used: number; max: number; percentage: number } {
  let localStorageUsed = 0;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(STORAGE_PREFIX)) {
      localStorageUsed += (localStorage.getItem(key)?.length || 0) * 2;
    }
  }

  // Note: IndexedDB usage is harder to calculate without async
  // This returns localStorage usage only for quick sync access
  return {
    used: localStorageUsed,
    max: MAX_LOCALSTORAGE_BYTES,
    percentage: Math.round((localStorageUsed / MAX_LOCALSTORAGE_BYTES) * 100),
  };
}

/**
 * Get detailed storage info including IndexedDB (async).
 */
export async function getStorageInfoAsync(): Promise<{
  localStorage: { used: number; max: number };
  indexedDB: { used: number; available: boolean; moleculeCount: number };
}> {
  const localStorageUsed = getStorageUsage().used;

  const indexedDBInfo = {
    used: 0,
    available: isIndexedDBAvailable(),
    moleculeCount: 0,
  };

  if (isIndexedDBAvailable()) {
    try {
      const db = await openDatabase();

      // Count molecules
      const count = await new Promise<number>((resolve, reject) => {
        const tx = db.transaction('molecules', 'readonly');
        const request = tx.objectStore('molecules').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      indexedDBInfo.moleculeCount = count;

      // Estimate usage (rough)
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        indexedDBInfo.used = estimate.usage ?? 0;
      }
    } catch (error) {
      console.error('[MoleculeStorage] Failed to get IndexedDB info:', error);
    }
  }

  return {
    localStorage: { used: localStorageUsed, max: MAX_LOCALSTORAGE_BYTES },
    indexedDB: indexedDBInfo,
  };
}
