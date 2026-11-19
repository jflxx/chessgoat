import { describe, expect, it } from 'vitest';
import { detectUser, parseAll, parseClk, parseGame, parseTimeControl, parseTs, splitPgn, timeClassOf } from '../src/core/pgn';
import { PGN_960, PGN_FILE, PGN_ONE, PGN_TWO } from './fixtures';

describe('splitPgn', () => {
  it('separa varias partidas y descarta basura', () => {
    expect(splitPgn(PGN_FILE)).toHaveLength(2);
    expect(splitPgn('hola')).toHaveLength(0);
    expect(splitPgn('')).toHaveLength(0);
  });
  it('acepta saltos de línea de Windows', () => {
    expect(splitPgn(PGN_FILE.replace(/\n/g, '\r\n'))).toHaveLength(2);
  });
});

describe('parseGame', () => {
  it('lee cabeceras, jugadas y casillas', () => {
    const g = parseGame(PGN_ONE)!;
    expect(g.headers.White).toBe('alfredo');
    expect(g.plies).toHaveLength(7);
    expect(g.plies[0]).toMatchObject({ san: 'e4', uci: 'e2e4', color: 'w', piece: 'p', from: 'e2', to: 'e4' });
    expect(g.plies[6]).toMatchObject({ san: 'Qxf7#', captured: 'p' });
    expect(g.startFen.startsWith('rnbqkbnr/pppppppp')).toBe(true);
  });
  it('extrae el reloj de cada jugada', () => {
    const g = parseGame(PGN_ONE)!;
    expect(g.clocks[0]).toBeCloseTo(598.5);
    expect(g.clocks[6]).toBe(550);
    expect(parseGame(PGN_TWO)!.clocks.every((c) => c === null)).toBe(true);
  });
  it('usa el enlace de la partida como identificador estable', () => {
    expect(parseGame(PGN_ONE)!.id).toBe('c111111');
    expect(parseGame(PGN_ONE)!.url).toBe('https://www.chess.com/game/live/111111');
    expect(parseGame(PGN_ONE)!.id).toBe(parseGame(PGN_ONE)!.id);
  });
  it('sin enlace genera un hash estable', () => {
    const p = PGN_ONE.replace(/\[Link .*\]\n/, '');
    expect(parseGame(p)!.id).toBe(parseGame(p)!.id);
    expect(parseGame(p)!.id).not.toMatch(/^c\d/);
  });
  it('rechaza variantes y PGN ilegales', () => {
    expect(parseGame(PGN_960)).toBeNull();
    expect(parseGame('[Event "x"]\n\n1. e5 e4 *')).toBeNull();
  });
});

describe('parseAll', () => {
  it('ordena cronológicamente un archivo descendente', () => {
    const games = parseAll(PGN_FILE);
    expect(games.map((g) => g.id)).toEqual(['c111111', 'c222222']);
    expect(games[0].ts).toBeLessThan(games[1].ts);
  });
  it('detecta el usuario más frecuente', () => {
    expect(detectUser(parseAll(PGN_FILE))).toBe('alfredo');
  });
});

describe('utilidades', () => {
  it('parseTs combina fecha y hora', () => {
    expect(parseTs({ Date: '2026.11.17', EndTime: '10:00:30 PST' })).toBe(Date.UTC(2026, 10, 17) + 36030000);
    expect(parseTs({})).toBe(0);
  });
  it('parseTimeControl y timeClassOf', () => {
    expect(parseTimeControl('180+2')).toEqual({ base: 180, inc: 2 });
    expect(parseTimeControl('600')).toEqual({ base: 600, inc: 0 });
    expect(parseTimeControl('1/86400')).toEqual({ base: 0, inc: 0 });
    expect(timeClassOf('60')).toBe('bullet');
    expect(timeClassOf('180+2')).toBe('blitz');
    expect(timeClassOf('600')).toBe('rapid');
    expect(timeClassOf('1/86400')).toBe('daily');
  });
  it('parseClk', () => {
    expect(parseClk('[%clk 1:02:03.4]')).toBeCloseTo(3723.4);
    expect(parseClk('sin reloj')).toBeNull();
  });
});
