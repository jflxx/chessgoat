// Ejercicio en el tablero, común al repaso de tus errores y a los puzzles de Lichess.
// La jugada se hace de verdad: la pieza se mueve, el rival responde y se puede reintentar.
import { MATE, PIECE_ES, TAG_ES, winPct } from '../core/analysis';
import type { DrillItem } from '../core/drills';
import { explainMove } from '../core/explain';
import { acceptAlternative, applyUci, cleanSolve, finished, hint, newPuzzle, playRefutation, playReply, playUser, retry, reveal, revealStep, turnOf, updateRating, type PState, type PuzzleSpec } from '../core/puzzle';
import type { Cls } from '../types';
import { boardHTML, type Arrow } from './board';
import { esc } from './dom';
import { setCtl, selectionProps } from './interact';
import { trainerEngine } from './runner';
import { moveSound, sound } from './sound';
import { S, render, saveSettings } from './state';

export interface Ex {
  kind: 'mine' | 'puzzle';
  pz: PState;
  item?: DrillItem;
  flip: boolean;
  msg: { kind: 'ok' | 'bad' | 'info'; title: string; text: string } | null;
  busy: boolean;
  badge: { sq: string; cls: Cls } | null;
  hint: string[];
  arrows: Arrow[];
  recorded: boolean;
  /** Se incrementa al reintentar o pedir ayuda: invalida comprobaciones del motor pendientes. */
  seq: number;
  /** Se llama una vez al terminar: limpio = a la primera, sin pistas. */
  onResult: (clean: boolean) => Promise<void> | void;
  ratingDelta?: number;
  /** Mientras no es null se muestra la posición anterior a la última jugada del rival (que se juega a continuación). */
  introFen: string | null;
}

let ex: Ex | null = null;
export const currentEx = () => ex;
export const clearEx = () => { ex = null; setCtl(null); };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let exSerial = 0;

export function loadExercise(kind: Ex['kind'], spec: PuzzleSpec, onResult: Ex['onResult'], item?: DrillItem) {
  const pz = newPuzzle(spec);
  exSerial++;
  ex = { kind, pz, item, flip: turnOf(spec.fen) === 'b', msg: null, busy: false, badge: null, hint: [], arrows: [], recorded: false, seq: 0, onResult, introFen: null };
  if (spec.prevFen && spec.lastMove) {
    const e = ex;
    e.introFen = spec.prevFen;
    e.busy = true;
    e.msg = { kind: 'info', title: 'Mira la jugada del rival', text: 'Primero se juega su última jugada…' };
    void playIntro(e);
  }
  prewarm(item);
  S.sel = null;
  S.promo = null;
  if (spec.lastMove && !spec.prevFen) S.anim = { from: spec.lastMove.slice(0, 2), to: spec.lastMove.slice(2, 4) };
}

/** Al entrar se ve la posición anterior y se juega la última jugada del rival, para no perderse nada (un peón que avanza dos casillas, un jaque…). */
async function playIntro(e: Ex) {
  const u = e.pz.spec.lastMove!;
  const r = applyUci(e.introFen!, u);
  await sleep(1000);
  if (ex !== e) return;
  e.introFen = null;
  S.anim = { from: u.slice(0, 2), to: u.slice(2, 4) };
  if (r) moveSound(r);
  e.msg = r ? { kind: 'info', title: `El rival acaba de jugar ${r.san}`, text: 'Ahora te toca a ti.' } : null;
  e.busy = false;
  render();
}

/** Calienta el motor y prepara la evaluación previa para que la primera comprobación no espere. */
function prewarm(item?: DrillItem) {
  void trainerEngine().catch(() => undefined);
  if (item) void beforeEval(item, CHECK_DEPTH).catch(() => undefined);
}

async function finish(clean: boolean) {
  if (!ex || ex.recorded) return;
  ex.recorded = true;
  await ex.onResult(clean);
}

