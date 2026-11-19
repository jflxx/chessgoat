// Puzzles por tema desde la API pública de Lichess (CORS permitido, sin cuenta).
import { applyUci, type PuzzleSpec } from '../core/puzzle';
import type { FetchFn } from './online';

export interface PuzzleTheme { slug: string; name: string; desc: string }

export const PUZZLE_THEMES: PuzzleTheme[] = [
  { slug: 'mix', name: 'Mezcla', desc: 'Temas variados, como en una partida real.' },
  { slug: 'hangingPiece', name: 'Pieza colgada', desc: 'Captura la pieza que el rival dejó sin defensa.' },
  { slug: 'fork', name: 'Horquilla', desc: 'Ataca dos piezas a la vez.' },
  { slug: 'pin', name: 'Clavada', desc: 'Una pieza no puede moverse sin exponer otra más valiosa.' },
  { slug: 'skewer', name: 'Enfilada', desc: 'Ataca una pieza valiosa y gana la que está detrás.' },
  { slug: 'mateIn1', name: 'Mate en 1', desc: 'Encuentra el mate inmediato.' },
  { slug: 'mateIn2', name: 'Mate en 2', desc: 'Mate en dos jugadas.' },
  { slug: 'kingsideAttack', name: 'Ataque al rey', desc: 'Ataques contra el enroque corto.' },
  { slug: 'defensiveMove', name: 'Defensa', desc: 'Encuentra la única jugada que salva la posición.' },
  { slug: 'advantage', name: 'Ganar ventaja', desc: 'Consigue una ventaja clara.' },
  { slug: 'crushing', name: 'Ventaja decisiva', desc: 'Remata una posición ganadora.' },
  { slug: 'endgame', name: 'Finales', desc: 'Técnica en el final.' },
  { slug: 'opening', name: 'Apertura', desc: 'Táctica en las primeras jugadas.' },
];

export const themeName = (slug: string) => PUZZLE_THEMES.find((t) => t.slug === slug)?.name || slug;

export type Difficulty = 'easiest' | 'easier' | 'normal' | 'harder' | 'hardest';
export const DIFFICULTY_ES: Record<Difficulty, string> = { easiest: 'Muy fácil', easier: 'Fácil', normal: 'Normal', harder: 'Difícil', hardest: 'Muy difícil' };

export class PuzzleError extends Error {}

interface LichessPuzzle { puzzle?: { id: string; fen?: string; solution: string[]; lastMove?: string; rating?: number; themes?: string[] } }

export function parseLichessPuzzle(j: LichessPuzzle): PuzzleSpec {
  const p = j.puzzle;
  if (!p || !p.fen || !Array.isArray(p.solution) || !p.solution.length) throw new PuzzleError('Lichess devolvió un puzzle incompleto.');
  // Comprueba que toda la solución es legal desde la posición.
  let fen = p.fen;
  for (const u of p.solution) {
    const r = applyUci(fen, u);
    if (!r) throw new PuzzleError('El puzzle de Lichess no es válido.');
    fen = r.fen;
  }
  return { id: 'li:' + p.id, fen: p.fen, solution: p.solution, lastMove: p.lastMove, rating: p.rating, themes: p.themes, source: 'lichess' };
}

export async function fetchLichessPuzzle(theme: string, difficulty: Difficulty = 'normal', fetchFn?: FetchFn): Promise<PuzzleSpec> {
  const f = fetchFn ?? ((u, i) => fetch(u, i));
  const q = new URLSearchParams();
  if (theme && theme !== 'mix') q.set('angle', theme);
  if (difficulty !== 'normal') q.set('difficulty', difficulty);
  let res: Response;
  try {
    res = await f(`https://lichess.org/api/puzzle/next${q.toString() ? '?' + q : ''}`, { headers: { Accept: 'application/json' } });
  } catch {
    throw new PuzzleError('No pude conectar con Lichess para traer puzzles. Revisa tu conexión.');
  }
  if (res.status === 429) throw new PuzzleError('Lichess pide esperar un poco antes de pedir más puzzles.');
  if (!res.ok) throw new PuzzleError('Lichess respondió con un error (' + res.status + ').');
  return parseLichessPuzzle((await res.json()) as LichessPuzzle);
}
