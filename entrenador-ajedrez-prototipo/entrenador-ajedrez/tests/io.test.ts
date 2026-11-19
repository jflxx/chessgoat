import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { HARD_CAP, ImportError, fetchChessCom, fetchLichess, validUsername, type FetchFn } from '../src/importers/online';
import { parseAll } from '../src/core/pgn';
import { createStore } from '../src/storage/db';
import { BackupError, buildBackup, parseBackup } from '../src/storage/backup';
import { buildPlan } from '../src/core/plan';
import { createPlanState } from '../src/core/tasks';
import { EnginePool, parseInfo, planEngine, type InfoState, type WorkerLike } from '../src/engine/pool';
import { PGN_ONE, PGN_TWO, mkGame } from './fixtures';

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

describe('Chess.com', () => {
  const calls: string[] = [];
  const api: FetchFn = async (url) => {
    calls.push(url);
    if (url.endsWith('/games/archives')) return json({ archives: ['https://api.chess.com/pub/player/yo/games/2026/09', 'https://api.chess.com/pub/player/yo/games/2026/10'] });
    if (url.endsWith('/2026/10')) return json({ games: [{ pgn: PGN_ONE, time_class: 'rapid', rules: 'chess', end_time: 20 }, { pgn: PGN_ONE.replace('111111', '333333'), time_class: 'blitz', rules: 'chess', end_time: 10 }, { pgn: PGN_TWO, time_class: 'blitz', rules: 'chess960', end_time: 30 }] });
    if (url.endsWith('/2026/09')) return json({ games: [{ pgn: PGN_TWO, time_class: 'blitz', rules: 'chess', end_time: 5 }] });
    return json({}, 404);
  };

  it('descarta variantes, respeta el filtro de ritmo y pide los meses más recientes primero', async () => {
    calls.length = 0;
    const pgn = await fetchChessCom('Yo', { max: 1, timeClass: 'rapid', fetchFn: api, delayMs: 0 });
    expect(parseAll(pgn)).toHaveLength(1);
    expect(calls.some((c) => c.endsWith('/2026/09'))).toBe(false); // con 1 partida basta el mes nuevo
    expect(calls[0]).toContain('/player/yo/'); // minúsculas
  });

  it('con max 0 recorre todos los archivos y deja el orden cronológico', async () => {
    const pgn = await fetchChessCom('yo', { max: 0, fetchFn: api, delayMs: 0 });
    expect(pgn.indexOf('Date "2026.11.17"')).toBeGreaterThan(-1);
    expect(parseAll(pgn)).toHaveLength(3);
  });

  it('informa de errores en español', async () => {
    await expect(fetchChessCom('noexiste', { max: 5, fetchFn: async () => json({}, 404), delayMs: 0 })).rejects.toThrow('No encontré ese usuario');
    await expect(fetchChessCom('yo', { max: 5, fetchFn: async () => { throw new TypeError('x'); } })).rejects.toBeInstanceOf(ImportError);
    await expect(fetchChessCom('yo', { max: 5, timeClass: 'bullet', fetchFn: api, delayMs: 0 })).rejects.toThrow('No hay partidas');
    await expect(fetchChessCom('a b', { max: 5, fetchFn: api })).rejects.toThrow('El usuario solo puede');
  });

  it('valida el usuario y limita el máximo', () => {
    expect(validUsername(' abc_1 ')).toBe('abc_1');
    expect(() => validUsername('../x')).toThrow();
    expect(HARD_CAP).toBe(500);
  });
});

describe('Lichess', () => {
  it('pide PGN con reloj y devuelve orden cronológico', async () => {
    let url = '';
    let accept = '';
    const f: FetchFn = async (u, i) => { url = u; accept = String((i?.headers as Record<string, string>).Accept); return new Response(PGN_TWO + '\n\n' + PGN_ONE); };
    const pgn = await fetchLichess('Yo', { max: 20, timeClass: 'daily', fetchFn: f });
    expect(url).toContain('/api/games/user/Yo?');
    expect(url).toContain('max=20');
    expect(url).toContain('clocks=true');
    expect(url).toContain('perfType=correspondence');
    expect(accept).toBe('application/x-chess-pgn');
    expect(pgn.indexOf('live/111111')).toBeLessThan(pgn.indexOf('live/222222'));
  });
  it('errores', async () => {
    await expect(fetchLichess('yo', { max: 5, fetchFn: async () => new Response('', { status: 404 }) })).rejects.toThrow('No encontré');
    await expect(fetchLichess('yo', { max: 5, fetchFn: async () => new Response('', { status: 429 }) })).rejects.toThrow('esperar');
    await expect(fetchLichess('yo', { max: 5, fetchFn: async () => new Response('  ') })).rejects.toThrow('No hay partidas');
  });
});

