// Estructura de la aplicación: navegación, rutas, eventos y arranque.
import { backupFileName, buildBackup, parseBackup, BackupError } from '../storage/backup';
import { createStore } from '../storage/db';
import type { Settings } from '../types';
import { boardKey, replay as replayFn } from './board';
import { ALGO_VERSION, retagGame } from '../core/analysis';
import { $, download, esc, patchHTML } from './dom';
import { ensurePlan, resetCycle, reviewedGame, toggleTask } from './planctl';
import { cancelRun, liveEngine, paintProgress, startImport } from './runner';
import { S, applyTheme, markActivity, message, onRender, render, saveSettings, toast } from './state';
import { moveSound, sound } from './sound';
import { stopLive } from './live';
import { ico } from './icons';
import { OPENING_PLIES, allItems, filterItems } from '../core/drills';
import { cloudConfigured, initCloud, pullBackup, pushNow, refreshStorageInfo, requestPersistence } from './cloudctl';
import { CloudError, newSyncCode } from '../storage/cloud';
import { vGames, vReview, errorNav, exploreBack, playBest, playLine } from './views/games';
import { vPuzzles, startPuzzleSession, puzzleNext, puzzleSkip, puzzleRetryLoad } from './views/puzzles';
import { choosePromo, handleSquare, parseTyped, setCtl } from './interact';
import { clearEx, currentEx, exHint, exMove, exReveal, exRetry } from './exercise';
import { syncTarget, vHome } from './views/home';
import { vImport } from './views/import';
import { vPlan, vProgress } from './views/plan';
import { REPORT_TABS, vReport, type ReportTab } from './views/report';
import { vMore, vSettings } from './views/settings';
import { exitSession, extraPractice, moreSession, startFreeSession, startTaskSession, trainerNext, trainerSkip, vTrainer } from './views/trainer';

type RouteName = 'inicio' | 'informe' | 'partidas' | 'partida' | 'repaso' | 'puzzles' | 'plan' | 'progreso' | 'importar' | 'ajustes' | 'mas';
interface Route { name: RouteName; arg: string; q: URLSearchParams }

const NAMES: RouteName[] = ['inicio', 'informe', 'partidas', 'partida', 'repaso', 'puzzles', 'plan', 'progreso', 'importar', 'ajustes', 'mas'];

function parseRoute(): Route {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const [n, ...rest] = path.split('/');
  const name = (NAMES.includes(n as RouteName) ? n : 'inicio') as RouteName;
  return { name, arg: decodeURIComponent(rest.join('/')), q: new URLSearchParams(query) };
}

const NAV: { id: RouteName; label: string; mobile: boolean; match: RouteName[] }[] = [
  { id: 'inicio', label: 'Inicio', mobile: true, match: ['inicio'] },
  { id: 'plan', label: 'Plan', mobile: true, match: ['plan'] },
  { id: 'repaso', label: 'Repaso', mobile: true, match: ['repaso'] },
  { id: 'puzzles', label: 'Puzzles', mobile: true, match: ['puzzles'] },
  { id: 'partidas', label: 'Partidas', mobile: true, match: ['partidas', 'partida'] },
  { id: 'informe', label: 'Informe', mobile: false, match: ['informe'] },
  { id: 'progreso', label: 'Progreso', mobile: false, match: ['progreso'] },
  { id: 'importar', label: 'Importar', mobile: false, match: ['importar'] },
  { id: 'ajustes', label: 'Ajustes', mobile: false, match: ['ajustes'] },
];

const TITLES: Record<RouteName, string> = {
  inicio: 'Inicio', informe: 'Informe', partidas: 'Partidas', partida: 'Revisión de partida', repaso: 'Repaso de errores', puzzles: 'Puzzles', plan: 'Plan de estudio', progreso: 'Progreso', importar: 'Importar', ajustes: 'Ajustes', mas: 'Más',
};

let route: Route = parseRoute();
let lastKey = '';

