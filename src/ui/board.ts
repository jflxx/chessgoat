// Tablero accesible: piezas SVG, resaltados, flechas, insignias de jugada, barra de evaluación y navegación por teclado.
import { Chess } from 'chess.js';
import { PIECE_NAME, winPct } from '../core/analysis';
import type { Cls, PieceType } from '../types';
import { esc } from './dom';

const FILES = 'abcdefgh';
const SPRITE = import.meta.env.BASE_URL + 'pieces/standard.svg';

export interface Arrow { from: string; to: string; kind: 'best' | 'played' | 'hint' }

export interface BoardOpts {
  flip?: boolean;
  last?: { from: string; to: string } | null;
  arrows?: Arrow[];
  sel?: string | null;
  targets?: string[];
  captures?: string[];
  interactive?: boolean;
  /** Con `interactive`, el tablero sigue siendo de botones pero no responde (así no se reconstruye al bloquearse y desbloquearse). */
  locked?: boolean;
  focusSq?: string;
  label?: string;
  /** Insignia de calidad de la jugada sobre la casilla de destino. */
  badge?: { sq: string; cls: Cls } | null;
  /** Casilla de la que se está arrastrando una pieza (se atenúa). */
  dragging?: string | null;
  /** Desliza la pieza que llega a `to` desde `from`. */
  anim?: { from: string; to: string } | null;
  /** Casillas resaltadas como pista. */
  hint?: string[];
  /** Selector de coronación abierto. */
  promo?: { color: 'w' | 'b' } | null;
  /** Miniatura para explicaciones: sin coordenadas ni insignias, solo imagen. */
  mini?: boolean;
}

const BADGE: Partial<Record<Cls, { t: string; name: string }>> = {
  k: { t: '!!', name: 'jugada brillante' }, h: { t: '!', name: 'jugada genial' }, b: { t: '★', name: 'mejor jugada' }, i: { t: '?!', name: 'imprecisión' }, m: { t: '?', name: 'error' }, x: { t: '??', name: 'error grave' },
};

export const pieceSVG = (color: 'w' | 'b', type: PieceType) =>
  `<svg class="pc" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><use href="${SPRITE}#${color}${type}"/></svg>`;

const ARROW_COLOR: Record<Arrow['kind'], string> = { best: 'var(--good)', played: 'var(--crit)', hint: 'var(--accent)' };

function arrowSVG(arrows: Arrow[], flip: boolean): string {
  const pos = (sq: string) => {
    const f = FILES.indexOf(sq[0]);
    const r = 8 - +sq[1];
    return [(flip ? 7 - f : f) * 10 + 5, (flip ? 7 - r : r) * 10 + 5];
  };
  let s = '<svg class="arrows" viewBox="0 0 80 80" aria-hidden="true"><defs>';
  for (const k of Object.keys(ARROW_COLOR) as Arrow['kind'][]) s += `<marker id="ah-${k}" markerWidth="3.2" markerHeight="3.2" refX="2.2" refY="1.6" orient="auto"><path d="M0 0L3.2 1.6L0 3.2z" fill="${ARROW_COLOR[k]}"/></marker>`;
  s += '</defs>';
  for (const a of arrows) {
    const [x1, y1] = pos(a.from);
    const [x2, y2] = pos(a.to);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    // El extremo se acorta para que la punta quede dentro de la casilla de destino.
    const ex = x2 - ((x2 - x1) / len) * 2.2;
    const ey = y2 - ((y2 - y1) / len) * 2.2;
    s += `<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" stroke="${ARROW_COLOR[a.kind]}" stroke-width="${a.kind === 'best' ? 1.8 : 1.3}" stroke-linecap="round" opacity="${a.kind === 'best' ? 0.9 : 0.7}" marker-end="url(#ah-${a.kind})"/>`;
  }
  return s + '</svg>';
}

