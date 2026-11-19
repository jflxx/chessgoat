// Plan accionable: la semana se convierte en tareas que se hacen dentro de la app y se miden con tus partidas nuevas.
import type { GameRec, Tag } from '../types';
import { aggregate, isBigErr } from './analysis';
import { OPENING_PLIES, allItems, filterItems, type DrillFilter } from './drills';
import type { Plan, Window } from './plan';

export type TaskKind = 'drill' | 'puzzle' | 'review' | 'external' | 'play' | 'import' | 'checklist' | 'rest';

export interface Task {
  id: string;
  day: number; // 0 = lunes ... 6 = domingo
  min: number;
  kind: TaskKind;
  title: string;
  desc: string;
  /** Posiciones a resolver (drill) o partidas a importar (import). */
  target: number;
  filter?: DrillFilter;
  /** Tema de puzzles de Lichess (tareas de tipo puzzle). */
  theme?: string;
  gameId?: string;
  ply?: number;
  href?: string;
  priority?: string;
  optional?: boolean;
}

export interface Baseline {
  games: number;
  acc: number;
  errPerGame: number;
  tagRate: Partial<Record<Tag, number>>;
  /** Marca de tiempo de la última partida incluida: lo posterior cuenta como "partidas nuevas". */
  lastTs: number;
  priorities: string[];
}

export interface PlanState {
  weekStart: string; // lunes, AAAA-MM-DD
  window: Window;
  minutes: number;
  createdAt: number;
  baseline: Baseline;
  tasks: Task[];
  progress: Record<string, number>;
  done: Record<string, string>;
  history: { weekStart: string; done: number; total: number }[];
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Lunes de la semana de `d`, en hora local. */
export function mondayOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return dateKey(x);
}

export const dayIndex = (d: Date) => (d.getDay() + 6) % 7;
export const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Tema de Lichess para practicar con puzzles externos. */
export const LICHESS_THEME: Record<string, { slug: string; name: string }> = {
  pieza_colgada: { slug: 'hangingPiece', name: 'Pieza colgada' },
  horquilla: { slug: 'fork', name: 'Horquilla' },
  mate_rey: { slug: 'mateIn2', name: 'Mate en 2' },
  tactica_perdida: { slug: 'crushing', name: 'Ventaja decisiva' },
  peon_perdido: { slug: 'advantage', name: 'Ganar material' },
  rey_expuesto: { slug: 'mateIn2', name: 'Mate en 2' },
  posicional: { slug: 'endgame', name: 'Finales' },
  ventaja_perdida: { slug: 'advantage', name: 'Convertir ventaja' },
  general: { slug: 'mix', name: 'Táctica mixta' },
};
export const lichessUrl = (tag: string) => `https://lichess.org/training/${(LICHESS_THEME[tag] || LICHESS_THEME.general).slug}`;

const SECONDS_PER_DRILL = 1.5; // minutos por posición, aproximado

