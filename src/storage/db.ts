// Persistencia en IndexedDB (todo queda en tu navegador). Si IndexedDB no está disponible, usa memoria.
import type { BackupFile, GameRec, Settings, TrainerItem } from '../types';
import type { PlanState } from '../core/tasks';

export interface StoreData {
  games: GameRec[];
  settings: Settings | null;
  trainer: TrainerItem[];
  activity: string[];
  plan: PlanState | null;
}

export interface Store {
  mode(): 'indexeddb' | 'memoria';
  loadAll(): Promise<StoreData>;
  saveGame(g: GameRec): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
  savePlan(p: PlanState | null): Promise<void>;
  saveTrainerItem(t: TrainerItem): Promise<void>;
  addActivity(day: string): Promise<void>;
  /** Borra partidas, repaso y actividad (conserva los ajustes). */
  clearData(): Promise<void>;
  /** Reemplaza o fusiona el contenido de una copia de seguridad. */
  restore(b: BackupFile, how: 'merge' | 'replace'): Promise<void>;
}

const DB_NAME = 'entrenador-ajedrez';
const DB_VERSION = 1;
const STORES = ['games', 'meta', 'trainer', 'activity'] as const;
type StoreName = (typeof STORES)[number];

const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx: IDBTransaction) => new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = factory.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('games')) db.createObjectStore('games', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
      if (!db.objectStoreNames.contains('trainer')) db.createObjectStore('trainer', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('activity')) db.createObjectStore('activity', { keyPath: 'day' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña.'));
  });
}

export async function createStore(factory: IDBFactory | null = typeof indexedDB !== 'undefined' ? indexedDB : null): Promise<Store> {
  let db: IDBDatabase | null = null;
  if (factory) {
    try { db = await open(factory); } catch { db = null; }
  }
  if (db) {
    try { await navigator.storage?.persist?.(); } catch { /* opcional */ }
    return idbStore(db);
  }
  return memoryStore();
}

function idbStore(db: IDBDatabase): Store {
  const all = async <T>(name: StoreName) => req<T[]>(db.transaction(name).objectStore(name).getAll());
  const put = async (name: StoreName, value: unknown) => {
    const tx = db.transaction(name, 'readwrite');
    tx.objectStore(name).put(value);
    await done(tx);
  };
  return {
    mode: () => 'indexeddb',
    async loadAll() {
      const [games, meta, trainer, act] = await Promise.all([
        all<GameRec>('games'), all<{ k: string; v: unknown }>('meta'), all<TrainerItem>('trainer'), all<{ day: string }>('activity'),
      ]);
      games.sort((a, b) => a.ts - b.ts);
      const s = meta.find((m) => m.k === 'settings');
      const p = meta.find((m) => m.k === 'plan');
      return { games, settings: (s?.v as Settings) ?? null, trainer, activity: act.map((a) => a.day).sort(), plan: (p?.v as PlanState) ?? null };
    },
    saveGame: (g) => put('games', g),
    saveSettings: (s) => put('meta', { k: 'settings', v: s }),
    async savePlan(p) {
      if (p) return put('meta', { k: 'plan', v: p });
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').delete('plan');
      await done(tx);
    },
    saveTrainerItem: (t) => put('trainer', t),
    addActivity: (day) => put('activity', { day }),
    async clearData() {
      const tx = db.transaction(['games', 'trainer', 'activity', 'meta'], 'readwrite');
      tx.objectStore('meta').delete('plan');
      tx.objectStore('games').clear();
      tx.objectStore('trainer').clear();
      tx.objectStore('activity').clear();
      await done(tx);
    },
    async restore(b, how) {
      const tx = db.transaction(['games', 'meta', 'trainer', 'activity'], 'readwrite');
      if (how === 'replace') {
        tx.objectStore('games').clear();
        tx.objectStore('trainer').clear();
        tx.objectStore('activity').clear();
      }
      b.games.forEach((g) => tx.objectStore('games').put(g));
      b.trainer.forEach((t) => tx.objectStore('trainer').put(t));
      b.activity.forEach((day) => tx.objectStore('activity').put({ day }));
      if (b.settings && how === 'replace') tx.objectStore('meta').put({ k: 'settings', v: b.settings });
      if (b.plan) tx.objectStore('meta').put({ k: 'plan', v: b.plan });
      await done(tx);
    },
  };
}

function memoryStore(): Store {
  const games = new Map<string, GameRec>();
  const trainer = new Map<string, TrainerItem>();
  const activity = new Set<string>();
  let settings: Settings | null = null;
  let plan: PlanState | null = null;
  return {
    mode: () => 'memoria',
    async loadAll() {
      return { games: [...games.values()].sort((a, b) => a.ts - b.ts), settings, trainer: [...trainer.values()], activity: [...activity].sort(), plan };
    },
    async saveGame(g) { games.set(g.id, g); },
    async saveSettings(s) { settings = s; },
    async savePlan(p) { plan = p; },
    async saveTrainerItem(t) { trainer.set(t.key, t); },
    async addActivity(day) { activity.add(day); },
    async clearData() { games.clear(); trainer.clear(); activity.clear(); plan = null; },
    async restore(b, how) {
      if (how === 'replace') { games.clear(); trainer.clear(); activity.clear(); }
      b.games.forEach((g) => games.set(g.id, g));
      b.trainer.forEach((t) => trainer.set(t.key, t));
      b.activity.forEach((d) => activity.add(d));
      if (b.settings && how === 'replace') settings = b.settings;
      if (b.plan) plan = b.plan;
    },
  };
}
