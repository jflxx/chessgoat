import type { Cls, GameRec, MoveRec, Tag } from '../src/types';

export const PGN_ONE = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.11.17"]
[White "alfredo"]
[Black "rival1"]
[Result "1-0"]
[WhiteElo "1000"]
[BlackElo "980"]
[TimeControl "600"]
[EndTime "10:00:30 PST"]
[Termination "alfredo ganó por jaque mate"]
[Link "https://www.chess.com/game/live/111111"]

1. e4 {[%clk 0:09:58.5]} 1... e5 {[%clk 0:09:57.1]} 2. Bc4 {[%clk 0:09:50]} 2... Nc6 {[%clk 0:09:40.2]} 3. Qh5 {[%clk 0:09:30]} 3... Nf6 {[%clk 0:09:20]} 4. Qxf7# {[%clk 0:09:10]} 1-0
`;

export const PGN_TWO = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.11.18"]
[White "rival2"]
[Black "alfredo"]
[Result "0-1"]
[WhiteElo "1100"]
[BlackElo "1010"]
[TimeControl "180+2"]
[EndTime "09:00:00 PST"]
[Link "https://www.chess.com/game/live/222222"]

1. f3 e5 2. g4 Qh4# 0-1
`;

export const PGN_960 = `[Event "Live Chess"]
[Variant "Chess960"]
[Date "2026.11.18"]
[White "a"]
[Black "b"]
[Result "1-0"]

1. e4 e5 1-0
`;

export const PGN_FILE = PGN_TWO + '\n\n' + PGN_ONE; // orden descendente a propósito

/** Crea una partida sintética ya analizada, con las jugadas indicadas. */
export function mkGame(id: string, opts: Partial<GameRec> & { moves?: MoveRec[] } = {}): GameRec {
  const moves = opts.moves ?? [];
  const counts: Record<Cls, number> = { k: 0, h: 0, b: 0, g: 0, i: 0, m: 0, x: 0 };
  moves.forEach((m) => { if (m.c) counts[m.c]++; });
  const n = Math.max(moves.length, 30);
  return {
    id, ts: Date.parse('2026-01-01') + (parseInt(id.replace(/\D/g, '') || '0', 10) || 0) * 3600000, date: '2026.01.01', tc: '600', color: 'w', opp: 'rival', oppElo: 1000, elo: 1000,
    result: 'L', term: '', opening: 'Con blancas: Italiana', n, depth: 12, acc: 70,
    counts, byPhase: { apertura: { n: 10, i: 0, m: 0, x: 0, loss: 0 }, medio: { n: 10, i: 0, m: 0, x: 0, loss: 0 }, final: { n: 10, i: 0, m: 0, x: 0, loss: 0 } },
    first: null, src: 'pgn', user: 'alfredo', ...opts, moves,
  };
}

export const blunder = (tag: Tag, extra: Partial<MoveRec> = {}): MoveRec => ({ s: 'Nf3', e: -300, c: 'x', d: 35, p: tag, t: [tag], ...extra });