function body(): string {
  switch (route.name) {
    case 'informe': return vReport((REPORT_TABS.some(([k]) => k === route.arg) ? route.arg : 'resumen') as ReportTab);
    case 'partidas': return vGames();
    case 'partida': return vReview(route.arg);
    case 'repaso': return vTrainer();
    case 'puzzles': return vPuzzles();
    case 'plan': return vPlan();
    case 'progreso': return vProgress();
    case 'importar': return vImport();
    case 'ajustes': return vSettings();
    case 'mas': return vMore();
    default: return vHome();
  }
}

function runbar(): string {
  const r = S.run;
  if (!r || route.name === 'importar') return '';
  const pct = r.total ? Math.min(100, Math.round((r.done / r.total) * 100)) : 0;
  return `<a class="runbar" href="#/importar" aria-label="Analizando tus partidas, ${pct}%. Ir a Importar"><span>Analizando… ${pct}%</span><span class="rb-track" aria-hidden="true"><div style="width:${pct}%"></div></span></a>`;
}

function shell(content: string): string {
  const item = (n: (typeof NAV)[number]) => `<a class="nav-item" href="#/${n.id}" ${n.match.includes(route.name) ? 'aria-current="page"' : ''}>${ico(n.id)}<span>${n.label}</span></a>`;
  const moreActive = ['informe', 'progreso', 'importar', 'ajustes', 'mas'].includes(route.name);
  return `<div class="shell">
    <aside class="side"><a class="brand" href="#/inicio" aria-label="ChessGOAT, inicio"><img class="logo" src="${import.meta.env.BASE_URL}logo.png" alt="" width="34" height="34"><span>Chess<b>GOAT</b></span></a>
      <nav aria-label="Navegación principal" style="display:flex;flex-direction:column;gap:6px">${NAV.map(item).join('')}</nav><div class="spacer"></div></aside>
    <div class="main-col">${runbar()}
      <header class="topbar"><a class="brand" href="#/inicio" aria-label="ChessGOAT, inicio"><img class="logo" src="${import.meta.env.BASE_URL}logo.png" alt="" width="34" height="34"><span>Chess<b>GOAT</b></span></a>
        <div style="display:flex;align-items:center;gap:12px"><span class="who">${esc(S.settings.user || 'Sin usuario')} · ${S.recs.length} partidas</span>
          <button class="btn small" data-action="toggle-theme" aria-label="Cambiar entre tema claro y oscuro">◐ Tema</button></div></header>
      <main id="main" tabindex="-1">${content}</main>
      <footer class="foot"><span>Análisis con <strong>Stockfish 18</strong> (stockfish.js lite) en tu dispositivo. Tus partidas no salen de tu navegador.</span>
        <span>Stockfish © los desarrolladores de Stockfish · stockfish.js © Chess.com, LLC · Licencia <a href="${import.meta.env.BASE_URL}engine/LICENSE-GPL3.txt" target="_blank" rel="noopener">GPL-3.0</a> · <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noopener noreferrer">Código fuente</a></span>
        <span>Piezas de Colin M. L. Burnett (CC BY-SA 3.0) · Esta aplicación es software libre bajo GPL-3.0.</span></footer></div>
    <nav class="bottom" aria-label="Navegación principal">${NAV.filter((n) => n.mobile).map(item).join('')}<a class="nav-item" href="#/mas" ${moreActive ? 'aria-current="page"' : ''}>${ico('mas')}<span>Más</span></a></nav>
    <div class="toasts" role="status" aria-live="polite">${S.toasts.map((t) => `<div class="toast">${esc(t.text)}</div>`).join('')}</div></div>`;
}

const focusKey = (el: Element | null): string => {
  if (!(el instanceof HTMLElement)) return '';
  const d = el.dataset;
  if (d.fk) return 'fk:' + d.fk;
  if (d.sq && el.closest('[data-board]')) return 'sq:' + d.sq;
  if (d.action) return 'a:' + d.action + ':' + (d.v ?? d.d ?? d.id ?? d.ply ?? d.k ?? d.key ?? d.tag ?? '');
  return '';
};

