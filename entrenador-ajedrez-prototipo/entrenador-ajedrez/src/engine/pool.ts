// Stockfish 18 lite (WASM) en Web Workers.
//  - Con aislamiento de origen (crossOriginIsolated): un worker con varios hilos (build multihilo).
//  - Sin él: varios workers de un hilo cada uno (build single), cada worker analiza posiciones distintas.
import type { EngineLike, EngineLine, EngineMode, EngineResult } from '../types';

/** Actualización de una búsqueda continua: líneas actuales, profundidad alcanzada y si terminó. */
export interface LiveUpdate { lines: EngineLine[]; depth: number; done: boolean }

export interface InfoState { depth?: number; cp?: number | null; mate?: number | null; pv?: string[] }

/** Interpreta una línea "info ..." del protocolo UCI y actualiza el estado. */
export function parseInfo(line: string, st: InfoState): void {
  if (!line.startsWith('info ') || / (?:lower|upper)bound /.test(line) || !line.includes(' pv ')) return;
  const d = /\bdepth (\d+)/.exec(line);
  const cp = /\bscore cp (-?\d+)/.exec(line);
  const mt = /\bscore mate (-?\d+)/.exec(line);
  const pv = /\bpv (.+)$/.exec(line);
  if (!pv || (!cp && !mt)) return;
  st.depth = d ? +d[1] : st.depth;
  if (cp) {
    st.cp = +cp[1];
    st.mate = null;
  } else if (mt) {
    st.mate = +mt[1];
    st.cp = null;
  }
  st.pv = pv[1].trim().split(/\s+/);
}

export interface WorkerLike {
  postMessage(msg: string): void;
  terminate(): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null;
}

interface Job { st: InfoState; lines: InfoState[]; multipv: number; resolve: (r: EngineResult) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }

class Slot {
  busy = false;
  failed = false;
  private cur: Job | null = null;
  private waiters: { token: string; resolve: (l: string) => void; reject: (e: Error) => void }[] = [];
  private w: WorkerLike;

  constructor(make: () => WorkerLike, private threads: number, private hashMb: number) {
    this.w = make();
    this.w.onmessage = (e) => this.onLine(typeof e.data === 'string' ? e.data : String(e.data));
    this.w.onerror = (e) => {
      this.failed = true;
      if (this.cur) {
        clearTimeout(this.cur.timer);
        this.cur.reject(new Error('Error del motor: ' + (e.message || 'desconocido')));
        this.cur = null;
      }
    };
  }

