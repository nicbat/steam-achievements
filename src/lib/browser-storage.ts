import type { SteamData } from '../types';
import { emptyDataset, validateDataset, validateLegacySnapshot, steamId, type Dataset } from './backup';
import { validatePlanItems } from './plan';
export type { Dataset } from './backup';
export { emptyDataset } from './backup';
const DB = 'achievement-atlas';
const STORE = 'datasets';
const KEY = 'current';
const PREFIX = 'achievement-atlas:';
export class StorageError extends Error {
  constructor(public kind: 'corrupt' | 'unavailable' | 'conflict', message: string, public recoveryRecords?: Record<string, unknown>) { super(message); this.name = 'StorageError'; }
}
function unavailable(error: unknown): StorageError { return error instanceof StorageError ? error : new StorageError('unavailable', `Browser storage could not save or read your data. ${error instanceof Error ? error.message : ''}`); }
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new StorageError('unavailable', 'Browser storage is unavailable.')); return; }
    let blocked = false;
    const request = indexedDB.open(DB, 2);
    request.onupgradeneeded = () => {
      for (const name of ['snapshots', STORE]) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    };
    request.onsuccess = () => { const db = request.result; if (blocked) { db.close(); return; } db.onversionchange = () => db.close(); resolve(db); };
    request.onerror = () => reject(unavailable(request.error));
    request.onblocked = () => { blocked = true; reject(new StorageError('unavailable', 'Close other Atlas tabs and try again.')); };
  });
}
function request<T>(r: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
function done(tx: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('Storage transaction was cancelled.')); }); }
function parseStored(value: unknown): Dataset {
  try { return validateDataset(value); } catch (error) { throw new StorageError('corrupt', `Saved data needs recovery: ${error instanceof Error ? error.message : 'Invalid data.'}`, { dataset: value }); }
}
function legacyLocal(): Record<string, string> {
  const records: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith(PREFIX)) { const value = localStorage.getItem(key); if (value !== null) records[key] = value; } }
    return records;
  } catch (error) { throw unavailable(error); }
}
function migrateLegacy(active: unknown, records: Record<string, string>): Dataset {
  const result = emptyDataset();
  try {
    if (active !== undefined) result.active = validateLegacySnapshot(active);
    else if (records[`${PREFIX}data`] !== undefined) result.active = validateLegacySnapshot(JSON.parse(records[`${PREFIX}data`]));
    for (const [key, raw] of Object.entries(records)) if (key.startsWith(`${PREFIX}plan:`)) {
      const sid = key.slice(`${PREFIX}plan:`.length); if (!steamId(sid)) throw new Error('Invalid legacy plan profile ID.'); result.plans[sid] = validatePlanItems(JSON.parse(raw));
    }
    const pinned = records[`${PREFIX}planPinned`];
    if (pinned !== undefined) { if (!['0','1'].includes(pinned)) throw new Error('Invalid pinned preference.'); result.preferences.planPinned = pinned === '1'; }
    for (const [old, key] of [['wsf:floor','optimizerFloor'], ['wsf:target','optimizerTarget']] as const) if (records[PREFIX + old] !== undefined) result.preferences[key] = Number(records[PREFIX + old]);
    return validateDataset(result);
  } catch (error) { throw new StorageError('corrupt', `Legacy data needs recovery: ${error instanceof Error ? error.message : 'Invalid data.'}`, { active, ...records }); }
}
function cleanupLegacy(records?: Record<string, string>) {
  // A durable dataset is the migration/deletion marker, even if browser policy
  // prevents cleanup. Future loads never consult legacy keys once it exists.
  try { for (const [key, value] of Object.entries(records ?? legacyLocal())) if (!records || localStorage.getItem(key) === value) localStorage.removeItem(key); } catch { /* Durable tombstone remains authoritative. */ }
}
export async function loadDataset(): Promise<Dataset> {
  const db = await open();
  try {
    const tx = db.transaction([STORE, 'snapshots'], 'readonly'); const completed = done(tx);
    const [raw, legacy] = await Promise.all([request(tx.objectStore(STORE).get(KEY)), request(tx.objectStore('snapshots').get('active')), completed]);
    if (raw !== undefined) {
      try { return parseStored(raw); }
      catch (error) {
        if (error instanceof StorageError && error.kind === 'corrupt') error.recoveryRecords = { dataset: raw, active: legacy, ...legacyLocal() };
        throw error;
      }
    }
    const records = legacyLocal();
    if (legacy === undefined && Object.keys(records).length === 0) return emptyDataset();
    const candidate = migrateLegacy(legacy, records);
    let saved: Dataset;
    try { saved = await saveDataset(candidate, 0); } catch (error) { if (error instanceof StorageError && error.kind === 'conflict') return loadDataset(); throw error; }
    const verify = db.transaction(STORE, 'readonly'); const verified = done(verify); const [verifiedRaw] = await Promise.all([request(verify.objectStore(STORE).get(KEY)), verified]); const readback = parseStored(verifiedRaw);
    if (readback.revision < saved.revision) throw new StorageError('unavailable', 'Could not verify the migrated data. Original data was kept.');
    cleanupLegacy(records);
    return readback;
  } catch (error) { throw unavailable(error); } finally { db.close(); }
}
export async function saveDataset(next: Dataset, expectedRevision: number): Promise<Dataset> {
  const validated = validateDataset(next);
  const db = await open();
  try {
    const tx = db.transaction([STORE, 'snapshots'], 'readwrite');
    let failure: unknown;
    let result: Dataset | undefined;
    const completion = done(tx);
    const read = tx.objectStore(STORE).get(KEY);
    read.onsuccess = () => {
      try {
        const current = read.result === undefined ? emptyDataset() : parseStored(read.result);
        if (current.revision !== expectedRevision || current.generation !== validated.generation) throw new StorageError('conflict', 'Another tab changed your data. Reload the saved data and retry.');
        result = { ...validated, revision: current.revision + 1 };
        tx.objectStore(STORE).put(result, KEY);
        tx.objectStore('snapshots').delete('active');
      } catch (error) { failure = error; tx.abort(); }
    };
    try { await completion; } catch (error) { throw failure ?? error; }
    if (!result) throw new Error('Storage transaction did not finish.');
    broadcast(result);
    return result;
  } catch (error) { throw unavailable(error); } finally { db.close(); }
}
export async function deleteDataset(expectedRevision: number): Promise<Dataset> {
  const db = await open();
  try {
    const tx = db.transaction([STORE, 'snapshots'], 'readwrite'); const completion = done(tx);
    let failure: unknown; let result: Dataset | undefined;
    const read = tx.objectStore(STORE).get(KEY);
    read.onsuccess = () => {
      try {
        const current = read.result === undefined ? emptyDataset() : parseStored(read.result);
        if (current.revision !== expectedRevision) throw new StorageError('conflict', 'Another tab changed your data. Reload before deleting.');
        result = { ...emptyDataset(), revision: current.revision + 1, generation: current.generation + 1 };
        tx.objectStore(STORE).put(result, KEY); tx.objectStore('snapshots').clear();
      } catch (error) { failure = error; tx.abort(); }
    };
    try { await completion; } catch (error) { throw failure ?? error; }
    if (!result) throw new Error('Deletion did not finish.');
    cleanupLegacy(); broadcast(result); return result;
  } catch (error) { throw unavailable(error); } finally { db.close(); }
}
export type DatasetChange = { revision: number; generation: number };
function broadcast(dataset: Dataset) { try { if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('achievement-atlas:dataset'); channel.postMessage({ revision: dataset.revision, generation: dataset.generation }); channel.close(); } } catch { /* CAS still protects other tabs. */ } }
export function subscribeDataset(callback: (change: DatasetChange) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel('achievement-atlas:dataset');
  channel.onmessage = e => { const v = e.data; if (v && Number.isSafeInteger(v.revision) && v.revision >= 0 && Number.isSafeInteger(v.generation) && v.generation >= 0) callback(v); };
  return () => channel.close();
}
// Compatibility wrappers while existing UI moves to one explicit storage owner.
export async function persistSnapshot(active: SteamData): Promise<void> { const d = await loadDataset(); await saveDataset({ ...d, active }, d.revision); }
export async function restoreSnapshot(): Promise<SteamData | null> { return (await loadDataset()).active; }
export async function forgetSnapshot(): Promise<void> { const d = await loadDataset(); await deleteDataset(d.revision); }

