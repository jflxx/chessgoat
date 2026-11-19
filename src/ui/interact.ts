// Interacción común con el tablero: seleccionar, mover (clic, teclado o arrastre) y coronar.
import { Chess } from 'chess.js';
import { S, render } from './state';

export interface BoardCtl {
  fen(): string | null;
  canMove(): boolean;
  onMove(from: string, to: string, promotion?: string): void;
}

let ctl: BoardCtl | null = null;
/** La vista activa registra su controlador al pintarse. */
export const setCtl = (c: BoardCtl | null) => { ctl = c; };

export function handleSquare(sq: string) {
  const c = ctl;
  if (!c || !c.canMove()) return;
  const fen = c.fen();
  if (!fen) return;
  const ch = new Chess(fen);
  S.focusSq = sq;
  if (S.sel && S.sel !== sq) {
    const legal = ch.moves({ square: S.sel as never, verbose: true }).filter((m) => m.to === sq);
    if (legal.length) {
      if (legal.some((m) => m.promotion)) { S.promo = { from: S.sel, to: sq }; render(); return; }
      const from = S.sel;
      S.sel = null;
      c.onMove(from, sq);
      return;
    }
  }
  const p = ch.get(sq as never);
  S.sel = p && p.color === ch.turn() && S.sel !== sq ? sq : null;
  render();
}

export function choosePromo(piece: string) {
  const pr = S.promo;
  S.promo = null;
  S.sel = null;
  if (!piece || !pr || !ctl) { render(); return; }
  ctl.onMove(pr.from, pr.to, piece);
}

/** Selección y destinos posibles para pintar el tablero. */
export function selectionProps(fen: string) {
  if (!S.sel) return { sel: null, targets: [] as string[], captures: [] as string[] };
  const moves = new Chess(fen).moves({ square: S.sel as never, verbose: true });
  return { sel: S.sel, targets: moves.filter((m) => !m.captured).map((m) => m.to), captures: moves.filter((m) => m.captured).map((m) => m.to) };
}

/** Jugada escrita en notación (SAN, en inglés o con letras españolas C, A, T, D, R). */
export function parseTyped(fen: string, text: string): { from: string; to: string; promotion?: string } | null {
  const ES: Record<string, string> = { C: 'N', A: 'B', T: 'R', D: 'Q', R: 'K' };
  const t = text.trim();
  if (!t) return null;
  const tries = [t, t.replace(/^[CATDR]/, (x) => ES[x]), t.replace(/=([CATD])/, (_, x) => '=' + ES[x])];
  for (const s of tries) {
    try {
      const m = new Chess(fen).move(s);
      return { from: m.from, to: m.to, promotion: m.promotion };
    } catch { /* siguiente */ }
  }
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(t)) {
    try {
      const m = new Chess(fen).move({ from: t.slice(0, 2), to: t.slice(2, 4), promotion: t[4] });
      return { from: m.from, to: m.to, promotion: m.promotion };
    } catch { /* ilegal */ }
  }
  return null;
}