async function success(alt = false) {
  if (!ex) return;
  const e = ex;
  const clean = cleanSolve(e.pz) || (alt && e.pz.attempts <= 1 && e.pz.hints === 0);
  e.badge = e.pz.last ? { sq: e.pz.last.to, cls: 'b' } : null;
  e.hint = [];
  e.arrows = [];
  sound(clean ? 'done' : 'good');
  if (e.kind === 'mine' && e.item) {
    const m = e.item.m;
    e.msg = { kind: 'ok', title: alt ? 'También funciona' : clean ? '¡Correcto!' : e.pz.hints ? 'Resuelto con ayuda' : 'Resuelto al reintentar', text: `${alt ? `El motor prefería ${m.bs || 'otra'}, pero tu jugada mantiene la ventaja. ` : ''}En la partida jugaste ${m.s}. ${explainMove(m)}` };
  } else {
    e.msg = { kind: 'ok', title: clean ? '¡Puzzle resuelto!' : e.pz.hints ? 'Resuelto con ayuda' : 'Resuelto al reintentar', text: e.pz.spec.rating ? `Puzzle de ${e.pz.spec.rating} de puntuación.` : '' };
  }
  await finish(clean);
  render();
}

/** Jugada del usuario (clic, arrastre, teclado o texto). */
export async function exMove(from: string, to: string, promotion?: string) {
  const e = ex;
  if (!e || e.busy || e.pz.status !== 'play') return;
  const uci = from + to + (promotion || '');
  const out = playUser(e.pz, uci);
  if (out.kind === 'illegal') { render(); return; }
  S.anim = { from, to };
  e.hint = [];
  e.arrows = [];
  e.badge = null;
  moveSound(out);
  if (out.kind === 'correct') {
    if (out.done) { await success(); return; }
    e.msg = { kind: 'ok', title: 'Bien', text: `${out.san} es correcto. Sigue.` };
    e.busy = true;
    render();
    await sleep(500);
    const r = playReply(e.pz);
    e.busy = false;
    if (r) { S.anim = { from: r.from, to: r.to }; moveSound(r); e.msg = { kind: 'info', title: `El rival juega ${r.san}`, text: 'Te toca: encuentra la continuación.' }; }
    if ((e.pz.status as string) === 'solved') { await success(); return; }
    render();
    return;
  }
  // Incorrecta: se queda en el tablero, marcada. No se bloquea nada: se puede reintentar, pedir pista o ver la solución
  // mientras el motor comprueba la jugada en segundo plano.
  e.badge = { sq: to, cls: 'x' };
  e.msg = { kind: 'info', title: `Has jugado ${out.san}`, text: 'Comprobando con el motor…' };
  const token = ++e.seq;
  sound('bad');
  render();
  void verifyWrong(e, token, out.san);
}

const beforeCache = new Map<string, Promise<number>>();

/** Evaluación (para quien mueve) de la posición previa a la jugada, a la misma profundidad que la posterior. */
function beforeEval(it: DrillItem, depth: number): Promise<number> {
  const key = it.key + '|' + depth;
  let p = beforeCache.get(key);
  if (!p) {
    p = trainerEngine().then((eng) => eng.analyse(it.fen, depth)).then((a) => (a.mate != null ? (a.mate > 0 ? MATE : -MATE) : a.cp));
    p.catch(() => beforeCache.delete(key));
    beforeCache.set(key, p);
    if (beforeCache.size > 60) beforeCache.delete(beforeCache.keys().next().value!);
  }
  return p;
}

const CHECK_DEPTH = 12;