/** Destructive recovery is explicit and only applies to the exact corrupt data shown. */
export async function resetCorruptDataset(recoveryRecords: Record<string, unknown>): Promise<Dataset> {
  // Sort object keys for structural comparison without relying on property order.
  const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
  const captured = JSON.parse(JSON.stringify(recoveryRecords)) as Record<string, unknown>;
  const conflict = () => new StorageError('conflict', 'Saved data changed after recovery was opened. Reload and review it before resetting.');
  const db = await open();
  let legacyToClean: Record<string, string> = {};
  try {
    const tx = db.transaction([STORE, 'snapshots'], 'readwrite'); const completion = done(tx);
    let failure: unknown; let result: Dataset | undefined;
    const currentRequest = tx.objectStore(STORE).get(KEY);
    const legacyRequest = tx.objectStore('snapshots').get('active');
    let remaining = 2;
    const compareAndReset = () => {
      if (--remaining) return;
      try {
        const raw = currentRequest.result; const oldSnapshot = legacyRequest.result;
        const records = legacyLocal();
        let revision = 0; let generation = 0;
        if (Object.hasOwn(captured, 'dataset')) {
          if (raw === undefined || canonical(raw) !== canonical(captured.dataset)) throw conflict();
          const expectedRecords = Object.fromEntries(Object.entries(captured).filter(([key]) => key.startsWith(PREFIX)));
          if (canonical(oldSnapshot) !== canonical(captured.active) || canonical(records) !== canonical(expectedRecords)) throw conflict();
          let valid = false;
          try { validateDataset(raw); valid = true; } catch { /* Expected corrupt dataset. */ }
          if (valid) throw conflict();
          for (const [key, assign] of [['revision', (v: number) => { revision = v; }], ['generation', (v: number) => { generation = v; }]] as const) {
            const value = raw?.[key];
            if (Number.isSafeInteger(value) && value >= 0) {
              if (value >= Number.MAX_SAFE_INTEGER) throw new StorageError('unavailable', 'The storage revision cannot be reset safely. Export recovery data before clearing browser site data.');
              assign(value);
            }
          }
          legacyToClean = records;
        } else {
          if (raw !== undefined) throw conflict();
          const expectedRecords = Object.fromEntries(Object.entries(captured).filter(([key]) => key.startsWith(PREFIX)));
          if (canonical(oldSnapshot) !== canonical(captured.active) || canonical(records) !== canonical(expectedRecords)) throw conflict();
          let corrupt = false;
          try { migrateLegacy(oldSnapshot, records); } catch (error) { if (error instanceof StorageError && error.kind === 'corrupt') corrupt = true; else throw error; }
          if (!corrupt) throw conflict();
          legacyToClean = records;
        }
        result = { ...emptyDataset(), revision: revision + 1, generation: generation + 1 };
        tx.objectStore(STORE).put(result, KEY); tx.objectStore('snapshots').clear();
      } catch (error) { failure = error; tx.abort(); }
    };
    currentRequest.onsuccess = compareAndReset; legacyRequest.onsuccess = compareAndReset;
    try { await completion; } catch (error) { throw failure ?? error; }
    if (!result) throw new Error('Recovery reset did not finish.');
    cleanupLegacy(legacyToClean); broadcast(result); return result;
  } catch (error) { throw unavailable(error); } finally { db.close(); }
}
