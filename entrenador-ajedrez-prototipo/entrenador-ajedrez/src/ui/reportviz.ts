// Visualizaciones del informe: velocímetro, línea de Elo, hileras de partidas, barras por ritmo y mapa de actividad.
import { timeClassOf } from '../core/pgn';
import type { GameRec } from '../types';
import { dayKey, esc } from './dom';

/** Velocímetro semicircular de 0 a 100. */
export function gaugeSVG(value: number, label: string): string {
  const cx = 120, cy = 124, r = 84;
  const pt = (v: number, rad = r) => {
    const a = Math.PI * (1 - v / 100);
    return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)];
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = pt(from);
    const [x2, y2] = pt(to);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const v = Math.max(0, Math.min(100, value));
  let s = `<svg class="gauge" viewBox="-8 0 256 148" role="img" aria-label="${esc(label)}: ${Math.round(v)} de 100">`;
  s += `<path d="${arc(0, 100)}" fill="none" stroke="var(--grid)" stroke-width="16" stroke-linecap="round"/>`;
  if (v > 0.5) s += `<path d="${arc(0, v)}" fill="none" stroke="var(--accent)" stroke-width="16" stroke-linecap="round"/>`;
  for (const t of [0, 25, 50, 75, 100]) {
    const [x1, y1] = pt(t, r + 14);
    const [x2, y2] = pt(t, r + 20);
    const [tx, ty] = pt(t, r + 32);
    s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--axis)" stroke-width="1.5"/><text x="${tx.toFixed(1)}" y="${(ty + 3).toFixed(1)}" text-anchor="middle">${t}</text>`;
  }
  const [nx, ny] = pt(v, r - 24);
  s += `<line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="5" fill="var(--ink)"/>`;
  return s + '</svg>';
}

/** Línea con área (por ejemplo, el Elo en cada partida). */
export function lineSVG(values: number[], ariaLabel: string, first: string, last: string): string {
  const W = 520, H = 200, L = 40, R = 14, T = 14, B = 26, n = values.length;
  if (n < 2) return '<p class="sub">Hacen falta al menos 2 partidas con Elo para dibujar la línea.</p>';
  const lo = Math.min(...values), hi = Math.max(...values);
  const pad = Math.max(10, Math.round((hi - lo) * 0.15));
  const a = lo - pad, b = hi + pad;
  const X = (i: number) => L + (i / (n - 1)) * (W - L - R);
  const Y = (v: number) => T + (1 - (v - a) / (b - a)) * (H - T - B);
  const pts = values.map((v, i) => `${X(i).toFixed(1)} ${Y(v).toFixed(1)}`);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(ariaLabel)}">`;
  for (let k = 0; k <= 3; k++) {
    const v = a + ((b - a) * k) / 3;
    s += `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--grid)"/><text x="${L - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${Math.round(v)}</text>`;
  }
  s += `<path d="M${pts.join(' L')} L${X(n - 1)} ${H - B} L${L} ${H - B} Z" fill="var(--accent)" opacity=".12"/><path d="M${pts.join(' L')}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round"/>`;
  s += `<circle cx="${X(n - 1).toFixed(1)}" cy="${Y(values[n - 1]).toFixed(1)}" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>`;
  s += `<text x="${L}" y="${H - 6}">${esc(first)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${esc(last)}</text></svg>`;
  return s;
}

/** Hilera de cuadros: verde ganada, rojo perdida, gris tablas. Cada cuadro abre la partida. */
export function resultsRow(recs: GameRec[]): string {
  return `<div class="results" role="list">${recs.map((g) => `<a role="listitem" class="rs ${g.result}" href="#/partida/${esc(g.id)}" data-tip="${esc(`${g.opp}: ${g.result === 'W' ? 'victoria' : g.result === 'L' ? 'derrota' : 'tablas'}, ${g.acc}% de precisión`)}" aria-label="${esc(`${g.opp}, ${g.result === 'W' ? 'victoria' : g.result === 'L' ? 'derrota' : 'tablas'}`)}"></a>`).join('')}</div>`;
}

