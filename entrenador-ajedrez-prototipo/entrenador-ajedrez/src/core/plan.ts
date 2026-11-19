// Plan de estudio personalizado (texto en español). Cambia según la ventana: últimas 20, 30, 40 o 50 partidas.
import type { GameRec, Tag } from '../types';
import { PHASE_ES, aggregate, type Aggregate } from './analysis';
import { detectPatterns, type Pattern } from './patterns';
import { conversionReport, clockReport } from './report';

export type Window = 20 | 30 | 40 | 50;
export const WINDOWS: Window[] = [20, 30, 40, 50];

/**
 * Definición de cada ventana:
 *  - 20: enfoque corto. 2 prioridades y una semana muy concentrada.
 *  - 30: equilibrio. 3 prioridades.
 *  - 40: visión de un mes. 3 prioridades más revisión de aperturas.
 *  - 50: panorama. 4 prioridades, fase débil, patrones y reloj.
 */
export const WINDOW_INFO: Record<Window, { label: string; horizon: string; priorities: number; openings: boolean; extras: boolean }> = {
  20: { label: 'Enfoque corto', horizon: '1 a 2 semanas', priorities: 2, openings: false, extras: false },
  30: { label: 'Equilibrado', horizon: '2 a 3 semanas', priorities: 3, openings: false, extras: false },
  40: { label: 'Un mes', horizon: '4 semanas', priorities: 3, openings: true, extras: false },
  50: { label: 'Panorama', horizon: '5 a 6 semanas', priorities: 4, openings: true, extras: true },
};

interface Drill { title: string; why: (n: number) => string; drills: string[]; theme: string }
const T: Record<Exclude<Tag, 'ventaja_perdida'>, Drill> = {
  pieza_colgada: {
    title: 'Dejar de regalar piezas',
    why: (n) => 'Perdiste material por piezas sin defensa o atacadas en ' + n + ' errores.',
    drills: ['Antes de soltar la pieza, pregunta: ¿queda algo mío atacado o sin defensa?', 'Puzzles por tema "Pieza colgada" (Lichess: Practicar, Táctica por tema; en Chess.com, Puzzles).', 'Hazlo en la pestaña Repaso con tus propias posiciones.'],
    theme: 'Pieza colgada',
  },
  horquilla: {
    title: 'Ver horquillas y dobles ataques',
    why: (n) => 'El rival te atacó dos piezas a la vez en ' + n + ' errores.',
    drills: ['Antes de mover, busca a qué casillas puede saltar un caballo rival.', 'Puzzles por tema "Horquilla" (10 al día).', 'Mira qué piezas tuyas quedan en la misma línea o color de casilla.'],
    theme: 'Horquilla',
  },
  mate_rey: {
    title: 'Proteger tu rey',
    why: (n) => 'Hubo ' + n + ' errores que dieron mate o un ataque directo al rey.',
    drills: ['Antes de mover un peón de tu enroque (f, g, h) o una pieza que defiende, mira si dama y otra pieza apuntan a h7/g7 (o h2/g2).', 'Puzzles "Mate en 1" y "Mate en 2", y "Defender el mate".', 'Si la dama rival está cerca de tu rey, cuenta atacantes y defensores.'],
    theme: 'Mate en 1 y 2',
  },
  tactica_perdida: {
    title: 'Ver capturas y mates que te regala el rival',
    why: (n) => 'En ' + n + ' errores había una captura o un mate mejor que no jugaste.',
    drills: ['En cada turno revisa en orden: jaques, capturas y amenazas, tuyas y del rival.', 'Antes de jugar, pregunta qué pieza del rival está sin defensa.', 'Puzzles de ataque doble y pieza colgada del rival.'],
    theme: 'Táctica mixta',
  },
  peon_perdido: {
    title: 'Cuidar los peones',
    why: (n) => 'Regalaste peones en ' + n + ' errores.',
    drills: ['Cuenta atacantes y defensores de cada peón que mueves o dejas atrás.', 'Repasa estos casos en la pestaña Repaso.'],
    theme: 'Peones',
  },
  rey_expuesto: {
    title: 'Seguridad del rey',
    why: (n) => 'En ' + n + ' errores el rival entró con jaques cerca de tu rey.',
    drills: ['Enroca pronto y evita abrir líneas frente a tu rey.', 'No muevas los peones frente a tu rey sin una razón.', 'Practica "Mate en 2" para reconocer patrones.'],
    theme: 'Mate en 2',
  },
  posicional: {
    title: 'Mejorar la posición y el plan',
    why: (n) => 'En ' + n + ' errores no perdiste material, pero empeoraste la posición.',
    drills: ['Desarrolla todas las piezas antes de atacar.', 'Después de cada cambio de piezas, pregunta qué amenaza el rival ahora.', 'Estudia 10 minutos de finales básicos (rey y peón, torre activa).'],
    theme: 'Finales básicos',
  },
};

