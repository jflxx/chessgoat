import { aggregate } from '../../core/analysis';
import { STATUS_ES } from '../../core/patterns';
import { dayIndex, goalProgress, taskStatus, weekSummary, type Task } from '../../core/tasks';
import { dayKey, esc, pct1 } from '../dom';
import { ico } from '../icons';
import { displayPlan } from '../planctl';
import { S, streak, windowRecs } from '../state';
import { noGames, windowPicker } from './common';

const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const FULL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

function weekStrip(): string {
  const now = new Date();
  const dow = dayIndex(now);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - dow + i);
    const on = S.activity.has(dayKey(d));
    out.push(`<div class="day ${on ? 'on' : ''} ${i === dow ? 'today' : ''}" role="listitem" aria-label="${FULL[i]}${on ? ', con práctica' : ''}${i === dow ? ', hoy' : ''}"><span aria-hidden="true">${DAYS[i]}</span><span aria-hidden="true">${on ? '✓' : '·'}</span></div>`);
  }
  return `<div class="week" role="list">${out.join('')}</div>`;
}

function taskLink(t: Task): string {
  const st = S.plan ? taskStatus(S.plan, t) : { done: false, count: 0, target: t.target };
  const href = t.kind === 'drill' ? `#/repaso?task=${encodeURIComponent(t.id)}` : t.kind === 'puzzle' ? `#/puzzles?task=${encodeURIComponent(t.id)}` : t.href || '#/plan';
  const ext = t.kind === 'external';
  const sub = t.kind === 'drill' ? `${st.count}/${st.target} posiciones · ${t.min} min` : t.kind === 'puzzle' ? `${st.count}/${st.target} puzzles · ${t.min} min` : `${t.min} min`;
  return `<a class="task ${st.done ? 'done' : ''}" href="${esc(href)}" ${ext ? 'target="_blank" rel="noopener noreferrer"' : ''}><span class="chk" aria-hidden="true">${st.done ? '✓' : ''}</span><span><span class="t1">${esc(t.title)}</span><span class="t2">${esc(sub)}</span></span><span aria-hidden="true">›</span></a>`;
}

/** Cuenta guardada para buscar partidas nuevas con un clic. */
export function syncTarget(): { source: 'chesscom' | 'lichess'; user: string; label: string } | null {
  const s = S.settings;
  if (s.source === 'lichess' && s.lichessUser) return { source: 'lichess', user: s.lichessUser, label: 'Lichess' };
  if (s.chesscomUser) return { source: 'chesscom', user: s.chesscomUser, label: 'Chess.com' };
  if (s.lichessUser) return { source: 'lichess', user: s.lichessUser, label: 'Lichess' };
  return null;
}

export function vHome(): string {
  if (!S.recs.length) return noGames();
  const A = aggregate(windowRecs());
  const plan = displayPlan();
  const top = plan.priorities[0];
  const st = streak();
  const sp = S.plan;
  const today = dayIndex(new Date());
  const todayTasks = sp ? sp.tasks.filter((t) => t.day === today && !t.optional) : [];
  const done = sp ? todayTasks.filter((t) => taskStatus(sp, t).done).length : 0;
  const sum = sp ? weekSummary(sp) : null;
  const goal = sp ? goalProgress(sp, S.recs) : null;
  const sync = syncTarget();
  return `<section class="card hero"><header><h1>Hola${S.settings.user ? ', ' + esc(S.settings.user) : ''}</h1><span class="sub">${S.recs.length} partidas analizadas</span></header>
    ${top ? `<p><strong>Lo que más te cuesta ahora:</strong> ${esc(top.title)}. ${esc(top.why)}</p>` : ''}
    ${top?.pattern ? `<p class="sub">Patrón recurrente: ${esc(top.pattern)}</p>` : ''}
    <div class="row tight"><a class="btn primary" href="#/plan">Ir a mi plan</a><a class="btn" href="#/puzzles">Hacer puzzles</a>${sync ? `<button class="btn" data-action="sync" ${S.run ? 'disabled' : ''}>${S.run ? 'Analizando…' : 'Buscar partidas nuevas en ' + sync.label}</button>` : ''}</div></section>
  <div class="grid2">
    <section class="card" aria-labelledby="h-hoy"><header><h2 id="h-hoy">Tu plan de hoy</h2><span class="pill ${todayTasks.length && done === todayTasks.length ? 'good' : ''}">${done}/${todayTasks.length}</span></header>
      <div class="glist">${todayTasks.length ? todayTasks.map(taskLink).join('') : '<p class="sub">Hoy no hay tareas obligatorias. ¡Descansa o practica lo que quieras!</p>'}</div>
      ${sum ? `<div class="meter"><span>Semana</span><span><strong>${sum.pct}%</strong> (${sum.done}/${sum.total})</span><div class="bar" role="progressbar" aria-label="Progreso de la semana" aria-valuenow="${sum.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${sum.pct}%"></i></div></div>` : ''}
      <a href="#/plan">Ver la semana completa</a></section>
    <section class="card" aria-labelledby="h-racha"><header><h2 id="h-racha">Tu racha</h2><span class="sub">Días seguidos practicando</span></header>
      <div class="streakrow">${ico('racha')}<span class="streak">${st}</span> <span class="sub">${st === 1 ? 'día' : 'días'}</span></div>${weekStrip()}
      ${goal ? `<p class="sub">${goal.enough ? `Objetivo: ${pct1(goal.nowErr)} errores por partida ahora, meta ${pct1(goal.targetErr)} (${goal.pct}%).` : `Objetivo: faltan ${Math.max(0, 3 - goal.newGames)} partidas nuevas para medir tu progreso.`}</p>` : ''}</section></div>
  <section class="card"><header><h2>Últimas ${Math.min(S.settings.window, S.recs.length)} partidas</h2>${windowPicker()}</header>
    <div class="tiles"><div class="tile"><span class="v">${A.W}-${A.D}-${A.L}</span><span class="l">Victorias, tablas, derrotas</span></div>
      <div class="tile"><span class="v">${pct1(A.acc)}%</span><span class="l">Precisión media</span></div>
      <div class="tile"><span class="v">${pct1((A.counts.m + A.counts.x) / (A.n || 1))}</span><span class="l">Errores y graves por partida</span></div>
      <div class="tile"><span class="v">${A.elo || '—'}</span><span class="l">Elo en la última partida</span></div></div></section>
  ${plan.patterns.length ? `<section class="card"><header><h2>Patrones que se repiten</h2><a href="#/informe/patrones">Ver todos</a></header><div class="glist">${plan.patterns.slice(0, 3).map((p) => `<a class="gitem" href="#/informe/patrones"><span class="bar"></span><span><span class="t1">${esc(p.title)}</span><span class="t2">${p.total} partidas distintas · ${STATUS_ES[p.status]}</span></span><span class="pill">${p.cur}/${p.prev}</span></a>`).join('')}</div></section>` : ''}`;
}