  private onLine(line: string) {
    // El build multihilo avisa así cuando no puede crear sus hilos: se falla en el acto en vez de esperar al tiempo límite.
    if (line.startsWith('worker sent an error')) {
      this.failed = true;
      for (const w of this.waiters.splice(0)) w.reject(new Error('El motor multihilo no pudo crear sus hilos.'));
      return;
    }
    for (const w of [...this.waiters]) {
      if (line.startsWith(w.token)) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.resolve(line);
      }
    }
    if (line.startsWith('bestmove')) {
      this.pendingBest = Math.max(0, this.pendingBest - 1);
      if (this.pendingBest > 0) return; // fin de una búsqueda anterior que ya se había parado
      const sm = this.stream;
      if (sm) {
        this.stream = null;
        const lines = collect(sm.lines);
        sm.onUpdate({ lines, depth: lines[0]?.depth ?? 0, done: true });
        return;
      }
    } else if (this.stream && line.startsWith('info ')) {
      if (this.pendingBest > 1) return; // todavía llegan líneas de la búsqueda anterior
      const sm = this.stream;
      const mp = / multipv (\d+)/.exec(line);
      const k = mp ? +mp[1] : 1;
      const slot = (sm.lines[k - 1] ||= {});
      parseInfo(line, slot);
      if (k === sm.multipv && slot.pv) {
        const lines = collect(sm.lines);
        sm.onUpdate({ lines, depth: lines[0]?.depth ?? 0, done: false });
      }
      return;
    }
    const c = this.cur;
    if (!c) return;
    if (line.startsWith('info ')) {
      const mp = / multipv (\d+)/.exec(line);
      const k = mp ? +mp[1] : 1;
      if (k === 1) parseInfo(line, c.st);
      if (c.multipv > 1) parseInfo(line, (c.lines[k - 1] ||= {}));
    }
    else if (line.startsWith('bestmove')) {
      this.cur = null;
      clearTimeout(c.timer);
      const bm = line.split(/\s+/)[1];
      const st = c.st;
      if (!st.pv || !st.pv.length) st.pv = bm && bm !== '(none)' ? [bm] : [];
      const lines = c.multipv > 1 ? c.lines.filter((l) => l && l.pv).map((l) => ({ cp: l.cp ?? 0, mate: l.mate ?? null, pv: l.pv!, depth: l.depth || 0 })) : undefined;
      c.resolve({ cp: st.cp ?? 0, mate: st.mate ?? null, pv: st.pv, depth: st.depth || 0, lines });
    }
  }

  private send(cmd: string) { this.w.postMessage(cmd); }

  private wait(token: string, ms: number): Promise<string> {
    return new Promise((resolve, reject) => {
      this.waiters.push({ token, resolve, reject });
      setTimeout(() => reject(new Error('El motor no respondió (' + token + ')')), ms);
    });
  }

  async init(timeoutMs = 25000) {
    const u = this.wait('uciok', timeoutMs);
    this.send('uci');
    await u;
    this.send('setoption name Hash value ' + this.hashMb);
    if (this.threads > 1) this.send('setoption name Threads value ' + this.threads);
    const r = this.wait('readyok', timeoutMs);
    this.send('isready');
    await r;
  }

  private mpv = 1;
  private pendingBest = 0;
  private stream: { multipv: number; lines: InfoState[]; onUpdate: (u: LiveUpdate) => void } | null = null;

  /**
   * Búsqueda continua para el motor en vivo: cada nueva posición para la anterior (sin esperar a que termine),
   * y se envían resultados parciales a medida que sube la profundidad. Devuelve una función para pararla.
   */
  search(fen: string, multipv: number, maxDepth: number, onUpdate: (u: LiveUpdate) => void): () => void {
    if (this.pendingBest > 0) this.send('stop');
    if (multipv !== this.mpv) {
      this.send('setoption name MultiPV value ' + multipv);
      this.mpv = multipv;
    }
    const st = { multipv, lines: [] as InfoState[], onUpdate };
    this.stream = st;
    this.pendingBest++;
    this.send('position fen ' + fen);
    this.send('go depth ' + maxDepth);
    return () => {
      if (this.stream !== st) return;
      this.stream = null;
      if (this.pendingBest > 0) this.send('stop');
    };
  }

  run(fen: string, depth: number, multipv = 1): Promise<EngineResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.cur = null;
        this.failed = true;
        reject(new Error('El motor tardó demasiado en responder.'));
      }, 120000);
      this.cur = { st: {}, lines: [], multipv, resolve, reject, timer };
      if (multipv !== this.mpv) {
        this.send('setoption name MultiPV value ' + multipv);
        this.mpv = multipv;
      }
      this.send('position fen ' + fen);
      this.send('go depth ' + depth);
    });
  }

  kill() {
    try { this.w.terminate(); } catch { /* nada */ }
  }
}

function collect(lines: InfoState[]): EngineLine[] {
  return lines.filter((l) => l && l.pv).map((l) => ({ cp: l.cp ?? 0, mate: l.mate ?? null, pv: l.pv!, depth: l.depth || 0 }));
}

export interface PoolOptions {
  makeWorker: () => WorkerLike;
  size: number;
  threads?: number;
  hashMb?: number;
}

export class EnginePool implements EngineLike {
  readonly size: number;
  readonly threads: number;
  private slots: Slot[] = [];
  private queue: { fen: string; depth: number; multipv: number; resolve: (r: EngineResult) => void; reject: (e: Error) => void }[] = [];

  constructor(private opts: PoolOptions) {
    this.size = opts.size;
    this.threads = opts.threads ?? 1;
  }

  async init(): Promise<this> {
    const made: Slot[] = [];
    for (let i = 0; i < this.size; i++) made.push(new Slot(this.opts.makeWorker, this.threads, this.opts.hashMb ?? 16));
    try {
      await Promise.all(made.map((s) => s.init()));
    } catch (e) {
      made.forEach((s) => s.kill());
      throw e;
    }
    this.slots = made;
    return this;
  }