export const CHECKLIST = [
  '¿Qué amenaza el rival con su última jugada?',
  '¿Qué piezas mías están sin defensa o atacadas?',
  '¿Tengo un jaque, una captura o una amenaza?',
  '¿Mi jugada deja algo colgado o abre una línea a mi rey?',
];

export type Trend = 'peor' | 'mejor' | 'estable' | 'sin_datos';
export interface Priority {
  id: Tag | 'general';
  title: string;
  why: string;
  n: number;
  avg: number;
  drills: string[];
  theme: string;
  trend: Trend;
  /** Patrón recurrente que explica esta prioridad, si lo hay. */
  pattern?: string;
}
export interface Plan {
  window: Window;
  games: number;
  prevGames: number;
  priorities: Priority[];
  week: { day: string; items: { min: number; what: string }[] }[];
  openings: { name: string; n: number; record: string; tip: string }[];
  patterns: Pattern[];
  notes: string[];
  checklist: string[];
  goal: { elo: number; target: number; gap: number | null; errPerGame: number; errTarget: number } | null;
}

const tagRate = (A: Aggregate, k: Tag) => (A.n ? (A.tags[k]?.n || 0) / A.n : 0);

function trendOf(cur: Aggregate, prev: Aggregate, k: Tag): Trend {
  if (prev.n < 5) return 'sin_datos';
  const a = tagRate(cur, k);
  const b = tagRate(prev, k);
  if (b === 0 && a === 0) return 'estable';
  if (a > b * 1.25 + 0.02) return 'peor';
  if (a < b * 0.75 - 0.02) return 'mejor';
  return 'estable';
}

