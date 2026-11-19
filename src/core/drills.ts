// Posiciones de repaso: tus errores graves, con filtros por motivo, patrón, apertura o partida.
import type { GameRec, MoveRec, Tag, TrainerItem } from '../types';
import { isBigErr } from './analysis';
import { occurrences } from './patterns';

export interface DrillItem { key: string; gid: string; i: number; m: MoveRec; rec: GameRec; fen: string }
/** La apertura son las 10 primeras jugadas (20 medias jugadas), igual que en el informe de aperturas. */
export const OPENING_PLIES = 20;

export interface DrillFilter { tag?: Tag; patternKey?: string; opening?: string; gameId?: string; itemKey?: string; /** Solo errores en las primeras `maxPly` medias jugadas. */ maxPly?: number }

export function allItems(recs: GameRec[]): DrillItem[] {
  const out: DrillItem[] = [];
  for (const g of recs) {
    g.moves.forEach((m, i) => {
      if (isBigErr(m.c) && m.b && m.f) out.push({ key: g.id + ':' + i, gid: g.id, i, m, rec: g, fen: m.f + ' 0 1' });
    });
  }
  return out;
}

export function filterItems(items: DrillItem[], f?: DrillFilter): DrillItem[] {
  if (!f) return items;
  return items.filter((it) => {
    if (f.tag && !(it.m.p === f.tag || it.m.t?.includes(f.tag))) return false;
    if (f.gameId && it.gid !== f.gameId) return false;
    if (f.itemKey && it.key !== f.itemKey) return false;
    if (f.opening && it.rec.opening !== f.opening) return false;
    if (f.maxPly != null && it.i >= f.maxPly) return false;
    if (f.patternKey && !occurrences(it.rec, it.m, it.i).some((o) => o.key === f.patternKey)) return false;
    return true;
  });
}

export const hasFilter = (f?: DrillFilter) => !!f && Object.values(f).some(Boolean);

export const BOX_DAYS = [0, 1, 3, 7, 14, 30];

/** Cola de repaso: primero lo vencido y no visto, ordenado por gravedad. `extra` añade lo no vencido (práctica extra). */
export function queue(items: DrillItem[], trainer: Map<string, TrainerItem>, now = Date.now(), extra = false) {
  const due = items.filter((it) => {
    const st = trainer.get(it.key);
    return !st || st.due <= now;
  });
  const rank = (a: DrillItem) => (trainer.has(a.key) ? 1 : 0);
  const sorter = (a: DrillItem, b: DrillItem) => rank(a) - rank(b) || (b.m.d || 0) - (a.m.d || 0);
  due.sort(sorter);
  if (!extra) return due;
  const rest = items.filter((it) => !due.includes(it)).sort((a, b) => (trainer.get(a.key)?.box ?? 0) - (trainer.get(b.key)?.box ?? 0) || (b.m.d || 0) - (a.m.d || 0));
  return [...due, ...rest];
}
