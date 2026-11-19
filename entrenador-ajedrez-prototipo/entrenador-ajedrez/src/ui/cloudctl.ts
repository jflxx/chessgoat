// Guardado de tus datos: almacenamiento persistente del navegador y copia cifrada opcional en la nube.
import { buildBackup, parseBackup } from '../storage/backup';
import { CloudError, cloudPull, cloudPush, validateConfig } from '../storage/cloud';
import { S, saveSettings, toast } from './state';

export const cloudConfigured = () => !!(S.settings.cloudUrl && S.settings.cloudKey && S.settings.cloudCode);
const cfg = () => validateConfig({ url: S.settings.cloudUrl, key: S.settings.cloudKey, code: S.settings.cloudCode });

export interface StorageInfo { persisted: boolean | null; usage: number; quota: number }
export const storageInfo: StorageInfo = { persisted: null, usage: 0, quota: 0 };

export async function refreshStorageInfo() {
  try {
    storageInfo.persisted = (await navigator.storage?.persisted?.()) ?? null;
    const e = await navigator.storage?.estimate?.();
    storageInfo.usage = e?.usage ?? 0;
    storageInfo.quota = e?.quota ?? 0;
  } catch { /* sin API */ }
}

export async function requestPersistence(): Promise<boolean> {
  let ok = false;
  try { ok = (await navigator.storage?.persist?.()) ?? false; } catch { /* sin API */ }
  await refreshStorageInfo();
  return ok;
}

let pushing = false;

/** Sube una copia cifrada. Devuelve true si se subió. */
export async function pushNow(silent = false): Promise<boolean> {
  if (pushing || !S.store) return false;
  pushing = true;
  try {
    const json = JSON.stringify(buildBackup(await S.store.loadAll()));
    await cloudPush(cfg(), json);
    S.dirty = false;
    await saveSettings({ cloudLast: new Date().toISOString() });
    if (!silent) toast('Copia subida a la nube.');
    return true;
  } catch (e) {
    if (!silent) toast(e instanceof CloudError ? e.message : 'No pude subir la copia.', 5000);
    return false;
  } finally {
    pushing = false;
  }
}

/** Descarga y valida la copia de la nube. Lanza CloudError si falla. */
export async function pullBackup() {
  const r = await cloudPull(cfg());
  if (!r) return null;
  return { backup: parseBackup(r.json), updatedAt: r.updatedAt };
}

/** Sube solo si hay cambios sin copiar y la sincronización automática está activa. */
export async function maybeAutoPush() {
  if (S.settings.cloudAuto && cloudConfigured() && S.dirty) await pushNow(true);
}

export function initCloud() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void maybeAutoPush();
  });
  setInterval(() => void maybeAutoPush(), 120000);
}
