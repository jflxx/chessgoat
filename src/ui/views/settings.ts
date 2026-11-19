import { esc } from '../dom';
import { engineSummary } from '../runner';
import { CLOUD_SQL } from '../../storage/cloud';
import { cloudConfigured, storageInfo } from '../cloudctl';
import { S } from '../state';

const isolated = () => typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;

export function vSettings(): string {
  const s = S.settings;
  const th: ['system' | 'light' | 'dark', string][] = [['system', 'Como el sistema'], ['light', 'Claro'], ['dark', 'Oscuro']];
  return `<h1>Ajustes</h1>
  <section class="card"><header><h2>Apariencia</h2></header>
    <div class="seg-ctl" role="group" aria-label="Tema">${th.map(([v, t]) => `<button type="button" data-action="theme" data-v="${v}" aria-pressed="${s.theme === v}">${t}</button>`).join('')}</div></section>
  <section class="card"><header><h2>Tablero</h2></header>
    <div class="seg-ctl" role="group" aria-label="Colores del tablero">${(['marron', 'marino', 'verde', 'azul', 'gris'] as const).map((v) => `<button type="button" data-action="board-theme" data-v="${v}" aria-pressed="${s.boardTheme === v}">${{ verde: 'Verde', marron: 'Madera', azul: 'Azul', gris: 'Gris', marino: 'Marino' }[v]}</button>`).join('')}</div>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-action="toggle" data-k="sound" ${s.sound ? 'checked' : ''}> Sonidos al mover y al acertar o fallar</label>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-action="toggle" data-k="animations" ${s.animations ? 'checked' : ''}> Animar las piezas</label></section>
  <section class="card"><header><h2>Motor de análisis</h2></header>
    <p class="sub">${esc(engineSummary())}</p>
    <div class="banner">Multihilo disponible en este navegador: <strong>${isolated() ? 'sí' : 'no'}</strong>. ${isolated() ? '' : 'Requiere las cabeceras Cross-Origin-Opener-Policy y Cross-Origin-Embedder-Policy, que se activan al desplegar con vercel.json.'}</div>
    <div class="row"><label class="f">Modo<select data-action="setting" data-k="engineMode"><option value="auto" ${s.engineMode === 'auto' ? 'selected' : ''}>Automático (recomendado)</option><option value="single" ${s.engineMode === 'single' ? 'selected' : ''}>Un hilo, varios workers</option><option value="multi" ${s.engineMode === 'multi' ? 'selected' : ''}>Multihilo: un worker con todos los hilos</option></select></label>
      <label class="f">Hilos o workers<input type="number" min="1" max="16" value="${s.cores}" data-action="setting" data-k="cores"></label></div></section>
  <section class="card"><header><h2>Tus datos</h2><span class="sub">${S.recs.length} partidas · guardadas en ${S.store?.mode() === 'indexeddb' ? 'IndexedDB, solo en este navegador' : 'memoria (se pierden al cerrar)'}</span></header>
    <p class="sub">Todo se guarda en tu dispositivo. Exporta una copia para llevarla a otro navegador o para no perderla si borras los datos del sitio.</p>
    <div class="row tight"><button class="btn" data-action="export">Exportar mis datos (JSON)</button><label class="btn" style="cursor:pointer">Importar copia<input type="file" accept="application/json,.json" data-action="import-backup" class="sr"></label></div>
    <div class="row tight"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="replace" ${''}> Reemplazar lo que tengo (si no, se fusiona)</label></div>
    ${S.msg ? `<div class="banner ${S.msgKind === 'err' ? 'err' : ''}" role="${S.msgKind === 'err' ? 'alert' : 'status'}">${esc(S.msg)}</div>` : ''}
    ${S.recs.length ? `<div class="row tight"><button class="btn danger small" data-action="clear">${S.confirmClear ? 'Pulsa otra vez para borrar todo' : 'Borrar mis datos analizados'}</button></div>` : ''}</section>
  ${vSafe()}
  <section class="card"><header><h2>Acerca de</h2></header>
    <p>ChessGOAT es software libre (GPL-3.0). Analiza con <strong>Stockfish 18</strong> en tu navegador, sin enviar tus partidas a ningún servidor.</p>
    <ul class="tight"><li>Stockfish.js © Chess.com, LLC y los desarrolladores de Stockfish. Licencia GPL-3.0.</li><li><a href="${import.meta.env.BASE_URL}engine/LICENSE-GPL3.txt" target="_blank" rel="noopener">Texto de la licencia GPL-3.0</a></li><li>Piezas: Colin M. L. Burnett, CC BY-SA 3.0.</li><li><a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noopener noreferrer">Código fuente de Stockfish.js</a> · <a href="https://github.com/official-stockfish/Stockfish" target="_blank" rel="noopener noreferrer">Stockfish</a></li></ul></section>`;
}

const mb = (n: number) => (n / 1048576).toFixed(n > 10485760 ? 0 : 1).replace('.', ',') + ' MB';

