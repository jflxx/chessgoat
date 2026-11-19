// Detección de patrones recurrentes entre tandas de partidas.
// Una "tanda" son las últimas N partidas (la ventana); la tanda anterior son las N partidas previas.
import type { GameRec, MoveRec, PieceType, Tag } from '../types';
import { PIECE_NAME, isBigErr } from './analysis';
import { stripColor } from './openings';

export type PatternKind = 'casilla' | 'posicion' | 'apertura';
export type PatternStatus = 'persistente' | 'nuevo' | 'mejorando' | 'resuelto';

export interface Pattern {
  key: string;
  kind: PatternKind;
  tag: Tag | null;
  title: string;
  detail: string;
  /** Partidas distintas de la tanda actual / de la anterior en las que aparece. */
  cur: number;
  prev: number;
  total: number;
  status: PatternStatus;
  loss: number;
  examples: { gid: string; i: number }[];
}

const SQUARE_TAGS: Tag[] = ['pieza_colgada', 'peon_perdido', 'horquilla', 'mate_rey', 'rey_expuesto'];

export interface Occ { key: string; kind: PatternKind; tag: Tag | null; title: string; detail: string }

export function occurrences(g: GameRec, m: MoveRec, i: number): Occ[] {
  const out: Occ[] = [];
  if (m.p && m.hs && SQUARE_TAGS.includes(m.p)) {
    const pc = (m.p === 'horquilla' ? m.fp : m.k) as PieceType | undefined;
    const key = `${m.p}:${pc || ''}@${m.hs}`;
    let title = '';
    let detail = '';
    switch (m.p) {
      case 'pieza_colgada':
        title = `Pieza colgada: ${pc ? PIECE_NAME[pc] : 'pieza'} en ${m.hs}`;
        detail = `El rival gana material capturando en ${m.hs}. Antes de mover, comprueba qué casillas quedan sin defensa.`;
        break;
      case 'peon_perdido':
        title = `Peón perdido en ${m.hs}`;
        detail = `Repites el descuido de dejar un peón sin defensa en ${m.hs}.`;
        break;
      case 'horquilla':
        title = `Horquilla de ${pc ? PIECE_NAME[pc] : 'pieza'} rival en ${m.hs}`;
        detail = `El rival ataca dos piezas a la vez desde ${m.hs}. Mira qué casillas controla antes de colocar tus piezas.`;
        break;
      case 'mate_rey':
        title = `Ataques decisivos a tu rey en ${m.hs}`;
        detail = `Tu rey en ${m.hs} recibe ataques que acaban en mate o en pérdida grave.`;
        break;
      default:
        title = `Rey expuesto en ${m.hs}`;
        detail = `Los jaques cerca de tu rey en ${m.hs} te cuestan ventaja una y otra vez.`;
    }
    out.push({ key, kind: 'casilla', tag: m.p, title, detail });
  }
  if (m.f) {
    out.push({
      key: `pos:${m.f}|${m.s}`,
      kind: 'posicion',
      tag: m.p || null,
      title: `Mismo error en la misma posición: ${m.s}`,
      detail: m.bs ? `Llegas a esta posición y juegas ${m.s} en vez de ${m.bs}.` : `Llegas a esta posición y juegas ${m.s}, que pierde ventaja.`,
    });
  }
  if (i < 20) {
    const name = stripColor(g.opening);
    out.push({
      key: `ap:${g.color}|${g.opening}`,
      kind: 'apertura',
      tag: null,
      title: `Errores tempranos en ${name} (${g.color === 'w' ? 'blancas' : 'negras'})`,
      detail: `Pierdes ventaja en las primeras 10 jugadas de esta apertura. Revisa la línea y fija un plan.`,
    });
  }
  return out;
}

interface Acc { occ: Occ; cur: Set<string>; prev: Set<string>; loss: number; examples: { gid: string; i: number }[] }

/**
 * @param recs partidas analizadas en orden cronológico
 * @param window tamaño de la tanda (20, 30, 40 o 50)
 * @param minGames mínimo de partidas distintas (tanda actual + anterior) para considerarlo patrón
 */
export function detectPatterns(recs: GameRec[], window: number, minGames = 2): Pattern[] {
  const cur = recs.slice(-window);
  const prev = recs.slice(-2 * window, -window).slice(0, Math.max(0, recs.length - cur.length));
  const map = new Map<string, Acc>();
  const scan = (list: GameRec[], which: 'cur' | 'prev') => {
    for (const g of list) {
      g.moves.forEach((m, i) => {
        if (!isBigErr(m.c)) return;
        for (const o of occurrences(g, m, i)) {
          let a = map.get(o.key);
          if (!a) map.set(o.key, (a = { occ: o, cur: new Set(), prev: new Set(), loss: 0, examples: [] }));
          a[which].add(g.id);
          if (which === 'cur') {
            a.loss += m.d || 0;
            if (a.examples.length < 6) a.examples.push({ gid: g.id, i });
          }
        }
      });
    }
  };
  scan(prev, 'prev');
  scan(cur, 'cur');

  const out: Pattern[] = [];
  for (const a of map.values()) {
    const total = a.cur.size + a.prev.size;
    if (total < minGames) continue;
    let status: PatternStatus;
    if (a.cur.size >= 1 && a.prev.size >= 1) status = 'persistente';
    else if (a.cur.size >= minGames && a.prev.size === 0) status = 'nuevo';
    else if (a.cur.size === 0) status = 'resuelto';
    else status = 'mejorando';
    out.push({
      key: a.occ.key, kind: a.occ.kind, tag: a.occ.tag, title: a.occ.title, detail: a.occ.detail,
      cur: a.cur.size, prev: a.prev.size, total, status, loss: Math.round(a.loss), examples: a.examples,
    });
  }
  const rank: Record<PatternStatus, number> = { persistente: 0, nuevo: 1, mejorando: 2, resuelto: 3 };
  // En un mismo estado: primero los que cuestan más (más veces y más puntos).
  out.sort((a, b) => rank[a.status] - rank[b.status] || b.total - a.total || b.loss - a.loss || a.key.localeCompare(b.key));
  return out;
}

export const STATUS_ES: Record<PatternStatus, string> = {
  persistente: 'Persistente',
  nuevo: 'Nuevo',
  mejorando: 'Mejorando',
  resuelto: 'Resuelto',
};

export const STATUS_HELP: Record<PatternStatus, string> = {
  persistente: 'Aparece en la tanda actual y en la anterior.',
  nuevo: 'Aparece varias veces en la tanda actual y antes no.',
  mejorando: 'Aparece menos que antes.',
  resuelto: 'Estaba en la tanda anterior y ya no aparece.',
};
