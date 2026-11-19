import { esc } from '../dom';
import { engineSummary } from '../runner';
import { S } from '../state';

const TABS: ['chesscom' | 'lichess' | 'pgn', string][] = [['chesscom', 'Chess.com'], ['lichess', 'Lichess'], ['pgn', 'Archivo PGN']];
const COUNTS = [10, 20, 30, 50, 100, 200, 0];
const CLASSES: [string, string][] = [['', 'Todos los ritmos'], ['bullet', 'Bala'], ['blitz', 'Blitz'], ['rapid', 'Rápidas'], ['classical', 'Clásicas'], ['daily', 'Por correspondencia']];

export function vImport(): string {
  const r = S.run;
  const pct = r && r.total ? Math.min(100, Math.round((r.done / r.total) * 100)) : 0;
  const tab = S.draft.tab;
  const userVal = S.draft.user ?? (tab === 'chesscom' ? S.settings.chesscomUser : tab === 'lichess' ? S.settings.lichessUser : S.settings.user);
  const online = tab !== 'pgn';
  return `<section class="card"><header><h1>Importar y analizar</h1><span class="sub">Guardado: ${S.store?.mode() === 'indexeddb' ? 'en este navegador (IndexedDB)' : 'solo en esta visita'}</span></header>
    <div class="tabs" role="group" aria-label="Origen de las partidas">${TABS.map(([k, t]) => `<button type="button" class="tab" data-action="src" data-v="${k}" aria-pressed="${tab === k}" ${tab === k ? 'aria-current="true"' : ''}>${t}</button>`).join('')}</div>
    ${online
      ? `<p class="sub">Se descargan tus partidas públicas directamente desde ${tab === 'chesscom' ? 'Chess.com' : 'Lichess'} a tu navegador. No hay ningún servidor intermedio.</p>
         <label class="f">Tu usuario en ${tab === 'chesscom' ? 'Chess.com' : 'Lichess'}<input type="text" id="user" value="${esc(userVal)}" autocapitalize="off" autocomplete="username" spellcheck="false" data-fk="user"></label>`
      : `<p class="sub">Sube el PGN que descargas de tu archivo de partidas, o pega el texto.</p>
         <label class="f">Archivo PGN<input type="file" id="file" accept=".pgn,.txt"></label>
         <label class="f">o pega el texto<textarea id="pgn" placeholder="[Event &quot;Live Chess&quot;] ...">${esc(S.draft.pgn)}</textarea></label>
         <label class="f">Tu usuario (se detecta solo si lo dejas vacío)<input type="text" id="user" value="${esc(userVal)}" autocapitalize="off" spellcheck="false"></label>`}
    <div class="row">
      <label class="f">Partidas a analizar<select data-action="setting" data-k="n">${COUNTS.map((v) => `<option value="${v}" ${S.settings.n === v ? 'selected' : ''}>${v ? 'Últimas ' + v : 'Todas (máximo 500)'}</option>`).join('')}</select></label>
      <label class="f">Ritmo<select data-action="setting" data-k="timeClass">${CLASSES.map(([v, t]) => `<option value="${v}" ${S.settings.timeClass === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="f">Profundidad<select data-action="setting" data-k="depth">${[[12, 'Rápida (12)'], [14, 'Normal (14)'], [16, 'Profunda (16)'], [18, 'Muy profunda (18)']].map(([v, t]) => `<option value="${v}" ${S.settings.depth === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-action="toggle" data-k="verify" ${S.settings.verify ? 'checked' : ''}> Verificar los errores con más profundidad (menos falsos errores; algo más lento)</label>
    <p class="sub">Motor: ${esc(engineSummary())}. <a href="#/ajustes">Cambiar</a></p>
    <div class="row tight"><button class="btn primary" data-action="analyze" ${r ? 'disabled' : ''}>Importar y analizar</button>${r ? '<button class="btn" data-action="cancel">Cancelar</button>' : ''}</div>
    ${r ? `<div><div class="progress" role="progressbar" aria-label="Progreso del análisis" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div><p class="sub" id="run-label" role="status" style="margin-top:6px">${esc(r.label)}${r.total ? ' · ' + pct + '%' : ''}</p></div>` : ''}
    ${S.msg ? `<div class="banner ${S.msgKind === 'err' ? 'err' : ''}" role="${S.msgKind === 'err' ? 'alert' : 'status'}">${esc(S.msg)}</div>` : ''}
    ${!r && S.msgKind !== 'err' && S.msg.startsWith('Listo') ? '<div class="row tight"><a class="btn primary" href="#/plan">Ver mi plan</a><a class="btn" href="#/informe/resumen">Abrir el informe</a><a class="btn" href="#/repaso">Repasar mis errores</a></div>' : ''}
    ${S.engineNote && !r ? `<p class="sub">Último análisis con: ${esc(S.engineNote)}</p>` : ''}
    ${!r && S.recs.length ? `<p class="sub">Las partidas que ya analizaste se saltan.</p>` : ''}
    <details><summary>Cómo descargar el PGN a mano</summary><ol class="tight"><li>En Chess.com abre tu archivo de partidas, marca las partidas y descárgalas como PGN.</li><li>En Lichess, abre tu perfil y usa Exportar partidas.</li><li>Súbelo en la pestaña Archivo PGN.</li></ol></details></section>`;
}
