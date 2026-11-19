// Puzzles por tema (Lichess) resueltos dentro de la app, con puntuación propia.
import { buildPlan } from '../../core/plan';
import { LICHESS_THEME } from '../../core/tasks';
import { DIFFICULTY_ES, PUZZLE_THEMES, PuzzleError, fetchLichessPuzzle, themeName, type Difficulty } from '../../importers/puzzles';
import type { PuzzleSpec } from '../../core/puzzle';
import { esc } from '../dom';
import { clearEx, currentEx, exerciseHTML, loadExercise, ratePuzzle } from '../exercise';
import { S, markActivity, render } from '../state';
import { sessionAnswered, sessionBar, startSession, summaryHTML } from './trainer';

let loading = false;
let error = '';
let prefetch: Promise<PuzzleSpec> | null = null;
let prefetchKey = '';
const seen = new Set<string>();

/** Temas recomendados según tus prioridades actuales. */
function recommended(): string[] {
  if (!S.recs.length) return [];
  const P = buildPlan(S.recs, { window: S.settings.window });
  return [...new Set(P.priorities.map((p) => LICHESS_THEME[p.id]?.slug).filter(Boolean) as string[])];
}

export function startPuzzleSession(theme: string, target = 10) {
  startSession({ kind: 'puzzle', title: 'Puzzles: ' + themeName(theme), theme, target });
  error = '';
}

async function getPuzzle(theme: string): Promise<PuzzleSpec> {
  const key = theme + '|' + S.settings.puzzleDifficulty;
  for (let i = 0; i < 3; i++) {
    const p = prefetch && prefetchKey === key ? prefetch : fetchLichessPuzzle(theme, S.settings.puzzleDifficulty as Difficulty);
    prefetch = null;
    const spec = await p;
    if (!seen.has(spec.id)) { seen.add(spec.id); return spec; }
  }
  return fetchLichessPuzzle(theme, S.settings.puzzleDifficulty as Difficulty);
}

async function loadNextPuzzle() {
  const s = S.session;
  if (!s || s.kind !== 'puzzle' || loading) return;
  loading = true;
  error = '';
  render();
  try {
    const spec = await getPuzzle(s.theme || 'mix');
    loadExercise('puzzle', spec, async (clean) => {
      await ratePuzzle(clean);
      await markActivity();
      await sessionAnswered(spec.id, clean);
    });
    // Precarga el siguiente para que no haya espera.
    prefetchKey = (s.theme || 'mix') + '|' + S.settings.puzzleDifficulty;
    prefetch = fetchLichessPuzzle(s.theme || 'mix', S.settings.puzzleDifficulty as Difficulty);
    prefetch.catch(() => { prefetch = null; });
  } catch (e) {
    error = e instanceof PuzzleError ? e.message : 'No pude cargar el puzzle.';
  }
  loading = false;
  render();
}

export function puzzleNext() {
  const s = S.session;
  clearEx();
  if (s && s.answered.length >= s.target) s.finished = true;
  render();
}

export function puzzleSkip() {
  clearEx();
  void loadNextPuzzle();
}

export function vPuzzles(): string {
  const s = S.session;
  if (s?.kind === 'puzzle') {
    if (s.finished) return summaryHTML(`<p>Puntuación de puzzles: <strong>${S.settings.puzzleRating}</strong></p>`);
    const e = currentEx();
    if (!e || e.kind !== 'puzzle') {
      if (!loading && !error) queueMicrotask(() => void loadNextPuzzle());
      return sessionBar() + (error
        ? `<section class="card"><div class="banner err" role="alert">${esc(error)}</div><div class="row tight"><button class="btn primary" data-action="pz-retry">Reintentar</button><button class="btn" data-action="t-exit">Salir</button></div></section>`
        : '<section class="card"><div class="skeleton" style="height:320px"></div><p class="sub">Buscando un puzzle…</p></section>');
    }
    const sp = e.pz.spec;
    const header = `<header><h2>${esc(themeName(s.theme || 'mix'))}</h2><span class="pill">${sp.rating || '?'}</span></header>`;
    const last = s.answered.length >= s.target;
    return sessionBar() + exerciseHTML({ header, side: 'Encuentra la mejor continuación.', next: last ? 'Terminar sesión' : 'Siguiente puzzle', links: `<a class="btn" href="https://lichess.org/training/${esc(sp.id.replace(/^li:/, ''))}" target="_blank" rel="noopener noreferrer">Ver en Lichess</a>` });
  }
  const rec = recommended();
  const diffs = Object.entries(DIFFICULTY_ES) as [Difficulty, string][];
  const ordered = [...PUZZLE_THEMES].sort((a, b) => (rec.includes(b.slug) ? 1 : 0) - (rec.includes(a.slug) ? 1 : 0));
  return `<h1>Puzzles</h1>
  <section class="card hero"><div class="hero-row"><div class="ring" style="--p:${Math.max(0, Math.min(100, (S.settings.puzzleRating - 800) / 16))}" role="img" aria-label="Puntuación de puzzles ${S.settings.puzzleRating}"><span>${S.settings.puzzleRating}</span></div>
    <div class="grow"><h2>Tu puntuación de puzzles</h2><p class="sub">Sube cuando resuelves a la primera y sin pistas. Los puzzles vienen de Lichess y se resuelven aquí.</p>
      <label class="f" style="max-width:260px">Dificultad<select data-action="setting" data-k="puzzleDifficulty">${diffs.map(([k, t]) => `<option value="${k}" ${S.settings.puzzleDifficulty === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div></div></section>
  <section class="card"><header><h2>Elige un tema</h2><span class="sub">Sesiones de 10 puzzles${rec.length ? ' · primero lo que más te cuesta' : ''}</span></header>
    <div class="themes">${ordered.map((t) => `<button class="theme-btn" data-action="pz-start" data-theme="${t.slug}"><strong>${esc(t.name)}</strong><span>${esc(t.desc)}</span>${rec.includes(t.slug) ? '<span class="rec">Recomendado para ti</span>' : ''}</button>`).join('')}</div></section>`;
}

export function puzzleRetryLoad() {
  error = '';
  void loadNextPuzzle();
}