async function verifyWrong(e: Ex, token: number, san: string) {
  const live = () => ex === e && e.seq === token && e.pz.status === 'wrong';
  let reply: string | null = null;
  let lossTxt = '';
  try {
    const eng = await trainerEngine();
    const wrongFen = e.pz.fen;
    const [after, cpA] = await Promise.all([
      eng.analyse(wrongFen, CHECK_DEPTH),
      e.kind === 'mine' && e.item ? beforeEval(e.item, CHECK_DEPTH) : Promise.resolve(0),
    ]);
    if (!live()) return;
    reply = after.pv[0] || null;
    if (e.kind === 'mine' && e.item) {
      // Misma profundidad antes y después: así la comparación es justa y no penaliza jugadas casi igual de buenas.
      const cpB = -(after.mate != null ? (after.mate > 0 ? MATE : -MATE) : after.cp);
      const loss = winPct(cpA) - winPct(cpB);
      if (loss <= ALT_LOSS && san !== e.item.m.s) {
        acceptAlternative(e.pz);
        e.busy = false;
        await success(true);
        return;
      }
      lossTxt = loss > 0.5 ? ` pierde ${Math.round(loss)} puntos de ventaja` : '';
    }
  } catch { /* sin motor: sin refutación */ }
  if (!live()) return;
  const same = e.kind === 'mine' && san === e.item?.m.s;
  e.msg = { kind: 'bad', title: same ? 'Es la misma jugada de la partida' : 'No es la mejor', text: `${san}${lossTxt}.` };
  render();
  if (!reply) return;
  await sleep(450);
  if (!live()) return;
  const r = playRefutation(e.pz, reply);
  if (r) {
    S.anim = { from: r.from, to: r.to };
    moveSound(r);
    e.msg = { kind: 'bad', title: e.msg.title, text: `${san}${lossTxt}. El rival responde ${r.san}${r.mate ? ' y da jaque mate' : r.captured ? ' y gana material' : r.check ? ' con jaque' : ''}.` };
    render();
  }
}

/** Pérdida máxima (puntos de probabilidad de ganar) para aceptar una alternativa al error original. */
const ALT_LOSS = 8;

export function exRetry() {
  if (!ex || ex.busy) return;
  ex.seq++;
  retry(ex.pz);
  ex.badge = null;
  ex.msg = { kind: 'info', title: 'Inténtalo otra vez', text: 'La posición vuelve a como estaba.' };
  render();
}

export function exHint() {
  if (!ex || ex.busy) return;
  ex.seq++;
  if (ex.pz.status === 'wrong') retry(ex.pz);
  const h = hint(ex.pz);
  if (!h) return;
  ex.badge = null;
  ex.hint = [h.from];
  ex.arrows = h.to ? [{ from: h.from, to: h.to, kind: 'hint' }] : [];
  ex.msg = { kind: 'info', title: h.to ? 'Pista: la jugada' : 'Pista: la pieza', text: h.to ? 'La flecha muestra la jugada.' : 'Mueve la pieza marcada.' };
  render();
}

export async function exReveal() {
  const e = ex;
  if (!e || e.busy || finished(e.pz)) return;
  e.seq++;
  reveal(e.pz);
  e.badge = null;
  e.hint = [];
  e.arrows = [];
  e.busy = true;
  e.msg = { kind: 'info', title: 'Solución', text: '' };
  render();
  const sans: string[] = [];
  let r;
  while ((r = revealStep(e.pz))) {
    await sleep(sans.length ? 650 : 250);
    S.anim = { from: r.from, to: r.to };
    moveSound(r);
    sans.push(r.san);
    e.msg = { kind: 'info', title: 'Solución', text: sans.join(' ') + (e.kind === 'mine' && e.item ? `. En la partida jugaste ${e.item.m.s}. ${explainMove(e.item.m)}` : '') };
    render();
  }
  e.badge = e.pz.last ? { sq: e.pz.last.to, cls: 'b' } : null;
  e.busy = false;
  await finish(false);
  render();
}

export interface ExView { header: string; side?: string; next: string; links?: string }

