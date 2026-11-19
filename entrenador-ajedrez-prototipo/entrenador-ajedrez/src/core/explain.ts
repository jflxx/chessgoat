import type { MoveRec } from '../types';
import { PIECE_ES, isErr } from './analysis';

/** Explicación en español de por qué una jugada fue mala. */
export function explainMove(m: MoveRec | null | undefined): string {
  if (m?.c === 'k') return 'Ofreces ' + (m.sac ? PIECE_ES[m.sac] : 'material') + ', pero el rival no puede sacarle partido: el motor confirma que tu posición sigue siendo muy buena. Es una jugada brillante.';
  if (m?.c === 'h') return 'Era una jugada difícil de encontrar: la siguiente mejor opción perdía bastante. Tuviste el ojo justo.';
  if (!m || !isErr(m.c)) return '';
  const best = m.bs ? ' La mejor era ' + m.bs + '.' : '';
  const lost = m.t?.includes('ventaja_perdida');
  let t = '';
  switch (m.p) {
    case 'mate_rey':
      t = 'Después de ' + m.s + ', el rival ' + (m.r ? 'responde ' + m.r + ' y ' : '') + 'queda con mate o con un ataque decisivo a tu rey.';
      break;
    case 'pieza_colgada':
      t = m.mp
        ? 'La pieza que moviste quedó atacada: el rival la gana con ' + m.r + '.'
        : 'Después de ' + m.s + ', el rival juega ' + m.r + ' y gana ' + (m.k ? PIECE_ES[m.k] : 'una pieza') + '.';
      break;
    case 'horquilla':
      t = 'Después de ' + m.s + ', ' + (m.r || 'el rival') + ' ataca dos de tus piezas a la vez.';
      break;
    case 'tactica_perdida':
      t = m.ms === 'mate' ? 'Tenías mate o un ataque ganador con ' + m.bs + '.' : 'Había una captura mejor disponible: ' + m.bs + '.';
      break;
    case 'peon_perdido':
      t = 'Después de ' + m.s + ', el rival juega ' + m.r + ' y se lleva un peón.';
      break;
    case 'rey_expuesto':
      t = 'Después de ' + m.s + ', el rival golpea cerca de tu rey con ' + (m.r || 'un jaque') + '.';
      break;
    default:
      return 'No pierdes material de inmediato, pero la posición empeora.' + best + (lost ? ' Tenías ventaja y se redujo mucho.' : '');
  }
  if (lost) t += ' Tenías ventaja y la desperdiciaste.';
  return t + (m.p === 'tactica_perdida' ? '' : best);
}
