# Jugar por voz en tu compu (modo operador)

Cómo levantar el juego, caminar hasta un NPC y **hablarle por voz** (micrófono → servidor propio → Gemini Live →
voz del NPC). Estado F5.2-lite: voz del cliente + transporte por el WebSocket de escena; ver "Límites conocidos".

## 1. Arrancar

Requisitos: Node 22.18+, `npm ci` hecho una vez, y un `.env` en la raíz del repo con `LG_GEMINI_API_KEY` (el archivo
está en `.gitignore`; `.env.example` tiene los nombres).

```bash
npm run dev:play
```

Eso compila el contenido (`build:content`) y levanta dos procesos:

| Proceso | Dirección | Qué hace |
|---|---|---|
| `apps/server` | `http://127.0.0.1:8787` | servidor de escenas en **modo operador** (`LG_OPERATOR_MODE=1`, lo pone el script): token sin login, cuenta `op-local`, solo loopback |
| Vite (`apps/web`) | `http://127.0.0.1:5173` | el juego; hace de proxy de `/scene-token` y del WebSocket `/scene` al servidor |

Abrí **http://127.0.0.1:5173** en Chrome o Edge (usá `127.0.0.1` o `localhost`: el micrófono necesita un origen
seguro). `Ctrl+C` en la terminal para los dos procesos; si uno se cae, el script para el otro.

La primera línea del script dice qué variables encontró, **solo presencia** (nunca valores):
`[play] .env leído · LG_GEMINI_API_KEY presente · …`. El servidor repite lo mismo y termina con `voz: live`.

## 1b. Jugar un libro (universo `U-GALEANO`)

```bash
npm run dev:play -- --universe=U-GALEANO
```

Compila `content/universes/U-GALEANO/` y abre el cliente en `http://127.0.0.1:5173/?universe=U-GALEANO` (servidor y
cliente leen el mismo universo). Sin `--universe` se juega la campesino, igual que siempre. El progreso del libro se
guarda aparte (`apps/server/data/evidence.U-GALEANO.jsonl`, `safety.U-GALEANO.jsonl`, `encounters.U-GALEANO.json`), asi que no
pisa el de la campesino.

1. En el menu: **Jugar en el mapa** (queda deshabilitado un instante hasta que carga el catalogo).
2. El mapa es el Cerro Rico: camino de tierra, piedra, arbustos y una bocamina. Tres personas: **El mitayo**, **El Cerro Rico**
   y **El contador de la corona**. El orden lo fija el motor: primero el mitayo, despues el cerro, y recien
   ahi el contador te recibe (antes dice que todavia no se conocen). Click sobre la persona o **T** / **E** cerca.
3. Con el contador se juega la conversacion por medidores hasta el cierre ("The milk was never ours").
4. Texto: abri la URL con `&voz=0`. Voz con Gemini Live: con `LG_GEMINI_API_KEY` en `.env`, como en la campesino.

## 1c. Caminata de navegador a pedido (excepcion acotada a D-016)

```bash
npm run walk:browser
```

Un script (`scripts/dev/browser-walk.ts`), fuera de `npm run verify`, que levanta servidor y Vite propios en puertos
libres (modo operador, modelos guionados, almacenes en memoria: nunca toca `apps/server/data`), abre el Chromium que ya
esta en la cache de Playwright (no descarga nada; `LG_CHROMIUM=<ruta>` para elegir otro) y recorre el juego: Galeano
(AC12..AC16) y la campesino (AC17). Las capturas quedan en
(documento interno). Termina con codigo distinto de cero si algo falla.

- **El navegador siempre se cierra al terminar** (exito, falla o error lanzado); solo se matan los procesos que el script
  arranco. `npm run walk:browser -- --fail-on-purpose` falla a proposito con el navegador abierto, para comprobar que no
  queda ningun chromium vivo.
- `LG_WALK_HEADED=1` abre la ventana; `LG_WALK_DEBUG=1` imprime los mensajes del WebSocket.
- Sin Chromium en la cache avisa y sale con 2.

## 2. Llegar al NPC

1. En el menú: **Jugar en el mapa**.
2. Caminá con **WASD** o las **flechas** (o hacé click en el piso). **Inés** (M0.1, la capataz) está a la derecha y un
   poco hacia arriba de donde aparecés. Un click sobre ella hace que el personaje camine hasta su lado. Ya cerca,
   **T** (o **E**, o otro click sobre ella) abre la escena.
3. Sin WebGL, o si preferís: **Modo solo diálogo** → elegí el lugar de Inés → **Hablar con Inés Calder**.

### Controles del mapa (tercera persona, D-209)

La cámara va detrás del personaje. Si nunca la tocás, se recentra sola.

