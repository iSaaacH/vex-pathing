/**
 * The saved-routine library. PLAN.md §6.4 — the "named routines in IndexedDB" half.
 *
 * Deliberately a plain async module rather than a store: it is I/O, and the UI reloads
 * the list when it opens rather than trying to keep a live mirror of the database in
 * sync with itself.
 *
 * localStorage holds the *working* document (the autosave, so a closed tab loses
 * nothing). This holds *named* documents the user chose to keep. They are different
 * jobs and deliberately different storage.
 */

import type { Routine } from '../model/types';

const DB_NAME = 'vex-pathing';
const DB_VERSION = 1;
const STORE = 'routines';

export type SavedRoutine = {
  id: string;
  name: string;
  updatedAt: number;
  routine: Routine;
};

/** Summary for the list view — avoids holding every routine in memory at once. */
export type RoutineSummary = {
  id: string;
  name: string;
  updatedAt: number;
  segments: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
        t.oncomplete = () => db.close();
      }),
  );
}

export function newRoutineId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Newest first — the one you were last working on is the one you want. */
export async function listRoutines(): Promise<RoutineSummary[]> {
  try {
    const all = await tx<SavedRoutine[]>('readonly', (s) => s.getAll() as IDBRequest<SavedRoutine[]>);
    return all
      .map((r) => ({
        id: r.id,
        name: r.name,
        updatedAt: r.updatedAt,
        segments: r.routine?.segments?.length ?? 0,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    // Private browsing or a blocked database — the app still works without a library.
    return [];
  }
}

export async function saveRoutine(id: string, routine: Routine): Promise<SavedRoutine> {
  const record: SavedRoutine = {
    id,
    name: routine.name,
    updatedAt: Date.now(),
    // Snapshot via JSON, so later edits to the working document don't mutate the saved
    // copy. Not structuredClone: the working routine is a Svelte reactive proxy and
    // structuredClone chokes on those. The document is plain JSON by design (§6.2), so
    // the round-trip is lossless.
    routine: JSON.parse(JSON.stringify(routine)) as Routine,
  };
  await tx('readwrite', (s) => s.put(record));
  return record;
}

export async function loadRoutine(id: string): Promise<Routine | null> {
  try {
    const rec = await tx<SavedRoutine | undefined>(
      'readonly',
      (s) => s.get(id) as IDBRequest<SavedRoutine | undefined>,
    );
    return rec?.routine ?? null;
  } catch {
    return null;
  }
}

export async function deleteRoutine(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}

export async function renameRoutine(id: string, name: string): Promise<void> {
  const rec = await tx<SavedRoutine | undefined>(
    'readonly',
    (s) => s.get(id) as IDBRequest<SavedRoutine | undefined>,
  );
  if (!rec) return;
  rec.name = name;
  rec.routine.name = name;
  rec.updatedAt = Date.now();
  await tx('readwrite', (s) => s.put(rec));
}

/** "3 minutes ago" / "yesterday" — a timestamp nobody reads is wasted space. */
export function relativeTime(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(ts).toLocaleDateString();
}
