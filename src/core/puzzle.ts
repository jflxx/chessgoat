// Máquina de estados de un ejercicio en el tablero (tus errores o puzzles de Lichess):
// la jugada se hace de verdad, el rival responde, se puede reintentar, pedir pistas o ver la solución.
import { Chess } from 'chess.js';

export interface PuzzleSpec {
  id: string;
  /** Posición inicial; juega el bando al que le toca. */
  fen: string;
  /** Jugadas UCI alternas: tuya, rival, tuya… */
  solution: string[];
  lastMove?: string;
  /** Posición justo antes de `lastMove` (la jugada del rival que lleva a `fen`), para mostrarla al empezar. */
  prevFen?: string;
  rating?: number;
  themes?: string[];
  source: 'mine' | 'lichess';
}

export type PStatus = 'play' | 'wrong' | 'solved' | 'revealed';
export interface Sq2 { from: string; to: string }

export interface PState {
  spec: PuzzleSpec;
  fen: string;
  step: number;
  status: PStatus;
  attempts: number;
  /** Pistas usadas en total. */
  hints: number;
  /** Pistas usadas en la jugada actual (0, 1 o 2) y a qué jugada corresponden. */
  stepHints: number;
  hintStep: number;
  last: Sq2 | null;
  /** Posición y última jugada para "Reintentar" tras un fallo. */
  retry?: { fen: string; last: Sq2 | null };
  /** Jugadas hechas (SAN) para mostrar. */
  played: string[];
}

export const uciOf = (u: string): Sq2 & { promotion?: string } => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

export function applyUci(fen: string, uci: string) {
  const c = new Chess(fen);
  try {
    const m = c.move(uciOf(uci));
    return { fen: c.fen(), san: m.san, from: m.from, to: m.to, captured: !!m.captured, check: c.isCheck(), mate: c.isCheckmate() };
  } catch {
    return null;
  }
}

export function newPuzzle(spec: PuzzleSpec): PState {
  return { spec, fen: spec.fen, step: 0, status: 'play', attempts: 0, hints: 0, stepHints: 0, hintStep: -1, last: spec.lastMove ? uciOf(spec.lastMove) : null, played: [] };
}

export const expected = (st: PState) => st.spec.solution[st.step];
export const turnOf = (fen: string) => (fen.split(' ')[1] === 'b' ? 'b' : 'w');

/** ¿Es la jugada esperada? También vale cualquier jugada que dé mate. */
export function isSolutionMove(st: PState, uci: string): boolean {
  const exp = expected(st);
  if (!exp) return false;
  if (uci === exp || (uci.slice(0, 4) === exp.slice(0, 4) && exp.length === 4)) return true;
  return !!applyUci(st.fen, uci)?.mate;
}

export type MoveOutcome = { kind: 'illegal' } | { kind: 'correct'; san: string; captured: boolean; check: boolean; done: boolean } | { kind: 'wrong'; san: string; captured: boolean; check: boolean };

/** Hace la jugada del usuario y devuelve el resultado. Si es incorrecta queda en el tablero (estado "wrong"). */
export function playUser(st: PState, uci: string): MoveOutcome {
  if (st.status !== 'play') return { kind: 'illegal' };
  const r = applyUci(st.fen, uci);
  if (!r) return { kind: 'illegal' };
  if (isSolutionMove(st, uci)) {
    st.fen = r.fen;
    st.last = { from: r.from, to: r.to };
    st.played.push(r.san);
    st.step++;
    const done = r.mate || st.step >= st.spec.solution.length;
    if (done) st.status = 'solved';
    return { kind: 'correct', san: r.san, captured: r.captured, check: r.check, done };
  }
  st.retry = { fen: st.fen, last: st.last };
  st.fen = r.fen;
  st.last = { from: r.from, to: r.to };
  st.status = 'wrong';
  st.attempts++;
  return { kind: 'wrong', san: r.san, captured: r.captured, check: r.check };
}

/** Acepta una jugada alternativa que el motor considera igual de buena: el ejercicio queda resuelto. */
export function acceptAlternative(st: PState) {
  st.status = 'solved';
  st.retry = undefined;
}

/** Respuesta del rival dentro de la solución. Devuelve la jugada aplicada o null. */
export function playReply(st: PState) {
  const u = expected(st);
  if (!u || st.status !== 'play') return null;
  const r = applyUci(st.fen, u);
  if (!r) return null;
  st.fen = r.fen;
  st.last = { from: r.from, to: r.to };
  st.played.push(r.san);
  st.step++;
  if (st.step >= st.spec.solution.length) st.status = 'solved';
  return r;
}

/** Tras un fallo, muestra la refutación (respuesta del rival a la jugada mala). */
export function playRefutation(st: PState, uci: string) {
  if (st.status !== 'wrong') return null;
  const r = applyUci(st.fen, uci);
  if (!r) return null;
  st.fen = r.fen;
  st.last = { from: r.from, to: r.to };
  return r;
}

export function retry(st: PState) {
  if (st.status !== 'wrong' || !st.retry) return;
  st.fen = st.retry.fen;
  st.last = st.retry.last;
  st.retry = undefined;
  st.status = 'play';
}

/** Pista 1: la pieza que hay que mover. Pista 2: la jugada completa (flecha). */
export function hint(st: PState): { from: string; to?: string } | null {
  const u = expected(st);
  if (!u || st.status !== 'play') return null;
  if (st.hintStep !== st.step) {
    st.hintStep = st.step;
    st.stepHints = 0;
  }
  st.stepHints = Math.min(2, st.stepHints + 1);
  st.hints++;
  return st.stepHints === 1 ? { from: u.slice(0, 2) } : { from: u.slice(0, 2), to: u.slice(2, 4) };
}

/** Muestra la solución: vuelve a la posición correcta y marca el ejercicio como visto. */
export function reveal(st: PState) {
  if (st.status === 'wrong') retry(st);
  st.status = 'revealed';
}

/** Siguiente jugada de la solución al reproducirla tras "Ver solución". */
export function revealStep(st: PState) {
  const u = expected(st);
  if (!u) return null;
  const r = applyUci(st.fen, u);
  if (!r) return null;
  st.fen = r.fen;
  st.last = { from: r.from, to: r.to };
  st.played.push(r.san);
  st.step++;
  return r;
}

export const cleanSolve = (st: PState) => st.status === 'solved' && st.attempts === 0 && st.hints === 0;
export const finished = (st: PState) => st.status === 'solved' || st.status === 'revealed';

/** Convierte una lista UCI en SAN desde una posición. */
export function uciLineToSan(fen: string, ucis: string[], max = 8): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of ucis.slice(0, max)) {
    try { out.push(c.move(uciOf(u)).san); } catch { break; }
  }
  return out;
}

/** Puntuación de puzzles tipo Elo (K=24). */
export function updateRating(rating: number, puzzleRating: number, score: 0 | 1, k = 24): number {
  const exp = 1 / (1 + Math.pow(10, (puzzleRating - rating) / 400));
  return Math.round(rating + k * (score - exp));
}
