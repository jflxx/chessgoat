// Lectura de PGN: separa partidas, las interpreta con chess.js y extrae reloj, fecha e identificador.
import { Chess } from 'chess.js';
import type { ParsedGame, Source } from '../types';

export function splitPgn(text: string): string[] {
  const t = String(text || '').replace(/\r/g, '');
  return t
    .split(/\n(?=\[Event\s)/)
    .map((s) => s.trim())
    .filter((s) => /\[Event\s/.test(s) || /^\s*1\./.test(s));
}

export function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Marca de tiempo (ms UTC) a partir de las cabeceras Date y EndTime/StartTime. */
export function parseTs(h: Record<string, string>): number {
  const dm = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(h.UTCDate || h.Date || '');
  if (!dm) return 0;
  let secs = 0;
  const tm = /^(\d+):(\d+):(\d+)/.exec(h.EndTime || h.UTCTime || h.StartTime || '');
  if (tm) secs = +tm[1] * 3600 + +tm[2] * 60 + +tm[3];
  return Date.UTC(+dm[1], +dm[2] - 1, +dm[3]) + secs * 1000;
}

/** "600+5" -> { base: 600, inc: 5 }. "1/86400" (por correspondencia) -> base 0. */
export function parseTimeControl(tc: string | undefined): { base: number; inc: number } {
  const m = /^(\d+)(?:\+(\d+))?$/.exec((tc || '').trim());
  if (!m) return { base: 0, inc: 0 };
  return { base: +m[1], inc: m[2] ? +m[2] : 0 };
}

/** Categoría de ritmo según la duración estimada (base + 40 * incremento), como hace Lichess. */
export function timeClassOf(tc: string | undefined): string {
  const { base, inc } = parseTimeControl(tc);
  if (!base) return 'daily';
  const t = base + 40 * inc;
  if (t < 180) return 'bullet';
  if (t < 480) return 'blitz';
  if (t < 1500) return 'rapid';
  return 'classical';
}

const CLK = /\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/;
export function parseClk(comment: string): number | null {
  const m = CLK.exec(comment);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
}

function gameId(h: Record<string, string>, plyCount: number): string {
  const link = h.Link || h.Site || '';
  const m = /(?:chess\.com\/(?:game\/)?(?:live|daily)\/(\d+)|lichess\.org\/(\w{8,12}))/.exec(link);
  if (m) return (m[1] ? 'c' + m[1] : 'l' + m[2]).slice(0, 14);
  return hashStr([h.White, h.Black, h.Date, h.EndTime || h.UTCTime, plyCount].join('|'));
}

export function parseGame(pgn: string, source: Source = 'pgn'): ParsedGame | null {
  const c = new Chess();
  try {
    c.loadPgn(pgn);
  } catch {
    return null;
  }
  const h = c.getHeaders() as Record<string, string>;
  if (h.Variant && !/^(standard|chess)$/i.test(h.Variant)) return null;
  const hist = c.history({ verbose: true });
  if (!hist.length) return null;
  const plies = hist.map((m) => ({
    san: m.san,
    uci: m.from + m.to + (m.promotion || ''),
    color: m.color,
    piece: m.piece,
    captured: m.captured || null,
    from: m.from,
    to: m.to,
    before: m.before,
    after: m.after,
  }));
  const byFen = new Map<string, string>();
  for (const cm of c.getComments()) byFen.set(cm.fen, cm.comment);
  const clocks = plies.map((p) => {
    const cm = byFen.get(p.after);
    return cm ? parseClk(cm) : null;
  });
  const url = /^https?:\/\//.test(h.Link || '') ? h.Link : /^https?:\/\/lichess\.org\//.test(h.Site || '') ? h.Site : undefined;
  return { id: gameId(h, plies.length), headers: h, plies, startFen: plies[0].before, ts: parseTs(h), clocks, source, url };
}

/** Parsea todo el texto y deja las partidas en orden cronológico (corrige archivos descendentes y el cambio de día de Chess.com). */
export function parseAll(text: string, source: Source = 'pgn'): ParsedGame[] {
  const games = splitPgn(text)
    .map((p) => parseGame(p, source))
    .filter((g): g is ParsedGame => !!g);
  if (games.length > 1 && (games[0].headers.Date || '') > (games[games.length - 1].headers.Date || '')) games.reverse();
  const DAY = 86400000;
  for (let i = 1; i < games.length; i++) {
    let n = 0;
    while (games[i].ts < games[i - 1].ts - 3 * 3600000 && n++ < 3) games[i].ts += DAY;
  }
  return games;
}

export function detectUser(games: ParsedGame[]): string {
  const cnt: Record<string, number> = {};
  for (const g of games)
    for (const k of ['White', 'Black']) {
      const n = g.headers[k];
      if (n) cnt[n] = (cnt[n] || 0) + 1;
    }
  return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

export function playedBy(g: ParsedGame, user: string): boolean {
  const u = user.toLowerCase();
  return [g.headers.White, g.headers.Black].some((n) => (n || '').toLowerCase() === u);
}
