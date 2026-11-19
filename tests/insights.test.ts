import { describe, expect, it } from 'vitest';
import { clockDetail, errorInsights, openingsDetail } from '../src/core/insights';
import { conversionReport } from '../src/core/report';
import type { MoveRec } from '../src/types';
import { blunder, mkGame } from './fixtures';

const ok = (e = 0): MoveRec => ({ s: 'a', e, c: 'g', d: 0 });

describe('errorInsights', () => {
  // movimientos alternados: índice par = jugadas del usuario (blancas); las del rival no llevan clasificación
  const opp: MoveRec = { s: 'x', e: 0 };
  const g1 = mkGame('g1', {
    moves: [ok(100), opp, blunder('pieza_colgada', { hs: 'f3', k: 'n', e: -300 }), opp, ok(), opp, ok(), opp, ok(), opp, ok(), opp, ok(), opp, ok(), opp, ok(), opp, ok(), opp, ok(), opp, blunder('horquilla', { hs: 'e5', fp: 'n', e: -500 })],
    counts: { k: 0, h: 0, b: 0, g: 9, i: 0, m: 0, x: 2 },
  });
  const g2 = mkGame('g2', { moves: [ok(), opp, ok(), opp], result: 'W' });

  it('cuenta errores por tramo de jugadas, situación, piezas y casillas', () => {
    const r = errorInsights([g1, g2]);
    expect(r.games).toBe(2);
    expect(r.gamesWithBig).toBe(1);
    expect(r.gamesWithBlunder).toBe(1);
    expect(r.avgLossBlunder).toBe(35);
    expect(r.byMove[0]).toMatchObject({ label: '1-5', errors: 1 }); // el grave de la jugada 2
    expect(r.byMove[2].errors).toBe(1); // jugada 11
    expect(r.byMove[7].label).toBe('36+');
    expect(r.pieces.n).toBe(1);
    expect(r.squares).toMatchObject({ f3: 1, e5: 1 });
    // el primer grave llegó con evaluación +100 (≈ 59 %, igualado); el segundo con la anterior ok() = 0
    expect(r.bySituation.winning + r.bySituation.equal + r.bySituation.losing).toBe(2);
    expect(r.tags[0].tag === 'pieza_colgada' || r.tags[0].tag === 'horquilla').toBe(true);
    expect(r.tags.reduce((s, t) => s + t.share, 0)).toBeGreaterThanOrEqual(99);
  });

  it('marca la tendencia de cada motivo frente a la tanda anterior', () => {
    const prev = Array.from({ length: 6 }, (_, i) => mkGame('p' + i, { moves: [blunder('pieza_colgada', { hs: 'f3' })] }));
    const cur = Array.from({ length: 6 }, (_, i) => mkGame('c' + i, { moves: [ok()] }));
    expect(errorInsights(cur, prev).tags).toHaveLength(0);
    const cur2 = Array.from({ length: 6 }, (_, i) => mkGame('d' + i, { moves: [blunder('pieza_colgada', { hs: 'f3' }), blunder('pieza_colgada', { hs: 'g4' })] }));
    expect(errorInsights(cur2, prev).tags[0].trend).toBe('peor');
    expect(errorInsights(prev, prev).tags[0].trend).toBe('estable');
    expect(errorInsights(cur2, []).tags[0].trend).toBe('sin_datos');
  });
});