const CLASS_ES: Record<string, string> = { bullet: 'Bala', blitz: 'Blitz', rapid: 'Rápidas', classical: 'Clásicas', daily: 'Correspondencia' };
export const classLabel = (c: string) => CLASS_ES[c] || c;
export const classOf = (g: GameRec) => timeClassOf(g.tc);

/** Elo actual por ritmo (el de la última partida de cada ritmo), en columnas. */
export function elosByClass(all: GameRec[]): string {
  const order = ['bullet', 'blitz', 'rapid', 'classical', 'daily'];
  const info = order.map((c) => {
    const gs = all.filter((g) => classOf(g) === c);
    const last = [...gs].reverse().find((g) => g.elo > 0);
    return { c, n: gs.length, elo: last?.elo || 0 };
  }).filter((x) => x.n > 0);
  if (!info.length) return '<p class="sub">Todavía no hay partidas.</p>';
  const max = Math.max(...info.map((x) => x.elo), 1);
  const min = Math.min(...info.filter((x) => x.elo).map((x) => x.elo), max);
  const base = Math.max(0, min - (max - min) * 0.6 - 100);
  return `<div class="elocols">${info.map((x) => {
    const h = x.elo ? Math.max(10, Math.round(((x.elo - base) / (max - base)) * 100)) : 6;
    return `<div class="elocol"><span class="ev">${x.elo || '—'}</span><div class="eb"><i style="height:${h}%"></i></div><span class="en">${classLabel(x.c)}</span><span class="ec">${x.n} ${x.n === 1 ? 'partida' : 'partidas'}</span></div>`;
  }).join('')}</div>`;
}

/** Calendario de actividad: partidas jugadas por día y días de práctica en la app. */
export function activityMap(all: GameRec[], practice: Set<string>, weeks = 20): string {
  const perDay = new Map<string, number>();
  for (const g of all) {
    if (!g.ts) continue;
    const k = dayKey(new Date(g.ts));
    perDay.set(k, (perDay.get(k) || 0) + 1);
  }
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - dow - (weeks - 1) * 7);
  let cells = '';
  let months = '';
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const d0 = new Date(start);
    d0.setDate(start.getDate() + w * 7);
    const m = d0.getMonth();
    months += `<span>${m !== lastMonth ? d0.toLocaleDateString('es', { month: 'short' }) : ''}</span>`;
    lastMonth = m;
    for (let r = 0; r < 7; r++) {
      const d = new Date(start);
      d.setDate(start.getDate() + w * 7 + r);
      if (d > today) { cells += '<i class="hm future"></i>'; continue; }
      const k = dayKey(d);
      const n = perDay.get(k) || 0;
      const lvl = n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4;
      const p = practice.has(k);
      cells += `<i class="hm l${lvl}${p ? ' pr' : ''}" data-tip="${esc(`${d.toLocaleDateString('es', { day: 'numeric', month: 'short' })}: ${n} ${n === 1 ? 'partida' : 'partidas'}${p ? ' · practicaste' : ''}`)}"></i>`;
    }
  }
  const total = [...perDay.values()].reduce((a, b) => a + b, 0);
  return `<div class="heat" style="--weeks:${weeks}" role="img" aria-label="Actividad de las últimas ${weeks} semanas: ${total} partidas y ${practice.size} días de práctica"><div class="hm-months">${months}</div><div class="hm-grid">${cells}</div></div>
    <div class="legend"><span><i class="hm l2"></i>Partidas jugadas</span><span><i class="hm l0 pr"></i>Día de práctica</span></div>`;
}

// ---------- gráficos genéricos para las pestañas ----------
export interface ColItem { label: string; value: number; text?: string; sub?: string; tone?: 'accent' | 'crit' | 'warn' | 'good' | 'muted'; labelHTML?: string }