export function buildTasks(plan: Plan, recs: GameRec[], weekStart: string, minutes: number): Task[] {
  const window = recs.slice(-plan.window);
  const items = allItems(window);
  const pr = plan.priorities;
  const P = (i: number) => pr[Math.min(i, pr.length - 1)];
  const tasks: Task[] = [];
  let n = 0;
  const id = (day: number, kind: string, key: string) => `${weekStart}|${day}|${n++}|${kind}|${key}`;
  const mins = (f: number) => Math.max(5, Math.round((minutes * f) / 5) * 5);

  const drill = (day: number, f: number, p: { id: string; title: string } | undefined, label: string, filter?: DrillFilter, optional = false) => {
    let flt = filter;
    if (filterItems(items, flt).length === 0) flt = undefined; // sin ejemplos propios: repaso general
    if (items.length === 0) return;
    const m = mins(f);
    const avail = filterItems(items, flt).length;
    const target = Math.max(1, Math.min(avail, Math.max(3, Math.min(15, Math.round(m / SECONDS_PER_DRILL)))));
    tasks.push({
      id: id(day, 'drill', JSON.stringify(flt || {})), day, min: m, kind: 'drill', target, filter: flt, priority: p?.id,
      title: label, desc: flt ? `${target} posiciones de tus propias partidas.` : `${target} posiciones de tus errores, las más urgentes primero.`, optional,
    });
  };
  const puzzles = (day: number, f: number, p?: { id: string; title: string }) => {
    const key = p?.id || 'general';
    const th = LICHESS_THEME[key] || LICHESS_THEME.general;
    const m = mins(f);
    const target = Math.max(3, Math.min(10, Math.round(m / 2)));
    tasks.push({ id: id(day, 'puzzle', key), day, min: m, kind: 'puzzle', target, theme: th.slug, priority: key, href: lichessUrl(key), title: `Puzzles: ${th.name}`, desc: `${target} puzzles de Lichess dentro de la app.` });
  };
  const checklist = (day: number, f: number) => tasks.push({ id: id(day, 'checklist', 'lista'), day, min: mins(f), kind: 'checklist', target: 1, href: '#/plan?lista=1', title: 'Repasa la lista de revisión', desc: 'Léela despacio: es lo que vas a aplicar antes de cada jugada esta semana.' });
  const play = (day: number, f: number, games: number) => tasks.push({ id: id(day, 'play', String(games)), day, min: mins(f), kind: 'play', target: games, title: games === 1 ? 'Juega una partida' : `Juega ${games} partidas`, desc: 'Ritmo 15+10 o más lento. Antes de cada jugada, aplica la lista de revisión.' });

  const pat = plan.patterns.find((p) => p.status === 'persistente' || p.status === 'nuevo');
  const worstOpening = plan.openings[0];
  // Partida con el error más grande de la ventana, para revisarla.
  let worst: { gid: string; i: number; d: number; opp: string } | null = null;
  for (const g of window) g.moves.forEach((m, i) => { if (isBigErr(m.c) && (!worst || (m.d || 0) > worst.d)) worst = { gid: g.id, i, d: m.d || 0, opp: g.opp }; });

  // Lunes
  drill(0, 0.5, P(0), `Repaso: ${P(0)?.title || 'tus errores'}`, P(0) && P(0).id !== 'general' ? { tag: P(0).id as Tag } : undefined);
  puzzles(0, 0.3, P(0));
  checklist(0, 0.2);
  // Martes
  drill(1, 0.4, P(1), `Repaso: ${P(1)?.title || 'tus errores'}`, P(1) && P(1).id !== 'general' ? { tag: P(1).id as Tag } : undefined);
  play(1, 0.6, 1);
  // Miércoles
  if (pat) drill(2, 0.5, undefined, `Patrón recurrente: ${pat.title}`, { patternKey: pat.key });
  else drill(2, 0.5, P(1), `Repaso: ${P(1)?.title || 'tus errores'}`, P(1) && P(1).id !== 'general' ? { tag: P(1).id as Tag } : undefined);
  if (worstOpening) {
    const opening = Object.values(aggregate(window).openings).find((o) => o.name.endsWith(worstOpening.name))?.name;
    const flt: DrillFilter | undefined = opening ? { opening, maxPly: OPENING_PLIES } : undefined;
    // Sin errores en las primeras 10 jugadas no hay nada que repasar de esa apertura: se sustituye por puzzles.
    if (flt && filterItems(items, flt).length) drill(2, 0.3, undefined, `Apertura: ${worstOpening.name} (primeras 10 jugadas)`, flt);
    else puzzles(2, 0.3, P(1));
  } else puzzles(2, 0.3, P(1));
  drill(2, 0.2, undefined, 'Repaso mixto de errores pendientes');
  // Jueves
  if (worst) {
    const w = worst as { gid: string; i: number; d: number; opp: string };
    tasks.push({ id: id(3, 'review', w.gid), day: 3, min: mins(0.5), kind: 'review', target: 1, gameId: w.gid, ply: w.i + 1, href: `#/partida/${w.gid}?p=${w.i + 1}`, title: `Revisa tu peor error contra ${w.opp}`, desc: 'Abre la partida en el momento del error y entiende qué pasó.' });
  }
  drill(3, 0.3, P(0), `Repaso: ${P(0)?.title || 'tus errores'}`, P(0) && P(0).id !== 'general' ? { tag: P(0).id as Tag } : undefined);
  puzzles(3, 0.2, P(0));
  // Viernes
  drill(4, 0.5, P(2), `Repaso: ${P(2)?.title || 'tus errores'}`, P(2) && P(2).id !== 'general' ? { tag: P(2).id as Tag } : undefined);
  puzzles(4, 0.3, P(2));
  drill(4, 0.2, undefined, 'Repaso mixto de errores pendientes');
  // Sábado
  play(5, 0.5, 2);
  tasks.push({ id: id(5, 'import', 'nuevas'), day: 5, min: mins(0.5), kind: 'import', target: 2, href: '#/importar', title: 'Importa y analiza tus partidas nuevas', desc: 'Así la app mide si tus errores bajan. Con 3 partidas nuevas o más aparece tu progreso.' });
  // Domingo
  tasks.push({ id: id(6, 'rest', 'descanso'), day: 6, min: 15, kind: 'rest', target: 1, optional: true, title: 'Descanso, o puzzles ligeros', desc: 'Opcional.' });
  return tasks;
}

