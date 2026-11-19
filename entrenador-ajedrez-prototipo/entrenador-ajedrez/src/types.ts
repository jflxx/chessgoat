export type Color = 'w' | 'b';
/** k = brillante, h = genial, b = mejor, g = buena, i = imprecisión, m = error, x = error grave */
export type Cls = 'k' | 'h' | 'b' | 'g' | 'i' | 'm' | 'x';
export type Tag =
  | 'pieza_colgada'
  | 'horquilla'
  | 'mate_rey'
  | 'tactica_perdida'
  | 'peon_perdido'
  | 'rey_expuesto'
  | 'posicional'
  | 'ventaja_perdida';
export type Phase = 'apertura' | 'medio' | 'final';
export type Result = 'W' | 'D' | 'L';
export type Source = 'chesscom' | 'lichess' | 'pgn';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Ply {
  san: string;
  uci: string;
  color: Color;
  piece: PieceType;
  captured: PieceType | null;
  from: string;
  to: string;
  before: string;
  after: string;
}

export interface ParsedGame {
  id: string;
  headers: Record<string, string>;
  plies: Ply[];
  startFen: string;
  ts: number;
  /** Segundos que quedaban en el reloj tras cada jugada (null si el PGN no trae reloj). */
  clocks: (number | null)[];
  source: Source;
  url?: string;
}

/** Jugada guardada. Nombres cortos para ocupar poco en IndexedDB. */
export interface MoveRec {
  s: string; // SAN
  e: number; // evaluación en centipeones desde las blancas tras la jugada
  c?: Cls; // clasificación (solo jugadas del usuario)
  d?: number; // pérdida de probabilidad de ganar (puntos)
  ph?: 'a' | 'm' | 'f';
  b?: string; // mejor jugada UCI
  bs?: string; // mejor jugada SAN
  t?: Tag[];
  p?: Tag; // motivo principal
  r?: string; // respuesta del rival SAN
  k?: PieceType; // pieza que se pierde
  mp?: 1; // la pieza movida es la que se pierde
  sac?: PieceType; // pieza que ofreces en una jugada brillante
  ms?: 'mate' | 'cap';
  hs?: string; // casilla clave del motivo (donde se pierde la pieza, casilla del rey...)
  fp?: PieceType; // pieza rival que hace la horquilla
  f?: string; // posición antes de la jugada (FEN sin contadores)
  sp?: number; // segundos gastados en la jugada
  cl?: number; // segundos restantes tras la jugada
}

export interface PhaseStats {
  n: number;
  i: number;
  m: number;
  x: number;
  loss: number;
}

export interface GameRec {
  id: string;
  ts: number;
  date: string;
  tc: string;
  color: Color;
  opp: string;
  oppElo: number;
  elo: number;
  result: Result;
  term: string;
  opening: string;
  n: number;
  depth: number;
  acc: number;
  counts: Record<Cls, number>;
  byPhase: Record<Phase, PhaseStats>;
  first: number | null;
  moves: MoveRec[];
  src: Source;
  url?: string;
  /** Quién es el usuario en esta partida (nombre en minúsculas). */
  user: string;
  /** Versión del algoritmo con el que se analizó (ver ALGO_VERSION). */
  v?: number;
  /** 1 = ya se buscaron jugadas brillantes y geniales. */
  gr?: 1;
}

export interface EngineLine {
  cp: number;
  mate: number | null;
  pv: string[];
  depth: number;
}

export interface EngineResult extends EngineLine {
  /** Varias líneas cuando se pide MultiPV > 1. */
  lines?: EngineLine[];
}

export interface EngineLike {
  analyse(fen: string, depth: number, multipv?: number): Promise<EngineResult>;
}

export type EngineMode = 'auto' | 'single' | 'multi';

export interface Settings {
  user: string;
  source: Source;
  n: number;
  depth: number;
  cores: number;
  engineMode: EngineMode;
  minutes: number;
  target: number;
  window: 20 | 30 | 40 | 50;
  timeClass: string; // '' = todos, rapid, blitz, bullet, daily...
  theme: 'system' | 'light' | 'dark';
  chesscomUser: string;
  lichessUser: string;
  sound: boolean;
  animations: boolean;
  boardTheme: 'verde' | 'marron' | 'azul' | 'gris' | 'marino';
  puzzleDifficulty: 'easiest' | 'easier' | 'normal' | 'harder' | 'hardest';
  puzzleRating: number;
  /** Reevaluar los errores con más profundidad al analizar (más preciso, algo más lento). */
  verify: boolean;
  /** Líneas del motor en vivo (1 a 3). Menos líneas = más rápido. */
  liveLines: 1 | 2 | 3;
  /** Motor en vivo encendido en la revisión de partidas. */
  liveOn: boolean;
  /** Copia en la nube (Supabase). Todo vacío = desactivada. */
  cloudUrl: string;
  cloudKey: string;
  cloudCode: string;
  cloudAuto: boolean;
  cloudLast: string;
}

export interface TrainerItem {
  key: string;
  box: number;
  due: number;
}

export interface BackupFile {
  app: 'entrenador-ajedrez';
  version: 1;
  exportedAt: string;
  settings: Settings | null;
  games: GameRec[];
  trainer: TrainerItem[];
  activity: string[];
  plan?: import('./core/tasks').PlanState | null;
}
