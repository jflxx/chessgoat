import { describe, expect, it } from 'vitest';
import { OPENING_PLIES, allItems, filterItems, queue } from '../src/core/drills';
import { buildPlan } from '../src/core/plan';
import { DAY_NAMES, addDrillProgress, createPlanState, goalProgress, lichessUrl, markReviewed, mondayOf, needsRollover, setDone, syncAuto, taskStatus, weekSummary } from '../src/core/tasks';
import { blunder, mkGame } from './fixtures';

const hung = (sq: string) => blunder('pieza_colgada', { hs: sq, k: 'n', f: 'pos-' + sq + ' w', b: 'e2e4', bs: 'e4' });
const recs = Array.from({ length: 12 }, (_, i) => mkGame('g' + (i + 1), { moves: [hung('f3'), blunder('horquilla', { hs: 'e5', fp: 'n', f: 'h-' + i, b: 'd2d4' })] }));
const opts = { window: 30 as const, minutes: 30 };
const plan = buildPlan(recs, opts);
const wed = new Date(2026, 10, 18, 10); // miércoles 18/11/2026

describe('drills', () => {
  it('filtra por motivo, patrón y partida', () => {
    const items = allItems(recs);
    expect(items).toHaveLength(24);
    expect(filterItems(items, { tag: 'horquilla' })).toHaveLength(12);
    expect(filterItems(items, { patternKey: 'pieza_colgada:n@f3' })).toHaveLength(12);
    expect(filterItems(items, { gameId: 'g1' })).toHaveLength(2);
    expect(filterItems(items, undefined)).toHaveLength(24);
  });
  it('el filtro de apertura solo deja errores de las 10 primeras jugadas', () => {
    const late = Array.from({ length: 30 }, () => ({ s: 'a', e: 0 }));
    const g = mkGame('o1', { opening: 'Con blancas: Italiana', moves: [hung('f3'), ...late.slice(0, 28), blunder('horquilla', { hs: 'e5', fp: 'n', f: 'tarde', b: 'd2d4' })] });
    const items = allItems([g]);
    expect(items).toHaveLength(2);
    const early = filterItems(items, { opening: 'Con blancas: Italiana', maxPly: OPENING_PLIES });
    expect(early).toHaveLength(1);
    expect(early[0].i).toBe(0);
    expect(filterItems(items, { opening: 'Con blancas: Italiana' })).toHaveLength(2);
    const sinTempranos = allItems([mkGame('o2', { opening: 'Con blancas: Escocesa', moves: [...late.slice(0, 25), blunder('horquilla', { hs: 'e5', fp: 'n', f: 'tarde2', b: 'd2d4' })] })]);
    expect(filterItems(sinTempranos, { opening: 'Con blancas: Escocesa', maxPly: OPENING_PLIES })).toHaveLength(0);
  });

  it('la cola pone primero lo vencido y permite práctica extra', () => {
    const items = allItems(recs).slice(0, 3);
    const tr = new Map([[items[0].key, { key: items[0].key, box: 2, due: Date.now() + 1e9 }]]);
    expect(queue(items, tr)).toHaveLength(2);
    expect(queue(items, tr, Date.now(), true)).toHaveLength(3);
  });
});

