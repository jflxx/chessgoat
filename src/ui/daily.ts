// Progreso del día (conveniencia por navegador): respuestas del repaso y tareas marcadas.
import { dayKey } from './dom';

interface Daily { tr: number; checks: string[] }
const key = (d = dayKey()) => 'daily:' + d;

export function getDaily(d = dayKey()): Daily {
  try {
    const raw = localStorage.getItem(key(d));
    if (raw) {
      const o = JSON.parse(raw) as Daily;
      return { tr: +o.tr || 0, checks: Array.isArray(o.checks) ? o.checks : [] };
    }
  } catch { /* sin almacenamiento */ }
  return { tr: 0, checks: [] };
}

function save(d: Daily) {
  try { localStorage.setItem(key(), JSON.stringify(d)); } catch { /* opcional */ }
}

export function bumpTrainer() {
  const d = getDaily();
  d.tr++;
  save(d);
}

export function check(id: string, on = true) {
  const d = getDaily();
  d.checks = d.checks.filter((c) => c !== id);
  if (on) d.checks.push(id);
  save(d);
}

export const isChecked = (id: string) => getDaily().checks.includes(id);
export const TRAINER_GOAL = 5;
