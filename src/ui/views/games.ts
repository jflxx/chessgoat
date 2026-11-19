import { CLASS_ES, PHASE_ES, TAG_ES, isBigErr, isErr } from '../../core/analysis';
import { explainMove } from '../../core/explain';
import { stripColor } from '../../core/openings';
import { applyUci } from '../../core/puzzle';
import { Chess } from 'chess.js';
import type { GameRec } from '../../types';
import { boardHTML, evalBarHTML, fmtEval, replay, type Arrow } from '../board';
import { evalSVG, legendErrors } from '../charts';
import { colorLabel, esc, fmtDate, resultLabel } from '../dom';
import { selectionProps, setCtl } from '../interact';
import { livePanel, liveEvalWhite, stopLive } from '../live';
import { moveSound } from '../sound';
import { S, render } from '../state';
import { noGames } from './common';

const SRC = { chesscom: 'Chess.com', lichess: 'Lichess', pgn: 'PGN' } as const;
const SYM: Record<string, string> = { k: '!!', h: '!', i: '?!', m: '?', x: '??', b: '★' };

export function vGames(): string {
  if (!S.recs.length) return noGames();
  const f = S.gameFilter;
  const q = f.q.trim().toLowerCase();
  const list = [...S.recs].reverse().filter((g) => (!f.color || g.color === f.color) && (!f.result || g.result === f.result) && (!q || g.opp.toLowerCase().includes(q) || g.opening.toLowerCase().includes(q)));
  if (f.sort === 'errores') list.sort((a, b) => b.counts.x * 2 + b.counts.m - (a.counts.x * 2 + a.counts.m));
  else if (f.sort === 'precision') list.sort((a, b) => a.acc - b.acc);
  const sel = (label: string, k: string, v: string, opts: [string, string][]) =>
    `<label class="f">${label}<select data-action="filter" data-k="${k}">${opts.map(([val, t]) => `<option value="${val}" ${v === val ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  return `<section class="card"><header><h1>Tus partidas</h1><span class="sub">${list.length} de ${S.recs.length}</span></header>
    <div class="row"><label class="f">Buscar rival o apertura<input class="search" type="search" value="${esc(f.q)}" data-action="filter-q" data-fk="q" placeholder="Rival, apertura…" style="max-width:none"></label>
      ${sel('Color', 'color', f.color, [['', 'Todos'], ['w', 'Blancas'], ['b', 'Negras']])}${sel('Resultado', 'result', f.result, [['', 'Todos'], ['W', 'Victorias'], ['D', 'Tablas'], ['L', 'Derrotas']])}
      ${sel('Ordenar', 'sort', f.sort, [['', 'Más recientes'], ['errores', 'Más errores'], ['precision', 'Menor precisión']])}</div>
    <div class="glist">${list.map((g) => `<a class="gitem" href="#/partida/${esc(g.id)}"><span class="bar ${g.result}"></span><span><span class="t1">${esc(g.opp)}${g.oppElo ? ' (' + g.oppElo + ')' : ''} · ${colorLabel(g.color)} · <span class="${g.result}">${resultLabel(g.result)}</span></span><span class="t2">${fmtDate(g.ts, g.date)} · ${esc(stripColor(g.opening))} · ${g.counts.x} graves, ${g.counts.m} errores, ${g.counts.i} imprecisiones</span></span><span class="pill">${g.acc}%</span></a>`).join('') || '<p class="sub">Ninguna partida coincide con el filtro.</p>'}</div></section>`;
}

const mmss = (s?: number) => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

/** UCI de la respuesta del rival (guardada como SAN) desde la posición tras tu jugada. */
function replyArrow(after: string, san?: string): { from: string; to: string } | null {
  if (!san) return null;
  try {
    const m = new Chess(after).move(san);
    return { from: m.from, to: m.to };
  } catch {
    return null;
  }
}

/** Imágenes que acompañan a la explicación: tu jugada frente a la mejor, y la respuesta del rival. */
function thumbs(rec: GameRec, p: number, fens: string[], lm: ({ from: string; to: string } | null)[], flip: boolean): string {
  const mv = rec.moves[p - 1];
  if (!mv || !isErr(mv.c) || !mv.b) return '';
  const played = lm[p];
  const arrows: Arrow[] = [];
  if (played) arrows.push({ from: played.from, to: played.to, kind: 'played' });
  arrows.push({ from: mv.b.slice(0, 2), to: mv.b.slice(2, 4), kind: 'best' });
  const one = boardHTML(fens[p - 1], { mini: true, flip, arrows, last: lm[p - 1], label: `Posición antes de tu jugada ${mv.s}: tu jugada en rojo y la mejor ${mv.bs || ''} en verde` });
  const rep = replyArrow(fens[p], mv.r);
  const two = rep ? boardHTML(fens[p], { mini: true, flip, arrows: [{ ...rep, kind: 'played' }], last: played, label: `Posición tras ${mv.s}: el rival responde ${mv.r}` }) : '';
  return `<div class="thumbs"><figure><button class="thumb" data-action="alt-on" aria-label="Ver la jugada mejor en el tablero grande">${one}</button><figcaption><span class="key r"></span>Tu jugada <strong>${esc(mv.s)}</strong> · <span class="key g"></span>mejor <strong>${esc(mv.bs || '')}</strong></figcaption></figure>${two ? `<figure>${two}<figcaption><span class="key r"></span>El rival responde <strong>${esc(mv.r || '')}</strong></figcaption></figure>` : ''}</div>`;
}

/** Jugada en el tablero de revisión: abre (o continúa) una variante para explorar. */
export function exploreMove(baseFen: string, baseLast: { from: string; to: string } | null, from: string, to: string, promotion?: string) {
  const cur = S.explore ? S.explore.fens[S.explore.fens.length - 1] : baseFen;
  const r = applyUci(cur, from + to + (promotion || ''));
  if (!r) return;
  if (!S.explore) S.explore = { fens: [baseFen], sans: [], last: [baseLast], basePly: S.ply };
  S.explore.fens.push(r.fen);
  S.explore.sans.push(r.san);
  S.explore.last.push({ from: r.from, to: r.to });
  S.anim = { from: r.from, to: r.to };
  S.alt = false;
  moveSound(r);
  render();
}

export function exploreBack() {
  const e = S.explore;
  if (!e) return false;
  e.fens.pop();
  e.sans.pop();
  e.last.pop();
  if (e.fens.length <= 1) S.explore = null;
  render();
  return true;
}

/** Fen que se ve ahora en la revisión (para jugar líneas del motor). */
let viewFen = '';
let viewBase: { fen: string; last: { from: string; to: string } | null } = { fen: '', last: null };
export const reviewFen = () => viewFen;
export function playLine(uci: string) {
  if (!uci) return;
  exploreMove(viewBase.fen, viewBase.last, uci.slice(0, 2), uci.slice(2, 4), uci[4]);
}

export function vReview(id: string): string {
  const rec = S.recs.find((g) => g.id === id);
  if (!rec) return '<section class="card"><p>No encuentro esa partida.</p><a class="btn" href="#/partidas">Volver</a></section>';
  const { fens, lm } = replay(rec.moves);
  const n = rec.moves.length;
  const p = Math.max(0, Math.min(n, S.ply));
  if (S.explore && S.explore.basePly !== p) S.explore = null;
  const ex = S.explore;
  const mv = p > 0 ? rec.moves[p - 1] : null;
  const mine = !!mv?.c;
  const bad = !!mv && isErr(mv.c) && !!mv.b;
  const alt = S.alt && bad && !ex;
  const flip = S.flip ?? rec.color === 'b';
  const baseFen = alt ? fens[p - 1] : fens[p];
  const baseLast = alt ? lm[p - 1] : lm[p];
  const fen = ex ? ex.fens[ex.fens.length - 1] : baseFen;
  const last = ex ? ex.last[ex.last.length - 1] : baseLast;
  viewFen = fen;
  viewBase = { fen: ex ? ex.fens[0] : baseFen, last: ex ? ex.last[0] : baseLast };
  const arrows: Arrow[] = [];
  if (alt) {
    if (lm[p]) arrows.push({ from: lm[p]!.from, to: lm[p]!.to, kind: 'played' });
    arrows.push({ from: mv!.b!.slice(0, 2), to: mv!.b!.slice(2, 4), kind: 'best' });
  }
  const badge = !ex && mv && mine && !alt && mv.c !== 'g' && lm[p] ? { sq: lm[p]!.to, cls: mv.c! } : null;
  setCtl({ fen: () => viewFen, canMove: () => true, onMove: (f, t, pr) => exploreMove(viewBase.fen, viewBase.last, f, t, pr) });
  const board = boardHTML(fen, {
    flip, last, arrows, badge, interactive: true, focusSq: S.focusSq, dragging: S.drag, anim: S.settings.animations ? S.anim : null,
    promo: S.promo ? { color: fen.split(' ')[1] === 'b' ? 'b' : 'w' } : null, ...selectionProps(fen),
    label: ex ? `Variante: ${ex.sans.join(' ')}` : `Posición tras la jugada ${p}${mv ? ': ' + mv.s : ''}. Puedes mover piezas para explorar.`,
  });
  const live = S.live ? liveEvalWhite(fen) : null;
  const cpNow = live ?? (ex ? 0 : alt ? (p >= 2 ? rec.moves[p - 2].e : 20) : p > 0 ? rec.moves[p - 1].e : 20);

  const clockOf = (color: 'w' | 'b') => {
    for (let i = p - 1; i >= 0; i--) if ((i % 2 === 0) === (color === 'w') && rec.moves[i].cl != null) return rec.moves[i].cl;
    return undefined;
  };
  const meC = rec.color;
  const opC = rec.color === 'w' ? 'b' : 'w';
  const strip = (color: 'w' | 'b', name: string, elo: number) => `<div class="pstrip"><span><span class="dotc ${color}" aria-hidden="true"></span>${esc(name)}${elo ? ` <span class="muted">(${elo})</span>` : ''}</span>${clockOf(color) != null ? `<span class="clk" aria-label="Reloj">${mmss(clockOf(color))}</span>` : ''}</div>`;
  const top = flip ? strip(meC, rec.user, rec.elo) : strip(opC, rec.opp, rec.oppElo);
  const bottom = flip ? strip(opC, rec.opp, rec.oppElo) : strip(meC, rec.user, rec.elo);

  const sg = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const TB = {
    first: `<svg ${sg}><path d="M6 5v14M17 6l-8 6 8 6"/></svg>`,
    prev: `<svg ${sg}><path d="m15 6-6 6 6 6"/></svg>`,
    next: `<svg ${sg}><path d="m9 6 6 6-6 6"/></svg>`,
    last: `<svg ${sg}><path d="M18 5v14M7 6l8 6-8 6"/></svg>`,
    play: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>`,
    flip: `<svg ${sg}><path d="M7 4v13m0 0-3-3m3 3 3-3M17 20V7m0 0-3 3m3-3 3 3"/></svg>`,
    help: `<svg ${sg}><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1 1-1.1 1.7M12 17h.01"/></svg>`,
  };
  const tb = (action: string, label: string, icon: string, extra = '') => `<button type="button" class="tbtn" data-action="${action}" aria-label="${label}" title="${label}" ${extra}>${icon}</button>`;

  let rows = '';
  for (let i = 0; i < n; i += 2) {
    const cell = (j: number) => {
      const m = rec.moves[j];
      if (!m) return '<span></span>';
      const sym = m.c && SYM[m.c] && m.c !== 'b' ? `<span class="mk c-${m.c}" aria-hidden="true">${SYM[m.c]}</span><span class="sr">${CLASS_ES[m.c]}: </span>` : '';
      return `<button type="button" class="mv" data-action="ply" data-ply="${j + 1}" data-cur="${p === j + 1}" aria-current="${p === j + 1}"><span>${esc(m.s)}</span>${sym}</button>`;
    };
    rows += `<span class="num">${i / 2 + 1}</span>${cell(i)}${cell(i + 1)}`;
  }

  // Evaluaciones (desde las blancas) antes y después de la jugada que se ve
  const evBefore = p >= 2 ? rec.moves[p - 2].e : 20;
  const evAfter = p >= 1 ? rec.moves[p - 1].e : 20;
  const evChips = mv ? `<span class="evchip" title="Evaluación antes de la jugada">${fmtEval(evBefore)}</span><span class="evarrow" aria-hidden="true">→</span><span class="evchip" title="Evaluación después de la jugada">${fmtEval(evAfter)}</span>` : '';

  let coach: string;
  if (ex) {
    coach = `<section class="coachcard" aria-label="Variante"><div class="ch"><span class="cbadge">⤷</span><div class="ct"><strong class="mvname">Variante</strong><span class="clab">desde la jugada ${p}</span></div></div><p>${esc(ex.sans.join(' '))}</p>
      <div class="cact"><button class="btn small" data-action="ex-back">Deshacer</button><button class="btn small primary" data-action="ex-close">Volver a la partida</button></div></section>`;
  } else if (mv && mine) {
    const exp = explainMove(mv);
    const face = mv.c === 'g' ? '✓' : SYM[mv.c!];
    const title = mv.c === 'b' ? 'Mejor jugada' : mv.c === 'g' ? 'Buena jugada' : mv.c === 'k' ? 'Jugada brillante' : mv.c === 'h' ? 'Jugada genial' : CLASS_ES[mv.c!];
    coach = `<section class="coachcard k-${mv.c}" aria-label="Análisis de la jugada"><div class="ch"><span class="cbadge c-${mv.c}" aria-hidden="true">${face}</span><div class="ct"><strong class="mvname">${Math.floor((p - 1) / 2) + 1}${p % 2 === 1 ? '.' : '...'} ${esc(mv.s)}</strong><span class="clab">${title}${mv.d && mv.c !== 'b' ? ` · −${Math.round(mv.d)}` : ''}</span></div><div class="cev">${evChips}</div></div>
      ${exp ? `<p>${esc(exp)}</p>` : mv.c === 'b' || mv.c === 'g' ? '<p class="sub">Sin problemas en esta jugada.</p>' : ''}
      ${bad ? thumbs(rec, p, fens, lm, flip) : ''}
      ${bad ? `<div class="cact"><button class="btn small ${S.alt ? 'primary' : ''}" data-action="alt" aria-pressed="${S.alt}">${S.alt ? 'Volver a la partida' : 'Ver ' + esc(mv.bs || 'la mejor')}</button><button class="btn small" data-action="play-best">Probar ${esc(mv.bs || 'la mejor')}</button>${isBigErr(mv.c) && mv.f ? `<button class="btn small primary" data-action="practice" data-key="${esc(rec.id)}:${p - 1}">Practicar</button>` : ''}</div>` : ''}</section>`;
  } else if (mv) {
    coach = `<section class="coachcard" aria-label="Jugada del rival"><div class="ch"><span class="cbadge">${p % 2 === 1 ? '♙' : '♟'}</span><div class="ct"><strong class="mvname">${Math.floor((p - 1) / 2) + 1}${p % 2 === 1 ? '.' : '...'} ${esc(mv.s)}</strong><span class="clab">Jugada de ${esc(rec.opp)}</span></div><div class="cev">${evChips}</div></div><p class="sub">Mueve piezas en el tablero para probar ideas.</p></section>`;
  } else {
    coach = '<section class="coachcard" aria-label="Posición inicial"><div class="ch"><span class="cbadge">♞</span><div class="ct"><strong class="mvname">Posición inicial</strong><span class="clab">Empieza la partida</span></div></div><p class="sub">Avanza con las flechas o reproduce la partida. Mueve piezas en el tablero para explorar variantes.</p></section>';
  }

  const errIdx = rec.moves.map((m, i) => ({ m, i })).filter((x) => isBigErr(x.m.c));
  const prevE = [...errIdx].reverse().find((x) => x.i + 1 < p);
  const nextE = errIdx.find((x) => x.i + 1 > p);
  const c = rec.counts;
  const total = Math.max(1, c.x + c.m + c.i + c.g + c.b + (c.h ?? 0) + (c.k ?? 0));
  const phases = (Object.entries(rec.byPhase) as [keyof typeof PHASE_ES, (typeof rec.byPhase)['apertura']][]).filter(([, v]) => v.n).map(([k, v]) => `<div class="phrow"><span>${PHASE_ES[k]}</span><div class="bar"><i style="width:${Math.min(100, ((v.m + v.x) / Math.max(1, v.n)) * 400)}%"></i></div><b>${v.m + v.x}</b></div>`).join('');
  const classRow = (cls: 'k' | 'h' | 'b' | 'g' | 'i' | 'm' | 'x', label: string, v: number) => `<div class="clrow"><span class="cbadge sm c-${cls}" aria-hidden="true">${cls === 'g' ? '✓' : SYM[cls]}</span><span class="cn">${label}</span><div class="bar"><i class="c-${cls}" style="width:${(v / total) * 100}%"></i></div><b>${v}</b></div>`;
  const white = rec.color === 'w' ? rec.user : rec.opp;
  const black = rec.color === 'w' ? rec.opp : rec.user;
  const resCls = rec.result === 'W' ? 'good' : rec.result === 'L' ? 'bad' : '';

  const liveOn = S.live;
  const enginePanel = `<section class="rvcard"><header><h3>Motor</h3><div class="eng-tools">${liveOn ? `<div class="seg-ctl sm" role="group" aria-label="Líneas del motor">${[1, 2, 3].map((k) => `<button type="button" data-action="live-lines" data-v="${k}" aria-pressed="${S.settings.liveLines === k}" aria-label="${k} ${k === 1 ? 'línea' : 'líneas'}">${k}</button>`).join('')}</div>` : ''}<button type="button" class="switch" role="switch" aria-checked="${liveOn}" aria-label="Motor en vivo" data-action="live"><i></i></button></div></header>
    ${liveOn ? livePanel(fen) : (stopLive(), '<p class="sub">Activa el motor para ver las mejores líneas de Stockfish en la posición que miras, también en tus variantes.</p>')}</section>`;

  return `<div class="rv">
  <header class="rv-head"><a class="back" href="#/partidas">← Partidas</a>
    <div class="rv-title"><h1>${esc(white)} <span class="vs">vs</span> ${esc(black)}</h1>
      <div class="rv-meta"><span class="pill ${resCls}">${resultLabel(rec.result)}</span><span>${fmtDate(rec.ts, rec.date)}</span><span>${esc(stripColor(rec.opening))}</span><span>Precisión <strong>${rec.acc}%</strong></span>${(c.k ?? 0) ? `<span class="pill brill">${c.k} ${c.k === 1 ? 'brillante' : 'brillantes'}</span>` : ''}${(c.h ?? 0) ? `<span class="pill great">${c.h} ${c.h === 1 ? 'genial' : 'geniales'}</span>` : ''}${rec.url ? `<a href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer">Abrir en ${SRC[rec.src]} ↗</a>` : ''}</div></div></header>
  <div class="rv-main">
    <div class="rv-board">${top}<div class="board-row">${evalBarHTML(cpNow, flip)}${board}</div>${bottom}
      <div class="toolbar" role="toolbar" aria-label="Control de la partida"><div class="tg">${tb('step', 'Ir al inicio', TB.first, 'data-d="-999"')}${tb('step', 'Jugada anterior', TB.prev, 'data-d="-1"')}${tb('play', S.playing ? 'Pausar' : 'Reproducir', S.playing ? TB.pause : TB.play, `aria-pressed="${S.playing}"`)}${tb('step', 'Jugada siguiente', TB.next, 'data-d="1"')}${tb('step', 'Ir al final', TB.last, 'data-d="999"')}</div><div class="tg">${tb('flip', 'Girar el tablero', TB.flip, `aria-pressed="${flip !== (rec.color === 'b')}"`)}${tb('help-toggle', 'Atajos de teclado', TB.help, `aria-pressed="${S.help}"`)}</div></div>
      ${S.help ? '<div class="helpbox" role="note"><span><span class="kbd">←</span><span class="kbd">→</span> mover</span><span><span class="kbd">Espacio</span> reproducir</span><span><span class="kbd">B</span> mejor jugada</span><span><span class="kbd">F</span> girar</span><span><span class="kbd">[</span><span class="kbd">]</span> errores</span><span><span class="kbd">L</span> motor</span></div>' : ''}</div>
    <aside class="rv-panel">
      <div role="status" aria-live="polite">${coach}</div>
      ${enginePanel}
      <section class="rvcard movescard"><header><h3>Jugadas</h3>${ex ? '' : `<div class="errnav"><button class="btn small" data-action="goto-err" data-d="-1" ${prevE ? '' : 'disabled'} aria-label="Error anterior">‹ Error</button><button class="btn small" data-action="goto-err" data-d="1" ${nextE ? '' : 'disabled'} aria-label="Error siguiente">Error ›</button></div>`}</header><div class="moves3" id="movelist">${rows}</div></section>
    </aside></div>
  <div class="rv-below">
    <section class="card"><header><h2>Evolución de la partida</h2><span class="sub">Tu ventaja jugada a jugada · toca un punto para ir a él</span></header>${evalSVG(rec, p)}${legendErrors()}</section>
    <div class="grid2"><section class="card"><header><h2>Resumen</h2><span class="sub">Tus ${total} jugadas</span></header>
      <div class="sumrow"><div class="ring" style="--p:${rec.acc}" role="img" aria-label="${rec.acc}% de precisión"><span>${Math.round(rec.acc)}</span></div><div class="clrows">${(c.k ?? 0) ? classRow('k', 'Brillantes', c.k) : ''}${(c.h ?? 0) ? classRow('h', 'Geniales', c.h) : ''}${classRow('b', 'Mejores', c.b)}${classRow('g', 'Buenas', c.g)}${classRow('i', 'Imprecisiones', c.i)}${classRow('m', 'Errores', c.m)}${classRow('x', 'Graves', c.x)}</div></div></section>
      <section class="card"><header><h2>Errores por fase</h2><span class="sub">Errores y graves en cada tramo</span></header><div class="phrows">${phases}</div></section></div>
    ${errIdx.length ? `<section class="card"><header><h2>Momentos clave</h2><span class="sub">Tus errores más caros</span></header><div class="errgrid">${[...errIdx].sort((a, b) => (b.m.d || 0) - (a.m.d || 0)).slice(0, 6).map((x) => `<button class="errcard" data-action="ply" data-ply="${x.i + 1}"><span class="thumbwrap">${boardHTML(fens[x.i], { mini: true, flip, last: lm[x.i], arrows: [...(lm[x.i + 1] ? [{ from: lm[x.i + 1]!.from, to: lm[x.i + 1]!.to, kind: 'played' as const }] : []), ...(x.m.b ? [{ from: x.m.b.slice(0, 2), to: x.m.b.slice(2, 4), kind: 'best' as const }] : [])], label: 'Posición del momento clave' })}</span><span class="et"><span class="pill bad">−${Math.round(x.m.d || 0)}</span><strong>${Math.floor(x.i / 2) + 1}. ${esc(x.m.s)}${x.m.bs ? ' → ' + esc(x.m.bs) : ''}</strong><span class="sub">${esc(x.m.p ? TAG_ES[x.m.p] : '')}</span></span></button>`).join('')}</div></section>` : ''}
  </div></div>`;
}

/** "Jugar la mejor": la jugada recomendada se hace en el tablero como variante. */
export function playBest(rec: GameRec) {
  const p = S.ply;
  const mv = rec.moves[p - 1];
  if (!mv?.b) return;
  const { fens, lm } = replay(rec.moves);
  S.explore = null;
  S.alt = false;
  exploreMove(fens[p - 1], lm[p - 1], mv.b.slice(0, 2), mv.b.slice(2, 4), mv.b[4]);
}

export function errorNav(rec: { moves: { c?: string }[] }, p: number, dir: 1 | -1): number | null {
  const idx = rec.moves.map((m, i) => ({ m, i })).filter((x) => x.m.c === 'x' || x.m.c === 'm');
  const t = dir === 1 ? idx.find((x) => x.i + 1 > p) : [...idx].reverse().find((x) => x.i + 1 < p);
  return t ? t.i + 1 : null;
}