/** Columnas verticales. \`max\` fija la escala; si no, la del mayor valor. */
export function colChart(items: ColItem[], opts: { max?: number; height?: number } = {}): string {
  const max = Math.max(opts.max ?? 0, ...items.map((i) => i.value), 0.0001);
  const h = opts.height ?? 150;
  return `<div class="cols" style="--h:${h}px">${items.map((it) => `<div class="col"><span class="cv">${esc(it.text ?? String(it.value))}</span><div class="cb"><i class="t-${it.tone || 'accent'}" style="height:${it.value > 0 ? Math.max(4, (it.value / max) * 100) : 0}%"></i></div><span class="cl">${it.labelHTML ?? esc(it.label)}</span>${it.sub ? `<span class="cs">${esc(it.sub)}</span>` : ''}</div>`).join('')}</div>`;
}

/** Una barra apilada por partida (graves, errores, imprecisiones). Cada barra abre la partida. */
export function stackedGames(perGame: { id: string; x: number; m: number; i: number; result: string; opp: string }[]): string {
  const n = perGame.length;
  const W = 640, H = 190, L = 28, R = 8, T = 10, B = 22;
  const max = Math.max(3, ...perGame.map((g) => g.x + g.m + g.i));
  const bw = Math.min(26, (W - L - R) / n - 3);
  const X = (i: number) => L + (i + 0.5) * ((W - L - R) / n);
  const Y = (v: number) => T + (1 - v / max) * (H - T - B);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="group" aria-label="Errores en cada partida, de la más antigua a la más reciente">`;
  for (let v = 0; v <= max; v += Math.max(1, Math.ceil(max / 4))) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${L - 5}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  perGame.forEach((g, i) => {
    let y0 = H - B;
    const seg = (v: number, c: string) => {
      if (!v) return '';
      const h = ((H - T - B) * v) / max;
      y0 -= h;
      return `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${c}"/>`;
    };
    const tip = `Partida ${i + 1} contra ${g.opp}: ${g.x} graves, ${g.m} errores, ${g.i} imprecisiones`;
    s += `<g class="pt" tabindex="0" role="link" aria-label="${esc(tip)}" data-tip="${esc(tip)}" data-go="${esc(g.id)}"><rect x="${(X(i) - bw / 2 - 1.5).toFixed(1)}" y="${T}" width="${(bw + 3).toFixed(1)}" height="${H - T - B}" fill="transparent"/>${seg(g.x, 'var(--crit)')}${seg(g.m, 'var(--serious)')}${seg(g.i, 'var(--warn-solid)')}<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${H - B + 3}" width="${bw.toFixed(1)}" height="3" fill="${g.result === 'W' ? 'var(--good)' : g.result === 'L' ? 'var(--crit)' : 'var(--axis)'}"/></g>`;
  });
  return s + `<text x="${L}" y="${H - 4}">Partida 1</text><text x="${W - R}" y="${H - 4}" text-anchor="end">Partida ${n}</text></svg>`;
}

/** Tablero 8x8 coloreado según cuántas veces pasó algo en cada casilla. */
export function boardHeat(squares: Record<string, number>, flip = false): string {
  const max = Math.max(1, ...Object.values(squares));
  let s = '<div class="heatboard" role="img" aria-label="Casillas donde pierdes material o recibes ataques">';
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const fr = flip ? 7 - f : f;
      const rr = flip ? 7 - r : r;
      const sq = 'abcdefgh'[fr] + (8 - rr);
      const n = squares[sq] || 0;
      const light = (fr + rr) % 2 === 0;
      s += `<span class="hb ${light ? 'l' : 'd'}" ${n ? `data-tip="${esc(`${sq}: ${n} ${n === 1 ? 'vez' : 'veces'}`)}"` : ''}>${n ? `<i style="opacity:${(0.25 + (0.75 * n) / max).toFixed(2)}"></i><b>${n}</b>` : ''}${f === 0 ? `<em class="r">${8 - rr}</em>` : ''}${r === 7 ? `<em class="f">${'abcdefgh'[fr]}</em>` : ''}</span>`;
    }
  }
  return s + '</div>';
}

