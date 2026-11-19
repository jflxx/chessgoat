// Orquesta la importación (Chess.com, Lichess o PGN) y el análisis de las partidas nuevas.
import { analyzeGame } from '../core/analysis';
import { detectUser, parseAll, playedBy, timeClassOf } from '../core/pgn';
import { createPool, describePlan, isolatedNow, planEngine, type EnginePool } from '../engine/pool';
import { ImportError, fetchChessCom, fetchLichess } from '../importers/online';
import type { Source } from '../types';
import { afterImport } from './planctl';
import { S, message, render, saveSettings } from './state';

let abort: AbortController | null = null;

export function cancelRun() {
  if (!S.run) return;
  S.run.cancel = true;
  abort?.abort();
  S.pool?.cancel();
}

/** Motor de un hilo para comprobar jugadas del repaso. Se crea una sola vez. */
let small: Promise<EnginePool> | null = null;
export function trainerEngine(): Promise<EnginePool> {
  small ||= (async () => {
    const { pool } = await createPool(S.settings.engineMode, S.settings.cores, 'single');
    return pool;
  })().catch((e) => { small = null; throw e; });
  return small;
}

/** Motor propio del análisis en vivo, para que no compita con la comprobación de ejercicios. */
let liveP: Promise<EnginePool> | null = null;
export function liveEngine(): Promise<EnginePool> {
  liveP ||= (async () => {
    const { pool } = await createPool(S.settings.engineMode, S.settings.cores, 'single');
    return pool;
  })().catch((e) => { liveP = null; throw e; });
  return liveP;
}

export interface ImportRequest { source: Source; user: string; pgnText?: string }

export async function startImport(req: ImportRequest): Promise<void> {
  if (S.run) return;
  S.msg = '';
  const { n, depth, timeClass } = S.settings;
  S.run = { done: 0, total: 0, label: 'Preparando…', cancel: false };
  abort = new AbortController();
  render();
  let pool: EnginePool | null = null;
  try {
    // 1. Obtener el PGN
    let text = req.pgnText || '';
    if (req.source === 'chesscom' || req.source === 'lichess') {
      if (!req.user.trim()) throw new ImportError('Escribe tu nombre de usuario.');
      const opts = { max: n, timeClass, signal: abort.signal, onProgress: (m: string) => { if (S.run) { S.run.label = m; paintProgress(); } } };
      text = req.source === 'chesscom' ? await fetchChessCom(req.user, opts) : await fetchLichess(req.user, opts);
    }
    if (!text.trim()) throw new ImportError('Sube un archivo PGN o pega el texto de tus partidas.');

    // 2. Interpretar y filtrar
    let games = parseAll(text, req.source);
    if (!games.length) throw new ImportError('No encontré partidas válidas (solo se analiza ajedrez estándar).');
    const user = req.user.trim() || detectUser(games);
    games = games.filter((g) => playedBy(g, user));
    if (!games.length) throw new ImportError(`No hay partidas de "${user}" en ese texto. Revisa el usuario.`);
    if (req.source === 'pgn' && timeClass) games = games.filter((g) => timeClassOf(g.headers.TimeControl) === timeClass);
    if (n) games = games.slice(-n);
    const have = new Map(S.recs.map((r) => [r.id, r]));
    const todo = games.filter((g) => !have.has(g.id) || have.get(g.id)!.depth < depth || !have.get(g.id)!.gr);
    const patch = { user } as Record<string, string>;
    if (req.source === 'chesscom') patch.chesscomUser = user;
    if (req.source === 'lichess') patch.lichessUser = user;
    await saveSettings({ ...patch, source: req.source });
    if (!todo.length) {
      message(`Esas ${games.length} partidas ya estaban analizadas.`);
      return;
    }

    // 3. Motor
    S.run.total = todo.reduce((s, g) => s + g.plies.length + 1, 0);
    S.run.label = 'Cargando Stockfish…';
    render();
    const created = await createPool(S.settings.engineMode, S.settings.cores);
    pool = created.pool;
    S.pool = pool;
    S.engineNote = created.note;
    const workers = created.plan.threads > 1 ? created.plan.threads + ' hilos' : plural(created.plan.workers);

    // 4. Analizar una a una y guardar
    let i = 0, base = 0, lastPaint = 0;
    for (const g of todo) {
      if (S.run.cancel) break;
      i++;
      S.run.label = `Partida ${i} de ${todo.length} · ${workers}${S.settings.verify ? ' · con verificación de errores' : ''}`;
      const expect = g.plies.length + 1;
      let cnt = 0;
      const rec = await analyzeGame(g, user, pool, depth, () => {
        cnt++;
        if (!S.run) return;
        S.run.done = base + Math.min(cnt, expect);
        const now = Date.now();
        if (now - lastPaint > 300) { lastPaint = now; paintProgress(); }
      }, { verify: S.settings.verify });
      base += expect;
      S.run.done = base;
      S.recs = S.recs.filter((r) => r.id !== rec.id).concat(rec).sort((a, b) => a.ts - b.ts);
      await S.store?.saveGame(rec);
    }
    message(S.run.cancel ? 'Análisis cancelado. Lo analizado hasta aquí se guardó.' : `Listo: ${i} ${i === 1 ? 'partida analizada' : 'partidas analizadas'}.`);
  } catch (e) {
    const err = e as Error;
    if (err.message === 'cancelado' || err.name === 'AbortError') message('Cancelado. Lo analizado hasta aquí se guardó.');
    else if (err instanceof ImportError) message(err.message, 'err');
    else message('El análisis se detuvo: ' + (err.message || String(e)), 'err');
  } finally {
    S.run = null;
    abort = null;
    if (pool) { pool.terminate(); S.pool = null; }
    await afterImport();
    render();
  }
}

const plural = (n: number) => `${n} ${n === 1 ? 'worker' : 'workers'}`;

export function paintProgress() {
  const r = S.run;
  if (!r) return;
  const pct = r.total ? Math.min(100, Math.round((r.done / r.total) * 100)) : 0;
  const bar = document.querySelector<HTMLElement>('.progress > div');
  const box = document.querySelector<HTMLElement>('.progress');
  const lab = document.getElementById('run-label');
  if (bar) bar.style.width = pct + '%';
  box?.setAttribute('aria-valuenow', String(pct));
  if (lab) lab.textContent = r.total ? `${r.label} · ${pct}%` : r.label;
}

/** Descripción corta de qué motor se usará, para mostrarla antes de analizar. */
export function engineSummary(): string {
  const p = planEngine(S.settings.engineMode, S.settings.cores, isolatedNow(), navigator.hardwareConcurrency || 4);
  return describePlan(p) + (isolatedNow() ? '' : ' · el multihilo no está disponible en este contexto');
}
