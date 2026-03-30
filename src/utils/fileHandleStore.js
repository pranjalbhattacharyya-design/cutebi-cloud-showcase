/**
 * fileHandleStore.js
 * Persists FileSystemFileHandle objects in IndexedDB so templates can
 * auto-reload data files across browser sessions (File System Access API).
 */

const DB_NAME    = 'cutebi_file_handles';
const STORE_NAME = 'handles';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess  = (e) => resolve(e.target.result);
    req.onerror    = (e) => reject(e.target.error);
  });
}

/** Store a FileSystemFileHandle keyed by datasetId. */
export async function storeHandle(datasetId, handle) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, datasetId);
    tx.oncomplete = resolve;
    tx.onerror    = (e) => reject(e.target.error);
  });
}

/** Retrieve a stored FileSystemFileHandle by datasetId. Returns null if not found. */
export async function getHandle(datasetId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(datasetId);
    req.onsuccess = (e) => resolve(e.target.result ?? null);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/** Delete a stored handle (call when dataset is removed). */
export async function deleteHandle(datasetId) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(datasetId);
      tx.oncomplete = resolve;
      tx.onerror    = (e) => reject(e.target.error);
    });
  } catch (_) { /* silent */ }
}

/**
 * Verify the app has (or can obtain) read permission for the given handle.
 * Returns true if permission is granted, false otherwise.
 */
export async function requestReadPermission(handle) {
  try {
    let perm = await handle.queryPermission({ mode: 'read' });
    if (perm === 'granted') return true;
    perm = await handle.requestPermission({ mode: 'read' });
    return perm === 'granted';
  } catch (_) {
    return false;
  }
}

/**
 * Given a list of datasetIds, returns a map of { datasetId → FileSystemFileHandle }
 * for all IDs that have a stored handle AND the File System Access API is available.
 */
export async function getHandlesForDatasets(datasetIds) {
  if (!window.showOpenFilePicker) return {}; // API not supported
  const result = {};
  for (const id of datasetIds) {
    try {
      const h = await getHandle(id);
      if (h) result[id] = h;
    } catch (_) { /* skip */ }
  }
  return result;
}