/** Anillo con hasta 7 partes y una leyenda. */
export function donut(parts: { label: string; value: number; color: string }[], center: string, sub: string): string {
  const total = parts.reduce((a, b) => a + b.value, 0) || 1;
  const R = 44, C = 2 * Math.PI * R;
  let off = 0;
  let arcs = '';
  for (const p of parts) {
    if (!p.value) continue;
    const len = (p.value / total) * C;
    arcs += `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${p.color}" stroke-width="16" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 60 60)"/>`;
    off += len;
  }
  const legend = parts.filter((p) => p.value).map((p) => `<li><i style="background:${p.color}"></i><span>${esc(p.label)}</span><b>${p.value}</b></li>`).join('');
  return `<div class="donut"><svg viewBox="0 0 120 120" role="img" aria-label="${esc(center + ' ' + sub)}"><circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--grid)" stroke-width="16"/>${arcs}<text x="60" y="60" text-anchor="middle" class="dc">${esc(center)}</text><text x="60" y="76" text-anchor="middle" class="ds">${esc(sub)}</text></svg><ul class="dleg">${legend}</ul></div>`;
}

/** Dispersión: ventaja máxima (eje vertical) frente a la partida (eje horizontal), coloreada por resultado. */
export function scatterSVG(points: { idx: number; id: string; peak: number; result: string; opp: string }[], threshold = 75): string {
  const W = 640, H = 230, L = 36, R = 12, T = 12, B = 26;
  const n = Math.max(2, points.length);
  const X = (i: number) => L + ((i - 1) / (n - 1)) * (W - L - R);
  const Y = (v: number) => T + (1 - v / 100) * (H - T - B);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="group" aria-label="Ventaja máxima en cada partida y cómo acabó">`;
  for (const v of [0, 25, 50, 75, 100]) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v}%</text>`;
  s += `<rect x="${L}" y="${T}" width="${W - L - R}" height="${Y(threshold) - T}" fill="var(--accent)" opacity=".07"/><line x1="${L}" x2="${W - R}" y1="${Y(threshold)}" y2="${Y(threshold)}" stroke="var(--accent)" stroke-dasharray="5 4"/><text x="${W - R}" y="${Y(threshold) - 5}" text-anchor="end" style="fill:var(--accent-text)">Ventaja grande (${threshold} %)</text>`;
  for (const p of points) {
    const col = p.result === 'W' ? 'var(--good)' : p.result === 'L' ? 'var(--crit)' : 'var(--muted)';
    const tip = `Partida ${p.idx} contra ${p.opp}: llegaste al ${p.peak} % y ${p.result === 'W' ? 'ganaste' : p.result === 'L' ? 'perdiste' : 'hiciste tablas'}`;
    const a = `class="pt" tabindex="0" role="link" aria-label="${esc(tip)}" data-tip="${esc(tip)}" data-go="${esc(p.id)}"`;
    s += p.result === 'L' ? `<rect ${a} x="${X(p.idx) - 5}" y="${Y(p.peak) - 5}" width="10" height="10" rx="2" fill="${col}" stroke="var(--surface)" stroke-width="2"/>` : p.result === 'D' ? `<circle ${a} cx="${X(p.idx)}" cy="${Y(p.peak)}" r="5" fill="var(--surface)" stroke="${col}" stroke-width="2"/>` : `<circle ${a} cx="${X(p.idx)}" cy="${Y(p.peak)}" r="5" fill="${col}" stroke="var(--surface)" stroke-width="2"/>`;
  }
  return s + `<text x="${L}" y="${H - 6}">Partida 1</text><text x="${W - R}" y="${H - 6}" text-anchor="end">Partida ${points.length}</text></svg>`;
}

/** Barra apilada de ganadas, tablas y perdidas. */
export function wdlBar(W: number, D: number, L: number): string {
  const t = W + D + L || 1;
  return `<div class="wdl" role="img" aria-label="${W} ganadas, ${D} tablas, ${L} perdidas"><i class="w" style="width:${(W / t) * 100}%"></i><i class="d" style="width:${(D / t) * 100}%"></i><i class="l" style="width:${(L / t) * 100}%"></i></div>`;
}
