import { aggregate } from '../../core/analysis';
import { STATUS_ES } from '../../core/patterns';
import { CHECKLIST, WINDOWS, WINDOW_INFO, type Trend } from '../../core/plan';
import { DAY_NAMES, dayIndex, goalProgress, taskStatus, weekSummary, type Task, type TaskKind } from '../../core/tasks';
import { trendSVG } from '../charts';
import { ico } from '../icons';
import { esc, pct1, plural } from '../dom';
import { displayPlan } from '../planctl';
import { S } from '../state';
import { noGames, windowPicker } from './common';

const TREND: Record<Trend, { t: string; c: string }> = {
  peor: { t: 'Empeora', c: 'bad' }, mejor: { t: 'Mejora', c: 'good' }, estable: { t: 'Estable', c: '' }, sin_datos: { t: 'Sin comparación', c: '' },
};
const KIND_ICON: Record<TaskKind, string> = { puzzle: 'puzzles', drill: 'repaso', review: 'lupa', external: 'web', play: 'partidas', import: 'importar', checklist: 'plan', rest: 'luna' };

const fmtDay = (iso: string, plus = 0) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d + plus).toLocaleDateString('es', { day: 'numeric', month: 'long' });
};

function mission(t: Task): string {
  const st = taskStatus(S.plan!, t);
  const counted = t.kind === 'drill' || t.kind === 'puzzle';
  const pct = counted ? Math.round((st.count / st.target) * 100) : st.done ? 100 : 0;
  let acts = '';
  if (st.done) acts = `<button class="btn small" data-action="task-toggle" data-id="${esc(t.id)}">Deshacer</button>`;
  else if (t.kind === 'drill' || t.kind === 'puzzle') acts = `<a class="btn primary small" href="#/${t.kind === 'drill' ? 'repaso' : 'puzzles'}?task=${encodeURIComponent(t.id)}">${st.count ? 'Continuar' : 'Empezar'}</a>`;
  else if (t.kind === 'review' || t.kind === 'import') acts = `<a class="btn primary small" href="${esc(t.href!)}">${t.kind === 'import' ? 'Importar' : 'Abrir partida'}</a>${t.kind === 'review' ? '' : `<button class="btn small" data-action="task-toggle" data-id="${esc(t.id)}">Marcar hecha</button>`}`;
  else if (t.kind === 'external') acts = `<a class="btn primary small" href="${esc(t.href!)}" target="_blank" rel="noopener noreferrer">Abrir puzzles</a><button class="btn small" data-action="task-toggle" data-id="${esc(t.id)}">Hecho</button>`;
  else if (t.kind === 'checklist') acts = `<a class="btn small" href="#lista" data-action="show-list">Ver lista</a><button class="btn primary small" data-action="task-toggle" data-id="${esc(t.id)}">Hecho</button>`;
  else acts = `<button class="btn small" data-action="task-toggle" data-id="${esc(t.id)}">Hecho</button>`;
  return `<div class="mission ${st.done ? 'done' : ''}"><span class="mi" aria-hidden="true">${ico(st.done ? 'estrella' : KIND_ICON[t.kind])}</span>
    <span><span class="mt">${esc(t.title)}${t.optional ? ' <span class="pill">opcional</span>' : ''}</span><span class="md">${t.min} min · ${esc(t.desc)}${counted ? ` · ${st.count}/${st.target}` : ''}</span>${counted ? `<div class="mp" role="progressbar" aria-label="Progreso de la tarea" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>` : ''}</span>
    <span class="acts">${acts}</span></div>`;
}

