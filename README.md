# ChessGOAT

Aplicación web en español que analiza tus partidas de **Chess.com**, **Lichess** o un **PGN** con **Stockfish 18** (WASM) en tu propio dispositivo y te dice qué estudiar: errores por motivo, patrones que se repiten, plan semanal, repaso espaciado de tus errores y progreso.

Es un sitio **estático**: no hay servidor, no se envían tus partidas a ningún lado y no hace falta Render ni ningún backend. Todo el cálculo usa la CPU de tu equipo y los datos se guardan en tu navegador (IndexedDB).

## Qué incluye

- **Importar**: desde la API pública de Chess.com (`/pub/player/{usuario}/games/archives` y los archivos mensuales), desde la API de Lichess (`/api/games/user/{usuario}`) o subiendo/pegando un PGN. Eliges cuántas partidas analizar (10 a 200, o todas hasta 500) y el ritmo (bala, blitz, rápidas…).
- **Análisis**: cada jugada se evalúa con Stockfish; se clasifica por pérdida de probabilidad de ganar (imprecisión ≥ 10, error ≥ 20, error grave ≥ 30) y se etiqueta el motivo: pieza colgada, horquilla, mate o ataque al rey, captura o mate perdido, peón regalado, rey expuesto, posicional y ventaja desperdiciada.
- **Informe estilo panel**: pestañas grandes con icono (Resumen, Errores, Patrones, Conversión, Reloj, Aperturas), cabecera con tu usuario y filtro por ritmo, velocímetro de precisión, victorias con barra de resultados, línea de Elo con máximo y mínimo, hilera de tus últimas partidas (un cuadro por partida, clicable), Elo por ritmo y calendario de actividad (partidas jugadas y días de práctica). La pestaña de errores muestra cada jugada con su miniatura.
- **Pestañas del informe con análisis propio**: *Errores* (errores partida a partida, tipos con tendencia y botón de practicar, en qué tramo de la partida fallas, cómo estabas al fallar, piezas que pierdes y mapa de casillas conflictivas), *Patrones* (estados persistente, nuevo, mejorando y resuelto como filtros, con miniatura de un ejemplo), *Conversión* (velocímetro, embudo, ventaja máxima de cada partida, conversión por tamaño de ventaja y fase en que se escapa), *Reloj* (errores según el tiempo que te queda y el que gastas, cómo gastas el reloj y partidas con apuros) y *Aperturas* (repertorio, la que mejor y peor te va, y detalle con blancas y negras con miniatura de la posición).
- **Pantallas**: Inicio (plan de hoy, racha), Informe (resumen, errores, patrones, conversión, reloj, aperturas), Partidas y revisión con tablero y gráfico de evaluación, Repaso de errores (repetición espaciada), Plan, Progreso, Importar y Ajustes.
- **Plan accionable dentro de la app**: cada semana (de lunes a domingo) se genera con tareas concretas que se hacen y se miden en la app. El repaso de errores se hace en sesiones con tus propias posiciones, filtradas por motivo, patrón recurrente o apertura, y se completa solo al llegar al objetivo. Revisar tu peor error o importar partidas nuevas también se marcan solos. Los puzzles externos (Lichess) y jugar partidas se marcan a mano. Hay anillo de progreso semanal, plan de hoy en Inicio y un objetivo medido con tus partidas nuevas (bajar un 25 % los errores por partida, con las partidas posteriores al inicio del plan). El estado se guarda en IndexedDB y entra en la copia de seguridad.
- **Ejercicios en el tablero de verdad** (repaso de tus errores y puzzles): la jugada se hace y la pieza se desliza. Si es correcta, el rival responde y sigues. Si no, la jugada queda en el tablero marcada con `??` y Stockfish juega la refutación. Desde ahí puedes reintentar, pedir una pista (primero la pieza, luego la flecha) o ver la solución animada. Hay selector de coronación y se puede escribir la jugada, también con letras españolas (`Cf3`, `Dxd5`). Atajos: `H` pista, `R` reintentar, `S` solución, `N` siguiente.
- **Puzzles por tema dentro de la app**: se piden a la API pública de Lichess (`/api/puzzle/next?angle=…&difficulty=…`, con CORS) y se resuelven aquí, con puntuación propia tipo Elo, dificultad elegible, temas recomendados según tus prioridades y precarga del siguiente. Las tareas de puzzles del plan se cumplen solas.
- **Revisión con exploración**: mueve piezas en el tablero para probar variantes, "Jugar la mejor en el tablero", y motor en vivo con las 3 mejores líneas de Stockfish (MultiPV) para cualquier posición, incluidas tus variantes. Toca una línea para jugarla. Atajo `L` motor.
- **Sonidos y temas**: sonidos sintetizados (mover, capturar, jaque, acierto, fallo), animación de piezas y cuatro colores de tablero (verde, madera, azul, gris), todo configurable en Ajustes.
- **Análisis más fiable**: una pieza que tiene defensor ya no se marca como "colgada" (se cuentan las recapturas con un intercambio estático que respeta clavadas y jaques), y los errores y errores graves se **reevalúan con 4 niveles más de profundidad** antes de clasificarlos, antes y después de la jugada. Así se evitan falsos errores por ruido de la búsqueda. Se puede desactivar en Importar. Las partidas guardadas con la versión anterior se reetiquetan solas al abrir la app, sin motor.
- **Motor en vivo rápido**: búsqueda continua que muestra resultados desde las primeras profundidades (con el panel y la barra de evaluación actualizados sin repintar la página), cancela la búsqueda al cambiar de jugada en lugar de acumular cola, tiene su propio motor y se calienta al abrir una partida. Se puede elegir 1, 2 o 3 líneas (menos líneas, más velocidad). En una prueba local con 2 líneas: profundidad 12 en 0,1 s, 16 en 1 s y 20 en 8 s tras calentar el motor, sin renunciar a la profundidad final.
- **Imágenes en las explicaciones**: junto a cada error, miniaturas con tu jugada (rojo) frente a la mejor (verde) y con la respuesta del rival; los momentos clave también llevan su miniatura.
- **Que no se pierdan tus datos**: las partidas se guardan en IndexedDB y la app pide almacenamiento persistente. Como cada dirección web tiene sus propios datos, también hay una copia opcional en la nube (ver abajo) y exportar/importar JSON.
- **Buscar partidas nuevas** con un clic desde Inicio, usando la cuenta de Chess.com o Lichess que ya importaste.
- **Tablero**: piezas SVG, barra de evaluación, insignias de calidad (`★ ?! ? ??`), flechas de la jugada jugada y de la mejor, reloj y jugadores, girar, reproducir la partida, saltar entre errores y arrastrar y soltar en el repaso. Atajos en la revisión: `←` `→` mover, `Espacio` reproducir, `B` mejor jugada, `F` girar, `[` `]` errores.
- **Patrones recurrentes** entre tandas: la misma pieza perdida en la misma casilla, el mismo error en la misma posición, errores tempranos en la misma apertura. Cada patrón se marca como *persistente*, *nuevo*, *mejorando* o *resuelto* comparando la tanda actual con la anterior.
- **Plan por ventana** (últimas 20, 30, 40 o 50 partidas): cambia el número de prioridades, el horizonte y qué se incluye. Ver [la tabla](#ventanas-del-plan).
- **Tema claro y oscuro**, diseño responsive, navegación por teclado (incluido el tablero del repaso, con flechas, Enter y entrada de la jugada por texto) y todos los textos en español.
- **Copia de seguridad**: exportar e importar tus datos en JSON (en Ajustes).

## Motor: multihilo o varios workers

| Contexto | Build | Reparto |
| --- | --- | --- |
| `crossOriginIsolated === true` (con las cabeceras COOP/COEP) | `stockfish-18-lite` (multihilo) | Analizar partidas: N workers. Comprobar una jugada del repaso: 1 worker con N hilos |
| Sin aislamiento de origen | `stockfish-18-lite-single` | N workers de 1 hilo, cada uno analiza posiciones distintas |

El modo es automático y se puede forzar en **Ajustes** (`Un hilo` o `Multihilo: un worker con todos los hilos`). Si el multihilo no arranca, la aplicación cae sola al build de un hilo. Los dos builds están en `public/engine/`.

**Por qué el modo automático reparte en workers al analizar partidas.** Medido en Chrome con 40 posiciones a profundidad 14 y 6 núcleos: 1 worker × 6 hilos tardó 7,0 s; 2×3, 4,5 s; 3×2, 3,7 s; 6×1, 2,2 s. Las posiciones de una partida son independientes, así que paralelizar entre posiciones aprovecha mejor la CPU que paralelizar dentro de una búsqueda. Los hilos ayudan cuando hay una sola posición y se quiere poca latencia (repaso). Si prefieres 1 worker con todos los hilos, elígelo en Ajustes.

## Desarrollo

Requisitos: Node.js 20 o superior.

```bash
npm install
npm run dev        # servidor local en http://localhost:5173 (ya con COOP/COEP)
npm test           # Vitest
npm run typecheck  # TypeScript
npm run build      # genera dist/
npm run preview    # sirve dist/ con las mismas cabeceras
```

### Estructura

```
src/
  core/        lógica pura y probada: pgn, analysis, openings, patterns, plan, report, explain
  engine/      grupo de workers de Stockfish y análisis del protocolo UCI
  importers/   Chess.com y Lichess
  storage/     IndexedDB y copias de seguridad JSON
  ui/          vistas, tablero accesible, gráficos y rutas
public/engine/ Stockfish 18 lite (multihilo y un hilo) y licencia GPL-3.0
tests/         pruebas de Vitest
```

### Pruebas

`npm test` ejecuta Vitest sobre: lectura de PGN (separar partidas, cabeceras, reloj, identificadores, orden), clasificación por pérdida de probabilidad de ganar, motivos del error (pieza colgada, mate, horquilla, peón, captura perdida, ventaja desperdiciada), análisis completo con un motor simulado, patrones entre tandas, plan según la ventana, informes de conversión y reloj, importadores con `fetch` simulado, IndexedDB y copias de seguridad, y el grupo de workers. Una prueba usa **Stockfish real** (WASM en Node) para comprobar que una dama regalada se etiqueta como pieza colgada.

## Despliegue en Vercel

El proyecto es un sitio estático generado por Vite.

1. Sube el repositorio a GitHub, GitLab o Bitbucket.
2. En Vercel: **Add New → Project** e importa el repositorio. Si el proyecto está dentro de una carpeta, indica esa carpeta en **Root Directory**.
3. Vercel lee `vercel.json`, así que la configuración ya es la correcta:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm ci`
4. Pulsa **Deploy**. También puedes usar la CLI: `npm i -g vercel && vercel --prod`.

### Cabeceras (obligatorias para el multihilo)

`vercel.json` añade a todas las rutas:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Con ellas el navegador activa `crossOriginIsolated` y permite `SharedArrayBuffer`, que necesita el Stockfish multihilo. Con `require-corp` **todos** los recursos de otros orígenes deben servirse con CORS o con `Cross-Origin-Resource-Policy`. Por eso la aplicación no usa fuentes ni imágenes externas; las APIs de Chess.com y Lichess permiten CORS y funcionan con `fetch`.

Para comprobarlo tras desplegar: abre la consola y ejecuta `crossOriginIsolated`; debe devolver `true`. En **Ajustes** aparece como "Multihilo disponible: sí". Si devuelve `false`, la aplicación sigue funcionando con el build de un hilo.

Otros ajustes de `vercel.json`: caché inmutable para `/assets/` y `/engine/` (los ficheros de Stockfish pesan unos 7 MB cada uno y solo se descargan al primer análisis) y `cleanUrls`.

### ¿Hace falta Render o un backend?

No. Todo corre en el navegador: así se usa la CPU del dispositivo y no hay costes de servidor ni se envían partidas a terceros. Chess.com y Lichess permiten CORS, de modo que no hace falta un proxy. Si algún día quisieras sincronizar entre dispositivos, lo natural sería un servicio gratuito como Supabase (plan gratuito) o simplemente usar el export/import JSON incluido.

## Copia en la nube (opcional y gratuita)

Tus datos viven en el navegador (IndexedDB) y se pierden si borras los datos del sitio, usas una ventana privada, cambias de navegador o abres otra dirección (por ejemplo, una versión de prueba de Vercel). Para no tener que volver a subir partidas, o para usarlas en otro dispositivo, puedes activar una copia en **tu propio proyecto gratuito de Supabase**. No hay ningún servidor mío de por medio.

1. Crea un proyecto gratis en <https://supabase.com>.
2. En **SQL Editor** ejecuta:

```sql
-- Copia en la nube de ChessGOAT. Pégalo en Supabase > SQL Editor > Run.
create table if not exists public.entrenador_backups (
  id text primary key,
  data text not null,
  updated_at timestamptz not null default now()
);
alter table public.entrenador_backups enable row level security;
-- Sin políticas: nadie puede leer ni escribir la tabla directamente. Solo estas dos funciones.

create or replace function public.put_backup(p_id text, p_data text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if length(p_id) <> 64 then raise exception 'id no válido'; end if;
  if length(p_data) > 20000000 then raise exception 'copia demasiado grande'; end if;
  insert into public.entrenador_backups (id, data, updated_at) values (p_id, p_data, now())
  on conflict (id) do update set data = excluded.data, updated_at = now();
end $$;

create or replace function public.get_backup(p_id text)
returns table (data text, updated_at timestamptz) language sql security definer set search_path = public as $$
  select b.data, b.updated_at from public.entrenador_backups b where b.id = p_id and length(p_id) = 64;
$$;

revoke all on function public.put_backup(text, text) from public;
revoke all on function public.get_backup(text) from public;
grant execute on function public.put_backup(text, text) to anon;
grant execute on function public.get_backup(text) to anon;
```

3. En **Project Settings → API** copia la *Project URL* y la clave *anon public*.
4. En la app: **Ajustes → Que no se pierdan tus datos**. Pega la URL y la clave, pulsa **Generar código nuevo** y luego **Subir ahora**. En otro dispositivo pega el mismo código y pulsa **Descargar y fusionar**.

Cómo se protege: del código de sincronización salen dos cosas independientes, un identificador (hash SHA-256) y una clave AES-GCM de 256 bits (PBKDF2). Todo se comprime y se **cifra en el navegador** antes de subirlo, así que Supabase solo guarda texto ilegible. La tabla no tiene políticas de acceso: solo se puede usar a través de `put_backup` y `get_backup`, que exigen el identificador exacto. Guarda el código en un sitio seguro: sin él no hay forma de recuperar la copia. Los archivos JSON exportados nunca incluyen estas credenciales.

Si el navegador está vacío y hay una copia configurada, la app la recupera sola al abrirse. Con "Subir cambios automáticamente" se sube al terminar un análisis y al salir de la página.

## Ventanas del plan

| Ventana | Nombre | Prioridades | Horizonte | Extras |
| --- | --- | --- | --- | --- |
| 20 | Enfoque corto | 2 | 1 a 2 semanas | semana muy concentrada en el tema principal |
| 30 | Equilibrado | 3 | 2 a 3 semanas | |
| 40 | Un mes | 3 | 4 semanas | revisión de aperturas con mal resultado |
| 50 | Panorama | 4 | 5 a 6 semanas | aperturas, conversión de ventajas y reloj |

Cada tipo de error puntúa por pérdida acumulada y errores graves; sube un 25 % si empeora respecto a la tanda anterior, un 30 % si tiene un patrón recurrente y baja un 20 % si mejora.

## Cómo se clasifica

La probabilidad de ganar se calcula a partir de la evaluación en centipeones con la curva logística habitual (`50 + 50·(2/(1+e^(−0,00368208·cp)) − 1)`). La pérdida es la diferencia entre la probabilidad antes y después de tu jugada; la jugada que coincide con la primera de la variante principal del motor cuenta como "mejor". La precisión usa `103,1668·e^(−0,04354·pérdida) − 3,1669`. **Brillante (!!)**: ofreces una pieza (valor 3 o más) que el rival no puede aprovechar —se comprueba con intercambios en la casilla— y tu posición sigue siendo muy buena. **Genial (!)**: es la mejor jugada y la segunda opción del motor (MultiPV 2) es al menos 15 puntos de probabilidad peor, es decir, era la única que mantenía la posición. Al llegar a una de ellas en la revisión suena un balido de cabra real (si el sonido está activo; grabaciones CC0 de [BigSoundBank](https://bigsoundbank.com/), en `public/sounds`). Las partidas guardadas antes de esta versión necesitan reanalizarse para tener brillantes y geniales.

La clasificación es automática y puede equivocarse en casos raros, sobre todo con profundidades bajas.

## Licencias y atribución

- Esta aplicación se distribuye bajo **GPL-3.0-or-later** (archivo `LICENSE`).
- Incluye **Stockfish.js 18** © Chess.com, LLC, basado en **Stockfish** © los desarrolladores de Stockfish, licencia **GPL-3.0**. El texto está en `public/engine/LICENSE-GPL3.txt` y se enlaza en el pie de página y en Ajustes junto con el código fuente: <https://github.com/nmrugg/stockfish.js> y <https://github.com/official-stockfish/Stockfish>.
- Las redes neuronales NNUE son de Linmiao Xu (linrock).
- Piezas del tablero: Colin M. L. Burnett (CC BY-SA 3.0), copiadas del paquete [cm-chessboard](https://github.com/shaack/cm-chessboard) (MIT), en `public/pieces/standard.svg`.
- Lectura y validación de jugadas con [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause).
- Los datos de Chess.com y Lichess se descargan desde sus API públicas; consulta sus condiciones de uso.
