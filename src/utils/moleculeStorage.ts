import type { Molecule, Atom, Bond, AromaticRing, BiologicalAssembly } from '../types';
import type { Measurement } from './measurements';
import type { MolViewerSession } from '../types/session';
import { logError } from './errorReporter';
import { LoadError } from './loadErrors';
import { countAromaticRings } from './aromaticDetection';

/**
 * Storage behind the Saved Sessions panel.
 *
 * - Sessions are saved to localStorage, or to IndexedDB when over 1 MB or
 *   50,000 atoms.
 * - Single-molecule entries were saved by older versions (localStorage, or
 *   IndexedDB in chunks for 50,000+ atoms). They are still listed, loaded,
 *   renamed and deleted here, but never written.
 */

const STORAGE_PREFIX = 'mol3d_';
const INDEX_KEY = `${STORAGE_PREFIX}index`;
const MOLECULE_PREFIX = `${STORAGE_PREFIX}molecule_`;
const STORAGE_VERSION = 2; // Bumped for IndexedDB support
const MAX_LOCALSTORAGE_BYTES = 5 * 1024 * 1024; // 5MB localStorage limit
const LARGE_MOLECULE_THRESHOLD = 50000; // Atoms - use IndexedDB above this

const DB_NAME = 'mol3d-storage';
const DB_VERSION = 2;
const SESSION_PREFIX = `${STORAGE_PREFIX}session_`;
const LARGE_SESSION_BYTES = 1 * 1024 * 1024; // 1MB threshold for IndexedDB

/**
 * A saved entry could not be read: its data is missing, or reading it failed.
 * A failed read has already been logged here, so callers show the message
 * without reporting it again.
 */
export class SavedEntryReadError extends LoadError {
  constructor(message: string) {
    // The entry's data is missing or can't be read back: for the load events, not found
    super(message, 'not_found');
    this.name = 'SavedEntryReadError';
  }
}

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
  /**
   * Entry kind. 'session' = full viewer session (multi-structure, camera, etc.).
   * 'molecule' or undefined = legacy single-molecule entry.
   */
  kind?: 'molecule' | 'session';
  /** For 'session' entries: number of structures */
  structureCount?: number;
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
      logError(request.error ?? new Error('IndexedDB open failed'), { source: 'moleculeStorage', op: 'open-db' });
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

      // Store for full session blobs (added in DB_VERSION 2)
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
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

function isStorageBlocked(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'SecurityError';
}

function getIndex(): StorageIndex {
  try {
    const data = localStorage.getItem(INDEX_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    // The browser blocks site data (settings, or a third-party frame): no
    // saved entries. Not a bug, and it would be reported on every start.
    if (isStorageBlocked(e)) return { version: STORAGE_VERSION, entries: [] };
    console.error('Failed to read molecule index:', e);
    logError(e instanceof Error ? e : new Error(String(e)), { source: 'moleculeStorage', op: 'read-index' });
  }
  return { version: STORAGE_VERSION, entries: [] };
}

function saveIndex(index: StorageIndex): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
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
    logError(error instanceof Error ? error : new Error(String(error)), { source: 'moleculeStorage', op: 'load-molecule' });
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
    logError(error instanceof Error ? error : new Error(String(error)), { source: 'moleculeStorage', op: 'delete-molecule' });
  }
}

/** A single-molecule entry from localStorage, in either format older versions wrote. */
function loadMoleculeFromLocalStorage(id: string): { molecule: Molecule; measurements: Measurement[] } | null {
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
    logError(e instanceof Error ? e : new Error(String(e)), { source: 'moleculeStorage', op: 'load-molecule-localstorage' });
  }

  return null;
}

/**
 * Reads a single-molecule entry saved by an older version, from IndexedDB
 * (50,000+ atoms) or localStorage. Null when it is missing or unreadable.
 */
export async function loadMoleculeAsync(
  id: string
): Promise<{ molecule: Molecule; measurements: Measurement[] } | null> {
  const index = getIndex();
  const entry = index.entries.find((e) => e.id === id);

  if (entry?.storage === 'indexedDB') {
    return isIndexedDBAvailable() ? loadMoleculeFromIndexedDB(id) : null;
  }
  return loadMoleculeFromLocalStorage(id);
}

export function getSavedMolecules(): SavedMoleculeEntry[] {
  return getIndex().entries;
}

