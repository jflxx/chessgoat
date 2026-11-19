// Lógica pura de análisis: partida + motor -> evaluación -> clasificación -> motivos -> estadísticas.
import { Chess, type Move } from 'chess.js';
import type { Cls, Color, EngineLike, GameRec, MoveRec, ParsedGame, Phase, PhaseStats, PieceType, Tag } from '../types';
import { openingName } from './openings';
import { parseTimeControl } from './pgn';
import { recaptureGain } from './see';

export const MATE = 1500;
const VAL: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const PIECE_ES: Record<PieceType, string> = { p: 'un peón', n: 'un caballo', b: 'un alfil', r: 'una torre', q: 'la dama', k: 'el rey' };
export const PIECE_NAME: Record<PieceType, string> = { p: 'peón', n: 'caballo', b: 'alfil', r: 'torre', q: 'dama', k: 'rey' };

// ---------- utilidades de evaluación ----------
export function winPct(cp: number): number {
  const c = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}
export function moveAccuracy(delta: number): number {
  const d = Math.max(0, delta);
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * d) - 3.1669));
}
export function classify(delta: number, isBest: boolean): Cls {
  if (isBest) return 'b';
  if (delta >= 30) return 'x';
  if (delta >= 20) return 'm';
  if (delta >= 10) return 'i';
  return 'g';
}
export const CLASS_ES: Record<Cls, string> = { k: 'Brillante', h: 'Genial', b: 'Mejor', g: 'Buena', i: 'Imprecisión', m: 'Error', x: 'Error grave' };
/** Jugadas que destacan por lo buenas: brillantes y geniales. */
export const isSpecial = (c?: Cls) => c === 'k' || c === 'h';
export const isErr = (c?: Cls) => c === 'i' || c === 'm' || c === 'x';
export const isBigErr = (c?: Cls) => c === 'm' || c === 'x';

// ---------- fase ----------
function materialFromFen(fen: string): number {
  let m = 0;
  for (const ch of fen.split(' ')[0]) {
    const k = ch.toLowerCase() as PieceType;
    if (k === 'n' || k === 'b' || k === 'r' || k === 'q') m += VAL[k];
  }
  return m;
}
export function phaseOf(fen: string, plyIndex: number): Phase {
  if (plyIndex < 20) return 'apertura';
  return materialFromFen(fen) <= 26 ? 'final' : 'medio';
}
export const PHASE_ES: Record<Phase, string> = { apertura: 'Apertura', medio: 'Medio juego', final: 'Final' };

