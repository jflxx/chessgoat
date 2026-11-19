// Repaso de tus errores con repetición espaciada (cajas de 0, 1, 3, 7, 14 y 30 días) y sesiones del plan.
import { BOX_DAYS, allItems, filterItems, queue as buildQueue, type DrillFilter, type DrillItem } from '../../core/drills';
import { esc } from '../dom';
import { bumpTrainer } from '../daily';
import { clearEx, currentEx, exerciseHTML, loadExercise, mineContext } from '../exercise';
import { recordDrill, taskById } from '../planctl';
import { S, markActivity, render, type Session } from '../state';
import { ico } from '../icons';
import { noGames } from './common';

const now = () => Date.now();

const pool = (): DrillItem[] => filterItems(allItems(S.recs), S.session?.kind === 'mine' ? S.session.filter : undefined);

/** Siguientes posiciones: en una sesión se admite práctica extra (no vencida), sin repetir las ya contestadas. */
function candidates(): DrillItem[] {
  const items = pool().filter((it) => !S.session?.answered.includes(it.key));
  return buildQueue(items, S.trainer, now(), !!S.session);
}

export const dueCount = () => buildQueue(allItems(S.recs), S.trainer, now()).length;

export function startSession(s: Omit<Session, 'answered' | 'correct' | 'finished'>) {
  S.session = { ...s, answered: [], correct: 0, finished: false };
  clearEx();
}

export function startTaskSession(taskId: string) {
  if (S.session?.taskId === taskId && !S.session.finished) return;
  const t = taskById(taskId);
  if (!t) return;
  const done = S.plan?.progress[taskId] ?? 0;
  startSession({ kind: t.kind === 'puzzle' ? 'puzzle' : 'mine', taskId, title: t.title, filter: t.filter, theme: t.theme, target: Math.max(1, t.target - done) });
}

export function startFreeSession(title: string, filter: DrillFilter, target = 5) {
  startSession({ kind: 'mine', title, filter, target });
}

async function recordMine(it: DrillItem, clean: boolean) {
  const st = S.trainer.get(it.key) || { key: it.key, box: 0, due: 0 };
  const wasDue = !S.trainer.has(it.key) || st.due <= now();
  // Práctica extra (no vencida): un acierto no sube de caja; un fallo sí la reinicia.
  st.box = clean ? (wasDue ? Math.min(BOX_DAYS.length - 1, st.box + 1) : st.box) : 0;
  st.due = clean && !wasDue ? st.due : now() + BOX_DAYS[st.box] * 86400000;
  S.trainer.set(it.key, st);
  await S.store?.saveTrainerItem(st);
  S.dirty = true;
  bumpTrainer();
  await markActivity();
  await sessionAnswered(it.key, clean);
}

/** Cuenta una respuesta en la sesión activa (repaso o puzzles). */
export async function sessionAnswered(key: string, clean: boolean) {
  const s = S.session;
  if (!s || s.answered.includes(key)) return;
  s.answered.push(key);
  if (clean) s.correct++;
  await recordDrill(s.taskId);
}

export function sessionBar(): string {
  const s = S.session;
  if (!s) return '';
  const n = Math.min(s.answered.length, s.target);
  const pct = Math.round((n / s.target) * 100);
  return `<section class="card"><div class="sessionbar"><div style="flex:1 1 220px"><strong>${esc(s.title)}</strong><div class="sub">${n} de ${s.target}${s.correct ? ` · ${s.correct} a la primera` : ''}</div></div>
    <div class="progress" role="progressbar" aria-label="Progreso de la sesión" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
    <button class="btn small" data-action="t-exit">Salir</button></div></section>`;
}

export function summaryHTML(extra = ''): string {
  const s = S.session!;
  const n = s.answered.length;
  const pct = n ? Math.round((s.correct / n) * 100) : 0;
  const t = taskById(s.taskId);
  return `<section class="card summary"><span class="bigico">${ico('progreso')}</span><h1>${n ? '¡Sesión terminada!' : 'No quedan ejercicios'}</h1>
    ${n ? `<div class="big">${s.correct}/${n}</div><p class="sub">${pct}% a la primera y sin pistas. ${pct >= 70 ? 'Vas muy bien con este tema.' : 'Lo que falles volverá antes a tu repaso.'}</p>` : '<p class="sub">Ya hiciste todos los ejercicios de este filtro.</p>'}
    ${t ? '<p class="pill good">Tarea del plan completada</p>' : ''}${extra}
    <div class="row tight"><a class="btn primary" href="#/plan" data-action="t-exit">Volver al plan</a><button class="btn" data-action="t-more">Seguir 5 más</button></div></section>`;
}

/** Carga el siguiente error propio en el tablero. */
function loadNext(): boolean {
  const q = candidates();
  if (!q.length) return false;
  const it = q[0];
  loadExercise('mine', { id: it.key, fen: it.fen, solution: [it.m.b!], source: 'mine' }, (clean) => recordMine(it, clean), it);
  return true;
}

export function vTrainer(): string {
  if (!S.recs.length) return noGames();
  const s = S.session;
  if (s?.finished) return summaryHTML();
  const total = pool().length;
  if (!total) return `${sessionBar()}<section class="card empty"><h2>Nada que repasar</h2><p>No hay errores graves${s ? ' que coincidan con este filtro' : ''} en las partidas analizadas.</p><a class="btn primary" href="#/puzzles">Hacer puzzles</a></section>`;
  let e = currentEx();
  if (!e || e.kind !== 'mine') {
    if (!loadNext()) {
      if (s) { s.finished = true; return summaryHTML(); }
      return `<section class="card empty"><h2>Repaso al día</h2><p>Has repasado las ${total} posiciones. Vuelven cuando toque según tu repaso espaciado.</p><div class="row tight"><a class="btn primary" href="#/puzzles">Hacer puzzles</a><button class="btn" data-action="t-extra">Practicar igualmente</button></div></section>`;
    }
    e = currentEx()!;
  }
  const it = e.item!;
  const due = dueCount();
  const header = `<header><h2>${s ? 'Encuentra la mejor jugada' : 'Repaso de tus errores'}</h2><span class="sub">${s ? '' : `${due} por repasar de ${total}`}</span></header><p>${mineContext(it)}</p>`;
  const last = !!s && s.answered.length >= s.target;
  return sessionBar() + exerciseHTML({ header, side: 'Encuentra una jugada mejor que la de la partida.', next: last ? 'Terminar sesión' : 'Siguiente', links: `<a class="btn" href="#/partida/${esc(it.gid)}?p=${it.i + 1}">Ver en la partida</a>` });
}

export function trainerNext() {
  const s = S.session;
  clearEx();
  if (s && s.answered.length >= s.target) s.finished = true;
  render();
}

export function trainerSkip() {
  const e = currentEx();
  if (!e?.item) return;
  const q = candidates();
  const idx = q.findIndex((x) => x.key === e.item!.key);
  const nx = q[(idx + 1) % q.length];
  if (!nx || nx.key === e.item.key) return;
  loadExercise('mine', { id: nx.key, fen: nx.fen, solution: [nx.m.b!], source: 'mine' }, (clean) => recordMine(nx, clean), nx);
  render();
}

export function exitSession() {
  S.session = null;
  clearEx();
}

export function moreSession() {
  if (!S.session) return;
  S.session.target = S.session.answered.length + 5;
  S.session.finished = false;
  S.session.taskId = undefined;
  clearEx();
  render();
}

/** Repaso aunque no haya nada vencido: sesión de 5 con lo más antiguo. */
export function extraPractice() {
  startFreeSession('Práctica extra', {}, 5);
  render();
}
