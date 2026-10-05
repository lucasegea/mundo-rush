# 03 — Arquitectura técnica objetivo

**Proyecto:** learning-game · **Documento:** arquitectura v0.1 · **Fecha:** 2026-10-05 · **Autor:** revisión de arquitectura (arquitecto, el entorno de desarrollo)
**Estado:** propuesta completa para el modo 1 (vertical slice y v1). Las decisiones marcadas `DP-…` esperan validación del operador; cada una trae un default que una corrida headless usa sin frenarse.
**Idioma:** español. Identificadores de código, nombres de paquetes y mensajes de protocolo, en inglés (ver §3.4).

> **Objetivo de este documento, en una frase:** fijar la forma técnica del juego (stack, capas, carpetas, contratos de datos, flujo de voz, contenido, backend, pruebas y riesgos) con el detalle suficiente para que una corrida headless construya el modo 1 sin inventar arquitectura y sin violar las reglas del GDD.

---

## Índice

0. Cómo usar este documento (contrato para corridas headless)
1. Restricciones (de dónde sale cada forma)
2. Veredicto de stack, pieza por pieza, y presupuesto de rendimiento
3. Reglas de arquitectura, capas y estado (Zustand)
4. Esqueleto del repositorio, convenciones y límites de módulos
5. Pipeline de voz e IA (reuso de un prototipo de voz anterior)
6. Pipeline de contenido y de assets
7. Datos y backend (cuentas, menores, persistencia, instituciones, telemetría, seguridad)
8. Estrategia de pruebas compatible con corridas headless
9. Secuencia técnica de construcción y gates
10. Riesgos
11. ADRs (registro de decisiones de arquitectura)
12. Decisiones pendientes (DP) de arquitectura y resolución de las DP del GDD marcadas "(revisión de arquitectura)"
13. Fuentes e insumos citados

---

## 0. Cómo usar este documento (contrato para corridas headless)

1. **Orden de autoridad:** el único vigente es el de `00-decisiones.md` §0.3 (brief y decididas > defaults de `00` > `04` > `03` > `01` > `02` para construcción). Toda contradicción se reporta. Los defaults de las `DP-A` de este documento se reemplazan por los de `00-decisiones.md` (§9): si difieren, gana el registro. **Las rutas de §4.2 (tabla "Rutas canónicas") y los presupuestos de §2.7.3 son la única fuente de rutas y números**: `04` y `05` los citan, no los repiten.
2. **Cada `DP-A..` tiene default.** Si el operador no decidió, la corrida usa el default, lo anota en su reporte y sigue. Nunca adopta ni descarta en silencio algo marcado como DP.
3. **Los ADR "Aceptado" son contrato.** Una corrida que necesite apartarse de un ADR no lo hace: escribe una propuesta de ADR nuevo en su reporte y sigue con el vigente.
4. **Los límites de módulos (§4.3) se verifican con lint.** Si una corrida necesita cruzar un límite, el diseño está mal: se agrega una acción al store, no un import.
5. **No asumir APIs de memoria.** Las versiones de librerías y de modelos cambian rápido. Al hacer el bootstrap se fijan versiones exactas en el lockfile y toda API se verifica contra la documentación de la versión instalada. Los nombres de modelos de IA viven en configuración, nunca en código (§5.10).
6. **Nunca Playwright ni navegador automatizado.** La verificación de UI es `vitest` + `tsc` + `lint`; el operador revisa en el navegador (§8).
7. **Secretos:** ninguna clave de API llega al navegador, a un log, a un fixture ni a un commit (§5.3, §7.8).
8. **Sin datos personales** en contenido, fixtures, logs ni reportes.

Etiquetas usadas: **[Brief]**, **[GDD §x]**, **[Negocio §x]**, **[Investigación §x / Ex]**, **[Referencias §x]**, **[LT]** = lo leído en el código de un prototipo de voz anterior el 2026-10-05.

---

## 1. Restricciones (de dónde sale cada forma)

Ninguna forma de este documento se justifica sin alguna de estas restricciones. Si una corrida encuentra que una restricción cambió, las decisiones que dependen de ella se revisan.