// ---------- motivos del error ----------
const sqDist = (a: string, b: string) => Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(+a[1] - +b[1]));
function kingSq(ch: Chess, color: Color): string | null {
  for (const row of ch.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  return null;
}
const tryMove = (ch: Chess, uci?: string | null): Move | null => {
  if (!uci) return null;
  try {
    return ch.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
};

export interface PlyLike {
  uci: string;
  captured: PieceType | null;
  to: string;
  before: string;
  after: string;
}
export interface MotifResult {
  tags: Tag[];
  primary: Tag;
  x: Partial<Pick<MoveRec, 'r' | 'k' | 'mp' | 'bs' | 'ms' | 'hs' | 'fp'>>;
}

/**
 * Etiqueta el motivo de una jugada mala.
 * @param bestUci mejor jugada según el motor en la posición previa
 * @param replyUci mejor respuesta del rival tras la jugada
 * @param delta pérdida de probabilidad de ganar
 * @param evalAfterW evaluación (desde blancas) tras la jugada
 */
export function motifs(ply: PlyLike, bestUci: string | null, replyUci: string | undefined, delta: number, wcBefore: number, wcAfter: number, evalAfterW: number, me: Color): MotifResult {
  const opp: Color = me === 'w' ? 'b' : 'w';
  const tags: Tag[] = [];
  const x: MotifResult['x'] = {};
  const hsBy: Partial<Record<Tag, string>> = {};
  const mine = ply.captured ? VAL[ply.captured] : 0;
  const ac = new Chess(ply.after);
  const rm = tryMove(ac, replyUci);
  if (rm) {
    x.r = rm.san;
    const against = me === 'w' ? -evalAfterW : evalAfterW;
    if (ac.isCheckmate() || against >= MATE - 50) {
      tags.push('mate_rey');
      const k0 = kingSq(new Chess(ply.after), me);
      if (k0) hsBy.mate_rey = k0;
    }
    if (rm.captured) {
      const v = VAL[rm.captured];
      // Si la pieza tiene defensor, el intercambio cuenta: solo es "colgada" si tras recapturar sigue perdiendo material.
      const net = v - recaptureGain(ac.fen(), rm.to) - mine;
      if (v >= 3 && net >= 2) {
        tags.push('pieza_colgada');
        x.k = rm.captured;
        hsBy.pieza_colgada = rm.to;
        if (rm.to === ply.to) x.mp = 1;
      } else if (v === 1 && net >= 1) {
        tags.push('peon_perdido');
        x.k = 'p';
        hsBy.peon_perdido = rm.to;
      }
    } else {
      const att = ac.get(rm.to as never);
      if (att) {
        let n = 0;
        for (const row of ac.board())
          for (const p of row) {
            if (!p || p.color !== me || p.type === 'p') continue;
            if (!ac.attackers(p.square, opp).includes(rm.to as never)) continue;
            const weak = p.type === 'k' || VAL[p.type] > VAL[att.type] || ac.attackers(p.square, me).length === 0;
            if (weak) n++;
          }
        if (n >= 2) {
          tags.push('horquilla');
          hsBy.horquilla = rm.to;
          x.fp = att.type;
        }
      }
    }
    const ks = kingSq(ac, me);
    if (ks && delta >= 20 && (/[+#]$/.test(rm.san) || sqDist(rm.to, ks) <= 2) && !tags.includes('mate_rey')) {
      tags.push('rey_expuesto');
      hsBy.rey_expuesto = ks;
    }
  }
  if (bestUci && bestUci !== ply.uci) {
    const bc = new Chess(ply.before);
    const bm = tryMove(bc, bestUci);
    if (bm) {
      x.bs = bm.san;
      const bv = bm.captured ? VAL[bm.captured] : 0;
      if (bc.isCheckmate()) {
        tags.push('tactica_perdida');
        x.ms = 'mate';
      } else if (bv > mine && delta >= 10) {
        tags.push('tactica_perdida');
        x.ms = 'cap';
      }
    }
  }
  if (wcBefore >= 70 && wcAfter <= 55) tags.push('ventaja_perdida');
  const order: Tag[] = ['mate_rey', 'pieza_colgada', 'horquilla', 'tactica_perdida', 'peon_perdido', 'rey_expuesto'];
  const primary = order.find((t) => tags.includes(t)) || 'posicional';
  if (hsBy[primary]) x.hs = hsBy[primary];
  return { tags, primary, x };
}

// ---------- análisis de una partida ----------
const emptyPhase = (): PhaseStats => ({ n: 0, i: 0, m: 0, x: 0, loss: 0 });
export const fen4 = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

/**
 * Pieza que ofreces con tu jugada: el rival puede capturar una pieza (valor 3 o más) y, contando recapturas,
 * gana al menos 2 puntos de material netos. Devuelve el tipo de pieza que se ofrece o null.
 */
export function sacrificeOf(ply: PlyLike, replyUci: string | undefined): PieceType | null {
  if (!replyUci) return null;
  const mine = ply.captured ? VAL[ply.captured] : 0;
  const ac = new Chess(ply.after);
  const rm = tryMove(ac, replyUci);
  if (!rm || !rm.captured) return null;
  const v = VAL[rm.captured];
  if (v < 3) return null;
  const net = v - recaptureGain(ac.fen(), rm.to) - mine;
  return net >= 2 ? rm.captured : null;
}

/** Versión del algoritmo de análisis. 2 = intercambios con recapturas y verificación más profunda de errores. */
export const ALGO_VERSION = 2;

export interface AnalyzeOpts {
  /** Reevalúa con más profundidad las jugadas marcadas como error o error grave. Por defecto sí. */
  verify?: boolean;
  /** Busca jugadas geniales con una segunda línea del motor. Por defecto sí. */
  great?: boolean;
}

export async function analyzeGame(game: ParsedGame, userName: string, engine: EngineLike, depth: number, onStep?: () => void, opts: AnalyzeOpts = {}): Promise<GameRec> {
  const h = game.headers;
  const me: Color = (h.White || '').toLowerCase() === userName.toLowerCase() ? 'w' : 'b';
  const sign = me === 'w' ? 1 : -1;
  const fens = [game.startFen, ...game.plies.map((p) => p.after)];
  const cache = new Map<string, Promise<{ cpW: number; pv: string[] }>>();
  const evalAt = (fen: string, d: number, count: boolean) => {
    const key = d + '|' + fen4(fen);
    const hit = cache.get(key);
    if (hit) return hit;
    const p = (async () => {
      const ch = new Chess(fen);
      if (ch.isCheckmate()) return { cpW: ch.turn() === 'w' ? -MATE : MATE, pv: [] as string[] };
      if (ch.isDraw() || ch.isStalemate()) return { cpW: 0, pv: [] as string[] };
      const r = await engine.analyse(fen, d);
      const s = ch.turn() === 'w' ? 1 : -1;
      const cp = r.mate != null ? (r.mate > 0 ? MATE : -MATE) : Math.max(-MATE, Math.min(MATE, r.cp));
      if (count) onStep?.();
      return { cpW: s * cp, pv: r.pv || [] };
    })();
    cache.set(key, p);
    return p;
  };
  const evals = await Promise.all(fens.map((f) => evalAt(f, depth, true)));

  // Verificación: una evaluación a profundidad fija puede exagerar. Los errores se reevalúan con más profundidad
  // (antes y después de la jugada) y se clasifican con esos valores, que son más fiables.
  const vd = Math.min(depth + 4, 20);
  if (opts.verify !== false && vd > depth) {
    const cands: number[] = [];
    game.plies.forEach((ply, i) => {
      if (ply.color !== me) return;
      const loss = winPct(sign * evals[i].cpW) - winPct(sign * evals[i + 1].cpW);
      if (evals[i].pv[0] !== ply.uci && loss >= 20) cands.push(i);
    });
    await Promise.all(
      cands.slice(0, 14).map(async (i) => {
        const [b, a] = await Promise.all([evalAt(fens[i], vd, false), evalAt(fens[i + 1], vd, false)]);
        evals[i] = b;
        evals[i + 1] = a;
      }),
    );
  }

  // Genial: la jugada es la mejor y la segunda mejor es mucho peor (era la única que mantenía la posición).
  const great = new Set<number>();
  if (opts.great !== false) {
    const cand: number[] = [];
    game.plies.forEach((ply, i) => {
      if (ply.color !== me || i < 6 || evals[i].pv[0] !== ply.uci || ply.san.endsWith('#')) return;
      const prev = game.plies[i - 1];
      if (ply.captured && prev && prev.to === ply.to) return; // recapturar no cuenta
      const wcB = winPct(sign * evals[i].cpW);
      if (wcB < 25 || wcB > 92) return;
      if (new Chess(fens[i]).moves().length < 2) return;
      cand.push(i);
    });
    await Promise.all(
      cand.slice(0, 12).map(async (i) => {
        try {
          const r = await engine.analyse(fens[i], depth, 2);
          const l = r.lines;
          if (!l || l.length < 2) return;
          const sc = (x: { cp: number; mate: number | null }) => (x.mate != null ? (x.mate > 0 ? MATE : -MATE) : x.cp);
          if (winPct(sc(l[0])) - winPct(sc(l[1])) >= 15) great.add(i);
        } catch { /* sin motor: no hay genial */ }
      }),
    );
  }

  const { base, inc } = parseTimeControl(h.TimeControl);
  const moves: MoveRec[] = [];
  const counts: Record<Cls, number> = { k: 0, h: 0, b: 0, g: 0, i: 0, m: 0, x: 0 };
  const byPhase: Record<Phase, PhaseStats> = { apertura: emptyPhase(), medio: emptyPhase(), final: emptyPhase() };
  let accSum = 0;
  let accN = 0;
  let firstDecisive: number | null = null;
  game.plies.forEach((ply, i) => {
    const rec: MoveRec = { s: ply.san, e: Math.round(evals[i + 1].cpW) };
    const clk = game.clocks[i];
    if (clk != null) {
      rec.cl = Math.round(clk * 10) / 10;
      const prev = i >= 2 ? game.clocks[i - 2] : base || null;
      if (prev != null) rec.sp = Math.max(0, Math.round((prev - clk + inc) * 10) / 10);
    }
    if (ply.color === me) {
      const bestUci = evals[i].pv[0] || null;
      const wcB = winPct(sign * evals[i].cpW);
      const wcA = winPct(sign * evals[i + 1].cpW);
      const isBest = bestUci === ply.uci;
      const delta = isBest ? 0 : Math.max(0, wcB - wcA);
      let c = classify(delta, isBest);
      // Brillante: sacrificas material y aun así la posición sigue siendo muy buena (el motor lo confirma).
      const sac = delta <= 3 ? sacrificeOf(ply, evals[i + 1].pv[0]) : null;
      if (sac && wcA >= 45 && wcB <= 85 && wcA >= wcB - 6) {
        c = 'k';
        rec.sac = sac;
      } else if (c === 'b' && great.has(i)) c = 'h'; // Genial: la única jugada buena
      rec.c = c;
      rec.d = Math.round(delta * 10) / 10;
      counts[c]++;
      accSum += moveAccuracy(delta);
      accN++;
      const ph = phaseOf(ply.before, i);
      rec.ph = ph === 'apertura' ? 'a' : ph === 'medio' ? 'm' : 'f';
      const bp = byPhase[ph];
      bp.n++;
      bp.loss += delta;
      if (c === 'i' || c === 'm' || c === 'x') bp[c]++;
      if (!isBest && bestUci) rec.b = bestUci;
      if (isErr(c)) {
        const mo = motifs(ply, bestUci, evals[i + 1].pv[0], delta, wcB, wcA, evals[i + 1].cpW, me);
        rec.t = mo.tags;
        rec.p = mo.primary;
        rec.f = fen4(ply.before);
        Object.assign(rec, mo.x);
        if (isBigErr(c) && firstDecisive == null && wcB > 25) firstDecisive = i;
      }
    }
    moves.push(rec);
  });
  const res = h.Result;
  const result = res === '1/2-1/2' ? 'D' : (res === '1-0') === (me === 'w') ? 'W' : 'L';
  return {
    id: game.id,
    ts: game.ts,
    date: h.Date || '',
    tc: h.TimeControl || '',
    color: me,
    opp: (me === 'w' ? h.Black : h.White) || '?',
    oppElo: +(me === 'w' ? h.BlackElo : h.WhiteElo) || 0,
    elo: +(me === 'w' ? h.WhiteElo : h.BlackElo) || 0,
    result,
    term: h.Termination || '',
    opening: openingName(game.plies, me),
    n: game.plies.length,
    depth,
    acc: accN ? Math.round((accSum / accN) * 10) / 10 : 0,
    counts,
    byPhase,
    first: firstDecisive,
    moves,
    src: game.source,
    url: game.url,
    user: userName.toLowerCase(),
    v: ALGO_VERSION,
    gr: 1,
  };
}

/**
 * Recalcula etiquetas y explicaciones de los errores de una partida ya analizada, sin motor:
 * usa las evaluaciones, la mejor jugada y la respuesta del rival que se guardaron.
 */
export function retagGame(rec: GameRec): GameRec {
  const sign = rec.color === 'w' ? 1 : -1;
  const ch = new Chess();
  const moves = rec.moves.map((m, i) => {
    const before = ch.fen();
    let mv: Move;
    try { mv = ch.move(m.s); } catch { return m; }
    if (!isErr(m.c)) return m;
    const after = ch.fen();
    const prevE = i > 0 ? rec.moves[i - 1].e : 20;
    const wcB = winPct(sign * prevE);
    const wcA = winPct(sign * m.e);
    let replyUci: string | undefined;
    if (m.r) {
      try { const rr = new Chess(after).move(m.r); replyUci = rr.from + rr.to + (rr.promotion || ''); } catch { /* sin respuesta */ }
    }
    const ply = { uci: mv.from + mv.to + (mv.promotion || ''), captured: mv.captured || null, to: mv.to, before, after };
    const mo = motifs(ply, m.b || null, replyUci, m.d || 0, wcB, wcA, m.e, rec.color);
    const next: MoveRec = { ...m, t: mo.tags, p: mo.primary };
    for (const k of ['r', 'k', 'mp', 'bs', 'ms', 'hs', 'fp'] as const) delete next[k];
    Object.assign(next, mo.x);
    return next;
  });
  return { ...rec, moves, v: ALGO_VERSION };
}

// ---------- agregados ----------
export const TAG_ES: Record<Tag, string> = {
  pieza_colgada: 'Pieza colgada o regalada',
  horquilla: 'Horquilla o doble ataque',
  mate_rey: 'Mate o ataque directo al rey',
  tactica_perdida: 'Captura o mate que no viste',
  peon_perdido: 'Peón regalado',
  rey_expuesto: 'Rey expuesto',
  posicional: 'Posicional o de plan',
  ventaja_perdida: 'Ventaja desperdiciada',
};

export interface WorstMove { gid: string; i: number; d: number; s: string; bs?: string; p: Tag; opp: string; result: string; color: Color }
export interface OpeningStat { name: string; color: Color; n: number; W: number; D: number; L: number; acc: number; err: number }
export interface Aggregate {
  n: number; W: number; D: number; L: number;
  byColor: Record<Color, { W: number; D: number; L: number }>;
  acc: number;
  counts: Record<Cls, number>;
  userMoves: number;
  phases: Record<Phase, PhaseStats>;
  tags: Partial<Record<Tag, { n: number; loss: number; blunders: number }>>;
  extra: { ventaja_perdida: number };
  openings: Record<string, OpeningStat>;
  trend: { id: string; acc: number; result: string; err: number; date: string }[];
  lostFirst: { gid: string; i: number; opp: string }[];
  worst: WorstMove[];
  elo: number;
}

export function aggregate(recs: GameRec[]): Aggregate {
  const A: Aggregate = {
    n: recs.length, W: 0, D: 0, L: 0, byColor: { w: { W: 0, D: 0, L: 0 }, b: { W: 0, D: 0, L: 0 } }, acc: 0,
    counts: { k: 0, h: 0, b: 0, g: 0, i: 0, m: 0, x: 0 }, userMoves: 0,
    phases: { apertura: emptyPhase(), medio: emptyPhase(), final: emptyPhase() },
    tags: {}, extra: { ventaja_perdida: 0 }, openings: {}, trend: [], lostFirst: [], worst: [], elo: 0,
  };
  for (const g of recs) {
    A[g.result]++;
    A.byColor[g.color][g.result]++;
    A.acc += g.acc;
    for (const k of Object.keys(g.counts) as Cls[]) {
      A.counts[k] += g.counts[k];
      A.userMoves += g.counts[k];
    }
    for (const ph of Object.keys(g.byPhase) as Phase[]) for (const k of Object.keys(g.byPhase[ph]) as (keyof PhaseStats)[]) A.phases[ph][k] += g.byPhase[ph][k];
    const ok = g.color + '|' + g.opening;
    const o = (A.openings[ok] ||= { name: g.opening, color: g.color, n: 0, W: 0, D: 0, L: 0, acc: 0, err: 0 });
    o.n++;
    o[g.result]++;
    o.acc += g.acc;
    o.err += g.counts.m + g.counts.x;
    A.trend.push({ id: g.id, acc: g.acc, result: g.result, err: g.counts.m + g.counts.x, date: g.date });
    g.moves.forEach((m, i) => {
      if (isBigErr(m.c) && m.p) {
        const t = (A.tags[m.p] ||= { n: 0, loss: 0, blunders: 0 });
        t.n++;
        t.loss += m.d || 0;
        if (m.c === 'x') t.blunders++;
        if (m.t?.includes('ventaja_perdida')) A.extra.ventaja_perdida++;
        A.worst.push({ gid: g.id, i, d: m.d || 0, s: m.s, bs: m.bs, p: m.p, opp: g.opp, result: g.result, color: g.color });
      }
    });
    if (g.result === 'L' && g.first != null) A.lostFirst.push({ gid: g.id, i: g.first, opp: g.opp });
  }
  A.acc = A.n ? Math.round((A.acc / A.n) * 10) / 10 : 0;
  A.elo = recs.length ? recs[recs.length - 1].elo : 0;
  A.worst.sort((a, b) => b.d - a.d);
  return A;
}