describe('conversión ampliada', () => {
  it('dice dónde se escapó la ventaja y reparte por umbral', () => {
    const lost = mkGame('g1', {
      result: 'L',
      moves: [{ s: 'e4', e: 600, c: 'b', d: 0, ph: 'a' }, { s: 'e5', e: 600 }, { s: 'Qh5', e: -300, c: 'x', d: 70, ph: 'm', bs: 'Nf3' }],
    });
    const won = mkGame('g2', { result: 'W', moves: [{ s: 'e4', e: 150 }] });
    const r = conversionReport([lost, won]);
    expect(r.thresholds.map((t) => t.t)).toEqual([60, 75, 90]);
    expect(r.thresholds[1]).toMatchObject({ adv: 1, conv: 0 });
    expect(r.throwaways[0].lostAt).toMatchObject({ i: 2, s: 'Qh5', bs: 'Nf3' });
    expect(r.lostPhase.m).toBe(1);
    expect(r.scatter).toHaveLength(2);
    expect(r.scatter[0]).toMatchObject({ idx: 1, result: 'L' });
  });
  it('lista las remontadas', () => {
    const w = mkGame('g1', { result: 'W', moves: [{ s: 'e4', e: -700 }, { s: 'e5', e: 400 }] });
    expect(conversionReport([w]).comebackGames[0]).toMatchObject({ gid: 'g1', low: expect.any(Number) });
  });
});

describe('clockDetail', () => {
  const mv = (cl: number, sp: number, err: boolean): MoveRec => ({ s: 'a', e: 0, c: err ? 'x' : 'g', d: err ? 40 : 0, cl, sp });
  const g = mkGame('g1', { tc: '600', moves: [mv(590, 0.5, false), { s: 'o', e: 0 }, mv(300, 5, false), { s: 'o', e: 0 }, mv(200, 12, true), { s: 'o', e: 0 }, mv(40, 2, true), { s: 'o', e: 0 }, mv(20, 1.5, true)] });

  it('reparte los errores según el tiempo que queda y el que gastas', () => {
    const d = clockDetail([g]);
    expect(d.byRemaining[0]).toMatchObject({ moves: 1, errors: 0 }); // 590 de 600
    expect(d.byRemaining[2]).toMatchObject({ moves: 2, errors: 1 }); // 300 (50 %) y 200 (33 %)
    expect(d.byRemaining[3]).toMatchObject({ moves: 0 });
    expect(d.byRemaining[4]).toMatchObject({ moves: 2, errors: 2 }); // 40 y 20 de 600
    expect(d.byRemaining.reduce((s, b) => s + b.moves, 0)).toBe(5);
    expect(d.bySpent[0]).toMatchObject({ moves: 1, errors: 0 });
    expect(d.bySpent.reduce((s, b) => s + b.errors, 0)).toBe(3);
    expect(d.troubleGames[0]).toMatchObject({ id: 'g1', minLeftPct: 3 });
    expect(d.byMove[0].moves).toBe(5);
  });

  it('ignora partidas sin reloj y detecta derrotas por tiempo', () => {
    expect(clockDetail([mkGame('g2', { moves: [ok()] })]).troubleGames).toHaveLength(0);
    const flag = mkGame('g3', { result: 'L', term: 'rival ganó por tiempo', moves: [mv(5, 1, false)] });
    expect(clockDetail([flag]).flagGames).toHaveLength(1);
  });
});

describe('openingsDetail', () => {
  it('agrupa por color y apertura, con mejor y peor', () => {
    const a = (id: string, result: 'W' | 'L' | 'D', opening = 'Con blancas: Italiana') => mkGame(id, { result, opening, color: opening.startsWith('Con negras') ? 'b' : 'w' });
    const d = openingsDetail([a('g1', 'W'), a('g2', 'W'), a('g3', 'L', 'Con blancas: Escocesa'), a('g4', 'L', 'Con blancas: Escocesa'), a('g5', 'D', 'Con negras: Siciliana')]);
    expect(d.white.map((o) => o.name)).toEqual(['Con blancas: Italiana', 'Con blancas: Escocesa']);
    expect(d.black).toHaveLength(1);
    expect(d.white[0]).toMatchObject({ n: 2, W: 2, score: 1, lastId: 'g2' });
    expect(d.best?.name).toBe('Con blancas: Italiana');
    expect(d.worst?.name).toBe('Con blancas: Escocesa');
  });
  it('sin al menos 2 partidas no hay mejor ni peor', () => {
    const d = openingsDetail([mkGame('g1', { result: 'W' })]);
    expect(d.best).toBeNull();
    expect(d.worst).toBeNull();
  });
});