| Control | Qué hace |
|---|---|
| **WASD** o **flechas** | caminar, relativo a la cámara (W = hacia adelante de la vista) |
| **Shift** (mantenido) | correr |
| **Q** / **R** (mantenidas) | girar la vista a la izquierda / derecha |
| **Arrastrar** con el mouse | mirar alrededor (horizontal gira, vertical sube o baja la cámara); un arrastre no camina, aunque lo sueltes sobre el piso |
| **Click** en el piso o en una persona | caminar hasta ahí |
| **Rueda**, **`+`** / **`-`** o los botones de zoom | acercar y alejar sin saltos, desde 2,5 m hasta el mapa entero (`+` y `-` andan también en teclado español) |
| **V** | ver el mapa entero; otra V vuelve a la distancia anterior |
| **T** o **E** cerca de una persona | abrir la escena |
| **Minimapa** (abajo a la derecha) | 60 m alrededor, con el rumbo hacia arriba; los anillos rojos son las personas con las que todavía no cerraste la escena, y una flecha roja en el borde marca a las que están más lejos. Se oculta durante la charla |

Al abrir la escena el navegador **pide permiso para el micrófono** (la primera vez). Aceptalo.

## 3. Hablar

La escena es por turnos lentos: **nadie te interrumpe** y el NPC no habla encima tuyo.

| Control | Qué hace |
|---|---|
| **Mantener apretado "Hablar"** | pulsar-para-hablar: hablás mientras lo mantenés; al soltar se cierra tu turno |
| **Tocar "Hablar"** y después **"Terminé"** | abre tu turno y lo cerrás cuando quieras (sin apuro, aunque hagas silencio) |
| **Espacio / Enter** con el foco en "Hablar" | abre el turno; otra vez, lo cierra |
| **Pasar el turno** | las 4 opciones de siempre (pista, repetir, más simple, seguí vos) |
| **Escape** | sale de la escena |

Lo que vas a ver:

- **"Tu turno…"** (punto de color): podés hablar. El **medidor de nivel** se mueve cuando hablás: sirve para chequear
  el micrófono antes de empezar.
- **"Te escucho…"**: tu turno está abierto. Abajo aparece **"Te oigo: …"** con lo que el servidor va entendiendo.
- **"Inés está pensando…"**: cerraste el turno; el NPC prepara la respuesta.
- **"Habla Inés…"**: suena su voz. Hasta que termine de sonar no se puede abrir otro turno.
- Tu frase (como la entendió el servidor) y la respuesta del NPC quedan escritas en el historial.

Hablá en inglés. En M0.1 la escena se cumple cuando saludás **y** decís tu nombre ("Hello! I'm Nico."); si querés
charlar más, demorá el nombre.

## 3b. Charlar con Harlan, el granjero (conversación libre, A2)

Una escena **sin guion**: Harlan Moss tiene su propia vida (una ficha con hechos, secretos y lo que quiere), vos
tenés la tuya (la de tu personaje), y ninguno sabe qué quiere el otro. Diseño: `docs/adr/ADR-027-conversacion-por-medidores.md`.

**Cómo llegar.** En el mapa, Harlan está **a la derecha y hacia abajo** de donde aparecés, junto al galpón (el bloque
grande). Acercate y **T** / **E** / click, igual que con Inés. En **Modo solo diálogo**: lugar **Granero de Harlan** →
**Hablar con Harlan Moss**. No necesita presentación ni misiones previas.

**Qué vas a ver.** Arriba del historial, el panel de la charla:

- **"Conocer a Harlan"**: la barra se llena solo si hay **ida y vuelta**. Preguntale por su vida, repreguntá sobre lo
  que te cuenta (una repregunta vale más que cambiar de tema) y **contale cosas de tu personaje** (inventadas: nombre
  de juego, de dónde viene, la cuadrilla, qué le gusta). Si hacés dos preguntas seguidas sin contar nada tuyo, la
  barra se frena y Harlan te pregunta a vos.
- **"Lo que sabés de Harlan"**: se va llenando con lo que él te cuenta. Las cosas más personales las cuenta recién
  cuando le tiene confianza.
- **Ayuda**: si te trabás (o pasan 20 s en silencio), aparece una pista de Lumi; si seguís trabado (40 s), frases
  sugeridas en inglés. En texto, tocá una frase y queda en la caja; en voz, leela en voz alta.
- Cuando se llena la primera barra, se abre **"Conseguir lo que viniste a buscar"** y Harlan te pregunta qué te trae.
  Ahí recién se puede hablar del recado. Contale a qué viniste, explicale para qué es y pedíselo con amabilidad.
- Cuando lo logres: **"¡Harlan aceptó! Despedite o dale las gracias."** Tu próxima frase cierra la escena con la
  línea guionada (los números nunca se muestran).

**Qué probar.** Pedirle algo de entrada (no habla de negocios con un desconocido). Preguntar sin parar sin contar
nada tuyo (frena). Hablarle en español (te pide inglés y salta la ayuda). Preguntarle por las semillas (desvía).
Contarle algo tuyo justo después de que él te cuenta algo (suma más). A los 9 minutos Harlan se despide en su próxima respuesta (10 como tope duro). Si
se corta antes de lograrlo, **lo que ya sabés de él queda guardado**: la próxima vez seguís desde ahí.