export function vPlan(): string {
  if (!S.recs.length) return noGames();
  const st = S.plan;
  if (!st) return '<section class="card"><div class="skeleton" style="height:90px"></div><p class="sub">Preparando tu plan…</p></section>';
  const w = S.settings.window;
  const P = displayPlan();
  const info = WINDOW_INFO[w];
  const sum = weekSummary(st);
  const today = dayIndex(new Date());
  const sel = S.selDay ?? today;
  const goal = goalProgress(st, S.recs);
  const todayTasks = st.tasks.filter((t) => t.day === today && !t.optional);
  const nextTask = st.tasks.find((t) => !t.optional && !taskStatus(st, t).done && t.day >= today) ?? st.tasks.find((t) => !t.optional && !taskStatus(st, t).done);
  const dayTasks = st.tasks.filter((t) => t.day === sel);
  const doneToday = todayTasks.filter((t) => taskStatus(st, t).done).length;

  const strip = sum.byDay.map((d) => `<button type="button" class="dbtn ${d.day === sel ? 'sel' : ''} ${d.day === today ? 'today' : ''} ${d.total && d.done === d.total ? 'full' : ''}" data-action="day" data-d="${d.day}" aria-pressed="${d.day === sel}" aria-label="${DAY_NAMES[d.day]}: ${d.done} de ${d.total} tareas${d.day === today ? ', hoy' : ''}"><span class="dn">${DAY_NAMES[d.day].slice(0, 3)}</span><span class="dc">${d.total ? `${d.done}/${d.total}` : '–'}</span></button>`).join('');

  const nextHref = nextTask ? (nextTask.kind === 'drill' ? `#/repaso?task=${encodeURIComponent(nextTask.id)}` : nextTask.kind === 'puzzle' ? `#/puzzles?task=${encodeURIComponent(nextTask.id)}` : nextTask.kind === 'external' ? nextTask.href! : nextTask.href || '') : '';
  const hero = `<section class="card hero"><div class="hero-row"><div class="ring" style="--p:${sum.pct}" role="img" aria-label="${sum.pct}% de la semana completado"><span>${sum.pct}%</span></div>
    <div class="grow"><h2>Semana del ${fmtDay(st.weekStart)} al ${fmtDay(st.weekStart, 6)}</h2>
      <p>${sum.done} de ${sum.total} tareas hechas · hoy ${doneToday}/${todayTasks.length}. ${sum.pct === 100 ? '¡Semana completa!' : nextTask ? `Lo siguiente: <strong>${esc(nextTask.title)}</strong>.` : ''}</p>
      <div class="row tight">${nextTask && nextHref ? `<a class="btn primary" href="${esc(nextHref)}" ${nextTask.kind === 'external' ? 'target="_blank" rel="noopener noreferrer"' : ''}>${sum.done ? 'Seguir con mi plan' : 'Empezar mi plan'}</a>` : ''}
        <button class="btn" data-action="plan-refresh">Actualizar con mis datos</button></div></div></div></section>`;

  const horizon = `<section class="card"><header><h2>Horizonte del plan</h2>${windowPicker()}</header>
    <p class="sub"><strong>${info.label}:</strong> ${info.priorities} prioridades, pensado para ${info.horizon}. Se calcula con tus últimas ${P.games} partidas${P.prevGames ? ` y se compara con las ${P.prevGames} anteriores` : ''}. Al cambiarlo, el plan se rehace conservando lo que ya hiciste.</p>
    <details><summary>¿Qué cambia entre 20, 30, 40 y 50?</summary><ul class="tight">${WINDOWS.map((x) => `<li><strong>${x}:</strong> ${WINDOW_INFO[x].label}, ${WINDOW_INFO[x].priorities} prioridades, ${WINDOW_INFO[x].horizon}${WINDOW_INFO[x].openings ? ', con revisión de aperturas' : ''}${WINDOW_INFO[x].extras ? ' y análisis de conversión y reloj' : ''}</li>`).join('')}</ul></details></section>`;

  const days = `<section class="card" aria-labelledby="h-dias"><header><h2 id="h-dias">${sel === today ? 'Hoy' : DAY_NAMES[sel]}</h2><span class="sub">${dayTasks.reduce((a, t) => a + t.min, 0)} min en total</span></header>
    <div class="daystrip" role="group" aria-label="Elegir día">${strip}</div>
    <div class="glist">${dayTasks.length ? dayTasks.map(mission).join('') : '<p class="sub">No hay tareas este día.</p>'}</div></section>`;

  const goalCard = `<section class="card"><header><h2>Tu objetivo</h2><span class="sub">${goal.baselineErr < 1 ? 'Mantener tus errores bajos' : 'Bajar un 25 % tus errores por partida'}</span></header>
    ${goal.baselineErr < 1 ? '<p>Ya cometes menos de un error por partida. La meta es mantenerlo y practicar táctica para seguir mejorando.</p>' : ''}
    <div class="meter"><span>Errores y graves por partida</span><span><strong>${pct1(goal.baselineErr)}</strong> al empezar · meta <strong>${pct1(goal.targetErr)}</strong>${goal.enough ? ` · ahora <strong>${pct1(goal.nowErr)}</strong>` : ''}</span>
      <div class="bar" role="progressbar" aria-label="Progreso hacia el objetivo" aria-valuenow="${goal.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${goal.enough ? goal.pct : 0}%"></i></div></div>
    ${goal.enough ? `<p>${goal.pct >= 100 ? '¡Objetivo cumplido! Puedes empezar un nuevo ciclo.' : `Llevas ${plural(goal.newGames, 'partida nueva', 'partidas nuevas')} desde que empezó el plan.`}</p>` : `<p class="sub">${goal.newGames}/3 partidas nuevas analizadas. Juega, importa tus partidas y aquí verás si tus errores bajan.</p>`}
    ${goal.enough ? `<div class="glist">${goal.byTag.filter((b) => b.baseline || b.now).map((b) => `<div class="meter"><span>${esc(P.priorities.find((p) => p.id === b.id)?.title || b.id)}</span><span>${pct1(b.baseline)} → <strong>${pct1(b.now)}</strong> por partida</span></div>`).join('')}</div>` : ''}
    ${st.history.length ? `<div class="chips" aria-label="Semanas anteriores">${st.history.slice(-6).map((h) => `<span class="chip">${fmtDay(h.weekStart)} <b>${h.done}/${h.total}</b></span>`).join('')}</div>` : ''}
    <div class="row tight"><a class="btn small" href="#/importar">Importar partidas nuevas</a><button class="btn small" data-action="plan-reset">Empezar un nuevo ciclo</button></div></section>`;

  const prios = `<section class="card"><header><h2>Prioridades</h2><span class="sub">Lo que más puntos te cuesta</span></header>
    ${P.priorities.map((p, i) => `<div class="prio p${Math.min(i, 2)}"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h3>${i + 1}. ${esc(p.title)}</h3><span class="pill ${TREND[p.trend].c}">${TREND[p.trend].t}</span></div>
      <p>${esc(p.why)}</p>${p.pattern ? `<p class="sub"><strong>Patrón:</strong> ${esc(p.pattern)}</p>` : ''}
      <div class="row tight">${p.id !== 'general' ? `<button class="btn primary small" data-action="practice-tag" data-tag="${esc(p.id)}" data-title="${esc(p.title)}">Practicar ahora (5)</button>` : ''}<a class="btn small" href="#/informe/errores">Ver mis errores</a></div>
      <details><summary>Cómo trabajarlo</summary><ul class="tight">${p.drills.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></details></div>`).join('')}
    ${P.notes.map((n) => `<p class="sub">${esc(n)}</p>`).join('')}</section>`;

  const pats = P.patterns.length ? `<section class="card"><header><h2>Patrones a trabajar</h2><a href="#/informe/patrones">Ver informe</a></header><div class="glist">${P.patterns.slice(0, 4).map((p) => `<div class="mission"><span class="mi" aria-hidden="true">${ico('repaso')}</span><span><span class="mt">${esc(p.title)}</span><span class="md">${p.total} partidas · ${STATUS_ES[p.status]}</span></span><span class="acts"><button class="btn small primary" data-action="practice-pattern" data-key="${esc(p.key)}" data-title="${esc(p.title)}">Practicar</button></span></div>`).join('')}</div></section>` : '';
  const opens = P.openings.length ? `<section class="card"><header><h2>Aperturas a revisar</h2></header>${P.openings.map((o) => `<div class="note"><strong>${esc(o.name)}</strong><span class="sub">${o.n} partidas, ${o.record}</span><p>${esc(o.tip)}</p><button class="btn small" style="align-self:flex-start" data-action="practice-opening" data-name="${esc(o.name)}">Repasar errores de las 10 primeras jugadas</button></div>`).join('')}</section>` : '';
  const list = `<section class="card" id="lista"><header><h2>Antes de cada jugada</h2><span class="sub">Tu lista de revisión</span></header><ol class="tight">${CHECKLIST.map((c) => `<li>${esc(c)}</li>`).join('')}</ol></section>`;
  const cfg = `<section class="card"><details><summary>Ajustes del plan</summary><div class="row" style="margin-top:8px"><label class="f">Minutos de estudio al día<select data-action="setting" data-k="minutes">${[20, 30, 45, 60].map((v) => `<option value="${v}" ${S.settings.minutes === v ? 'selected' : ''}>${v} min</option>`).join('')}</select></label>
    <label class="f">Meta de Elo<input type="number" min="600" max="2800" step="50" value="${S.settings.target}" data-action="setting" data-k="target"></label></div>
    <p class="sub" style="margin-top:8px">Elo en tu última partida: ${P.goal?.elo || '—'}${P.goal?.gap ? ` · faltan ${P.goal.gap} puntos para tu meta` : ''}. Sin plazos prometidos: depende de cuánto practiques.</p></details></section>`;

  return `<h1>Plan de estudio</h1>${hero}${days}<div class="grid2">${goalCard}<div style="display:flex;flex-direction:column;gap:16px">${prios}</div></div>${horizon}${pats}${opens}${list}${cfg}`;
}

export function vProgress(): string {
  if (S.recs.length < 2) return `<section class="card empty"><h2>Aún no hay tendencia</h2><p>Importa al menos 2 partidas. Cuando vuelvas a analizar partidas nuevas, aquí verás cómo cambia tu precisión.</p><a class="btn primary" href="#/importar">Importar partidas</a></section>`;
  const A = aggregate(S.recs);
  const stat = (recs: typeof S.recs) => {
    const a = aggregate(recs);
    return { n: a.n, acc: a.acc, e: a.n ? (a.counts.m + a.counts.x) / a.n : 0, win: a.n ? Math.round(((a.W + a.D / 2) / a.n) * 100) : 0 };
  };
  const rows = WINDOWS.filter((w) => S.recs.length >= Math.min(w, 10)).map((w) => {
    const cur = stat(S.recs.slice(-w));
    const prevRecs = S.recs.slice(-2 * w, -w).slice(0, Math.max(0, S.recs.length - Math.min(w, S.recs.length)));
    const prev = prevRecs.length >= 5 ? stat(prevRecs) : null;
    const dlt = (a: number, b: number, inv = false) => {
      const d = Math.round((a - b) * 10) / 10;
      if (!d) return '<span class="sub">igual</span>';
      const good = inv ? d < 0 : d > 0;
      return `<span class="d ${good ? 'up' : 'down'}">${d > 0 ? '+' : ''}${pct1(d)}${good ? ' mejor' : ' peor'}</span>`;
    };
    return `<tr><td>Últimas ${w}${cur.n < w ? ` (${cur.n})` : ''}</td><td class="n">${pct1(cur.acc)}% ${prev ? dlt(cur.acc, prev.acc) : ''}</td><td class="n">${pct1(cur.e)} ${prev ? dlt(cur.e, prev.e, true) : ''}</td><td class="n">${cur.win}% ${prev ? dlt(cur.win, prev.win) : ''}</td></tr>`;
  });
  return `<h1>Progreso</h1><section class="card"><header><h2>Precisión por partida</h2><span class="sub">Línea continua: media de las últimas 5</span></header>${trendSVG(A.trend)}
    <div class="legend"><span><span class="dot" style="background:var(--good)"></span>Victoria</span><span><span class="dot ring"></span>Tablas</span><span><span class="dot sq" style="background:var(--crit)"></span>Derrota</span></div></section>
  <section class="card"><header><h2>Cada tanda frente a la anterior</h2><span class="sub">Con 5 partidas anteriores o más</span></header><div class="scroll"><table><thead><tr><th>Tanda</th><th class="n">Precisión</th><th class="n">Errores por partida</th><th class="n">Puntos (victoria 1, tablas ½)</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></section>`;
}