describe('plan semanal accionable', () => {
  const s = createPlanState(plan, recs, opts, null, wed);
  it('empieza el lunes y genera tareas en los 7 días con ids únicos', () => {
    expect(s.weekStart).toBe('2026-11-16');
    expect(mondayOf(new Date(2026, 10, 22))).toBe('2026-11-16'); // domingo
    expect(mondayOf(new Date(2026, 10, 23))).toBe('2026-11-23');
    expect(new Set(s.tasks.map((t) => t.day)).size).toBe(7);
    expect(new Set(s.tasks.map((t) => t.id)).size).toBe(s.tasks.length);
    expect(DAY_NAMES).toHaveLength(7);
  });
  it('las tareas de repaso tienen filtro con ejemplos reales y objetivo razonable', () => {
    const drills = s.tasks.filter((t) => t.kind === 'drill');
    expect(drills.length).toBeGreaterThan(3);
    for (const d of drills) {
      expect(d.target).toBeGreaterThanOrEqual(3);
      expect(d.target).toBeLessThanOrEqual(15);
      expect(filterItems(allItems(recs), d.filter).length).toBeGreaterThan(0);
    }
    expect(s.tasks.find((t) => t.kind === 'drill' && t.filter?.patternKey)).toBeTruthy();
  });
  it('incluye revisión de la peor partida, puzzles dentro de la app e importación', () => {
    expect(s.tasks.find((t) => t.kind === 'review')?.href).toMatch(/^#\/partida\/g\d+\?p=\d+$/);
    const pz = s.tasks.filter((t) => t.kind === 'puzzle');
    expect(pz.length).toBeGreaterThan(0);
    expect(pz[0].theme).toBe('hangingPiece'); // prioridad principal: piezas colgadas
    expect(pz[0].target).toBeGreaterThanOrEqual(3);
    expect(s.tasks.find((t) => t.kind === 'import')).toBeTruthy();
    expect(lichessUrl('horquilla')).toContain('fork');
  });
  it('el repaso se completa solo al llegar al objetivo', () => {
    const st = structuredClone(s);
    const t = st.tasks.find((x) => x.kind === 'drill')!;
    for (let i = 0; i < t.target - 1; i++) expect(addDrillProgress(st, t.id, 1, wed)).toBe(false);
    expect(taskStatus(st, t).done).toBe(false);
    expect(addDrillProgress(st, t.id, 1, wed)).toBe(true);
    expect(taskStatus(st, t)).toMatchObject({ done: true, count: t.target });
    expect(addDrillProgress(st, t.id, 1, wed)).toBe(false);
  });
  it('el resumen semanal ignora las tareas opcionales', () => {
    const st = structuredClone(s);
    const req = st.tasks.filter((t) => !t.optional);
    expect(weekSummary(st).total).toBe(req.length);
    setDone(st, req[0].id, true, wed);
    expect(weekSummary(st).done).toBe(1);
    setDone(st, req[0].id, false);
    expect(weekSummary(st).done).toBe(0);
    setDone(st, st.tasks.find((t) => t.optional)!.id, true, wed);
    expect(weekSummary(st).done).toBe(0);
  });
  it('revisar la partida completa su tarea; importar partidas nuevas completa la suya', () => {
    const st = structuredClone(s);
    const rv = st.tasks.find((t) => t.kind === 'review')!;
    expect(markReviewed(st, rv.gameId!, wed)).toBe(true);
    expect(taskStatus(st, rv).done).toBe(true);
    expect(markReviewed(st, rv.gameId!, wed)).toBe(false);
    expect(syncAuto(st, recs, wed)).toBe(false);
    const nuevas = [...recs, mkGame('g50', { ts: Date.now() + 1e6 }), mkGame('g51', { ts: Date.now() + 2e6 })];
    expect(syncAuto(st, nuevas, wed)).toBe(true);
  });
  it('al cambiar de semana archiva el historial y conserva la línea base', () => {
    const st = structuredClone(s);
    setDone(st, st.tasks.find((t) => !t.optional)!.id, true, wed);
    const next = new Date(2026, 10, 24);
    expect(needsRollover(st, next)).toBe(true);
    const n = createPlanState(plan, recs, opts, st, next);
    expect(n.weekStart).toBe('2026-11-23');
    expect(n.history).toHaveLength(1);
    expect(n.history[0]).toMatchObject({ weekStart: '2026-11-16', done: 1 });
    expect(n.baseline).toEqual(st.baseline);
    expect(Object.keys(n.done)).toHaveLength(0);
  });
  it('regenerar en la misma semana conserva lo hecho', () => {
    const st = structuredClone(s);
    const t = st.tasks.find((x) => x.kind === 'play')!;
    setDone(st, t.id, true, wed);
    const again = createPlanState(plan, recs, opts, st, wed);
    expect(Object.keys(again.done).length).toBeGreaterThan(0);
    expect(again.createdAt).toBe(st.createdAt);
  });
});

describe('progreso hacia la meta', () => {
  it('compara las partidas nuevas con la línea base', () => {
    const s = createPlanState(plan, recs, opts, null, wed);
    expect(goalProgress(s, recs)).toMatchObject({ newGames: 0, enough: false, pct: 0 });
    // línea base: 2 errores por partida; meta 1,5. Partidas nuevas con 1 error.
    const nuevas = Array.from({ length: 4 }, (_, i) => mkGame('n' + i, { ts: s.baseline.lastTs + (i + 1) * 1000, moves: [hung('f3')] }));
    const g = goalProgress(s, [...recs, ...nuevas]);
    expect(g.enough).toBe(true);
    expect(g.baselineErr).toBe(2);
    expect(g.targetErr).toBe(1.5);
    expect(g.nowErr).toBe(1);
    expect(g.pct).toBe(100);
    expect(g.byTag.find((b) => b.id === 'pieza_colgada')).toBeTruthy();
  });
});