describe('IndexedDB', () => {
  it('guarda y recupera partidas, ajustes, repaso y actividad', async () => {
    const store = await createStore(new IDBFactory());
    expect(store.mode()).toBe('indexeddb');
    await store.saveGame(mkGame('g2'));
    await store.saveGame(mkGame('g1'));
    await store.saveGame({ ...mkGame('g1'), acc: 99 }); // actualiza
    await store.saveTrainerItem({ key: 'g1:3', box: 2, due: 123 });
    await store.addActivity('2026-11-18');
    await store.addActivity('2026-11-18');
    const d = await store.loadAll();
    expect(d.games.map((g) => g.id)).toEqual(['g1', 'g2']); // ordenadas por fecha
    expect(d.games[0].acc).toBe(99);
    expect(d.trainer).toEqual([{ key: 'g1:3', box: 2, due: 123 }]);
    expect(d.activity).toEqual(['2026-11-18']);
    expect(d.settings).toBeNull();
    await store.clearData();
    expect((await store.loadAll()).games).toHaveLength(0);
  });

  it('exportar -> importar (fusionar y reemplazar)', async () => {
    const a = await createStore(new IDBFactory());
    await a.saveGame(mkGame('g1'));
    await a.saveTrainerItem({ key: 'g1:1', box: 1, due: 5 });
    const text = JSON.stringify(buildBackup(await a.loadAll(), new Date('2026-11-19T10:00:00Z')));
    const b = await createStore(new IDBFactory());
    await b.saveGame(mkGame('g9'));
    await b.restore(parseBackup(text), 'merge');
    expect((await b.loadAll()).games.map((g) => g.id).sort()).toEqual(['g1', 'g9']);
    await b.restore(parseBackup(text), 'replace');
    expect((await b.loadAll()).games.map((g) => g.id)).toEqual(['g1']);
  });

  it('guarda el plan semanal y lo incluye en la copia de seguridad', async () => {
    const recs = [mkGame('g1'), mkGame('g2')];
    const plan = createPlanState(buildPlan(recs, { window: 30 }), recs, { window: 30, minutes: 30 }, null, new Date(2026, 10, 18));
    const a = await createStore(new IDBFactory());
    await a.saveGame(recs[0]);
    await a.savePlan(plan);
    expect((await a.loadAll()).plan?.weekStart).toBe('2026-11-16');
    const backup = parseBackup(JSON.stringify(buildBackup(await a.loadAll())));
    expect(backup.plan?.tasks.length).toBe(plan.tasks.length);
    const b = await createStore(new IDBFactory());
    await b.restore(backup, 'replace');
    expect((await b.loadAll()).plan?.tasks.length).toBe(plan.tasks.length);
    await a.savePlan(null);
    expect((await a.loadAll()).plan).toBeNull();
    await b.clearData();
    expect((await b.loadAll()).plan).toBeNull();
  });

  it('valida copias de seguridad', () => {
    expect(() => parseBackup('no json')).toThrow(BackupError);
    expect(() => parseBackup('{"app":"otra"}')).toThrow('no es una copia');
    expect(() => parseBackup('{"app":"entrenador-ajedrez","version":2}')).toThrow('no compatible');
    const b = parseBackup(JSON.stringify({ app: 'entrenador-ajedrez', version: 1, games: [mkGame('g1'), { id: 5 }], trainer: [{ key: 'a' }], activity: ['2026-01-01', 'mal'] }));
    expect(b.games).toHaveLength(1);
    expect(b.trainer).toHaveLength(0);
    expect(b.activity).toEqual(['2026-01-01']);
  });

  it('sin IndexedDB usa memoria', async () => {
    const m = await createStore(null);
    expect(m.mode()).toBe('memoria');
    await m.saveGame(mkGame('g1'));
    expect((await m.loadAll()).games).toHaveLength(1);
  });
});