// ---------- estado y seguimiento ----------
export function makeBaseline(recs: GameRec[], window: Window, priorities: string[]): Baseline {
  const w = recs.slice(-window);
  const A = aggregate(w);
  const tagRate: Partial<Record<Tag, number>> = {};
  for (const [k, v] of Object.entries(A.tags) as [Tag, { n: number }][]) tagRate[k] = A.n ? v.n / A.n : 0;
  return { games: w.length, acc: A.acc, errPerGame: A.n ? (A.counts.m + A.counts.x) / A.n : 0, tagRate, lastTs: w.length ? w[w.length - 1].ts : 0, priorities };
}

export interface PlanOpts { window: Window; minutes: number }

export function createPlanState(plan: Plan, recs: GameRec[], opts: PlanOpts, prev: PlanState | null, now = new Date()): PlanState {
  const weekStart = mondayOf(now);
  const tasks = buildTasks(plan, recs, weekStart, opts.minutes);
  const history = prev ? [...prev.history] : [];
  if (prev && prev.weekStart !== weekStart) {
    const s = weekSummary(prev);
    history.push({ weekStart: prev.weekStart, done: s.done, total: s.total });
  }
  const keepProgress = prev && prev.weekStart === weekStart;
  const progress: Record<string, number> = {};
  const done: Record<string, string> = {};
  if (keepProgress) {
    // Al regenerar dentro de la misma semana se conserva lo hecho en tareas equivalentes (mismo día, tipo y foco).
    const sig = (t: Task) => `${t.day}|${t.kind}|${t.id.split('|').slice(4).join('|')}`;
    const oldBy = new Map(prev!.tasks.map((t) => [sig(t), t]));
    for (const t of tasks) {
      const o = oldBy.get(sig(t));
      if (!o) continue;
      if (prev!.progress[o.id] != null) progress[t.id] = prev!.progress[o.id];
      if (prev!.done[o.id]) done[t.id] = prev!.done[o.id];
    }
  }
  return {
    weekStart, window: opts.window, minutes: opts.minutes, createdAt: keepProgress ? prev!.createdAt : now.getTime(),
    baseline: prev?.baseline ?? makeBaseline(recs, opts.window, plan.priorities.map((p) => p.id)), tasks, progress, done, history: history.slice(-12),
  };
}

/** Si la semana cambió, genera la nueva conservando el historial y el punto de partida. */
export function needsRollover(s: PlanState, now = new Date()) {
  return s.weekStart !== mondayOf(now);
}

