import type { GameRec } from '../types';
import { CLASS_ES, winPct, isErr } from '../core/analysis';
import { esc } from './dom';

export interface BarRow { name: string; val: string; tip?: string; segs: { v: number; c?: string }[] }

export function barRows(rows: BarRow[], max: number): string {
  return `<div class="bars">${rows
    .map(
      (r) => `<div class="brow" data-tip="${esc(r.tip || '')}"><span class="name">${esc(r.name)}</span><span class="val">${esc(r.val)}</span><div class="track" aria-hidden="true">${r.segs
        .map((g) => `<div class="seg" style="width:${Math.max(0, (g.v / max) * 100)}%;background:${g.c || 'var(--accent)'}"></div>`)
        .join('')}</div></div>`,
    )
    .join('')}</div>`;
}

export function trendSVG(trend: { id: string; acc: number; result: string; err: number }[]): string {
  const W = 640, H = 220, L = 34, R = 12, T = 12, B = 26, n = trend.length;
  const ys = trend.map((t) => t.acc);
  const lo = Math.max(0, Math.floor((Math.min(...ys) - 5) / 10) * 10);
  const hi = 100;
  const X = (i: number) => L + (n === 1 ? (W - L - R) / 2 : (i / (n - 1)) * (W - L - R));
  const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const roll = trend.map((_, i) => {
    const a = trend.slice(Math.max(0, i - 4), i + 1);
    return a.reduce((s, t) => s + t.acc, 0) / a.length;
  });
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Precisión por partida, de la primera a la última. Media de las últimas cinco en línea continua.">`;
  for (let v = lo; v <= hi; v += 10) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  s += `<path d="${roll.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round"/>`;
  s += `<path d="${ys.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ')}" fill="none" stroke="var(--axis)" stroke-width="1.2" stroke-dasharray="3 3"/>`;
  trend.forEach((t, i) => {
    const x = X(i), y = Y(t.acc);
    const tip = `Partida ${i + 1}: precisión ${t.acc}%, ${t.result === 'W' ? 'victoria' : t.result === 'L' ? 'derrota' : 'tablas'}, ${t.err} errores`;
    const col = t.result === 'W' ? 'var(--good)' : t.result === 'L' ? 'var(--crit)' : 'var(--muted)';
    const a = `class="pt" tabindex="0" role="link" aria-label="${esc(tip)}" data-tip="${esc(tip)}" data-go="${esc(t.id)}"`;
    if (t.result === 'L') s += `<rect ${a} x="${x - 5}" y="${y - 5}" width="10" height="10" rx="2" fill="${col}" stroke="var(--surface)" stroke-width="2"/>`;
    else if (t.result === 'D') s += `<circle ${a} cx="${x}" cy="${y}" r="5" fill="var(--surface)" stroke="${col}" stroke-width="2"/>`;
    else s += `<circle ${a} cx="${x}" cy="${y}" r="5" fill="${col}" stroke="var(--surface)" stroke-width="2"/>`;
  });
  return s + `<text x="${L}" y="${H - 6}">Partida 1</text><text x="${W - 12}" y="${H - 6}" text-anchor="end">Partida ${n}</text></svg>`;
}

/** Gráfico de evaluación desde tu lado. Los puntos de error son botones accesibles. */
export function evalSVG(rec: GameRec, sel: number): string {
  const W = 640, H = 170, n = rec.moves.length, sign = rec.color === 'w' ? 1 : -1;
  const X = (i: number) => 8 + (n <= 1 ? 0 : (i / (n - 1)) * (W - 16));
  const Y = (cp: number) => 6 + (1 - winPct(sign * cp) / 100) * (H - 12);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="group" aria-label="Evaluación de la partida desde tu lado"><rect x="0" y="0" width="${W}" height="${H}" fill="transparent" data-action="evalhit"/><line x1="8" x2="${W - 8}" y1="${H / 2}" y2="${H / 2}" stroke="var(--axis)"/>`;
  const pts = rec.moves.map((m, i) => `${X(i).toFixed(1)} ${Y(m.e).toFixed(1)}`);
  s += `<path d="M${pts.join(' L')} L${X(n - 1)} ${H - 6} L8 ${H - 6} Z" fill="var(--accent)" opacity=".12"/><path d="M${pts.join(' L')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>`;
  rec.moves.forEach((m, i) => {
    if (!isErr(m.c)) return;
    const tip = `Jugada ${Math.floor(i / 2) + 1}: ${m.s} (${CLASS_ES[m.c!]})`;
    s += `<circle class="pt" tabindex="0" role="button" aria-label="${esc(tip)}" data-action="ply" data-ply="${i + 1}" cx="${X(i)}" cy="${Y(m.e)}" r="5" fill="${m.c === 'x' ? 'var(--crit)' : m.c === 'm' ? 'var(--serious)' : 'var(--warn)'}" stroke="var(--surface)" stroke-width="1.5" data-tip="${esc(tip)}"/>`;
  });
  if (sel > 0) s += `<line x1="${X(sel - 1)}" x2="${X(sel - 1)}" y1="2" y2="${H - 2}" stroke="var(--ink)" stroke-width="1.5" opacity=".6"/>`;
  return s + `<text x="10" y="14">Tu ventaja</text><text x="10" y="${H - 8}">Desventaja</text></svg>`;
}

export const legendErrors = () =>
  '<div class="legend"><span><span class="dot c-x"></span>Error grave</span><span><span class="dot c-m"></span>Error</span><span><span class="dot c-i"></span>Imprecisión</span></div>';
