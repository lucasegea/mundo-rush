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

## 2. Llegar al NPC

1. En el menú: **Jugar en el mapa**.
2. Caminá con **WASD** o las **flechas** (o hacé click en el piso). **Inés** (M0.1, la capataz) está a la derecha y un
   poco hacia arriba de donde aparecés. Un click sobre ella hace que el personaje camine hasta su lado. Ya cerca,
   **T** (o **E**, o otro click sobre ella) abre la escena.
3. Sin WebGL, o si preferís: **Modo solo diálogo** → elegí el lugar de Inés → **Hablar con Inés Calder**.

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
`onSceneEnd`. Se pasan a `createGameServer({ conversation })`. Un gancho que tira no corta la escena.