export function taskStatus(s: PlanState, t: Task) {
  const count = s.progress[t.id] ?? 0;
  const done = !!s.done[t.id] || ((t.kind === 'drill' || t.kind === 'puzzle') && count >= t.target);
  return { done, count: Math.min(count, t.target), target: t.target };
}

export function addDrillProgress(s: PlanState, taskId: string, n = 1, now = new Date()): boolean {
  const t = s.tasks.find((x) => x.id === taskId);
  if (!t) return false;
  s.progress[taskId] = (s.progress[taskId] ?? 0) + n;
  const was = !!s.done[taskId];
  if (s.progress[taskId] >= t.target && !was) s.done[taskId] = dateKey(now);
  return !was && !!s.done[taskId];
}

export function setDone(s: PlanState, taskId: string, on: boolean, now = new Date()) {
  if (on) s.done[taskId] = dateKey(now);
  else { delete s.done[taskId]; if (s.progress[taskId] != null) s.progress[taskId] = 0; }
}

export function weekSummary(s: PlanState) {
  const req = s.tasks.filter((t) => !t.optional);
  const doneN = req.filter((t) => taskStatus(s, t).done).length;
  const byDay = DAY_NAMES.map((name, day) => {
    const ts = s.tasks.filter((t) => t.day === day && !t.optional);
    return { day, name, total: ts.length, done: ts.filter((t) => taskStatus(s, t).done).length, minutes: s.tasks.filter((t) => t.day === day).reduce((a, t) => a + t.min, 0) };
  });
  return { done: doneN, total: req.length, pct: req.length ? Math.round((doneN / req.length) * 100) : 0, byDay };
}

export interface GoalProgress {
  newGames: number;
  enough: boolean;
  baselineErr: number;
  nowErr: number;
  targetErr: number;
  pct: number;
  byTag: { id: string; baseline: number; now: number }[];
}

/** Compara las partidas posteriores al punto de partida con la línea base. */
export function goalProgress(s: PlanState, recs: GameRec[]): GoalProgress {
  const fresh = recs.filter((g) => g.ts > s.baseline.lastTs);
  const A = aggregate(fresh);
  const base = s.baseline.errPerGame;
  const target = Math.round(base * 0.75 * 10) / 10;
  const now = A.n ? (A.counts.m + A.counts.x) / A.n : 0;
  const enough = fresh.length >= 3;
  const span = base - target;
  const pct = !enough || span <= 0 ? 0 : Math.max(0, Math.min(100, Math.round(((base - now) / span) * 100)));
  const byTag = s.baseline.priorities.map((id) => ({ id, baseline: s.baseline.tagRate[id as Tag] ?? 0, now: A.n ? (A.tags[id as Tag]?.n || 0) / A.n : 0 }));
  return { newGames: fresh.length, enough, baselineErr: Math.round(base * 10) / 10, nowErr: Math.round(now * 10) / 10, targetErr: target, pct, byTag };
}

/** Marca tareas que se cumplen solas: importar partidas nuevas. Devuelve true si algo cambió. */
export function syncAuto(s: PlanState, recs: GameRec[], now = new Date()): boolean {
  let changed = false;
  const fresh = recs.filter((g) => g.ts > s.baseline.lastTs).length;
  for (const t of s.tasks) {
    if (t.kind === 'import' && !s.done[t.id] && fresh >= t.target) {
      s.done[t.id] = dateKey(now);
      changed = true;
    }
  }
  return changed;
}

/** Abrir la partida de una tarea de revisión la completa. */
export function markReviewed(s: PlanState, gameId: string, now = new Date()): boolean {
  let changed = false;
  for (const t of s.tasks) {
    if (t.kind === 'review' && t.gameId === gameId && !s.done[t.id]) {
      s.done[t.id] = dateKey(now);
      changed = true;
    }
  }
  return changed;
}
