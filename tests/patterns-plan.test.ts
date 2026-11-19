import { describe, expect, it } from 'vitest';
import { detectPatterns } from '../src/core/patterns';
import { WINDOWS, WINDOW_INFO, buildPlan } from '../src/core/plan';
import { clockReport, conversionReport } from '../src/core/report';
import { blunder, mkGame } from './fixtures';

const hung = (sq: string, k: 'n' | 'q' = 'n') => blunder('pieza_colgada', { hs: sq, k, f: 'pos-' + sq });
const quiet = () => mkGame('g0');

/** n partidas seguidas con la misma pieza colgada en la misma casilla */
function series(start: number, n: number, mk: (i: number) => ReturnType<typeof blunder>[]) {
  return Array.from({ length: n }, (_, i) => mkGame('g' + (start + i), { moves: mk(start + i) }));
}

describe('detectPatterns', () => {
  it('encuentra la misma pieza colgada en la misma casilla en dos partidas', () => {
    const recs = [mkGame('g1', { moves: [hung('f3')] }), mkGame('g2', { moves: [hung('f3')] }), mkGame('g3', { moves: [hung('a6')] })];
    const p = detectPatterns(recs, 20);
    const f3 = p.find((x) => x.key === 'pieza_colgada:n@f3')!;
    expect(f3).toBeTruthy();
    expect(f3.cur).toBe(2);
    expect(f3.title).toContain('caballo en f3');
    expect(f3.status).toBe('nuevo');
    expect(p.find((x) => x.key.endsWith('@a6'))).toBeUndefined(); // una sola vez no es patrón
  });

  it('no cuenta dos veces la misma partida', () => {
    const recs = [mkGame('g1', { moves: [hung('f3'), hung('f3')] })];
    expect(detectPatterns(recs, 20)).toHaveLength(0);
  });

  it('distingue persistente, mejorando y resuelto entre tandas', () => {
    // ventana 4: tanda anterior = g1..g4, actual = g5..g8
    const prev = series(1, 4, (i) => (i <= 3 ? [hung('f3'), hung('b2', 'q')] : [hung('b2', 'q')]));
    // f3: 3 veces antes y 0 ahora => resuelto; b2: 4 antes y 1 ahora => persistente; h7: 2 ahora, 0 antes => nuevo
    const cur = series(5, 4, (i) => (i === 5 ? [hung('b2', 'q'), hung('h7')] : i === 6 ? [hung('h7')] : []));
    const p = detectPatterns([...prev, ...cur], 4);
    const st = (k: string) => p.find((x) => x.key === k)?.status;
    expect(st('pieza_colgada:n@f3')).toBe('resuelto');
    expect(st('pieza_colgada:q@b2')).toBe('persistente');
    expect(st('pieza_colgada:n@h7')).toBe('nuevo');
    // persistentes primero, resueltos al final
    expect(p[0].status).toBe('persistente');
    expect(p[p.length - 1].status).toBe('resuelto');
  });

  it('detecta el mismo error repetido en la misma posición', () => {
    const m = (id: string) => mkGame(id, { moves: [blunder('posicional', { s: 'Bxf7+', bs: 'O-O', f: 'rnbq/8 w' })] });
    const p = detectPatterns([m('g1'), m('g2')], 20);
    const pos = p.find((x) => x.kind === 'posicion')!;
    expect(pos.title).toContain('Bxf7+');
    expect(pos.detail).toContain('O-O');
  });

  it('detecta errores tempranos repetidos en la misma apertura', () => {
    const early = (id: string) => mkGame(id, { moves: [blunder('posicional', { f: 'a-' + id })] });
    const p = detectPatterns([early('g1'), early('g2')], 20);
    expect(p.some((x) => x.kind === 'apertura' && x.title.includes('Italiana'))).toBe(true);
  });

  it('ignora errores pequeños (imprecisiones)', () => {
    const small = (id: string) => mkGame(id, { moves: [{ ...hung('f3'), c: 'i', d: 12 }] });
    expect(detectPatterns([small('g1'), small('g2')], 20)).toHaveLength(0);
  });
});