function doRender() {
  const app = $('#app')!;
  const active = document.activeElement;
  const prev = focusKey(active);
  const caret = active instanceof HTMLInputElement && prev === 'fk:q' ? active.selectionStart : null;
  const key = route.name + '/' + route.arg;
  const changed = key !== lastKey;
  lastKey = key;
  const scrollY = window.scrollY;
  const prevEx = document.querySelector('[data-exid]')?.getAttribute('data-exid') ?? null;
  setCtl(null);
  if (route.name !== 'partida') stopLive();
  if (changed) app.innerHTML = shell(body());
  else patchHTML(app, shell(body()));
  document.querySelector('.rtab[aria-current]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  S.anim = null;
  document.title = TITLES[route.name] + ' · ChessGOAT';
  if (changed) {
    window.scrollTo(0, 0);
    $('#main')?.focus({ preventScroll: true });
  } else {
    // Un ejercicio nuevo empieza desde arriba; si no, se conserva la posición.
    const nowEx = document.querySelector('[data-exid]')?.getAttribute('data-exid') ?? null;
    window.scrollTo(0, nowEx !== prevEx ? 0 : scrollY);
    if (prev) {
      const el = [...app.querySelectorAll<HTMLElement>('[data-fk],[data-sq],[data-action]')].find((e) => focusKey(e) === prev);
      el?.focus({ preventScroll: true });
      if (el instanceof HTMLInputElement && caret != null) el.setSelectionRange(caret, caret);
    }
  }
  if (route.name === 'partida') {
    const list = document.getElementById('movelist');
    const cur = list?.querySelector<HTMLElement>('[data-cur="true"]');
    if (list && cur) list.scrollTop = cur.offsetTop - list.clientHeight / 2;
  }
  if (S.run) paintProgress();
}

function moveSoundFor(rec: { moves: { s: string; c?: string }[] }, ply: number) {
  const m = rec.moves[ply - 1];
  const san = m?.s || '';
  // Brillante o genial: el "meee" de la cabra en lugar del sonido normal de la jugada.
  if (m?.c === 'k') { sound('goat'); return; }
  if (m?.c === 'h') { sound('goatShort'); return; }
  moveSound({ captured: san.includes('x'), check: san.includes('+') || san.includes('#') });
}

let playTimer: ReturnType<typeof setInterval> | null = null;
function stopPlay() {
  if (playTimer) clearInterval(playTimer);
  playTimer = null;
  S.playing = false;
}

async function applyRoute() {
  route = parseRoute();
  stopPlay();
  S.flip = null;
  S.drag = null;
  S.sel = null;
  S.promo = null;
  S.explore = null;
  if (route.name === 'partida') {
    if (S.live) void liveEngine().catch(() => undefined);
    const rec = S.recs.find((g) => g.id === route.arg);
    const p = route.q.get('p');
    S.ply = p ? +p || 0 : rec && rec.first != null ? rec.first + 1 : 0;
    S.alt = !!rec && !!p && !!rec.moves[S.ply - 1]?.b && (rec.moves[S.ply - 1].c === 'x' || rec.moves[S.ply - 1].c === 'm');
    if (rec) {
      void markActivity();
      void reviewedGame(rec.id);
    }
  }
  if (route.name === 'repaso' || route.name === 'puzzles') {
    const task = route.q.get('task');
    const want = route.name === 'repaso' ? 'mine' : 'puzzle';
    if (task) startTaskSession(task);
    else if (S.session && (!route.q.has('keep') || S.session.kind !== want)) { S.session = null; clearEx(); }
    const ce = currentEx();
    if (ce && ce.kind !== want) clearEx();
  } else {
    S.session = null;
    clearEx();
  }
  if (route.name === 'plan' || route.name === 'inicio') await ensurePlan();
  doRender();
}

function goRepaso() {
  const target = '#/repaso?keep=1';
  if (location.hash === target) render();
  else location.hash = target;
}

// ---------- acciones ----------
const NUMERIC = ['n', 'depth', 'cores', 'minutes', 'target'];
const clamp = (v: number, a: number, b: number, d: number) => (Number.isFinite(v) ? Math.max(a, Math.min(b, Math.round(v))) : d);

/** Partidas guardadas con un algoritmo anterior: se reetiquetan sin motor con la lógica nueva (intercambios y recapturas). */
async function migrateGames() {
  let n = 0;
  S.recs = await Promise.all(S.recs.map(async (g) => {
    if ((g.v ?? 1) >= ALGO_VERSION) return g;
    const ng = retagGame(g);
    n++;
    await S.store?.saveGame(ng);
    return ng;
  }));
  if (n) toast(`Actualicé las etiquetas de ${n} partidas guardadas con el análisis de intercambios mejorado.`, 5000);
}

async function loadData() {
  const d = await S.store!.loadAll();
  S.recs = d.games;
  await migrateGames();
  if (d.settings) S.settings = { ...S.settings, ...d.settings, cores: d.settings.cores || S.settings.cores };
  S.trainer = new Map(d.trainer.map((t) => [t.key, t]));
  S.activity = new Set(d.activity);
  S.plan = d.plan;
  S.live = S.settings.liveOn;
  applyTheme();
}

function step(d: number) {
  const rec = S.recs.find((g) => g.id === route.arg);
  if (!rec) return;
  if (S.explore && d === -1) { exploreBack(); return; }
  S.explore = null;
  if (d === 1 && S.ply < rec.moves.length) {
    const l = lastMoveAt(rec, S.ply + 1);
    if (l) S.anim = l;
    moveSoundFor(rec, S.ply + 1);
  }
  S.ply = Math.max(0, Math.min(rec.moves.length, d <= -999 ? 0 : d >= 999 ? rec.moves.length : S.ply + d));
  S.alt = false;
  render();
}

function lastMoveAt(rec: { moves: { s: string }[] }, ply: number) {
  return replayFn(rec.moves.slice(0, ply)).lm[ply] ?? null;
}

/** Al saltar a una jugada brillante o genial suena la cabra. */
function goatAt(rec: { moves: { c?: string }[] }, ply: number) {
  const c = rec.moves[ply - 1]?.c;
  if (c === 'k') sound('goat');
  else if (c === 'h') sound('goatShort');
}

function gotoError(dir: 1 | -1) {
  const rec = S.recs.find((g) => g.id === route.arg);
  if (!rec) return;
  const t = errorNav(rec, S.ply, dir);
  if (t == null) return;
  S.ply = t;
  S.alt = true;
  render();
}

function togglePlay() {
  const rec = S.recs.find((g) => g.id === route.arg);
  if (!rec) return;
  if (S.playing) { stopPlay(); render(); return; }
  if (S.ply >= rec.moves.length) S.ply = 0;
  S.playing = true;
  S.alt = false;
  playTimer = setInterval(() => {
    if (S.ply >= rec.moves.length) { stopPlay(); render(); return; }
    S.ply++;
    const l = lastMoveAt(rec, S.ply);
    if (l) S.anim = l;
    moveSoundFor(rec, S.ply);
    render();
  }, 900);
  render();
}

async function onAction(el: HTMLElement, ev: Event) {
  const d = el.dataset;
  switch (d.action) {
    case 'window': await saveSettings({ window: +d.v! as Settings['window'] }); await ensurePlan(); render(); break;
    case 'ply': { stopPlay(); S.ply = +d.ply!; S.alt = false; const rc = S.recs.find((g) => g.id === route.arg); if (rc) goatAt(rc, S.ply); render(); break; }
    case 'step': stopPlay(); step(+d.d!); break;
    case 'alt': S.alt = !S.alt; render(); break;
    case 'help-toggle': S.help = !S.help; render(); break;
    case 'pat-filter': S.patFilter = d.v || ''; render(); break;
    case 'alt-on': S.alt = true; render(); break;
    case 'flip': { const rec = S.recs.find((g) => g.id === route.arg); const cur = S.flip ?? rec?.color === 'b'; S.flip = !cur; render(); break; }
    case 'play': togglePlay(); break;
    case 'goto-err': stopPlay(); gotoError(+d.d! as 1 | -1); break;
    case 'practice': {
      startFreeSession('Practicar esta posición', { itemKey: d.key }, 1);
      goRepaso();
      break;
    }
    case 'day': S.selDay = +d.d!; render(); break;
    case 'task-toggle': await toggleTask(d.id!); break;
    case 'plan-refresh': await ensurePlan(true); toast('Plan actualizado con tus datos.'); render(); break;
    case 'plan-reset': await resetCycle(); render(); break;
    case 'show-list': document.getElementById('lista')?.scrollIntoView({ behavior: 'smooth' }); break;
    case 'practice-tag': startFreeSession('Práctica: ' + (d.title || ''), { tag: d.tag as never }, 5); goRepaso(); break;
    case 'practice-pattern': startFreeSession('Patrón: ' + (d.title || ''), { patternKey: d.key }, 5); goRepaso(); break;
    case 'practice-opening': {
      const name = S.recs.map((g) => g.opening).find((o) => o.endsWith(d.name || '###'));
      const flt = { opening: name, maxPly: OPENING_PLIES };
      if (!filterItems(allItems(S.recs), flt).length) {
        // Sin errores en las primeras 10 jugadas: se lleva al usuario a la última partida con esa apertura.
        const last = [...S.recs].reverse().find((g) => g.opening === name);
        toast('No tienes errores graves en las primeras 10 jugadas de esa apertura: abro tu última partida.', 5000);
        if (last) location.hash = '#/partida/' + last.id;
        break;
      }
      startFreeSession('Apertura: ' + (d.name || '') + ' (primeras 10 jugadas)', flt, 5);
      goRepaso();
      break;
    }
    case 't-exit': exitSession(); if (!el.getAttribute('href')) { location.hash = '#/plan'; } break;
    case 't-more': moreSession(); break;
    case 'src': S.draft.tab = d.v as typeof S.draft.tab; S.draft.user = null; S.msg = ''; render(); break;
    case 'analyze': {
      const user = ($('#user') as HTMLInputElement | null)?.value ?? '';
      const file = ($('#file') as HTMLInputElement | null)?.files?.[0];
      let text = S.draft.pgn;
      if (file) { try { text = await file.text(); } catch { message('No pude leer el archivo.', 'err'); render(); break; } }
      await startImport({ source: S.draft.tab, user, pgnText: text });
      break;
    }
    case 'cancel': cancelRun(); break;
    case 'persist': { const ok = await requestPersistence(); toast(ok ? 'Almacenamiento persistente activado.' : 'El navegador no lo concedió. Instala la app o usa la copia en la nube.', 5000); render(); break; }
    case 'copy': { try { await navigator.clipboard.writeText(d.text || ''); toast('Copiado.'); } catch { toast('No pude copiar. Selecciónalo y cópialo a mano.'); } break; }
    case 'cloud-gen': await saveSettings({ cloudCode: newSyncCode() }); toast('Código nuevo generado. Guárdalo en un lugar seguro.'); render(); break;
    case 'cloud-push': await pushNow(); render(); break;
    case 'cloud-pull': {
      try {
        const r = await pullBackup();
        if (!r) { toast('Todavía no hay ninguna copia con ese código.'); break; }
        await S.store!.restore(r.backup, 'merge');
        await loadData();
        await ensurePlan();
        toast(`Copia descargada: ${r.backup.games.length} partidas (fusionadas con las tuyas).`, 5000);
      } catch (e) {
        toast(e instanceof CloudError || e instanceof BackupError ? e.message : 'No pude descargar la copia.', 6000);
      }
      render();
      break;
    }
    case 'sync': { const t = syncTarget(); if (t) { toast('Buscando partidas nuevas…'); await startImport({ source: t.source, user: t.user }); toast(S.msgKind === 'err' ? S.msg : S.msg || 'Listo'); } break; }
    case 'theme': await saveSettings({ theme: d.v as Settings['theme'] }); render(); break;
    case 'board-theme': await saveSettings({ boardTheme: d.v as Settings['boardTheme'] }); render(); break;
    case 'toggle-theme': {
      const dark = document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
      await saveSettings({ theme: dark ? 'light' : 'dark' });
      render();
      break;
    }
    case 'export': {
      download(backupFileName(), JSON.stringify(buildBackup(await S.store!.loadAll())));
      toast('Copia exportada.');
      break;
    }
    case 'clear':
      if (!S.confirmClear) { S.confirmClear = true; render(); break; }
      S.confirmClear = false;
      await S.store!.clearData();
      S.recs = []; S.trainer.clear(); S.activity.clear(); S.tr = null; S.plan = null; S.session = null;
      toast('Datos borrados.');
      render();
      break;
    case 'ex-next': if (route.name === 'puzzles') puzzleNext(); else trainerNext(); break;
    case 'ex-skip': if (route.name === 'puzzles') puzzleSkip(); else trainerSkip(); break;
    case 'ex-retry': exRetry(); break;
    case 'ex-hint': exHint(); break;
    case 'ex-reveal': await exReveal(); break;
    case 't-extra': extraPractice(); break;
    case 'pz-start': startPuzzleSession(d.theme || 'mix'); render(); break;
    case 'pz-retry': puzzleRetryLoad(); break;
    case 'promo': choosePromo(d.p || ''); break;
    case 'ex-back': exploreBack(); break;
    case 'ex-close': S.explore = null; render(); break;
    case 'play-best': { const rec = S.recs.find((g) => g.id === route.arg); if (rec) playBest(rec); break; }
    case 'live': S.live = !S.live; await saveSettings({ liveOn: S.live }); render(); break;
    case 'live-lines': await saveSettings({ liveLines: +d.v! as 1 | 2 | 3 }); render(); break;
    case 'line-play': playLine(d.uci || ''); break;
    case 'evalhit': {
      const rec = S.recs.find((g) => g.id === route.arg);
      if (!rec || !(ev instanceof MouseEvent)) break;
      const r = el.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width;
      stopPlay();
      S.ply = Math.max(1, Math.min(rec.moves.length, Math.round(x * (rec.moves.length - 1)) + 1));
      S.alt = false;
      render();
      break;
    }
  }
}

async function onChange(el: HTMLElement) {
  const d = el.dataset;
  const val = (el as HTMLInputElement | HTMLSelectElement).value;
  if (d.action === 'setting' && d.k) {
    const k = d.k as keyof Settings;
    let v: string | number = val;
    if (NUMERIC.includes(k)) {
      const n = +val;
      v = k === 'cores' ? clamp(n, 1, 16, S.settings.cores) : k === 'target' ? clamp(n, 600, 2800, 1200) : k === 'n' ? Math.max(0, n) : n;
    }
    await saveSettings({ [k]: v } as Partial<Settings>);
    if (k === 'minutes') await ensurePlan();
    render();
  } else if (d.action === 'rclass') {
    S.reportClass = val;
    render();
  } else if (d.action === 'cloud-field' && d.k) {
    await saveSettings({ [d.k]: val.trim() } as Partial<Settings>);
    render();
  } else if (d.action === 'toggle' && d.k) {
    await saveSettings({ [d.k]: (el as HTMLInputElement).checked } as Partial<Settings>);
    render();
  } else if (d.action === 'filter' && d.k) {
    S.gameFilter[d.k as 'color' | 'result' | 'sort'] = val;
    render();
  } else if (d.action === 'import-backup') {
    const file = (el as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const b = parseBackup(await file.text());
      const how = ($('#replace') as HTMLInputElement | null)?.checked ? 'replace' : 'merge';
      const keep = { cloudUrl: S.settings.cloudUrl, cloudKey: S.settings.cloudKey, cloudCode: S.settings.cloudCode, cloudLast: S.settings.cloudLast };
      await S.store!.restore(b, how);
      await loadData();
      await saveSettings(keep);
      await ensurePlan();
      message(`Copia importada: ${b.games.length} partidas (${how === 'replace' ? 'reemplazando' : 'fusionando'}).`);
    } catch (e) {
      message(e instanceof BackupError ? e.message : 'No pude importar el archivo.', 'err');
    }
    render();
  }
}

// ---------- arrastrar y soltar piezas en el repaso ----------
let drag: { from: string; ghost: HTMLElement | null; svg: SVGElement; x: number; y: number } | null = null;

/** El arrastre solo empieza al mover el dedo o el ratón unos píxeles: un toque normal no dibuja ninguna pieza flotante. */
function bindDrag() {
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Element;
    const sq = t.closest?.<HTMLElement>('button.sq[data-sq]');
    if (!sq || e.button !== 0) return;
    e.preventDefault();
    const name = sq.dataset.sq!;
    const hadPiece = !!sq.querySelector('.pc');
    const svg = sq.querySelector('.pc')?.cloneNode(true) as SVGElement | undefined;
    handleSquare(name);
    if (hadPiece && svg && S.sel === name) drag = { from: name, ghost: null, svg, x: e.clientX, y: e.clientY };
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
      const ghost = document.createElement('div');
      ghost.className = 'ghost';
      ghost.appendChild(drag.svg);
      document.body.appendChild(ghost);
      drag.ghost = ghost;
      S.drag = drag.from;
      document.querySelector(`button.sq[data-sq="${drag.from}"]`)?.classList.add('drag');
    }
    drag.ghost.style.left = e.clientX + 'px';
    drag.ghost.style.top = e.clientY + 'px';
  });
  const end = (e: PointerEvent) => {
    if (!drag) return;
    const { from, ghost } = drag;
    drag = null;
    if (!ghost) return; // fue un toque, no un arrastre
    S.drag = null;
    ghost.remove();
    document.querySelector(`button.sq[data-sq="${from}"]`)?.classList.remove('drag');
    const to = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('button.sq[data-sq]');
    if (to && to.dataset.sq !== from && e.type === 'pointerup') handleSquare(to.dataset.sq!);
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
}

