// Informes derivados: conversión de ventajas y gestión del reloj.
import type { GameRec } from '../types';
import { isBigErr, winPct } from './analysis';
import { parseTimeControl } from './pgn';

export interface ConversionReport {
  advantaged: number; // partidas en las que llegaste a >= 75 % de probabilidad de ganar
  converted: number;
  drawn: number;
  lost: number;
  rate: number; // % de ventajas convertidas en victoria
  throwaways: { gid: string; opp: string; peak: number; result: string; i: number; lostAt?: { i: number; s: string; bs?: string; d: number; ph?: 'a' | 'm' | 'f' } }[];
  comebacks: number; // partidas ganadas estando < 25 %
  worstCount: number;
  /** Tasa de conversión según lo grande que fuera la ventaja (60, 75 y 90 %). */
  thresholds: { t: number; adv: number; conv: number; rate: number }[];
  /** Una entrada por partida: ventaja máxima que tuviste y cómo acabó. */
  scatter: { idx: number; id: string; peak: number; result: string; opp: string }[];
  /** En qué fase se perdió la ventaja (primer error posterior al punto máximo). */
  lostPhase: { a: number; m: number; f: number };
  comebackGames: { gid: string; opp: string; low: number }[];
}

export function conversionReport(recs: GameRec[], threshold = 75): ConversionReport {
  const r: ConversionReport = { advantaged: 0, converted: 0, drawn: 0, lost: 0, rate: 0, throwaways: [], comebacks: 0, worstCount: 0, thresholds: [], scatter: [], lostPhase: { a: 0, m: 0, f: 0 }, comebackGames: [] };
  const th = [60, 75, 90].map((t) => ({ t, adv: 0, conv: 0, rate: 0 }));
  let idx = 0;
  for (const g of recs) {
    idx++;
    const sign = g.color === 'w' ? 1 : -1;
    let peak = 0;
    let peakI = 0;
    let low = 100;
    g.moves.forEach((m, i) => {
      const w = winPct(sign * m.e);
      if (w > peak) { peak = w; peakI = i; }
      if (w < low) low = w;
    });
    r.scatter.push({ idx, id: g.id, peak: Math.round(peak), result: g.result, opp: g.opp });
    for (const x of th) if (peak >= x.t) { x.adv++; if (g.result === 'W') x.conv++; }
    if (peak >= threshold) {
      r.advantaged++;
      if (g.result === 'W') r.converted++;
      else {
        if (g.result === 'D') r.drawn++; else r.lost++;
        // El primer error serio después del punto máximo es donde se escapó la ventaja.
        let lostAt: ConversionReport['throwaways'][number]['lostAt'];
        for (let j = peakI + 1; j < g.moves.length; j++) {
          const m = g.moves[j];
          if (isBigErr(m.c)) { lostAt = { i: j, s: m.s, bs: m.bs, d: m.d || 0, ph: m.ph }; break; }
        }
        if (lostAt?.ph) r.lostPhase[lostAt.ph]++;
        r.throwaways.push({ gid: g.id, opp: g.opp, peak: Math.round(peak), result: g.result, i: peakI, lostAt });
      }
    }
    if (g.result === 'W' && low <= 25) { r.comebacks++; r.comebackGames.push({ gid: g.id, opp: g.opp, low: Math.round(low) }); }
  }
  for (const x of th) x.rate = x.adv ? Math.round((x.conv / x.adv) * 100) : 0;
  r.thresholds = th;
  r.rate = r.advantaged ? Math.round((r.converted / r.advantaged) * 100) : 0;
  r.throwaways.sort((a, b) => b.peak - a.peak);
  r.worstCount = r.throwaways.length;
  return r;
}

export interface ClockReport {
  games: number; // partidas con reloj
  moves: number;
  trouble: { moves: number; errors: number; rate: number }; // poco tiempo
  normal: { moves: number; errors: number; rate: number };
  fast: { moves: number; errors: number; rate: number }; // jugadas casi instantáneas
  avgErrorTime: number;
  avgOkTime: number;
  flagLosses: number; // derrotas por tiempo
  timeoutLossesWinning: number;
}

const rate = (e: number, n: number) => (n ? Math.round((e / n) * 1000) / 10 : 0);

/** Poco tiempo = menos de 30 s o menos del 10 % del tiempo base. Rápida = 2 s o menos. */
export function clockReport(recs: GameRec[]): ClockReport {
  const c: ClockReport = {
    games: 0, moves: 0, trouble: { moves: 0, errors: 0, rate: 0 }, normal: { moves: 0, errors: 0, rate: 0 }, fast: { moves: 0, errors: 0, rate: 0 },
    avgErrorTime: 0, avgOkTime: 0, flagLosses: 0, timeoutLossesWinning: 0,
  };
  let errT = 0, errN = 0, okT = 0, okN = 0;
  for (const g of recs) {
    const base = parseTimeControl(g.tc).base;
    const hasClock = g.moves.some((m) => m.cl != null);
    if (!hasClock) continue;
    c.games++;
    if (g.result === 'L' && /tiempo|time/i.test(g.term)) {
      c.flagLosses++;
      const sign = g.color === 'w' ? 1 : -1;
      const last = g.moves[g.moves.length - 1];
      if (last && winPct(sign * last.e) >= 60) c.timeoutLossesWinning++;
    }
    for (const m of g.moves) {
      if (!m.c || m.sp == null || m.cl == null) continue;
      const err = isBigErr(m.c);
      c.moves++;
      const low = m.cl < 30 || (base > 0 && m.cl < base * 0.1);
      const b = low ? c.trouble : c.normal;
      b.moves++;
      if (err) b.errors++;
      if (m.sp <= 2) {
        c.fast.moves++;
        if (err) c.fast.errors++;
      }
      if (err) { errT += m.sp; errN++; } else { okT += m.sp; okN++; }
    }
  }
  c.trouble.rate = rate(c.trouble.errors, c.trouble.moves);
  c.normal.rate = rate(c.normal.errors, c.normal.moves);
  c.fast.rate = rate(c.fast.errors, c.fast.moves);
  c.avgErrorTime = errN ? Math.round((errT / errN) * 10) / 10 : 0;
  c.avgOkTime = okN ? Math.round((okT / okN) * 10) / 10 : 0;
  return c;
}
