// Importación desde las API públicas de Chess.com y Lichess (ambas permiten CORS desde el navegador).
// Con COEP require-corp las respuestas deben ser CORS: ambas lo son.

import { splitPgn } from "../core/pgn";

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface ImportOptions {
  /** Máximo de partidas a traer. 0 = todas (con tope de seguridad). */
  max: number;
  /** '' = todos los ritmos; bullet | blitz | rapid | daily | classical */
  timeClass?: string;
  signal?: AbortSignal;
  onProgress?: (msg: string) => void;
  fetchFn?: FetchFn;
  /** Pausa entre peticiones a Chess.com (ms). Poner 0 en pruebas. */
  delayMs?: number;
}

export class ImportError extends Error {}

export const HARD_CAP = 500;
const USER_RE = /^[A-Za-z0-9_-]{2,40}$/;

export function validUsername(u: string): string {
  const t = u.trim();
  if (!USER_RE.test(t)) throw new ImportError('El usuario solo puede tener letras, números, guiones y guion bajo.');
  return t;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(f: FetchFn, url: string, signal?: AbortSignal, retry = true): Promise<T> {
  let res: Response;
  try {
    res = await f(url, { signal, headers: { Accept: 'application/json' } });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ImportError('No pude conectar con Chess.com. Revisa tu conexión.');
  }
  if (res.status === 429 && retry) {
    await sleep(2500);
    return getJson<T>(f, url, signal, false);
  }
  if (res.status === 404) throw new ImportError('No encontré ese usuario en Chess.com.');
  if (!res.ok) throw new ImportError('Chess.com respondió con un error (' + res.status + ').');
  return (await res.json()) as T;
}

interface CcGame { pgn?: string; time_class?: string; rules?: string; end_time?: number }

/** Descarga las partidas más recientes de Chess.com. Devuelve PGN en orden cronológico. */
export async function fetchChessCom(user: string, opts: ImportOptions): Promise<string> {
  const f = opts.fetchFn ?? ((u, i) => fetch(u, i));
  const name = validUsername(user).toLowerCase();
  const want = opts.max > 0 ? Math.min(opts.max, HARD_CAP) : HARD_CAP;
  opts.onProgress?.('Buscando los archivos de ' + name + '…');
  const idx = await getJson<{ archives?: string[] }>(f, `https://api.chess.com/pub/player/${encodeURIComponent(name)}/games/archives`, opts.signal);
  const archives = [...(idx.archives || [])].reverse(); // el más reciente primero
  if (!archives.length) throw new ImportError('Ese usuario no tiene partidas en Chess.com.');
  const got: CcGame[] = [];
  let month = 0;
  for (const url of archives) {
    if (got.length >= want) break;
    month++;
    opts.onProgress?.(`Descargando archivo ${month} de ${archives.length} (${got.length} partidas)…`);
    const data = await getJson<{ games?: CcGame[] }>(f, url, opts.signal);
    const list = (data.games || [])
      .filter((g) => g.pgn && (!g.rules || g.rules === 'chess') && (!opts.timeClass || g.time_class === opts.timeClass))
      .sort((a, b) => (b.end_time || 0) - (a.end_time || 0));
    got.push(...list);
    if ((opts.delayMs ?? 250) > 0 && got.length < want) await sleep(opts.delayMs ?? 250);
  }
  const chosen = got.slice(0, want).reverse();
  if (!chosen.length) throw new ImportError('No hay partidas de ajedrez estándar con ese filtro.');
  opts.onProgress?.(`${chosen.length} partidas descargadas.`);
  return chosen.map((g) => g.pgn!.trim()).join('\n\n');
}

const LI_PERF: Record<string, string> = { bullet: 'bullet', blitz: 'blitz', rapid: 'rapid', classical: 'classical', daily: 'correspondence' };

/** Descarga las partidas más recientes de Lichess. Devuelve PGN en orden cronológico. */
export async function fetchLichess(user: string, opts: ImportOptions): Promise<string> {
  const f = opts.fetchFn ?? ((u, i) => fetch(u, i));
  const name = validUsername(user);
  const max = opts.max > 0 ? Math.min(opts.max, HARD_CAP) : HARD_CAP;
  const q = new URLSearchParams({ max: String(max), clocks: 'true', evals: 'false', opening: 'false', tags: 'true', moves: 'true', finished: 'true' });
  if (opts.timeClass && LI_PERF[opts.timeClass]) q.set('perfType', LI_PERF[opts.timeClass]);
  opts.onProgress?.('Descargando partidas de ' + name + ' desde Lichess…');
  let res: Response;
  try {
    res = await f(`https://lichess.org/api/games/user/${encodeURIComponent(name)}?${q}`, { signal: opts.signal, headers: { Accept: 'application/x-chess-pgn' } });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ImportError('No pude conectar con Lichess. Revisa tu conexión.');
  }
  if (res.status === 404) throw new ImportError('No encontré ese usuario en Lichess.');
  if (res.status === 429) throw new ImportError('Lichess pide esperar un minuto antes de volver a descargar.');
  if (!res.ok) throw new ImportError('Lichess respondió con un error (' + res.status + ').');
  const text = (await res.text()).trim();
  if (!text) throw new ImportError('No hay partidas con ese filtro.');
  // Lichess devuelve primero las más recientes: se invierte para dejarlas en orden cronológico.
  opts.onProgress?.('Partidas descargadas.');
  return splitPgn(text).reverse().join('\n\n');
}
