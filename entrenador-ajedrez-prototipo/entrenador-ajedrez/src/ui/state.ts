import type { GameRec, Settings, TrainerItem } from '../types';
import type { Store } from '../storage/db';
import type { EnginePool } from '../engine/pool';
import { defaultCores } from '../engine/pool';
import { dayKey } from './dom';
import type { DrillFilter } from '../core/drills';
import type { PlanState } from '../core/tasks';

export interface RunState { done: number; total: number; label: string; cancel: boolean }
export interface TrainerView { key: string; sel: string | null; res: { ok: boolean; title: string; text: string; reveal: boolean } | null; busy: boolean; err?: string }

export interface Session { kind: 'mine' | 'puzzle'; taskId?: string; title: string; filter?: DrillFilter; theme?: string; target: number; answered: string[]; correct: number; finished: boolean }

export const defaultSettings = (): Settings => ({
  user: '', source: 'chesscom', n: 20, depth: 14, cores: defaultCores(), engineMode: 'auto', minutes: 30, target: 1200,
  window: 30, timeClass: '', theme: 'system', chesscomUser: '', lichessUser: '',
  sound: true, animations: true, boardTheme: 'marron', puzzleDifficulty: 'normal', puzzleRating: 1500, verify: true, liveLines: 2, liveOn: true,
  cloudUrl: '', cloudKey: '', cloudCode: '', cloudAuto: true, cloudLast: '',
});

export const S = {
  ready: false,
  store: null as Store | null,
  recs: [] as GameRec[],
  settings: defaultSettings(),
  trainer: new Map<string, TrainerItem>(),
  activity: new Set<string>(),
  run: null as RunState | null,
  msg: '',
  msgKind: 'info' as 'info' | 'err',
  engineNote: '',
  pool: null as EnginePool | null,
  // vista
  ply: 0,
  alt: false,
  tr: null as TrainerView | null,
  draft: { pgn: '', user: null as string | null, tab: 'chesscom' as 'chesscom' | 'lichess' | 'pgn' },
  gameFilter: { color: '', result: '', q: '', sort: '' },
  confirmClear: false,
  focusSq: 'e2',
  plan: null as PlanState | null,
  session: null as Session | null,
  toasts: [] as { id: number; text: string }[],
  selDay: null as number | null,
  flip: null as boolean | null,
  showBest: true,
  playing: false,
  drag: null as string | null,
  sel: null as string | null,
  promo: null as { from: string; to: string } | null,
  anim: null as { from: string; to: string } | null,
  live: false,
  /** Panel de atajos de teclado en la revisión. */
  help: false,
  /** Filtro de ritmo del informe: '' = todos. */
  reportClass: '',
  /** Estado de patrón elegido en la pestaña Patrones ('' = todos). */
  patFilter: '',
  /** Hay cambios que todavía no están en la copia de la nube. */
  dirty: false,
  explore: null as { fens: string[]; sans: string[]; last: ({ from: string; to: string } | null)[]; basePly: number } | null,
};

let renderFn: () => void = () => {};
export const onRender = (f: () => void) => { renderFn = f; };
export const render = () => renderFn();

let toastId = 0;
export function toast(text: string, ms = 3200) {
  const id = ++toastId;
  S.toasts.push({ id, text });
  render();
  setTimeout(() => { S.toasts = S.toasts.filter((t) => t.id !== id); render(); }, ms);
}

export const message = (text: string, kind: 'info' | 'err' = 'info') => { S.msg = text; S.msgKind = kind; };

export async function saveSettings(patch: Partial<Settings> = {}) {
  Object.assign(S.settings, patch);
  if (patch.theme !== undefined || patch.boardTheme !== undefined) applyTheme();
  await S.store?.saveSettings({ ...S.settings });
}

export function applyTheme() {
  document.documentElement.dataset.board = S.settings.boardTheme || 'verde';
  const t = S.settings.theme;
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try { if (t === 'system') localStorage.removeItem('theme'); else localStorage.setItem('theme', t); } catch { /* opcional */ }
}

/** Partidas de la ventana actual (últimas N). */
export const windowRecs = () => S.recs.slice(-S.settings.window);

export async function markActivity() {
  const d = dayKey();
  if (S.activity.has(d)) return;
  S.activity.add(d);
  await S.store?.addActivity(d);
}

/** Días seguidos con actividad hasta hoy (o hasta ayer si hoy aún no has practicado). */
export function streak(): number {
  let n = 0;
  const d = new Date();
  if (!S.activity.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (S.activity.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
