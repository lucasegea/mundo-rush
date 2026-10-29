# 03 — Arquitectura técnica objetivo

**Proyecto:** learning-game (título provisorio *Mundo Rush*, D-031) · **Documento:** arquitectura v0.3 · **Fecha:** 2026-10-06 (v0.1: 2026-10-05) · **Autor:** revisión de arquitectura (arquitecto, el entorno de desarrollo); integración v0.2: planificación
**v0.2 (2026-10-06):** integra las decisiones del operador del 2026-10-06 (`00-decisiones.md` §1.1), `07-stack-objetivo.md` (revisión de arquitectura: stack objetivo y costuras R10-R15) y los estudios de la investigación de referencias `research/voz-costo-valor-2026-10-06.md` y `research/pronunciacion-2026-10-06.md`. Secciones nuevas: §2.9 (HD-2D en R3F), §5.11 (voz híbrida), §5.12 (servicio de pronunciación); reglas R10-R15 en §3.1; ADR-022 a ADR-025. Donde v0.1 decía low-poly toon, cámara de tercera persona o "pronunciación fuera de alcance", manda lo nuevo.
**v0.3 (2026-10-06, integración planificación; la forma la revisa revisión de arquitectura):** (a) config exacta de ESLint de P0 (`docs/reports/P0-2026-10-06.md` §2.3) aplicada en §4.3-§4.3.2 (`import-x/no-restricted-paths` sobre rutas resueltas); (b) rutas canónicas nuevas de P0 §3 (raíz de composición, `state/actions.ts`, nombres `@lg/*`, persistencia del operador D-157, salida compilada fuera de git D-159, `VoiceTransport`, DSP puro); (c) **modo director** solo de desarrollo (§6.5, ADR-026; D-187, confirmado por el operador en el brief); (d) **capa de fundaciones y red visible** en el mapa (§2.9, §6.4.3, §6.4.8; D-169, D-194); (e) carpetas de contenido de `02` v0.2 (`fundaciones/`, `saberes/`, `red/`, `mystery/sobres.yaml`). Las enmiendas de "cómo" de P0 §1 rigen con el default de D-196.
**Plan estetica-c M7 (2026-10-13, construcción; D-207, D-208):** la dirección C, "Maqueta pintada" (`docs/estetica/propuesta-c-maqueta-pintada.md`, biblia de arte), reemplaza a HD-2D (D-139, D-154) en §1 (C9, C14), §2.7.1, §2.8, §2.9, §3.1 (diagrama y R11), §3.3 (fila `settings`), §4.2, §6.4, §10 (R16) y §11 (ADR-028, que reemplaza a ADR-022 y enmienda a ADR-011). El código de HD-2D (tiles por chunk, arte pixel, billboards, cámaras ortográficas) se retiró del árbol. §9 sigue contando la secuencia como se construyó.
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
| C1 | Corre en el navegador de una PC modesta (hoy la del operador, D-135; mañana la de una escuela), sin instalar nada; modo gráfico bajo obligatorio; interactivo en < 15 s en la PC objetivo | [GDD §1.3 P1, §2.14, §5.7], [Referencias §4.4.5], [Negocio §7 #5] | Presupuesto de rendimiento duro (§2.7), tiers de calidad, carga por barrio, 3D en chunk diferido, modo "solo diálogo" sin WebGL |
| C2 | El producto vende habla, no gráficos; la CPU y la red del cliente se usan para el audio en tiempo real, que compite con el render | [Referencias §4.4], [Negocio §2.1] | El audio tiene prioridad: AudioWorklet fuera del hilo principal, bajar el ritmo de render durante conversaciones (§2.7.4) |
| C3 | Costo de voz cuadrático con la duración de la sesión (el contexto se re-factura por turno); objetivo ≤ US$0,03/min activo, muerte si nada baja de US$0,05/min | [Negocio §3.2, §3.3, §7 #1] | Una sesión de voz por escena de 2-4 min (tope 5), contexto mínimo, no transmitir silencio, contabilidad de costo por minuto desde el día 1 |
| C4 | Reuso de `un prototipo de voz anterior` (Gemini Live, tope de ~15 min del lado del servidor) | [Brief] | El gateway de voz nace del código de LT (§5.2) |
| C5 | Público ATP: menores entran por institución o tutor; Argentina primero (Ley 25.326), luego Brasil (LGPD, ECA Digital vigente desde 2026-03-17) | [Brief], [GDD §2.17], [Negocio §6.5] | Minimización de datos, sin audio guardado, moderación doble, consentimiento, proveedor de IA apto para menores (§7) |
| C6 | Paga principalmente la institución; "el que paga financia al que no"; versión gratis con voz acotada y texto ilimitado | [Brief], [GDD DP-22] | Modelo institución → clase → alumno, pools de minutos de voz, modo texto de primera clase |
| C7 | El mundo 3D y la UI DOM nunca se hablan directamente; el estado es la única fuente de verdad | [GDD §1.4.8], propuesta de terceros | Store único (Zustand) + núcleo de reglas en TS puro + límites de módulos verificados por lint (§3, §4.3) |
| C8 | Modo 1 sin dinero ni economía; tycoon/construcción solo como candidata del modo 2 | [GDD §1.4.1, DP-15] | No existe slice de economía; el modo 2 se agrega como módulo nuevo sin tocar el núcleo (§3.6) |
| C9 | Las IA de código no modelan 3D a mano: packs 3D CC0 con licencia registrada, repintados a la paleta por script (D-153 releída por D-207), y props redondeados por código, ubicados por código | Directiva del operador, [GDD §5.7], D-207 | Pipeline de assets con registro de licencias, layout de dioramas como datos (§6.4) |
| C10 | Desarrollo headless en muchas corridas | Intención del operador | Contenido como datos validados por schema, núcleo determinístico testeable, gates automáticos sin navegador (§8, §9) |
| C11 | Sin Playwright ni navegador automatizado; UI = vitest + tsc + lint; el operador mira en el navegador | Regla del operador | Pirámide de pruebas sin E2E de navegador; verificación de presupuestos por scripts (§8). Excepcion acotada (fila del 2026-10-26 en `00-decisiones.md`, RATIFICADA 2026-10-27): una caminata de navegador a pedido, fuera de `verify`, que siempre cierra el navegador al terminar |
| C12 | Celular abierto, no es el arranque | [Brief], [GDD DP-31] | HUD responsive y táctil desde el día 1; nada en el núcleo depende de mouse o teclado |
| C13 | Equipo de 1-2 personas, alcance en semanas | [Negocio §6.7] | Sesgo a menos piezas: sin microservicios, sin colas, un solo servidor, una sola base |
| C14 | Arte **"Maqueta pintada"** (dirección C) decidido por el operador: 3D redondeado pintado por vértice, toon de 4 bandas con pincelada, lente largo desde arriba en diagonal y charla en plano de a dos; reemplaza a HD-2D (D-139) | D-207 (2026-10-12) | Render maqueta pintada en R3F (§2.9, ADR-028), cámara por presets, postprocesado como efecto de tier, pipeline de assets 3D repintados (§6.4) |
| C15 | Un stack que no obligue a mudarse: web hoy; app desktop, móvil y, eventualmente, VR después | D-086 / D-136 (2026-10-06), `07-stack-objetivo.md` | Costuras R10-R15 desde el día 1 (§3.1), sin construir los destinos todavía |
| C16 | La pronunciación es núcleo desde la v1, sin falsas alarmas y sin interrumpir | D-044 (2026-10-06), [Referencias pronunciación] | Servicio de pronunciación del lado del servidor detrás de interfaces (§5.12); el clip del turno lo comparten observador y pronunciación; solo tipos de error que pasan la vara de F0.1 (D-151) |

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
  - *2D (Pixi/Phaser):* más liviano, y [Negocio §0] lo recomienda para el prototipo. No lo elijo como render principal porque el operador pidió dirección estética 3D low-poly/cel-shaded (superado por D-139, HD-2D, y luego por D-207: maqueta pintada dentro de R3F, §2.9) y "nombrar objetos en contexto espacial" [Referencias §4.4] gana con 3D. **Pero** la arquitectura deja el 2D posible: el núcleo no depende del render (§3.1) y el modo "solo diálogo" (DOM con ilustración estática) existe desde el vertical slice como plan B real.

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
| Personajes animados visibles (con esqueleto, D-207; los demás quedan congelados, plan estetica-c M3) | ≤ 4 | ≤ 8 | ≤ 12 | 0 |
| Sombras | ninguna (sombras blob como quad con textura) | blob | 1 luz direccional con shadow map 1024 solo en dinámicos | — |
| Contornos (outline) | ninguno | personajes + interactivo enfocado | personajes + interactivos | — |
| Luces dinámicas | 1 hemisférica + 1 direccional | + hasta 2 puntuales | + hasta 4 puntuales | — |
| Postprocesado (D-077, §2.9) | ninguno | bloom barato (umbral alto, media resolución) | bloom + profundidad de campo tipo tilt-shift + viñeta | — |
| Memoria de texturas en GPU | ≤ 24 MB | ≤ 48 MB | ≤ 96 MB | — |
| Distancia de dibujo / niebla | corta | media | completa del diorama | — |

Reglas que valen para todos los tiers:
- **Las luces del valle (Lumi, los caminitos de bichos de luz de la red, ventanas) son materiales emisivos + sprites de halo**, no luces puntuales. En render forward cada luz puntual encarece todos los materiales iluminados; decenas de bichos de luz como luces reales hundirían el tier bajo.
- **Desaturación del progreso** [GDD §5.4]: un parámetro del color por vértice del material toon del mundo (D-207, propuesta C §5), no un pase de postprocesado.
- **Texturas (D-207):** el color del mundo va por vértice, no por textura. Las únicas texturas son la pincelada de 256 px en escala de grises y la rampa de 4 bandas del material toon (la rampa es la única con filtrado `nearest`, `world/materials/toon.ts`), y los chips de nombre y las burbujas generados por código; los glTF del pipeline entran sin texturas (§6.4.1). La memoria por tier la estima `world/budget/textures.ts` (plan estetica-c M6).
- **Tiers como contrato (R12):** se leen de un solo objeto (`apps/web/src/services/quality/quality.ts`); el tipo incluye `xr`, reservado y nunca elegido hasta la épica E-XR.

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

### 2.8 Material único del mundo: toon de 4 bandas con pincelada (resuelve el "cómo" de DP-17; D-207, ADR-028)

> **Desde D-207 (plan estetica-c M1, retiro de HD-2D en M7):** todo el mundo (terreno, props por código, modelos del pipeline, personajes) comparte una sola instancia de material toon; el agua tiene su shader propio. Reemplaza el enfoque de v0.2 (toon solo para volúmenes, personajes como sprites; D-139). ADR-028 enmienda a ADR-011. Los shaders propios quedan aislados en `world/materials` y `world/water` para portarlos a nodos (TSL) si algún día se activa WebGPU (D-144).

| Pieza | Cómo es | Ruta |
|---|---|---|
| Material toon | `MeshToonMaterial` con `vertexColors`, `gradientMap` de 4 px en luminancia 150 / 195 / 232 / 255 con filtro `nearest` y `map` = pincelada de 256 px en escala de grises generada por código con semilla fija | `apps/web/src/world/materials/toon.ts` |
| Color por vértice "pintado" | Degradé vertical (más oscuro abajo) y temblor de pincel en luminancia por posición, sobre la paleta de la propuesta C §6. El núcleo es TS puro sin three en `@lg/art`: lo usan `world/` y `scripts/assets/` (una sola implementación) | `packages/art/` · `apps/web/src/world/materials/` |
| Registro de materiales | Lista cerrada de 4 clases: `toon`, `agua`, `etiqueta`, `sombra-blob`; una quinta hace fallar el test | `apps/web/src/world/materials/registry.ts` |
| Agua | Plano con shader propio de bandas y brillos que corren, con niebla y tono incluidos; los brillos quedan quietos con "reducir movimiento" y durante la charla | `apps/web/src/world/water/` |
| Contornos | Ninguno en v1 (la propuesta C los deja fuera): el NPC al que se le va a hablar se lee por su etiqueta resaltada en ámbar | n/a |

**Regla del bisel (propuesta C §1):** ningún volumen visible tiene aristas de 90° sin bisel. Un test diedro corre sobre cada constructor `codigo/*` y sobre cada pieza que entra por el pipeline (`@lg/art`; plan estetica-c M1 y M2).

**Por qué uno solo:** una instancia de material compila un programa por variante (arranque más rápido) y, como el color va por vértice, piezas de colores distintos se fusionan en una sola malla sin perder la paleta.


### 2.9 Maqueta pintada en R3F (D-207, D-208; ADR-028)

**Qué es:** el valle como una maqueta de juguete pintada a mano: 3D de pocos polígonos pero redondeado, pintado por vértice con el material toon de §2.8, visto desde arriba en diagonal con una perspectiva de lente largo, con luz cálida, bruma y, en el tier alto, tilt-shift (biblia de arte: `docs/estetica/propuesta-c-maqueta-pintada.md` y su mockup). Reemplaza a HD-2D (D-139: sprites pixel sobre tiles con cámara ortográfica; ADR-022). Se construye **dentro del mismo stack** (R3F + drei); datos, grilla, movimiento, input y store son los de antes, y la maqueta sirve tal cual en VR (`xrTabletop`, `07-stack-objetivo.md` §3).

| Pieza | Cómo se hace | Ruta |
|---|---|---|
| **Terreno** | Malla de alturas continua con color por vértice, derivada del layout en el formato de la maqueta (§6.4.3): plana en y = 0 dentro de los límites caminables (el raycast del suelo sigue siendo el plano invisible), aplanada bajo los caminos, hundida bajo el agua con orilla, y lomas de hasta 5,5 m afuera. Se extiende 160 m más allá del diorama con celdas cada vez más grandes (D-208), así ninguna cámara de juego ve el borde | `apps/web/src/world/terrain/` · `packages/art/` |
| **Agua** | Estanques (polígonos) y ríos (curvas) bajo un solo plano con el shader de §2.8 | `apps/web/src/world/water/` |
| **Props** | Constructores por código `codigo/*` (biselados, una malla por prop, piezas fusionadas) y modelos `modelo/*` del pipeline (§6.4.1), los dos con el material toon; los repetidos como `InstancedMesh`. Detalle del suelo (flores, matas, piedritas, piedras del empedrado) instanciado | `apps/web/src/world/props/` · `apps/web/src/world/dioramas/scene.ts` |
| **Personajes** | Chibi de 2,5 a 3 cabezas: cuerpo con esqueleto del pipeline (KayKit repintado), cabeza por código, clips y gestos por una máquina de animación pura; la apariencia de cada NPC sale de su ficha de contenido (`apariencia`). Sombra blob en todos los tiers | `apps/web/src/world/actors/` |
| **Etiquetas y burbujas** | Nombre sobre la cabeza como `Sprite` de three de tamaño fijo en pantalla, textura dibujada por código; resaltado ámbar en el NPC que responde a la E (el mismo selector que el aviso del HUD); burbuja ámbar de pedido. Ocultas pasados 75 m salvo la del NPC resaltado (D-208) | `apps/web/src/world/labels/` |
| **Cámara** | `CameraRig` por presets (R11, D-053 con el lente de D-207): `perspective3D` (FOV vertical 30°, 40,5° en pantallas verticales; inclinación 50°, giro 45°; escalera de zoom de 8 pasos de 160 a 22 m con inicio en 30 m, D-208; sigue al jugador; sin órbita) y `dialogueFrame` (plano de a dos en 3/4: 20°, 12,5 m, 6 ángulos candidatos con test de oclusión). Con "reducir movimiento", corte. `xrTabletop` declarado. Sin cámaras ortográficas | `apps/web/src/world/camera/` |
| **Luz** | Sol cálido a 48° de elevación, hemisférica, niebla lineal de bruma de 34 a 78 m (escala con la distancia pasados los 30 m, D-208), ACES Filmic con exposición 1,05; sombras por tier (§2.7.1); presets por hora del día (D-051); emisivos + halos para bichos de luz y ventanas | `apps/web/src/world/lighting/` |
| **Postprocesado por tier** | En su propio chunk (`low` y `dialog-only` nunca lo descargan): `low` ninguno; `medium` bloom en emisivos; `high` bloom + tilt-shift + viñeta. Se apaga con "reducir movimiento" y durante la pérdida de contexto | `apps/web/src/world/post/` |
| **Retratos** | Del mismo modelo del juego, renderizados en el navegador del operador desde un estudio solo de desarrollo y commiteados como PNG con su registro (D-030; plan estetica-c M3); si falta, el SVG por código | `apps/web/src/world/portraits/` · `apps/web/public/portraits/` |
| **Capa de fundaciones y red visible** (F3.3; D-169, D-194; `02` §1.7-§1.9, §4.1.3) | Lo que el jugador funda hablando **aparece en el mapa**: cada `SITIO-*` tiene un ancla en el layout del diorama (`sitios:`, §6.4.3) y una ficha de fundación (`content/fundaciones/`, `02` §6.2.6) con un visual por estado (`idea` → `en_marcha` → `fundado` → `crece`). Una función pura `foundationVisuals(fundaciones, diorama)` (en `packages/core/src/world/`) traduce el estado del store (`world.fundaciones`) a la lista de props a dibujar, en el vocabulario de §6.4.3 (`codigo/*` o `modelo/*` con `rotY`, `tinte` e `instancias`; las variantes por estado son cambios de prop o de tinte); `world/foundations/FoundationLayer.tsx` solo la pinta. Igual para la **red**: `networkPaths(red, casas)` da los caminitos de bichos de luz del atardecer (uno por vínculo, `02` §1.7), muestreados con la misma curva de los caminos; y la **saturación del Cruce** por progreso (−30 % al empezar, normal al cerrar la Región 1, `02` §1.9) es un parámetro del color por vértice que sale de un selector. Nada se compra ni se acelera (D-169): el estado solo cambia por efectos de misión emitidos al cerrar escenas (§6.4.8) | `packages/core/src/world/` · `apps/web/src/world/foundations/` · `content/fundaciones/` |

**Presupuesto:** un `InstancedMesh` cuenta como 1 draw call; cada prop por código es una malla; un personaje cuenta su cuerpo, su cabeza, su etiqueta y su burbuja. El estimador estático (`world/budget/` y su copia de costos en `@lg/art`) corre dentro de `validate:content` para cada diorama y cada tier, con todo a la vista (el zoom más lejano), y falla por encima de §2.7.1 (§6.4.5; plan estetica-c M5 y M6). En desarrollo, el modo director muestra los contadores reales de `renderer.info`. **Riesgos:** "low-poly genérico" (mitigado por la regla del bisel, el repintado obligatorio y la pincelada); 25k triángulos en `low` (densidad reducida, §2.7.1); sombras PCF en `medium` y techos de DPR (preguntas abiertas del plan estetica-c, se deciden con números medidos).

---

## 3. Reglas de arquitectura, capas y estado (Zustand)

### 3.1 Capas

```
┌───────────────────────────────────────────────────────────────────────┐
│ apps/web                                                              │
│                                                                       │
│  ui/ (React DOM + Tailwind)          world/ (R3F, declarativo)         │
│  HUD, diálogo, Lumi (burbujas),      terreno, actores, Lumi (bicho),  │
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

**Costuras del día 1 (R10-R15, D-145; origen: `07-stack-objetivo.md` §5.3; ADR-025).** Cuestan interfaces y un adaptador `web`, no features; son lo que permite llegar a desktop, móvil y VR sin mudarse (C15). Todas se verifican sin navegador (lint de importación y tests).

10. **R10 — Input semántico.** `services/input/` traduce dispositivos (teclado, mouse, táctil, gamepad; después controladores XR) a **acciones**: `move(dir)`, `moveTo(cell)`, `interact()`, `talk.start/stop`, `menu.open`, `confirm`, `back`, `openNotebook`. El núcleo, el store y `world/` solo ven acciones. Lint: `addEventListener` de teclado, puntero o gamepad solo dentro de `services/input/` (los controles DOM nativos con foco siguen funcionando como siempre).
11. **R11 — Cámara por presets.** `world/camera/CameraRig` es el único que crea o mueve cámaras; recibe un preset desde datos: `perspective3D` (lente largo, default) y `dialogueFrame` (plano de a dos de la charla); más adelante `xrTabletop` (E-XR). Desde D-207 (plan estetica-c M7, revisión de arquitectura 2026-10-12) los presets ortográficos de HD-2D salieron de R11 y no hay cámaras ortográficas en el árbol (lo prueba `scripts/lint/retiro-hd2d.test.ts`). El registro del rig (`world/camera/presets.ts`) tiene exactamente las claves de `CAMERA_PRESET_IDS`. En XR la cámara la controla la cabeza y el rig mueve la maqueta. Lint: cámaras de three/drei solo dentro de `world/camera/`.
12. **R12 — Tiers de calidad como contrato.** Los tiers de §2.7.1 se leen de un solo objeto (`services/quality/quality.ts`); el tipo es `'low' | 'medium' | 'high' | 'dialog-only' | 'xr'` con `xr` reservado. Ningún componente decide calidad por su cuenta.
13. **R13 — Audio y transporte de voz detrás de interfaces.** Un solo `AudioContext`, creado en `services/audio/`; captura y reproducción en AudioWorklet (§2.7.4); el transporte de voz del cliente es la interfaz `VoiceTransport` (WebSocket hoy; lugar para WebRTC); los permisos de micrófono pasan por el adaptador de plataforma (R15). Del lado del servidor, la voz del NPC es `RealtimeVoiceProvider` con adaptadores intercambiables (§5.11).
14. **R14 — UI como vista del store.** Los componentes de `ui/` presentan view-models con nombre de `state/selectors/` (texto, orden y estados de cada pantalla) y despachan acciones; nada de lógica de estado dentro del JSX. La UI XR futura (uikit, D-143) consume los mismos view-models.
15. **R15 — Plataforma detrás de un adaptador.** `services/platform/` con la interfaz `Platform` (permisos, almacenamiento local, actualizaciones, abrir enlaces, pantalla completa) y, hoy, solo la implementación `web`; `desktop`, `mobile` y `xr` llegan con sus épicas. Lint: `@tauri-apps/*`, `@capacitor/*` y `navigator.xr` solo dentro de `services/platform/`.

### 3.2 Por qué un núcleo puro además del store

- Hace testeable sin navegador todo lo que importa (movimiento, progresión, repaso, adaptación, política del compañero, máquinas de estado): C10 y C11.
- Permite que **el servidor use las mismas reglas** que el cliente (por ejemplo, el plegado de evidencia en pociones para los reportes docentes, §3.5.3), sin duplicar lógica.
- Hace real el plan B de render: el modo `dialog-only` y un eventual render 2D son otra vista sobre el mismo store y el mismo núcleo [Referencias §4.4.5].

### 3.3 Store: slices

Un solo store (`useGameStore`) compuesto por slices. Cada slice declara su estado, sus acciones y si se persiste. Los nombres son contrato.

| Slice | Estado (campos principales) | Quién escribe (acciones) | Quién lee | Persistencia |
|---|---|---|---|---|
| `session` | fase de la app (`boot`, `onboarding`, `world`, `scene`, `notebook`, `dialogOnly`), cuenta (id opaco, rol, banda de edad, institución/clase si aplica), estado de conexión, brazos de experimentos asignados, presupuesto de voz restante (minutos), idioma de interfaz, par de idioma | servicios de auth/persistencia/voz; onboarding | todos | servidor (cuenta) |
| `settings` | accesibilidad (tamaño de texto, fuente, subtítulos, karaoke, daltonismo, contraste, reducir movimiento, volúmenes por canal, voz de Lumi on/off), entrada (pulsar para hablar, umbral de fin de turno, solo botón, mapeo de teclas), modo de feedback (`accompanied`/`flagOnly`/`moreHelp`), velocidad de NPC preferida, nivel de ayuda fijado (o automático), tier gráfico (auto/manual), cámara (solo `perspective3D` desde D-207; un valor guardado viejo cae a ese default al cargar, R11) | `ui/settings`, onboarding | todos | servidor + copia local (preferencias por dispositivo como tier gráfico solo local) |
| `world` | diorama actual y cargados, momento del día, clima guionado, nivel de luz por barrio, flags del mundo (eventos de misión: `goat_found`…), **fundaciones** (`SITIO-*` → `idea`/`en_marcha`/`fundado`/`crece`, D-169), **red** (presentaciones consumadas `intro:<NPC>` y vínculos, D-168), último punto elegido en modo inspección (`lastPick`, solo lo usa el modo director, §6.5.3), estado de NPCs (posición lógica, ruta, disponible, ícono de pedido), relación por NPC (0-5, nunca baja), interactuables cercanos, interactuable enfocado | núcleo de mundo vía acciones; `world/` despacha `interact(id)`, `moveTo(x,z)`; resultados de escenas | `world/`, `ui/` (prompt de interacción, objetivo actual, lista accesible) | servidor (flags, relaciones, luz) |
| `player` | posición lógica (celda y coordenadas de simulación), destino/camino, orientación, avatar, nombre de juego, pronombres, canasta (objetos prestados de misión) | núcleo de movimiento; onboarding | `world/`, `ui/` | servidor (avatar, nombre, pronombres, canasta); posición solo para reanudar |
| `dialogue` | escena activa (`sceneId`, `npcId`), estado de la máquina de escena (§3.5.1), sub-estado de turno, modalidad (`voice`/`text`), subtítulos (líneas finales y parcial), última línea del NPC (para `Repetir`), velocidad efectiva, menú de silencio abierto, chip de pista visible, opciones sugeridas (modo texto), progreso de criterios (para la línea de objetivo, sin revelar evaluación), motivo de fallback a texto | servicio `voice-client` (mensajes del servidor), `ui/dialogue` (botones: `Terminé`, `Pasar el turno`, `Repetir`, `Más despacio`, `Escribir`, `Marcar`) | `ui/dialogue`, `world/` (animaciones de habla, encuadre de cámara) | no (la escena se reanuda desde su inicio [GDD §2.16]) |
| `companion` | estado de Lumi (`idle`, `listening`, `speaking`, `signal`, `noted`), señal activa (texto, escalón de la escalera, audio), burbuja visible, cola de líneas, brillo (derivado de evidencia total), ítems anotados en la escena actual | servicio `voice-client` (mensajes `companion.*` del servidor), núcleo (líneas de pre-tarea y destilado) | `ui/companion`, `world/actors/Lumi` | no (deriva de `progression` y `learner`) |
| `progression` | log local de eventos de evidencia (ids del servidor), pociones por rama (derivadas, en tercios enteros), habilidades abiertas y pociones vertidas, can-do demostrados, estado por misión (`locked`, `available`, `done`, `canImprove`), capítulo | **solo** aplicando eventos confirmados por el servidor (`scene.end`) y la acción `pourPotions(skillId)` | `ui/notebook`, `world/` (brillo de Lumi), `companion` | servidor (fuente: eventos) |
| `learner` | banco de repaso (ítems Leitner), patrones de error (clave normalizada, tipo, conteo, sistemático), nivel de andamiaje (1-5) y ventana de señales de las últimas 3 escenas, ítems vencidos | eventos del servidor (`scene.end` trae actualizaciones), repaso de bolsillo | servicio de voz (para pedir escena con ítems vencidos), `ui/notebook` | servidor |
| `ui` | paneles abiertos, modal activo, toasts, foco de navegación accesible, modo de puntero (`pointerMode`: `play` por defecto o `inspect`, que solo activa el modo director, §6.5.3) | `ui/`; `dev/director` solo con `setPointerMode` | `ui/`, `world/` (pausar input de cámara si hay modal; en `inspect` el clic elige un punto con `pickTile` en vez de mover) | no |

**Notas de diseño del store:**
- **Pociones en tercios enteros.** La opción sugerida vale 1/3 de poción [GDD §2.7.3]; para evitar flotantes se guarda `thirds: number` y la UI muestra frascos. Regla de núcleo, testeada.
- **Selectores con nombre** en `state/selectors/` (por ejemplo `selectCurrentObjective`, `selectNearbyInteractables`, `selectPotionsByBranch`). Las corridas no escriben selectores ad hoc dentro de componentes salvo triviales.
- **No hay slice de economía ni de construcción.** Ver §3.6.

### 3.4 Flujo típico (ejemplo completo: hablar con Maya)

```
1. world/ Npc onClick  ──► acción interact("NPC-MAYA")
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
   ──► world/ muestra la fundación o el caminito de luz nuevo; ui/ muestra el destilado
```

En ningún paso `ui/` toca `world/` ni al revés.

### 3.5 Máquinas de estado y reglas del núcleo (contratos)

Las máquinas de estado se escriben como **tablas de transición tipadas** (`{ [estado]: { [evento]: (ctx, evento) => [nuevoEstado, efectos[]] } }`), sin dependencia externa. Los efectos son datos (por ejemplo `{type: "send", msg}`), que ejecuta el servicio correspondiente: así la máquina es pura y testeable.

#### 3.5.1 Máquina de escena (compartida cliente/servidor, `packages/core/scene`)

```
idle
 └─ interact(npc con escena) ──► pretask            (Lumi presenta; servidor pre-calienta)
pretask
 ├─ pretaskDone + sceneReady ──► npcOpening         (línea guionada cacheada; arranca el reloj de escena)
 └─ sceneFailed(net/budget)   ──► npcOpening[text]  (misma escena en modo texto)
npcOpening ── openingDone ──► playerTurn
playerTurn  (sub-estados: waiting ─ speechStart ─► speaking ─ speechPause ─► endPending
                          endPending ─ turnTimer | pressDone ─► committed
                          endPending ─ speechResume ─► speaking
                          waiting|endPending ─ pressPass ─► passMenu ─ choose(opción) ─► committed|waiting)
 └─ committed ──► npcTurn
npcTurn
 ├─ npcDone [¬ctx.softCapReached ∨ criterios] ──► playerTurn
 ├─ npcDone [ctx.softCapReached ∧ ¬criterios] ──► nonConverging            [GDD §2.5.3]
 ├─ companionSignal ──► signal
 └─ criteriaMet ──► closing
signal
 ├─ companionDone [¬ctx.softCapReached ∨ criterios] ──► playerTurn
 └─ companionDone [ctx.softCapReached ∧ ¬criterios] ──► nonConverging
nonConverging ── nonConvergingDone ──► closing(parcial)
con reloj corriendo (npcOpening, playerTurn.*, npcTurn, signal, nonConverging)
 ├─ softCap (reloj ≥ 4:00) ──► mismo estado; efecto: ctx.softCapReached = true   (nunca corta a nadie)
 └─ hardCap (reloj ≥ 5:00) ──► closing(tope duro)                             [GDD §2.5.5, ADR-006]
cualquier estado activo (pretask y los de arriba)
 ├─ voiceLost | budgetExhausted ──► mismo sub-estado con modality = text   [GDD §2.16]
 ├─ safetyRisk ──► containment (línea guionada fuera de la ficción + recurso)
 └─ abort (jugador sale) ──► aborted (la escena se reanuda desde su inicio)
containment ── containmentDone ──► closing
closing ── closingDone ──► posttask (destilado + 1-3 evocaciones) ── posttaskDone ──► done
```

**Eventos (lista cerrada; no se renombran ni se agregan sin decisión):** `interact`, `pretaskDone`, `sceneReady`, `sceneFailed`, `openingDone`, `speechStart`, `speechPause`, `speechResume`, `turnTimer`, `pressDone`, `pressPass`, `choose`, `npcDone`, `companionSignal`, `companionDone`, `criteriaMet`, `nonConvergingDone`, `softCap`, `hardCap`, `voiceLost`, `budgetExhausted`, `safetyRisk`, `containmentDone`, `closingDone`, `posttaskDone`, `abort`.

**Temporizadores (tres):** `turnTimer` (umbral de fin de turno en `endPending`), `softCap` (reloj de escena ≥ 4:00) y `hardCap` (reloj de escena ≥ 5:00). El **reloj de escena** arranca al entrar a `npcOpening` y no corre en `pretask` (D-130). Los dos topes los dispara el servidor; el cliente solo los refleja.

**Reglas de los topes (D-130):**

- `softCap` nunca transiciona por sí mismo: solo marca `ctx.softCapReached`. El paso a `nonConverging` ocurre en el próximo borde natural (fin de la línea del NPC o de Lumi), así nadie queda cortado a mitad de frase y el jugador que está hablando termina su turno.
- `hardCap` sale de **cualquier** estado con reloj, incluido `playerTurn` en cualquier sub-estado (también `waiting` con el jugador en silencio: el silencio es del jugador, el tope de costo no). Efectos, en este orden: (1) si sale de `playerTurn.speaking|endPending`, el habla parcial se confirma al transcript para el observador, sin generar respuesta del NPC; (2) si sale de `npcTurn|signal|nonConverging`, el audio en curso se corta; (3) el servidor **cierra la sesión Live** al entrar a `closing(tope duro)`; (4) la línea de cierre del NPC ("I have to go check the oven! Thanks!") es una **línea guionada cacheada** de la ficha de escena (como la de apertura), no generada por la sesión Live. Así el tope de 5:00 es exacto en costo.
- **Orden estado/efectos:** los efectos de una transición se ejecutan con el estado destino ya vigente. La línea de cierre se emite en `closing`, nunca en `playerTurn`, y la invariante (a) se mantiene también cuando el tope llega con el turno del jugador abierto.
- `hardCap` en `containment`, `closing`, `posttask`, `done` o `aborted` se ignora (la contención de seguridad termina su línea; los demás ya cerraron).

Invariantes testeadas: (a) en ningún estado el NPC habla durante `playerTurn` (el servidor no envía audio de NPC mientras el turno es del jugador), (b) `signal` nunca ocurre dos veces seguidas sobre el mismo error, (c) toda escena termina en `done` o `aborted` (sin estados colgados), (d) `nonConverging` nunca produce pérdida de progreso, (e) ninguna escena sigue con sesión Live abierta después de `hardCap` (test: `hardCap` durante `playerTurn.waiting` → `closing`, sesión cerrada, línea de cierre emitida ya en `closing`).

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

**Este bloque es la única definición del contrato de `decideCompanion`.** `04-roadmap.md` F6 y `05-prompts-por-etapa.md` F6 lo citan tal cual; si algún otro texto describe otra firma u otro conjunto de salidas, gana este. Precisiones: `step` de una señal va de **2 a 5** (2 repetición con entonación, 3 pista metalingüística, 4 elicitación, 5 recast y seguir; el 1 lo hace el NPC, ver abajo); `template` es el **id** de una plantilla de Lumi del catálogo (`02-narrativa-guion.md` §2.7, compilado desde `content/companion/lumi.es-AR.yaml`); `flag` agrega ítems al repaso de cierre sin decir nada en la escena; `none` no hace nada. Las claves de modo son exactamente `accompanied` ("Acompañado", default D-034), `flagOnly` ("Solo anotar") y `moreHelp` ("Más ayuda").

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
├─ eslint.config.js              # límites con rutas resueltas (import-x/no-restricted-paths) + costuras R10-R15 + modo director (§4.3.1)
├─ vitest.workspace.ts
├─ .env.example                  # SOLO nombres de variables, sin valores
├─ .gitignore                    # .env*, assets-src/, node_modules/, dist/, coverage/, *.log, .director/, apps/server/data/, apps/server/models/zipa/, apps/web/public/content/, apps/server/generated/ (D-159), experiments/f0-voice-probe/data/audio/
├─ .mcp.json                     # (FD0) registra el servidor MCP del modo director para Claude Code (sin claves; D-188)
├─ .director/                    # (FD0, gitignored) estado vivo, diario de sesiones de prueba, costo del copiloto; solo desarrollo (§6.5)
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
│  ├─ 06-grafo.yaml              # grafo de fases (derivado de 00/04/05)
│  ├─ 07-stack-objetivo.md       # stack objetivo y costuras R10-R15 (revisión de arquitectura, insumo integrado acá)
│  ├─ research/                  # estudios de la investigación de referencias (voz costo-valor, pronunciación)
│  ├─ refs/                      # referencias visuales (estética; la vigente es la maqueta pintada, D-207, en docs/estetica/)
│  ├─ adr/                       # un archivo por ADR: ADR-NNN-<slug>.md (F1.1 copia ADR-001…025)
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
│  │  └─ NPC-INES.yaml …         # ficha de NPC (GDD §2.5.4; elenco de `02` §3, D-166)
│  ├─ missions/
│  │  └─ M1.2.yaml …             # ficha de misión + escenas (GDD §2.3.3, §2.5.3)
│  ├─ board/                     # pedidos del tablero: P-R1.1.yaml … (GDD §3.7)
│  ├─ mystery/                   # sobres.yaml, clues.yaml: meta-misterio de los sobres de semillas (02 §1.6, §6.2.5; D-172)
│  ├─ fundaciones/               # SITIO-*.yaml: fichas de fundación con visual por estado (02 §6.2.6; D-169)
│  ├─ saberes/                   # SAB-*.yaml con sus HV-*: saberes reales verificables (02 §1.5, §6.2.7; D-170, D-195)
│  ├─ red/                       # presentaciones.yaml: quién presenta a quién (02 §6.2.8; D-168)
│  ├─ retired-ids.yaml           # ids, nombres y términos retirados (lista única: 02 §0.5.1) (P0 T5)
│  ├─ lint-allowlist.yaml        # líneas [GUIONADA] que violan el máximo de banda y no se reescriben (P0 T5)
│  ├─ level-cards/               # A0.yaml, A1.yaml, …: tarjetas de nivel que se inyectan en el prompt (02 §3.3)
│  ├─ prompts/                   # npc-base.txt: borrador del system prompt de los NPCs (02 §3.2); SOLO se compila al servidor
│  ├─ authoring/                 # lumi-variantes.txt: prompt OFFLINE para redactar variantes de plantillas de Lumi (02 §2.6); NO se compila ni se llama en runtime
│  ├─ skills/skill-tree.yaml     # árbol (GDD §2.8.2)
│  ├─ scaffold/levels.yaml       # parámetros por nivel de andamiaje (GDD §2.10)
│  ├─ companion/
│  │  └─ lumi.es-AR.yaml         # plantillas de Lumi con id (esquema y catálogo: 02 §2.7): escalera de señales, destilado, evocación, feedback de pronunciación
│  ├─ pronunciation/
│  │  ├─ confusions.es-en.yaml   # tabla de confusiones L1 es→en calibrada en F0.1 (§5.12)
│  │  └─ habilitados.yaml        # tipos de error E1-E14 habilitados por la vara de F0.1 (D-151)
│  ├─ dioramas/
│  │  ├─ muelle.yaml             # Los Campos (id de diorama y de presupuesto `muelle`, D-180): formato de la maqueta (terreno, caminos, agua, detalle, props), NPCs, rutas, interactuables, zonas no caminables, anclas `sitios`
│  │  └─ plaza.yaml              # El Cruce (id `plaza`, D-180)
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
│  │  │  ├─ pronunciation/       # tipos E1-E14, recurrencia, guardia de pares mínimos, cruce gramática/pronunciación (§5.12)
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
│  │  ├─ vite.config.ts          # config del juego; NUNCA menciona ni importa el modo director (lint, fixture FD0 A2)
│  │  ├─ public/
│  │  │  ├─ models/<pack>/…glb   # SOLO modelos ya optimizados y repintados por el pipeline (props y personajes, D-207)
│  │  │  ├─ portraits/           # retratos de solo-diálogo renderizados del modelo 3D (D-030, plan estetica-c M3)
│  │  │  ├─ audio/lines/         # líneas guionadas pre-generadas (Opus/OGG)
│  │  │  ├─ audio/sfx/ …/music/  # CC0/CC-BY registrados
│  │  │  ├─ fonts/               # autoalojadas
│  │  │  ├─ decoders/            # decodificador meshopt autoalojado
│  │  │  └─ content/             # GENERADO: JSON compilado desde /content
│  │  └─ src/
│  │     ├─ main.tsx · App.tsx   # raíz de composición: monta shell DOM; carga diferida del canvas (P0 T1)
│  │     ├─ boot/                # arranque de servicios; dev.ts carga el modo director SOLO con DEV && VITE_LG_DIRECTOR=1 (§6.5.1)
│  │     ├─ dev/director/        # (FD0-FD1, solo desarrollo, nunca en el build) snapshot, sesión, panel lateral (§6.5)
│  │     ├─ state/
│  │     │  ├─ store.ts          # composición de slices
│  │     │  ├─ bridge.ts         # ÚNICA puerta del mundo 3D al store: selectores y acciones permitidos a world/
│  │     │  ├─ actions.ts        # barril de acciones públicas: lo único que ui/ (y dev/director) despachan (R14, P0 T2)
│  │     │  ├─ slices/           # sessionSlice.ts, settingsSlice.ts, worldSlice.ts, …
│  │     │  └─ selectors/
│  │     ├─ services/
│  │     │  ├─ voice/            # transport.ts (interfaz VoiceTransport, R13) + ws.ts; voiceClient.ts, framing, reconexión (P0 T7)
│  │     │  ├─ audio/            # ÚNICO AudioContext; dsp/ (VAD, OLA, resample: funciones puras, P0 T8) · worklets/ (cáscaras sin lógica); director de audio, clipStore (D-155)
│  │     │  ├─ input/            # dispositivos → acciones semánticas (R10); remapeo
│  │     │  ├─ platform/         # interfaz Platform + adaptador web (R15); desktop/mobile/xr en sus épicas
│  │     │  ├─ persistence/      # sync con servidor + copia local (IndexedDB)
│  │     │  ├─ telemetry/        # eventos de aprendizaje y engagement (§7.6)
│  │     │  ├─ quality/          # quality.ts: tiers como contrato (R12), detección, PerformanceMonitor bridge
│  │     │  └─ content/          # carga y cacheo del contenido compilado
│  │     ├─ world/               # R3F
│  │     │  ├─ GameCanvas.tsx    # raíz del canvas (chunk diferido)
│  │     │  ├─ dioramas/         # Diorama.tsx genérico que lee el layout
│  │     │  ├─ actors/           # Player.tsx, Character.tsx (cuerpo con esqueleto + cabeza), máquina de animación, sombras blob (§2.9)
│  │     │  ├─ terrain/          # buildTerrain.ts: malla de alturas pintada (§2.9)
│  │     │  ├─ water/            # shader del agua (§2.8)
│  │     │  ├─ props/            # constructores codigo/*, cargador de modelos del pipeline (§2.9)
│  │     │  ├─ labels/           # etiquetas de nombre y burbujas de pedido (§2.9)
│  │     │  ├─ camera/           # CameraRig.tsx con presets (R11)
│  │     │  ├─ materials/        # material toon único, registro de materiales (§2.8)
│  │     │  ├─ budget/           # estimador de presupuesto y contadores de desarrollo (§2.9)
│  │     │  ├─ portraits/        # estudio de retratos solo de desarrollo (§2.9)
│  │     │  ├─ post/             # postprocesado por tier (§2.9)
│  │     │  ├─ lighting/         # tiempo del día, saturación del Cruce por progreso, halos
│  │     │  ├─ foundations/      # FoundationLayer.tsx (SITIO-* por estado) · NetworkFireflies.tsx (red) (F3.3, §2.9)
│  │     │  └─ dev/              # superposición de grilla y coordenadas (solo dev)
│  │     ├─ ui/                  # React DOM + Tailwind
│  │     │  ├─ hud/              # objetivo, indicador de voz, prompt de interacción
│  │     │  ├─ dialogue/         # subtítulos, barra de andamiaje, menú de silencio, modo texto
│  │     │  ├─ companion/        # burbuja de Lumi, señal, destilado
│  │     │  ├─ pronunciation/    # momentos guionados, drills de pares mínimos, "así lo dijiste vos / así suena"
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
│     │  ├─ config/              # carga de models.yaml, precios, límites; validado con zod; modo operador local (D-158)
│     │  ├─ content/             # loader.ts: lee generated/content; relee al cambiar SOLO con LG_DEV_CONTENT_WATCH=1 (FD0, §6.5.2)
│     │  ├─ store/               # interfaces EvidenceStore, SaveStore, LearnerStore + adaptador de archivo append-only (D-157); Postgres en F11.1
│     │  ├─ gateway/             # WS del cliente, framing, autenticación del socket
│     │  ├─ scene-runtime/       # orquesta UNA escena: sesión Live, máquina de escena, timers
│     │  ├─ providers/           # adaptadores: gemini-live, cascade (stt-deepgram, gemini-text, tts-*), moderation-* (§5.10-§5.11)
│     │  ├─ pronunciation/       # ScriptedAssessor (azure, speechace) · RealizationRecognizer (zipa) (§5.12)
│     │  ├─ observer/            # prompt, schema de salida, guardas de truncado
│     │  ├─ moderation/          # filtro rápido, clasificador, retención de audio, contención
│     │  ├─ budget/              # minutos de voz por cuenta/institución
│     │  ├─ cost/                # ledger de costo por escena y por minuto
│     │  ├─ api/                 # REST: auth, guardado, clases, reportes, consentimiento
│     │  ├─ auth/                # sesiones, roles, login de clase
│     │  ├─ db/                  # migraciones SQL a mano + consultas
│     │  ├─ telemetry/           # ingesta de eventos
│     │  └─ retention/           # borrado programado (transcripciones a 30 días)
│     ├─ config/models.yaml      # roles de modelo → proveedor/modelo/precio; voice.npc.adapter (sin claves)
│     ├─ models/zipa/            # modelo ONNX de ZIPA (gitignored; lo baja el operador; registrado con licencia)
│     ├─ data/                   # (gitignored) cost-ledger.jsonl (F5.1a) · evidence.jsonl (F4.1) · saves/ · learner.jsonl (F7): adaptadores de archivo del modo operador hasta F11.1 (D-157)
│     ├─ generated/content/      # GENERADO por scripts/content/build.ts: contenido + prompts (nunca va al cliente)
│     └─ test/fakes/             # servidor Live falso, STT/modelo de texto/TTS falsos, respuestas de pronunciación falsas
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
   ├─ fv/report.ts               # métricas del prototipo FV (D1, D7, minutos/usuario, US$/usuario/semana, US$/min de la ventana; D-126)
   └─ fv/check-glossary.ts       # chequeo de glosario antes del deploy de FV (MODE=fv, D-128)

tooling/
├─ eslint-fixtures/              # fixtures de lint fuera del árbol que lintea verify (si no se usa lintText) (P0 T4)
└─ director/                     # (FD0-FD1) workspace privado, SOLO desarrollo, fuera de apps/ (§6.5, ADR-026)
   ├─ vite.config.ts             # ÚNICO lugar donde se registra el plugin: mergeConfig(apps/web/vite.config.ts, { plugins: [directorPlugin()] }); lo usa `npm run dev:director`
   ├─ src/vite-plugin.ts         # plugin de Vite apply:"serve": snapshot → .director/state.json, /__director/*, recarga de contenido
   ├─ src/read.ts · src/cli.ts   # funciones de lectura compartidas + CLI (npm run director -- …)
   ├─ src/mcp.ts                 # servidor MCP por stdio (cáscara sobre read.ts; D-188)
   ├─ src/copilot/               # (FD1) CopilotRunner (Claude Agent SDK) + guardas + aplicar/commitear/deshacer
   └─ config.yaml                # (FD1) modelo del copiloto, umbral de alerta de costo (sin claves; D-189)

experiments/                     # FUERA de los workspaces
├─ f0-voice-probe/               # sonda de voz, gramática (EPR) y pronunciación (F0.1); data/audio/ gitignored
└─ f0-hd2d-spike/                # spike de rendimiento HD-2D descartable (F0.2)
```

#### 4.2.1 Rutas canónicas

Esta tabla es la **única fuente de rutas** del proyecto (`00-decisiones.md` §0.3). Todo prompt de fase de `05-prompts-por-etapa.md` la cita; si un prompt nombra otra ruta, gana esta tabla y la diferencia se reporta. Una corrida que necesite una ruta nueva la agrega acá en su reporte como propuesta y usa una ruta coherente con el árbol de §4.2.

| Qué | Ruta canónica | Fase que la crea |
|---|---|---|
| Registro de licencias de assets | `content/assets-registry.yaml` (en el spike descartable: `experiments/f0-hd2d-spike/LICENSES.md`) | F3 (F0.2 en el spike) |
| Layout de dioramas (formato de la maqueta y anclas `sitios`, §6.4.3) | `content/dioramas/muelle.yaml` (Los Campos), `content/dioramas/plaza.yaml` (El Cruce): ids de diorama y de presupuesto sin renombrar (D-180); F2 usa `content/dioramas/test.yaml` (migrado al formato de la maqueta en el plan estetica-c M5) | F2 (test), F3.1 (muelle), F3.2 (plaza), F3.3 (sitios) |
| Lugares para solo-diálogo | `content/world/places.yaml` (F1.2 ya valida referencias escena→lugar) | F1.2 |
| Compilador de contenido | `scripts/content/build.ts` | F1.2 |
| Salida compilada | `apps/web/public/content/` (cliente, sin prompts) · `apps/server/generated/content/` (servidor); **ambas ignoradas por git y regeneradas por `build`/`validate:content`** (D-159); `content/audio-lines.manifest.json` sí se versiona | F1.2 |
| Glosario | `content/glossary/en.es-AR.yaml` | F1.2 |
| Misiones · NPCs · tablero · misterio | `content/missions/M<c>.<n>.yaml` · `content/npcs/NPC-<NOMBRE>.yaml` · `content/board/P-R<r>.<n>.yaml` · `content/mystery/sobres.yaml`, `content/mystery/clues.yaml` (sobres de semillas, D-172) | F1.2, F8 |
| Tarjetas de nivel y prompt base de NPCs | `content/level-cards/<nivel>.yaml` · `content/prompts/npc-base.txt` | F1.2 (los usa F4.1) |
| Plantillas de Lumi | `content/companion/lumi.es-AR.yaml` (esquema y catálogo con ids: `02-narrativa-guion.md` §2.7) | F1.2, F6 |
| Prompt offline de autoría de Lumi | `content/authoring/lumi-variantes.txt` (`02` §2.6; fuera del compilador, nunca en runtime) | F1.2 |
| Seguridad | `content/safety/topics.global.yaml` · `content/safety/containment.es-AR.yaml` · `content/safety/blocklists/` | F1.2, F4.2 |
| Árbol de habilidades | `content/skills/skill-tree.yaml` | F1.2 |
| Modelos y precios | `apps/server/config/models.yaml` | F4.1 |
| Presupuestos | §2.7.3 + `scripts/budgets/budgets.json` (lo lee `check:budgets`; incluye `check:dev-only`, §6.5.1) | F1.1b (FD0 agrega `check:dev-only`) |
| Puente mundo → store | `apps/web/src/state/bridge.ts` (FD1 agrega `pickTile`) | F2 |
| Acciones públicas para `ui/` y el modo director | `apps/web/src/state/actions.ts` (P0 T2) | F1.1a (vacío), F1.3 |
| Raíz de composición | `apps/web/src/main.tsx`, `App.tsx`, `apps/web/src/boot/` (P0 T1; marcadores en F1.1a) | F1.1a, F1.3 |
| Nombres de paquete | `@lg/core`, `@lg/protocol`, `@lg/content-schema` (P0 T3); alias de `apps/web`: `@ui/*`, `@world/*`, `@state/*`, `@services/*`, `@i18n/*`, `@teacher/*` | F1.1a |
| Config de lint y sus fixtures | `eslint.config.js` (§4.3.1) · `tooling/eslint-fixtures/` o `lintText` con `filePath` virtual (§4.3.2) | F1.1a |
| IDs retirados y allowlist de lint | `content/retired-ids.yaml` · `content/lint-allowlist.yaml` (P0 T5) | F1.2 |
| Fundaciones · saberes · red (contenido v0.2) | `content/fundaciones/SITIO-*.yaml` · `content/saberes/SAB-*.yaml` (con sus `HV-*`) · `content/red/presentaciones.yaml` (`02` §6.1, §6.2.6-§6.2.8) | F1.2 (esquemas + prólogo/M1.1-M1.2), F8 |
| Capa de fundaciones y red en el mapa | `packages/core/src/world/` (`foundationVisuals`, `networkPaths`) · `apps/web/src/world/foundations/` · anclas `sitios:` en `content/dioramas/*.yaml` (§6.4.8) | F3.3 |
| Persistencia del operador (sin Postgres) | `apps/server/src/store/` (interfaces `EvidenceStore`, `SaveStore`, `LearnerStore`) · `apps/server/data/evidence.jsonl`, `apps/server/data/saves/`, `apps/server/data/learner.jsonl` (gitignored) (D-157) | F4.1 (evidencia), F7 (resto) |
| Modo operador del servidor | `LG_OPERATOR_MODE=1`, ligado a `127.0.0.1`, cuenta seudónima `op-local` (D-158) | F4.1 |
| Transporte de voz del cliente | `apps/web/src/services/voice/transport.ts` (`VoiceTransport`) + `ws.ts` (P0 T7) | F5.2 |
| DSP de audio puro | `apps/web/src/services/audio/dsp/` · `services/audio/worklets/` (cáscaras) (P0 T8) | F5.2 |
| Modo director (solo desarrollo) | cliente `apps/web/src/dev/director/` (lo carga `apps/web/src/boot/dev.ts`) · Node `tooling/director/` · snapshot y diario tipados en `packages/protocol/src/director.ts` · `.director/state.json`, `.director/journal/<sessionId>.jsonl` (gitignored) · `.mcp.json` · cargador de contenido del servidor `apps/server/src/content/loader.ts` (§6.5) | FD0 |
| Copiloto del modo director | `tooling/director/src/copilot/` · panel `apps/web/src/dev/director/panel/` · `tooling/director/config.yaml` · costo `.director/cost.jsonl` (§6.5.3) | FD1 |
| Capa DOM | `apps/web/src/ui/` (incluye `ui/hud/`, `ui/dialogue/`, `ui/companion/`, `ui/notebook/`, `ui/dialog-only/`, …) | F1.3 |
| Capa 3D | `apps/web/src/world/` | F2 |
| Optimizador de assets | `scripts/assets/optimize.ts` → `apps/web/public/models/<pack>/` (props y personajes, sin texturas, repintados a la paleta; D-207) | plan estetica-c M2 (antes F3) |
| Render maqueta pintada | `apps/web/src/world/terrain/` · `apps/web/src/world/materials/` · `apps/web/src/world/props/` · `apps/web/src/world/actors/` · `apps/web/src/world/camera/CameraRig.tsx` · `apps/web/src/world/post/` (§2.8, §2.9) | plan estetica-c M1 a M7 |
| Costuras R10-R15 | `apps/web/src/services/input/` (R10) · `apps/web/src/world/camera/` (R11) · `apps/web/src/services/quality/quality.ts` (R12) · `apps/web/src/services/audio/` + `VoiceTransport` (R13) · `apps/web/src/state/selectors/` (R14) · `apps/web/src/services/platform/` (R15) | F1.1 (lint), F1.3, F2, F5.2 |
| Retratos para solo-diálogo | PNG renderizado del modelo 3D en `apps/web/public/portraits/<id>.png` con su registro (D-030); si falta, SVG por código | F1.3 (SVG), plan estetica-c M3 |
| Voz híbrida (servidor) | `apps/server/src/providers/gemini-live/` · `apps/server/src/providers/cascade/` · selección en `apps/server/config/models.yaml` (`voice.npc.adapter`) (§5.11) | F5.1 |
| Pronunciación | núcleo `packages/core/src/pronunciation/` · servidor `apps/server/src/pronunciation/` · UI `apps/web/src/ui/pronunciation/` · clips locales `apps/web/src/services/audio/clipStore.ts` · datos `content/pronunciation/` · modelo `apps/server/models/zipa/` (gitignored) (§5.12) | FP |
| Ledger de costo del operador | `apps/server/data/cost-ledger.jsonl` (gitignored; Postgres `cost_ledger` llega con F11.1) | F5.1a |
| Audio de líneas guionadas | `scripts/audio/pregenerate-lines.ts` · `scripts/audio/lines-to-generate.json` · `apps/web/public/audio/lines/` | F8 |
| Eval en vivo opt-in | `scripts/eval/live-text.ts` | F4.1 |
| Reporte del prototipo | `scripts/fv/report.ts` | FV |
| Chequeo de glosario antes del deploy de FV | `scripts/fv/check-glossary.ts` (lo invoca `build:release` con `MODE=fv`, §8.3; D-128) | FV |
| Textos legales (consentimiento informado de FV y avisos de privacidad) | `docs/legal/` (p. ej. `docs/legal/consentimiento-fv.es-AR.md`; los escribe/aprueba el `[operador]`, D-124; una corrida solo deja un borrador marcado) | FV (borrador) · operador |
| Sesión de voz del NPC (port de un prototipo de voz anterior) | `apps/server/src/providers/gemini-live/` (adaptador Live) · `apps/server/src/scene-runtime/` (una sesión por escena, timers, corte, reconexión) | F5.1 |
| ADRs | `docs/adr/ADR-NNN-<slug>.md` (ADR-001…026) | F1.1b |
| Reportes | `docs/reports/F<n>-<AAAA-MM-DD>.md` · veredicto FV del operador: `docs/reports/FV-veredicto-<AAAA-MM-DD>.md` | cada fase · operador |
| Plantilla de capítulo | `docs/content/plantilla-capitulo.md` | F8.3 |
| Sondas | `experiments/f0-voice-probe/` (salidas de pronunciación en `out/`; audio en `data/audio/`, gitignored) · `experiments/f0-hd2d-spike/` | F0.1, F0.2 |
| Variables de entorno | prefijo `LG_` (§4.4): `LG_GEMINI_API_KEY`, `LG_DEEPGRAM_API_KEY`, `LG_AZURE_SPEECH_KEY`, `LG_AZURE_SPEECH_REGION`, `LG_SPEECHACE_API_KEY`, `LG_SPEECHSUPER_APP_KEY`, `LG_SPEECHSUPER_SECRET_KEY` y opcionales (`LG_OPENAI_API_KEY`, `LG_ASSEMBLYAI_API_KEY`, `LG_ELEVENLABS_API_KEY`); modo director: `VITE_LG_DIRECTOR` (bandera de desarrollo, no secreta), `LG_DEV_CONTENT_WATCH`, `LG_ANTHROPIC_API_KEY` (solo el proceso de `tooling/director`, FD1, D-189); modo operador: `LG_OPERATOR_MODE` (D-158); solo nombres en `.env.example` (D-134, D-150) | F0.1, F1.1b, FD0, FD1 |

### 4.3 Límites de módulos (verificados por ESLint con rutas resueltas y por entorno)

La herramienta es `import-x/no-restricted-paths` (plugin `eslint-plugin-import-x` + `eslint-import-resolver-typescript`), que compara la **ruta resuelta** del import; `no-restricted-imports` solo compara el texto y un `../../world/x` lo evade (P0 §2.1). Esas dos dependencias de desarrollo quedan justificadas por eso. Config exacta en §4.3.1; cómo se prueba en §4.3.2.

| Desde | Puede importar | No puede importar |
|---|---|---|
| `packages/core` (`@lg/core`) | solo `packages/protocol` (tipos) y TS estándar; `tsconfig` con `"lib": ["ES2022"]` y `"types": []` | `react`, `three`, `@react-three/*`, `zustand`, `node:*`, cualquier `apps/*`; globals de navegador o Node; `Date.now()`, `new Date()` sin argumentos, `Math.random()` (se inyectan Clock y Rng) |
| `packages/content-schema` (`@lg/content-schema`) | `zod`, `yaml`, `packages/core` (tipos) | `apps/*`, `react`, `three`, `zustand` |
| `packages/protocol` (`@lg/protocol`) | `zod` | todo lo demás |
| raíz de composición (`apps/web/src/main.tsx`, `App.tsx`, `boot/`) | todo `apps/web/src` (monta `ui/`, carga `world/GameCanvas` con `import()`, arranca `services/`; `boot/dev.ts` carga `dev/director` con `import()` solo con `DEV && VITE_LG_DIRECTOR=1`) | `apps/server`, `tooling/` |
| `apps/web/src/ui` | `state/selectors/` y `state/actions.ts` (R14), `i18n/`, `ui/primitives`, `packages/core` (solo tipos) | `world/`, `three`, `@react-three/*`, `services/`, `state/slices/`, `state/store.ts`, `dev/` |
| `apps/web/src/world` | `state/selectors/` y `state/bridge.ts` (acciones expuestas al mundo), `three`, `@react-three/*`, `packages/core` (solo tipos) | `ui/`, `services/`, `state/slices/`, `state/store.ts`, `dev/`, módulos de reglas de `packages/core` |
| `apps/web/src/services` | `state/`, `packages/*` | `ui/`, `world/`, `dev/` |
| `apps/web/src/state` | `packages/core`, `packages/protocol` | `ui/`, `world/`, `services/`, `dev/` |
| `apps/web/src/teacher` | `packages/protocol`, `i18n/`, `ui/primitives` | `world/`, `services/`, `state/`, `three`, `dev/` |
| `apps/web/src/dev` (modo director, solo desarrollo; ADR-026) | `state/selectors/`, `state/actions.ts`, `ui/primitives`, `packages/protocol` (tipos del snapshot), `import.meta.hot`, `fetch`/`EventSource` hacia `/__director/*` | `world/`, `services/`, `state/slices/`, `state/store.ts`, el resto de `ui/`, `three`, SDKs de modelos; y **nadie del juego lo importa** |
| `apps/server` | `packages/*` | `apps/web`, `tooling/`; escritura a disco (`fs.write*`, `createWriteStream`, `appendFile`) fuera de `apps/server/src/store/` y `apps/server/src/cost/` (D-108; esos módulos rechazan buffers binarios, test) |
| `tooling/director` (Node, solo desarrollo) | `packages/*`, `yaml`, `zod`, el compilador de contenido, `@modelcontextprotocol/sdk` (D-188), `@anthropic-ai/claude-agent-sdk` (FD1, D-189) | `apps/web/src/**` en runtime (la única importación de `apps/` permitida es `tooling/director/vite.config.ts` → `apps/web/vite.config.ts`, para hacer `mergeConfig`); y nada de `apps/**`, `packages/**` ni `scripts/**` importa `tooling/` (incluido `apps/web/vite.config.ts`, que cae en la zona porque el lint cubre `apps/**/*.{ts,tsx}`) |
| fuera de `apps/web/src/services/platform/` | — | `@tauri-apps/*`, `@capacitor/*`, `navigator.xr` (R15) |
| fuera de `apps/web/src/services/input/` | — | `addEventListener` de teclado, puntero o gamepad y `navigator.getGamepads` (R10). Los handlers JSX (`onKeyDown` en un `<button>`, `onClick`/`onPointerDown` de R3F sobre mallas de `world/` para elegir un punto) **no** son listeners de dispositivo y siguen permitidos; los de R3F solo despachan acciones semánticas por `bridge.ts` (P0, ADR-025) |
| fuera de `apps/web/src/world/camera/` | — | crear cámaras de three/drei, `OrbitControls`/`MapControls`/`CameraControls`, props `camera`/`orthographic` de `<Canvas>` (R11) |
| fuera de `apps/web/src/services/audio/` | — | `new AudioContext`/`webkitAudioContext`/`OfflineAudioContext`/`Audio` (R13) |
| `apps/web/src/{ui,world,state}` | — | `fetch`, `WebSocket`, `indexedDB`, `localStorage`, `sessionStorage` (R5: efectos solo en `services/`) |

#### 4.3.1 Configuración exacta (`eslint.config.js`, flat config, ESLint 9)

Es la de P0 §2.3 (revisión de arquitectura), con agregados de planificación para el modo director: zonas de `dev/` y `tooling/`, `tooling/**` dentro de los archivos lintados y `.director/**` ignorado. F1.1a crea la config completa (las zonas de `dev/` y `tooling/` no cuestan nada aunque esas carpetas no existan todavía, salvo el marcador `dev/director/index.ts` que F1.1a crea para poder probarlas). F1.1a verifica cada opción contra la versión instalada (§0.5); el soporte de `regex` dentro de `no-restricted-imports.patterns` depende de la versión y esta config no lo usa.

```js
// eslint.config.js — límites de módulos (§4.3), costuras R10-R15 (§3.1) y modo director (§6.5)
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";

const WEB = "apps/web/src";
const p = (dir) => `./${WEB}/${dir}`;

// ---------- piezas reutilizables ----------
const DEVICE_EVENTS = "/^(key|pointer|mouse|touch|wheel|gamepad|click|dblclick|contextmenu)/";
const r10 = [
  { selector: `CallExpression[callee.property.name='addEventListener'][arguments.0.type='Literal'][arguments.0.value=${DEVICE_EVENTS}]`,
    message: "R10: los listeners de dispositivo viven solo en services/input/." },
  { selector: "CallExpression[callee.property.name='addEventListener'][arguments.0.type!='Literal']",
    message: "R10: nombre de evento no literal fuera de services/input/." },
];
const r11 = [
  { selector: "NewExpression[callee.name=/Camera$/]", message: "R11: cámaras solo en world/camera/." },
  { selector: "NewExpression[callee.property.name=/Camera$/]", message: "R11: cámaras solo en world/camera/." },
  { selector: "JSXOpeningElement[name.name=/^(perspective|orthographic)Camera$/]", message: "R11: cámaras solo en world/camera/." },
  { selector: "JSXOpeningElement[name.name='Canvas'] > JSXAttribute[name.name=/^(camera|orthographic)$/]",
    message: "R11: la cámara la fija CameraRig (makeDefault), no <Canvas>." },
];
const r13 = [
  { selector: "NewExpression[callee.name=/^(AudioContext|webkitAudioContext|OfflineAudioContext|Audio)$/]",
    message: "R13: un solo AudioContext, en services/audio/." },
  { selector: "NewExpression[callee.property.name=/^(AudioContext|webkitAudioContext|OfflineAudioContext|Audio)$/]",
    message: "R13: un solo AudioContext, en services/audio/." },
];
const r15Props = [
  { object: "navigator", property: "xr", message: "R15: navigator.xr solo en services/platform/." },
  { object: "navigator", property: "getGamepads", message: "R10: gamepad solo en services/input/." },
];
const cameraImports = [
  { name: "three", importNames: ["PerspectiveCamera", "OrthographicCamera", "CubeCamera", "StereoCamera", "ArrayCamera"],
    message: "R11: cámaras solo en world/camera/." },
  { name: "@react-three/drei", importNames: ["PerspectiveCamera", "OrthographicCamera", "CubeCamera", "OrbitControls", "MapControls", "CameraControls"],
    message: "R11: cámaras y controles solo en world/camera/." },
];
const platformImports = { group: ["@tauri-apps/*", "@capacitor/*"], message: "R15: solo en services/platform/." };

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "experiments/**", "tooling/eslint-fixtures/**",
              "apps/web/public/**", "apps/server/generated/**", ".director/**"] },
  ...tseslint.configs.strict,

  // ---------- 1. Límites entre carpetas (rutas resueltas) ----------
  {
    files: ["apps/**/*.{ts,tsx}", "packages/**/*.ts", "scripts/**/*.ts", "tooling/**/*.ts"],
    plugins: { "import-x": importX },
    settings: { "import-x/resolver": { typescript: { project: ["tsconfig.base.json", "apps/*/tsconfig.json", "packages/*/tsconfig.json", "tooling/*/tsconfig.json"] } } },
    rules: {
      "import-x/no-restricted-paths": ["error", { zones: [
        // R2/R3: ui y world nunca se importan entre sí
        { target: p("ui"),    from: p("world"),    message: "R3: ui/ no importa world/; pasá por el store." },
        { target: p("world"), from: p("ui"),       message: "R3: world/ no importa ui/; pasá por el store." },
        // ui y world no importan services (se activan por estado)
        { target: p("ui"),    from: p("services"), message: "§4.3: ui/ no importa services/." },
        { target: p("world"), from: p("services"), message: "§4.3: world/ no importa services/." },
        // R14 + puerta del mundo: ui lee selectores y acciones; world solo selectores y bridge
        { target: p("ui"),    from: p("state"), except: ["./selectors", "./actions.ts"],
          message: "R14: ui/ solo usa state/selectors/ y state/actions.ts." },
        { target: p("world"), from: p("state"), except: ["./selectors", "./bridge.ts"],
          message: "§4.3: world/ solo usa state/selectors/ y state/bridge.ts." },
        // state es base: no conoce a nadie arriba
        { target: p("state"), from: [p("ui"), p("world"), p("services")], message: "§4.3: state/ no importa capas superiores." },
        // services no conoce vistas
        { target: p("services"), from: [p("ui"), p("world")], message: "§4.3: services/ no importa ui/ ni world/." },
        // panel docente
        { target: p("teacher"), from: [p("world"), p("services"), p("state")], message: "§4.3: teacher/ habla solo con la API." },
        { target: p("teacher"), from: p("ui"), except: ["./primitives"], message: "§4.3: teacher/ solo usa ui/primitives." },
        // modo director (solo desarrollo, ADR-026): nadie del juego lo importa; él lee selectores y despacha acciones
        { target: [p("ui"), p("world"), p("state"), p("services"), p("teacher")], from: p("dev"),
          message: "ADR-026: el juego no importa dev/ (modo director)." },
        { target: p("dev"), from: p("state"), except: ["./selectors", "./actions.ts"],
          message: "ADR-026: dev/ solo usa state/selectors/ y state/actions.ts." },
        { target: p("dev"), from: [p("world"), p("services")], message: "ADR-026: dev/ no importa world/ ni services/." },
        { target: p("dev"), from: p("ui"), except: ["./primitives"], message: "ADR-026: dev/ solo usa ui/primitives." },
        { target: ["./apps", "./packages", "./scripts"], from: "./tooling", message: "ADR-026: el producto no importa tooling/." },
        // apps y paquetes
        { target: "./apps/server", from: "./apps/web", message: "§4.3: server no importa web." },
        { target: "./apps/web",    from: "./apps/server", message: "§4.3: web no importa server." },
        { target: "./packages",    from: "./apps", message: "§4.3: los paquetes no importan apps/." },
        { target: "./packages/protocol", from: ["./packages/core", "./packages/content-schema"], message: "§4.3: protocol solo depende de zod." },
        { target: "./packages/core", from: "./packages/content-schema", message: "§4.3: core no depende de content-schema." },
      ]}],
    },
  },

  // ---------- 2. Núcleo puro (R4) ----------
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        { group: ["react", "react-*", "three", "three/*", "@react-three/*", "zustand", "zustand/*", "node:*"],
          message: "R4: el núcleo es TS puro." } ] }],
      "no-restricted-globals": ["error", "window", "document", "navigator", "localStorage", "sessionStorage",
        "indexedDB", "fetch", "WebSocket", "AudioContext", "performance", "crypto", "process", "Buffer",
        "require", "__dirname", "setTimeout", "setInterval", "queueMicrotask"],
      "no-restricted-properties": ["error",
        { object: "Date", property: "now", message: "R4: inyectá el Clock." },
        { object: "Math", property: "random", message: "R4: inyectá el Rng." }],
      "no-restricted-syntax": ["error",
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: "R4: inyectá el Clock." }],
    },
  },
  // protocol: solo zod
  { files: ["packages/protocol/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["react", "react-*", "three", "three/*", "@react-three/*", "zustand", "yaml", "@lg/*"],
      message: "§4.3: protocol solo importa zod." }] }] } },
  // content-schema: zod, yaml, @lg/core
  { files: ["packages/content-schema/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["react", "three", "@react-three/*", "zustand"], message: "§4.3" }] }] } },

  // ---------- 3. ui/, world/, teacher/ y dev/: núcleo solo como tipos; sin three donde no corresponde ----------
  {
    files: [`${WEB}/ui/**/*.{ts,tsx}`],
    rules: { "@typescript-eslint/no-restricted-imports": ["error", {
      paths: [{ name: "@lg/core", allowTypeImports: true, message: "ui/ usa el núcleo solo como tipos; la lógica entra por acciones." }],
      patterns: [{ group: ["three", "three/*", "@react-three/*"], message: "§4.3: ui/ no importa three." }, platformImports],
    }]},
  },
  {
    files: [`${WEB}/world/**/*.{ts,tsx}`],
    rules: { "@typescript-eslint/no-restricted-imports": ["error", {
      paths: [{ name: "@lg/core", allowTypeImports: true, message: "world/ usa el núcleo solo como tipos." }],
      patterns: [platformImports],
    }]},
  },
  { files: [`${WEB}/teacher/**/*.{ts,tsx}`],   // regla de typescript-eslint: el bloque 4 no la pisa
    rules: { "@typescript-eslint/no-restricted-imports": ["error", { patterns: [{ group: ["three", "three/*", "@react-three/*"], message: "§4.3: teacher/ sin three." }] }] } },
  { files: [`${WEB}/dev/**/*.{ts,tsx}`],
    rules: { "@typescript-eslint/no-restricted-imports": ["error", { patterns: [{ group: ["three", "three/*", "@react-three/*", "@anthropic-ai/*", "@modelcontextprotocol/*"],
      message: "ADR-026: dev/ sin three ni SDKs (el copiloto y el MCP viven en tooling/)." }] }] } },

  // ---------- 4. Costuras R10, R11, R13, R15 en todo apps/web ----------
  {
    files: [`${WEB}/**/*.{ts,tsx}`],
    ignores: [`${WEB}/services/input/**`, `${WEB}/world/camera/**`, `${WEB}/services/audio/**`, `${WEB}/services/platform/**`],
    rules: {
      "no-restricted-syntax": ["error", ...r10, ...r11, ...r13],
      "no-restricted-properties": ["error", ...r15Props],
      "no-restricted-imports": ["error", { paths: cameraImports, patterns: [platformImports] }],
    },
  },
  // Dentro de cada carpeta-costura se relaja SOLO su propia regla (las demás siguen):
  { files: [`${WEB}/services/input/**`],    rules: { "no-restricted-syntax": ["error", ...r11, ...r13],
      "no-restricted-properties": ["error", r15Props[0]], "no-restricted-imports": ["error", { paths: cameraImports, patterns: [platformImports] }] } },
  { files: [`${WEB}/world/camera/**`],      rules: { "no-restricted-syntax": ["error", ...r10, ...r13],
      "no-restricted-properties": ["error", ...r15Props], "no-restricted-imports": ["error", { patterns: [platformImports] }] } },
  { files: [`${WEB}/services/audio/**`],    rules: { "no-restricted-syntax": ["error", ...r10, ...r11],
      "no-restricted-properties": ["error", ...r15Props], "no-restricted-imports": ["error", { paths: cameraImports, patterns: [platformImports] }] } },
  { files: [`${WEB}/services/platform/**`], rules: { "no-restricted-syntax": ["error", ...r10, ...r11, ...r13],
      "no-restricted-properties": ["error", r15Props[1]], "no-restricted-imports": ["error", { paths: cameraImports }] } },

  // ---------- 5. Efectos solo en services/ (R5) ----------
  { files: [`${WEB}/{ui,world,state}/**/*.{ts,tsx}`],
    rules: { "no-restricted-globals": ["error", "fetch", "WebSocket", "indexedDB", "localStorage", "sessionStorage"] } },
);
```

Notas (P0 §2.3, más las del modo director):
1. En flat config, si dos bloques configuran la **misma regla** para el mismo archivo, gana el último (no se fusionan las opciones). Por eso las carpetas-costura repiten las otras restricciones en vez de "apagar" una. El bloque 3 usa la regla de typescript-eslint y el bloque 4 la núcleo: no se pisan. F1.1a agrega un test que confirma que `ui/` sigue sin poder importar `three` aunque el bloque 4 también configure `no-restricted-imports` para el mismo archivo.
2. `no-restricted-globals` en `packages/core` + `tsconfig` sin `lib: DOM` ni `@types/node` dan la neutralidad de entorno.
3. La raíz de composición (`main.tsx`, `App.tsx`, `boot/`) no tiene zona prohibida dentro de `apps/web/src`; las costuras (bloque 4) sí le aplican.
4. `apps/server` además prohíbe escrituras a disco fuera de `src/store/` y `src/cost/` (regla sobre `fs`), que F4.1 agrega cuando existen esas carpetas; reemplaza el "grep de CI" de F5.1/FP (no hay CI; P0 §7).
5. `dev/` usa `import.meta.hot`, `fetch` y `EventSource` hacia `/__director/*`: a propósito no está en el bloque 5 (es una herramienta de desarrollo con efectos propios, aislada por las zonas del bloque 1 y por la regla dev-only de §6.5.1).

#### 4.3.2 Cómo se prueba (F1.1a; P0 §2.4)

- Fixtures **fuera** del árbol que lintea `verify` (`tooling/eslint-fixtures/`, ignorado y excluido de `tsc`) o, mejor, texto en memoria: `new ESLint({ cwd }).lintText(code, { filePath: "apps/web/src/ui/__probe__.tsx" })`.
- `no-restricted-paths` resuelve el destino: el import de la fixture tiene que apuntar a un **archivo que exista** (los `index.ts` marcadores de `ui/`, `world/`, `services/`, `state/`, `dev/director/`, más `state/bridge.ts`, `state/actions.ts`, `state/selectors/index.ts`). Un import a una ruta inexistente no resuelve y no dispara la regla: falso verde.
- Cada fixture prohibida falla **por la regla esperada** (el test compara `ruleId` y el mensaje), no por cualquier error; cada fila tiene además un import permitido que pasa.

Un `npm run lint` rojo por un límite es un **bloqueante**, no una advertencia.

### 4.4 Convenciones de nombres

| Cosa | Convención | Ejemplo |
|---|---|---|
| Identificadores de código | inglés, camelCase; tipos PascalCase | `applySceneEnd`, `ObserverResult` |
| Componentes React | PascalCase, un componente por archivo | `ScaffoldBar.tsx` |
| Hooks | `useX` | `useNearbyInteractables` |
| Slices | `<nombre>Slice.ts`, acciones verbo primero | `dialogueSlice.ts` → `pressDone()` |
| Mensajes WS | `dominio.verbo` en minúscula | `scene.start`, `companion.signal` |
| IDs de contenido | los del GDD, estables, nunca reutilizados | `M1.2`, `M1.2-E1`, `NPC-MAYA`, `HAB-PEDIR-1` |
| Claves de los archivos de contenido | **las del GDD, en español snake_case** (DP-A02) | `criterios_exito`, `necesidad_npc` |
| Variables de entorno | `LG_` + SCREAMING_SNAKE | `LG_GEMINI_API_KEY` |
| Tokens CSS | `--lg-*` | `--lg-color-luz-bicho` |
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

1. **Una sesión Live por escena**, abierta durante la pre-tarea (Lumi habla 20-40 s: tiempo de sobra para el handshake) y cerrada al terminar la escena. Escena objetivo 2-4 min; `softCap` a los 4:00 pasa a `nonConverging` en el próximo borde natural (`npcDone`/`companionDone`), sin cortar a nadie, y un jugador en silencio pasado 4:00 termina por `hardCap` a los 5:00 (D-130); tope duro 5:00 aplicado **en el servidor** [GDD §2.5.5]. Nunca se acerca a los ~15 min de tope ni al tramo cuadrático caro [Negocio §3.2].
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
- **Disparo:** al cerrarse cada turno del jugador, `scene-runtime` llama al observador con: **el clip de audio del turno, en memoria** (D-095; el mismo clip lo lee el servicio de pronunciación, §5.12), transcripción del jugador (con disfluencias), última línea del NPC, criterios de éxito de la escena, estructuras objetivo de la misión, ítems de repaso que la escena buscaba, nivel MCER y patrones de error conocidos (clave + tipo, sin texto libre del perfil).
- **Concurrencia:** el observador corre mientras el NPC responde (1-2 s típicos de un modelo de texto rápido). La decisión de Lumi se aplica **después** de que el NPC termina su turno: Lumi nunca habla encima del NPC [GDD §2.4.1].
- **Salida validada con schema** (§5.7). Si el observador falla, trunca o no responde a tiempo, la escena sigue sin señal (degradación silenciosa del feedback, nunca de la conversación) y el turno se re-evalúa al cierre de la escena.
- **Voz de Lumi:** TTS en la L1 (rioplatense, DP-28 del GDD). Las líneas de Lumi son **plantillas de contenido** con huecos (`"Mmm... ¿{forma_erronea}...?"`), no texto libre del modelo: el observador entrega el hueco (la forma del jugador limpia de disfluencias, la forma correcta desde el glosario cuando existe) y la plantilla la arma el núcleo. Las plantillas fijas tienen audio pre-generado; las que llevan hueco se sintetizan al vuelo con caché por texto (DP-A07).
- **Destilado y evocación (post-tarea):** el servidor envía en `scene.end` los eventos de evidencia y las 1-3 preguntas de evocación elegidas por el núcleo desde lo marcado; las frases salen de plantillas de `lumi.es-AR.yaml`.

### 5.7 Pipeline de detección de errores → modelo del alumno

```
turno del jugador (clip de audio en memoria + transcripción)
   → observer (multimodal: audio + texto; JSON forzado, guardas de truncado)
   → [en paralelo] servicio de pronunciación sobre el mismo clip (§5.12)
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

**Riesgo central del pipeline (R2):** las transcripciones automáticas tienden a "normalizar" el habla hacia formas gramaticales (el jugador dice *she go*, la transcripción escribe *she goes*), lo que **esconde errores** al observador; y el acento rioplatense puede degradar la transcripción [Referencias §4.2.3]. La evidencia de la investigación de referencias (`research/voz-costo-valor-2026-10-06.md` §3.1) dice que es un problema real, así que **el observador recibe siempre el audio del turno** (D-095; ~US$0,0001-0,0003 por turno con un modelo multimodal barato). Medición obligatoria en F0.1 (bloque G): grabaciones del operador con errores sembrados → **tasa de preservación de errores (EPR)** y tasa de errores inventados por fuente. Regla (D-149): Lumi corrige gramática en vivo con confianza solo si alguna fuente logra EPR ≥ 80 % e inventados ≤ 5 %; si no, anota para el repaso con lenguaje tentativo (`observer.liveGrammarSignals=false`).

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

- Interfaces de adaptador en `providers/`: `RealtimeVoiceProvider`, `SttProvider`, `TextModelProvider`, `TtsProvider`, `ModerationProvider`; en `pronunciation/`: `ScriptedAssessor`, `RealizationRecognizer` (§5.12). v1 implementa Gemini Live, la cascada (Deepgram Flux + Gemini Flash + TTS) como segundo `RealtimeVoiceProvider` (§5.11) y Azure + ZIPA para pronunciación; agregar otro proveedor es un adaptador, sin tocar `scene-runtime`.
- Bloque de voz en `models.yaml`: `voice.npc.adapter: live | cascade` (default: el que recomiende F0.1 según D-149; sin F0.1, `live`), `voice.observer.source` (fuente de transcripción), `observer.liveGrammarSignals` (D-149), `cascade.stt`, `cascade.text`, `cascade.tts` y, para pronunciación, `pronunciation.scripted: azure | speechace` y `pronunciation.free: zipa | off`.
- Los ids de modelo "preview" cambian y se retiran con frecuencia: el servidor valida al arrancar que los modelos configurados existen (llamada de listado del proveedor) y falla claro si no.
- **Superficie del proveedor y menores (DP-A05, ligado a DP-35 del GDD):** a la fecha de mi conocimiento, los términos adicionales de la API de Gemini (vía AI Studio) restringían su uso en servicios dirigidos o de probable acceso a menores de 18, y el nivel gratuito permite usar los datos para mejorar productos. **Verificar los términos vigentes antes de cualquier piloto con menores.** Default: desarrollo y piloto de adultos sobre la API paga; antes del primer piloto con menores, migrar al canal empresarial del mismo proveedor (Vertex AI) u otro proveedor cuyos términos lo permitan, previa revisión legal. El adaptador hace que esto sea un cambio de configuración, no de arquitectura.


### 5.11 Voz híbrida: Live y cascada intercambiables (D-092, D-148, D-149; ADR-023)

**Por qué:** con turnos manuales (`Terminé`, ADR-007) el speech-to-speech pierde su ventaja principal (turnos naturales) y conserva su costo cuadrático: Gemini Live re-factura el contexto en cada turno y no tiene caché. Estimado de la investigación de referencias para una sesión de 20 min: Live ~US$0,34-0,58, cascada ~US$0,16-0,27; varios precios de Gemini se duplican el 2027-01-01 (`research/voz-costo-valor-2026-10-06.md` §5). El operador decidió "voz probablemente en tiempo real, pero por feature y por etapa, con datos": por eso las dos vías existen desde F5.1 y se eligen por configuración.

| Adaptador | Cadena | Fortaleza | Debilidad |
|---|---|---|---|
| `gemini-live` (port de LT, ADR-005) | audio → Live → audio | Oye el audio: entiende mejor lo que el jugador *quiso* decir con errores o acento; voz expresiva | Costo cuadrático, sin caché; ids "preview" que cambian |
| `cascade` | STT en streaming (Deepgram Flux) → modelo de texto (Gemini Flash) con el mismo prompt → TTS (Gemini Flash-Lite TTS; Aura-2 alternativa) con parámetro de velocidad | Costo lineal y ~2× menor; cada pieza se cambia sola; el modo lento usa el parámetro `speed` del TTS | El ASR "arregla" errores (no afecta al NPC, sí al observador: por eso el audio va al observador, D-095); latencia sumada (presupuesto en el estudio §3.3) |

**Contrato:** ambos adaptadores implementan `RealtimeVoiceProvider` y emiten **los mismos eventos** hacia `scene-runtime` y la máquina de escena (§3.5.1): `npcAudioChunk`, `npcTranscript`, `playerTranscript`, `turnDone`, `usage`, `error`. Un test de contrato compartido corre contra los dos (F5.1). La moderación con holdback (§7.7) se aplica igual sobre la transcripción de salida de cualquiera de los dos. El ledger registra costo **por adaptador** (§5.9).

**Mapa por feature (D-148):** NPC en vivo = el adaptador configurado (hoy Live; piloto, el ganador de F0.1); observador = modelo multimodal barato con audio + transcripción; correcciones de Lumi = plantillas + TTS es-AR cacheado; repaso de misión = una llamada de texto; pronunciación = §5.12; habla lenta = `speed` del TTS cuando existe + OLA en el cliente (§5.5.4); contenido = offline en Batch; drills = audio pre-generado + STT barato.

### 5.12 Servicio de pronunciación (D-044, D-150, D-151, D-155; ADR-024)

**Qué hace:** dice *cómo* sonó lo que dijo el jugador, por fonema, sin falsas alarmas. Vive en el servidor (`apps/server/src/pronunciation/`), recibe el **mismo clip del turno** que el observador (§5.7) y lo descarta al terminar (D-108). Nada corre en el navegador en la v1.

```
clip del turno (memoria) + intención (frase esperada de la escena > transcripción del ASR)
  ├─ momento guionado → ScriptedAssessor (Azure Pronunciation Assessment: fonema, IPA,
  │                      NBestPhonemeCount=5, miscue, prosodia; Speechace como alternativa)
  └─ habla libre      → forma canónica (diccionario/G2P, varias pronunciaciones por palabra)
                        → RealizationRecognizer (ZIPA-small ONNX INT8, decodificación libre, servidor)
                        → comparación restringida a la tabla de confusiones L1 (content/pronunciation/confusions.es-en.yaml)
                        → guardia de pares mínimos → contraste opcional con Azure si hay frase esperada
  → salida común {palabra, fonemas:[{esperado, realizado?, confianza}], tipos:[E1..E14]}
  → packages/core/pronunciation: filtro por content/pronunciation/habilitados.yaml (D-151),
    regla de recurrencia (≥ 3 ocurrencias de alta confianza en ≥ 2 escenas), cruce gramática/pronunciación
  → guionado: feedback inmediato por plantilla de Lumi · libre: ítem de repaso, NUNCA interrumpe
```

**Reglas:** (1) un LLM **nunca** juzga fonemas; si redacta algo, es desde la salida estructurada y fuera de la boca de Lumi, que solo usa plantillas con id (ADR-008); (2) un tipo de error se muestra solo si `habilitados.yaml` lo habilita para ese uso (`guionado`, `libre`, `diagnostico`), y esa tabla sale de F0.1 (sin F0.1, todo `false`: solo percepción y autocomparación); (3) la confianza baja no se muestra; (4) el único efecto en vivo en habla libre es narrativo cuando el sentido se rompe (el NPC no entiende: escalón 1 de la escalera, §3.5.2); (5) el servidor nunca guarda audio; el cliente puede guardar hasta 20 clips en IndexedDB para "así lo dijiste vos / así suena", borrados al usarse o a los 7 días (`services/audio/clipStore.ts`, D-155); (6) sin clave o sin modelo, el adaptador queda apagado y lo que depende de él no se muestra.

**Costo:** ~US$0,02-0,05 por sesión de 20 min (techo US$0,08 si Azure contrasta todo el habla libre); US$0 para el operador mientras alcance el tier gratuito F0 de Azure (5 h/mes) (`research/pronunciacion-2026-10-06.md` §6.3). **Latencia objetivo:** p95 ≤ 1,5 s en momentos guionados (D-151).

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
  5. **Glosario curado:** toda traducción o nombre de objeto que muestra la interfaz referencia una entrada del glosario con `estado: approved` (D-067; en el build `MODE=fv` también `reviewed`, D-128). En el build de release (`npm run build:release`, §8.3), una entrada no aprobada referenciada falla el build; en el build de desarrollo (`npm run build`, el de `verify`), advierte. Por eso `verify` sigue verde con un glosario todo en `draft`.
  6. **Seguridad:** ninguna escena declara temas permitidos que choquen con la lista global de vedados; toda escena con un NPC de ficha `es_menor: true` (`02` §6.2.1; en la Región 1, Maya y Noor) declara contexto cotidiano y lugar público [GDD §2.17.1, §3.3.3]. La regla se dispara por el campo, nunca por una lista de nombres.
  7. **Sin datos personales:** lint de patrones (emails, teléfonos, URLs no permitidas) sobre todo el contenido.
- Las claves de los archivos son las del GDD (DP-A02). Ejemplo abreviado:

```yaml
# content/missions/M1.2.yaml
id: M1.2
titulo: "La cabra de Maya"
capitulo: 1
mcer: "A1"
can_do: "Puedo describir un animal con color, tamaño y un detalle"
requiere: [M1.1, intro:NPC-OLLIE]
npcs: [NPC-MAYA, NPC-OLLIE]
lenguaje_objetivo:
  estructuras: [STR-DESC-COLOR, STR-DESC-SIZE, STR-CONFIRM-Q]
criterios_exito:
  - id: C1
    texto_modelo: "player states at least 2 attributes among color/size/bell"
pociones:
  - { rama: describir, estructura: STR-DESC-COLOR }
saberes: [SAB-PUPILAS]
efectos:                       # los aplica el núcleo al cerrar la escena (§6.4.8, D-169, D-194)
  fundacion: { sitio: SITIO-PARADA, estado: fundado }
  intro: NPC-CALEB             # Ollie te presenta a Caleb ("Tell him Ollie sent you!")
  flag: clover_found
reapariciones: [M1.6, M2.6]
duracion_objetivo_min: 6
escenas:
  - escena_id: M1.2-E1
    npc: NPC-MAYA
    # … todos los bloques de GDD §2.5.3
  - escena_id: M1.2-E2
    npc: NPC-OLLIE
```

Los ids y nombres de la premisa v0.1 no se usan nunca en ejemplos ni fixtures: la lista está en `02` §0.5.1 y la vuelca `content/retired-ids.yaml`.

### 6.2 Glosario curado

- `content/glossary/en.es-AR.yaml`: `{id, l2, l1: [traducciones], pos, banda, audio_l2, audio_l1, ejemplo_l2, ejemplo_l1, estado (draft|reviewed|approved, D-067), revisado_fecha, notas}`.
- Es la **única** fuente de traducciones y nombres de objetos que la interfaz muestra como verdad [GDD §2.5.7]. La IA genera conversación; nunca traducciones mostradas como verdad.
- La revisión es humana (el operador o un revisor nativo); una corrida headless puede **proponer** entradas con `estado: draft` y nunca las pasa a `reviewed` ni `approved`.
- Tocar una palabra en un subtítulo generado: si la palabra está en el glosario, se muestra la entrada; si no, se ofrece "Marcar para repasar" sin traducción inventada. (La variante "traducción del modelo etiquetada como automática" de DP-A20 **no** es el default: ver D-068, gana el registro.)

### 6.3 Audio de líneas guionadas

- `scripts/audio/pregenerate-lines.ts` (manual, necesita clave; **no corre en CI ni en corridas headless sin autorización**): recorre las líneas guionadas, genera audio con la voz asignada a cada NPC (misma voz que en Live, DP-20 del GDD; verificar que el motor de TTS del proveedor ofrezca las mismas voces) y escribe `public/audio/lines/<lineId>.<hash>.ogg` + `content/audio-lines.manifest.json`.
- El nombre lleva el hash del texto + voz: si cambia el texto, el manifiesto marca la línea como desactualizada y el build lo advierte (en `build:release`, §8.3, falla).
- Mientras una línea no tenga audio, el cliente la muestra como texto + TTS en vivo (degradación aceptable en desarrollo).

### 6.4 Assets: modelos 3D CC0 repintados a la paleta y props por código (D-207; D-153 releída)

#### 6.4.1 Flujo

```
descarga del pack (KayKit, Quaternius, Kenney u otra fuente CC0; el operador elige y baja, D-029)  →  assets-src/<pack>/ (gitignored)
   → registro en content/assets-registry.yaml (obligatorio antes de usar)
   → scripts/assets/optimize.ts (gltf-transform):
        prune · dedup · weld · quantize · meshopt
        · descarta texturas y materiales de origen
        · asigna un token de la paleta a cada malla (tabla por pack) y pinta por vértice con @lg/art (la misma pintura que world/)
        · test diedro de aristas: rechaza la pieza salvo excepción declarada en el registro
        · personajes: cuerpos base con esqueleto y clips retargeteados a un solo esqueleto (plan estetica-c M3)
   → apps/web/public/models/<pack>/<pieza>.glb  (props y personajes; versionado en git)
   → scripts/assets/inspect-budgets.ts (triángulos, primitivas, tamaño; lo compara check:budgets)
   → layout del diorama en content/dioramas/<barrio>.yaml lo referencia como modelo/<pack>/<pieza> (o codigo/* para los props por código)
```

#### 6.4.2 Registro de licencias (obligatorio, `content/assets-registry.yaml`)

`{assetId, archivo, pack, autor, licencia (CC0-1.0 | CC-BY-4.0 | comercial-con-modificacion …), url_origen, fecha_descarga, sha256_original, modificaciones, atribucion_requerida, notas}`. El build falla si un archivo en `public/models`, `public/portraits`, `public/audio` o `public/textures` no tiene registro, si su licencia es "no comercial" o "solo uso personal" (D-153), o si un registro con `atribucion_requerida: true` no aparece en la pantalla de créditos generada. El modelo ONNX de ZIPA (CC BY 4.0) se registra igual aunque viva en el servidor. Los nombres exactos de los kits de Kenney y si los personajes traen rig y animaciones se verifican al descargar [GDD §5.7, DP-19].

#### 6.4.3 Layout de dioramas como datos

```yaml
# content/dioramas/plaza.yaml
id: plaza
bounds: { minX: -20, maxX: 20, minZ: -16, maxZ: 16 }
caminos:                 # curvas por puntos de control (x, z) con ancho en metros
  - { puntos: [[-20, 0], [-6, 1], [0, 0], [20, -2]], ancho: 2.6 }
agua:                    # estanques: hunden el terreno y no se caminan
  - { poligono: [[8, -8], [12, -8], [12, -4], [8, -4]] }
props:                   # codigo/* (constructores biselados) o modelo/<pack>/<pieza> (pipeline)
  - { asset: codigo/casa, pos: [4, 0, -6], tam: [5.2, 3.6, 4.2], rotY: 90, tinte: casa-1 }
  - { asset: codigo/arbol, tam: [1, 4.5, 1], instancias: [{ pos: [-8, 0, 3] }, { pos: [-9, 0, 6], rotY: 40 }] }
# (el esquema exacto, con terreno, rio y detalle, está en packages/content-schema/src/schemas/mundo.ts y en content/dioramas/test.yaml)
npcs:
  - { id: NPC-NELL, spawn: [6, 0, -3], ruta: [[6,0,-3],[8,0,-3]] }
sitios:                  # anclas de fundación (02 §4.1.3; F3.3): dónde se dibuja cada SITIO-* según su estado
  - { id: SITIO-TABLERO, pos: [0, 0, -1], ocupa: [[0,-1],[1,-1]] }
  - { id: SITIO-HUERTA,  pos: [3, 0, 4],  ocupa: [[2,3],[6,3],[6,7],[2,7]], caminable_en: [idea, en_marcha] }
no_caminable: [ { poligono: [[-20,-16],[20,-16],[20,-14],[-20,-14]] } ]
camara: { punto_dialogo_por_npc: { NPC-NELL: { offset: [1.5, 1.6, 2.5] } } }
```

(El ejemplo usa el id de diorama `plaza` = El Cruce, D-180. `02` §6.2.6 escribe `diorama: cruce` en una ficha de ejemplo: mientras revisión de arquitectura no renombre los ids, el contenido usa `plaza` y `muelle`, y la diferencia se reporta.)

Desde el plan estetica-c M7 (D-207) las claves `tiles` y `atlas_tiles` de HD-2D se rechazan con un mensaje que apunta a este formato (M5). El compilador genera: grilla de caminabilidad (celdas de 0,5 m), las curvas y el agua para `world/terrain/`, el estimado de presupuesto por tier (§6.4.5), la tabla de interactuables y la tabla de **anclas de sitios** (`validate:content` falla si una ficha de `content/fundaciones/` no tiene ancla en su diorama, si un ancla no tiene ficha, o si un estado que ocupa celdas deja a un NPC o interactuable sin camino; F3.3).

#### 6.4.4 Instancing y fusión

- Todo asset con ≥ 3 apariciones en un diorama se dibuja con instancias (una draw call).
- Props estáticos no interactivos que comparten el material toon se **fusionan** en build en pocas mallas por diorama (con tinte por vértice para conservar la paleta).
- Los interactuables quedan como mallas separadas (necesitan raycast, brillo y contorno).

#### 6.4.5 Validador de dioramas (falla el build)

Conectividad entre spawn del jugador, cada NPC e interactuable (BFS sobre la grilla); pasillos de al menos 2 celdas; presupuestos del tier `medium` (§2.7.1) estimados estáticamente: triángulos totales, draw calls estimadas (mallas fusionadas + grupos de instancias + interactuables + personajes), memoria de texturas.

#### 6.4.6 Ubicar por código sin editor

Las IA de código ubican assets escribiendo coordenadas en YAML. Para que el operador pueda corregir a ojo sin un editor: en modo desarrollo existe una superposición con la grilla (ejes y coordenadas) y un modo "click para copiar coordenadas" que pone en el portapapeles la posición del punto clickeado. No se construye un editor de niveles (DP-A16).

#### 6.4.7 Personajes y Lumi

- Personajes (desde D-207; plan estetica-c M3 y M5): **chibi 3D con esqueleto** de 2,5 a 3 cabezas, un cuerpo base CC0 repintado (KayKit) con cabeza por código y clips retargeteados a un solo esqueleto (idle, caminar, hablar, gestos); diversidad de los 14 vecinos de `02` §3.1 (D-166) por bloque `apariencia` en su ficha de contenido, que `validate:content` exige para todo NPC puesto en un diorama. Clover (la cabra, D-174) depende del pack de animales. El jugador también es un personaje con esqueleto.
- Animación fuera de pantalla o lejos: se congela; tope de personajes animados por tier (§2.7.1); durante la charla solo se animan el jugador y el NPC de la escena (§2.7.4).
- Lumi: **bicho de luz que viaja en un frasco** (D-165, reemplaza al farolito): núcleo emisivo chico por código + halo + estela, y el frasco de vidrio como volumen simple que el jugador lleva; sale del frasco y flota cerca del jugador (lo que siga valiendo de DP-39 del GDD). Es el objeto más trabajado pero también el más barato de producir.

#### 6.4.8 Mundo que reacciona al estado (fundaciones, red, saturación)

Regla (D-169, D-194): **el mapa es una vista del estado del mundo**, nunca al revés. Los efectos de misión (campo `efectos` de la misión o escena en el contenido: `fundacion: {sitio, estado}`, `intro: NPC-X`, `flag: …`) los aplica el núcleo al cerrar una escena (lo emite el servidor como evento, R8) y quedan en `world.fundaciones` y `world.red`; `world/foundations/` dibuja con funciones puras (`foundationVisuals`, `networkPaths`) y la saturación del Cruce sale de un selector (`selectCrossingSaturation`). Los créditos de cada fundación ("La hicieron Nell, June… y vos", `02` §1.8) se muestran al inspeccionar, en el HUD (DOM), desde un selector. Hasta F7 ese estado vive en memoria; F7 lo persiste en `SaveStore` (D-157). En el modo director, el snapshot incluye `foundations` y `network` (§6.5.2).

### 6.5 Modo director (solo desarrollo; FD0 y FD1; ADR-026)

**Qué es.** Una herramienta de desarrollo para que el operador juegue y corrija el contenido en el mismo momento, con un copiloto al costado (D-187: confirmado por el operador en el brief, 2026-10-06). No es una feature del juego y **nunca** llega a un build de producción. No confundir con el "director" de audio de `services/audio/` ni con las notas `[DIRECTOR]` del prompt del NPC (§5.5.3).

#### 6.5.1 Regla dev-only (contrato)

1. **Doble llave en el cliente:** el código del modo director solo se carga con `import.meta.env.DEV && import.meta.env.VITE_LG_DIRECTOR === "1"`, por `import()` dinámico desde la raíz de composición (`apps/web/src/boot/dev.ts`). En `vite build`, `import.meta.env.DEV` es `false` literal: la rama se elimina y el chunk no se emite (tree-shaking).
2. **Node aparte:** todo lo de Node vive en `tooling/director/` (workspace `private: true`, fuera de `apps/`): el plugin de Vite (`apply: "serve"`, nunca en `build`), la CLI, el servidor MCP y (FD1) el copiloto. `apps/**`, `packages/**` y `scripts/**` no lo importan (lint, §4.3.1).
   **Cableado del plugin (único camino):** el plugin se registra **solo** en `tooling/director/vite.config.ts`, que hace `mergeConfig(baseConfig, { plugins: [directorPlugin()] })` sobre la config importada de `apps/web/vite.config.ts` (con `root` en `apps/web`). `npm run dev:director` = `VITE_LG_DIRECTOR=1 vite --config tooling/director/vite.config.ts` (variable puesta con `cross-env` o el equivalente que ya use el repo, sin dependencia nueva si ya existe). `apps/web/vite.config.ts` **nunca** nombra ni importa el modo director: `npm run dev` y `vite build` usan esa config y, por construcción, no cargan el plugin. Así el build de producción queda libre del director **estructuralmente**, no solo por `apply: "serve"`. Lo garantiza la zona de lint `apps → tooling` (que cubre `apps/web/vite.config.ts`) y su fixture (FD0 A2). `apps/server` no depende de ningún SDK del director.
3. **Prueba de exclusión:** `check:budgets` incluye `check:dev-only`: después de `vite build` (también con `VITE_LG_DIRECTOR=1` en el entorno) recorre `apps/web/dist/**` y falla si encuentra un marcador (`__lg_director`, `/__director/`, `lg:director:`, `DirectorPanel`, `claude-agent-sdk`, `LG_ANTHROPIC`) o un chunk cuyo nombre empiece con `director`. Un test siembra un marcador en un `dist` de fixture y comprueba que el detector lo encuentra (sin falso verde).
4. **Solo local:** el plugin se niega a activarse si el servidor de desarrollo de Vite escucha fuera de `127.0.0.1`/`localhost` (misma regla que D-158) y lo dice en la consola.
5. **Nada sale de la máquina:** `.director/` está en `.gitignore`; el diario nunca guarda audio (D-108); la clave del copiloto nunca llega al navegador.

#### 6.5.2 v0 (FD0): estado vivo, herramienta para Claude Code, recarga en caliente, diario

- **Snapshot.** Tipo `DirectorSnapshot` (zod, `packages/protocol/src/director.ts`, versión `v: 1`): `{ v, sessionId, at, build: { contentHash, gitSha }, region, diorama, player: { tile: {x, y}, pos: {x, z}, facing }, nearby: [interactableId], scene: { missionId, sceneId, step, turnIndex } | null, path: [{ tile, at }], npcsTalked: [npcId], dialogue: [{ turnId, speaker, text, at }], worldFlags, foundations: { "SITIO-*": estado }, network: ["intro:NPC-*"], lastPick | null, contentErrors: [{ file, key, message }] }`. `step` es el estado de la máquina de escena (§3.5.1); `path` guarda solo cambios de celda (≤ 500, el más viejo sale); `dialogue`, las últimas 20 líneas finales. Lo arma **un** selector (`selectDirectorSnapshot`, en `apps/web/src/dev/director/`) que solo lee `state/selectors/`: ninguna capa del juego conoce al modo director. Los campos de fases que todavía no existen (escena, diálogo, fundaciones) salen `null` o vacíos: el selector no inventa nada; cuando un slice cambia de forma, el selector deja de compilar (`tsc` en `verify`) y la fase que lo cambió lo arregla.
- **Transporte.** El cliente manda el snapshot por el canal de HMR de Vite (`import.meta.hot.send("lg:director:snapshot", …)`) con throttle (≤ 4 por segundo y solo si cambió). El plugin escribe `.director/state.json` de forma atómica (temporal + rename) y expone `GET /__director/state` y `GET /__director/journal?session=<id>&tail=<n>` en el servidor de desarrollo.
- **Herramienta para Claude Code (el asistente al costado del navegador).** CLI `npm run director -- state | where | journal [--tail N] [--session ID] | sessions | content <id>` (sin dependencias nuevas; lee `.director/` y `content/`; `where` imprime una línea legible: diorama, celda, NPC cercano, misión y paso) y servidor MCP por stdio (`tooling/director/src/mcp.ts`; herramientas `director_state`, `director_journal`, `director_sessions`, `director_content_lookup`), registrado en `.mcp.json` (D-188). Los dos son cáscaras sobre `tooling/director/src/read.ts`.
- **Recarga en caliente del contenido.** El plugin observa `content/**` y, ante un cambio, corre la compilación **incremental** del contenido (la de `scripts/content/build.ts`, expuesta como función), valida (zod, referencias, lints de `validate:content`) y: si pasa, escribe la salida compilada y emite `lg:content:updated` con los ids tocados; `services/content/` recarga ese JSON y despacha `contentReloaded(ids)`; si cambió un diorama, el mundo re-deriva grilla y chunks; si una escena abierta usa un id tocado, el cambio aplica **en la próxima escena**, nunca a mitad de escena. Si no pasa, no se escribe nada, el juego sigue con el último contenido bueno y el error (archivo + clave) aparece en el overlay de Vite y en `contentErrors`. El servidor relee `apps/server/generated/content/` solo con `LG_DEV_CONTENT_WATCH=1` (`apps/server/src/content/loader.ts`), también para la próxima escena. Sin reiniciar nada.
- **Diario de sesiones de prueba.** `.director/journal/<sessionId>.jsonl`, solo agregar. Eventos `{ seq, at, type, … }` (esquema en `packages/protocol/src/director.ts`): `session.start` (sha de git, hash de contenido, tier), `move.cell`, `interact`, `scene.start`, `scene.end` (resultado, criterios cumplidos), `choice` (`pressDone`, `pressPass`, `choose` con la opción), `line` (texto final del turno, nunca audio), `content.reload` (ids, ok o error), `director.note` y `director.edit` (FD1), `session.end`. Retención: D-192.

#### 6.5.3 v1 (FD1): panel lateral con copiloto

- **Panel (DOM).** React + Tailwind en `apps/web/src/dev/director/panel/`, montado en su propia raíz (`#lg-director-root`) al costado del juego. Su estado (mensajes, pins, propuestas, conexión) vive en **un store Zustand propio de desarrollo** (`apps/web/src/dev/director/store.ts`), fuera del store del juego (los 9 slices de §3.3 no cambian). Lee el juego solo por `state/selectors/` y despacha solo `state/actions.ts`.
- **Clic en el mapa para fijar un lugar (respeta R3).** El panel pone el juego en `ui.pointerMode = "inspect"` (acción pública `setPointerMode`). En `inspect`, el clic de R3F sobre el suelo o un objeto de `world/` despacha por `state/bridge.ts` la acción semántica `pickTile({ diorama, tile, targetId? })`, que guarda `world.lastPick` en lugar de mover al jugador; en `play` (default) el mismo clic sigue siendo `moveTo`. El panel lee `selectLastPick` y lo agrega como **pin** al pedido (diorama, celda, ids cercanos, `SITIO-*` si hay). El mundo nunca importa el panel y el panel nunca toca objetos 3D.
- **Copiloto del lado del servidor.** `tooling/director/src/copilot/` usa el **Claude Agent SDK** (paquete `@anthropic-ai/claude-agent-sdk`, `query()` con herramientas y servidor MCP en proceso; **[supuesto: nombres y opciones se verifican contra la versión instalada, §0.5]**) dentro del proceso del servidor de desarrollo de Vite: `POST /__director/chat` con respuesta en streaming (SSE). La clave `LG_ANTHROPIC_API_KEY` la lee solo ese proceso; nunca lleva prefijo `VITE_`, nunca va al navegador, a un log ni al diario (tests). El modelo vive en `tooling/director/config.yaml`, nunca en código (como ADR-018). Todo detrás de la interfaz `CopilotRunner` (adaptador `agent-sdk` + adaptador falso con guion para tests).
- **Herramientas del copiloto (lista cerrada).** Lectura del repo (`Read`, `Glob`, `Grep`) y herramientas propias: `director_state`, `director_journal`, `content_validate(candidato)`, `content_apply(candidato, resumen)`, `content_revert(sha)`. `Write`, `Edit`, `Bash`, `WebFetch` y las demás herramientas de escritura o shell del SDK están deshabilitadas y un `canUseTool` las rechaza igual (doble llave). El prompt del copiloto se escribe en inglés (D-025) y lleva el snapshot, los pins, las últimas líneas del diario y las reglas de `02` §0.2 (sin dinero, sin datos personales, saberes con ficha, sin cifras).
- **Aplicar un cambio (orden fijo).** (1) **Ruta permitida** (D-190): solo `content/**/*.yaml` y `content/prompts/*.txt`; nunca `content/authoring/`, `content/assets-registry.yaml`, binarios, código ni `docs/`. (2) **Validación** del conjunto completo con el candidato superpuesto en memoria: zod + referencias + lints de seguridad y de banda (los de `validate:content`). (3) **Guardas de estado:** no sube `estado` de glosario a `reviewed`/`approved` ni de saberes a `verificado`/`revisado` (D-067, D-195), no reusa ids retirados (`content/retired-ids.yaml`) ni renombra ids existentes. (4) Si todo pasa: escribe, recompila (la recarga en caliente lo muestra) y **commitea** (D-191): primero `git add -- <rutas>` (necesario cuando el candidato **crea** un archivo nuevo, por ejemplo un NPC, un saber o una fundación: `git commit --only` con una ruta que git no conoce falla con *pathspec did not match*) y después `git commit --only -- <rutas>` con mensaje `director(content): <resumen>` y trailer `Director-Session: <id>`; si alguna ruta ya existente tenía cambios sin commitear del operador (se chequea **antes** de escribir y de `git add`), no aplica y lo dice. (5) Registra `director.edit` con el sha en el diario y muestra el diff en el panel. **Deshacer** = `git revert --no-edit <sha>`, solo si ese commit toca únicamente `content/` y los archivos no cambiaron después; si no, avisa y no fuerza nada. Nunca `push`, `reset --hard` ni reescritura de historia.
- **Costo.** Cada pedido registra uso (tokens) en `.director/cost.jsonl`; alerta según D-189. Las corridas headless nunca llaman al copiloto real (D-027): los tests usan el adaptador falso y un repo git temporal.

#### 6.5.4 Qué no hace

No es un editor visual de niveles ni de assets (DP-A16 sigue); no edita código, docs ni decisiones de `00`; no marca glosario ni saberes como revisados; no existe en producción; no guarda audio; no reemplaza las corridas headless (un cambio de mecánica sigue pasando por `/develop`).

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

- **Mientras F11 esté postergada (D-135, D-157, D-158):** las mismas fuentes de verdad viven detrás de interfaces (`EvidenceStore`, `SaveStore`, `LearnerStore` en `apps/server/src/store/`) con un adaptador de archivo append-only en `apps/server/data/` (gitignored), en un servidor local ligado a `127.0.0.1` con `LG_OPERATOR_MODE=1` y la cuenta seudónima `op-local`. F4.1 crea `EvidenceStore`; F7 completa guardado (incluye `world.fundaciones` y `world.red`) y modelo del alumno; F11.1 agrega el adaptador Postgres sin tocar a los consumidores.
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

**Regla del operador:** nada de Playwright ni navegador automatizado. La UI se verifica con `vitest` + `tsc` + `lint`; el operador revisa en el navegador. Excepcion acotada y RATIFICADA 2026-10-27 (con condicion: el navegador siempre se cierra al terminar): `npm run walk:browser` (`scripts/dev/browser-walk.ts`), a pedido, nunca en `verify`, CI ni Vercel, solo con modelos guionados (fila del 2026-10-26 en `00-decisiones.md`). Todas las pruebas automáticas corren sin GPU, sin micrófono, sin red y sin claves.

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
npm run check:budgets      # bundle + assets + check:dev-only (el build de producción no contiene el modo director, §6.5.1)
npm run build              # vite build (web + docente) + tsc del server + content build
npm run verify             # todo lo anterior en orden; es el gate de cada fase ("CI" en estos documentos = verify local; no hay servidor de CI, P0 R-op2)

npm run dev                # desarrollo; con VITE_LG_DIRECTOR=1 activa el modo director (FD0/FD1, §6.5)
npm run director -- …      # CLI del modo director (FD0)

npm run build:release      # NO está en verify: build estricto, solo antes de un deploy (MODE=release o MODE=fv)
```

**Build de desarrollo vs build de release.** `npm run build` (el que corre `verify`) es el **build de desarrollo**: las reglas de contenido que dependen de pasos humanos (glosario no aprobado referenciado, audio de línea desactualizado o faltante) **advierten** y no fallan. `npm run build:release` es el **build de release**: mismas salidas, pero esas reglas **fallan**; con `MODE=release` exige glosario `approved`; con `MODE=fv` acepta `approved` + `reviewed` y corre `scripts/fv/check-glossary.ts` (D-128). Lo crea la fase FV (antes no hace falta: nada se despliega). `build:release` **no** forma parte de `verify` ni de ninguna corrida headless: lo corre el `[operador]` (o un pipeline de deploy) antes de desplegar. Una corrida headless nunca interpreta "build" como build de release.

**Glosario en la interfaz (regla única, D-131).** El compilador de contenido escribe en el manifiesto compilado `glossaryDisplay: "dev" | "release" | "fv"` y el HUD filtra por ese valor: **dev** (`npm run dev` / `npm run build`, el de `verify` y el de los gates H1/H2 del operador) muestra `approved` sin marca y `reviewed`/`draft` con una marca visible "borrador"; **release** (`build:release` con `MODE=release`) solo `approved`; **fv** (`MODE=fv`) `approved` + `reviewed`, nunca `draft` (D-128). En los tres, una palabra sin entrada no se traduce (D-068).

Una fase de una corrida headless está terminada cuando `npm run verify` pasa (antes de F1.1 —P0, F0.1, F0.2— el gate es el comando local de la fase y no se crea `package.json` raíz, D-133) y el reporte incluye la lista de verificación manual para el operador. Un gate rojo no se "arregla" bajando el umbral sin un DP explícito.

---

## 9. Secuencia técnica de construcción y gates

Orden por dependencias técnicas (el roadmap de producto decide calendario y contenido). Cada paso termina con `npm run verify` verde.

| # | Paso | Entrega | Depende de |
|---|---|---|---|
| T0 | Bootstrap | Monorepo, TS estricto, ESLint con límites, vitest, scripts de gates vacíos, `.env.example`, README | — |
| T1 | Núcleo base | `runtime` (Clock/Rng), `save` con versión, `experiments`, `movement` (grilla, A*, colisión) con tests | T0 |
| T2 | Contenido mínimo | Schemas zod de todos los tipos, compilador, validaciones; contenido del prólogo (M0.1-M0.3) y diorama Muelle | T0 |
| T3 | Shell DOM + store | Slices, selectores, onboarding sin 3D, ajustes de accesibilidad, i18n es-AR, `dialog-only` | T1, T2 |
| T4 | Mapa HD-2D mínimo | Canvas diferido, `buildTileChunk`, billboards, `CameraRig` por presets, input semántico, Player con click y WASD, tiers con postprocesado y detección (§2.9) | T3 |
| T5 | Pipeline de assets | `optimize.ts` (volúmenes, atlas de tiles, hojas de sprites), registro, `inspect-budgets`, primeros packs en Muelle y Plaza | T2, T4 |
| T6 | Máquina de escena + modo texto | `core/scene`, `scene-runtime` con modelo de texto (fake en tests), moderación de texto, HUD de diálogo completo con barra de andamiaje y menú de silencio | T3, T2 |
| T7 | Voz | Gateway WS con dos adaptadores (Live portado de LT, sin `setup` del cliente; cascada) (§5.11), worklets de captura/VAD/reproducción con time-stretch, turnos manuales, fallback a texto, ledger de costo por adaptador y presupuesto | T6 |
| T8 | Observador + Lumi | Observer multimodal con schema, `decideCompanion`, señales, anotar, destilado, evocación, Lumi en el mapa y burbujas | T6 (texto) y T7 (voz) |
| T8b | Pronunciación | Servicio de pronunciación (§5.12), núcleo de recurrencia, momentos guionados, drills, clips locales | T8 |
| T9 | Progresión y repaso | Eventos de evidencia, pociones, árbol, Leitner (con ítems de pronunciación), andamiaje adaptativo, cuaderno | T8, T8b |
| T10 | Cuentas y datos | Postgres, migraciones, auth (adulto, clase, tutor), consentimientos, guardado, retención | T3 (puede empezar en paralelo desde T1) |
| T11 | Institucional mínimo | Panel docente, clases, códigos, asignaciones, reportes por can-do, pools de voz | T9, T10 |
| TD0 | Modo director v0 (solo dev) | Plugin de Vite, snapshot vivo, CLI + MCP, recarga en caliente de contenido (cliente y servidor), diario de sesiones, `check:dev-only` (§6.5.2) | T2, T3, T4 |
| TD1 | Modo director v1 (solo dev) | Panel lateral, `pickTile`/`pointerMode`, copiloto con Claude Agent SDK detrás de `CopilotRunner`, validar → aplicar → commit → deshacer (§6.5.3) | TD0, T6 |
| TF | Capa de fundaciones y red | Anclas `sitios`, `foundationVisuals`, `networkPaths`, saturación, créditos (§6.4.8) | T5 |
| T12 | Vertical slice (DP-10 del GDD) | Prólogo + Cap. 1 completos con audio pre-generado; lista de verificación manual del operador | todo lo anterior |

**Mapeo con las fases del roadmap:** T0-T1 = F1.1a/F1.1b (D-161); T2 = F1.2; T3 = F1.3; T4 = F2; TD0 = FD0; T5 = F3.1-F3.2; TF = F3.3; T6 = F4; TD1 = FD1; T7 = F5.1a, F5.1b, F5.2; T8 = F6; T8b = FP.1-FP.2; T9 = F7; T10-T11 = F11 (postergada, D-135); T12 = F8-F10. T4-T5 corren en paralelo a T6-T8b (D-020); TD0 va antes de las fases de contenido de misiones (F8) y TD1 después del HUD de diálogo (F4.2).

**Mapeo con las fases de la propuesta de terceros:** "Setup" = T0-T3; "Movimiento y Cámara" = T4-T5; "Sistema de Diálogos DOM" = T6-T8; "Grid y Construcción" y "Loop económico" **no existen en el modo 1** (DP-15 del GDD) y se reemplazan por "Loop de habla y pociones" = T8-T9.

**Experimentos que deben correr antes de cerrar decisiones** (no bloquean T0-T6): F0.1 en el arnés de LT y en `experiments/f0-voice-probe/` (costo por adaptador, EPR del observador, tabla de detección de pronunciación; decide D-148-D-151 y calibra el holdback), F0.2 con el spike HD-2D (calibra §2.7 y D-154), medición de ancho de banda en una escuela (DP-A06, postergada con el piloto).

---

## 10. Riesgos

| # | Riesgo | Probabilidad / impacto | Señal temprana | Mitigación en la arquitectura |
|---|---|---|---|---|
| R1 | **Términos del proveedor de IA vs menores:** la API de Gemini vía AI Studio podría no permitir servicios de probable acceso por menores; además, datos del nivel gratuito usados para entrenamiento | Media / muy alto (bloquea pilotos escolares) | Lectura de términos vigentes | Adaptadores de proveedor; default de adultos en API paga y migración a canal empresarial o a otro proveedor antes de menores (DP-A05); revisión legal |
| R2 | **La transcripción normaliza errores** del jugador o falla con acento rioplatense → el observador no ve errores o ve falsos | Alta / alto (el compañero pierde autoridad) | EPR por fuente en F0.1 | Observador siempre con audio (D-095); regla de D-149 (sin fuente confiable, Lumi solo anota con lenguaje tentativo) |
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
| R15 | **Detección de pronunciación poco confiable** con acento rioplatense: falsas alarmas que hacen desconfiar de Lumi, o normalización que esconde errores | Media / alto (la pronunciación es núcleo) | Tabla tipo E# × herramienta de F0.1 | Vara por tipo (D-151), solo tipos habilitados, confianza baja oculta, percepción y autocomparación siempre, nunca interrumpe (§5.12) |
| R16 | **Personajes de la maqueta** (D-207): no hay 14 aldeanos de campo CC0 listos; retargeting entre autores; costo de animar en `low` | Media / medio | Plan estetica-c M3 y M6 | Un cuerpo base repintado + cabeza por código + `apariencia` por ficha; un solo esqueleto de destino; congelado fuera de pantalla y tope por tier (§2.7.1) |
| R17 | **Precios de voz que se duplican** (Gemini, 2027-01-01) o retiro de un modelo | Alta / medio | Tabla de precios con fecha | Adaptador de cascada desde F5.1 (§5.11), ledger por adaptador, modelos en configuración |

---

## 11. ADRs (registro de decisiones de arquitectura)

Estado: **Propuesto** = decisión de la revisión de arquitectura que el operador valida; vale como contrato para corridas headless hasta que el operador la cambie. Cada ADR vive en `docs/adr/ADR-NNN-<slug>.md` (F1.1b copia ADR-001…026); un ADR respaldado por una fila `decidida` de `00-decisiones.md` se copia como **Aceptado** (ADR-001/003 por D-086/D-136, ADR-002 por D-087, ADR-022 por D-139, ADR-023 por D-092, ADR-028 por D-207; ADR-022 queda reemplazado por ADR-028); los ADR nuevos que propongan corridas futuras toman el siguiente número con el mismo formato.

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
| ADR-011 | Toon material único con rampa de 2-3 bandas para los **volúmenes** que lo necesiten; contornos solo en interactivos; el postprocesado pasa a ser efecto de tier (enmendado por ADR-022; enmendado por ADR-028: toon de 4 bandas con pincelada para todo el mundo, sin contornos en v1) (§2.8) | Contorno por postproceso; materiales PBR | Contornos perfectos en todo | Propuesto (enmendado 2026-10-06; enmendado 2026-10-13 por ADR-028) |
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
| ADR-022 | Render **HD-2D dentro de R3F**: tiles fusionados por chunk con atlas pixel (`nearest`), volúmenes simples, personajes como billboards, cámara ortográfica inclinada por presets, postprocesado por tier (§2.9) | 2D puro (Phaser/Pixi); mundo 3D low-poly (default anterior de la revisión de arquitectura, `07` opción B); motor aparte | Personajes 3D reutilizables en VR (el arte de personajes se rehace si se llega a VR) | Aceptado (D-139, decidida); **reemplazado por ADR-028** (D-207, 2026-10-13) |
| ADR-023 | Voz **híbrida**: `RealtimeVoiceProvider` con adaptadores Live y cascada que emiten los mismos eventos, elegidos por configuración; observador siempre con audio; ledger por adaptador (§5.11) | Solo Live; solo cascada; WebRTC propio | Una sola vía de voz más simple | Aceptado (D-092, decidida; el adaptador del piloto lo decide D-149) |
| ADR-024 | Servicio de **pronunciación** en el servidor: `ScriptedAssessor` (Azure PA) + `RealizationRecognizer` (ZIPA ONNX) con tabla de confusiones L1; núcleo puro de recurrencia y habilitación por tipo; LLM nunca juez; sin audio en el servidor (§5.12) | LLM multimodal como juez; ELSA/SpeechSuper como única fuente; reconocimiento en el navegador | Cobertura de todos los tipos de error desde el día 1 | Propuesto (D-150) |
| ADR-025 | **Costuras del día 1 R10-R15** (input semántico, cámara por presets, tiers como contrato, audio y voz detrás de interfaces, UI como view-models, plataforma detrás de un adaptador), con lint y tests (§3.1) | Agregarlas cuando llegue cada destino | Algo de indirección temprana | Propuesto (D-145) |
| ADR-026 | **Modo director solo de desarrollo** (§6.5): estado vivo por el canal de HMR de Vite a `.director/`, CLI + MCP para Claude Code, recarga en caliente del contenido, diario de sesiones; v1 con panel DOM con store propio, `pickTile` por `bridge.ts`, copiloto con Claude Agent SDK en un proceso de Node de desarrollo, cambios solo de contenido, validados y commiteados; doble llave `DEV && VITE_LG_DIRECTOR` + `check:dev-only` | Feature dentro del juego con bandera de runtime; editor visual de niveles; copiloto dentro de `apps/server`; llamar al modelo desde el navegador | Un poco de tooling propio que no se reusa en producción | Propuesto (D-187 decidida; forma: planificación, revisión de la revisión de arquitectura pendiente) |
| ADR-028 | Render **maqueta pintada dentro de R3F** (D-207, D-208): terreno por alturas, props redondeados por código y modelos CC0 repintados, personajes chibi con esqueleto, todo con un solo material toon de 4 bandas con pincelada y color por vértice; cámara `perspective3D` de lente largo y `dialogueFrame` de a dos; postprocesado por tier en chunk aparte (§2.8, §2.9). Reemplaza a ADR-022 y enmienda a ADR-011 | HD-2D (ADR-022, D-139); propuestas A y B de `docs/estetica/`; 3D low-poly genérico sin bisel ni pintura | La lectura de píxel de HD-2D; texturas pintadas a mano por pieza; contornos en v1 | Aceptado (D-207, decidida) |

**Enmiendas de P0 (`docs/reports/P0-2026-10-06.md` §1).** Son de "cómo" y no cambian ninguna decisión. Con el default de D-196 rigen como contrato y F1.1b las copia a `docs/adr/` marcadas "enmendado (P0)": ADR-003 y ADR-025 (lint con rutas resueltas y zonas exactas, §4.3.1), ADR-004 (`EvidenceStore` con adaptador de archivo, D-157), ADR-005 (pedir transcripciones de entrada y salida, actividad manual, audio binario, no loguear contenido), ADR-006 (inyección por `clientContent` con test contra el falso), ADR-007 (sonda F0.1 en modo manual), ADR-008 (observador multimodal), ADR-009 (`retired-ids`, `lint-allowlist`, salida fuera de git, D-159), ADR-010 (dos caminos: PNG para tiles y sprites (histórico; desde D-207 no hay tiles ni sprites de personajes), glTF para volúmenes), ADR-012 (`xr` reservado; render a resolución interna baja como opción a medir en F0.2), ADR-013 (nombres `@lg/*`; `test.projects` si `vitest.workspace.ts` está deprecado), ADR-014 (modo operador local, D-158), ADR-015 (holdback en `scene-runtime`; en cascada se modera antes del TTS), ADR-016 ("CI" = `verify`; DSP puro fuera del worklet; lint probado con `lintText`), ADR-018 (validación de modelos al arranque salteada en tests y sin clave), ADR-022 (post en chunk diferido como implementación; la fila de presupuesto la decide D-160), ADR-023 (contrato completo de P0 §4.3: `turnId` en todo evento, `npcTextFinal`, `interrupted`, `sessionEnding`, uso como unión discriminada; métodos `startTurn`, `endTurn`, `sendAudio`, `injectContext`, `interrupt`, `close`), ADR-024 (ZIPA en `worker_threads`, runtime probado desde Node en F0.1, D-163).

---

## 12. Decisiones pendientes (DP)

### 12.1 DP del GDD que son de arquitectura: recomendación de la revisión de arquitectura

| DP del GDD | Recomendación (default para corridas headless) | Dónde |
|---|---|---|
| DP-06 Fin de turno | Actividad manual desde el cliente + VAD local con umbral 3 s configurable (2,5-4 s o "solo botón") + botón `Terminé`; pulsar para hablar como opción y default en modo aula; audio solo durante el habla | §5.5.2, ADR-007 |
| DP-07 Técnica de "más despacio" | Instrucción al modelo por nivel + time-stretch OLA sin cambio de tono en el cliente (1,0 / 0,85 / 0,7); parámetro nativo de velocidad si la versión vigente lo ofrece | §5.5.4 |
| DP-14 Física | No en el modo 1; controlador cinemático en el núcleo | §2.4, ADR-002 |
| DP-36 Vía principal de voz | **Decidido por el operador (D-092, 2026-10-06): híbrida.** Live ahora + adaptador de cascada; F0.1 decide el del piloto (D-149) | §5.11, ADR-023 |
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
| DP-A15 | Observador con audio | Solo texto / texto + audio del turno | **Siempre texto + audio del turno** (actualizado 2026-10-06, D-095): la evidencia de normalización de los ASR es fuerte y el costo es ~US$0,0002/turno; F0.1 mide qué fuente usar (D-149) | R2 | §5.7 |
| DP-A16 | Herramienta para ubicar assets | Solo YAML / superposición de grilla en dev / editor de niveles | **YAML + superposición de grilla y "click para copiar coordenadas" en desarrollo**; sin editor | Menos piezas; el operador corrige a ojo | §6.4.6 |
| DP-A17 | Máquinas de estado | Tablas propias / XState | **Tablas de transición propias en el núcleo** | Cero dependencias; testeables | §3.5, ADR-021 |
| DP-A18 | Retención de audio (holdback) por banda de edad | Valores | **500 ms menores, 150 ms adultos**, ajustables tras medir la latencia de transcripción | Seguridad vs latencia | §7.7 |
| DP-A19 | Modelo de voz en tiempo real inicial | El que usa LT hoy / otro | **El modelo Live que usa LT hoy**, si sigue disponible al bootstrap; si no, el sucesor documentado | Reusa lo medido | §5.10 |
| DP-A20 | Traducción de palabras fuera del glosario | Ninguna (solo "marcar") / traducción del modelo etiquetada como automática | **Solo "marcar para repasar" en v1**; sin traducciones del modelo en la interfaz | Confianza: lección de Terra Alia [Referencias §4.2.2] | §6.2 |
| DP-A21 | Umbral de "error sistemático" | Conteo y ventana | **≥ 3 apariciones en 3 escenas distintas** | Separar desliz de patrón; ajustable con datos | §5.7 |

### 12.3 Sobre la propuesta de terceros (registro, no decisión de la revisión de arquitectura)

- **Adoptado como contrato:** Vite + React + TS, R3F + drei, Zustand, HUD DOM + Tailwind, 3D declarativo, "3D y DOM nunca directo; el estado es la única fuente de verdad", carpetas separadas por lógica / UI / 3D (§2, §3, §4). El "low-poly" de la propuesta lo reemplazó el operador por HD-2D (D-139, §2.9).
- **Ajustado:** Rapier → no en el modo 1 (ADR-002). Mundo abierto → dioramas por barrio [GDD §1.9]. "Lógica en hooks/stores" → lógica en un núcleo TS puro; los stores son delgados (ADR-003).
- **Diferido sin adoptar ni descartar:** grid de construcción, tycoon y loop económico → **DP-15 del GDD**, decisión del operador; la arquitectura deja el lugar (§3.6) y prohíbe construirlo en el modo 1.

---

## 13. Fuentes e insumos citados

| Etiqueta | Insumo |
|---|---|
| [Brief] | (documento interno) (decisiones del operador al 2026-10-04) |
| [GDD] | `learning-game/docs/01-gdd.md` v0.3 (2026-10-06; v0.1: 2026-10-05) |
| [Negocio] | (documento interno) (§3 unit economics de voz, §6 riesgos, §7 experimentos) |
| [Investigación] | (documento interno) y `20-evidencia.md` (defaults de feedback, ritmo, XP, repaso) |
| [Referencias] | (documento interno) (§4.4 implicaciones de stack) |
| [LT] | un prototipo de voz anterior: `server.js`, `server.ts`, `public/index.html` (configuración Live, audio, contabilidad), `teacher-config/prompts.json`, `teacher-config/rules.md`, `observer-knowledge-base.md`, `package.json` — leídos el 2026-10-05; no se leyó ningún archivo de secretos |

Afirmaciones técnicas sobre APIs de terceros (Gemini Live: actividad manual, transcripciones, velocidad de voz; términos de uso para menores; capacidades de drei, gltf-transform y Cloud Run) son de mi conocimiento a la fecha de corte y **deben verificarse contra la documentación vigente** en el bootstrap (regla 0.5).
