// Intercambio estático: ¿cuánto material gana de verdad quien captura en una casilla, contando las recapturas?
import { Chess } from 'chess.js';
import type { PieceType } from '../types';

const VAL: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

/**
 * Mejor ganancia de material (>= 0, quien mueve puede abstenerse) que logra el bando que mueve
 * capturando en `sq`, usando siempre la pieza de menor valor y respetando clavadas y jaques (jugadas legales).
 */
export function recaptureGain(fen: string, sq: string, depth = 6): number {
  if (depth <= 0) return 0;
  const c = new Chess(fen);
  const caps = c.moves({ verbose: true }).filter((m) => m.to === sq && m.captured);
  if (!caps.length) return 0;
  caps.sort((a, b) => VAL[a.piece] - VAL[b.piece]);
  const m = caps[0];
  c.move(m);
  const gain = VAL[m.captured!] - recaptureGain(c.fen(), sq, depth - 1);
  return Math.max(0, gain);
}
