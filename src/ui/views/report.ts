// Informe (resumen, errores, patrones, conversión, reloj, aperturas) sobre las últimas N partidas.
import { PHASE_ES, PIECE_NAME, TAG_ES, aggregate } from '../../core/analysis';
import { clockDetail, errorInsights, openingsDetail, type OpeningRow, type TrendDir } from '../../core/insights';
import { stripColor } from '../../core/openings';
import { STATUS_ES, STATUS_HELP, detectPatterns } from '../../core/patterns';
import { clockReport, conversionReport } from '../../core/report';
import type { GameRec, PieceType, Tag } from '../../types';
import { boardHTML, pieceSVG, replay, type Arrow } from '../board';
import { barRows, legendErrors } from '../charts';
import { ico } from '../icons';
import { activityMap, boardHeat, classLabel, classOf, colChart, donut, elosByClass, gaugeSVG, lineSVG, resultsRow, scatterSVG, stackedGames, wdlBar } from '../reportviz';
import { esc, pct1, plural, resultLabel } from '../dom';
import { S } from '../state';
import { syncTarget } from './home';
import { noGames, windowPicker } from './common';

export type ReportTab = 'resumen' | 'errores' | 'patrones' | 'conversion' | 'reloj' | 'aperturas' | 'brillantes';
export const REPORT_TABS: [ReportTab, string][] = [['resumen', 'Resumen'], ['errores', 'Errores'], ['patrones', 'Patrones'], ['conversion', 'Conversión'], ['reloj', 'Reloj'], ['aperturas', 'Aperturas'], ['brillantes', 'Brillantes']];

const tabs = (cur: ReportTab) => `<nav class="rtabs" aria-label="Secciones del informe">${REPORT_TABS.map(([k, t]) => `<a class="rtab" href="#/informe/${k}" ${k === cur ? 'aria-current="page"' : ''}>${ico(k)}<span>${t}</span></a>`).join('')}</nav>`;

/** Todas las partidas del ritmo elegido, y la ventana (últimas N) sobre ellas. */
function filtered() {
  const all = S.reportClass ? S.recs.filter((g) => classOf(g) === S.reportClass) : S.recs;
  return { all, win: all.slice(-S.settings.window) };
}

function header(nShown: number): string {
  const user = S.settings.user || 'Sin usuario';
  const src = S.settings.source === 'lichess' ? 'Lichess' : S.settings.source === 'chesscom' ? 'Chess.com' : 'PGN';
  const classes = [...new Set(S.recs.map(classOf))];
  const sync = syncTarget();
  const text = `ChessGOAT · ${user}: ${nShown} partidas analizadas`;
  return `<header class="rhead"><div class="who2"><span class="avatar" aria-hidden="true">${esc(user.charAt(0).toUpperCase())}</span><div><h1>${esc(user)}</h1><p class="sub">${nShown} ${nShown === 1 ? 'partida' : 'partidas'} · ${src}${S.reportClass ? ' · ' + classLabel(S.reportClass) : ''}</p></div></div>
    <div class="rtools"><label class="f sm"><span class="sr">Ritmo</span><select data-action="rclass" aria-label="Ritmo"><option value="">Todos los ritmos</option>${classes.map((c) => `<option value="${c}" ${S.reportClass === c ? 'selected' : ''}>${classLabel(c)}</option>`).join('')}</select></label>
      ${sync ? `<button class="btn small" data-action="sync" ${S.run ? 'disabled' : ''}>Actualizar</button>` : '<a class="btn small" href="#/importar">Importar</a>'}
      <button class="btn small" data-action="copy" data-text="${esc(text)}">Compartir</button></div></header>`;
}

export function vReport(tab: ReportTab): string {
  if (!S.recs.length) return noGames();
  const { all, win } = filtered();
  const head = header(all.length) + tabs(tab);
  if (!all.length) return head + '<section class="card empty"><h2>Sin partidas con ese ritmo</h2><p>Elige otro ritmo o importa partidas de este tipo.</p></section>';
  const bar = `<div class="wbar">${windowPicker()}</div>`;
  switch (tab) {
    case 'errores': return head + bar + errores(win, all);
    case 'patrones': return head + bar + patrones(all);
    case 'conversion': return head + bar + conversion(win);
    case 'reloj': return head + bar + reloj(win);
    case 'aperturas': return head + bar + aperturas(win);
    case 'brillantes': return head + bar + brillantes(win);
    default: return head + bar + resumen(win, all);
  }
}