function bindEvents() {
  const app = $('#app')!;
  app.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('select, input, textarea, label.btn')) return;
    const sq = t.closest<HTMLElement>('button.sq[data-sq]');
    if (sq) { if (e.detail === 0) handleSquare(sq.dataset.sq!); return; } // el ratón y el tacto se gestionan con pointerdown
    const go = t.closest<HTMLElement>('[data-go]');
    if (go) { S.ply = 0; location.hash = '#/partida/' + go.dataset.go; return; }
    const el = t.closest<HTMLElement>('[data-action]');
    if (el && !['setting', 'toggle', 'cloud-field', 'rclass', 'filter', 'filter-q', 'import-backup', 'ex-typed'].includes(el.dataset.action!)) void onAction(el, e);
  });
  app.addEventListener('change', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (el) void onChange(el);
  });
  app.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'pgn') S.draft.pgn = t.value;
    if (t.id === 'user') S.draft.user = t.value;
    if (t.dataset.action === 'filter-q') { S.gameFilter.q = t.value; render(); }
  });
  app.addEventListener('submit', (e) => {
    const f = e.target as HTMLFormElement;
    if (f.dataset.action === 'ex-typed') {
      e.preventDefault();
      const ce = currentEx();
      if (!ce) return;
      const mv = parseTyped(ce.pz.fen, String(new FormData(f).get('san') || ''));
      if (mv) void exMove(mv.from, mv.to, mv.promotion);
      else toast('Esa jugada no es válida en esta posición.');
    }
  });
  app.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('button.sq[data-sq]')) S.focusSq = t.dataset.sq!;
  });
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('button.sq[data-sq]') && boardKey(e, t)) { e.preventDefault(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && t.matches('svg .pt')) { e.preventDefault(); t.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
    if (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape' && (S.sel || S.promo)) { S.sel = null; S.promo = null; render(); e.preventDefault(); return; }
    if (route.name === 'repaso' || route.name === 'puzzles') {
      const ce = currentEx();
      if (!ce) return;
      if (k === 'h') exHint(); else if (k === 'r') exRetry(); else if (k === 's') void exReveal();
      else if (k === 'n' && (ce.pz.status === 'solved' || ce.pz.status === 'revealed')) { if (route.name === 'puzzles') puzzleNext(); else trainerNext(); }
      else return;
      e.preventDefault();
      return;
    }
    if (route.name !== 'partida' || (t.tagName === 'BUTTON' && e.key === ' ')) return;
    if (e.key === 'ArrowRight') { stopPlay(); step(1); } else if (e.key === 'ArrowLeft') { stopPlay(); step(-1); }
    else if (e.key === 'Home') { stopPlay(); step(-999); } else if (e.key === 'End') { stopPlay(); step(999); }
    else if (e.key === ' ') togglePlay();
    else if (k === 'f') { const rec = S.recs.find((g) => g.id === route.arg); S.flip = !(S.flip ?? rec?.color === 'b'); render(); }
    else if (k === 'b') { S.alt = !S.alt; render(); }
    else if (k === 'l') { S.live = !S.live; void saveSettings({ liveOn: S.live }); render(); }
    else if (e.key === '[') { stopPlay(); gotoError(-1); } else if (e.key === ']') { stopPlay(); gotoError(1); }
    else return;
    e.preventDefault();
  });
  const tip = $('#tip')!;
  document.addEventListener('pointerover', (e) => {
    const t = (e.target as Element).closest?.('[data-tip]') as HTMLElement | null;
    if (!t || !t.dataset.tip) { tip.style.display = 'none'; return; }
    tip.textContent = t.dataset.tip;
    tip.style.display = 'block';
  });
  document.addEventListener('pointermove', (e) => {
    if (tip.style.display === 'block') { tip.style.left = Math.min(window.innerWidth - 250, e.clientX + 12) + 'px'; tip.style.top = e.clientY + 14 + 'px'; }
  });
  document.addEventListener('pointerout', (e) => {
    const r = e.relatedTarget as Element | null;
    if (!r || !r.closest?.('[data-tip]')) tip.style.display = 'none';
  });
  window.addEventListener('hashchange', () => void applyRoute());
  bindDrag();
}

export async function start() {
  onRender(doRender);
  bindEvents();
  doRender();
  S.store = await createStore();
  try { await loadData(); } catch { message('No pude cargar tus datos guardados.', 'err'); }
  S.draft.tab = S.settings.source;
  // Si este navegador está vacío pero hay una copia en la nube configurada, se recupera sola.
  if (!S.recs.length && cloudConfigured()) {
    try {
      const r = await pullBackup();
      if (r && r.backup.games.length) {
        await S.store!.restore(r.backup, 'merge');
        await loadData();
        toast(`Recuperé ${r.backup.games.length} partidas desde tu copia en la nube.`, 5000);
      }
    } catch { /* sin conexión o sin copia */ }
  }
  initCloud();
  void refreshStorageInfo().then(() => { if (route.name === 'ajustes') render(); });
  S.ready = true;
  if (!S.recs.length && (!location.hash || route.name === 'inicio')) location.replace('#/importar');
  route = parseRoute();
  await applyRoute();
}