export function buildPlan(recs: GameRec[], opts: { window?: Window; minutes?: number; target?: number } = {}): Plan {
  const window = opts.window ?? 30;
  const info = WINDOW_INFO[window];
  const minutes = opts.minutes || 30;
  const target = opts.target || 1200;
  const cur = recs.slice(-window);
  const prevRecs = recs.slice(-2 * window, -window).slice(0, Math.max(0, recs.length - cur.length));
  const A = aggregate(cur);
  const P = aggregate(prevRecs);
  const patterns = detectPatterns(recs, window);
  const out: Plan = { window, games: cur.length, prevGames: prevRecs.length, priorities: [], week: [], openings: [], patterns: patterns.filter((p) => p.status !== 'resuelto').slice(0, 8), notes: [], checklist: CHECKLIST, goal: null };
  if (!A.n) return out;

  // Puntuación: pérdida acumulada + peso de errores graves; sube si empeora o si hay un patrón recurrente, baja si mejora.
  const entries = (Object.keys(A.tags) as Tag[]).map((k) => {
    const v = A.tags[k]!;
    const trend = trendOf(A, P, k);
    const pat = patterns.find((p) => p.tag === k && p.kind === 'casilla' && (p.status === 'persistente' || p.status === 'nuevo'));
    let score = v.loss + v.blunders * 10;
    if (trend === 'peor') score *= 1.25;
    if (trend === 'mejor') score *= 0.8;
    if (pat) score *= 1.3;
    return { k, n: v.n, loss: v.loss, score, trend, pat };
  });
  entries.sort((a, b) => b.score - a.score);
  for (const e of entries.slice(0, info.priorities)) {
    const d = T[e.k as keyof typeof T];
    if (!d) continue;
    out.priorities.push({
      id: e.k, title: d.title, why: d.why(e.n).replace(/(^|\D)1 errores/, '$11 error'), n: e.n, avg: Math.round(e.loss / e.n), drills: d.drills, theme: d.theme, trend: e.trend,
      pattern: e.pat ? e.pat.title + ' (' + e.pat.total + ' partidas)' : undefined,
    });
  }
  if (A.extra.ventaja_perdida >= 3) {
    out.priorities.push({
      id: 'ventaja_perdida', title: 'Convertir las ventajas', why: 'En ' + A.extra.ventaja_perdida + ' errores estabas mejor y la ventaja se redujo mucho.',
      n: A.extra.ventaja_perdida, avg: 0, trend: P.n >= 5 ? (A.extra.ventaja_perdida / A.n > P.extra.ventaja_perdida / P.n ? 'peor' : 'estable') : 'sin_datos',
      drills: ['Cuando estés ganando material, cambia piezas y simplifica.', 'Antes de atacar, comprueba que tu rey y tus piezas no quedan expuestos.', 'Toma el material gratuito cuando no haya trampa.'],
      theme: 'Convertir ventaja',
    });
  }
  if (!out.priorities.length) {
    out.priorities.push({ id: 'general', title: 'Mantener el nivel', why: 'No hay errores graves suficientes para marcar una prioridad.', n: 0, avg: 0, drills: ['Sigue con tácticas diarias y revisa tus partidas.'], theme: 'Táctica mixta', trend: 'sin_datos' });
  }

  const phaseWorst = (Object.entries(A.phases) as [keyof typeof A.phases, Aggregate['phases']['apertura']][])
    .map(([k, v]) => ({ k, err: v.m + v.x, rate: v.n ? (v.m + v.x) / v.n : 0 }))
    .sort((a, b) => b.rate - a.rate)[0];
  if (phaseWorst && phaseWorst.err > 0) {
    out.notes.push('Tu fase más débil es ' + PHASE_ES[phaseWorst.k].toLowerCase() + ': ' + phaseWorst.err + ' errores o más graves, ' + Math.round(phaseWorst.rate * 1000) / 10 + ' de cada 100 jugadas.');
  }
  if (prevRecs.length >= 5) {
    const d = (A.acc - P.acc);
    if (Math.abs(d) >= 1) out.notes.push('Frente a las ' + prevRecs.length + ' partidas anteriores, tu precisión ' + (d > 0 ? 'sube ' : 'baja ') + Math.abs(Math.round(d * 10) / 10) + ' puntos.');
  } else {
    out.notes.push('Todavía no hay una tanda anterior con 5 partidas para comparar. El plan usa solo tus últimas ' + cur.length + '.');
  }
  const rec = patterns.filter((p) => p.status === 'persistente');
  if (rec.length) out.notes.push('Patrones persistentes: ' + rec.length + '. El más repetido: ' + rec[0].title + '.');

  if (info.openings) {
    for (const o of Object.values(A.openings)) {
      const score = (o.W + o.D / 2) / o.n;
      if (o.n >= 2 && score <= 0.25) {
        let tip = 'Revisa las 8 a 10 primeras jugadas de esta línea y busca una variante más simple para ti.';
        if (o.name.includes('1.d4 c5')) tip = 'Prueba un esquema más sólido contra 1.d4, como 1...d5 con ...Nf6 y ...e6, y aprende un plan fijo.';
        out.openings.push({ name: o.name, n: o.n, record: o.W + '-' + o.D + '-' + o.L, tip });
      }
    }
  }
  if (info.extras) {
    const conv = conversionReport(cur);
    if (conv.advantaged >= 3 && conv.rate < 60) out.notes.push('Conviertes solo el ' + conv.rate + ' % de tus ventajas grandes (' + conv.converted + ' de ' + conv.advantaged + ').');
    const clk = clockReport(cur);
    if (clk.trouble.moves >= 15 && clk.trouble.rate > clk.normal.rate * 1.5 + 1) {
      out.notes.push('Con poco tiempo cometes ' + clk.trouble.rate + ' errores por cada 100 jugadas, frente a ' + clk.normal.rate + ' con tiempo normal. Practica ritmos con más margen.');
    }
  }

  const m = (f: number) => Math.max(5, Math.round((minutes * f) / 5) * 5);
  const th = out.priorities.map((p) => p.theme);
  const t1 = th[0] || 'Táctica mixta';
  const t2 = th[1] || t1;
  const t3 = th[2] || t2;
  const openName = out.openings[0] ? out.openings[0].name : 'tu línea más frecuente';
  const focus20 = window === 20;
  out.week = [
    { day: 'Lunes', items: [{ min: m(0.5), what: 'Puzzles de ' + t1 }, { min: m(0.3), what: 'Repaso de tus errores en la app' }, { min: m(0.2), what: 'Lee y aplica la lista de revisión' }] },
    { day: 'Martes', items: [{ min: m(0.6), what: focus20 ? 'Puzzles de ' + t2 + ', con la lista de revisión en cada uno' : 'Tácticas mixtas, con la lista de revisión en cada puzzle' }, { min: m(0.4), what: 'Una partida de 15+10 aparte, con la lista antes de cada jugada' }] },
    { day: 'Miércoles', items: [{ min: m(0.5), what: 'Puzzles de ' + t2 }, { min: m(0.3), what: info.openings ? 'Repaso de apertura: ' + openName : 'Finales básicos o repaso de apertura' }, { min: m(0.2), what: 'Repaso de tus errores en la app' }] },
    { day: 'Jueves', items: [{ min: m(0.5), what: 'Revisa tu última partida en la pestaña Partidas' }, { min: m(0.3), what: 'Repaso de tus errores en la app' }, { min: m(0.2), what: 'Puzzles de ' + t1 }] },
    { day: 'Viernes', items: [{ min: m(0.5), what: 'Puzzles de ' + t3 }, { min: m(0.3), what: info.extras && out.patterns[0] ? 'Repasa tu patrón recurrente: ' + out.patterns[0].title : 'Repaso de apertura: ' + openName }, { min: m(0.2), what: 'Repaso de tus errores en la app' }] },
    { day: 'Sábado', items: [{ min: m(0.4), what: 'Dos partidas de 15+10 aparte' }, { min: m(0.6), what: 'Importa las partidas y revisa los dos errores más grandes de cada una' }] },
    { day: 'Domingo', items: [{ min: 15, what: 'Descanso, o puzzles ligeros' }] },
  ];

  const errPerGame = (A.counts.m + A.counts.x) / A.n;
  out.goal = {
    elo: A.elo, target, gap: A.elo ? Math.max(0, target - A.elo) : null,
    errPerGame: Math.round(errPerGame * 10) / 10, errTarget: Math.round(errPerGame * 0.5 * 10) / 10,
  };
  return out;
}
