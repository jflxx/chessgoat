// Análisis agregados para las pestañas del informe: errores, reloj y aperturas.
import type { GameRec, PieceType, Tag } from '../types';
import { aggregate, isBigErr, winPct } from './analysis';
import { parseTimeControl } from './pgn';

// ---------- errores ----------
export type TrendDir = 'peor' | 'mejor' | 'estable' | 'sin_datos';

export interface ErrorInsights {
  games: number;
  userMoves: number;
  perGame: { id: string; x: number; m: number; i: number; result: string; opp: string }[];
  gamesWithBig: number;
  gamesWithBlunder: number;
  avgLossBlunder: number;
  /** Errores (m + x) y jugadas tuyas por tramo de 5 jugadas: 1-5, 6-10, ... y 36 o más. */
  byMove: { label: string; moves: number; errors: number; per100: number }[];
  /** Cuando cometiste el error, ¿cómo estabas? Ganando (65 % o más), igualado o perdiendo (35 % o menos). */
  bySituation: { winning: number; equal: number; losing: number };
  pieces: Partial<Record<PieceType, number>>;
  /** Casillas donde se perdieron piezas o peones, o donde estaba tu rey al recibir el ataque. */
  squares: Record<string, number>;
  tags: { tag: Tag; n: number; loss: number; blunders: number; share: number; trend: TrendDir }[];
}

const SQUARE_TAGS: Tag[] = ['pieza_colgada', 'peon_perdido', 'horquilla', 'mate_rey', 'rey_expuesto'];
export const MOVE_BUCKETS = 8;
const bucketLabel = (b: number) => (b === MOVE_BUCKETS - 1 ? `${b * 5 + 1}+` : `${b * 5 + 1}-${b * 5 + 5}`);

function trendOf(curN: number, curG: number, prevN: number, prevG: number): TrendDir {
  if (prevG < 5 || !curG) return 'sin_datos';
  const a = curN / curG;
  const b = prevN / prevG;
  if (a === 0 && b === 0) return 'estable';
  if (a > b * 1.25 + 0.02) return 'peor';
  if (a < b * 0.75 - 0.02) return 'mejor';
  return 'estable';
}

export function errorInsights(recs: GameRec[], prev: GameRec[] = []): ErrorInsights {
  const moves = new Array<number>(MOVE_BUCKETS).fill(0);
  const errs = new Array<number>(MOVE_BUCKETS).fill(0);
  const sit = { winning: 0, equal: 0, losing: 0 };
  const pieces: ErrorInsights['pieces'] = {};
  const squares: Record<string, number> = {};
  let blunders = 0, blLoss = 0, userMoves = 0, withBig = 0, withX = 0;
  for (const g of recs) {
    const sign = g.color === 'w' ? 1 : -1;
    if (g.counts.x + g.counts.m > 0) withBig++;
    if (g.counts.x > 0) withX++;
    g.moves.forEach((m, i) => {
      if (!m.c) return;
      userMoves++;
      const b = Math.min(MOVE_BUCKETS - 1, Math.floor(Math.floor(i / 2) / 5));
      moves[b]++;
      if (!isBigErr(m.c)) return;
      errs[b]++;
      if (m.c === 'x') { blunders++; blLoss += m.d || 0; }
      const wcB = winPct(sign * (i > 0 ? g.moves[i - 1].e : 20));
      if (wcB >= 65) sit.winning++; else if (wcB <= 35) sit.losing++; else sit.equal++;
      if (m.k && (m.p === 'pieza_colgada' || m.p === 'peon_perdido')) pieces[m.k] = (pieces[m.k] || 0) + 1;
      if (m.hs && m.p && SQUARE_TAGS.includes(m.p)) squares[m.hs] = (squares[m.hs] || 0) + 1;
    });
  }
  const A = aggregate(recs);
  const P = aggregate(prev);
  const totalErr = Object.values(A.tags).reduce((s, t) => s + (t?.n || 0), 0) || 1;
  const tags = (Object.entries(A.tags) as [Tag, { n: number; loss: number; blunders: number }][])
    .map(([tag, v]) => ({ tag, n: v.n, loss: v.loss, blunders: v.blunders, share: Math.round((v.n / totalErr) * 100), trend: trendOf(v.n, A.n, P.tags[tag]?.n || 0, P.n) }))
    .sort((a, b) => b.n - a.n || b.loss - a.loss);
  return {
    games: recs.length,
    userMoves,
    perGame: recs.map((g) => ({ id: g.id, x: g.counts.x, m: g.counts.m, i: g.counts.i, result: g.result, opp: g.opp })),
    gamesWithBig: withBig,
    gamesWithBlunder: withX,
    avgLossBlunder: blunders ? Math.round(blLoss / blunders) : 0,
    byMove: moves.map((n, b) => ({ label: bucketLabel(b), moves: n, errors: errs[b], per100: n ? Math.round((errs[b] / n) * 1000) / 10 : 0 })),
    bySituation: sit,
    pieces,
    squares,
    tags,
  };
}

// ---------- reloj ----------
export interface Bucket { label: string; moves: number; errors: number; rate: number }
export interface ClockDetail {
  byRemaining: Bucket[];
  bySpent: Bucket[];
  /** Por tramo de 5 jugadas: segundos medios por jugada y porcentaje medio de tiempo que te queda. */
  byMove: { label: string; avgSp: number; leftPct: number; moves: number }[];
  troubleGames: { id: string; opp: string; result: string; minLeftPct: number; atMove: number }[];
  flagGames: { id: string; opp: string; winningAtEnd: boolean }[];
}