/** Dónde se guardan tus partidas y cómo no perderlas (almacenamiento persistente y copia cifrada en la nube). */
function vSafe(): string {
  const s = S.settings;
  const p = storageInfo.persisted;
  const code = s.cloudCode;
  return `<section class="card"><header><h2>Que no se pierdan tus datos</h2></header>
    <p>Tus partidas se guardan en <strong>este navegador y en esta dirección web</strong> (IndexedDB). Así no tienes que volver a subirlas cada vez que entras. Se perderían si borras los datos del sitio, usas una ventana privada, cambias de navegador o abres otra dirección (por ejemplo, una versión de prueba de Vercel).</p>
    <div class="banner">Almacenamiento persistente: <strong>${p == null ? 'no disponible' : p ? 'activado (el navegador no lo borrará solo)' : 'no activado'}</strong>${storageInfo.usage ? ` · usando ${mb(storageInfo.usage)}` : ''}.
      ${p === false ? '<div class="row tight" style="margin-top:8px"><button class="btn small primary" data-action="persist">Pedir almacenamiento persistente</button></div>' : ''}</div>
    <h3>Copia en la nube (gratis y opcional)</h3>
    <p class="sub">Para usar tus datos en otro dispositivo o por seguridad. Usa tu propio proyecto gratuito de <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">Supabase</a>. Los datos se <strong>cifran en tu navegador</strong> con tu código: el servidor solo ve datos ilegibles.</p>
    <details><summary>Cómo configurarlo (2 minutos)</summary><ol class="tight"><li>Crea un proyecto gratis en Supabase.</li><li>En <strong>SQL Editor</strong> pega y ejecuta este SQL:<pre class="sql">${esc(CLOUD_SQL)}</pre><button class="btn small" data-action="copy" data-text="${esc(CLOUD_SQL)}">Copiar el SQL</button></li><li>En <strong>Project Settings → API</strong> copia la <em>Project URL</em> y la clave <em>anon public</em> y pégalas aquí.</li><li>Genera tu código de sincronización (o escribe el de otro dispositivo) y pulsa <strong>Subir ahora</strong>.</li></ol></details>
    <div class="row"><label class="f">URL del proyecto<input type="text" value="${esc(s.cloudUrl)}" placeholder="https://abcd1234.supabase.co" data-action="cloud-field" data-k="cloudUrl" autocomplete="off" spellcheck="false"></label>
      <label class="f">Clave anon (pública)<input type="text" value="${esc(s.cloudKey)}" placeholder="eyJ…" data-action="cloud-field" data-k="cloudKey" autocomplete="off" spellcheck="false"></label></div>
    <label class="f">Código de sincronización (secreto: quien lo tenga puede leer tus datos)<input type="text" value="${esc(code)}" placeholder="Genera uno o pega el de otro dispositivo" data-action="cloud-field" data-k="cloudCode" autocomplete="off" spellcheck="false"></label>
    <div class="row tight"><button class="btn small" data-action="cloud-gen">Generar código nuevo</button>${code ? `<button class="btn small" data-action="copy" data-text="${esc(code)}">Copiar código</button>` : ''}</div>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-action="toggle" data-k="cloudAuto" ${s.cloudAuto ? 'checked' : ''}> Subir cambios automáticamente (al terminar un análisis y al salir de la página)</label>
    <div class="row tight"><button class="btn primary" data-action="cloud-push" ${cloudConfigured() ? '' : 'disabled'}>Subir ahora</button><button class="btn" data-action="cloud-pull" ${cloudConfigured() ? '' : 'disabled'}>Descargar y fusionar</button></div>
    <p class="sub">${s.cloudLast ? 'Última copia subida: ' + new Date(s.cloudLast).toLocaleString('es') : 'Todavía no has subido ninguna copia.'} Guarda el código en un lugar seguro: sin él no se puede recuperar.</p></section>`;
}

export function vMore(): string {
  return `<h1>Más</h1><section class="card"><div class="glist">
    <a class="gitem" href="#/informe/resumen"><span class="bar"></span><span><span class="t1">Informe</span><span class="t2">Errores, patrones, conversión, reloj, aperturas y brillantes</span></span><span aria-hidden="true">›</span></a>
    <a class="gitem" href="#/progreso"><span class="bar"></span><span><span class="t1">Progreso</span><span class="t2">Tu precisión a lo largo del tiempo</span></span><span aria-hidden="true">›</span></a>
    <a class="gitem" href="#/importar"><span class="bar"></span><span><span class="t1">Importar</span><span class="t2">Chess.com, Lichess o PGN</span></span><span aria-hidden="true">›</span></a>
    <a class="gitem" href="#/ajustes"><span class="bar"></span><span><span class="t1">Ajustes</span><span class="t2">Tema, motor y tus datos</span></span><span aria-hidden="true">›</span></a></div></section>`;
}