  analyse(fen: string, depth: number, multipv = 1): Promise<EngineResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, depth, multipv, resolve, reject });
      this.pump();
    });
  }

  /** Búsqueda continua en el primer motor del grupo (ver Slot.search). */
  search(fen: string, multipv: number, maxDepth: number, onUpdate: (u: LiveUpdate) => void): () => void {
    const s = this.slots[0];
    return s ? s.search(fen, multipv, maxDepth, onUpdate) : () => undefined;
  }

  private pump() {
    for (const s of this.slots) {
      if (s.busy || s.failed || !this.queue.length) continue;
      const job = this.queue.shift()!;
      s.busy = true;
      s.run(job.fen, job.depth, job.multipv).then(job.resolve, job.reject).finally(() => {
        s.busy = false;
        this.pump();
      });
    }
  }

  cancel() {
    const q = this.queue;
    this.queue = [];
    q.forEach((j) => j.reject(new Error('cancelado')));
  }

  terminate() {
    this.cancel();
    this.slots.forEach((s) => s.kill());
    this.slots = [];
  }
}

// ---------- elección de build ----------
export interface EnginePlan { kind: 'multi' | 'single'; workers: number; threads: number }
export type Purpose = 'batch' | 'single';

/**
 * Elige el build y el reparto de CPU.
 *  - Sin aislamiento de origen (crossOriginIsolated): build de un hilo, N workers.
 *  - Con aislamiento: build multihilo (stockfish-18-lite).
 *      · "batch" (analizar partidas enteras, muchas posiciones): N workers de 1 hilo. Medido: es 2-3 veces más
 *        rápido que 1 worker con N hilos, porque las posiciones son independientes.
 *      · "single" (una posición, p. ej. comprobar una jugada del repaso): 1 worker con N hilos, menor latencia.
 *      · modo "multi" explícito: siempre 1 worker con N hilos.
 */
export function planEngine(mode: EngineMode, cores: number, isolated: boolean, hw: number, purpose: Purpose = 'batch'): EnginePlan {
  const c = Math.max(1, Math.min(cores, 16));
  const useMulti = mode === 'single' ? false : mode === 'multi' ? isolated : isolated && hw >= 4;
  if (!useMulti) return { kind: 'single', workers: purpose === 'batch' ? c : 1, threads: 1 };
  if (mode === 'multi' || purpose === 'single') return { kind: 'multi', workers: 1, threads: c };
  return { kind: 'multi', workers: c, threads: 1 };
}

const FILES = { multi: 'engine/stockfish-18-lite.js', single: 'engine/stockfish-18-lite-single.js' } as const;

function realWorker(kind: 'multi' | 'single'): WorkerLike {
  const url = new URL(import.meta.env.BASE_URL + FILES[kind], location.href).href;
  return new Worker(url) as unknown as WorkerLike;
}

export interface CreatedPool { pool: EnginePool; plan: EnginePlan; note: string }

export function describePlan(p: EnginePlan): string {
  const w = `${p.workers} ${p.workers === 1 ? 'worker' : 'workers'}`;
  if (p.kind === 'multi') return p.threads > 1 ? `Stockfish 18 lite multihilo (${p.threads} hilos)` : `Stockfish 18 lite multihilo (build con hilos, ${w} en paralelo)`;
  return `Stockfish 18 lite de un hilo (${w} en paralelo)`;
}

export const isolatedNow = () => typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined';

async function build(plan: EnginePlan): Promise<EnginePool> {
  return new EnginePool({ makeWorker: () => realWorker(plan.kind), size: plan.workers, threads: plan.threads, hashMb: plan.workers > 1 ? 16 : 64 }).init();
}

/** Crea el grupo de motores según el modo y las capacidades del navegador. Si el multihilo falla, cae al de un hilo. */
export async function createPool(mode: EngineMode, cores: number, purpose: Purpose = 'batch'): Promise<CreatedPool> {
  const plan = planEngine(mode, cores, isolatedNow(), navigator.hardwareConcurrency || 4, purpose);
  if (plan.kind === 'multi') {
    try {
      return { pool: await build(plan), plan, note: describePlan(plan) };
    } catch {
      const fb = planEngine('single', cores, false, 1, purpose);
      return { pool: await build(fb), plan: fb, note: describePlan(fb) + ' (el multihilo no arrancó)' };
    }
  }
  const pool = await build(plan);
  return { pool, plan, note: describePlan(plan) + (mode === 'multi' ? ' (este navegador no permite multihilo)' : '') };
}

export const defaultCores = () => Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 1, 6));