const mkBuckets = (labels: string[]): Bucket[] => labels.map((label) => ({ label, moves: 0, errors: 0, rate: 0 }));
const fin = (bs: Bucket[]) => { for (const b of bs) b.rate = b.moves ? Math.round((b.errors / b.moves) * 1000) / 10 : 0; return bs; };

export function clockDetail(recs: GameRec[]): ClockDetail {
  const byRemaining = mkBuckets(['Más del 75 %', '50 a 75 %', '25 a 50 %', '10 a 25 %', 'Menos del 10 %']);
  const bySpent = mkBuckets(['Menos de 1 s', '1 a 3 s', '3 a 10 s', '10 a 30 s', 'Más de 30 s']);
  const mv = Array.from({ length: MOVE_BUCKETS }, () => ({ sp: 0, left: 0, n: 0, nl: 0 }));
  const troubleGames: ClockDetail['troubleGames'] = [];
  const flagGames: ClockDetail['flagGames'] = [];
  for (const g of recs) {
    const base = parseTimeControl(g.tc).base;
    if (!g.moves.some((m) => m.cl != null)) continue;
    let minLeft = 100;
    let minAt = 0;
    g.moves.forEach((m, i) => {
      if (!m.c || m.cl == null) return;
      const err = isBigErr(m.c);
      const b = Math.min(MOVE_BUCKETS - 1, Math.floor(Math.floor(i / 2) / 5));
      if (base > 0) {
        const left = (m.cl / base) * 100;
        if (left < minLeft) { minLeft = left; minAt = Math.floor(i / 2) + 1; }
        const k = left > 75 ? 0 : left > 50 ? 1 : left > 25 ? 2 : left > 10 ? 3 : 4;
        byRemaining[k].moves++;
        if (err) byRemaining[k].errors++;
        mv[b].left += Math.min(100, left);
        mv[b].nl++;
      }
      if (m.sp != null) {
        const k = m.sp < 1 ? 0 : m.sp < 3 ? 1 : m.sp < 10 ? 2 : m.sp < 30 ? 3 : 4;
        bySpent[k].moves++;
        if (err) bySpent[k].errors++;
        mv[b].sp += m.sp;
        mv[b].n++;
      }
    });
    if (base > 0 && minLeft < 10) troubleGames.push({ id: g.id, opp: g.opp, result: g.result, minLeftPct: Math.round(minLeft), atMove: minAt });
    if (g.result === 'L' && /tiempo|time/i.test(g.term)) {
      const sign = g.color === 'w' ? 1 : -1;
      const last = g.moves[g.moves.length - 1];
      flagGames.push({ id: g.id, opp: g.opp, winningAtEnd: !!last && winPct(sign * last.e) >= 60 });
    }
  }
  troubleGames.sort((a, b) => a.minLeftPct - b.minLeftPct);
  return {
    byRemaining: fin(byRemaining),
    bySpent: fin(bySpent),
    byMove: mv.map((x, b) => ({ label: bucketLabel(b), avgSp: x.n ? Math.round((x.sp / x.n) * 10) / 10 : 0, leftPct: x.nl ? Math.round(x.left / x.nl) : 0, moves: x.n })),
    troubleGames,
    flagGames,
  };
}

// ---------- aperturas ----------
export interface OpeningRow {
  key: string;
  name: string;
  color: 'w' | 'b';
  n: number;
  W: number;
  D: number;
  L: number;
  acc: number;
  errPerGame: number;
  /** Errores y errores graves en las primeras 10 jugadas, por partida. */
  earlyPerGame: number;
  score: number; // 0 a 1
  lastId: string;
}

export interface OpeningsDetail { white: OpeningRow[]; black: OpeningRow[]; best: OpeningRow | null; worst: OpeningRow | null }

export function openingsDetail(recs: GameRec[]): OpeningsDetail {
  const map = new Map<string, OpeningRow & { accSum: number; errSum: number; earlySum: number }>();
  for (const g of recs) {
    const key = g.color + '|' + g.opening;
    let o = map.get(key);
    if (!o) map.set(key, (o = { key, name: g.opening, color: g.color, n: 0, W: 0, D: 0, L: 0, acc: 0, errPerGame: 0, earlyPerGame: 0, score: 0, lastId: g.id, accSum: 0, errSum: 0, earlySum: 0 }));
    o.n++;
    o[g.result]++;
    o.accSum += g.acc;
    o.errSum += g.counts.m + g.counts.x;
    o.earlySum += g.moves.slice(0, 20).filter((m) => isBigErr(m.c)).length;
    o.lastId = g.id;
  }
  const rows: OpeningRow[] = [...map.values()].map((o) => ({
    key: o.key, name: o.name, color: o.color, n: o.n, W: o.W, D: o.D, L: o.L,
    acc: Math.round((o.accSum / o.n) * 10) / 10, errPerGame: Math.round((o.errSum / o.n) * 10) / 10, earlyPerGame: Math.round((o.earlySum / o.n) * 10) / 10,
    score: (o.W + o.D / 2) / o.n, lastId: o.lastId,
  }));
  rows.sort((a, b) => b.n - a.n || b.score - a.score);
  const rated = rows.filter((r) => r.n >= 2);
  const best = [...rated].sort((a, b) => b.score - a.score || b.n - a.n)[0] || null;
  const worst = [...rated].sort((a, b) => a.score - b.score || b.n - a.n)[0] || null;
  return { white: rows.filter((r) => r.color === 'w'), black: rows.filter((r) => r.color === 'b'), best, worst: worst && worst.key !== best?.key ? worst : null };
}