export function exerciseHTML(v: ExView): string {
  const e = ex;
  if (!e) return '';
  const pz = e.pz;
  const canMove = pz.status === 'play' && !e.busy;
  setCtl({ fen: () => ex?.pz.fen ?? null, canMove: () => !!ex && ex.pz.status === 'play' && !ex.busy, onMove: (f, t, p) => void exMove(f, t, p) });
  const selp = canMove ? selectionProps(pz.fen) : { sel: null, targets: [], captures: [] };
  const turn = turnOf(pz.fen);
  const myTurn = turnOf(pz.spec.fen);
  const board = boardHTML(e.introFen ?? pz.fen, {
    flip: e.flip, last: e.introFen ? null : pz.last, arrows: e.arrows, badge: e.badge, hint: e.hint, interactive: true, locked: !canMove, focusSq: S.focusSq, dragging: S.drag,
    anim: S.settings.animations ? S.anim : null, promo: S.promo ? { color: turn } : null, ...selp,
    label: `Posición del ejercicio. ${turn === 'w' ? 'Juegan blancas' : 'Juegan negras'}.`,
  });
  const fb = e.msg ? `<div class="feedback ${e.msg.kind}" role="status" aria-live="polite"><span class="ic" aria-hidden="true">${e.msg.kind === 'ok' ? '✓' : e.msg.kind === 'bad' ? '✗' : '…'}</span><div><strong>${esc(e.msg.title)}</strong>${e.msg.text ? `<p class="sub">${esc(e.msg.text)}</p>` : ''}${e.ratingDelta != null && e.kind === 'puzzle' && finished(pz) ? `<p class="sub">Tu puntuación de puzzles: ${S.settings.puzzleRating} (${e.ratingDelta >= 0 ? '+' : ''}${e.ratingDelta})</p>` : ''}</div></div>`
    : `<div class="feedback info" role="status" aria-live="polite"><span class="ic" aria-hidden="true">${myTurn === 'w' ? '♔' : '♚'}</span><div><strong>${myTurn === 'w' ? 'Juegan blancas' : 'Juegan negras'}</strong><p class="sub">${v.side || 'Encuentra la mejor jugada.'}</p></div></div>`;
  let btns: string;
  if (finished(pz)) btns = `<button class="btn primary" data-action="ex-next" data-fk="ex-next">${v.next}</button>${v.links || ''}`;
  else if (pz.status === 'wrong') btns = `<button class="btn primary" data-action="ex-retry" data-fk="ex-retry" ${e.busy ? 'disabled' : ''}>Reintentar</button><button class="btn" data-action="ex-hint" ${e.busy ? 'disabled' : ''}>Pista</button><button class="btn" data-action="ex-reveal" ${e.busy ? 'disabled' : ''}>Ver solución</button>`;
  else btns = `<button class="btn" data-action="ex-hint" ${e.busy ? 'disabled' : ''}>Pista${pz.hintStep === pz.step && pz.stepHints ? ` (${pz.stepHints}/2)` : ''}</button><button class="btn" data-action="ex-reveal" ${e.busy ? 'disabled' : ''}>Ver solución</button><button class="btn" data-action="ex-skip" ${e.busy ? 'disabled' : ''}>Saltar</button>`;
  return `<div class="trainer" data-exid="${exSerial}"><div><div class="pstrip"><span class="turn"><i class="${turn}" aria-hidden="true"></i>${turn === 'w' ? 'Juegan blancas' : 'Juegan negras'}</span>${pz.played.length ? `<span class="sub">${esc(pz.played.join(' '))}</span>` : ''}</div>${board}</div>
    <div style="display:flex;flex-direction:column;gap:12px;min-width:0"><section class="card">${v.header}${fb}
      <div class="row tight exbtns">${btns}</div>
      ${canMove ? '<form class="row hide-m" data-action="ex-typed" autocomplete="off"><label class="f">O escribe la jugada (Cf3, e4, exd5…)<input type="text" name="san" autocapitalize="off" spellcheck="false" data-fk="san"></label><button class="btn" type="submit" style="flex:0 0 auto">Jugar</button></form>' : ''}
      <p class="sub hide-m">Arrastra o toca la pieza y su destino. Teclado: flechas y Enter en el tablero · <span class="kbd">H</span> pista · <span class="kbd">R</span> reintentar · <span class="kbd">S</span> solución · <span class="kbd">N</span> siguiente</p></section></div></div>`;
}

/** Contexto de un error propio para mostrar encima. */
export function mineContext(item: DrillItem): string {
  const m = item.m;
  const what = m.p ? TAG_ES[m.p].toLowerCase() : 'un error';
  const lost = m.k && m.p === 'pieza_colgada' ? ` y perdiste ${PIECE_ES[m.k]}` : '';
  return `En tu partida contra ${esc(item.rec.opp)} jugaste ${esc(m.s)} aquí (${esc(what)}${lost}). ¿Qué era mejor?`;
}

/** Actualiza la puntuación de puzzles tras uno de Lichess. */
export async function ratePuzzle(clean: boolean) {
  if (!ex || ex.kind !== 'puzzle') return;
  const before = S.settings.puzzleRating || 1500;
  const after = updateRating(before, ex.pz.spec.rating || before, clean ? 1 : 0);
  ex.ratingDelta = after - before;
  await saveSettings({ puzzleRating: after });
}