function resumen(recs: typeof S.recs, all: typeof S.recs): string {
  const A = aggregate(recs);
  const decided = A.n || 1;
  const wp = Math.round((A.W / decided) * 100), dp = Math.round((A.D / decided) * 100), lp = Math.max(0, 100 - wp - dp);
  const elos = recs.filter((g) => g.elo > 0).map((g) => g.elo);
  const nowElo = elos.length ? elos[elos.length - 1] : 0;
  const delta = elos.length > 1 ? nowElo - elos[0] : 0;
  const hi = elos.length ? Math.max(...elos) : 0, lo = elos.length ? Math.min(...elos) : 0;
  const col = (c: 'w' | 'b') => `${A.byColor[c].W}-${A.byColor[c].D}-${A.byColor[c].L}`;
  const errG = (A.counts.m + A.counts.x) / decided;
  const tagRows = (Object.entries(A.tags) as [Tag, { n: number; loss: number; blunders: number }][])
    .sort((a, b) => b[1].n - a[1].n)
    .map(([k, v]) => ({ name: TAG_ES[k] || k, val: plural(v.n, 'error', 'errores'), tip: `${TAG_ES[k]}: ${v.n} errores, pérdida media ${Math.round(v.loss / v.n)} puntos de ventaja, ${v.blunders} graves`, segs: [{ v: v.n }] }));
  const rate = (n: number) => (n ? 100 / n : 0);
  const ph = (Object.entries(A.phases) as [keyof typeof PHASE_ES, typeof A.phases.apertura][]).map(([k, v]) => ({
    name: PHASE_ES[k], val: `${pct1((v.m + v.x) * rate(v.n))} por 100 jugadas`, tip: `${PHASE_ES[k]}: ${v.n} jugadas, ${v.i} imprecisiones, ${v.m} errores, ${v.x} graves`,
    segs: [{ v: v.x * rate(v.n), c: 'var(--crit)' }, { v: v.m * rate(v.n), c: 'var(--serious)' }, { v: v.i * rate(v.n), c: 'var(--warn)' }],
  }));
  const maxPh = Math.max(1, ...ph.map((r) => r.segs.reduce((s, g) => s + g.v, 0)));
  return `<section class="card"><header><h2>Cómo estás jugando</h2><span class="sub">Últimas ${A.n} partidas</span></header>
    <div class="overview">
      <div class="ov-gauge">${gaugeSVG(A.acc, 'Precisión media')}<div class="gv"><strong>${pct1(A.acc)}%</strong><span>Precisión media</span></div></div>
      <div class="ov-stats">
        <div class="stat"><span class="k">${ico('trofeo')}Victorias</span><span class="vv">${wp}%</span><div class="wdl" role="img" aria-label="${A.W} ganadas, ${A.D} tablas, ${A.L} perdidas"><i class="w" style="width:${wp}%"></i><i class="d" style="width:${dp}%"></i><i class="l" style="width:${lp}%"></i></div><span class="sub">${A.W}-${A.D}-${A.L} · blancas ${col('w')} · negras ${col('b')}</span></div>
        <div class="stat"><span class="k">Errores por partida</span><span class="vv">${pct1(errG)}</span><span class="sub">${A.counts.x} graves, ${A.counts.m} errores, ${A.counts.i} imprecisiones</span></div>
        <div class="stat"><span class="k">Elo</span><span class="vv">${nowElo || '—'} ${delta ? `<span class="chipd ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '▲ +' : '▼ '}${delta}</span>` : ''}</span></div>
      </div>
      <div class="ov-chart">${lineSVG(elos, 'Elo en cada partida', 'Partida 1', `Partida ${elos.length}`)}${elos.length > 1 ? `<p class="sub">Ahora <strong>${nowElo}</strong> · máximo <strong>${hi}</strong> · mínimo <strong>${lo}</strong></p>` : ''}</div>
    </div></section>
  <section class="card"><header><h2>Tus últimas ${recs.length} partidas</h2><span class="sub"><span class="key g"></span>${A.W} ganadas <span class="key" style="background:var(--axis)"></span>${A.D} tablas <span class="key r"></span>${A.L} perdidas</span></header>${resultsRow(recs)}</section>
  <div class="grid2"><section class="card"><header><h2>Tus Elos</h2><span class="sub">Por ritmo</span></header>${elosByClass(S.recs)}</section>
    <section class="card"><header><h2>Actividad</h2><span class="sub">${all.length} partidas analizadas</span></header>${activityMap(S.recs, S.activity)}</section></div>
  <div class="grid2"><section class="card"><header><h2>Dónde pierdes puntos</h2><span class="sub">Errores y errores graves, por tipo</span></header>${tagRows.length ? barRows(tagRows, Math.max(1, ...tagRows.map((r) => r.segs[0].v))) : '<p class="sub">Sin errores graves en este grupo.</p>'}
    <p class="sub">Clasificación automática por posición: puede equivocarse en casos raros.</p></section>
    <section class="card"><header><h2>Por fase de la partida</h2><span class="sub">Por 100 jugadas tuyas</span></header>${barRows(ph, maxPh)}${legendErrors()}</section></div>`;
}

// ---------- ayudas comunes ----------
const rcache = new Map<string, ReturnType<typeof replay>>();
const rep = (g: GameRec) => {
  let r = rcache.get(g.id);
  if (!r) {
    r = replay(g.moves);
    rcache.set(g.id, r);
    if (rcache.size > 80) rcache.delete(rcache.keys().next().value!);
  }
  return r;
};
/** Miniatura de la posición tras `ply` jugadas de la partida. */
const thumb = (g: GameRec, ply: number, arrows: Arrow[] = [], label = 'Posición de la partida') => {
  const r = rep(g);
  const p = Math.max(0, Math.min(ply, r.fens.length - 1));
  return boardHTML(r.fens[p], { mini: true, flip: g.color === 'b', last: r.lm[p], arrows, label });
};
const byId = () => new Map(S.recs.map((g) => [g.id, g]));
const TREND_CHIP: Record<TrendDir, string> = {
  peor: '<span class="pill bad">Empeora</span>', mejor: '<span class="pill good">Mejora</span>', estable: '<span class="pill">Estable</span>', sin_datos: '',
};
const statTile = (v: string, l: string) => `<div class="tile"><span class="v">${v}</span><span class="l">${l}</span></div>`;

// ---------- errores ----------
function errCard(g: GameRec, i: number, d: number, title: string, line1: string, line2: string): string {
  const r = rep(g);
  const m = g.moves[i];
  const played = r.lm[i + 1];
  const arrows: Arrow[] = [...(played ? [{ from: played.from, to: played.to, kind: 'played' as const }] : []), ...(m.b ? [{ from: m.b.slice(0, 2), to: m.b.slice(2, 4), kind: 'best' as const }] : [])];
  return `<a class="errcard" href="#/partida/${esc(g.id)}?p=${i + 1}"><span class="thumbwrap">${thumb(g, i, arrows, 'Posición antes de ' + m.s)}</span><span class="et"><span class="pill bad">−${Math.round(d)}</span><strong>${esc(title)}</strong><span class="sub">${esc(line1)}</span><span class="sub">${esc(line2)}</span></span></a>`;
}

function errores(recs: GameRec[], all: GameRec[]): string {
  const w = S.settings.window;
  const prev = all.slice(-2 * w, -w).slice(0, Math.max(0, all.length - recs.length));
  const I = errorInsights(recs, prev);
  const A = aggregate(recs);
  const n = A.n || 1;
  const totalErr = A.counts.m + A.counts.x;
  const per100 = I.userMoves ? (totalErr / I.userMoves) * 100 : 0;
  const avg = per100 || 1;
  const sit = I.bySituation;
  const sitTotal = sit.winning + sit.equal + sit.losing;
  const topSit = sitTotal ? ([['ganando', sit.winning], ['igualado', sit.equal], ['perdiendo', sit.losing]] as [string, number][]).sort((a, b) => b[1] - a[1])[0] : null;
  const sitText = !sitTotal ? '' : topSit![0] === 'ganando'
    ? `El ${Math.round((sit.winning / sitTotal) * 100)} % de tus errores llegan cuando ya estás ganando: es donde más puntos regalas.`
    : topSit![0] === 'perdiendo'
      ? `El ${Math.round((sit.losing / sitTotal) * 100)} % de tus errores llegan cuando ya estás peor: la posición se te complica y fallas más.`
      : `El ${Math.round((sit.equal / sitTotal) * 100)} % de tus errores llegan en posiciones igualadas: ahí se decide la partida.`;
  const lastErrs = A.worst.slice(0, 10).map((wm) => ({ wm, g: recs.find((g) => g.id === wm.gid)! })).filter((x) => x.g);
  const maxTag = Math.max(1, ...I.tags.map((t) => t.n));
  const peak = I.byMove.reduce((a, b) => (b.per100 > a.per100 ? b : a), I.byMove[0]);
  const pieceOrder: PieceType[] = ['p', 'n', 'b', 'r', 'q'];
  const pieceItems = pieceOrder.map((t) => ({ label: PIECE_NAME[t], value: I.pieces[t] || 0, labelHTML: `<span class="pcl">${pieceSVG('w', t)}<span>${PIECE_NAME[t]}</span></span>`, tone: 'crit' as const }));
  const pieceTotal = pieceItems.reduce((a, b) => a + b.value, 0);

  return `<div class="tiles">${statTile(pct1(A.counts.x / n), 'Errores graves por partida')}${statTile(I.games ? Math.round((I.gamesWithBlunder / I.games) * 100) + '%' : '—', 'Partidas con al menos un error grave')}${statTile(I.avgLossBlunder ? '−' + I.avgLossBlunder : '—', 'Puntos que cuesta un error grave')}${statTile(pct1(per100), 'Errores por cada 100 jugadas')}</div>
  <section class="card"><header><h2>Errores partida a partida</h2><span class="sub">Toca una barra para abrirla</span></header>${stackedGames(I.perGame)}${legendErrors()}</section>
  <div class="grid2"><section class="card"><header><h2>Qué tipo de errores</h2><span class="sub">Errores y graves, con su tendencia</span></header>
    ${I.tags.length ? `<div class="tagrows">${I.tags.map((t) => `<div class="tagrow"><div class="th"><strong>${esc(TAG_ES[t.tag])}</strong>${TREND_CHIP[t.trend]}</div><div class="tb"><i style="width:${(t.n / maxTag) * 100}%"></i></div><div class="tm"><span>${t.n} ${t.n === 1 ? 'vez' : 'veces'} · ${t.share} % · −${Math.round(t.loss / t.n)} de media${t.blunders ? ` · ${t.blunders} graves` : ''}</span><button class="btn small" data-action="practice-tag" data-tag="${esc(t.tag)}" data-title="${esc(TAG_ES[t.tag])}">Practicar</button></div></div>`).join('')}</div>` : '<p class="sub">Sin errores graves en este grupo.</p>'}</section>
    <section class="card"><header><h2>Cuándo ocurren</h2><span class="sub">Errores por 100 jugadas, según la jugada</span></header>${colChart(I.byMove.map((b) => ({ label: b.label, value: b.per100, text: pct1(b.per100), sub: `${b.errors} err.`, tone: b.per100 > avg * 1.3 ? 'crit' : 'accent' })), { height: 140 })}
    <p class="sub">${peak && peak.errors ? `Tu tramo más delicado son las jugadas ${peak.label} (${pct1(peak.per100)} por 100).` : 'Sin datos suficientes.'}</p></section></div>
  <div class="grid2"><section class="card"><header><h2>Cómo estabas al fallar</h2><span class="sub">Situación antes de tu error</span></header>${sitTotal ? donut([{ label: 'Ganando', value: sit.winning, color: 'var(--good)' }, { label: 'Igualado', value: sit.equal, color: 'var(--axis)' }, { label: 'Perdiendo', value: sit.losing, color: 'var(--crit)' }], String(sitTotal), 'errores') + `<p class="sub">${sitText}</p>` : '<p class="sub">Sin errores en este grupo.</p>'}</section>
    <section class="card"><header><h2>Piezas que pierdes</h2><span class="sub">Material regalado</span></header>${pieceTotal ? colChart(pieceItems, { height: 130 }) : '<p class="sub">No hay piezas regaladas en este grupo.</p>'}</section></div>
  ${Object.keys(I.squares).length ? `<section class="card"><header><h2>Dónde pasa</h2><span class="sub">Casillas donde pierdes material o recibes ataques</span></header><div class="heatrow">${boardHeat(I.squares)}<div class="heatinfo"><p>${(() => { const top = Object.entries(I.squares).sort((a, b) => b[1] - a[1]).slice(0, 3); return `Tus casillas más conflictivas: ${top.map(([sq, k]) => `<strong>${sq}</strong> (${k})`).join(', ')}.`; })()}</p><p class="sub">Cuanto más intenso el color, más veces. Revisa qué defiende cada una antes de mover una pieza hacia allí.</p></div></div></section>` : ''}
  <section class="card"><header><h2>Tus 10 peores jugadas</h2><span class="sub">Por puntos de ventaja perdidos</span></header>
    ${lastErrs.length ? `<div class="errgrid">${lastErrs.map(({ wm, g }) => errCard(g, wm.i, wm.d, wm.s + (wm.bs ? ' en vez de ' + wm.bs : ''), TAG_ES[wm.p] || '', 'contra ' + wm.opp)).join('')}</div>` : '<p class="sub">No hay errores graves en este grupo.</p>'}</section>
  ${A.lostFirst.length ? `<section class="card"><header><h2>Dónde empezaron tus derrotas</h2><span class="sub">El primer error decisivo de cada partida perdida</span></header><div class="glist">${A.lostFirst.slice(-8).reverse().map((l) => `<a class="gitem" href="#/partida/${esc(l.gid)}?p=${l.i + 1}"><span class="bar L"></span><span><span class="t1">Jugada ${Math.floor(l.i / 2) + 1}</span><span class="t2">contra ${esc(l.opp)}</span></span><span aria-hidden="true">›</span></a>`).join('')}</div></section>` : ''}`;
}

// ---------- brillantes y geniales ----------
function brCard(g: GameRec, i: number, kind: 'k' | 'h'): string {
  const m = g.moves[i];
  const r = rep(g);
  const mv = r.lm[i + 1];
  const arrows: Arrow[] = mv ? [{ from: mv.from, to: mv.to, kind: 'best' }] : [];
  const sym = kind === 'k' ? '!!' : '!';
  const sub = kind === 'k' ? (m.sac ? 'Ofreces ' + (PIECE_NAME[m.sac] || 'material') : 'Sacrificio ganador') : 'La única jugada que sostenía la posición';
  return `<a class="errcard" href="#/partida/${esc(g.id)}?p=${i + 1}"><span class="thumbwrap">${thumb(g, i + 1, arrows, 'Posición tras ' + m.s)}</span><span class="et"><span class="pill ${kind === 'k' ? 'brill' : 'great'}">${sym} ${kind === 'k' ? 'Brillante' : 'Genial'}</span><strong>${esc(m.s)}</strong><span class="sub">${esc(sub)}</span><span class="sub">Jugada ${Math.floor(i / 2) + 1} · contra ${esc(g.opp)}</span></span></a>`;
}

function brillantes(recs: GameRec[]): string {
  const find = (kind: 'k' | 'h') => recs.slice().reverse().flatMap((g) => g.moves.flatMap((m, i) => (m.c === kind ? [{ g, i }] : [])));
  const ks = find('k'), hs = find('h');
  const gamesWith = (kind: 'k' | 'h') => recs.filter((g) => g.moves.some((m) => m.c === kind)).length;
  const old = recs.filter((g) => !g.gr).length;
  const sec = (title: string, sub: string, list: { g: GameRec; i: number }[], kind: 'k' | 'h', none: string) =>
    `<section class="card"><header><h2>${title}</h2><span class="sub">${sub}</span></header>${list.length ? `<div class="errgrid">${list.slice(0, 24).map(({ g, i }) => brCard(g, i, kind)).join('')}</div>${list.length > 24 ? `<p class="sub">Se muestran las 24 más recientes de ${list.length}.</p>` : ''}` : `<p class="sub">${none}</p>`}</section>`;
  return `${old ? `<section class="card"><p class="sub">${plural(old, 'partida', 'partidas')} ${old === 1 ? 'se analizó' : 'se analizaron'} antes de que existieran las jugadas brillantes y geniales. Vuelve a importarlas desde <a href="#/importar">Importar</a> para que se busquen.</p></section>` : ''}
  <div class="tiles">${statTile(String(ks.length), 'Jugadas brillantes')}${statTile(String(hs.length), 'Jugadas geniales')}${statTile(String(gamesWith('k')), 'Partidas con una brillante')}${statTile(recs.length ? pct1((ks.length + hs.length) / recs.length) : '—', 'Destacadas por partida')}</div>
  ${sec('Jugadas brillantes', 'Sacrificios que funcionan', ks, 'k', 'Aún no hay brillantes en este grupo. Son raras: ofrecer una pieza que el rival no puede tomar sin perder.')}
  ${sec('Jugadas geniales', 'Las únicas que mantenían la posición', hs, 'h', 'Aún no hay geniales en este grupo.')}`;
}

// ---------- patrones ----------
const PAT_PILL: Record<string, string> = { persistente: 'bad', nuevo: 'warn', mejorando: 'info', resuelto: 'good' };

function patrones(all: GameRec[]): string {
  const w = S.settings.window;
  const pats = detectPatterns(all, w);
  const counts: Record<string, number> = { persistente: 0, nuevo: 0, mejorando: 0, resuelto: 0 };
  for (const p of pats) counts[p.status]++;
  const shown = S.patFilter ? pats.filter((p) => p.status === S.patFilter) : pats;
  const games = byId();
  const cur = Math.min(w, all.length);
  const card = (p: (typeof pats)[number]) => {
    const ex = p.examples[0];
    const g = ex ? games.get(ex.gid) : undefined;
    const m = g && ex ? g.moves[ex.i] : undefined;
    const arrows: Arrow[] = g && ex && m ? [...(rep(g).lm[ex.i + 1] ? [{ from: rep(g).lm[ex.i + 1]!.from, to: rep(g).lm[ex.i + 1]!.to, kind: 'played' as const }] : []), ...(m.b ? [{ from: m.b.slice(0, 2), to: m.b.slice(2, 4), kind: 'best' as const }] : [])] : [];
    const kind = p.kind === 'casilla' ? 'Casilla' : p.kind === 'posicion' ? 'Misma posición' : 'Apertura';
    return `<article class="patcard"><div class="pthumb">${g && ex ? thumb(g, ex.i, arrows, 'Ejemplo del patrón') : ''}</div>
      <div class="pbody"><div class="ph"><span class="pill">${kind}</span><span class="pill ${PAT_PILL[p.status]}">${STATUS_ES[p.status]}</span></div><h3>${esc(p.title)}</h3><p class="sub">${esc(p.detail)}</p>
        <div class="pmeters"><div class="pm"><span>Tanda actual</span><div class="bar"><i style="width:${Math.min(100, (p.cur / Math.max(1, cur)) * 100)}%"></i></div><b>${p.cur}</b></div><div class="pm"><span>Anterior</span><div class="bar"><i class="old" style="width:${Math.min(100, (p.prev / Math.max(1, w)) * 100)}%"></i></div><b>${p.prev}</b></div></div>
        <p class="sub">${p.total} partidas distintas${p.loss ? ` · ${p.loss} puntos perdidos` : ''}</p>
        <div class="row tight"><button class="btn primary small" data-action="practice-pattern" data-key="${esc(p.key)}" data-title="${esc(p.title)}">Practicar</button>${p.examples.slice(0, 3).map((e, k) => `<a class="btn small" href="#/partida/${esc(e.gid)}?p=${e.i + 1}">Ejemplo ${k + 1}</a>`).join('')}</div></div></article>`;
  };
  const stat = (st: keyof typeof STATUS_ES) => `<button class="statcard ${PAT_PILL[st]} ${S.patFilter === st ? 'on' : ''}" data-action="pat-filter" data-v="${st}" aria-pressed="${S.patFilter === st}"><span class="n">${counts[st]}</span><span class="t">${STATUS_ES[st]}</span><span class="h">${STATUS_HELP[st]}</span></button>`;
  return `<section class="card"><header><h2>Patrones recurrentes</h2><span class="sub">Tanda actual: últimas ${w} partidas · anterior: las ${w} previas</span></header>
    <p class="sub">Un patrón es el mismo error repetido en al menos 2 partidas distintas: la misma pieza perdida en la misma casilla, el mismo fallo en la misma posición o errores tempranos en la misma apertura.</p>
    <div class="statcards">${stat('persistente')}${stat('nuevo')}${stat('mejorando')}${stat('resuelto')}</div>
    ${S.patFilter ? '<div class="row tight"><button class="btn small" data-action="pat-filter" data-v="">Ver todos</button></div>' : ''}</section>
  ${shown.length ? `<div class="patgrid">${shown.map(card).join('')}</div>` : `<section class="card empty"><h2>${pats.length ? 'Ninguno con ese estado' : 'Sin patrones todavía'}</h2><p>${pats.length ? 'Prueba con otro filtro.' : 'No hay errores repetidos en al menos 2 partidas. Analiza más partidas para encontrarlos.'}</p></section>`}`;
}

// ---------- conversión ----------
function conversion(recs: GameRec[]): string {
  const c = conversionReport(recs);
  const n = recs.length || 1;
  const games = byId();
  const phaseTotal = c.lostPhase.a + c.lostPhase.m + c.lostPhase.f;
  const card = (t: (typeof c.throwaways)[number]) => {
    const g = games.get(t.gid);
    if (!g) return '';
    const r = rep(g);
    const ply = t.i + 1;
    const lost = t.lostAt;
    const arrows: Arrow[] = lost && g.moves[lost.i]?.b ? [{ from: g.moves[lost.i].b!.slice(0, 2), to: g.moves[lost.i].b!.slice(2, 4), kind: 'best' }] : [];
    return `<a class="errcard" href="#/partida/${esc(t.gid)}?p=${(lost ? lost.i : t.i) + 1}"><span class="thumbwrap">${boardHTML(r.fens[Math.min(ply, r.fens.length - 1)], { mini: true, flip: g.color === 'b', last: r.lm[ply], arrows, label: 'Posición donde tenías la mayor ventaja' })}</span><span class="et"><span class="pill ${t.result === 'L' ? 'bad' : ''}">${t.result === 'L' ? 'Derrota' : 'Tablas'}</span><strong>Llegaste al ${t.peak} %</strong><span class="sub">en la jugada ${Math.floor(t.i / 2) + 1}, contra ${esc(t.opp)}</span><span class="sub">${lost ? `Se escapó con ${esc(lost.s)}${lost.bs ? ' en vez de ' + esc(lost.bs) : ''} (−${Math.round(lost.d)})` : 'La ventaja se fue poco a poco'}</span></span></a>`;
  };
  return `<div class="grid2"><section class="card"><header><h2>Cuánto conviertes</h2><span class="sub">Ventaja grande: 75 % o más de ganar</span></header>
      <div class="ov-gauge">${gaugeSVG(c.rate, 'Ventajas convertidas')}<div class="gv"><strong>${c.rate}%</strong><span>de tus ventajas acaban en victoria</span></div></div></section>
    <section class="card"><header><h2>El embudo</h2><span class="sub">De partida a victoria</span></header>
      <div class="funnel"><div class="fr"><span>Partidas analizadas</span><div class="fb"><i style="width:100%"></i></div><b>${recs.length}</b></div>
        <div class="fr"><span>Con ventaja grande</span><div class="fb"><i class="mid" style="width:${(c.advantaged / n) * 100}%"></i></div><b>${c.advantaged}</b></div>
        <div class="fr"><span>Convertidas en victoria</span><div class="fb"><i class="good" style="width:${(c.converted / n) * 100}%"></i></div><b>${c.converted}</b></div></div>
      <div class="tiles tiles2">${statTile(String(c.lost), 'Derrotas con ventaja')}${statTile(String(c.drawn), 'Tablas con ventaja')}${statTile(String(c.comebacks), 'Remontadas')}</div></section></div>
  <section class="card"><header><h2>Tu ventaja máxima en cada partida</h2><span class="sub">Toca un punto para abrir la partida</span></header>${scatterSVG(c.scatter)}<div class="legend"><span><span class="dot" style="background:var(--good)"></span>Victoria</span><span><span class="dot ring"></span>Tablas</span><span><span class="dot sq" style="background:var(--crit)"></span>Derrota</span></div></section>
  <div class="grid2"><section class="card"><header><h2>Según lo grande que fuera</h2><span class="sub">Conversión por tamaño de ventaja</span></header>${colChart(c.thresholds.map((t) => ({ label: `${t.t} % o más`, value: t.rate, text: t.adv ? t.rate + '%' : '—', sub: `${t.conv} de ${t.adv}`, tone: t.rate >= 70 ? 'good' : t.rate >= 40 ? 'warn' : 'crit' })), { max: 100, height: 140 })}</section>
    <section class="card"><header><h2>Dónde se escapa</h2><span class="sub">Fase en la que pierdes la ventaja</span></header>${phaseTotal ? colChart([{ label: 'Apertura', value: c.lostPhase.a, text: String(c.lostPhase.a), tone: 'crit' as const }, { label: 'Medio juego', value: c.lostPhase.m, text: String(c.lostPhase.m), tone: 'crit' as const }, { label: 'Final', value: c.lostPhase.f, text: String(c.lostPhase.f), tone: 'crit' as const }], { height: 140 }) : '<p class="sub">No tienes ventajas grandes sin convertir.</p>'}</section></div>
  <section class="card"><header><h2>Ventajas que no convertiste</h2><span class="sub">La posición de mayor ventaja y dónde se perdió</span></header>${c.throwaways.length ? `<div class="errgrid">${c.throwaways.slice(0, 8).map(card).join('')}</div>` : '<p class="sub">No tienes ventajas grandes sin convertir en este grupo.</p>'}</section>
  ${c.comebackGames.length ? `<section class="card"><header><h2>Tus remontadas</h2><span class="sub">Partidas ganadas estando casi perdido</span></header><div class="glist">${c.comebackGames.slice(0, 6).map((r) => `<a class="gitem" href="#/partida/${esc(r.gid)}"><span class="bar W"></span><span><span class="t1">Contra ${esc(r.opp)}</span><span class="t2">Llegaste a tener solo un ${r.low} % de ganar</span></span><span aria-hidden="true">›</span></a>`).join('')}</div></section>` : ''}
  <section class="card"><h3>Cómo convertir mejor</h3><ul class="tight"><li>Con ventaja de material, cambia piezas y simplifica.</li><li>Antes de atacar, comprueba que tu rey y tus piezas no quedan expuestos.</li><li>Toma el material gratuito cuando no haya trampa.</li><li>Si el rival tiene un solo recurso, búscalo antes de jugar tu plan.</li></ul></section>`;
}

// ---------- reloj ----------
function reloj(recs: GameRec[]): string {
  const c = clockReport(recs);
  if (!c.games) return '<section class="card empty"><span class="bigico">' + ico('reloj') + '</span><h2>Sin datos de reloj</h2><p>Las partidas importadas de Chess.com y Lichess traen el tiempo de cada jugada. Los PGN sin reloj no se pueden usar aquí.</p></section>';
  const D = clockDetail(recs);
  const rateTone = (r: number, base: number) => (r > base * 1.5 + 0.5 ? 'crit' : r > base * 1.15 ? 'warn' : 'good') as 'crit' | 'warn' | 'good';
  const verdict = c.trouble.moves >= 15 && c.trouble.rate > c.normal.rate * 1.5
    ? 'Con poco tiempo fallas bastante más. Practica ritmos con más margen y reparte mejor el reloj.'
    : c.fast.moves >= 15 && c.fast.rate > c.normal.rate * 1.5 ? 'Las jugadas instantáneas te cuestan errores: usa la lista de revisión antes de mover.' : 'Tu gestión del reloj no muestra un problema claro en este grupo.';
  const base = c.normal.rate;
  return `<div class="tiles">${statTile(String(c.games), 'Partidas con reloj')}${statTile(pct1(c.avgErrorTime) + ' s', 'Tiempo medio en tus errores')}${statTile(pct1(c.avgOkTime) + ' s', 'Tiempo medio en el resto')}${statTile(String(c.flagLosses), 'Derrotas por tiempo' + (c.timeoutLossesWinning ? ` (${c.timeoutLossesWinning} ganando)` : ''))}</div>
  <section class="card"><header><h2>Lectura rápida</h2></header><div class="note k-a"><p>${verdict}</p></div></section>
  <div class="grid2"><section class="card"><header><h2>Según el tiempo que te queda</h2><span class="sub">Errores por 100 jugadas · % del reloj inicial</span></header>${colChart(D.byRemaining.map((b) => ({ label: b.label.replace('Más del ', '> ').replace('Menos del ', '< ').replace(' a ', '–'), value: b.rate, text: b.moves ? pct1(b.rate) : '—', sub: `${b.moves} jug.`, tone: rateTone(b.rate, base) })), { height: 140 })}</section>
    <section class="card"><header><h2>Según el tiempo que gastas</h2><span class="sub">Errores por 100 jugadas · segundos por jugada</span></header>${colChart(D.bySpent.map((b) => ({ label: b.label.replace('Menos de ', '< ').replace('Más de ', '> ').replace(' a ', '–'), value: b.rate, text: b.moves ? pct1(b.rate) : '—', sub: `${b.moves} jug.`, tone: rateTone(b.rate, base) })), { height: 140 })}</section></div>
  <div class="grid2"><section class="card"><header><h2>Cómo gastas el reloj</h2><span class="sub">Segundos medios por jugada, por tramo</span></header>${colChart(D.byMove.map((b) => ({ label: b.label, value: b.avgSp, text: pct1(b.avgSp), sub: `${b.moves} jug.` })), { height: 140 })}</section>
    <section class="card"><header><h2>Tiempo que te queda</h2><span class="sub">% medio del reloj inicial a lo largo de la partida</span></header>${lineSVG(D.byMove.filter((b) => b.moves).map((b) => b.leftPct), 'Tiempo restante medio', 'Apertura', 'Final')}</section></div>
  <section class="card"><header><h2>Partidas con apuros de tiempo</h2><span class="sub">Llegaste a menos del 10 % del reloj</span></header>${D.troubleGames.length ? `<div class="glist">${D.troubleGames.slice(0, 8).map((t) => `<a class="gitem" href="#/partida/${esc(t.id)}"><span class="bar ${t.result}"></span><span><span class="t1">Contra ${esc(t.opp)} · ${resultLabel(t.result)}</span><span class="t2">Te quedó un ${t.minLeftPct} % en la jugada ${t.atMove}</span></span><span aria-hidden="true">›</span></a>`).join('')}</div>` : '<p class="sub">No llegaste a quedarte sin reloj en ninguna partida.</p>'}</section>
  ${D.flagGames.length ? `<section class="card"><header><h2>Derrotas por tiempo</h2><span class="sub">${D.flagGames.filter((f) => f.winningAtEnd).length} de ellas estando mejor</span></header><div class="glist">${D.flagGames.map((f) => `<a class="gitem" href="#/partida/${esc(f.id)}"><span class="bar L"></span><span><span class="t1">Contra ${esc(f.opp)}</span><span class="t2">${f.winningAtEnd ? 'Estabas mejor y se acabó el tiempo' : 'Se acabó el tiempo'}</span></span><span aria-hidden="true">›</span></a>`).join('')}</div></section>` : ''}`;
}

// ---------- aperturas ----------
const DONUT_COLORS = ['var(--accent)', 'var(--info)', 'var(--good)', 'var(--serious)', 'var(--crit)', 'var(--warn-solid)', 'var(--axis)'];

function aperturas(recs: GameRec[]): string {
  const D = openingsDetail(recs);
  const games = byId();
  const openThumb = (o: OpeningRow) => {
    const g = games.get(o.lastId);
    return g ? thumb(g, 8, [], 'Posición tras las 4 primeras jugadas de ' + stripColor(o.name)) : '';
  };
  const hl = (o: OpeningRow | null, title: string, tone: string) => !o ? '' : `<section class="card hlcard ${tone}"><header><h2>${title}</h2></header><div class="hlrow"><span class="thumbwrap">${openThumb(o)}</span><div><h3>${esc(stripColor(o.name))}</h3><p class="sub">${o.color === 'w' ? 'Con blancas' : 'Con negras'} · ${o.n} partidas · ${o.W}-${o.D}-${o.L}</p>${wdlBar(o.W, o.D, o.L)}<p class="sub">Puntuación ${Math.round(o.score * 100)} % · precisión ${pct1(o.acc)} % · ${pct1(o.earlyPerGame)} errores en las 10 primeras jugadas por partida</p><div class="row tight">${o.earlyPerGame > 0 ? `<button class="btn small" data-action="practice-opening" data-name="${esc(stripColor(o.name))}">Repasar errores de la apertura</button>` : `<a class="btn small" href="#/partida/${esc(o.lastId)}">Revisar la última partida</a>`}</div>${o.earlyPerGame === 0 && o.score < 0.5 ? `<p class="sub">Aquí no pierdes por errores de apertura: la partida se decide después de la jugada 10.</p>` : ''}</div></div></section>`;
  const rows = (list: OpeningRow[]) => list.length ? `<div class="oplist">${list.slice(0, 8).map((o) => `<div class="oprow"><span class="thumbwrap sm">${openThumb(o)}</span><div class="ob"><strong>${esc(stripColor(o.name))}</strong>${wdlBar(o.W, o.D, o.L)}<span class="sub">${o.n} ${o.n === 1 ? 'partida' : 'partidas'} · ${o.W}-${o.D}-${o.L} · precisión ${pct1(o.acc)} % · ${pct1(o.earlyPerGame)} err. tempranos</span></div><a class="btn small" href="#/partida/${esc(o.lastId)}">Última</a></div>`).join('')}</div>` : '<p class="sub">No hay partidas con este color.</p>';
  const all = [...D.white, ...D.black].reduce((m, o) => m.set(stripColor(o.name), (m.get(stripColor(o.name)) || 0) + o.n), new Map<string, number>());
  const top = [...all.entries()].sort((a, b) => b[1] - a[1]);
  const parts = top.slice(0, 6).map(([label, value], i) => ({ label, value, color: DONUT_COLORS[i] }));
  const rest = top.slice(6).reduce((a, b) => a + b[1], 0);
  if (rest) parts.push({ label: 'Otras', value: rest, color: DONUT_COLORS[6] });
  const wCount = D.white.reduce((a, o) => a + o.n, 0), bCount = D.black.reduce((a, o) => a + o.n, 0);
  return `<div class="grid2"><section class="card"><header><h2>Tu repertorio</h2><span class="sub">Aperturas más jugadas</span></header>${donut(parts, String(recs.length), 'partidas')}<p class="sub">${wCount} con blancas y ${bCount} con negras.</p></section>
    <div style="display:flex;flex-direction:column;gap:18px">${hl(D.best, 'La que mejor te va', 'good')}${hl(D.worst, 'La que peor te va', 'bad') || (D.best ? '' : '<section class="card empty"><h2>Todavía poco repertorio</h2><p>Con al menos 2 partidas de la misma apertura aparecen tu mejor y tu peor.</p></section>')}</div></div>
  <div class="grid2"><section class="card"><header><h2>Con blancas</h2><span class="sub">${wCount} partidas</span></header>${rows(D.white)}</section>
    <section class="card"><header><h2>Con negras</h2><span class="sub">${bCount} partidas</span></header>${rows(D.black)}</section></div>`;
}
