import { WINDOWS, WINDOW_INFO, type Window } from '../../core/plan';
import { ico } from '../icons';
import { S } from '../state';

export const noGames = () => `<section class="card empty"><span class="bigico">${ico('cuenta')}</span><h2>Empieza con tus partidas</h2>
  <p>Importa tus últimas partidas de Chess.com o Lichess, o sube un PGN. El análisis corre en tu dispositivo y en unos minutos verás tus errores más frecuentes, un plan de estudio y posiciones para repasar.</p>
  <a class="btn primary" href="#/importar">Importar partidas</a></section>`;

export const windowPicker = (id = 'win'): string => `<div class="row tight" style="align-items:center"><span class="sub" id="${id}-l">Analizar las últimas</span>
  <div class="seg-ctl" role="group" aria-labelledby="${id}-l">${WINDOWS.map((w) => `<button type="button" data-action="window" data-v="${w}" aria-pressed="${S.settings.window === w}">${w}</button>`).join('')}</div>
  <span class="sub">partidas${S.recs.length < S.settings.window ? ` (tienes ${S.recs.length})` : ''}</span></div>`;

export const windowHelp = (w: Window) => `${WINDOW_INFO[w].label}: horizonte de ${WINDOW_INFO[w].horizon}`;