| # | Restricción | Fuente | Qué fuerza en la arquitectura |
|---|---|---|---|
| C1 | Corre en el navegador de una PC modesta de escuela, sin instalar nada; modo gráfico bajo obligatorio; interactivo en < 15 s en la PC objetivo | [GDD §1.3 P1, §2.14, §5.7], [Referencias §4.4.5], [Negocio §7 #5] | Presupuesto de rendimiento duro (§2.7), tiers de calidad, carga por barrio, 3D en chunk diferido, modo "solo diálogo" sin WebGL |
| C2 | El producto vende habla, no gráficos; la CPU y la red del cliente se usan para el audio en tiempo real, que compite con el render | [Referencias §4.4], [Negocio §2.1] | El audio tiene prioridad: AudioWorklet fuera del hilo principal, bajar el ritmo de render durante conversaciones (§2.7.4) |
| C3 | Costo de voz cuadrático con la duración de la sesión (el contexto se re-factura por turno); objetivo ≤ US$0,03/min activo, muerte si nada baja de US$0,05/min | [Negocio §3.2, §3.3, §7 #1] | Una sesión de voz por escena de 2-4 min (tope 5), contexto mínimo, no transmitir silencio, contabilidad de costo por minuto desde el día 1 |
| C4 | Reuso de `un prototipo de voz anterior` (Gemini Live, tope de ~15 min del lado del servidor) | [Brief] | El gateway de voz nace del código de LT (§5.2) |
| C5 | Público ATP: menores entran por institución o tutor; Argentina primero (Ley 25.326), luego Brasil (LGPD, ECA Digital vigente desde 2026-03-17) | [Brief], [GDD §2.17], [Negocio §6.5] | Minimización de datos, sin audio guardado, moderación doble, consentimiento, proveedor de IA apto para menores (§7) |
| C6 | Paga principalmente la institución; "el que paga financia al que no"; versión gratis con voz acotada y texto ilimitado | [Brief], [GDD DP-22] | Modelo institución → clase → alumno, pools de minutos de voz, modo texto de primera clase |
| C7 | El mundo 3D y la UI DOM nunca se hablan directamente; el estado es la única fuente de verdad | [GDD §1.4.8], propuesta de terceros | Store único (Zustand) + núcleo de reglas en TS puro + límites de módulos verificados por lint (§3, §4.3) |
| C8 | Modo 1 sin dinero ni economía; tycoon/construcción solo como candidata del modo 2 | [GDD §1.4.1, DP-15] | No existe slice de economía; el modo 2 se agrega como módulo nuevo sin tocar el núcleo (§3.6) |
| C9 | Las IA de código no modelan 3D: packs CC0 (Kenney y afines) en glTF/GLB, ubicados por código | Directiva del operador, [GDD §5.7] | Pipeline de assets con registro de licencias, layout de dioramas como datos (§6.4) |
| C10 | Desarrollo headless en muchas corridas | Intención del operador | Contenido como datos validados por schema, núcleo determinístico testeable, gates automáticos sin navegador (§8, §9) |
| C11 | Sin Playwright ni navegador automatizado; UI = vitest + tsc + lint; el operador mira en el navegador | Regla del operador | Pirámide de pruebas sin E2E de navegador; verificación de presupuestos por scripts (§8) |
| C12 | Celular abierto, no es el arranque | [Brief], [GDD DP-31] | HUD responsive y táctil desde el día 1; nada en el núcleo depende de mouse o teclado |
| C13 | Equipo de 1-2 personas, alcance en semanas | [Negocio §6.7] | Sesgo a menos piezas: sin microservicios, sin colas, un solo servidor, una sola base |

Lo que **no** tengo como restricción y por eso no invento: número esperado de usuarios concurrentes (asumo piloto de cientos, no miles; §7.9), presupuesto mensual de infraestructura, y resultado de la sonda de costo (#1) y del benchmark de hardware (#5). Las decisiones que dependen de esos números quedan como DP con default reversible.

---

## 2. Veredicto de stack, pieza por pieza, y presupuesto de rendimiento

### 2.1 Resumen

| Pieza | Veredicto | Alternativas consideradas | Qué se resigna |
|---|---|---|---|
| Vite + React + TypeScript | **Adoptar** | Next.js; Svelte/SvelteKit; vanilla TS | Server-side rendering (no lo necesitamos) |
| React Three Fiber + drei (sobre three.js) | **Adoptar, con disciplina** | three.js imperativo; Babylon.js; PlayCanvas; motor de juego exportado a web (Godot/Unity); 2D (Pixi/Phaser) | Un poco de overhead de React en el loop de render; depender del ecosistema pmndrs |
| Rapier (física) | **No en el modo 1** (resuelve DP-14). Controlador cinemático sobre grilla de caminabilidad + A* + colisiones 2D en el plano XZ | Rapier; cannon-es; three-mesh-bvh para colisiones contra malla | El "juguete físico" estilo Bruno Simon; se reserva para la bicicleta (DP-16) como chunk opcional |
| Zustand | **Adoptar** como store único con slices; reglas en un núcleo TS puro | Redux Toolkit; Jotai; XState como store; señales | Garantías de inmutabilidad automáticas (las damos con funciones puras del núcleo) |
| HUD en React DOM + Tailwind | **Adoptar** | CSS Modules; UI dentro del canvas (troika-text, drei Html) | Nada importante; Tailwind exige disciplina de tokens |
| Gemini Live vía gateway propio (de LT) | **Adoptar como vía de voz inicial** (DP-36 interino) | Cascada STT + LLM + TTS; OpenAI Realtime; tokens efímeros directo desde el navegador | Independencia de proveedor inmediata (se compensa con adaptadores, §5.10) |
| Node.js + TypeScript para el servidor | **Adoptar** | Bun (LT tiene un `server.ts` para Bun); Deno; Python | Velocidad de arranque de Bun; ganamos el runtime que ya corre LT en producción (`server.js` usa Node + `ws`) |
| Postgres administrado | **Adoptar** | SQLite/archivos JSON (lo que usa LT); Firestore; Supabase con su auth | Simplicidad de archivos locales; ganamos multiusuario y consultas para reportes |

### 2.2 Vite + React + TypeScript

- **Por qué:** el juego es una SPA cliente con una capa DOM rica (HUD, cuaderno, ajustes, onboarding, panel docente) y un canvas 3D. React es la forma más directa de que la UI DOM y el 3D (vía R3F) compartan el mismo modelo de componentes y el mismo store. Vite da build rápido, code-splitting por `import()` dinámico y entradas múltiples (juego y panel docente) sin configuración especial.
- **Alternativas:** Next.js agrega SSR y rutas de servidor que no usamos y complica el WebSocket de larga vida (C13). Svelte rinde algo mejor en DOM pero R3F no tiene equivalente maduro en Svelte (Threlte existe, con ecosistema menor). Vanilla TS obliga a escribir a mano la reactividad de la UI.
- **Configuración obligatoria:** TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`; ESLint con reglas de límites (§4.3); multi-page build con `index.html` (juego) y `docente.html` (panel docente, sin 3D).
- **Falla posible:** el bundle de React + three crece sin control. Se mitiga con presupuesto de bundle verificado en CI (§2.7.3).

### 2.3 React Three Fiber + drei

- **Por qué:** permite escribir el mundo como componentes declarativos (regla de la propuesta de terceros), con el mismo store que la UI. drei aporta piezas probadas que no conviene reescribir: carga de GLTF con decodificador meshopt, `Instances`/`Merged`, `Outlines` (casco invertido), `PerformanceMonitor`, `AdaptiveDpr`, `Bvh` para raycasts baratos.
- **Disciplina obligatoria (sin esto, R3F es lento):**
  1. Nada que cambie cada frame pasa por estado de React. Animaciones, interpolación de cámara y suavizado de posición se hacen en `useFrame` mutando refs.
  2. Los componentes 3D se suscriben al store con **selectores finos** y lectura transitoria (`store.getState()` dentro de `useFrame` o `store.subscribe` con selector), nunca al store entero.
  3. Los props estáticos del diorama se fusionan por material en build (§6.4.4) o se instancian; ningún prop repetido se dibuja como malla independiente.
  4. Se importan solo los módulos de drei que se usan (tree-shaking verificado por el presupuesto de bundle).
- **Alternativas y por qué no:**
  - *three.js imperativo:* menos overhead, pero rompe "3D declarativo" y obliga a construir a mano el puente al store. El overhead de R3F es despreciable si se respeta la disciplina de arriba.
  - *Babylon.js / PlayCanvas:* motores completos, más pesados en bundle (Babylon) o con editor propietario (PlayCanvas); ninguno se integra con React DOM tan directo.
  - *Godot o Unity exportados a web:* builds de decenas de MB, arranque lento en PCs de 4 GB, UI propia que pierde la accesibilidad del DOM y las IA de código los manejan peor. Choca con C1 y C10.
  - *2D (Pixi/Phaser):* más liviano, y [Negocio §0] lo recomienda para el prototipo. No lo elijo como render principal porque el operador pidió dirección estética 3D low-poly/cel-shaded y "nombrar objetos en contexto espacial" [Referencias §4.4] gana con 3D. **Pero** la arquitectura deja el 2D posible: el núcleo no depende del render (§3.1) y el modo "solo diálogo" (DOM con ilustración estática) existe desde el vertical slice como plan B real.

### 2.4 Rapier: no en el modo 1 (resuelve DP-14)

**Decisión:** el modo 1 no carga motor de física. El movimiento es caminar e interactuar [GDD §5.5]; ninguna mecánica del modo 1 necesita dinámica de cuerpos rígidos.

**Qué se usa en su lugar (todo en `packages/core/movement`, TS puro, testeable sin WebGL):**

1. **Grilla de caminabilidad por diorama.** Celdas de 0,5 m en el plano XZ. Se genera en build a partir de los footprints (cajas de colisión 2D) de los props declarados en el layout del diorama (§6.4.3), más polígonos manuales de "no caminable" (agua, bordes) y "caminable forzado" (rampas, muelle). Resultado: `walkable: Uint8Array` + metadatos, serializado en el JSON del diorama.
2. **Altura del suelo:** función de muestreo por celda (alturas guardadas en la grilla). Sin pendientes físicas: la cámara y el personaje siguen la altura interpolada.
3. **Click para caminar:** el canvas hace raycast contra un plano/mesh de suelo (drei `Bvh` para que sea barato) y despacha la acción `moveTo(x, z)`. El núcleo resuelve **A\*** sobre la grilla (8 vecinos, suavizado de camino por línea de visión) y devuelve waypoints.
4. **WASD/flechas:** el núcleo integra velocidad y resuelve colisión **círculo vs. celdas bloqueadas** (deslizamiento sobre bordes). Paso fijo de simulación (por ejemplo, 30 Hz) independiente del framerate, para que el resultado sea determinístico y testeable.
5. **Interactuables:** radio de interacción por entidad; el núcleo calcula `nearbyInteractables` (para el prompt "E para hablar" y para la lista accesible por teclado).
6. **NPCs:** se mueven por rutas guionadas sobre la misma grilla (waypoints en datos), sin evasión dinámica compleja; si el jugador bloquea, el NPC espera.

**Qué se resigna:** la sensación de "mundo de juguete que se empuja" del portfolio de Bruno Simon. **Cómo queda abierta:** la bicicleta del correo (DP-16) y cualquier juguete físico futuro se implementan como **feature aislada** que carga Rapier como chunk diferido (WASM) solo cuando se usa, detrás de un ADR propio. Nada del núcleo de movimiento depende de que Rapier exista.

**Falla posible de esta opción:** geometría que no coincide con la grilla (el personaje atraviesa una esquina de un prop o queda trabado en un pasillo angosto). Mitigación: el validador de dioramas (§6.4.5) chequea conectividad entre puntos de interés y ancho mínimo de pasillos (2 celdas), y en desarrollo existe una superposición de la grilla (§6.4.6).

### 2.5 Zustand

- **Por qué:** es el store más chico que permite (a) suscripciones con selector desde React DOM y desde R3F, (b) lectura y escritura **fuera de React** (los servicios de voz, input y persistencia no son componentes) y (c) lectura transitoria en `useFrame` sin re-render. Es lo que usa el ecosistema de R3F.
- **Cómo se usa (detalle en §3):** un solo store compuesto de slices; las acciones del store llaman funciones puras del núcleo (`packages/core`) que reciben estado y devuelven estado nuevo. Middleware: `subscribeWithSelector` y `devtools` solo en desarrollo. **Sin `persist` de Zustand para el progreso** (la persistencia la hace un servicio con versionado y servidor, §7.4); `localStorage` solo para preferencias por dispositivo.
- **Alternativas:** Redux Toolkit (más ceremonia, mismo modelo); Jotai (átomos dispersos, más difícil de leer como "fuente única" para corridas headless); XState como store (excelente para máquinas de estado, pero imponerlo a todo el estado del juego es más complejo que necesario: las máquinas de estado del juego se escriben como tablas de transición en TS puro, §3.5).
- **Qué se resigna:** inmutabilidad garantizada por la librería. Se compensa con funciones puras en el núcleo y tests de que las acciones no mutan la entrada.

### 2.6 HUD en React DOM + Tailwind

- **Por qué:** escalado de texto, contraste, lectores de pantalla, navegación por teclado, `prefers-reduced-motion` y foco se resuelven con el DOM y no dentro del canvas. Es la respuesta directa a las quejas de UI de Terra Alia [Referencias §1.3, §4.4.4] y a las funciones de accesibilidad del GDD [GDD §2.19].
- **Tailwind:** se configura con los tokens del GDD (§5.4 del GDD) como variables CSS (`--lg-color-*`, `--lg-font-scale`); todo tamaño de texto en `rem` para que el ajuste de tamaño (100-200%) escale el HUD completo cambiando un solo valor raíz.
- **Componentes:** se usan elementos HTML nativos con semántica correcta (`<button>`, `<dialog>`, `<input type="range">`, `aria-live` para subtítulos). No se agrega una librería de componentes headless salvo que un componente concreto falle la revisión de accesibilidad (decisión en ADR si ocurre).
- **Tipografía:** fuente principal legible con licencia abierta autoalojada (por ejemplo Atkinson Hyperlegible, SIL OFL) y opción para dislexia con licencia verificada al incorporarla. **Nada se carga desde CDNs de terceros** (fuentes incluidas) para no filtrar datos de navegación de menores.
- **Qué se resigna:** texto "en el mundo" 3D rico. Los carteles del pueblo son texturas o geometría simple; su lectura accesible se ofrece en el DOM (al interactuar con un cartel, el texto aparece en el HUD).

### 2.7 Presupuesto de rendimiento (PC escolar típica)

**PC objetivo mínima (propuesta, a medir con el experimento #5 de el análisis de negocio):** 4 GB de RAM, CPU de bajo consumo de 2-4 núcleos (clase Celeron/Pentium Silver o similar), gráficos integrados de la misma generación, pantalla 1366×768, Chrome o Edge recientes, conexión compartida de aula. *Probable* que esto represente netbooks de programas públicos argentinos y PCs de laboratorio; no verificado con mediciones propias. Hasta que el benchmark exista, estos números son el contrato; el benchmark los ajusta.

#### 2.7.1 Tiers de calidad

| Parámetro | `low` (obligatorio) | `medium` (default en GPU integrada moderna) | `high` | `dialog-only` (sin WebGL o a pedido) |
|---|---|---|---|---|
| FPS objetivo | ≥ 30 estable en exploración | 60 (piso 45) | 60 | n/a |
| DPR máximo | 1 | 1,5 | 2 | n/a |
| Resolución interna | 75-100% (dinámica) | 100% | 100% | n/a |
| Triángulos visibles | ≤ 25k | ≤ 50k (GDD §5.7) | ≤ 100k | 0 |
| Draw calls por frame | ≤ 60 | ≤ 120 | ≤ 150 (tope del GDD) | 0 |
| Personajes animados visibles | ≤ 4 | ≤ 8 | ≤ 12 | 0 |
| Sombras | ninguna (sombras blob como quad con textura) | blob | 1 luz direccional con shadow map 1024 solo en dinámicos | — |
| Contornos (outline) | ninguno | personajes + interactivo enfocado | personajes + interactivos | — |
| Luces dinámicas | 1 hemisférica + 1 direccional | + hasta 2 puntuales | + hasta 4 puntuales | — |
| Postprocesado | ninguno | ninguno | ninguno en v1 | — |
| Memoria de texturas en GPU | ≤ 24 MB | ≤ 48 MB | ≤ 96 MB | — |
| Distancia de dibujo / niebla | corta | media | completa del diorama | — |

Reglas que valen para todos los tiers:
- **Las luces del pueblo (faroles, ventanas) son materiales emisivos + sprites de halo**, no luces puntuales. En render forward cada luz puntual encarece todos los materiales iluminados; "el pueblo se ilumina" con decenas de luces reales hundiría el tier bajo.
- **Desaturación del progreso** [GDD §5.4]: un uniform por diorama en el material toon (un `mix` con luminancia en el shader), no un pase de postprocesado.
- **Texturas:** atlas de paleta compartido (los packs de Kenney suelen usar un "colormap" común: se aprovecha) de ≤ 1024 px por diorama; filtrado `nearest` en la rampa toon.

#### 2.7.2 Detección y adaptación

1. En la pantalla de carga [GDD §2.14, 0:00-0:20]: si no hay WebGL2 → `dialog-only` y aviso amable. Si hay, se lee información del renderer y se corre un micro-benchmark de ~1 s (renderizar la escena de carga N frames y medir); con eso se elige el tier inicial. No se usa una base de datos de GPUs descargada de terceros.
2. En juego: `PerformanceMonitor` de drei baja el tier (o el DPR) si el FPS cae por debajo del piso por más de unos segundos, y nunca lo sube solo durante una conversación (evita saltos visuales mientras se habla).
3. El jugador puede fijar el tier en Ajustes; la elección manual gana sobre la automática.
4. Pérdida de contexto WebGL (frecuente en GPUs débiles): se captura `webglcontextlost`, se pasa a `dialog-only` sin perder la escena en curso y se ofrece reintentar.

#### 2.7.3 Bundle y descarga

| Elemento | Presupuesto (gzip) | Cómo se verifica |
|---|---|---|
| Shell (onboarding, ajustes, HUD, servicios, sin three) | ≤ 300 KB JS+CSS | script de tamaño sobre la salida de `vite build` (CI) |
| Chunk 3D (three + R3F + drei usado + mundo) | ≤ 450 KB | ídem |
| Panel docente (`docente.html`) | ≤ 250 KB, sin three | ídem |
| Assets del primer diorama (Muelle) | ≤ 6 MB | script de presupuesto de assets |
| Muelle + Plaza (descarga inicial del vertical slice) | ≤ 15 MB [GDD §5.7] | ídem |
| Audio cacheado de líneas guionadas por misión | ≤ 1,5 MB (Opus/OGG) | ídem |
| Interactivo (shell) | < 3 s en 10 Mbps | revisión manual del operador |
| Interactivo 3D en PC objetivo | < 15 s [GDD §2.14] | benchmark #5 (manual) |

El shell carga sin three.js: el jugador puede pasar bienvenida, accesibilidad y avatar mientras el chunk 3D y el primer diorama se descargan en segundo plano.

**Esta tabla es la única fuente de presupuestos** (`00-decisiones.md` §0.3). F1.1 crea su copia legible por máquina, `scripts/budgets/budgets.json` (claves: `shell_js_css_gzip_kb: 300`, `chunk_3d_gzip_kb: 450`, `docente_gzip_kb: 250`, `assets_muelle_mb: 6`, `assets_muelle_plaza_mb: 15`, `audio_lineas_por_mision_mb: 1.5`), que lee `check:budgets`. Si el JSON y esta tabla difieren, gana la tabla y la corrida corrige el JSON. Un umbral solo cambia con una decisión del operador; P0 puede **proponer** números nuevos en su reporte, no aplicarlos. Los presupuestos por tier (triángulos, draw calls, memoria de texturas) son los de §2.7.1.

#### 2.7.4 Convivencia render + audio (C2)

- Captura y reproducción de audio en **AudioWorklet** (fuera del hilo principal). LT usa `ScriptProcessorNode` [LT `public/index.html`], que corre en el hilo principal y es obsoleto; no se porta así.
- Durante una escena de conversación el canvas baja a **30 FPS máximo** y congela animaciones no esenciales (agua, NPCs de fondo); la cámara está quieta en el encuadre de diálogo, así que la pérdida visual es nula y se libera CPU para el audio y el WebSocket.
- Al abrir un panel DOM de pantalla completa (cuaderno, ajustes), el canvas pasa a `frameloop="demand"` (no renderiza si nada cambia).

### 2.8 Cel-shading: enfoque y costo (resuelve el "cómo" de DP-17)

| Técnica | Costo en GPU integrada | Uso |
|---|---|---|
| `MeshToonMaterial` con `gradientMap` de 2-3 bandas (textura 3×1 o 4×1, filtrado `nearest`) | Prácticamente igual a Lambert | **Default** para personajes, Lumi y props importantes |
| Sombreado plano (`flatShading`) con Lambert y color por material desde la paleta | El más barato | Props de fondo, terreno, agua; tier `low` puede usarlo en todo |
| Contorno por **casco invertido** (malla duplicada con caras traseras escalada por normal; drei `Outlines`) | +1 draw call por malla contorneada y el doble de vértices de esa malla | Solo personajes e interactivos (`medium`), apagado en `low` [GDD §5.3] |
| Contorno por postprocesado (detección de bordes por normal/profundidad) | Un pase de pantalla completa + buffer de normales: caro en 1366×768 en integradas | **Descartado en v1** |
| Agua estilo Townscaper | Plano con material toon + ondas por vértice baratas o textura animada | Default; sin reflejos ni refracción |

**Material único del proyecto:** `ToonMaterial` propio (envoltorio de `MeshToonMaterial` con `onBeforeCompile` mínimo) que agrega: (a) uniform de desaturación por diorama, (b) tinte por instancia para recolorear piezas de distintos packs con la paleta común [GDD §5.7 "unificación visual"], (c) emisivo por instancia para ventanas y faroles. Un solo material base = menos programas de shader compilados = arranque más rápido.

**Falla posible:** el casco invertido se ve mal en mallas con normales partidas (aristas duras), con huecos en el contorno. Mitigación: el pipeline de assets suaviza normales solo para la copia del contorno, o se desactiva el contorno en esa pieza (marcado en el registro de assets).

---

## 3. Reglas de arquitectura, capas y estado (Zustand)

### 3.1 Capas

```
┌───────────────────────────────────────────────────────────────────────┐
│ apps/web                                                              │
│                                                                       │
│  ui/ (React DOM + Tailwind)          world/ (R3F, declarativo)         │
│  HUD, diálogo, Lumi (burbujas),      dioramas, actores, Lumi 3D,      │
│  cuaderno, ajustes, onboarding,      cámara, materiales, luces        │
│  modo solo-diálogo                                                    │
│        │  lee selectores                    │  lee selectores          │
│        │  llama acciones                    │  llama acciones          │
│        ▼                                    ▼                          │
│  ┌──────────────────────── state/ (Zustand) ───────────────────────┐  │
│  │ store único = slices; las acciones llaman al núcleo (puro)      │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│        ▲  acciones / suscripciones                                    │
│        │                                                              │
│  services/ (sin React): voice-client, audio (worklets, director),     │
│  input, persistence, telemetry, quality, content-loader               │
└────────┬──────────────────────────────────────────────────────────────┘
         │ usa                               WebSocket + HTTPS
         ▼                                        │
  packages/core (TS puro: reglas)                 ▼
  packages/protocol (mensajes)          apps/server (Node): gateway de voz,
  packages/content-schema               scene-runtime, observer, moderación,
                                        presupuesto/costo, API REST, auth, DB
```

**Reglas (contrato, verificadas por lint donde se puede):**

1. **R1 — 3D declarativo.** Todo el mundo (dioramas, actores, luces, cámara) se instancia como componentes de React en `world/`. Lo imperativo (mutar refs en `useFrame`) está permitido solo para animación de presentación.
2. **R2 — El store es la única fuente de verdad del estado del juego.** `ui/` y `world/` leen del store y escriben solo despachando acciones del store. Nunca se importan entre sí.
3. **R3 — 3D y DOM nunca se hablan directo.** Ni eventos del DOM dentro del canvas, ni refs de objetos 3D en la UI, ni `drei/Html` para HUD. Si el DOM necesita saber algo del mundo (qué NPC está cerca, dónde está el jugador en el minimapa), el mundo lo publica en el store mediante una acción, y el DOM lo lee.
4. **R4 — Las reglas del juego viven en `packages/core`.** Funciones puras, sin React, sin three, sin Zustand, sin APIs del navegador, sin `Date.now()` ni `Math.random()` directos (reloj y RNG se inyectan). Las acciones del store son delgadas: llaman al núcleo y guardan el resultado.
5. **R5 — Los efectos (red, audio, almacenamiento, telemetría) viven en `services/`.** Un servicio se suscribe al store y/o recibe eventos externos (WebSocket), y despacha acciones. Ningún componente abre sockets ni toca `AudioContext`.
6. **R6 — Estado de presentación efímero puede quedar local.** El texto que se está tipeando en un input, un hover, una animación de apertura: estado local de React. **Regla de corte:** si otra capa (otro componente lejano, el mundo, un servicio, el guardado) necesita leerlo, va al store.
7. **R7 — Alta frecuencia sin re-render.** La posición interpolada del jugador y la cámara viven en refs dentro de `world/`. El store guarda la posición **lógica** (la del núcleo de movimiento, a 30 Hz de simulación) y la UI la lee con selectores de baja frecuencia (por ejemplo, celda actual o NPC cercano), nunca la posición por frame.
8. **R8 — El servidor es autoridad de la escena de voz y de la evidencia.** El cliente presenta; el servidor decide cuándo termina una escena, qué evidencia se registró y qué señal da Lumi (§5.6). El cliente nunca fabrica eventos de evidencia.
9. **R9 — Contenido como datos.** Misiones, escenas, NPCs, glosario, árbol de habilidades, layouts de dioramas y líneas de Lumi son archivos validados por schema (§6); el código no contiene texto de juego hardcodeado salvo cadenas de interfaz en i18n.

### 3.2 Por qué un núcleo puro además del store

- Hace testeable sin navegador todo lo que importa (movimiento, progresión, repaso, adaptación, política del compañero, máquinas de estado): C10 y C11.
- Permite que **el servidor use las mismas reglas** que el cliente (por ejemplo, el plegado de evidencia en pociones para los reportes docentes, §3.5.3), sin duplicar lógica.
- Hace real el plan B de render: el modo `dialog-only` y un eventual render 2D son otra vista sobre el mismo store y el mismo núcleo [Referencias §4.4.5].

### 3.3 Store: slices

Un solo store (`useGameStore`) compuesto por slices. Cada slice declara su estado, sus acciones y si se persiste. Los nombres son contrato.

| Slice | Estado (campos principales) | Quién escribe (acciones) | Quién lee | Persistencia |
|---|---|---|---|---|
| `session` | fase de la app (`boot`, `onboarding`, `world`, `scene`, `notebook`, `dialogOnly`), cuenta (id opaco, rol, banda de edad, institución/clase si aplica), estado de conexión, brazos de experimentos asignados, presupuesto de voz restante (minutos), idioma de interfaz, par de idioma | servicios de auth/persistencia/voz; onboarding | todos | servidor (cuenta) |
| `settings` | accesibilidad (tamaño de texto, fuente, subtítulos, karaoke, daltonismo, contraste, reducir movimiento, volúmenes por canal, voz de Lumi on/off), entrada (pulsar para hablar, umbral de fin de turno, solo botón, mapeo de teclas), modo de feedback (`accompanied`/`flagOnly`/`moreHelp`), velocidad de NPC preferida, nivel de ayuda fijado (o automático), tier gráfico (auto/manual), cámara (asistida/isométrica) | `ui/settings`, onboarding | todos | servidor + copia local (preferencias por dispositivo como tier gráfico solo local) |
| `world` | diorama actual y cargados, momento del día, clima guionado, nivel de luz por barrio, flags del mundo (eventos de misión: `dog_found`…), estado de NPCs (posición lógica, ruta, disponible, ícono de pedido), relación por NPC (0-5, nunca baja), interactuables cercanos, interactuable enfocado | núcleo de mundo vía acciones; `world/` despacha `interact(id)`, `moveTo(x,z)`; resultados de escenas | `world/`, `ui/` (prompt de interacción, objetivo actual, lista accesible) | servidor (flags, relaciones, luz) |
| `player` | posición lógica (celda y coordenadas de simulación), destino/camino, orientación, avatar, nombre de juego, pronombres, canasta (objetos prestados de misión) | núcleo de movimiento; onboarding | `world/`, `ui/` | servidor (avatar, nombre, pronombres, canasta); posición solo para reanudar |
| `dialogue` | escena activa (`sceneId`, `npcId`), estado de la máquina de escena (§3.5.1), sub-estado de turno, modalidad (`voice`/`text`), subtítulos (líneas finales y parcial), última línea del NPC (para `Repetir`), velocidad efectiva, menú de silencio abierto, chip de pista visible, opciones sugeridas (modo texto), progreso de criterios (para la línea de objetivo, sin revelar evaluación), motivo de fallback a texto | servicio `voice-client` (mensajes del servidor), `ui/dialogue` (botones: `Terminé`, `Pasar el turno`, `Repetir`, `Más despacio`, `Escribir`, `Marcar`) | `ui/dialogue`, `world/` (animaciones de habla, encuadre de cámara) | no (la escena se reanuda desde su inicio [GDD §2.16]) |
| `companion` | estado de Lumi (`idle`, `listening`, `speaking`, `signal`, `noted`), señal activa (texto, escalón de la escalera, audio), burbuja visible, cola de líneas, brillo (derivado de evidencia total), ítems anotados en la escena actual | servicio `voice-client` (mensajes `companion.*` del servidor), núcleo (líneas de pre-tarea y destilado) | `ui/companion`, `world/actors/Lumi` | no (deriva de `progression` y `learner`) |
| `progression` | log local de eventos de evidencia (ids del servidor), pociones por rama (derivadas, en tercios enteros), habilidades abiertas y pociones vertidas, can-do demostrados, estado por misión (`locked`, `available`, `done`, `canImprove`), capítulo | **solo** aplicando eventos confirmados por el servidor (`scene.end`) y la acción `pourPotions(skillId)` | `ui/notebook`, `world/` (luz de faroles), `companion` | servidor (fuente: eventos) |
| `learner` | banco de repaso (ítems Leitner), patrones de error (clave normalizada, tipo, conteo, sistemático), nivel de andamiaje (1-5) y ventana de señales de las últimas 3 escenas, ítems vencidos | eventos del servidor (`scene.end` trae actualizaciones), repaso de bolsillo | servicio de voz (para pedir escena con ítems vencidos), `ui/notebook` | servidor |
| `ui` | paneles abiertos, modal activo, toasts, foco de navegación accesible | `ui/` | `ui/`, `world/` (pausar input de cámara si hay modal) | no |

**Notas de diseño del store:**
- **Pociones en tercios enteros.** La opción sugerida vale 1/3 de poción [GDD §2.7.3]; para evitar flotantes se guarda `thirds: number` y la UI muestra frascos. Regla de núcleo, testeada.
- **Selectores con nombre** en `state/selectors/` (por ejemplo `selectCurrentObjective`, `selectNearbyInteractables`, `selectPotionsByBranch`). Las corridas no escriben selectores ad hoc dentro de componentes salvo triviales.
- **No hay slice de economía ni de construcción.** Ver §3.6.

### 3.4 Flujo típico (ejemplo completo: hablar con Lily)

```
1. world/ Npc onClick  ──► acción interact("NPC-LILY")
2. core.interaction.resolve(state) ──► si hay misión disponible: session.phase = "scene",
   dialogue.state = "pretask", companion.queue = líneas de pre-tarea (del contenido)
3. ui/companion muestra la burbuja de Lumi; services/audio reproduce el audio cacheado de Lumi
4. services/voice-client ve dialogue.state = "pretask" ──► abre WS y envía scene.start
   (pre-calentamiento mientras Lumi habla)
5. servidor ──► scene.ready ──► acción sceneReady ──► dialogue.state = "npcOpening"
6. audio de apertura (cacheado) suena; world/ anima al NPC "hablando" leyendo dialogue.state
7. dialogue.state = "playerTurn.waiting"; ui/ muestra barra de andamiaje; el silencio es del jugador
...
n. servidor ──► scene.end {result, evidence[], learnerUpdates[]} ──► acción applySceneEnd
   ──► core.progression.apply / core.learner.apply ──► progression, learner, world.flags
   ──► world/ enciende la ventana; ui/ muestra el destilado
```

En ningún paso `ui/` toca `world/` ni al revés.

### 3.5 Máquinas de estado y reglas del núcleo (contratos)

Las máquinas de estado se escriben como **tablas de transición tipadas** (`{ [estado]: { [evento]: (ctx, evento) => [nuevoEstado, efectos[]] } }`), sin dependencia externa. Los efectos son datos (por ejemplo `{type: "send", msg}`), que ejecuta el servicio correspondiente: así la máquina es pura y testeable.

#### 3.5.1 Máquina de escena (compartida cliente/servidor, `packages/core/scene`)

```
idle
 └─ interact(npc con escena) ──► pretask            (Lumi presenta; servidor pre-calienta)
pretask
 ├─ pretaskDone + sceneReady ──► npcOpening         (línea guionada cacheada)
 └─ sceneFailed(net/budget)   ──► npcOpening[text]  (misma escena en modo texto)
npcOpening ── openingDone ──► playerTurn
playerTurn  (sub-estados: waiting ─ speechStart ─► speaking ─ speechPause ─► endPending
                          endPending ─ timer(umbral) | pressDone ─► committed
                          endPending ─ speechResume ─► speaking
                          waiting|endPending ─ pressPass ─► passMenu ─ choose(opción) ─► committed|waiting)
 └─ committed ──► npcTurn
npcTurn
 ├─ npcDone ──► playerTurn
 ├─ companionSignal ──► signal ──(Lumi termina)──► playerTurn
 ├─ criteriaMet ──► closing
 ├─ elapsed ≥ 4:00 sin criterios ──► nonConverging ──► closing(parcial)   [GDD §2.5.3]
 └─ elapsed ≥ 5:00 ──► closing(tope duro)                                  [GDD §2.5.5]
cualquier estado activo
 ├─ voiceLost | budgetExhausted ──► mismo sub-estado con modality = text   [GDD §2.16]
 ├─ safetyRisk ──► containment (línea guionada fuera de la ficción + recurso) ──► closing
 └─ abort (jugador sale) ──► aborted (la escena se reanuda desde su inicio)
closing ──► posttask (destilado + 1-3 evocaciones) ──► done
```

Invariantes testeadas: (a) en ningún estado el NPC habla durante `playerTurn` (el servidor no envía audio de NPC mientras el turno es del jugador), (b) `signal` nunca ocurre dos veces seguidas sobre el mismo error, (c) toda escena termina en `done` o `aborted` (sin estados colgados), (d) `nonConverging` nunca produce pérdida de progreso.

#### 3.5.2 Política del compañero (`packages/core/companion`)

Función pura:

```ts
decideCompanion(input: {
  observer: ObserverResult;          // §5.7
  feedbackMode: "accompanied" | "flagOnly" | "moreHelp";
  turnIndex: number;
  lastSignalTurn: number | null;
  signaledErrorKeys: ReadonlySet<string>;   // en esta escena
  ladderStepByError: Readonly<Record<string, 1|2|3|4|5>>;
  cefrBand: "A0"|"A1"|"A2"|"B1";
  armConfig: CompanionArmConfig;      // A/B-1
}): CompanionDecision
// => { kind: "signal", errorKey, step, template } | { kind: "flag", items } | { kind: "none" }
```

Reglas de default (del GDD, parametrizadas para el A/B-1): prioridad global > objetivo de misión > sistemático > local > desliz; como máximo una señal cada 3 turnos (`moreHelp`: cada 2) y nunca dos seguidas sobre el mismo error; `flagOnly` nunca da señal; la escalera sube un escalón por intento fallido y se reinicia con cada error nuevo; en A0 arranca en el escalón 1 o 5 según el tipo de error [GDD §2.4.3, §2.4.4]. El paso 1 de la escalera (pedido de aclaración) lo dice el **NPC** dentro de la ficción, no Lumi.

#### 3.5.3 Progresión como plegado de eventos (`packages/core/progression`)

- La fuente de verdad del progreso es el **log de eventos de evidencia** (append-only) que emite el servidor: `{id, accountId, at, kind: "target_use"|"self_correction"|"review_recall"|"option_choice"|"can_do"|"mission_outcome", branch?, structureId?, missionId, sceneId, quote?}`.
- `pociones = fold(eventos, reglas)`: `target_use` = 3 tercios, `self_correction` = 3 tercios + marca "gota brillante", `review_recall` = 3 tercios, `option_choice` = 1 tercio, `mission_outcome` = 0, nada por tiempo ni por login [GDD §2.7.3, §1.4.2].
- `pourPotions(skillId)` es el único gasto y no destruye: mueve tercios de "libres" a "vertidos en el nodo", visibles [GDD DP-09]. Abrir requiere tercios suficientes **y** un evento `can_do` o `target_use` de la competencia específica [GDD §2.8.1].
- **Por qué event-sourcing:** (a) el servidor y el cliente calculan lo mismo con la misma función, (b) los reportes docentes son honestos y recomputables, (c) cambiar una regla (por ejemplo el brazo B del A/B-2) no requiere migrar saldos, (d) fusionar progreso offline es unión de eventos por id. **Qué se resigna:** un poco más de diseño inicial y una vista materializada en el servidor para reportes rápidos (§7.4).

#### 3.5.4 Repaso espaciado (`packages/core/review`)

- **Leitner de 6 cajas (0-5)** con intervalos `[0, 1, 3, 7, 14, 30]` días [GDD §2.9]. Recuperación correcta **en producción** sube una caja; error baja una (mínimo 0), sin castigo visible. Elegido sobre SM-2 porque los intervalos del GDD ya son una escalera fija y SM-2 agrega un factor de facilidad por ítem que no tenemos datos para calibrar. Revisar si la telemetría muestra olvido sistemático.
- Días calculados en la zona horaria del jugador (inyectada), para que "mañana" sea mañana.
- `dueItems(bank, now, limit)` alimenta la escena siguiente (el servidor los inyecta en el prompt del NPC como "situaciones que pidan estos ítems") y el repaso de bolsillo.

#### 3.5.5 Andamiaje adaptativo (`packages/core/scaffold`)

- Entrada: ventana de las últimas 3 escenas con `{criteriosSinPista, señales, pedidosRepetir, pedidosMasDespacio, autocorrecciones, turnosHastaObjetivo, convergio}`.
- Regla [GDD §2.10]: sube un nivel si 3 escenas seguidas cumplieron criterios sin pistas y con ≤ 1 señal; baja si 2 escenas seguidas tuvieron 3+ pistas o no convergieron. Si el jugador fijó el nivel, no cambia.
- Salida: nivel 1-5 → parámetros de escena (velocidad, longitud de frase, banda de vocabulario, opciones visibles, umbral del chip de pista, proporción de L1 de Lumi) en una tabla de contenido, no en código.

### 3.6 Dónde entraría el modo 2 (tycoon/construcción) sin tocar el modo 1

La propuesta de terceros trae "Grid y sistema de construcción" y "Loop económico". El GDD los difiere al modo 2 como candidatos, sin dinero del jugador (**DP-15 del GDD, decisión del operador pendiente**). Lo que esta arquitectura garantiza para no cerrarlo ni adoptarlo en silencio:

- El núcleo de movimiento ya usa una **grilla por diorama**; un sistema de construcción en grilla sería un módulo nuevo `packages/core/build` que agrega/quita footprints y regenera caminabilidad.
- Un modo nuevo = **nuevo slice** (`build`) + nuevas vistas en `world/` y `ui/` + nuevas escenas de contenido. No modifica `progression`, `learner` ni `companion`; todo lo que el jugador demuestre en el modo 2 entra como eventos de evidencia en el mismo log [GDD §4.1].
- Si alguna vez existe una "economía del mundo" (recursos del pueblo, favores), es estado del mundo (`world`), nunca una moneda del jugador en `progression`.
- **Ninguna corrida del modo 1 crea el slice `build`, una grilla de construcción ni un loop económico.** Si una corrida lo propone, lo reporta como desvío.

---

## 4. Esqueleto del repositorio, convenciones y límites de módulos

### 4.1 Forma del repo: monorepo chico con npm workspaces (DP-A01)

Tres consumidores comparten tipos y reglas: el cliente web, el servidor y los scripts de contenido. Con un solo paquete, el servidor arrastraría dependencias de React al lockfile del cliente y viceversa, y los tipos del protocolo se duplicarían. Con workspaces de npm (sin turborepo, sin pnpm) se resuelve con lo mínimo.

### 4.2 Árbol

```
learning-game/
├─ package.json                  # workspaces: ["apps/*", "packages/*"]; scripts raíz (gates)
├─ package-lock.json
├─ tsconfig.base.json            # strict, paths
├─ eslint.config.js              # incluye reglas de límites (§4.3)
├─ vitest.workspace.ts
├─ .env.example                  # SOLO nombres de variables, sin valores
├─ .gitignore                    # .env*, assets-src/, node_modules/, coverage/, *.log
├─ README.md                     # cómo correr, gates, dónde está cada cosa
│
├─ docs/
│  ├─ README.md                  # índice y cómo usa una corrida estos documentos
│  ├─ 00-decisiones.md           # registro de decisiones (orden de autoridad en §0.3)
│  ├─ 01-gdd.md                  # qué es el juego
│  ├─ 02-narrativa-guion.md      # biblia y guion de la Región 1
│  ├─ 03-arquitectura.md         # este documento
│  ├─ 04-roadmap.md              # fases, criterios, dependencias
│  ├─ 05-prompts-por-etapa.md    # contrato común y prompts por fase
│  ├─ adr/                       # un archivo por ADR: ADR-NNN-<slug>.md (F1.1 copia ADR-001…021)
│  ├─ reports/                   # F<n>-<AAAA-MM-DD>.md (corridas) · FV-veredicto-<AAAA-MM-DD>.md (operador)
│  ├─ content/plantilla-capitulo.md  # plantilla para capítulos 2-4 (F8.3)
│  ├─ legal/                     # consentimiento y privacidad FV (borradores [operador], D-124)
│  └─ piloto/                    # runbook y guía docente (F13)
│
├─ content/                      # FUENTE de todo el contenido (YAML/JSON), validado por schema
│  ├─ README.md                  # cómo escribir contenido; enlaza GDD §3.8
│  ├─ glossary/
│  │  └─ en.es-AR.yaml           # glosario curado (§6.2); luego en.pt-BR.yaml, etc.
│  ├─ npcs/
│  │  └─ NPC-BEN.yaml …          # ficha de NPC (GDD §2.5.4)
│  ├─ missions/
│  │  └─ M1.2.yaml …             # ficha de misión + escenas (GDD §2.3.3, §2.5.3)
│  ├─ board/                     # pedidos del tablero: P-R1.1.yaml … (GDD §3.7)
│  ├─ mystery/                   # notes.yaml, clues.yaml: meta-misterio de las notas del farol (02 §1.5, §6.2.5)
│  ├─ level-cards/               # A0.yaml, A1.yaml, …: tarjetas de nivel que se inyectan en el prompt (02 §3.3)
│  ├─ prompts/                   # npc-base.txt, lumi.txt: borradores de system prompt (02 §2.6, §3.2); SOLO se compilan al servidor
│  ├─ skills/skill-tree.yaml     # árbol (GDD §2.8.2)
│  ├─ scaffold/levels.yaml       # parámetros por nivel de andamiaje (GDD §2.10)
│  ├─ companion/
│  │  └─ lumi.es-AR.yaml         # líneas y plantillas de Lumi (escalera de señales, destilado, evocación)
│  ├─ dioramas/
│  │  ├─ muelle.yaml             # layout: props, NPCs, rutas, interactuables, zonas no caminables
│  │  └─ plaza.yaml
│  ├─ world/
│  │  └─ places.yaml             # lugares de la región para el modo solo-diálogo (id, nombre, barrio)
│  ├─ safety/
│  │  ├─ topics.global.yaml      # temas vedados globales (GDD §2.17.1)
│  │  ├─ containment.es-AR.yaml  # líneas de contención + recursos por país (DP-38 del GDD)
│  │  └─ blocklists/             # léxico para el filtro rápido (por idioma)
│  ├─ i18n/
│  │  └─ es-AR.json              # cadenas de interfaz (voseo, DP-28 del GDD)
│  ├─ assets-registry.yaml       # registro de licencias de assets (§6.4.2)
│  └─ audio-lines.manifest.json  # GENERADO: líneas guionadas → archivo de audio + hash
│
├─ assets-src/                   # descargas crudas de packs (gitignored, DP-A10)
│
├─ packages/
│  ├─ core/                      # TS puro: reglas del juego (sin React/three/zustand/DOM)
│  │  ├─ src/
│  │  │  ├─ scene/               # máquina de escena (§3.5.1)
│  │  │  ├─ companion/           # política del compañero (§3.5.2)
│  │  │  ├─ progression/         # plegado de evidencia, árbol, vertido (§3.5.3)
│  │  │  ├─ review/              # Leitner (§3.5.4)
│  │  │  ├─ scaffold/            # andamiaje adaptativo (§3.5.5)
│  │  │  ├─ movement/            # grilla, A*, colisión círculo-celda, paso fijo (§2.4)
│  │  │  ├─ interaction/         # interactuables cercanos, resolución de interact()
│  │  │  ├─ world/               # flags, luz por barrio, desbloqueo de misiones
│  │  │  ├─ save/                # schema de guardado + migraciones versionadas
│  │  │  ├─ experiments/         # asignación determinística de brazos (hash de cuenta)
│  │  │  └─ runtime/             # Clock, Rng (interfaces inyectables)
│  │  └─ test/
│  ├─ content-schema/            # schemas zod + validador + compilador YAML→JSON + lints de contenido
│  │  ├─ src/schemas/            # mission.ts, scene.ts, npc.ts, glossary.ts, diorama.ts, …
│  │  ├─ src/validate/           # referencias cruzadas, banda de vocabulario, IDs estables
│  │  └─ src/compile/            # genera JSON para web y server; genera grillas de caminabilidad
│  └─ protocol/                  # mensajes WS y DTOs REST (zod) + framing binario de audio
│     └─ src/
│
├─ apps/
│  ├─ web/
│  │  ├─ index.html              # juego
│  │  ├─ docente.html            # panel docente (sin three)
│  │  ├─ vite.config.ts
│  │  ├─ public/
│  │  │  ├─ models/<pack>/…glb   # SOLO modelos ya optimizados por el pipeline
│  │  │  ├─ textures/            # atlas de paleta, rampas toon, sprites de halo
│  │  │  ├─ audio/lines/         # líneas guionadas pre-generadas (Opus/OGG)
│  │  │  ├─ audio/sfx/ …/music/  # CC0/CC-BY registrados
│  │  │  ├─ fonts/               # autoalojadas
│  │  │  ├─ decoders/            # decodificador meshopt autoalojado
│  │  │  ├─ portraits/           # PNG de retratos por NPC exportados por el operador (D-030)
│  │  │  └─ content/             # GENERADO: JSON compilado desde /content
│  │  └─ src/
│  │     ├─ main.tsx · App.tsx   # monta shell DOM; carga diferida del canvas
│  │     ├─ state/
│  │     │  ├─ store.ts          # composición de slices
│  │     │  ├─ bridge.ts         # ÚNICA puerta del mundo 3D al store: selectores y acciones permitidos a world/
│  │     │  ├─ slices/           # sessionSlice.ts, settingsSlice.ts, worldSlice.ts, …
│  │     │  └─ selectors/
│  │     ├─ services/
│  │     │  ├─ voice/            # voiceClient.ts, framing, reconexión
│  │     │  ├─ audio/            # worklets (captura, VAD, reproducción), director de audio, time-stretch
│  │     │  ├─ input/            # teclado/mouse/táctil → acciones; remapeo
│  │     │  ├─ persistence/      # sync con servidor + copia local (IndexedDB)
│  │     │  ├─ telemetry/        # eventos de aprendizaje y engagement (§7.6)
│  │     │  ├─ quality/          # detección de tier, PerformanceMonitor bridge
│  │     │  └─ content/          # carga y cacheo del contenido compilado
│  │     ├─ world/               # R3F
│  │     │  ├─ GameCanvas.tsx    # raíz del canvas (chunk diferido)
│  │     │  ├─ dioramas/         # Diorama.tsx genérico que lee el layout
│  │     │  ├─ actors/           # Player.tsx, Npc.tsx, Lumi.tsx (primitivas, DP-39 del GDD)
│  │     │  ├─ props/            # Prop, InstancedProps, Interactable
│  │     │  ├─ camera/           # AssistedCamera, IsoCamera, DialogueFraming
│  │     │  ├─ materials/        # ToonMaterial, rampas, outline
│  │     │  ├─ lighting/         # tiempo del día, luz por barrio, halos
│  │     │  └─ dev/              # superposición de grilla y coordenadas (solo dev)
│  │     ├─ ui/                  # React DOM + Tailwind
│  │     │  ├─ hud/              # objetivo, indicador de voz, prompt de interacción
│  │     │  ├─ dialogue/         # subtítulos, barra de andamiaje, menú de silencio, modo texto
│  │     │  ├─ companion/        # burbuja de Lumi, señal, destilado
│  │     │  ├─ notebook/         # Frasco de Lumi
│  │     │  ├─ settings/ · onboarding/ · menus/
│  │     │  ├─ dialog-only/      # render alternativo sin WebGL
│  │     │  ├─ a11y/             # lista de interactuables por teclado, anuncios aria-live
│  │     │  └─ primitives/       # Button, Panel, Slider (nativos + tokens)
│  │     ├─ teacher/             # entrada del panel docente
│  │     ├─ i18n/                # helper mínimo (Intl.PluralRules) sobre content/i18n
│  │     └─ styles/tokens.css
│  └─ server/
│     ├─ src/
│     │  ├─ index.ts             # HTTP + WS en un proceso; sirve también el build estático
│     │  ├─ config/              # carga de models.yaml, precios, límites; validado con zod
│     │  ├─ gateway/             # WS del cliente, framing, autenticación del socket
│     │  ├─ scene-runtime/       # orquesta UNA escena: sesión Live, máquina de escena, timers
│     │  ├─ providers/           # adaptadores: gemini-live, gemini-text, tts-*, moderation-*
│     │  ├─ observer/            # prompt, schema de salida, guardas de truncado
│     │  ├─ moderation/          # filtro rápido, clasificador, retención de audio, contención
│     │  ├─ budget/              # minutos de voz por cuenta/institución
│     │  ├─ cost/                # ledger de costo por escena y por minuto
│     │  ├─ api/                 # REST: auth, guardado, clases, reportes, consentimiento
│     │  ├─ auth/                # sesiones, roles, login de clase
│     │  ├─ db/                  # migraciones SQL a mano + consultas
│     │  ├─ telemetry/           # ingesta de eventos
│     │  └─ retention/           # borrado programado (transcripciones a 30 días)
│     ├─ config/models.yaml      # roles de modelo → proveedor/modelo/precio (sin claves)
│     ├─ generated/content/      # GENERADO por scripts/content/build.ts: contenido + prompts (nunca va al cliente)
│     └─ test/fakes/             # servidor Live falso, modelo de texto falso, TTS falso
│
└─ scripts/
   ├─ assets/optimize.ts         # gltf-transform: prune, dedup, weld, quantize, meshopt, texturas
   ├─ assets/inspect-budgets.ts  # triángulos, draw calls estimados, memoria de texturas, tamaños
   ├─ content/build.ts           # valida + compila /content → apps/web/public/content y apps/server/generated/content
   ├─ audio/pregenerate-lines.ts # MANUAL (necesita clave): genera audio de líneas guionadas
   ├─ audio/lines-to-generate.json  # GENERADO en F8: lista de líneas para el operador
   ├─ budgets/budgets.json       # copia legible por máquina de §2.7.3 (F1.1)
   ├─ budgets/bundle-size.ts     # verifica §2.7.3 sobre la salida de vite build y los assets
   ├─ eval/live-text.ts          # eval en vivo opt-in (fuera de verify; clave + autorización)
   └─ fv/report.ts               # métricas del prototipo FV (D1, D7, minutos, US$)

experiments/                     # FUERA de los workspaces
├─ f0-voice-probe/               # sonda de costo de voz (F0.1)
└─ f0-perf-spike/                # spike de rendimiento descartable (F0.2)
```

#### 4.2.1 Rutas canónicas

Esta tabla es la **única fuente de rutas** del proyecto (`00-decisiones.md` §0.3). Todo prompt de fase de `05-prompts-por-etapa.md` la cita; si un prompt nombra otra ruta, gana esta tabla y la diferencia se reporta. Una corrida que necesite una ruta nueva la agrega acá en su reporte como propuesta y usa una ruta coherente con el árbol de §4.2.

| Qué | Ruta canónica | Fase que la crea |
|---|---|---|
| Registro de licencias de assets | `content/assets-registry.yaml` (en el spike descartable: `experiments/f0-perf-spike/LICENSES.md`) | F3 (F0.2 en el spike) |
| Layout de dioramas | `content/dioramas/muelle.yaml`, `content/dioramas/plaza.yaml` (F2 usa `content/dioramas/test.yaml`, de primitivas) | F2 (test), F3 |
| Lugares para solo-diálogo | `content/world/places.yaml` | F1.3 |
| Compilador de contenido | `scripts/content/build.ts` | F1.2 |
| Salida compilada | `apps/web/public/content/` (cliente, sin prompts) · `apps/server/generated/content/` (servidor) | F1.2 |
| Glosario | `content/glossary/en.es-AR.yaml` | F1.2 |
| Misiones · NPCs · tablero · misterio | `content/missions/M<c>.<n>.yaml` · `content/npcs/NPC-<NOMBRE>.yaml` · `content/board/P-R<r>.<n>.yaml` · `content/mystery/notes.yaml`, `content/mystery/clues.yaml` | F1.2, F8 |
| Tarjetas de nivel y prompts base | `content/level-cards/<nivel>.yaml` · `content/prompts/npc-base.txt`, `content/prompts/lumi.txt` | F1.2 (los usa F4.1) |
| Plantillas de Lumi | `content/companion/lumi.es-AR.yaml` | F1.2, F6 |
| Seguridad | `content/safety/topics.global.yaml` · `content/safety/containment.es-AR.yaml` · `content/safety/blocklists/` | F1.2, F4.2 |
| Árbol de habilidades | `content/skills/skill-tree.yaml` | F1.2 |
| Modelos y precios | `apps/server/config/models.yaml` | F4.1 |
| Presupuestos | §2.7.3 + `scripts/budgets/budgets.json` (lo lee `check:budgets`) | F1.1 |
| Puente mundo → store | `apps/web/src/state/bridge.ts` | F2 |
| Capa DOM | `apps/web/src/ui/` (incluye `ui/hud/`, `ui/dialogue/`, `ui/companion/`, `ui/notebook/`, `ui/dialog-only/`, …) | F1.3 |
| Capa 3D | `apps/web/src/world/` | F2 |
| Optimizador de assets | `scripts/assets/optimize.ts` → `apps/web/public/models/<pack>/` | F3 |
| Retratos para solo-diálogo | `apps/web/public/portraits/NPC-<NOMBRE>.png` (exportados por el operador con el botón de dev, D-030) | F3 |
| Audio de líneas guionadas | `scripts/audio/pregenerate-lines.ts` · `scripts/audio/lines-to-generate.json` · `apps/web/public/audio/lines/` | F8 |
| Eval en vivo opt-in | `scripts/eval/live-text.ts` | F4.1 |
| Reporte del prototipo | `scripts/fv/report.ts` | FV |
| ADRs | `docs/adr/ADR-NNN-<slug>.md` | F1.1 |
| Reportes | `docs/reports/F<n>-<AAAA-MM-DD>.md` · veredicto FV del operador: `docs/reports/FV-veredicto-<AAAA-MM-DD>.md` | cada fase · operador |
| Plantilla de capítulo | `docs/content/plantilla-capitulo.md` | F8.3 |
| Sondas | `experiments/f0-voice-probe/` · `experiments/f0-perf-spike/` | F0.1, F0.2 |
| Variables de entorno | prefijo `LG_` (§4.4), p. ej. `LG_GEMINI_API_KEY`; solo nombres en `.env.example` | F0.1, F1.1 |

### 4.3 Límites de módulos (verificados por ESLint `no-restricted-imports` y por entorno)

| Desde | Puede importar | No puede importar |
|---|---|---|
| `packages/core` | solo `packages/protocol` (tipos) y TS estándar | `react`, `three`, `@react-three/*`, `zustand`, cualquier `apps/*`; globals de navegador o Node (lint con entorno neutro) |
| `packages/content-schema` | `zod`, `yaml`, `packages/core` (tipos) | `apps/*` |
| `packages/protocol` | `zod` | todo lo demás |
| `apps/web/src/ui` | `state/` (selectores y acciones), `i18n/`, `primitives`, `packages/core` (tipos) | `world/`, `three`, `@react-three/*`, `services/` (los servicios se activan por estado, no por import) |
| `apps/web/src/world` | `state/selectors/` y `state/bridge.ts` (acciones expuestas al mundo), `three`, `@react-three/*`, `packages/core` (tipos) | `ui/`, `services/`, `state/slices/`, `state/store.ts`, módulos de reglas de `packages/core` (solo tipos) |
| `apps/web/src/services` | `state/`, `packages/*` | `ui/`, `world/` |
| `apps/web/src/state` | `packages/core`, `packages/protocol` | `ui/`, `world/`, `services/` |
| `apps/web/src/teacher` | `packages/protocol`, `i18n/`, `ui/primitives` | `world/`, `three` |
| `apps/server` | `packages/*` | `apps/web` |

Un `npm run lint` rojo por un límite es un **bloqueante**, no una advertencia.

### 4.4 Convenciones de nombres

| Cosa | Convención | Ejemplo |
|---|---|---|
| Identificadores de código | inglés, camelCase; tipos PascalCase | `applySceneEnd`, `ObserverResult` |
| Componentes React | PascalCase, un componente por archivo | `ScaffoldBar.tsx` |
| Hooks | `useX` | `useNearbyInteractables` |
| Slices | `<nombre>Slice.ts`, acciones verbo primero | `dialogueSlice.ts` → `pressDone()` |
| Mensajes WS | `dominio.verbo` en minúscula | `scene.start`, `companion.signal` |
| IDs de contenido | los del GDD, estables, nunca reutilizados | `M1.2`, `M1.2-E1`, `NPC-LILY`, `HAB-PEDIR-1` |
| Claves de los archivos de contenido | **las del GDD, en español snake_case** (DP-A02) | `criterios_exito`, `necesidad_npc` |
| Variables de entorno | `LG_` + SCREAMING_SNAKE | `LG_GEMINI_API_KEY` |
| Tokens CSS | `--lg-*` | `--lg-color-luz-farol` |
| Archivos de assets | `<pack>/<pieza>.glb` en kebab-case, sin espacios | `kenney-city/house-small-a.glb` |
| Ramas git | `feat/…`, `fix/…`, `content/…` | `content/m1-plaza-scenes` |
| Unidades | metros, segundos, tercios de poción (enteros) | `thirds: 3` |

**Por qué las claves de contenido en español (DP-A02):** el GDD define los campos en español y las corridas que escriben contenido leen el GDD; traducir nombres de campo entre documento y archivo es una fuente gratuita de errores. **Qué se resigna:** el código tiene accesos mixtos (`mission.criterios_exito`). Si el operador prefiere inglés, se cambia una sola vez en los schemas con una tabla de correspondencia en `content/README.md`.

---

## 5. Pipeline de voz e IA (reuso de un prototipo de voz anterior)

### 5.1 Qué hay hoy en un prototipo de voz anterior (leído en el código, 2026-10-05)

| Pieza | Qué hace | Dónde |
|---|---|---|
| Proxy WebSocket | El navegador se conecta a `/proxy`; el servidor abre un WebSocket a Gemini Live con la clave del lado del servidor y **retransmite marcos en ambos sentidos sin interpretarlos**. Cola de mensajes previos a la apertura, saneo de códigos de cierre | `server.js` (Node + `ws`); `server.ts` es una versión Bun más vieja del mismo proxy |
| Configuración de la sesión Live | La arma **el navegador**: modelo (`gemini-3.1-flash-live-preview`), `responseModalities: AUDIO`, voz prebuilt, `systemInstruction` (prompt del profesor + perfil + preferencias), `contextWindowCompression.slidingWindow`, `sessionResumption` con handle | `public/index.html` |
| Audio | Captura a 16 kHz PCM16 con `ScriptProcessorNode` en base64 dentro de JSON; reproducción PCM a 24 kHz; time-stretch OLA sin cambio de tono para la velocidad | `public/index.html` |
| Manejo de sesión | `goAway` (aviso de corte), reanudación con handle, transcripciones de entrada y salida (`inputTranscription`/`outputTranscription`), `interrupted`, `turnComplete` | `public/index.html` |
| Contabilidad | Suma `usageMetadata` por modalidad (audio/texto, entrada/salida) **en el cliente**; `/session/end` guarda contadores en `sessions.json`; panel `/usage` | cliente + `server.js` |
| Observador por turno | `/analyze-turn`: modelo de texto (`gemini-2.5-flash`) con JSON forzado: errores (tipo, global/local, riesgo de fosilización), qué corrigió y qué omitió el **profesor** | `server.js` |
| Análisis y debrief | `/analyze` (frase), `/analyze-session` (informe al cierre) con guardas de `finishReason` para no confundir truncado con error de parseo | `server.js` |
| Perfil del alumno | `learner-profile.json` en disco, **una entrada por idioma** (un solo usuario implícito): patrones de error, temas, foco siguiente | `server.js` |
| Reglas y prompts | `teacher-config/prompts.json` (modos conversation/correction), `rules.md` (regla de disfluencias, tono, memoria silenciosa), `knowledge/` | `teacher-config/` |
| Base de conocimiento del observador | Principios de corrección (clasificación global/local/sistemático/desliz, estrategias de corrección), fuentes de neurociencia | `observer-knowledge-base.md` |
| TTS | `/tts` contra Deepgram Aura (voz inglesa) | `server.js` |
| Admin | Editor de archivos de config, chat que lanza un CLI de IA como subproceso, login con contraseña fija en el código | `server.js` |

### 5.2 Decisión de reuso: portar módulos al servidor del juego, no enlazar ni correr LT como servicio

| Opción | Qué da | Qué cuesta / falla | Veredicto |
|---|---|---|---|
| A. Correr LT tal cual como servicio aparte y llamarlo | Cero trabajo inicial | El proxy es transparente: **el navegador arma el system prompt** → cualquiera puede reemplazar el guion de seguridad del NPC desde la consola (inaceptable con menores, C5); perfil de un solo usuario en archivo; admin con contraseña en el código; logs que imprimen prompts y transcripciones | **No** |
| B. Extraer LT a un paquete compartido usado por ambos proyectos | Un solo código de voz | Acopla dos productos con requisitos distintos (LT es un laboratorio de un adulto; el juego tiene menores, escenas, moderación); cada cambio rompe al otro | **No por ahora** |
| C. **Portar** al servidor del juego los módulos probados, con nota de procedencia, y dejar LT como laboratorio | Se reusa lo que funciona (y sus correcciones ya aprendidas) con los límites que el juego necesita | Divergencia futura entre los dos códigos | **Sí (ADR-005)** |

**Qué se porta (con adaptación) y qué no:**

| Se porta | Adaptación obligatoria |
|---|---|
| Núcleo del relay WS (cola previa a la apertura, saneo de códigos/razones de cierre, cierre seguro) | El servidor deja de ser transparente: **el cliente nunca envía `setup`** (si lo envía, se descarta y se registra); el servidor arma la sesión desde el contenido (§5.4) |
| Configuración Live conocida: `contextWindowCompression`, `sessionResumption`, manejo de `goAway`, lectura de transcripciones, `interrupted`/`turnComplete` | Se usa por escena (sesiones cortas); la reanudación solo cubre cortes de red dentro de una escena |
| Contabilidad por modalidad de `usageMetadata` | Se mueve **al servidor** (el cliente no es confiable para costos) y alimenta el ledger (§5.9) |
| Time-stretch OLA sin cambio de tono | Se reescribe dentro de un AudioWorklet (§5.5.4) |
| Guardas de `finishReason` / truncado de respuestas JSON del modelo de texto | Igual, envueltas en el adaptador de proveedor |
| Regla de disfluencias (`rules.md`) y taxonomía de errores (global/local/sistemático/desliz) | Se copian al prompt del observador; ya son la regla del GDD [GDD §2.4.4] |
| Patrón de observador por turno con salida JSON | Prompt **nuevo**: evalúa al **jugador** contra los criterios de la escena y las estructuras objetivo, no al profesor (§5.7) |

| No se porta | Por qué |
|---|---|
| Armado del `setup` en el navegador | Seguridad (C5) |
| `learner-profile.json` / `sessions.json` en disco | Multiusuario y privacidad: van a Postgres con esquema propio (§7.4) |
| Panel admin, contraseña fija, chat que lanza un CLI como subproceso | Superficie de ataque; fuera de alcance |
| Logs de contenido (`console.log` de prompts y de las primeras centenas de caracteres de cada mensaje) | Con menores, los logs no pueden contener transcripciones ni prompts con perfil (§7.8) |
| `ScriptProcessorNode` y audio en base64 dentro de JSON | Hilo principal y +33% de ancho de banda (§5.5) |
| Prompts de "profesor Caserta" | El juego tiene NPCs con guion, no un tutor; la persona y el marco salen del contenido |

**Base de conocimiento del observador (`observer-knowledge-base.md`):** se usa como referencia de taxonomía y estrategias de corrección. **Precaución:** sus afirmaciones de neurociencia no fueron graduadas por la investigación y su principio 1 ("marcar todo error no corregido") choca con la regla de densidad del GDD. Resolución: el observador **detecta y registra** todos los errores (alimentan el modelo del alumno); la **política del compañero** (§3.5.2) decide cuáles se señalan. Detección e intervención quedan separadas. El prompt del observador del juego cita la política del GDD, no las afirmaciones de la KB.

**LT sigue vivo como laboratorio:** el experimento #1 de el análisis de negocio (sonda de costo: 20 escenas de 3 min, Live vs cascada, lectura de `usage_metadata`) se corre con el arnés de LT, como pide [Negocio §7], sin esperar al servidor del juego.

### 5.3 Frontera de servidor y secretos

```
[Navegador]  ──HTTPS──►  apps/server  ──►  proveedores (Gemini Live/texto, TTS, moderación)
     │                       ▲  claves solo acá (variables de entorno del host)
     └──WSS (cookie de sesión, token de escena de un solo uso)──┘
```

- Las claves de proveedores existen solo como variables de entorno del proceso del servidor (gestor de secretos del host). Nunca en el bundle, en `public/`, en respuestas, en logs ni en mensajes de error.
- **Tokens efímeros directos navegador → Gemini: descartados para v1.** Bajarían latencia y carga del servidor, pero (a) el servidor no vería el stream para moderar y cortar audio, (b) la contabilidad dependería del cliente, (c) el control del `setup` dependería de restricciones del token. Revisar si la moderación por proveedor y los costos lo permiten (ADR-005, alternativa registrada).
- El WS se autentica con la cookie de sesión y un **token de escena de un solo uso** emitido por la API al pedir una escena (evita abrir sesiones de voz sin presupuesto o sin cuenta).

### 5.4 Escena = una sesión de voz (estrategia contra el tope de ~15 min y el costo cuadrático)

1. **Una sesión Live por escena**, abierta durante la pre-tarea (Lumi habla 20-40 s: tiempo de sobra para el handshake) y cerrada al terminar la escena. Escena objetivo 2-4 min, `nonConverging` a los 4:00, tope duro 5:00 aplicado **en el servidor** [GDD §2.5.5]. Nunca se acerca a los ~15 min de tope ni al tramo cuadrático caro [Negocio §3.2].
2. **Contexto mínimo inyectado por escena** (objetivo ≤ 1.500 tokens de system instruction), armado por `scene-runtime` desde el contenido compilado:
   - bloque de seguridad global (temas vedados, nunca pedir datos personales, nunca salir del marco; contención si aparece riesgo);
   - ficha del NPC (personalidad, forma de hablar, sabe/no sabe, relación actual);
   - guion de escena (situación, necesidad, criterios de éxito en lenguaje del modelo, andamiaje del NPC, temas permitidos, banda de vocabulario, regla de turnos cortos por nivel);
   - parámetros de andamiaje del nivel actual (longitud de frase, velocidad indicada, cuándo ofrecer opciones);
   - resumen previo (2-3 líneas, ya depurado de datos personales) e ítems de repaso vencidos (≤ 5) con la instrucción de crear situaciones que los pidan;
   - regla de no interrumpir y de no hablar dos veces seguidas.
3. **Aperturas y cierres guionados no pasan por Live:** se reproducen como audio pre-generado con la misma voz del NPC (§6.3). El NPC "sabe" que ya dijo la apertura porque el servidor la inyecta como turno previo en el contexto.
4. **Entre escenas no se arrastra historial**, solo el resumen generado por el observador al cierre.
5. `contextWindowCompression` se deja activado como red de seguridad (escenas más largas de lo previsto por un bug), y `sessionResumption` solo para cortes de red: si la reanudación falla, la escena sigue en modo texto desde el último turno [GDD §2.16].

### 5.5 Flujo de voz en tiempo real y turnos (resuelve DP-06 y DP-07 del GDD)

#### 5.5.1 Diagrama

```
 Navegador                                        Servidor (scene-runtime)                  Proveedor
 ─────────                                        ────────────────────────                  ─────────
 mic → AudioWorklet(captura + resample 16k
       + VAD local con histéresis)
   │  speechStart ─────────── turn.activityStart ─►  activityStart ─────────────────────────► Live
   │  frames PCM16 (binario) ─────── audio ───────►  relay ─────────────────────────────────► Live
   │  [silencio: NO se envía audio]
   │  "Terminé" o umbral local ─── turn.end ──────►  activityEnd ───────────────────────────► Live
   │                                                 │
   │                                                 ├─ transcripción del jugador (inputTranscription)
   │                                                 │     → filtro rápido de entrada (§7.7)
   │                                                 │     → observer (texto, asíncrono) ──────► modelo de texto
   │                                                 │
   │                                                 ◄─ audio NPC + outputTranscription ◄──── Live
   │                                                 ├─ retención de audio (holdback) + filtro de salida
   │  ◄──────────── npc.audio (binario) ─────────────┤  si dispara: corta, npc.interrupt, línea segura
   │  ◄──────────── npc.transcript ──────────────────┤
   │  reproducción (worklet, time-stretch)           │
   │                                                 ├─ observer listo → core.decideCompanion
   │  ◄──── companion.signal | companion.flagged ────┤  (después de que el NPC termina su turno)
   │  ◄──── scene.progress (criterios, sin evaluar) ─┤
   │  ◄──── scene.end {result, evidence, updates} ───┘  ledger de costo, eventos a la DB
```

#### 5.5.2 Fin de turno (DP-06): detección de actividad manual + VAD local + botón

- **Decisión:** se desactiva la detección automática de actividad del proveedor y el **cliente** marca inicio y fin de turno (`activityStart`/`activityEnd` del Live API; verificar nombres y forma exacta en la doc de la versión vigente). El fin de turno ocurre por (a) botón `Terminé` (Espacio/Enter) o (b) umbral de silencio local configurable (default 3 s, rango 2,5-4 s, o "solo botón") [GDD §2.6.2]. Pulsar para hablar: tecla mantenida = inicio/fin.
- **Por qué no el VAD automático del proveedor con umbral largo:** con VAD del servidor, una pausa de pensamiento más larga que el umbral se toma como fin de turno y el NPC responde: viola "el silencio es del jugador". Con control manual, el NPC **no puede** responder hasta que el cliente cierre el turno.
- **Envío solo durante el habla:** el worklet de captura manda audio solo entre `speechStart` (con 300 ms de pre-roll) y el fin de turno. Efectos: (1) no se factura audio de silencio como tokens de entrada (a confirmar en la sonda: la factura de audio de entrada es por segundo enviado), (2) baja el ancho de banda de subida a casi cero mientras el jugador piensa, (3) el eco del NPC por parlantes no dispara turnos (el VAD local se silencia mientras el NPC habla; con parlantes en aula, default pulsar para hablar en "modo aula") [GDD §2.18].
- **VAD local:** detector de energía con histéresis y suavizado en el worklet (barato en CPU débil). No se carga un modelo de VAD neuronal en v1 (pesa megas y CPU); revisar si las aulas ruidosas lo exigen (DP-A06).
- **Interrupciones:** si el jugador empieza a hablar mientras el NPC habla, se envía `activityStart`, el proveedor interrumpe y el cliente vacía la cola de reproducción (`interrupted`). El NPC nunca interrumpe al jugador.

#### 5.5.3 Botón de silencio (`Pasar el turno`) y sus 4 opciones

| Opción [GDD §2.6.2] | Implementación |
|---|---|
| *Pista* | Lumi, no el NPC: el núcleo elige el nivel de pista siguiente desde el contenido (`andamiaje` de la misión); la pista P3 es una frase modelo con audio cacheado; P1-P2 son plantillas de contenido |
| *Repetir* | **Sin costo de modelo:** el cliente reproduce el audio de la última línea del NPC que guardó en memoria |
| *Más simple* | El servidor inyecta un turno de dirección al modelo (texto, no audio) del tipo `[DIRECTOR] El jugador pidió algo más simple: reformulá tu última línea con menos palabras y ofrecé dos opciones.` y cierra el turno del jugador. El prompt de sistema establece que las notas `[DIRECTOR]` nunca se verbalizan |
| *Seguí vos* | Igual, con `[DIRECTOR] Continuá la conversación sin esperar respuesta; dale al jugador una pregunta fácil de sí/no.` Sin penalización |

El chip visual "¿Querés una pista?" a los 10 s (DP-05 del GDD) es puramente del cliente (timer en el sub-estado `waiting`, desactivable, sin sonido); no toca el servidor.

#### 5.5.4 Modo lento (DP-07)

Tres capas, en este orden de preferencia:

1. **Instrucción al modelo por nivel de andamiaje:** frases más cortas, pausas entre frases, repetición de palabras clave. Cambia lo que se dice, no solo cómo suena; es lo que más ayuda en A0-A1.
2. **Time-stretch en el cliente sin cambio de tono** (OLA, ya probado en LT): 1,0 / 0,85 / 0,7 para Natural / Más lenta / Muy lenta. Corre en el worklet de reproducción; costo cero de modelo.
3. **Líneas guionadas:** se pre-generan a velocidad natural y se estiran en el cliente igual que lo generado (un solo archivo por línea).

A la fecha de este documento no tengo verificado un parámetro de velocidad de habla en la configuración de voz de Gemini Live; si existe en la versión vigente, reemplaza la capa 2 para el audio generado. **Falla posible:** el OLA a 0,7 suena "metálico" con algunas voces. Mitigación: escuchar y ajustar el piso (decide el operador por oído, DP-A07 relacionado).

#### 5.5.5 Ancho de banda (riesgo de aula compartida)

- Hoy, en LT: PCM16 a 16 kHz en base64 dentro de JSON ≈ 340 kbps de subida continua; salida a 24 kHz ≈ 510 kbps de bajada. Una clase de 25 alumnos simultáneos multiplicaría eso en un enlace escolar que puede ser de pocos Mbps.
- v1: **marcos binarios** (sin base64: −25%) y **subida solo durante el habla** (§5.5.2). La bajada solo existe mientras el NPC habla.
- Si la medición en una escuela real no alcanza (DP-A06): Opus en ambos sentidos entre navegador y servidor (el servidor decodifica/codifica hacia el proveedor). Agrega CPU en el servidor y una dependencia de códec; por eso no va en v1 sin datos.

### 5.6 El compañero como segundo observador

- **Lumi no está dentro de la sesión Live del NPC.** Son dos "modelos" distintos: el NPC (voz en tiempo real, en la ficción) y el observador (texto, fuera de la ficción). Esto evita que el NPC haga de profesor y mantiene el costo de la sesión de voz bajo (el observador no re-factura audio).
- **Disparo:** al cerrarse cada turno del jugador, `scene-runtime` llama al observador con: transcripción del jugador (con disfluencias), última línea del NPC, criterios de éxito de la escena, estructuras objetivo de la misión, ítems de repaso que la escena buscaba, nivel MCER y patrones de error conocidos (clave + tipo, sin texto libre del perfil).
- **Concurrencia:** el observador corre mientras el NPC responde (1-2 s típicos de un modelo de texto rápido). La decisión de Lumi se aplica **después** de que el NPC termina su turno: Lumi nunca habla encima del NPC [GDD §2.4.1].
- **Salida validada con schema** (§5.7). Si el observador falla, trunca o no responde a tiempo, la escena sigue sin señal (degradación silenciosa del feedback, nunca de la conversación) y el turno se re-evalúa al cierre de la escena.
- **Voz de Lumi:** TTS en la L1 (rioplatense, DP-28 del GDD). Las líneas de Lumi son **plantillas de contenido** con huecos (`"Mmm... ¿{forma_erronea}...?"`), no texto libre del modelo: el observador entrega el hueco (la forma del jugador limpia de disfluencias, la forma correcta desde el glosario cuando existe) y la plantilla la arma el núcleo. Las plantillas fijas tienen audio pre-generado; las que llevan hueco se sintetizan al vuelo con caché por texto (DP-A07).
- **Destilado y evocación (post-tarea):** el servidor envía en `scene.end` los eventos de evidencia y las 1-3 preguntas de evocación elegidas por el núcleo desde lo marcado; las frases salen de plantillas de `lumi.es-AR.yaml`.

### 5.7 Pipeline de detección de errores → modelo del alumno

```
turno del jugador (transcripción)
   → observer (texto, JSON forzado, guardas de truncado)
   → validación zod de ObserverResult (rechazo = turno sin evaluación, log de calidad)
   → reglas determinísticas:
       · normalización de clave de error (tipo + patrón, p. ej. "subject-verb:3sg-s")
       · descarte de errores sobre disfluencias (doble chequeo de la regla)
       · verificación de que criterionId y structureId existan en el contenido
   → core.decideCompanion (señal / anotar / nada)
   → eventos de evidencia (append-only, DB) + actualizaciones del modelo del alumno
       (patrones: conteo, sistemático si ≥ 3 en 3 escenas distintas; banco Leitner)
   → al cierre: resumen de 2-3 líneas para la próxima escena (depurado de datos personales)
```

Contrato de salida del observador (en `packages/protocol`, zod):

```ts
type ObserverResult = {
  turnId: string;
  intended: string;                       // oración reconstruida sin disfluencias
  errors: Array<{
    key: string;                          // normalizada por reglas, no por el modelo
    type: "grammar"|"vocabulary"|"word-order"|"article"|"tense"|"subject-verb"
        |"pronoun"|"preposition"|"other";
    scope: "global"|"local";
    missionTarget: boolean;               // ¿es la estructura que la misión practica?
    span: string;                         // fragmento limpio del jugador
    correction: string;                   // forma correcta
  }>;
  criteria: Array<{ criterionId: string; met: boolean; quote: string }>;
  evidence: Array<{ kind: "target_use"|"self_correction"|"review_recall";
                    structureId: string; branch: Branch; quote: string }>;
  offTopic: boolean;
  personalDataDetected: boolean;          // el jugador dio datos personales
  safety: "none"|"inappropriate"|"risk";
};
```

**Riesgo central del pipeline (R2):** las transcripciones automáticas tienden a "normalizar" el habla hacia formas gramaticales (el jugador dice *she go*, la transcripción escribe *she goes*), lo que **esconde errores** al observador; y el acento rioplatense puede degradar la transcripción [Referencias §4.2.3]. Medición obligatoria antes de prometer correcciones: conjunto de grabaciones con errores sembrados conocidos (hechas por adultos voluntarios con consentimiento, nunca de menores) → tasa de preservación de errores en la transcripción. Si es baja, el observador recibe también el **audio** del turno del jugador (modelo multimodal), con su costo (DP-A15).

### 5.8 Modo texto y fallback

- **Modo texto = misma escena, otro transporte:** el jugador escribe; `scene-runtime` usa un modelo de texto con el mismo contexto de escena; el NPC responde en texto y, si el jugador quiere, en audio TTS cacheado por texto. Moderación **síncrona** completa antes de mostrar (en texto sí se puede bloquear todo).
- **Opciones sugeridas (A0-A1):** las genera el núcleo desde el `andamiaje` del contenido (no el modelo), para garantizar que sean correctas; elegir una emite `option_choice` (1 tercio).
- **Fallback automático a texto** (sin perder la escena): presupuesto de voz agotado, corte de red sin reanudación, latencia de ida y vuelta > umbral sostenido, proveedor caído, micrófono rechazado. El cliente muestra el motivo en lenguaje llano.
- Esta es también la vía "cascada" de DP-36 del GDD para modo texto con audio.

### 5.9 Instrumentación de costo desde el día 1

- **Ledger por escena** (tabla `cost_ledger`, §7.4), escrito por el servidor al cerrar cada escena y cada llamada auxiliar:
  `{sceneRunId, accountBucket, role (npcVoice|observer|textNpc|tts|moderation|summary), provider, model, audioInTokens, audioOutTokens, textInTokens, textOutTokens, ttsChars, wallSeconds, playerSpeechSeconds, npcSpeechSeconds, usd, priceTableVersion}`.
- **Tabla de precios versionada** en `apps/server/config/models.yaml` (fecha de consulta y fuente por precio); el USD se calcula al escribir y se puede recalcular.
- **Métricas derivadas** (consultas SQL, panel interno simple): US$/minuto activo de voz, US$/escena, US$/jugador activo/mes, distribución por rol (¿cuánto pesa el observador?), turnos por escena vs costo (para ver la curva cuadrática).
- **Umbrales de alerta** del negocio en configuración: ≤ US$0,03/min objetivo, alerta a US$0,05/min [Negocio §0, §7]. Superar el umbral no corta el juego; dispara alerta al operador.
- **Presupuesto de voz** (`budget/`): antes de abrir una sesión Live se verifica el saldo de la cuenta o del pool de la institución; durante la escena se descuenta por segundo de audio del jugador y del NPC; al agotarse, fallback a texto sin cortar [GDD §2.5.5]. Mensaje en lenguaje llano ("Te quedan 18 minutos de voz esta semana; el modo texto no tiene límite"), nunca ligado a pociones (DP-08 del GDD).

### 5.10 Modelos como configuración

```yaml
# apps/server/config/models.yaml  (sin claves; las claves van en variables de entorno)
roles:
  npcVoice:      { provider: gemini-live, model: "<id vigente del modelo Live>", voiceMap: npc-voices }
  observer:      { provider: gemini-text, model: "<flash vigente>", maxOutputTokens: 1024, timeoutMs: 4000 }
  textNpc:       { provider: gemini-text, model: "<flash vigente>" }
  summary:       { provider: gemini-text, model: "<flash-lite o flash vigente>" }
  lumiTts:       { provider: "<DP-A07>", voice: "<voz es-AR elegida por oído>" }
  npcLinesTts:   { provider: "<mismo motor que npcVoice si ofrece TTS con las mismas voces>" }
  moderation:    { provider: "<DP-A05>", fastFilter: blocklist+regex }
prices: { version: "2026-10-04", source: "informe de negocio §3.1", ... }
```

- Interfaces de adaptador en `providers/`: `RealtimeVoiceProvider`, `TextModelProvider`, `TtsProvider`, `ModerationProvider`. v1 implementa Gemini (Live y texto) y un TTS; la cascada con modelos abiertos o otro proveedor se agrega como adaptador sin tocar `scene-runtime`.
- Los ids de modelo "preview" cambian y se retiran con frecuencia: el servidor valida al arrancar que los modelos configurados existen (llamada de listado del proveedor) y falla claro si no.
- **Superficie del proveedor y menores (DP-A05, ligado a DP-35 del GDD):** a la fecha de mi conocimiento, los términos adicionales de la API de Gemini (vía AI Studio) restringían su uso en servicios dirigidos o de probable acceso a menores de 18, y el nivel gratuito permite usar los datos para mejorar productos. **Verificar los términos vigentes antes de cualquier piloto con menores.** Default: desarrollo y piloto de adultos sobre la API paga; antes del primer piloto con menores, migrar al canal empresarial del mismo proveedor (Vertex AI) u otro proveedor cuyos términos lo permitan, previa revisión legal. El adaptador hace que esto sea un cambio de configuración, no de arquitectura.

---

## 6. Pipeline de contenido y de assets

### 6.1 Formato y validación

- **Fuente:** YAML en `content/` (legible, admite comentarios en español para quien escribe escenas). **Compilado:** JSON en `apps/web/public/content/` (solo lo que el cliente puede ver) y en `apps/server/generated/content/` (todo, incluidos prompts y tarjetas de nivel), generado por `scripts/content/build.ts`. Nadie edita el JSON a mano.
- **Schemas:** zod en `packages/content-schema` (dan tipos TS y validación en runtime con el mismo código). Uno por tipo: `Mission`, `Scene`, `Npc`, `GlossaryEntry`, `SkillNode`, `ScaffoldLevel`, `LumiLine`, `Diorama`, `BoardTemplate`, `SafetyTopics`, `AssetRecord`.
- **Validaciones cruzadas (fallan el build):**
  1. IDs únicos y estables; formato `M<cap>.<n>`, `M<cap>.<n>-E<k>`, `NPC-<NOMBRE>`, `HAB-<RAMA>-<n>` [GDD §0.3.7]. Un ID que desaparece respecto de la versión anterior del contenido es un error salvo que esté listado en `content/retired-ids.yaml`.
  2. Toda referencia existe: NPCs de una misión, `reapariciones`, habilidades requeridas, interactuables del diorama, líneas de Lumi referenciadas, assets referenciados en el layout (y registrados en `assets-registry.yaml`).
  3. Toda escena tiene **todos** los bloques del GDD §2.5.3 (incluidos `salida_si_no_converge`, `temas_permitidos`, `resumen_para_siguiente`) y `modo_texto` equivalente.
  4. **Banda de vocabulario:** las líneas guionadas (aperturas, cierres, pistas, frases modelo) usan solo palabras de la banda MCER de la escena ∪ el glosario. Lint de tokens con una lista de palabras por banda.
  5. **Glosario curado:** toda traducción o nombre de objeto que muestra la interfaz referencia una entrada del glosario con `estado: approved` (D-067; en el build `MODE=fv` también `reviewed`, D-128). En build de release, una entrada no aprobada referenciada falla el build; en desarrollo, advierte.
  6. **Seguridad:** ninguna escena declara temas permitidos que choquen con la lista global de vedados; toda escena con NPC menor de edad (Lily, Jules) declara contexto cotidiano [GDD §3.3.3].
  7. **Sin datos personales:** lint de patrones (emails, teléfonos, URLs no permitidas) sobre todo el contenido.
- Las claves de los archivos son las del GDD (DP-A02). Ejemplo abreviado:

```yaml
# content/missions/M1.2.yaml
id: M1.2
titulo: "El perro de Lily"
capitulo: 1
mcer: "A0→A1"
can_do: "Puedo describir un animal con color y tamaño"
npcs: [NPC-LILY, NPC-SAM]
lenguaje_objetivo:
  estructuras: [STR-DESC-COLOR, STR-DESC-SIZE, STR-CONFIRM-Q]
criterios_exito:
  - id: C1
    texto_modelo: "player states at least 2 attributes among color/size/collar"
pociones:
  - { rama: describir, estructura: STR-DESC-COLOR }
reapariciones: [M1.6, M2.3]
duracion_objetivo_min: 3
escenas:
  - escena_id: M1.2-E1
    npc: NPC-LILY
    # … todos los bloques de GDD §2.5.3
```

### 6.2 Glosario curado

- `content/glossary/en.es-AR.yaml`: `{id, l2, l1: [traducciones], pos, banda, audio_l2, audio_l1, ejemplo_l2, ejemplo_l1, estado (draft|reviewed|approved, D-067), revisado_fecha, notas}`.
- Es la **única** fuente de traducciones y nombres de objetos que la interfaz muestra como verdad [GDD §2.5.7]. La IA genera conversación; nunca traducciones mostradas como verdad.
- La revisión es humana (el operador o un revisor nativo); una corrida headless puede **proponer** entradas con `estado: draft` y nunca las pasa a `reviewed` ni `approved`.
- Tocar una palabra en un subtítulo generado: si la palabra está en el glosario, se muestra la entrada; si no, se ofrece "Marcar para repasar" sin traducción inventada. (La variante "traducción del modelo etiquetada como automática" de DP-A20 **no** es el default: ver D-068, gana el registro.)

### 6.3 Audio de líneas guionadas

- `scripts/audio/pregenerate-lines.ts` (manual, necesita clave; **no corre en CI ni en corridas headless sin autorización**): recorre las líneas guionadas, genera audio con la voz asignada a cada NPC (misma voz que en Live, DP-20 del GDD; verificar que el motor de TTS del proveedor ofrezca las mismas voces) y escribe `public/audio/lines/<lineId>.<hash>.ogg` + `content/audio-lines.manifest.json`.
- El nombre lleva el hash del texto + voz: si cambia el texto, el manifiesto marca la línea como desactualizada y el build lo advierte (en release, falla).
- Mientras una línea no tenga audio, el cliente la muestra como texto + TTS en vivo (degradación aceptable en desarrollo).

### 6.4 Assets 3D (Kenney CC0 y afines)

#### 6.4.1 Flujo

```
descarga del pack (kenney.nl u otra fuente CC0)  →  assets-src/<pack>/ (gitignored)
   → registro en content/assets-registry.yaml (obligatorio antes de usar)
   → scripts/assets/optimize.ts (gltf-transform):
        prune · dedup · weld · resample animaciones · quantize · meshopt
        · texturas: unificar a atlas de paleta / WebP o KTX2 según tier · tamaño máx 1024
   → apps/web/public/models/<pack>/<pieza>.glb  (versionado en git)
   → scripts/assets/inspect-budgets.ts (triángulos, materiales, memoria de texturas, tamaño)
   → layout del diorama en content/dioramas/<barrio>.yaml lo referencia por id
```

#### 6.4.2 Registro de licencias (obligatorio, `content/assets-registry.yaml`)

`{assetId, archivo, pack, autor, licencia (CC0-1.0 | CC-BY-4.0 …), url_origen, fecha_descarga, sha256_original, modificaciones, atribucion_requerida, notas}`. El build falla si un archivo en `public/models`, `public/audio` o `public/textures` no tiene registro, o si un registro con `atribucion_requerida: true` no aparece en la pantalla de créditos generada. Los nombres exactos de los kits de Kenney y si los personajes traen rig y animaciones se verifican al descargar [GDD §5.7, DP-19].

#### 6.4.3 Layout de dioramas como datos

```yaml
# content/dioramas/plaza.yaml
id: plaza
bounds: { minX: -20, maxX: 20, minZ: -16, maxZ: 16 }
paleta: plaza            # tintes por instancia desde los tokens del GDD §5.4
props:
  - { asset: kenney-city/house-small-a, pos: [4, 0, -6], rotY: 90, scale: 1, tinte: casa-1, ventana_emisiva: W-PLAZA-01 }
  - { asset: kenney-nature/tree-round, instancias: [[-8,0,3],[-9,0,6],[-12,0,2]] }
interactuables:
  - { id: OBJ-FUENTE, asset: kenney-city/fountain, pos: [0,0,0], glosario: GL-FOUNTAIN }
npcs:
  - { id: NPC-BEN, spawn: [6, 0, -3], ruta: [[6,0,-3],[8,0,-3]] }
no_caminable: [ { poligono: [[-20,-16],[20,-16],[20,-14],[-20,-14]] } ]
camara: { punto_dialogo_por_npc: { NPC-BEN: { offset: [1.5, 1.6, 2.5] } } }
```

El compilador genera: grilla de caminabilidad, lista de instancias agrupadas por asset (para `Instances`), lista de props estáticos fusionables por material y la tabla de interactuables.

#### 6.4.4 Instancing y fusión

- Todo asset con ≥ 3 apariciones en un diorama se dibuja con instancias (una draw call).
- Props estáticos no interactivos que comparten el material toon se **fusionan** en build en pocas mallas por diorama (con tinte por vértice para conservar la paleta).
- Los interactuables quedan como mallas separadas (necesitan raycast, brillo y contorno).

#### 6.4.5 Validador de dioramas (falla el build)

Conectividad entre spawn del jugador, cada NPC e interactuable (BFS sobre la grilla); pasillos de al menos 2 celdas; presupuestos del tier `medium` (§2.7.1) estimados estáticamente: triángulos totales, draw calls estimadas (mallas fusionadas + grupos de instancias + interactuables + personajes), memoria de texturas.

#### 6.4.6 Ubicar por código sin editor

Las IA de código ubican assets escribiendo coordenadas en YAML. Para que el operador pueda corregir a ojo sin un editor: en modo desarrollo existe una superposición con la grilla (ejes y coordenadas) y un modo "click para copiar coordenadas" que pone en el portapapeles la posición del punto clickeado. No se construye un editor de niveles (DP-A16).

#### 6.4.7 Personajes y Lumi

- Personajes: el pack CC0 que traiga rig + animaciones básicas (idle, caminar, hablar, saludar, señalar, reír, pensar) [GDD §5.3, DP-19]. Diversidad por tinte de piel, pelo y ropa (tintes por material desde la paleta), no por modelos distintos, para compartir esqueleto y animaciones (menos memoria).
- Animación fuera de pantalla o lejos: se pausa el mixer; en `low` se actualiza a 15-20 Hz.
- Lumi: geometría por código (prisma de 6-8 caras + núcleo emisivo + ojos como planos emisivos con texturas de expresión) (DP-39 del GDD); es el objeto más trabajado pero también el más barato de producir.

---

## 7. Datos y backend

> Esta sección describe requisitos de diseño técnico. **No es asesoramiento legal.** El cumplimiento concreto (Argentina: Ley 25.326; Brasil: LGPD y ECA Digital, Lei 15.211/2025, vigente desde 2026-03-17; EE.UU.: COPPA si se entra) requiere revisión legal antes del primer piloto con menores [GDD §2.17].

### 7.1 Forma del backend

**Un solo proceso Node** (`apps/server`) que sirve: el build estático, la API REST, el WebSocket de escenas y los trabajos programados (retención). Una sola base Postgres administrada. Sin colas, sin microservicios, sin Redis en v1 (C13).

| Opción de hosting | Pro | Contra |
|---|---|---|
| **Contenedor en Cloud Run, región São Paulo (default DP-A03)** | WebSockets soportados con timeout de solicitud configurable (las escenas duran ≤ 5 min); escala a cero; mismo proveedor que la vía empresarial de Gemini (DP-A05); región cercana a Argentina | Arranque en frío (mitigar con 1 instancia mínima durante pilotos); sesiones WS atadas a una instancia |
| Fly.io / Railway | Simple, WS nativo | Otro proveedor más; región sudamericana a verificar |
| VPS propio | Control total, costo fijo | Operación (parches, TLS, backups) a cargo de un equipo de 1-2 |

**Escala esperada sin datos (supuesto):** piloto de cientos de alumnos, picos de una o dos aulas simultáneas (≤ 60 sesiones de voz). Un proceso aguanta eso; el cuello es el proveedor de voz, no el servidor. Si se pasa a miles de concurrentes, se revisa (afinidad de WS, varias instancias, un store compartido para presupuestos).

### 7.2 Cuentas, roles y menores

| Rol | Alta | Login | Datos que se piden |
|---|---|---|---|
| Jugador adulto (18+) | Directo | Enlace mágico por email (DP-A09) | Email, nombre de juego, banda de edad declarada |
| Jugador menor | **Solo** vía código de clase (docente) o invitación de tutor | Código de clase + tarjeta de acceso (DP-A08: imagen + palabra, sin email) | Nombre de juego (de lista de sugerencias), banda de edad. **Nada más** |
| Tutor/a | Invitado por el flujo de menor o por la institución | Enlace mágico | Email del tutor, consentimiento registrado |
| Docente | Invitado por admin institucional | Enlace mágico | Email institucional |
| Admin institucional | Alta manual por el operador en v1 | Enlace mágico | Email institucional |

- **Age gate** (DP-12 del GDD): cuentas directas solo 18+; un menor sin código de clase ni tutor entra al flujo de tutor [GDD §2.14].
- **Consentimiento:** tabla `consents` con `{subjectAccountId, grantorRole (guardian|institution), grantorAccountId, scope (voice_processing, transcripts_30d, experiments, safety_alerts), version del texto, at, revokedAt}`. La voz no se procesa para un menor sin consentimiento vigente con scope `voice_processing`: el juego funciona en modo texto.
- **Control del tutor:** ver progreso, ver qué se guarda, exportar, borrar la cuenta, limitar minutos de voz o forzar modo texto [GDD §2.17.2].
- **Sesiones:** cookie `httpOnly`, `Secure`, `SameSite=Lax`, rotación; sin tokens en `localStorage`.

### 7.3 Minimización de datos (implementación de GDD §2.13 y DP-13)

| Dato | Se guarda | Retención | Notas técnicas |
|---|---|---|---|
| Audio crudo | **Nunca** | — | Pasa por memoria del servidor hacia el proveedor y se descarta; ningún buffer se escribe a disco ni a logs |
| Transcripciones de escenas | Sí, cifradas en reposo (cifrado de la base) | **30 días** y borrado por job | Visibles solo para el jugador (y su tutor); docente nunca ve crudas de menores (DP-29 del GDD) |
| Ítems extraídos (banco de repaso, patrones de error, evidencia) | Sí | Vida de la cuenta | Sin texto libre del jugador más allá del `quote` mínimo de la evidencia; el `quote` pasa por el depurador de datos personales |
| Resumen entre escenas | Sí | Vida de la escena siguiente + 30 días | Depurado: el observador marca `personalDataDetected`; un filtro determinístico (patrones) y el modelo eliminan nombres reales, escuelas, direcciones, teléfonos |
| Telemetría | Sí, seudónima | 13 meses (DP-A14) | Id de cuenta seudónimo en la tabla de eventos; sin IP almacenada; sin fingerprinting; sin SDKs de terceros |
| Logs del servidor | Solo metadatos | 30 días | Prohibido loguear audio, transcripciones, prompts con perfil, emails (lint de logs + revisión) |

**Transferencias internacionales:** el procesamiento de voz ocurre en el proveedor de IA, fuera de Argentina y Brasil. Ley 25.326 y LGPD regulan transferencias internacionales; la elección de proveedor, región y contrato (DP-A05) entra en la revisión legal.

### 7.4 Persistencia (modelo de datos a nivel de concepto)

```
institutions ─< classes ─< enrollments >─ accounts ─< consents
      │            │                         │
      │            └─< assignments (misión/capítulo, semana)
      └─< voice_pools ─< voice_allocations (por clase o alumno)

accounts ─< saves (snapshot versionado: settings, world, player)  [1 fila vigente + historial corto]
accounts ─< evidence_events (append-only)  → vista materializada progress_by_account
accounts ─< review_items (Leitner)          accounts ─< error_patterns
accounts ─< scene_runs ─< transcripts (TTL 30 días)
scene_runs ─< cost_ledger
accounts ─< experiment_assignments
safety_events (scene_run, tipo, severidad, acción, visibilidad según política)
engagement_events · learning_events (§7.6)
```

- **Migraciones SQL escritas a mano**, numeradas, aplicadas por un script propio que verifica el resultado contra `information_schema` (no confiar en el "éxito" de una herramienta de migración sin verificar). Consultas con un cliente Postgres liviano; sin ORM en v1 (DP-A04 incluye el proveedor de Postgres).
- **Guardado:** el cliente guarda al terminar cada escena y al cerrar la pestaña [GDD §2.2.2]: (1) `saves` con `schemaVersion` y migraciones en `packages/core/save`; (2) el progreso no se "guarda": lo emite el servidor como eventos. Copia local en IndexedDB para la parte que funciona sin red (3D, cuaderno) [GDD §2.20]; al reconectar, se fusiona (settings: último escrito gana con marca de tiempo; eventos: unión por id).
- **Reportes docentes:** consultas sobre `progress_by_account` agregadas por clase y can-do; nunca exponen transcripciones de menores.

### 7.5 Instituciones y clases (concepto)

- Institución → admins, docentes, pool de minutos de voz por período, política de alertas de seguridad (qué ve quién).
- Clase → código corto de 6 caracteres sin ambigüedad visual (sin 0/O, 1/I), roster por CSV con nombres de juego generados, tarjetas de acceso imprimibles, asignaciones semanales, "modo aula" (pulsar para hablar por defecto, volumen de NPC acotado) [GDD §2.18].
- El panel docente es una entrada aparte (`docente.html`) que solo habla con la API REST; no carga three.js.

### 7.6 Telemetría: aprendizaje separado de engagement

| Flujo | Eventos | Uso |
|---|---|---|
| **Aprendizaje** (`learning_events` + `evidence_events`) | evidencia (ya descripta), resultado de criterios por escena, autocorrección tras señal, recuperación de ítems por intervalo, resultados de la tarea de evaluación (NPC visitante sin pistas) [GDD §6.1] | Reportes, A/B, métricas de resultado |
| **Engagement** (`engagement_events`) | `session_start {trigger: "free"|"reminder"|"teacher_assignment", pendingReward: false}` (para **libre elección**, métrica norte [GDD §6.2]), `scene_start/end`, uso de accesibilidad (más despacio, silencio, texto, pistas), abandono de escena, tier gráfico, fallback a texto y motivo | Retención por cohorte, accesibilidad, salud técnica |
| **Costo** (`cost_ledger`) | §5.9 | Unit economics |
| **Calidad** | botón "algo está mal" (traducción, reconocimiento), rechazos de schema del observador, cortes de moderación | Confianza en el contenido y en la IA |

- Asignación de brazos A/B por cuenta, determinística (hash de id de cuenta + id de experimento) y registrada; ningún brazo quita accesibilidad; en menores requiere aprobación de institución y tutor [GDD §6.3].
- Sin analítica de terceros (DP-A14): todo a Postgres por un endpoint propio con lotes; un panel interno básico de consultas.

### 7.7 Capa de seguridad y moderación de la salida del modelo (resuelve DP-37 del GDD)

Defensa en capas; ninguna sola alcanza.

1. **Marco de escena** (prompt): temas permitidos, vedados globales, nunca pedir datos personales, notas `[DIRECTOR]` nunca verbalizadas, contención si aparece riesgo. Ajustes de seguridad del proveedor en el nivel más estricto para cuentas de menores.
2. **Entrada (lo que dice el jugador):** la transcripción pasa por el filtro rápido (léxico por idioma + patrones) y, en paralelo, por el clasificador. **Límite honesto:** el audio del jugador ya llegó al modelo de voz cuando se transcribe; la moderación de entrada no puede impedir que el modelo lo "escuche", pero sí (a) inyectar una nota de dirección para reconducir, (b) activar la contención o (c) cerrar la escena. En modo texto se bloquea antes de llegar al modelo.
3. **Salida (lo que dice el NPC) en voz:** `outputTranscription` se escanea con el filtro rápido de forma síncrona y con el clasificador por oración. El servidor aplica **retención de audio (holdback)**: reenvía el audio del NPC con un retraso fijo (default 500 ms para cuentas de menores, 0-200 ms para adultos; configurable) para que la transcripción tenga tiempo de llegar y ser filtrada. Si dispara: deja de reenviar audio, envía `npc.interrupt` (el cliente vacía la cola), descarta el resto del turno y reproduce una línea segura guionada del NPC ("Hmm, let's get back to the dog!"); registra `safety_event`.
   - **Riesgo residual aceptado y documentado:** si la transcripción llega más tarde que el holdback, un fragmento corto de audio puede sonar antes del corte. Se mide la latencia real de la transcripción en la sonda (#1) y se ajusta el holdback. Si el riesgo residual medido no es aceptable para menores, la alternativa es la cascada (texto → moderación → TTS) para cuentas de menores, con su latencia mayor.
4. **Salida en texto:** moderación síncrona completa antes de mostrar.
5. **Contención (DP-38 del GDD):** ante `safety: "risk"`, la escena pasa a `containment`: línea guionada fuera de la ficción, recurso de ayuda local de una lista curada por país, `safety_event` con visibilidad según la política de la institución o del tutor. El protocolo y los textos los revisan especialistas antes del piloto.
6. **Datos personales:** si el jugador los da, el NPC no los repite (instrucción) y el observador los elimina del resumen; el `quote` de evidencia se depura.
7. **Auditoría:** muestreo de escenas (transcripciones de adultos con consentimiento, o sintéticas) para revisar calidad y seguridad; nunca transcripciones de menores sin la política acordada.

### 7.8 Seguridad de la aplicación (mínimos)

Claves solo en el servidor; CSP estricta (sin scripts de terceros, `connect-src` solo a la API propia); validación zod de todo mensaje WS y REST; límites de tasa por cuenta y por IP en la API y en apertura de escenas; tamaño máximo de marco de audio; los logs pasan por un redactor (lista de campos prohibidos) y hay un test que falla si un logger recibe campos marcados como sensibles; dependencias con lockfile y auditoría en CI.

---

## 8. Estrategia de pruebas compatible con corridas headless

**Regla del operador:** nada de Playwright ni navegador automatizado. La UI se verifica con `vitest` + `tsc` + `lint`; el operador revisa en el navegador. Todas las pruebas automáticas corren sin GPU, sin micrófono, sin red y sin claves.

### 8.1 Pirámide

| Nivel | Qué cubre | Herramienta | Determinismo |
|---|---|---|---|
| Núcleo (la mayor parte) | Movimiento (A*, colisión, paso fijo), máquina de escena (todas las transiciones e invariantes de §3.5.1), política del compañero (densidad, escalera, modos, brazos A/B), plegado de evidencia (tercios, vertido, desbloqueos), Leitner (intervalos, zona horaria), andamiaje (subidas y bajadas), migraciones de guardado, asignación de experimentos | vitest | Reloj y RNG inyectados; sin `Date.now()` ni `Math.random()` |
| Contenido | Todos los schemas, referencias cruzadas, banda de vocabulario, glosario revisado, seguridad, datos personales, validador de dioramas, registro de assets | `npm run validate:content` (vitest + script) | Total |
| Store | Cada acción: llama al núcleo, no muta la entrada, selectores devuelven lo esperado; flujo completo "interact → scene.end → progreso" con mensajes de servidor simulados | vitest | Total |
| Protocolo | Schemas de mensajes, framing binario de audio (ida y vuelta) | vitest | Total |
| Servidor | `scene-runtime` contra un **servidor Live falso** en proceso que reproduce guiones de eventos (transcripciones, audio sintético, `turnComplete`, `goAway`, cortes); observer contra **respuestas grabadas** (incluidas truncadas e inválidas); moderación (holdback y corte); presupuesto (agotamiento a mitad de escena → texto); ledger de costo (cálculo con tabla de precios); retención (job de borrado); redactor de logs | vitest | Sin red; los proveedores son fakes |
| Contrato del observador | "Golden files": entradas de turno → `ObserverResult` esperado de los fakes; verifica que las reglas determinísticas (normalización de claves, descarte de disfluencias) dan lo mismo siempre | vitest | Total |
| UI DOM | Componentes del HUD, diálogo, cuaderno, ajustes, onboarding, panel docente: render con estado de store sembrado, roles y nombres accesibles, navegación por teclado (eventos simulados), `aria-live` en subtítulos, ningún texto hardcodeado fuera de i18n | vitest + Testing Library + jsdom | Total |
| Mundo 3D | Componentes R3F: que un diorama monte las instancias esperadas, que `Npc` cambie de animación según `dialogue.state`, que la cámara de diálogo elija el encuadre del contenido | vitest + `@react-three/test-renderer` (sin WebGL) | Total |
| Presupuestos | Bundle (§2.7.3), assets (§6.4.5), conteo de luces dinámicas por tier | scripts en CI | Total |
| Tipos y límites | `tsc --noEmit` en todo el monorepo; ESLint con límites de módulos y reglas de logs | tsc, eslint | Total |

### 8.2 Lo que NO se automatiza (y quién lo revisa)

- Cómo se ve y se siente (estética, cámara, rendimiento real en la PC objetivo): **el operador en el navegador**, con una lista de verificación por hito escrita por la corrida en su reporte (qué mirar, en qué orden, qué esperar).
- Calidad real de la voz, latencia, naturalidad del modo lento, voces elegidas: el operador, por oído.
- **Evaluación con modelos reales** (`npm run eval:live`): suite opcional, **nunca** en el `test` por defecto, solo con autorización explícita y clave del operador, con tope de gasto configurado; corre escenas con jugadores sintéticos (texto) y mide convergencia, respeto del marco y calidad del observador. Las corridas headless no la ejecutan por su cuenta.

### 8.3 Gates (scripts raíz)

```
npm run typecheck          # tsc en todos los workspaces
npm run lint               # incluye límites de módulos y reglas de logs
npm test                   # vitest en todos los workspaces (sin red, sin claves)
npm run validate:content   # schemas, referencias, vocabulario, glosario, seguridad, dioramas, registro
npm run check:budgets      # bundle + assets
npm run build              # vite build (web + docente) + tsc del server + content build
npm run verify             # todo lo anterior en orden; es el gate de cada fase
```

Una fase de una corrida headless está terminada cuando `npm run verify` pasa y el reporte incluye la lista de verificación manual para el operador. Un gate rojo no se "arregla" bajando el umbral sin un DP explícito.

---

## 9. Secuencia técnica de construcción y gates

Orden por dependencias técnicas (el roadmap de producto decide calendario y contenido). Cada paso termina con `npm run verify` verde.

| # | Paso | Entrega | Depende de |
|---|---|---|---|
| T0 | Bootstrap | Monorepo, TS estricto, ESLint con límites, vitest, scripts de gates vacíos, `.env.example`, README | — |
| T1 | Núcleo base | `runtime` (Clock/Rng), `save` con versión, `experiments`, `movement` (grilla, A*, colisión) con tests | T0 |
| T2 | Contenido mínimo | Schemas zod de todos los tipos, compilador, validaciones; contenido del prólogo (M0.1-M0.3) y diorama Muelle | T0 |
| T3 | Shell DOM + store | Slices, selectores, onboarding sin 3D, ajustes de accesibilidad, i18n es-AR, `dialog-only` | T1, T2 |
| T4 | Mundo 3D mínimo | Canvas diferido, `ToonMaterial`, Diorama desde layout, Player con click y WASD, cámara asistida, tiers y detección | T3 |
| T5 | Pipeline de assets | `optimize.ts`, registro, `inspect-budgets`, primeros packs en Muelle y Plaza | T2, T4 |
| T6 | Máquina de escena + modo texto | `core/scene`, `scene-runtime` con modelo de texto (fake en tests), moderación de texto, HUD de diálogo completo con barra de andamiaje y menú de silencio | T3, T2 |
| T7 | Voz | Gateway WS portado de LT (sin `setup` del cliente), worklets de captura/VAD/reproducción con time-stretch, turnos manuales, fallback a texto, ledger de costo y presupuesto | T6 |
| T8 | Observador + Lumi | Observer con schema, `decideCompanion`, señales, anotar, destilado, evocación, Lumi 3D y burbujas | T6 (texto) y T7 (voz) |
| T9 | Progresión y repaso | Eventos de evidencia, pociones, árbol, Leitner, andamiaje adaptativo, cuaderno | T8 |
| T10 | Cuentas y datos | Postgres, migraciones, auth (adulto, clase, tutor), consentimientos, guardado, retención | T3 (puede empezar en paralelo desde T1) |
| T11 | Institucional mínimo | Panel docente, clases, códigos, asignaciones, reportes por can-do, pools de voz | T9, T10 |
| T12 | Vertical slice (DP-10 del GDD) | Prólogo + Cap. 1 completos con audio pre-generado; lista de verificación manual del operador | todo lo anterior |

**Mapeo con las fases de la propuesta de terceros:** "Setup" = T0-T3; "Movimiento y Cámara" = T4-T5; "Sistema de Diálogos DOM" = T6-T8; "Grid y Construcción" y "Loop económico" **no existen en el modo 1** (DP-15 del GDD) y se reemplazan por "Loop de habla y pociones" = T8-T9.

**Experimentos que deben correr antes de cerrar decisiones** (no bloquean T0-T6): sonda de costo #1 en el arnés de LT (decide DP-36 y calibra holdback y preservación de errores), benchmark de hardware #5 con la escena de T4 (calibra §2.7), medición de ancho de banda en una escuela (DP-A06).

---

## 10. Riesgos

| # | Riesgo | Probabilidad / impacto | Señal temprana | Mitigación en la arquitectura |
|---|---|---|---|---|
| R1 | **Términos del proveedor de IA vs menores:** la API de Gemini vía AI Studio podría no permitir servicios de probable acceso por menores; además, datos del nivel gratuito usados para entrenamiento | Media / muy alto (bloquea pilotos escolares) | Lectura de términos vigentes | Adaptadores de proveedor; default de adultos en API paga y migración a canal empresarial o a otro proveedor antes de menores (DP-A05); revisión legal |
| R2 | **La transcripción normaliza errores** del jugador o falla con acento rioplatense → el observador no ve errores o ve falsos | Alta / alto (el compañero pierde autoridad) | Tasa de preservación de errores sembrados en la sonda | Medición antes de prometer correcciones; observador con audio si hace falta (DP-A15); pronunciación fuera del alcance (DP-27 del GDD) |
| R3 | **Ancho de banda de aula** compartido no sostiene 25 voces simultáneas | Media / alto en escuelas | Medición en una escuela | Binario, subida solo con habla, modo aula; Opus si hace falta (DP-A06); fallback a texto automático |
| R4 | **Rendimiento en PCs escolares** peor que lo supuesto | Media / alto | Benchmark #5 | Tiers, `dialog-only`, presupuestos verificados en CI, 30 FPS en conversación |
| R5 | **Costo de voz** por encima del umbral (silencio facturado, re-facturación de contexto, observador caro) | Media / muy alto (modelo de negocio) | Ledger desde el día 1 | Escenas cortas, contexto mínimo, sin silencio transmitido, `Repetir` sin costo, modo texto, alertas |
| R6 | **Modelos "preview" retirados** o con cambios de API | Alta / medio | Fallo de validación al arrancar | Modelos en configuración, validación al arranque, adaptadores, fakes que congelan el contrato |
| R7 | **Moderación de voz con latencia**: un fragmento inapropiado suena antes del corte | Baja-media / muy alto con menores | Latencia de transcripción medida | Capas de defensa, holdback, línea segura, cascada para menores si el riesgo residual no es aceptable |
| R8 | **Assets heterogéneos**: packs de estilos distintos, personajes sin animaciones útiles | Alta / medio | Primera integración (T5) | Paleta por tinte, material único, un pack principal por categoría, DP-19 del GDD |
| R9 | **Voz de Lumi en rioplatense** de baja calidad o con acento equivocado | Media / medio | Prueba de escucha | DP-A07: elegir por oído; líneas fijas pre-generadas; Lumi en texto si no hay voz aceptable |
| R10 | **Deriva de las corridas headless** (imports cruzados, texto hardcodeado, economía en el modo 1, APIs inventadas) | Alta / medio | Lint y validadores | Límites por lint, gates, contenido validado, "no asumir APIs de memoria", desvíos reportados |
| R11 | **Captura de audio variable** entre navegadores (tasa de muestreo ignorada, cancelación de eco con parlantes) | Media / medio | Pruebas manuales del operador en Chrome/Edge/Firefox | Resample propio en el worklet, VAD silenciado mientras habla el NPC, pulsar para hablar en aula |
| R12 | **Pérdida de contexto WebGL** en GPUs débiles | Media / bajo | Eventos en telemetría | Paso a `dialog-only` sin perder la escena |
| R13 | **Timbre distinto** entre líneas pre-generadas y voz en vivo | Media / bajo-medio | Escucha del operador | Mismo motor y misma voz cuando exista; si no, aperturas y cierres también por Live con texto fijo inyectado (más costo) |
| R14 | **Divergencia con LT** tras portar | Alta / bajo | — | Notas de procedencia en el código; LT queda como laboratorio y no se sincroniza automáticamente |

---

## 11. ADRs (registro de decisiones de arquitectura)

Estado: **Propuesto** = decisión de la revisión de arquitectura que el operador valida; vale como contrato para corridas headless hasta que el operador la cambie. Cada ADR vive en `docs/adr/ADR-NNN-<slug>.md` (F1.1 copia ADR-001…021); los ADR nuevos que propongan corridas futuras toman el siguiente número con el mismo formato.

| ADR | Decisión | Alternativas descartadas | Qué se resigna | Estado |
|---|---|---|---|---|
| ADR-001 | Vite + React + TS; R3F + drei sobre three.js con disciplina de render (§2.2-2.3) | Next.js, Babylon, PlayCanvas, Godot/Unity web, 2D como render principal | SSR; algo de overhead de React | Propuesto |
| ADR-002 | Sin motor de física en el modo 1: grilla de caminabilidad + A* + colisión círculo-celda en el núcleo; Rapier solo como chunk opcional para la bicicleta (resuelve DP-14) | Rapier, cannon-es, BVH contra malla | Juguete físico estilo Bruno Simon en v1 | Propuesto |
| ADR-003 | Store único Zustand por slices + núcleo TS puro; 3D y DOM solo por el store; límites por lint (§3, §4.3) | Redux Toolkit, Jotai, XState como store | Inmutabilidad automática | Propuesto |
| ADR-004 | Progreso como plegado de eventos de evidencia emitidos por el servidor; pociones en tercios enteros (§3.5.3) | Saldos mutables en la cuenta | Simplicidad inicial; requiere vista materializada | Propuesto |
| ADR-005 | Portar módulos de un prototipo de voz anterior a un gateway propio que arma el `setup` en el servidor; sin tokens efímeros en v1; LT queda como laboratorio (§5.2-5.3) | Usar LT como servicio; paquete compartido; tokens efímeros directos | Latencia mínima posible; un solo código de voz | Propuesto |
| ADR-006 | Una sesión de voz por escena, contexto mínimo, aperturas y cierres guionados fuera de Live, tope 5 min en el servidor (§5.4) | Sesión larga con compresión de contexto | Continuidad conversacional larga | Propuesto |
| ADR-007 | Turnos por actividad manual desde el cliente + VAD local + botón `Terminé`; audio solo durante el habla (resuelve DP-06) | VAD automático del proveedor con umbral largo; solo botón | Simplicidad del VAD del proveedor | Propuesto |
| ADR-008 | Observador de texto separado del NPC + política del compañero determinística en el núcleo, ejecutada en el servidor; líneas de Lumi por plantillas (§5.6, §3.5.2) | Que el NPC corrija; que un LLM decida las intervenciones; Lumi generada libremente | Espontaneidad de Lumi | Propuesto |
| ADR-009 | Contenido en YAML con claves del GDD, schemas zod, compilado a JSON, validaciones cruzadas como gate (§6.1) | JSON a mano, TS como contenido, CMS | Ergonomía de un editor visual | Propuesto |
| ADR-010 | Pipeline glTF con gltf-transform y meshopt, registro de licencias obligatorio, instancias y fusión en build, layout como datos (§6.4) | Draco, assets sin registro, editor de niveles | Edición visual de niveles | Propuesto |
| ADR-011 | Toon material único con rampa de 2-3 bandas; contornos por casco invertido solo en personajes e interactivos; sin postprocesado en v1 (§2.8) | Contorno por postproceso; materiales PBR | Contornos perfectos en todo | Propuesto |
| ADR-012 | Tiers `low/medium/high/dialog-only` con detección propia y degradación en caliente; 30 FPS en conversación (§2.7) | Un solo nivel de calidad; base de datos de GPUs de terceros | Máxima fidelidad automática | Propuesto |
| ADR-013 | Monorepo con npm workspaces (`apps/web`, `apps/server`, `packages/core`, `packages/content-schema`, `packages/protocol`) (§4) | Paquete único; pnpm + turborepo | Simplicidad de un solo `package.json` | Propuesto |
| ADR-014 | Un proceso Node (estático + API + WS + jobs) y Postgres administrado con migraciones SQL a mano verificadas; auth propia con login de clase para menores (§7) | Supabase Auth (exige email), Firebase, archivos JSON (como LT) | Auth gestionada por terceros | Propuesto |
| ADR-015 | Moderación en capas con holdback de audio y corte en voz; síncrona en texto (resuelve DP-37) | Solo prompt; retrasar todo el audio hasta moderar cada oración | Latencia cero en cuentas de menores | Propuesto |
| ADR-016 | Pruebas sin navegador: vitest (+ jsdom y test-renderer de R3F), tsc, lint, validadores y presupuestos; evaluación con modelos reales solo manual (§8) | Playwright/E2E de navegador (prohibido por el operador) | Detección automática de regresiones visuales | Propuesto |
| ADR-017 | Audio en marcos binarios por WS, worklets fuera del hilo principal; Opus solo si la medición lo exige (§5.5.5) | base64 en JSON (LT); Opus desde el día 1; WebRTC | Mínimo ancho de banda posible en v1 | Propuesto |
| ADR-018 | Modelos y precios en configuración con adaptadores por rol; validación al arranque (§5.10) | Ids de modelo en código | — | Propuesto |
| ADR-019 | i18n con helper propio mínimo (`Intl.PluralRules`) sobre JSON por locale | i18next/FormatJS | Funciones avanzadas de formato | Propuesto |
| ADR-020 | Repaso con Leitner de 6 cajas e intervalos del GDD (§3.5.4) | SM-2, FSRS | Ajuste fino por ítem | Propuesto |
| ADR-021 | Máquinas de estado como tablas de transición puras en el núcleo, sin XState (§3.5) | XState | Visualizador y herramientas de XState | Propuesto |

---

## 12. Decisiones pendientes (DP)

### 12.1 DP del GDD que son de arquitectura: recomendación de la revisión de arquitectura

| DP del GDD | Recomendación (default para corridas headless) | Dónde |
|---|---|---|
| DP-06 Fin de turno | Actividad manual desde el cliente + VAD local con umbral 3 s configurable (2,5-4 s o "solo botón") + botón `Terminé`; pulsar para hablar como opción y default en modo aula; audio solo durante el habla | §5.5.2, ADR-007 |
| DP-07 Técnica de "más despacio" | Instrucción al modelo por nivel + time-stretch OLA sin cambio de tono en el cliente (1,0 / 0,85 / 0,7); parámetro nativo de velocidad si la versión vigente lo ofrece | §5.5.4 |
| DP-14 Física | No en el modo 1; controlador cinemático en el núcleo | §2.4, ADR-002 |
| DP-36 Vía principal de voz | **Interino:** Live para escenas de voz, modelo de texto para modo texto (cascada con TTS cuando el jugador pide audio). Decide la sonda #1; el cambio es de configuración gracias a los adaptadores | §5.8, §5.10 |
| DP-37 Moderación de salida en voz | Capas + holdback de audio (500 ms menores, 0-200 ms adultos) + corte y línea segura; cascada para menores si el riesgo residual medido no es aceptable | §7.7, ADR-015 |

### 12.2 DP nuevas de arquitectura (el operador decide; default para corridas headless)

| ID | Decisión | Opciones | Default recomendado | Por qué | Afecta |
|---|---|---|---|---|---|
| DP-A01 | Forma del repo | Paquete único / npm workspaces / pnpm + turborepo | **npm workspaces** sin orquestador | Tipos y reglas compartidos entre web, server y scripts con lo mínimo | §4 |
| DP-A02 | Idioma de las claves de los archivos de contenido | Español del GDD / inglés con tabla de correspondencia | **Claves del GDD en español snake_case** | Las corridas que escriben contenido leen el GDD; cero traducción de campos | §4.4, §6.1 |
| DP-A03 | Hosting del servidor | Cloud Run São Paulo / Fly.io / Railway / VPS | **Cloud Run en São Paulo**, 1 instancia mínima en pilotos; el mismo contenedor sirve el estático | WS soportado, escala a cero, cerca de Argentina, mismo proveedor que la vía empresarial de IA | §7.1 |
| DP-A04 | Postgres administrado | Neon / Supabase (solo como Postgres) / Cloud SQL | **Postgres administrado en región São Paulo; Neon por defecto** (ramas de base útiles para corridas headless) | Postgres plano, sin depender de la auth del proveedor | §7.4 |
| DP-A05 | Superficie del proveedor de IA para menores | API de Gemini (AI Studio) / Vertex AI / otro proveedor | **Adultos: API paga. Antes de cualquier piloto con menores: canal empresarial (Vertex AI) u otro proveedor con términos que lo permitan, tras revisión legal** | R1; ligado a DP-35 del GDD | §5.10, §7 |
| DP-A06 | Formato de audio en el cable y VAD | PCM binario / Opus / WebRTC; VAD por energía / VAD neuronal | **PCM binario + subida solo durante el habla + VAD por energía**; Opus y VAD neuronal solo si la medición en una escuela lo exige | Menos piezas hasta tener datos | §5.5 |
| DP-A07 | Voz de Lumi en L1 (rioplatense) | TTS del mismo proveedor / otro TTS con voces es-AR o es-419 / solo texto | **Prueba de escucha de 3 candidatos; el operador elige por oído**; mientras tanto, Lumi en texto + la mejor voz es-419 disponible | La voz de Lumi es identidad del producto y no se puede decidir sin escuchar | §5.6 |
| DP-A08 | Login de menores | Código de clase + tarjeta de imagen y palabra / código + PIN numérico | **Código de clase + tarjeta (imagen + palabra)**, reseteable por el docente | Baja carga de lectura, sin email | §7.2 |
| DP-A09 | Login de adultos | Enlace mágico / OAuth de Google / ambos | **Enlace mágico por email** | Minimización; sin dependencia de un proveedor de identidad | §7.2 |
| DP-A10 | Packs crudos en git | Versionar crudos / ignorarlos y registrar URL + hash | **Crudos fuera de git (`assets-src/` ignorado); se versionan solo los GLB optimizados**; el registro guarda URL y sha256 para re-descargar | Repo liviano; CC0 no exige conservar el original | §6.4 |
| DP-A11 | Compresión de mallas | meshopt / Draco / ninguna | **meshopt** con decodificador autoalojado | Decodificador chico y rápido en CPUs débiles | §6.4.1 |
| DP-A12 | Quién genera el audio de líneas guionadas | Script manual del operador / CI con clave / en vivo siempre | **Script manual del operador; salida versionada en git** | Las claves no entran a CI ni a corridas headless | §6.3 |
| DP-A13 | Panel docente | Entrada aparte en la misma app / app separada / dentro del juego | **Entrada aparte (`docente.html`) en `apps/web`**, sin three.js | Un build, bundles separados | §7.5 |
| DP-A14 | Analítica | Propia en Postgres / SaaS de analítica | **Propia en Postgres**, retención 13 meses | Menores; sin trackers de terceros | §7.6 |
| DP-A15 | Observador con audio si la transcripción oculta errores | Solo texto / texto + audio del turno | **Medir primero; si la transcripción preserva menos del 80% de errores sembrados, agregar audio del turno del jugador al observador** | R2; cuesta más, decide con números | §5.7 |
| DP-A16 | Herramienta para ubicar assets | Solo YAML / superposición de grilla en dev / editor de niveles | **YAML + superposición de grilla y "click para copiar coordenadas" en desarrollo**; sin editor | Menos piezas; el operador corrige a ojo | §6.4.6 |
| DP-A17 | Máquinas de estado | Tablas propias / XState | **Tablas de transición propias en el núcleo** | Cero dependencias; testeables | §3.5, ADR-021 |
| DP-A18 | Retención de audio (holdback) por banda de edad | Valores | **500 ms menores, 150 ms adultos**, ajustables tras medir la latencia de transcripción | Seguridad vs latencia | §7.7 |
| DP-A19 | Modelo de voz en tiempo real inicial | El que usa LT hoy / otro | **El modelo Live que usa LT hoy**, si sigue disponible al bootstrap; si no, el sucesor documentado | Reusa lo medido | §5.10 |
| DP-A20 | Traducción de palabras fuera del glosario | Ninguna (solo "marcar") / traducción del modelo etiquetada como automática | **Solo "marcar para repasar" en v1**; sin traducciones del modelo en la interfaz | Confianza: lección de Terra Alia [Referencias §4.2.2] | §6.2 |
| DP-A21 | Umbral de "error sistemático" | Conteo y ventana | **≥ 3 apariciones en 3 escenas distintas** | Separar desliz de patrón; ajustable con datos | §5.7 |

### 12.3 Sobre la propuesta de terceros (registro, no decisión de la revisión de arquitectura)

- **Adoptado como contrato:** Vite + React + TS, R3F + drei, Zustand, HUD DOM + Tailwind, 3D declarativo, "3D y DOM nunca directo; el estado es la única fuente de verdad", low-poly fluido en web, carpetas separadas por lógica / UI / 3D (§2, §3, §4).
- **Ajustado:** Rapier → no en el modo 1 (ADR-002). Mundo abierto → dioramas por barrio [GDD §1.9]. "Lógica en hooks/stores" → lógica en un núcleo TS puro; los stores son delgados (ADR-003).
- **Diferido sin adoptar ni descartar:** grid de construcción, tycoon y loop económico → **DP-15 del GDD**, decisión del operador; la arquitectura deja el lugar (§3.6) y prohíbe construirlo en el modo 1.

---

## 13. Fuentes e insumos citados

| Etiqueta | Insumo |
|---|---|
| [Brief] | (documento interno) (decisiones del operador al 2026-10-04) |
| [GDD] | `learning-game/docs/01-gdd.md` v0.1 (2026-10-05) |
| [Negocio] | (documento interno) (§3 unit economics de voz, §6 riesgos, §7 experimentos) |
| [Investigación] | (documento interno) y `20-evidencia.md` (defaults de feedback, ritmo, XP, repaso) |
| [Referencias] | (documento interno) (§4.4 implicaciones de stack) |
| [LT] | un prototipo de voz anterior: `server.js`, `server.ts`, `public/index.html` (configuración Live, audio, contabilidad), `teacher-config/prompts.json`, `teacher-config/rules.md`, `observer-knowledge-base.md`, `package.json` — leídos el 2026-10-05; no se leyó ningún archivo de secretos |

Afirmaciones técnicas sobre APIs de terceros (Gemini Live: actividad manual, transcripciones, velocidad de voz; términos de uso para menores; capacidades de drei, gltf-transform y Cloud Run) son de mi conocimiento a la fecha de corte y **deben verificarse contra la documentación vigente** en el bootstrap (regla 0.5).