export function deleteMolecule(id: string): void {
  const index = getIndex();
  const entry = index.entries.find((e) => e.id === id);

  // Delete from appropriate storage
  if (entry?.storage === 'indexedDB') {
    if (entry.kind === 'session') {
      deleteSessionFromIndexedDB(id).catch((err) => {
        console.error('[MoleculeStorage] Background delete of session failed:', err);
        logError(err instanceof Error ? err : new Error(String(err)), { source: 'moleculeStorage', op: 'delete-session-bg' });
      });
    } else {
      deleteMoleculeFromIndexedDB(id).catch((err) => {
        console.error('[MoleculeStorage] Background delete of molecule failed:', err);
        logError(err instanceof Error ? err : new Error(String(err)), { source: 'moleculeStorage', op: 'delete-molecule-bg' });
      });
    }
  }
  localStorage.removeItem(`${MOLECULE_PREFIX}${id}`);
  localStorage.removeItem(`${SESSION_PREFIX}${id}`);

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
        const tx = db.transaction(['molecules', 'chunks', 'sessions'], 'readwrite');
        tx.objectStore('molecules').clear();
        tx.objectStore('chunks').clear();
        tx.objectStore('sessions').clear();
      })
      .catch((err) => {
        console.error('[MoleculeStorage] Failed to clear IndexedDB:', err);
        logError(err instanceof Error ? err : new Error(String(err)), { source: 'moleculeStorage', op: 'clear-all' });
      });
  }

  // Clear localStorage
  index.entries.forEach((entry) => {
    localStorage.removeItem(`${MOLECULE_PREFIX}${entry.id}`);
    localStorage.removeItem(`${SESSION_PREFIX}${entry.id}`);
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
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(STORAGE_PREFIX)) {
        localStorageUsed += (localStorage.getItem(key)?.length || 0) * 2;
      }
    }
  } catch {
    // storage unavailable: nothing used
  }

  // Note: IndexedDB usage is harder to calculate without async
  // This returns localStorage usage only for quick sync access
  return {
    used: localStorageUsed,
    max: MAX_LOCALSTORAGE_BYTES,
    percentage: Math.round((localStorageUsed / MAX_LOCALSTORAGE_BYTES) * 100),
  };
}

// ===== Session save/load =====

interface SessionRecord {
  id: string;
  session: MolViewerSession;
}

