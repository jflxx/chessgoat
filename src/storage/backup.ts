// Exportar e importar los datos en JSON.
import type { BackupFile, GameRec, Settings, TrainerItem } from '../types';
import type { StoreData } from './db';

export function buildBackup(d: StoreData, now = new Date()): BackupFile {
  // Las credenciales de la nube no van dentro de los archivos de copia.
  const settings = d.settings ? { ...d.settings, cloudUrl: '', cloudKey: '', cloudCode: '', cloudLast: '' } : null;
  return { app: 'entrenador-ajedrez', version: 1, exportedAt: now.toISOString(), settings, games: d.games, trainer: d.trainer, activity: d.activity, plan: d.plan };
}

export class BackupError extends Error {}

const isGame = (g: unknown): g is GameRec => {
  const o = g as GameRec;
  return !!o && typeof o.id === 'string' && typeof o.ts === 'number' && Array.isArray(o.moves) && (o.color === 'w' || o.color === 'b') && !!o.counts;
};
const isItem = (t: unknown): t is TrainerItem => {
  const o = t as TrainerItem;
  return !!o && typeof o.key === 'string' && typeof o.box === 'number' && typeof o.due === 'number';
};

/** Valida el texto de un archivo de copia de seguridad. Descarta entradas dañadas. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new BackupError('El archivo no es un JSON válido.'); }
  const o = raw as Partial<BackupFile>;
  if (!o || o.app !== 'entrenador-ajedrez') throw new BackupError('Este archivo no es una copia de seguridad de esta aplicación.');
  if (o.version !== 1) throw new BackupError('Versión de copia de seguridad no compatible (' + String(o.version) + ').');
  const games = (Array.isArray(o.games) ? o.games : []).filter(isGame);
  const trainer = (Array.isArray(o.trainer) ? o.trainer : []).filter(isItem);
  const activity = (Array.isArray(o.activity) ? o.activity : []).filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));
  const settings = o.settings && typeof o.settings === 'object' ? (o.settings as Settings) : null;
  const plan = o.plan && typeof o.plan === 'object' && Array.isArray((o.plan as { tasks?: unknown }).tasks) ? o.plan : null;
  return { app: 'entrenador-ajedrez', version: 1, exportedAt: String(o.exportedAt || ''), settings, games, trainer, activity, plan };
}

export function backupFileName(now = new Date()): string {
  return 'chessgoat-' + now.toISOString().slice(0, 10) + '.json';
}
