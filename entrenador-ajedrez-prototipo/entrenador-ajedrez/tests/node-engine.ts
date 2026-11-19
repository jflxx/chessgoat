// Ejecuta el Stockfish WASM de public/engine en un proceso de Node (protocolo UCI por stdin/stdout).
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { EngineLike, EngineResult } from '../src/types';
import { parseInfo, type InfoState } from '../src/engine/pool';

export class NodeEngine implements EngineLike {
  private p: ChildProcessWithoutNullStreams;
  private cb: ((r: EngineResult) => void) | null = null;
  private st: InfoState = {};
  private waiters: { t: string; r: (l: string) => void }[] = [];
  private q: Promise<unknown> = Promise.resolve();

  constructor() {
    // El paquete es ESM; el motor es CommonJS. Se copia a una carpeta temporal con su propio package.json.
    const src = path.resolve(__dirname, '../public/engine');
    const dir = path.join(os.tmpdir(), 'sf18-lite-single');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"commonjs"}');
    for (const f of ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm']) if (!fs.existsSync(path.join(dir, f))) fs.copyFileSync(path.join(src, f), path.join(dir, f));
    const file = path.join(dir, 'stockfish-18-lite-single.js');
    this.p = spawn(process.execPath, [file]);
    const rl = readline.createInterface({ input: this.p.stdout });
    rl.on('line', (l) => {
      for (const w of [...this.waiters]) if (l.startsWith(w.t)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.r(l); }
      if (!this.cb) return;
      if (l.startsWith('info ')) parseInfo(l, this.st);
      else if (l.startsWith('bestmove')) {
        const c = this.cb;
        this.cb = null;
        const bm = l.split(' ')[1];
        if (!this.st.pv || !this.st.pv.length) this.st.pv = bm && bm !== '(none)' ? [bm] : [];
        c({ cp: this.st.cp ?? 0, mate: this.st.mate ?? null, pv: this.st.pv, depth: this.st.depth || 0 });
      }
    });
  }
  private wait(t: string) { return new Promise<string>((r) => this.waiters.push({ t, r })); }
  async init() {
    const a = this.wait('uciok');
    this.p.stdin.write('uci\n');
    await a;
    const b = this.wait('readyok');
    this.p.stdin.write('isready\n');
    await b;
  }
  analyse(fen: string, depth: number): Promise<EngineResult> {
    const run = () => new Promise<EngineResult>((res) => {
      this.st = {};
      this.cb = res;
      this.p.stdin.write(`position fen ${fen}\ngo depth ${depth}\n`);
    });
    const r = this.q.then(run);
    this.q = r.catch(() => undefined);
    return r;
  }
  quit() { this.p.kill(); }
}