async function saveSessionToIndexedDB(id: string, session: MolViewerSession): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    tx.objectStore('sessions').put({ id, session } satisfies SessionRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadSessionFromIndexedDB(id: string): Promise<MolViewerSession | null> {
  try {
    const db = await openDatabase();
    return await new Promise<MolViewerSession | null>((resolve, reject) => {
      const tx = db.transaction('sessions', 'readonly');
      const request = tx.objectStore('sessions').get(id);
      request.onsuccess = () => {
        const result = request.result as SessionRecord | undefined;
        resolve(result?.session ?? null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[MoleculeStorage] Failed to load session from IndexedDB:', error);
    logError(error instanceof Error ? error : new Error(String(error)), { source: 'moleculeStorage', op: 'load-session' });
    return null;
  }
}

async function deleteSessionFromIndexedDB(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('[MoleculeStorage] Failed to delete session from IndexedDB:', error);
    logError(error instanceof Error ? error : new Error(String(error)), { source: 'moleculeStorage', op: 'delete-session' });
  }
}

function summarizeSession(session: MolViewerSession) {
  let totalAtoms = 0;
  let totalBonds = 0;
  let totalAromaticRings = 0;
  for (const s of session.state.structures) {
    totalAtoms += s.molecule.atoms.length;
    totalBonds += s.molecule.bonds.length;
    totalAromaticRings += countAromaticRings(s.molecule);
  }
  return { totalAtoms, totalBonds, totalAromaticRings };
}

const STORAGE_FULL = 'Storage is full. Please delete some saved sessions.';

/** A quota error becomes "Storage is full"; anything else stays as it is. */
function asStorageError(e: unknown): unknown {
  return e instanceof DOMException && e.name === 'QuotaExceededError' ? new Error(STORAGE_FULL) : e;
}

/**
 * Where a session's payload goes, and its JSON when that is localStorage.
 * A session of 50,000+ atoms goes to IndexedDB without being stringified
 * (tens of MB); smaller ones are stringified once to check their size.
 */
function sessionPayload(session: MolViewerSession, totalAtoms: number): { useIndexedDB: boolean; serialized?: string } {
  const idb = isIndexedDBAvailable();
  if (idb && totalAtoms >= LARGE_MOLECULE_THRESHOLD) return { useIndexedDB: true };
  const serialized = JSON.stringify(session);
  if (idb && serialized.length * 2 > LARGE_SESSION_BYTES) return { useIndexedDB: true };
  return { useIndexedDB: false, serialized };
}

async function writeSessionPayload(id: string, session: MolViewerSession, payload: { useIndexedDB: boolean; serialized?: string }): Promise<void> {
  if (payload.useIndexedDB) {
    await saveSessionToIndexedDB(id, session);
    return;
  }
  try {
    localStorage.setItem(`${SESSION_PREFIX}${id}`, payload.serialized!);
  } catch (e) {
    throw asStorageError(e);
  }
}

async function removeSessionPayload(id: string, useIndexedDB: boolean): Promise<void> {
  if (useIndexedDB) await deleteSessionFromIndexedDB(id);
  else localStorage.removeItem(`${SESSION_PREFIX}${id}`);
}

/**
 * Save a full viewer session. The payload is written first and the index
 * entry only after it, so a failed write never leaves an entry pointing at
 * nothing; if the index write fails, the payload just written is removed.
 */
export async function saveSession(session: MolViewerSession): Promise<SavedMoleculeEntry> {
  const id = generateId();
  const { totalAtoms, totalBonds, totalAromaticRings } = summarizeSession(session);
  const payload = sessionPayload(session, totalAtoms);

  await writeSessionPayload(id, session, payload);

  const entry: SavedMoleculeEntry = {
    id,
    name: session.name,
    savedAt: Date.now(),
    atomCount: totalAtoms,
    bondCount: totalBonds,
    aromaticRingCount: totalAromaticRings,
    measurementCount: session.state.measurements.length,
    storage: payload.useIndexedDB ? 'indexedDB' : 'localStorage',
    kind: 'session',
    structureCount: session.state.structures.length,
  };

  try {
    const index = getIndex();
    index.entries.unshift(entry);
    saveIndex(index);
  } catch (e) {
    await removeSessionPayload(id, payload.useIndexedDB);
    throw asStorageError(e);
  }
  return entry;
}

/**
 * Update an existing session entry in place (Update in the Saved panel).
 *
 * The payload is written under the entry's own key, so a failure never
 * deletes it. The index is read again after the write, because the user
 * may have deleted or renamed the entry meanwhile: a deleted entry stays
 * deleted (the payload just written is removed), a rename is kept. When the
 * session moves between localStorage and IndexedDB, the old copy is removed
 * only after the index points at the new one.
 */
export async function updateSession(
  id: string,
  session: MolViewerSession
): Promise<SavedMoleculeEntry | null> {
  const before = getIndex().entries.find((e) => e.id === id);
  if (!before || before.kind !== 'session') return null;
  const previousStorage = before.storage;

  const { totalAtoms, totalBonds, totalAromaticRings } = summarizeSession(session);
  const payload = sessionPayload(session, totalAtoms);
  const storage = payload.useIndexedDB ? 'indexedDB' : 'localStorage';

  await writeSessionPayload(id, session, payload);

  const index = getIndex();
  const entry = index.entries.find((e) => e.id === id);
  if (!entry || entry.kind !== 'session') {
    await removeSessionPayload(id, payload.useIndexedDB);
    return null;
  }

  entry.savedAt = Date.now();
  entry.atomCount = totalAtoms;
  entry.bondCount = totalBonds;
  entry.aromaticRingCount = totalAromaticRings;
  entry.measurementCount = session.state.measurements.length;
  entry.storage = storage;
  entry.structureCount = session.state.structures.length;
  // entry.name stays: it may have been renamed while the payload was written

  try {
    saveIndex(index);
  } catch (e) {
    // The index still points at the old copy: drop the new one if it is elsewhere
    if (previousStorage !== storage) await removeSessionPayload(id, payload.useIndexedDB);
    throw asStorageError(e);
  }

  if (previousStorage !== storage) await removeSessionPayload(id, previousStorage === 'indexedDB');
  return entry;
}

/**
 * Load a session. Returns null if not found, or if entry isn't a session.
 */
export async function loadSessionAsync(id: string): Promise<MolViewerSession | null> {
  const index = getIndex();
  const entry = index.entries.find((e) => e.id === id);
  if (!entry || entry.kind !== 'session') return null;

  if (entry.storage === 'indexedDB' && isIndexedDBAvailable()) {
    return loadSessionFromIndexedDB(id);
  }

  try {
    const data = localStorage.getItem(`${SESSION_PREFIX}${id}`);
    if (data) {
      return JSON.parse(data) as MolViewerSession;
    }
  } catch (e) {
    console.error('[MoleculeStorage] Failed to load session from localStorage:', e);
    logError(e instanceof Error ? e : new Error(String(e)), { source: 'moleculeStorage', op: 'load-session-localstorage' });
  }
  return null;
}