export function boardHTML(fen: string, o: BoardOpts = {}): string {
  const { flip = false, last = null, sel = null, targets = [], captures = [], interactive = false, locked = false, badge = null, dragging = null, anim = null, hint = [], promo = null, mini = false } = o;
  const disp = (sq: string) => {
    const f = FILES.indexOf(sq[0]);
    const r = 8 - +sq[1];
    return [flip ? 7 - f : f, flip ? 7 - r : r];
  };
  let slide = '';
  if (anim) {
    const [fc, fr0] = disp(anim.from);
    const [tc, tr0] = disp(anim.to);
    slide = ` style="--dx:${(fc - tc) * 100}%;--dy:${(fr0 - tr0) * 100}%"`;
  }
  const ch = new Chess(fen);
  const b = ch.board();
  const inCheck = ch.isCheck();
  const focus = o.focusSq || 'e2';
  let s = `<div class="board${mini ? ' mini' : ''}" ${interactive ? 'role="group"' : 'role="img"'} aria-label="${esc(o.label || 'Tablero de ajedrez')}" data-board data-flip="${flip ? 1 : 0}">`;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const fr = flip ? 7 - f : f;
      const rr = flip ? 7 - r : r;
      const sq = FILES[fr] + (8 - rr);
      const p = b[rr][fr];
      const light = (fr + rr) % 2 === 0;
      const cls = ['sq', light ? 'light' : 'dark'];
      if (last && (sq === last.from || sq === last.to)) cls.push('hl');
      if (sel === sq) cls.push('sel');
      if (targets.includes(sq)) cls.push('tgt');
      if (captures.includes(sq)) cls.push('cap');
      if (inCheck && p && p.type === 'k' && p.color === ch.turn()) cls.push('chk');
      if (dragging === sq) cls.push('drag');
      if (hint.includes(sq)) cls.push('hintsq');
      let piece = p ? pieceSVG(p.color, p.type) : '';
      if (p && anim && anim.to === sq) piece = piece.replace('<svg class="pc"', `<svg class="pc slide"${slide}`);
      const co = mini ? '' : (f === 0 ? `<span class="co r" aria-hidden="true">${8 - rr}</span>` : '') + (r === 7 ? `<span class="co f" aria-hidden="true">${FILES[fr]}</span>` : '');
      const bd = !mini && badge && badge.sq === sq && BADGE[badge.cls] ? `<span class="bdg c-${badge.cls}" aria-hidden="true">${BADGE[badge.cls]!.t}</span>` : '';
      if (interactive) {
        const name = p ? `${PIECE_NAME[p.type]} ${p.color === 'w' ? 'blanco' : 'negro'}` : 'vacía';
        const extra = (sel === sq ? ', seleccionada' : '') + (targets.includes(sq) || captures.includes(sq) ? ', destino posible' : '');
        s += `<button type="button" class="${cls.join(' ')}${locked ? ' lock' : ''}" data-sq="${sq}" data-f="${f}" data-r="${r}" tabindex="${sq === focus && !locked ? 0 : -1}"${locked ? ' aria-disabled="true"' : ''} aria-label="${sq}, ${name}${extra}">${co}${piece}${bd}</button>`;
      } else {
        s += `<div class="${cls.join(' ')}" data-sq="${sq}">${co}${piece}${bd}</div>`;
      }
    }
  }
  if (o.arrows?.length) s += arrowSVG(o.arrows, flip);
  if (promo) {
    s += `<div class="promo" role="dialog" aria-modal="true" aria-label="Elige la pieza para coronar"><div class="promo-box">${(['q', 'r', 'b', 'n'] as PieceType[]).map((t) => `<button type="button" data-action="promo" data-p="${t}" aria-label="Coronar ${PIECE_NAME[t]}">${pieceSVG(promo.color, t)}</button>`).join('')}<button type="button" class="promo-x" data-action="promo" data-p="" aria-label="Cancelar">✕</button></div></div>`;
  }
  return s + '</div>';
}

export const badgeName = (c: Cls) => BADGE[c]?.name || '';

/** "+1,2", "-0,4" o "M3" desde el punto de vista de las blancas. */
export function fmtEval(cp: number): string {
  if (Math.abs(cp) >= 1400) return (cp > 0 ? '+' : '−') + 'M';
  const v = Math.round(Math.abs(cp) / 10) / 10;
  return (cp > 0 ? '+' : cp < 0 ? '−' : '') + String(v.toFixed(1)).replace('.', ',');
}

/** Barra de evaluación vertical. Blancas abajo salvo que el tablero esté girado. */
export function evalBarHTML(cpWhite: number, flip: boolean): string {
  const w = Math.max(2, Math.min(98, winPct(cpWhite)));
  const text = fmtEval(cpWhite);
  const whiteWinning = cpWhite >= 0;
  return `<div class="evalbar ${flip ? 'flip' : ''}" role="img" aria-label="Evaluación ${esc(text)} (positivo favorece a las blancas)"><div class="ev-b"></div><div class="ev-w" style="height:${w}%"></div><span class="ev-t ${whiteWinning ? 'on-w' : 'on-b'}">${esc(text)}</span></div>`;
}

/** Mueve el foco con las flechas dentro de un tablero interactivo. Devuelve true si gestionó la tecla. */
export function boardKey(e: KeyboardEvent, target: HTMLElement): boolean {
  const d: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
  const delta = d[e.key];
  if (!delta) return false;
  const f = +(target.dataset.f ?? 0) + delta[0];
  const r = +(target.dataset.r ?? 0) + delta[1];
  if (f < 0 || f > 7 || r < 0 || r > 7) return true;
  const next = target.closest('[data-board]')?.querySelector<HTMLElement>(`[data-f="${f}"][data-r="${r}"]`);
  if (next) {
    target.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
  }
  return true;
}

/** Posiciones de cada jugada de una partida guardada. */
export function replay(moves: { s: string }[], startFen?: string) {
  const ch = new Chess(startFen);
  const fens = [ch.fen()];
  const lm: ({ from: string; to: string } | null)[] = [null];
  for (const m of moves) {
    const mv = ch.move(m.s);
    fens.push(ch.fen());
    lm.push({ from: mv.from, to: mv.to });
  }
  return { fens, lm };
}
