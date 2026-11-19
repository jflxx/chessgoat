// Mascota: la cabra de ChessGOAT, dibujada en SVG y animada con CSS. Aparece al llegar a una jugada
// brillante (celebra a lo grande) o genial (saluda con calma), como los entrenadores de Chess.com y Lichess.
import type { Cls } from '../types';

const OL = '#a9b4cc'; // contorno suave
const WHITE = '#ffffff';
const HOOF = '#8a5a33';
const HOOF_D = '#5e3a1c';
const GOLD = '#f2b632';
const GOLD_D = '#b9791a';

const star = (x: number, y: number, s: number, cls: string) =>
  `<path class="gsp ${cls}" d="M${x} ${y - s}Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y}Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s}Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y}Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s}Z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1"/>`;

const horn = (d: string) =>
  `<path d="${d}" fill="none" stroke="${GOLD_D}" stroke-width="11" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${GOLD}" stroke-width="7.5" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${GOLD_D}" stroke-width="7.5" stroke-dasharray="1.4 5.6" opacity=".55"/>`;

const eye = (cx: number, cy: number) =>
  `<g class="geye"><ellipse cx="${cx}" cy="${cy}" rx="6.4" ry="8.4" fill="#1d2340"/><circle cx="${cx + 2.2}" cy="${cy - 3}" r="2.6" fill="#fff"/><circle cx="${cx - 2}" cy="${cy + 3.2}" r="1.2" fill="#fff"/></g>`;

/** `k` = brillante (salta, saluda, boca abierta, brillos); `h` = genial (guiño, sonrisa y saludo suave). */
export function goatSVG(kind: Extract<Cls, 'k' | 'h'>, key = ''): string {
  const happy = kind === 'k';
  const eyes = happy
    ? eye(70, 64) + eye(97, 64)
    : eye(70, 64) + `<path d="M90 66Q97 57 104 66" fill="none" stroke="#1d2340" stroke-width="3.6" stroke-linecap="round"/>`;
  const brows = `<path d="M62 52Q70 46 77 50" fill="none" stroke="${OL}" stroke-width="2.4" stroke-linecap="round"/><path d="M90 50Q97 46 105 52" fill="none" stroke="${OL}" stroke-width="2.4" stroke-linecap="round"/>`;
  const mouth = happy
    ? `<path d="M72 80Q84 100 96 80Z" fill="#7a2f26" stroke="#7a2f26" stroke-width="1.5" stroke-linejoin="round"/><path d="M77 90Q84 98 91 90Q84 85 77 90Z" fill="#ff8a8a"/>`
    : `<path d="M73 81Q84 93 95 81" fill="none" stroke="#7a2f26" stroke-width="3" stroke-linecap="round"/>`;
  const sparks = happy
    ? star(22, 40, 9, 's1') + star(142, 34, 7, 's2') + star(134, 10, 5, 's3') + star(14, 88, 5, 's2') + star(148, 70, 4, 's3')
    : star(140, 30, 7, 's1') + star(20, 44, 5, 's3');
  const st = `stroke="${OL}" stroke-width="2.4" stroke-linejoin="round"`;
  return `<div class="goat ${happy ? 'brill' : 'great'}" data-key="${key}" aria-hidden="true"><svg viewBox="0 0 160 180" focusable="false">
    <ellipse cx="82" cy="172" rx="46" ry="6.5" fill="#000" opacity=".16"/>
    <g class="gbob">
      <g class="gtail"><path d="M38 128C22 118 18 136 30 140C27 147 40 150 45 138Z" fill="${WHITE}" ${st}/></g>
      <path d="M52 136L50 163L68 163L70 138Z" fill="${WHITE}" ${st}/><path d="M49 160H69Q71 170 67 171H53Q47 170 49 160Z" fill="${HOOF}" stroke="${HOOF_D}" stroke-width="1.6" stroke-linejoin="round"/>
      <ellipse cx="82" cy="124" rx="40" ry="31" fill="${WHITE}" ${st}/>
      <path d="M92 138L90 165L108 165L110 138Z" fill="${WHITE}" ${st}/><path d="M89 162H109Q111 172 107 173H93Q87 172 89 162Z" fill="${HOOF}" stroke="${HOOF_D}" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M68 150L70 166L86 166L84 148Z" fill="${WHITE}" ${st}/><path d="M67 163H87Q89 173 85 174H71Q65 173 67 163Z" fill="${HOOF}" stroke="${HOOF_D}" stroke-width="1.6" stroke-linejoin="round"/>
      <g class="garm"><path d="M60 116Q36 112 31 90" fill="none" stroke="${OL}" stroke-width="17" stroke-linecap="round"/><path d="M60 116Q36 112 31 90" fill="none" stroke="${WHITE}" stroke-width="13" stroke-linecap="round"/><path d="M22 90Q20 77 31 76Q42 77 40 90Q39 98 31 99Q24 98 22 90Z" fill="${HOOF}" stroke="${HOOF_D}" stroke-width="1.8" stroke-linejoin="round"/><path d="M26 86Q31 80 36 86" fill="none" stroke="${HOOF_D}" stroke-width="1.6" stroke-linecap="round"/></g>
      ${horn('M94 38C98 14 124 6 138 22')}
      ${horn('M72 38C66 18 52 10 42 20')}
      <path class="gear l" d="M56 54C40 46 28 56 30 68C32 78 46 76 56 68Z" fill="${WHITE}" ${st}/><path class="gear l" d="M52 58C43 54 37 59 38 66C40 71 47 70 52 66Z" fill="#f4a9b5"/>
      <path class="gear r" d="M110 54C126 52 138 64 134 80C130 90 114 82 108 70Z" fill="${WHITE}" ${st}/>
      <path d="M78 36Q82 24 86 36Q82 31 78 36Z" fill="${WHITE}" ${st}/>
      <ellipse cx="84" cy="66" rx="36" ry="32" fill="${WHITE}" ${st}/>
      <path d="M48 70L43 77L51 76Z" fill="${WHITE}" ${st}/><path d="M120 70L125 77L117 76Z" fill="${WHITE}" ${st}/>
      ${brows}
      <g class="geyes">${eyes}</g>
      <circle cx="60" cy="78" r="5.5" fill="#f4a9b5" opacity=".55"/><circle cx="108" cy="78" r="5.5" fill="#f4a9b5" opacity=".55"/>
      <ellipse cx="84" cy="73" rx="4.4" ry="3.2" fill="#f4a9b5" stroke="#d98a98" stroke-width="1.2"/>
      ${mouth}
      <path d="M79 98Q84 112 89 98Q84 101 79 98Z" fill="${WHITE}" ${st}/>
    </g>
    ${sparks}
  </svg></div>`;
}