**Reiniciar la charla con Harlan** (para jugarla de nuevo desde cero):

```bash
npm run dev:reset-farmer
```

Borra solo lo de Harlan (lo que sabías de él, las barras y que la misión estaba cumplida). El resto de tu progreso
no se toca, y se puede correr con el juego andando: la próxima escena ya arranca de cero. Para otro NPC con ficha:
`npm run dev:reset-encounter -- --npc NPC-X`.

Sin clave (`LG_FAKE_MODELS=1`) la charla anda con un juez guionado por palabras: sirve para ver las barras y el cambio
de fase, no para evaluar. El juez real es Gemini (rol `judge` de `apps/server/config/models.yaml`).

## 4. Si algo no anda

| Síntoma | Qué pasa / qué hacer |
|---|---|
| "No hay permiso para usar el micrófono: seguimos por texto." | Lo negaste. Habilitalo para `127.0.0.1:5173` (ícono a la izquierda de la dirección) y volvé a entrar a la escena. Mientras tanto se juega por texto |
| "No encontramos un micrófono" / "lo está usando otra aplicación" | Conectá uno o cerrá la otra app (Zoom, Meet…) y volvé a entrar |
| "No llegó voz del micrófono…" después de un turno | El medidor no se movió: micrófono equivocado o silenciado en el sistema. Elegilo en la configuración del sitio del navegador |
| "No te entendimos" | Live no transcribió nada: hablá más cerca o un poco más fuerte |
| "La voz no está disponible ahora; la escena sigue por texto." | El servidor no pudo abrir la sesión Live (red, clave inválida, modelo caído). Mirá la terminal del servidor. Sin `LG_GEMINI_API_KEY` el script avisa al arrancar |
| "No hay conexión con el servidor de escenas" | El servidor no está arriba o se cayó: mirá la terminal y volvé a correr `npm run dev:play` |
| Puerto 5173 u 8787 ocupado | Otro proceso los usa. Para el servidor, agregá `LG_PORT=8788` al `.env` (el proxy de Vite lo sigue). 5173 es fijo: cerrá el otro Vite |
| Inés dice que "ahora no hay nada para hacer acá" | Ya completaste M0.1: el progreso real vive en `apps/server/data/evidence.jsonl`. Para repetir la escena, **mové** ese archivo a otro nombre (no lo borres: es tu progreso) y reiniciá el servidor. Salir de una escena a la mitad no guarda nada |
| Harlan dice que "ahora no hay nada para hacer acá" | Ya conseguiste lo que buscabas: `npm run dev:reset-farmer` y volvé a hablarle |
| Las barras no se mueven con Harlan | El juez no respondió: mirá la terminal del servidor (dice "juez de conversación sin resultado" con el motivo, nunca tu texto). Ese intercambio no cuenta; la charla sigue |
| Querés forzar texto | Abrí `http://127.0.0.1:5173/?voz=0` |
| No se oye al NPC | Subí el volumen del sistema/pestaña. El audio arranca con tu primer toque a "Hablar" (política de autoplay) |

## 5. Costos y privacidad

- Cada turno se registra en el libro de costos (`apps/server/data/cost-ledger.jsonl`). En modo operador **no hay corte
  de presupuesto de voz**: si el promedio supera US$0,05/min, el servidor solo imprime una alerta (D-027, D-135).
- El servidor **no guarda audio**: el clip del turno vive en memoria para el observador y se libera al terminar o a
  los 10 s (D-108). El cliente tampoco guarda audio.
- La clave nunca llega al navegador: el cliente habla solo con el servidor propio.

## Límites conocidos (F5.2-lite)

- Las líneas guionadas (apertura, cierre) se muestran como texto: todavía no tienen audio cacheado (F8).
- Sin holdback de moderación en la voz de Live (F5.1b): la línea del NPC se modera antes de escribirse, pero su audio
  suena mientras llega.
- "Más despacio" (time-stretch OLA) y el VAD que cierra el turno solo tras 3 s de silencio están fuera de esta corrida:
  el turno lo cierra siempre el jugador.
- Probado con tests (servidor Live falso, motor de audio falso) y un humo corto contra la API real (la sesión abre y
  vuelve audio). El recorrido completo con micrófono real en el navegador es la primera prueba del operador.

## Para sistemas de conversación (ganchos)

`scene-runtime` expone ganchos de conversación (`apps/server/src/scene-runtime/hooks.ts`): `onSceneStart`, `onTurn`
(cada turno del jugador y del NPC, por texto o por voz; en voz también lo que se va oyendo con `final: false`) y
`onSceneEnd`. Se pasan a `createGameServer({ conversation })`. Un gancho que tira (o un gancho async cuya promesa
rechaza) no corta la escena. A2: `onSceneStart` recibe además la ficha de conversación de la escena y un `control`
(`setNpcBrief`, `sendState`, `complete`); el sistema de medidores (`apps/server/src/conversation/`) es un sistema de
estos, enchufado por defecto cuando el servidor tiene juez y almacén de encuentros.