describe('buildPlan según la ventana', () => {
  const recs = [
    ...series(1, 30, () => [hung('f3'), blunder('horquilla', { hs: 'e5', fp: 'n', f: 'x' }), blunder('mate_rey', { hs: 'g1' }), blunder('peon_perdido', { hs: 'a2', k: 'p' })]),
    ...series(31, 20, () => [hung('f3')]),
  ];

  it('define 4 ventanas con distinto número de prioridades', () => {
    expect(WINDOWS).toEqual([20, 30, 40, 50]);
    expect(WINDOW_INFO[20].priorities).toBeLessThan(WINDOW_INFO[50].priorities);
  });

  it('usa solo las últimas N partidas', () => {
    expect(buildPlan(recs, { window: 20 }).games).toBe(20);
    expect(buildPlan(recs, { window: 50 }).games).toBe(50);
    expect(buildPlan(recs, { window: 20 }).prevGames).toBe(20);
  });

  it('el plan cambia con la ventana', () => {
    const p20 = buildPlan(recs, { window: 20 });
    const p50 = buildPlan(recs, { window: 50 });
    expect(p20.priorities).toHaveLength(1); // las últimas 20 solo tienen piezas colgadas
    expect(p20.priorities[0].id).toBe('pieza_colgada');
    expect(p50.priorities.length).toBeGreaterThan(p20.priorities.length);
    expect(p50.priorities.length).toBeLessThanOrEqual(WINDOW_INFO[50].priorities);
  });

  it('marca la tendencia y enlaza el patrón recurrente', () => {
    const p = buildPlan(recs, { window: 20 });
    expect(p.priorities[0].pattern).toContain('f3');
    const p30 = buildPlan(recs, { window: 30 });
    const hor = p30.priorities.find((x) => x.id === 'horquilla');
    expect(hor?.trend).toBe('mejor'); // desapareció en la última tanda
  });

  it('el plan semanal reparte los minutos pedidos', () => {
    const p = buildPlan(recs, { window: 30, minutes: 60 });
    expect(p.week).toHaveLength(7);
    const lunes = p.week[0].items.reduce((s, i) => s + i.min, 0);
    expect(lunes).toBeGreaterThanOrEqual(55);
    expect(lunes).toBeLessThanOrEqual(65);
  });

  it('sin partidas devuelve un plan vacío y sin errores da "mantener el nivel"', () => {
    expect(buildPlan([], {}).priorities).toHaveLength(0);
    expect(buildPlan([quiet(), quiet()], { window: 20 }).priorities[0].id).toBe('general');
  });
});

describe('informes', () => {
  it('conversión: ventajas grandes que no acaban en victoria', () => {
    const win = mkGame('g1', { result: 'W', moves: [{ s: 'e4', e: 400 }] });
    const thrown = mkGame('g2', { result: 'L', moves: [{ s: 'e4', e: 500 }, { s: 'e5', e: -200 }] });
    const never = mkGame('g3', { result: 'L', moves: [{ s: 'e4', e: 20 }] });
    const r = conversionReport([win, thrown, never]);
    expect(r.advantaged).toBe(2);
    expect(r.converted).toBe(1);
    expect(r.lost).toBe(1);
    expect(r.rate).toBe(50);
    expect(r.throwaways[0].gid).toBe('g2');
  });

  it('reloj: más errores con poco tiempo', () => {
    const mv = (cl: number, sp: number, err: boolean) => ({ s: 'a', e: 0, c: err ? ('x' as const) : ('g' as const), cl, sp, d: err ? 40 : 0 });
    const g = mkGame('g1', { tc: '600', moves: [mv(500, 5, false), mv(480, 5, false), mv(20, 3, true), mv(15, 3, true), mv(10, 3, false), mv(400, 1, true)] });
    const c = clockReport([g]);
    expect(c.games).toBe(1);
    expect(c.trouble).toMatchObject({ moves: 3, errors: 2 });
    expect(c.normal).toMatchObject({ moves: 3, errors: 1 });
    expect(c.fast).toMatchObject({ moves: 1, errors: 1 });
    expect(clockReport([mkGame('g2', { moves: [{ s: 'a', e: 0 }] })]).games).toBe(0);
  });
});