describe('motor', () => {
  it('parseInfo lee profundidad, puntuación y variante', () => {
    const st: InfoState = {};
    parseInfo('info depth 12 seldepth 15 multipv 1 score cp -34 nodes 1 pv e2e4 e7e5', st);
    expect(st).toMatchObject({ depth: 12, cp: -34, mate: null, pv: ['e2e4', 'e7e5'] });
    parseInfo('info depth 13 score mate 3 pv d8h4', st);
    expect(st).toMatchObject({ mate: 3, cp: null, pv: ['d8h4'] });
    parseInfo('info depth 14 score cp 500 lowerbound pv a1a2', st);
    expect(st.depth).toBe(13); // ignora límites
    parseInfo('info string hola', st);
    expect(st.depth).toBe(13);
  });

  it('planEngine: multihilo solo con aislamiento de origen', () => {
    // análisis de partidas: con aislamiento, build multihilo y un worker por núcleo (lo más rápido medido)
    expect(planEngine('auto', 4, true, 8)).toEqual({ kind: 'multi', workers: 4, threads: 1 });
    // una sola posición: un worker con todos los hilos
    expect(planEngine('auto', 4, true, 8, 'single')).toEqual({ kind: 'multi', workers: 1, threads: 4 });
    // modo multihilo explícito
    expect(planEngine('multi', 4, true, 8)).toEqual({ kind: 'multi', workers: 1, threads: 4 });
    // sin aislamiento: build de un hilo con varios workers
    expect(planEngine('auto', 4, false, 8)).toEqual({ kind: 'single', workers: 4, threads: 1 });
    expect(planEngine('multi', 3, false, 8).kind).toBe('single');
    expect(planEngine('auto', 4, false, 8, 'single')).toEqual({ kind: 'single', workers: 1, threads: 1 });
    expect(planEngine('auto', 2, true, 2).kind).toBe('single'); // pocos núcleos
    expect(planEngine('single', 3, true, 8)).toEqual({ kind: 'single', workers: 3, threads: 1 });
    expect(planEngine('auto', 99, true, 8).workers).toBe(16);
  });

  it('la búsqueda continua cambia de posición sin mezclar resultados ni esperar a la anterior', async () => {
    let fen = '';
    let active: ReturnType<typeof setInterval> | null = null;
    const make = (): WorkerLike => {
      const w: WorkerLike = {
        onmessage: null, onerror: null, terminate() {},
        postMessage(msg: string) {
          const reply = (l: string) => queueMicrotask(() => w.onmessage?.({ data: l }));
          if (msg === 'uci') reply('uciok');
          else if (msg === 'isready') reply('readyok');
          else if (msg.startsWith('position fen ')) fen = msg.slice(13);
          else if (msg === 'stop') { if (active) clearInterval(active); active = null; reply('bestmove stop'); }
          else if (msg.startsWith('go')) {
            const f = fen;
            let d = 0;
            const t = setInterval(() => {
              d++;
              reply(`info depth ${d} multipv 1 score cp ${f === 'A' ? 10 : -20} pv ${f === 'A' ? 'a2a3' : 'b2b3'}`);
              if (d >= 6) { clearInterval(t); active = null; reply('bestmove done'); }
            }, 4);
            active = t;
          }
        },
      };
      return w;
    };
    const pool = await new EnginePool({ makeWorker: make, size: 1 }).init();
    const a: { pv: string; depth: number; done: boolean }[] = [];
    const b: { pv: string; depth: number; done: boolean }[] = [];
    pool.search('A', 1, 6, (u) => a.push({ pv: u.lines[0]?.pv[0], depth: u.depth, done: u.done }));
    for (let i = 0; i < 100 && a.length < 2; i++) await new Promise((r) => setTimeout(r, 10)); // la primera búsqueda ya va por el nivel 2
    pool.search('B', 1, 6, (u) => b.push({ pv: u.lines[0]?.pv[0], depth: u.depth, done: u.done }));
    for (let i = 0; i < 100 && !b.some((u) => u.done); i++) await new Promise((r) => setTimeout(r, 20));
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((u) => u.pv === 'a2a3' && !u.done)).toBe(true); // la anterior se cortó sin terminar
    expect(b.every((u) => u.pv === 'b2b3')).toBe(true); // nada de la posición anterior en la nueva
    expect(b[b.length - 1]).toMatchObject({ depth: 6, done: true });
    expect(b.filter((u) => u.done)).toHaveLength(1);
    // parar una búsqueda: no llegan más resultados
    const c: number[] = [];
    const stop = pool.search('A', 1, 6, (u) => c.push(u.depth));
    for (let i = 0; i < 100 && c.length < 1; i++) await new Promise((r) => setTimeout(r, 10));
    stop();
    const n = c.length;
    await new Promise((r) => setTimeout(r, 120));
    expect(c.length).toBe(n);
    pool.terminate();
  });

  it('el grupo reparte posiciones entre workers y cancela la cola', async () => {
    const used: number[] = [];
    let n = 0;
    const make = (): WorkerLike => {
      const id = n++;
      const w: WorkerLike = {
        onmessage: null, onerror: null, terminate() {},
        postMessage(msg: string) {
          const reply = (l: string) => queueMicrotask(() => w.onmessage?.({ data: l }));
          if (msg === 'uci') reply('uciok');
          else if (msg === 'isready') reply('readyok');
          else if (msg.startsWith('go')) setTimeout(() => { used.push(id); reply('info depth 5 score cp 12 pv e2e4'); reply('bestmove e2e4'); }, 5);
        },
      };
      return w;
    };
    const pool = await new EnginePool({ makeWorker: make, size: 3 }).init();
    const rs = await Promise.all(Array.from({ length: 6 }, () => pool.analyse('x', 5)));
    expect(rs.every((r) => r.cp === 12 && r.pv[0] === 'e2e4')).toBe(true);
    expect(new Set(used).size).toBe(3);
    const pending = Array.from({ length: 8 }, () => pool.analyse('x', 5).catch((e: Error) => e.message));
    pool.cancel();
    const out = await Promise.all(pending);
    expect(out.filter((o) => o === 'cancelado').length).toBeGreaterThan(0);
    pool.terminate();
  });
});
