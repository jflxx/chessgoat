// Control del plan dentro de la app: crear la semana, registrar avances y guardarlos.
import { buildPlan, type Plan } from '../core/plan';
import { addDrillProgress, createPlanState, markReviewed, needsRollover, setDone, syncAuto, taskStatus, type Task } from '../core/tasks';
import { maybeAutoPush } from './cloudctl';
import { S, render, toast } from './state';

export const displayPlan = (): Plan => buildPlan(S.recs, { window: S.settings.window, minutes: S.settings.minutes, target: S.settings.target });

export async function persistPlan() {
  S.dirty = true;
  await S.store?.savePlan(S.plan ? structuredClone(S.plan) : null);
}

/** Crea el plan de la semana si no existe, si cambió la semana o si el usuario lo pide. */
export async function ensurePlan(force = false): Promise<void> {
  if (!S.recs.length) return;
  const opts = { window: S.settings.window, minutes: S.settings.minutes };
  const stale = !S.plan || needsRollover(S.plan) || S.plan.window !== opts.window || S.plan.minutes !== opts.minutes;
  if (!force && !stale) {
    if (S.plan && syncAuto(S.plan, S.recs)) await persistPlan();
    return;
  }
  S.plan = createPlanState(displayPlan(), S.recs, opts, S.plan);
  syncAuto(S.plan, S.recs);
  await persistPlan();
}

/** Reinicia la línea base (nuevo ciclo de objetivos) con las partidas actuales. */
export async function resetCycle() {
  S.plan = null;
  await ensurePlan(true);
  toast('Nuevo ciclo: tus objetivos parten de tus partidas actuales.');
}

export const taskById = (id?: string): Task | undefined => (id ? S.plan?.tasks.find((t) => t.id === id) : undefined);

export async function recordDrill(taskId: string | undefined) {
  if (!S.plan || !taskId) return;
  const finished = addDrillProgress(S.plan, taskId);
  const t = taskById(taskId);
  if (finished && t) toast(`Tarea completada: ${t.title}`);
  await persistPlan();
}

export async function toggleTask(taskId: string) {
  const t = taskById(taskId);
  if (!S.plan || !t) return;
  const was = taskStatus(S.plan, t).done;
  setDone(S.plan, taskId, !was);
  if (!was) toast('¡Hecho! ' + t.title);
  await persistPlan();
  render();
}

export async function reviewedGame(gameId: string) {
  if (S.plan && markReviewed(S.plan, gameId)) {
    toast('Tarea completada: revisión de partida');
    await persistPlan();
  }
}

export async function afterImport() {
  S.dirty = true;
  await ensurePlan();
  await maybeAutoPush();
}
