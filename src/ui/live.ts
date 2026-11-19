// Motor en vivo: búsqueda continua que muestra resultados desde las primeras profundidades y se cancela
// al cambiar de posición (en vez de acumular búsquedas pendientes).
import { MATE } from '../core/analysis';
import { uciLineToSan } from '../core/puzzle';
import type { EngineLine } from '../types';
import { evalBarHTML, fmtEval } from './board';
import { esc, patchHTML } from './dom';
import { liveEngine } from './runner';
import { S } from './state';

export const LIVE_MAX_DEPTH = 24;
const MIN_SHOW_DEPTH = 6;

interface Entry { lines: EngineLine[]; depth: number; done: boolean }

const cache = new Map<string, Entry>();
let curFen = '';
let stop: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let failed = false;
let lastPaint = 0;
let paintTimer: ReturnType<typeof setTimeout> | null = null;

const keyOf = (fen: string) => fen + '|' + S.settings.liveLines;

export function stopLive() {
  if (timer) clearTimeout(timer);
  timer = null;
  stop?.();
  stop = null;
  curFen = '';
}

function paintSoon() {
  const now = Date.now();
  if (now - lastPaint < 120) {
    paintTimer ||= setTimeout(() => { paintTimer = null; paintLive(); }, 120);
    return;
  }
  paintLive();
}

async function start(fen: string, lines: number) {
  const k = fen + '|' + lines;
  try {
    const eng = await liveEngine();
    if (curFen !== k) return;
    stop?.();
    stop = eng.search(fen, lines, LIVE_MAX_DEPTH, (u) => {
      if (curFen !== k) return;
      const prev = cache.get(k);
      if (u.depth >= MIN_SHOW_DEPTH || u.done || !prev) cache.set(k, { lines: u.lines, depth: u.depth, done: u.done });
      if (cache.size > 200) cache.delete(cache.keys().next().value!);
      paintSoon();
    });
  } catch {
    failed = true;
    paintLive();
  }
}

/** Pide análisis para la posición. Con un pequeño retardo para no lanzar una búsqueda por cada paso rápido. */
export function ensureLive(fen: string) {
  const key = fen + '|' + S.settings.liveLines;
  const hit = cache.get(key);
  if (curFen === key) return;
  curFen = key;
  if (timer) clearTimeout(timer);
  stop?.();
  stop = null;
  if (hit?.done) return;
  failed = false;
  timer = setTimeout(() => { timer = null; void start(fen, S.settings.liveLines); }, 140);
}

// El resultado se guarda por posición y número de líneas.
function entry(fen: string): Entry | undefined {
  return cache.get(keyOf(fen));
}

/** Evaluación desde las blancas de la mejor línea, si ya hay. */
export function liveEvalWhite(fen: string): number | null {
  const e = entry(fen);
  const l = e?.lines[0];
  if (!l) return null;
  const s = fen.split(' ')[1] === 'w' ? 1 : -1;
  return s * (l.mate != null ? (l.mate > 0 ? MATE : -MATE) : l.cp);
}

export function linesInner(fen: string): string {
  const e = entry(fen);
  if (failed && !e) return '<p class="sub">El motor no está disponible en este navegador.</p>';
  if (!e || !e.lines.length) return '<div class="lines"><div class="skeleton" style="height:32px"></div><div class="skeleton" style="height:32px"></div></div><p class="sub">Calculando con Stockfish…</p>';
  const s = fen.split(' ')[1] === 'w' ? 1 : -1;
  const fullMove = +(fen.split(' ')[5] || 1);
  const white = s === 1;
  const rows = e.lines.map((l) => {
    const cpW = s * (l.mate != null ? (l.mate > 0 ? MATE : -MATE) : l.cp);
    const ev = l.mate != null ? `${cpW > 0 ? '+' : '−'}M${Math.abs(l.mate)}` : fmtEval(cpW);
    const sans = uciLineToSan(fen, l.pv, 8);
    let txt = '';
    sans.forEach((san, i) => {
      const isW = white ? i % 2 === 0 : i % 2 === 1;
      const n = fullMove + Math.floor((i + (white ? 0 : 1)) / 2);
      if (isW) txt += `${n}. ${san} `;
      else txt += i === 0 ? `${n}… ${san} ` : `${san} `;
    });
    return `<button type="button" class="line" data-action="line-play" data-uci="${esc(l.pv[0] || '')}" aria-label="Jugar ${esc(sans[0] || '')}, evaluación ${esc(ev)}"><span class="ev ${cpW < 0 ? 'neg' : ''}">${esc(ev)}</span><span class="pv">${esc(txt.trim())}</span></button>`;
  }).join('');
  const pct = Math.min(100, Math.round((e.depth / LIVE_MAX_DEPTH) * 100));
  return `<div class="lines">${rows}</div><div class="depthbar" aria-hidden="true"><i style="width:${pct}%"></i></div><p class="sub">Profundidad ${e.depth}${e.done ? ' (completa)' : '…'} · toca una línea para jugar su primera jugada.</p>`;
}

/** Repinta solo el panel y la barra de evaluación, sin rehacer toda la página. */
export function paintLive() {
  lastPaint = Date.now();
  const panel = document.getElementById('live-lines');
  if (!panel || !curFen) return;
  const fen = curFen.split('|')[0];
  patchHTML(panel, linesInner(fen));
  const cp = liveEvalWhite(fen);
  const bar = document.querySelector<HTMLElement>('.evalbar');
  if (bar && cp != null) {
    // Se actualiza en el sitio (sin recrear la barra) para que no parpadee.
    const tmp = document.createElement('div');
    tmp.innerHTML = evalBarHTML(cp, bar.classList.contains('flip'));
    const nw = tmp.firstElementChild as HTMLElement;
    const wEl = bar.querySelector<HTMLElement>('.ev-w'), tEl = bar.querySelector<HTMLElement>('.ev-t');
    if (wEl) wEl.style.height = (nw.querySelector<HTMLElement>('.ev-w')?.style.height) || wEl.style.height;
    if (tEl) { const nt = nw.querySelector('.ev-t')!; tEl.textContent = nt.textContent; tEl.className = nt.className; }
    bar.setAttribute('aria-label', nw.getAttribute('aria-label') || '');
  }
}

/** Tras un render completo: repinta con lo que haya (mantiene el panel al día). */
export function livePanel(fen: string): string {
  ensureLive(fen);
  return `<div id="live-lines" aria-live="off">${linesInner(fen)}</div>`;
}

