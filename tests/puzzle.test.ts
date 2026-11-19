import { describe, expect, it } from 'vitest';
import { cleanSolve, hint, newPuzzle, playRefutation, playReply, playUser, retry, reveal, revealStep, uciLineToSan, updateRating, acceptAlternative, type PuzzleSpec } from '../src/core/puzzle';
import { PuzzleError, fetchLichessPuzzle, parseLichessPuzzle } from '../src/importers/puzzles';

// Mate del pasillo: 1.Re8+ Rxe8 2.Rxe8#
const BACKRANK: PuzzleSpec = { id: 'p1', fen: '3r2k1/5ppp/8/8/8/8/4RPPP/4R1K1 w - - 0 1', solution: ['e2e8', 'd8e8', 'e1e8'], source: 'lichess', rating: 1200 };

describe('ejercicio en el tablero', () => {
  it('la jugada correcta se hace y el rival responde', () => {
    const st = newPuzzle(BACKRANK);
    const r = playUser(st, 'e2e8');
    expect(r).toMatchObject({ kind: 'correct', san: 'Re8+', done: false });
    expect(st.fen.startsWith('3r2k1')).toBe(false);
    expect(st.last).toEqual({ from: 'e2', to: 'e8' });
    expect(playReply(st)?.san).toBe('Rxe8');
    expect(playUser(st, 'e1e8')).toMatchObject({ kind: 'correct', done: true });
    expect(st.status).toBe('solved');
    expect(cleanSolve(st)).toBe(true);
    expect(st.played).toEqual(['Re8+', 'Rxe8', 'Rxe8#']);
  });

  it('una jugada incorrecta queda en el tablero, se refuta y se puede reintentar', () => {
    const st = newPuzzle(BACKRANK);
    const before = st.fen;
    const r = playUser(st, 'h2h3');
    expect(r.kind).toBe('wrong');
    expect(st.status).toBe('wrong');
    expect(st.fen).not.toBe(before);
    expect(playRefutation(st, 'd8d1')?.san).toBe('Rd1');
    retry(st);
    expect(st.fen).toBe(before);
    expect(st.status).toBe('play');
    playUser(st, 'e2e8');
    playReply(st);
    playUser(st, 'e1e8');
    expect(st.status).toBe('solved');
    expect(cleanSolve(st)).toBe(false); // hubo un fallo
    expect(st.attempts).toBe(1);
  });

  it('cualquier mate cuenta como solución y las ilegales se ignoran', () => {
    const st = newPuzzle({ id: 'm', fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', solution: ['a1a8'], source: 'lichess' });
    expect(playUser(st, 'a1a9').kind).toBe('illegal');
    expect(playUser(st, 'a1b1').kind).toBe('wrong');
    retry(st);
    expect(playUser(st, 'a1a8')).toMatchObject({ kind: 'correct', done: true });
  });

  it('pistas: primero la pieza, luego la jugada', () => {
    const st = newPuzzle(BACKRANK);
    expect(hint(st)).toEqual({ from: 'e2' });
    expect(hint(st)).toEqual({ from: 'e2', to: 'e8' });
    playUser(st, 'e2e8');
    playReply(st);
    playUser(st, 'e1e8');
    expect(cleanSolve(st)).toBe(false);
  });

  it('las pistas se cuentan por jugada, no por puzzle', () => {
    const st = newPuzzle(BACKRANK);
    expect(hint(st)).toEqual({ from: 'e2' });
    playUser(st, 'e2e8');
    playReply(st);
    // jugada nueva: la primera pista vuelve a ser solo la pieza
    expect(hint(st)).toEqual({ from: 'e1' });
    expect(st.stepHints).toBe(1);
    expect(st.hints).toBe(2);
  });

  it('reintentar después de una jugada buena conserva el avance', () => {
    const st = newPuzzle(BACKRANK);
    playUser(st, 'e2e8');
    playReply(st);
    const fenAfterReply = st.fen;
    expect(playUser(st, 'g1f1').kind).toBe('wrong');
    playRefutation(st, 'e8e1');
    retry(st);
    expect(st.fen).toBe(fenAfterReply);
    expect(st.step).toBe(2);
    expect(st.status).toBe('play');
    expect(st.played).toEqual(['Re8+', 'Rxe8']);
    expect(playUser(st, 'e1e8')).toMatchObject({ kind: 'correct', done: true });
  });

  it('ver la solución la reproduce jugada a jugada', () => {
    const st = newPuzzle(BACKRANK);
    playUser(st, 'h2h3');
    reveal(st);
    expect(st.status).toBe('revealed');
    expect(revealStep(st)?.san).toBe('Re8+');
    expect(revealStep(st)?.san).toBe('Rxe8');
    expect(revealStep(st)?.san).toBe('Rxe8#');
    expect(revealStep(st)).toBeNull();
  });

  it('alternativa aceptada por el motor', () => {
    const st = newPuzzle({ ...BACKRANK, solution: ['e2e8'], source: 'mine' });
    expect(playUser(st, 'g1f1').kind).toBe('wrong');
    acceptAlternative(st);
    expect(st.status).toBe('solved');
  });

  it('utilidades', () => {
    expect(uciLineToSan(BACKRANK.fen, ['e2e8', 'd8e8', 'e1e8'])).toEqual(['Re8+', 'Rxe8', 'Rxe8#']);
    expect(updateRating(1500, 1500, 1)).toBe(1512);
    expect(updateRating(1500, 1500, 0)).toBe(1488);
    expect(updateRating(1500, 2000, 1)).toBeGreaterThan(1520);
  });
});

describe('puzzles de Lichess', () => {
  const sample = { game: {}, puzzle: { id: 'abc', fen: BACKRANK.fen, solution: BACKRANK.solution, lastMove: 'g8h8', rating: 1400, themes: ['mateIn2'] } };
  it('interpreta y valida el puzzle', () => {
    expect(parseLichessPuzzle(sample)).toMatchObject({ id: 'li:abc', rating: 1400, source: 'lichess' });
    expect(() => parseLichessPuzzle({ puzzle: { ...sample.puzzle, solution: ['a1a1'] } })).toThrow(PuzzleError);
    expect(() => parseLichessPuzzle({})).toThrow(PuzzleError);
  });
  it('pide el tema y la dificultad', async () => {
    let url = '';
    const p = await fetchLichessPuzzle('fork', 'harder', async (u) => { url = u; return new Response(JSON.stringify(sample)); });
    expect(url).toBe('https://lichess.org/api/puzzle/next?angle=fork&difficulty=harder');
    expect(p.solution).toHaveLength(3);
    await fetchLichessPuzzle('mix', 'normal', async (u) => { url = u; return new Response(JSON.stringify(sample)); });
    expect(url).toBe('https://lichess.org/api/puzzle/next');
    await expect(fetchLichessPuzzle('fork', 'normal', async () => new Response('', { status: 429 }))).rejects.toThrow('esperar');
    await expect(fetchLichessPuzzle('fork', 'normal', async () => { throw new TypeError('x'); })).rejects.toThrow('conectar');
  });
});
