# 01 — Game Design Document (GDD) del juego objetivo

**Proyecto:** learning-game (título provisorio *Mundo Rush*, D-031) · **Documento:** GDD v0.2 · **Fecha:** 2026-10-06 (v0.1: 2026-10-05) · **Autor:** equipo de Mundo Rush
**v0.2 (2026-10-06):** integra las respuestas del operador (`00-decisiones.md` §1.1): título *Mundo Rush*; por ahora el juego es para el operador (D-135); arte **HD-2D** (D-139, §5); **pronunciación núcleo** (D-044, §2.4.7, revierte DP-27); mapa recorrible desde el arranque (D-020). Las filas DP de §9 que el operador decidió apuntan a su `D-NNN`; manda `00-decisiones.md`.
**Estado:** borrador de visión y especificación del modo 1. Pendiente de la revisión de arquitectura antes de que cualquier corrida headless construya a partir de él.
**Idioma del documento:** español. Las líneas de diálogo de NPCs están en inglés porque es la lengua meta del primer par (español → inglés).

> **Objetivo de este documento, en una frase:** describir el juego que queremos tener terminado (los cinco modos como visión, el modo 1 especificado al detalle con su guion) de forma tan completa que una corrida headless pueda diseñar, construir y verificar el modo 1 sin preguntarle nada a nadie, usando los defaults recomendados en cada decisión pendiente.

---

## Índice

0. Cómo usar este documento (contrato para corridas headless)
1. Visión
2. Modo 1, especificación completa
3. Guion del modo 1 (mundo, personajes, arco, catálogo de misiones, escenas escritas)
4. Modos 2 a 5 (visión)
5. Dirección de arte, cámara, UI y audio
6. Métricas y experimentos
7. Glosario
8. Fuera de alcance
9. Preguntas abiertas y registro de decisiones pendientes (DECISION-PENDING)
10. Fuentes citadas

---

## 0. Cómo usar este documento (contrato para corridas headless)

### 0.1 Insumos que este GDD cita y no rehace

| Insumo | Ruta | Qué aporta |
|---|---|---|
| Brief del proyecto (decisiones del operador, vinculantes) | (documento interno) | Modos, pares de idioma, mercado, público ATP, quién paga, definición de "accesible" |
| Análisis de negocio (interno) | (documento interno) | Costo de voz cuadrático con la duración → escenas cortas; mapa competitivo; experimentos de validación; riesgos (menores, 3D vs accesibilidad) |
| Investigación | (documento interno) y `20-evidencia.md` | Defaults de diseño con etiqueta de evidencia (E1-E37) |
| Referencias de juegos | (documento interno) | Qué copiar y qué evitar de Terra Alia, Influent, Noun Town y otros; cámara asistida; modo bajo; Rapier probablemente sobra |
| Proyecto de voz reutilizado | un prototipo de voz anterior | Proxy Node.js + WebSocket a Gemini Live (voz), modelo de texto para gramática/observador/debrief, TTS Deepgram Aura, reglas de disfluencia, perfil del alumno, modos "conversation" y "correction", tope de sesión ~15 min del lado del servidor |

En adelante se citan como **[Brief]**, **[Negocio §x]**, **[Investigación §x / Ex]**, **[Referencias §x]** y **[Prototipo de voz]**.

### 0.2 Etiquetas de evidencia

Cuando una regla de diseño se apoya en investigación, lleva la etiqueta de la investigación:

| Etiqueta | Significado |
|---|---|
| [Probado] | certeza alta o moderada |
| [Probable] | certeza baja |
| [Hipótesis] | certeza muy baja o sin estudios |
| [En disputa] | la evidencia apunta en direcciones opuestas |

Una regla sin etiqueta es una **decisión de diseño** (gusto, producto, costo o seguridad), no una afirmación sobre aprendizaje. No hay que confundirlas.

### 0.3 Reglas para una corrida headless que lea este GDD

1. **Orden de autoridad:** el único vigente es el de `00-decisiones.md` §0.3 (brief y decididas > defaults de `00` > `04` > `03` > `01` > `02` para construcción; `02` > `01` solo para la redacción del contenido). Si este documento contradice un documento de mayor autoridad, gana ese y la contradicción se reporta. Los defaults de las DP de este GDD se reemplazan por los de `00-decisiones.md` (§9 traduce `DP-NN` → `D-NNN`): **si difieren, gana el registro**.
2. **Cada `DECISION-PENDING` tiene un default recomendado.** Si el operador no la resolvió, la corrida usa el default, lo anota en su reporte y sigue. Nunca se frena por una DP.
3. **Nunca se adopta ni se descarta en silencio** algo marcado como DP. Si una corrida necesita apartarse del default, lo reporta como desvío explícito.
4. **Las reglas inviolables (§1.4) no son DPs.** No hay default que las relaje.
5. **El modo 1 no tiene dinero.** Ninguna corrida agrega monedas, tiendas, precios ni economía al modo 1. La economía tipo tycoon queda como candidata del modo 2 (DP-15).
6. **Lo que es arquitectura lo decide la revisión de arquitectura.** Este GDD describe *qué* hace el juego y *por qué*. Donde nombra tecnología (R3F, Zustand, Gemini Live) lo hace como restricción heredada o propuesta, no como diseño de arquitectura.
7. **Los IDs son estables.** Misiones (`M1.3`), NPCs (`NPC-BEN`), habilidades (`HAB-PEDIR-1`), decisiones (`DP-07`). Una corrida que cambie contenido conserva el ID o crea uno nuevo; nunca reutiliza un ID para otra cosa.
8. **Sin datos personales** en contenido, logs ni fixtures. Los nombres de NPCs son ficticios.

---

## 1. Visión

### 1.1 Título provisional y una línea

- **Título provisorio:** *Mundo Rush* (decidido por el operador, D-031). *Lantern Bay* (*Bahía de los Faroles*) queda como nombre del pueblo en la ficción. Antes de cualquier uso comercial se verifica la marca.
- **Una línea:** un pueblo costero que se apagó porque sus vecinos dejaron de hablarse, y vos llegás como voluntario para encender la Noche de los Faroles ayudando a cada vecino en su idioma; cada favor se resuelve hablando, y un farolito flotante te acompaña sin apurarte.
- **Una línea de producto:** el lugar donde practicar hablar una segunda lengua no da vergüenza, no cuesta pelearse con el mundo y se siente como jugar.

### 1.2 El problema que resuelve

- Aprender a **hablar** una segunda lengua requiere producir oraciones con alguien que te responda. Eso es caro (profesor, intercambio), da vergüenza (ansiedad de L2, asociada a peor logro, r = −.36 [Probado], [Investigación §1 / E1]) y muchas veces no está disponible.
- Las apps dominantes enseñan reconocimiento y frases sueltas con mecánicas de hábito (rachas, ligas) y ya regalan conversación con IA sin mundo [Negocio §2].
- Los juegos de idiomas que existen tienen mundo pero no conversación (Influent, Terra Alia, Noun Town con NPCs guionados) [Referencias §0, §3].
- En Argentina y Brasil la habilidad más débil es justamente la oral (Brasil: speaking 464 vs reading 516 en EF EPI 2025) [Negocio §1.2].

### 1.3 Pilares

Los cuatro pilares ordenan todas las decisiones. Si dos chocan, gana el de número menor.

**P1. Accesible (en el sentido del operador).** "Accesible" es *el dispositivo y las formas de aprender*: que cualquiera pueda tener una segunda lengua sin pelear contra el mundo [Brief].
- Corre en una PC modesta de escuela, en navegador, sin instalar nada. Hay modo gráfico bajo obligatorio [Referencias §4.4].
- Se puede jugar sin micrófono (modo texto completo).
- Nada de lo que es accesibilidad se desbloquea con progreso: velocidad, subtítulos, tamaño de letra, modo texto, pausas, están siempre disponibles.
- Es pago, lo más barato posible pero sustentable; **el que paga financia al que no** (instituciones, grants) [Brief].
- No exige saber jugar videojuegos: controles mínimos, cámara que acompaña sola desde arriba (sin órbita libre), sin reflejos.

**P2. Jugar primero, aprender adentro.** El jugador está ayudando a un vecino, no "haciendo una lección". El idioma es la herramienta para lograr algo en el mundo, nunca un examen pegado al costado.
- Cada misión se resuelve **hablando** (o escribiendo en modo texto). Si una misión se puede completar sin usar la lengua, está mal diseñada [Referencias §4.2.1].
- Las misiones son tareas en el sentido de TBLT: resultado no lingüístico, lengua como medio [Investigación §2.4 / E29, E7] [Probable].

**P3. Hablar sin presión.** Ningún reloj, ningún castigo, ninguna humillación.
- La baja ansiedad y el disfrute se asocian con más disposición a hablar [Probado como asociación, E1, E3].
- El NPC no te interrumpe; el silencio es tuyo y lo cerrás vos (botón) [Hipótesis, E10], con ritmo ajustable (función de comodidad; efecto en aprendizaje [Hipótesis], E9).
- El compañero corrige poco, breve y con respeto, y te deja autocorregirte [Probable, E31, E32].
- No hay rachas, ni recompensas por entrar cada día, ni tablas de líderes en el modo 1 [Probado en laboratorio que las recompensas esperadas contingentes a participar socavan la motivación intrínseca, más en niños, E12, E14].

**P4. Un mundo que te recuerda.** Los vecinos recuerdan lo que hiciste y lo que dijiste; las palabras que te costaron vuelven en situaciones nuevas, más espaciadas cada vez [Probado para espaciado y evocación, E34]. El pueblo se ilumina a medida que demostrás lo que sabés.

### 1.4 Reglas inviolables (no son decisiones pendientes)

1. **El modo 1 no tiene dinero ni economía.** La única "moneda" es la poción de conocimiento, y refleja competencia demostrada.
2. **Sin rachas, sin premios por login diario, sin castigos por faltar, sin tablas de líderes, sin cajas de botín, sin compras dentro de la partida que den ventaja.**
3. **Ninguna función de accesibilidad se bloquea detrás de progreso o de pago.**
4. **No hay estado de fracaso punitivo.** Nunca se pierde progreso, pociones ni relación con un NPC por equivocarse.
5. **Los NPCs no salen del guion de seguridad.** Cada escena tiene un tema permitido; la IA no deriva a temas inseguros, no pide datos personales y no tiene charla libre sin marco (ver §2.17).
6. **El compañero nunca presiona:** no apura, no cuenta tiempo en voz alta, no compara con otros jugadores.
7. **La lengua circula por la mecánica:** sin uso de la lengua no hay resolución de la misión.
8. **El mundo 3D y la interfaz DOM no se hablan directamente.** El estado del juego es la única fuente de verdad (regla de arquitectura heredada de la propuesta de terceros; ver §1.9). La revisión de arquitectura define cómo.

### 1.5 Audiencia

> **Por ahora (D-135, 2026-10-06):** el juego se construye **para el operador** (usuario único, adulto, hispanohablante que aprende inglés). Él decide jugando qué funciona; no hay usuarios externos, precio ni piloto en esta etapa. La audiencia de abajo es la del producto cuando se abra: sigue guiando el diseño (accesibilidad, PC modesta, datos de menores), pero ninguna fase espera validarla todavía. El primer piloto, cuando llegue, es con adultos (D-023).

| Eje | Decisión | Fuente |
|---|---|---|
| Edad | ATP (apto todo público). Incluye menores → cumplimiento de datos de menores desde el diseño | [Brief] |
| Mercado | Argentina primero, luego Brasil | [Brief] |
| Pares de idioma, en orden | ES → EN; luego ES → PT; luego PT → EN | [Brief] |
| Quién paga | Principalmente instituciones (escuelas, institutos, ONG, gobierno); consumidor pago a precio mayor que el techo LatAm estimado, con versión gratis generosa | [Brief] |
| Nivel | A0 (pre-A1) a B1 en la v1 del modo 1 | Tarea de este GDD |

**Perfiles de jugador (personas de diseño, ficticias):**

| Persona | Edad | Contexto | Qué necesita del juego |
|---|---|---|---|
| "La alumna de escuela" | 11-15 | Usa la PC del laboratorio de la escuela; profesora de inglés asigna misiones con código de clase; a veces sin auriculares buenos | Que cargue rápido en PC vieja; modo texto si no hay micrófono; que no le dé vergüenza frente a compañeros; progreso visible para la docente |
| "El adulto que necesita hablar" | 18-35 | Trabajo remoto o entrevista en inglés; sabe leer pero se traba al hablar | Práctica oral real sin juicio; sesiones cortas en la noche; feedback útil |
| "La persona mayor curiosa" | 55+ | Quiere viajar o hablar con nietos que viven afuera; poca experiencia con videojuegos | Controles mínimos, letra grande, ritmo lento, explicación en su idioma |
| "El docente" | adulto | Coordina un curso; necesita horas de práctica oral entre clases | Códigos de clase, asignar misiones, reportes por "puedo hacer" (can-do), sin tener que escuchar audios |
| "El tutor o tutora (guardian)" | adulto | Responsable de un menor que juega en casa | Consentimiento, control, ver qué se guarda, borrar datos |

### 1.6 Plataforma

- **v1: PC en navegador web** (Chrome, Edge, Firefox recientes; Safari macOS como objetivo secundario). Sin instalación. Teclado + mouse; jugable solo con teclado y solo con mouse.
- **Celular queda abierto**, no es el arranque [Brief]. El diseño evita lo que haga imposible portar después: interfaz que escala, objetivos táctiles de al menos 44 px en la capa DOM, ninguna mecánica que requiera hover o teclas múltiples simultáneas. Ver **DP-31**.
- **Hardware objetivo mínimo (propuesta, a medir):** PC de 4 GB de RAM con gráficos integrados, conexión de 1-2 Mbps estable para voz. El benchmark de hardware es el experimento #5 de el análisis de negocio [Negocio §7].
- Tensión nombrada: en Brasil el 87% de las clases DE accede solo por celular [Negocio §6.3]. "PC primero" sirve primero al que paga. Es secuencia, no olvido.

### 1.7 Qué lo hace distinto

| Producto | Qué hace | Qué no hace (y nosotros sí) |
|---|---|---|
| **Duolingo** (Super/Max) | Lecciones cortas, rachas, ligas; videollamada con personaje IA, casi gratis | No hay mundo, ni misiones con consecuencia, ni compañero que espere tu silencio. Su motor de hábito son rachas y ligas, que nosotros evitamos por diseño (P3). Nuestro diferencial no es "hablar con IA" (ya es commodity [Negocio §2.1]) sino mundo + compañero + L1 latinoamericano + accesibilidad |
| **Noun Town** | Mundo 3D, +1.000 palabras, reconocimiento de voz con 16 NPCs **guionados**, SRS, rachas y metas diarias; herramientas docentes y licencias de grupo | Sus NPCs no conversan de verdad; usa rachas. Es el benchmark institucional a superar [Referencias §3] |
| **Terra Alia** | RPG isométrico; palabras = magia; voz de palabras sueltas poco precisa | Combate desconectado del aprendizaje, traducciones erróneas, bugs, cámara rígida [Referencias §1.4]. Nosotros: sin combate, misiones que se resuelven hablando, glosario curado |
| **Influent** | Departamento 3D; click en un objeto y escuchás su nombre | Sin gramática, sin habla, poco contenido [Referencias §2]. Nosotros copiamos el "nombrar en contexto espacial" (habilidad base del compañero) y le sumamos conversación |
| **SpeakRPG** | RPG ligero con voz y un gato compañero, iOS | El concepto existe, la tracción no [Negocio §2]. Nosotros: web, PC, L1 latinoamericano, instituciones |

**Resumen del diferencial:** (a) conversación real por voz con objetivos dentro de un mundo, (b) un compañero pedagógico que corrige poco, a tiempo y sin presión, (c) silencios y ritmo en manos del alumno, (d) progreso que informa competencia en vez de pagar por participar, (e) hecho para instituciones latinoamericanas y para PCs modestas.

### 1.8 Los cinco modos de un vistazo

| # | Modo | Estado | Relación con el modo 1 |
|---|---|---|---|
| 1 | **RPG del bien** (Lantern Bay) | Se construye primero | Núcleo: habla, misiones prosociales, compañero, pociones |
| 2 | **Contar y construir** (storytelling / world-building) | Visión; año 2 | Se desbloquea con habilidades narrativas del modo 1; candidato para la mecánica de construcción tipo tycoon (DP-15) |
| 3 | **Mi día real** (calendario, notas, mail, mensajería) | En suspenso | Reutiliza el compañero fuera del juego; riesgo de privacidad alto |
| 4 | **Media** (canciones, videos, en vivo o diferido con un agente) | Visión | Personajes musicales del pueblo como puente |
| 5 | **Viaje y cultura** | Sin desarrollar | Otros pueblos/destinos; puerta natural para nuevos pares de idioma |

### 1.9 La propuesta de terceros ("prompt para Claude Code") y qué se hace con ella

El operador compartió un prompt que propone un MVP "RPG de mundo abierto + construcción tipo RollerCoaster Tycoon + negocio + narrativa" con un stack y reglas de arquitectura. Este GDD **separa lo que se adopta, lo que se difiere y lo que choca**:

| Elemento del prompt | Tratamiento en este GDD |
|---|---|
| Vite + React + TS, React Three Fiber + drei, Zustand, HUD en React DOM + Tailwind | Se toma como **stack propuesto** (coincide con el [Brief]). Decide la revisión de arquitectura |
| Rapier (físicas) | **DP-14**, default: no en el modo 1 (la investigación de referencias §4.4: el movimiento es caminar e interactuar) |
| Código 3D declarativo como componentes | Adoptado como restricción heredada (la revisión de arquitectura confirma) |
| "El mundo 3D y la UI nunca se comunican directamente; el estado global es la única fuente de verdad" | **Adoptado como regla inviolable** (§1.4.8). Además habilita el plan B 2D/2.5D que pide la investigación de referencias: la lógica no depende del render |
| Estilo low-poly, correr fluido en web | "Correr fluido en web" adoptado; el estilo lo reemplazó el operador por **HD-2D** (D-139, §5) |
| Carpetas separando lógica, UI DOM y render 3D | Adoptado como requisito; la revisión de arquitectura define la forma |
| Mundo abierto en tercera persona | **Reducido:** un pueblo chico tipo diorama, con zonas, visto desde arriba en ángulo (D-053), no mundo abierto [Referencias §4.4.1] |
| Construcción tycoon, desarrollo de negocios, economía | **Choca con el modo 1** (sin dinero, centrado en el habla). Se difiere como candidato del modo 2. **DP-15** |
| Fases: Setup, Movimiento y Cámara, Grid y Construcción, Diálogos DOM, Loop económico | El roadmap usa Setup, Movimiento y Cámara (a la par del diálogo, D-020) y Diálogos; "Grid y Construcción" y "Loop económico" pasan al modo 2. Las fases del modo 1 reemplazan el loop económico por "Loop de habla y pociones" |

---

## 2. Modo 1, especificación completa: "RPG del bien" (Lantern Bay)

### 2.1 Resumen del modo

El jugador llega en ferry a Lantern Bay, un pueblo costero angloparlante ficticio, como voluntario de la Noche de los Faroles. La organizadora del festival está en reposo y el pueblo se fue quedando callado: los vecinos dejaron de hablarse y de ayudarse. El jugador recorre el pueblo, conoce a los vecinos y los ayuda con pedidos concretos (encontrar un perro, completar un pedido de panadería, explicar un síntoma en la veterinaria, convencer al consejo de que se haga el festival). Cada pedido se resuelve **hablando** con NPCs en inglés. Un farolito flotante, Lumi, escucha, ayuda si se lo pedís, corrige poco y te recuerda lo que vale repasar. Lo que demostrás saber se destila en pociones de conocimiento que abren habilidades lingüísticas útiles y van encendiendo el pueblo.

### 2.2 Bucles de juego (core loop)

#### 2.2.1 Minuto a minuto (dentro de una escena)

```
Escuchar al NPC (subtítulo opcional, velocidad elegida)
   → pensar (el silencio es tuyo; nada se apura)
   → hablar (o escribir)
   → el NPC reacciona en el mundo (gesto, objeto, información nueva)
   → si hubo un error que rompe el sentido o es el objetivo de la misión: Lumi da una señal breve para autocorregirte
   → repetir hasta lograr el objetivo de la escena
```

- **Duración de un turno:** el NPC habla en frases cortas acordes al nivel (A0: 3-6 palabras; A1: 1 oración simple; A2: 1-2 oraciones; B1: 2-3 oraciones).
- **Proporción de turnos:** el diseño prioriza turnos de **producción** del jugador sobre turnos de escucha [Probable, la investigación §2.5 / E6]. Regla de escritura de escenas: el NPC nunca habla dos turnos seguidos sin dar lugar a que hable el jugador, salvo en la apertura guionada.
- **Recursos de andamiaje siempre visibles** (barra inferior): `Repetir`, `Más despacio`, `Pista`, `Terminé de hablar` / `Pasar el turno`, `Escribir en vez de hablar`, `Marcar para después` (pedirle a Lumi que anote algo que querés repasar).

#### 2.2.2 Sesión (10 a 20 minutos)

```
Entrar → (opcional) Repaso de bolsillo de 60-90 s
   → elegir una misión del tablero de pedidos o hablar con un vecino con ícono de farol
   → misión (1 a 3 escenas cortas, 2-4 min de voz cada una)
   → cierre de misión: Lumi destila pociones (qué demostraste) + mini-repaso de evocación de 1-3 ítems
   → farol del barrio se ilumina un poco más
   → (opcional) otra misión
   → al terminar 2-4 misiones o ~20 min, Lumi sugiere un buen lugar para parar, sin culpa
```

- La sesión está pensada para ser **corta y repetible**. Los juegos de varias sesiones superan al control y los de una sola no [Probable, E23]; espaciar mejora la retención [Probado, E34]. No hay evidencia de una duración óptima en minutos [Hipótesis, la investigación §2.6]; los 10-20 min son una decisión de diseño y de costo [Negocio §3.2].
- **Guardado:** automático al terminar cada escena y al cerrar la pestaña. Nunca se pierde más que la escena en curso.

#### 2.2.3 Meta (días y semanas)

```
Ayudar vecinos → demostrar competencias → pociones por rama
   → abrir habilidades (nuevas opciones de diálogo, NPCs que antes no hablaban con vos, lugares, tipos de misión)
   → nuevas misiones más exigentes (siguiente nivel MCER)
   → lo que te costó reaparece días después en otras situaciones (repaso espaciado dentro de las misiones)
   → encender los cuatro faroles de barrio → Noche de los Faroles (final del arco)
   → después del final: el pueblo sigue con pedidos diarios generados por plantillas (fuera de la v1)
```

- **Por qué volver mañana:** un vecino quedó esperando una respuesta ("Come back tomorrow, the bread will be ready"), un ítem de repaso está listo, una habilidad recién abierta habilita una misión nueva. Ninguna razón es "perder la racha".
- **Recordatorios:** solo si el jugador o el docente los activan, sin recompensa asociada (DP-24).

### 2.3 Estructura de misiones como tareas (TBLT)

#### 2.3.1 Principio

Cada misión es una **tarea**: un resultado no lingüístico (que el vecino consiga algo) que exige usar la lengua, con un diálogo que el sistema guía hacia una meta. La charla libre abierta no es la forma con mejor respaldo; los sistemas orientados a meta y guiados rinden más [Probable, la investigación §2.4 / E7, E29]. Mezclar modalidades (hablar + leer o escribir) rindió más [Probable, §2.4].

#### 2.3.2 Las tres fases de cada misión

| Fase | Qué pasa | Duración | Quién la conduce |
|---|---|---|---|
| **Pre-tarea** ("Lumi te cuenta") | Lumi presenta la situación en L1 (o L2 según nivel, DP-03), muestra 2-4 "piezas útiles" (chunks) que podrían servir, sin obligar a usarlas. En A0-A1 se puede escuchar cada pieza y repetirla en voz baja (opcional). | 20-40 s | Guionada |
| **Tarea** (escena o escenas con NPC) | Conversación con objetivo. El NPC necesita algo; el jugador tiene que obtener o dar información, pedir, negociar, explicar. El NPC reacciona en el mundo. | 2-4 min por escena, tope duro 5 min (§2.5.5) | IA con guion de escena |
| **Post-tarea** ("Lumi destila") | Resultado en el mundo (el perro vuelve, el pan sale del horno). Lumi nombra lo que demostraste (pociones) y hace 1-3 preguntas de evocación sobre lo marcado ("¿Cómo le pediste el pan a Ben?") | 40-90 s | Guionada + datos de la escena |

#### 2.3.3 Ficha de misión (contenido como datos)

Cada misión se define como un registro de contenido, no como código. Una corrida headless crea misiones llenando esta ficha. El formato concreto (YAML, JSON, TS) lo decide la revisión de arquitectura; los campos son de diseño:

| Campo | Descripción | Ejemplo (M1.2) |
|---|---|---|
| `id` | Estable | `M1.2` |
| `titulo` | En L1 para el menú | "El perro de Lily" |
| `capitulo` | 0-4 | 1 |
| `mcer` | Banda objetivo | A0→A1 |
| `can_do` | Enunciado "puedo..." en L1 | "Puedo describir un animal con color y tamaño" |
| `resultado_mundo` | Qué cambia si sale bien | Biscuit vuelve con Lily; aparece el ícono de la plaza |
| `npcs` | IDs | `NPC-LILY`, `NPC-SAM` |
| `escenas` | Lista de escenas con su guion (§2.5.3) | 2 escenas |
| `lenguaje_objetivo` | Funciones y piezas | colores, tamaños, "Is this your dog?", "It's small and brown" |
| `criterios_exito` | Qué tiene que pasar en la conversación para que el NPC "entienda" | El jugador transmite al menos 2 rasgos del perro y una pregunta de confirmación |
| `andamiaje` | Pistas en 3 niveles (§2.10) | P1: "Lily wants to know: color?"; P2: dos opciones; P3: frase modelo |
| `pociones` | Rama y evidencia | Ámbar (social) por pregunta de confirmación; azul (describir) por rasgos |
| `items_repaso` | Qué entra al banco de repaso si se marca | "brown", "It's small" |
| `reapariciones` | En qué misiones futuras se fuerza el uso | M1.6 (perro en la panadería), M2.3 |
| `seguridad` | Tema permitido y temas vedados | Mascotas, colores, la plaza. Vedado: datos personales del jugador |
| `modo_texto` | Equivalente escrito | Idéntico, con entrada por teclado y opciones sugeridas |
| `duracion_objetivo` | Minutos de voz | 3 |

#### 2.3.4 Tipos de tarea usados en el modo 1

| Tipo de tarea (TBLT) | Ejemplo en el pueblo | Funciones de lengua |
|---|---|---|
| Brecha de información (info gap) | Lily sabe cómo es su perro; vos lo viste. Hay que juntar los datos | Describir, preguntar, confirmar |
| Transacción | Pedir prestados los ingredientes para el pan del festival | Cantidades, pedir, agradecer, **sin dinero ni precios** (el jugador lleva una lista y una canasta prestada; los vecinos dan, no venden) |
| Orientación | Guiar al cartero que se perdió en la niebla | Direcciones, lugares, preposiciones |
| Resolución de problema | Explicar a la veterinaria qué le pasa a un gato | Síntomas, partes del cuerpo, tiempo |
| Narración / reconstrucción | Contarle a la bibliotecaria qué pasó la noche de la tormenta | Pasado simple, secuencia |
| Toma de decisión | Elegir con Nadia qué plantar para el festival | Opinar, comparar, acordar |
| Persuasión / negociación | Convencer al consejo de que se haga la Noche de los Faroles | Argumentar, condicionales, cortesía |
| Mediación (puente) | Ayudar a dos vecinos peleados a entenderse | Reformular, resumir, suavizar |

> **Nota sobre "transacción sin dinero":** en el modo 1 nadie vende ni cobra. El pueblo funciona por favores y préstamos. Esto respeta la regla inviolable 1 y mantiene la práctica de cantidades y pedidos.

### 2.4 El compañero flotante: Lumi

> Nombre y forma provisionales: **DP-02**. Referencia funcional: el personaje que flota sobre el corredor en un juego de carreras y aparece cuando hace falta. No se usa ninguna propiedad intelectual de terceros.

#### 2.4.1 Quién es

- **Qué es:** un farolito de papel con una lucecita adentro, el último espíritu de los faroles del pueblo. Flota a la altura del hombro del jugador, un poco detrás, con un balanceo lento. Su luz es más tenue al principio y crece a medida que el jugador demuestra competencias (señal visual de progreso, §2.7).
- **Personalidad:** curioso, tranquilo, un poco poético, con humor suave. Admira a los vecinos. Le gusta preguntar "¿cómo se dice...?" como si él también estuviera aprendiendo. **No es un profesor que evalúa; es un compañero que sabe un poco más y te cuida.**
- **Lo que nunca hace:** apurar, suspirar, decir "incorrecto", comparar con otros, hablar encima de un NPC, contar tiempo, insistir dos veces seguidas, hablar en tono infantil con adultos.
- **Lo que sí hace:** nombrar objetos cuando se lo pedís (habilidad base tipo Influent [Referencias §4.1.1]), darte una señal breve para que te autocorrijas, anotar en silencio lo que vale repasar, recordarte lo que demostraste al cierre, sugerir parar.

#### 2.4.2 Cómo se ve y cómo suena

| Aspecto | Especificación |
|---|---|
| Modelo | Farol low-poly de 6-8 caras con un núcleo emisivo; dos "ojos" simples en la cara frontal (dos rectángulos redondeados emisivos) que parpadean y cambian de forma (alegre, curioso, atento, pensativo) |
| Animación | Balanceo sinusoidal lento (período 3-4 s); se acerca 20 cm cuando habla; baja la luz cuando escucha (no distrae) |
| Estado "escuchando" | Lumi gira hacia el NPC, sus ojos se achican, sin sonido |
| Estado "anotó algo" | Un destello mínimo (sin sonido por defecto) y un punto que entra en su "frasco". Configurable a invisible para quien se pone nervioso |
| Estado "señal de corrección" | Se acerca, un tono suave de dos notas, burbuja de texto con la señal (además de voz si está activada) |
| Voz | TTS en la L1 del jugador para explicaciones (español rioplatense neutro en la v1, ver DP-28), timbre cálido, ni infantil ni robótico, velocidad 0,9x por defecto. Voz en L2 cuando modela una frase. Se puede silenciar la voz de Lumi y dejar solo texto |
| Burbujas | Siempre en la capa DOM (HUD), arriba a la izquierda del personaje en pantalla o en un panel fijo según preferencia (accesibilidad: posición fija para lectores de pantalla) |

#### 2.4.3 Cuándo habla Lumi

| Momento | Habla | Ejemplo |
|---|---|---|
| Pre-tarea | Sí, breve | "Lily perdió a su perro. Vos lo viste en el muelle. ¿Le contás cómo era?" |
| Durante la escena, error que rompe el sentido o es el objetivo de la misión | Sí, una señal breve (prompt) | "Mmm... ¿*a* dog o *the* dog que viste vos?" |
| Durante la escena, error que no bloquea | **No.** Lo anota en silencio | — |
| El jugador pide `Pista` | Sí, según nivel de pista (§2.10) | "Probá con: *Is this your...?*" |
| El jugador pide nombrar un objeto (`Q` o click derecho sobre el objeto con Lumi activa) | Sí | "*Lighthouse*. Faro." (audio L2 + L1) |
| Silencio largo sin pedido | **No habla.** Puede mostrar un chip visual "¿Querés una pista?" según DP-05 | — |
| Post-tarea | Sí: destila pociones y hace 1-3 preguntas de evocación | "Le preguntaste '*Is this your dog?*' Eso es ámbar. ¿Te acordás cómo dijiste que era chiquito?" |
| Fin de sesión sugerido | Sí, una vez | "Hoy encendiste dos ventanas del muelle. Es un buen lugar para parar." |

**Regla de densidad:** como máximo **una intervención correctiva cada 3 turnos del jugador** y nunca dos seguidas sobre el mismo error dentro de una escena. Si el error se repite, se anota para el repaso. La dosis óptima de feedback correctivo en diálogo con IA está [En disputa] (Bibauw sí, Hou & Min no lo encuentran como moderador) [Investigación §2.1]; esta densidad es un default de diseño y un parámetro del experimento A/B #1.

#### 2.4.4 Los modos de feedback

El jugador elige en Ajustes (y puede cambiar en cualquier momento, incluso dentro de una escena con un atajo):

| Modo | Durante la escena | Al cierre | Estado |
|---|---|---|---|
| **Acompañado (default)** | Señal breve inmediata (prompt para autocorregirse) solo en errores **globales** (rompen el sentido) o **de objetivo** (la estructura que la misión practica). Si después de la señal el jugador no lo logra, Lumi o el NPC reformulan (recast) y siguen. El resto se anota en silencio. | Repaso de evocación de 1-3 ítems marcados | Default respaldado: inmediato es igual o más eficaz que diferido [Probable, E32]; prompts superan a recasts [Probable, E31]; el repaso por evocación convierte el diferido en recuperación espaciada [Probado, E34] |
| **Solo anotar (para después)** | Lumi no interviene nunca. Todo se anota. | Repaso de evocación igual | Opción de comodidad (ansiedad). **No se presenta como mejor para aprender** [Investigación §2.1] |
| **Más ayuda** | Señales también en errores locales frecuentes (sistemáticos), hasta 1 cada 2 turnos | Igual | Para quien lo pide (adultos que quieren precisión). Equivale al modo "correction" de un prototipo de voz anterior, suavizado |

**Clasificación de errores que usa el observador** (heredada de un prototipo de voz anterior): *global* (impide entender), *local* (el sentido queda claro), *sistemático* (se repite), *desliz* (aislado). Prioridad: global > objetivo de misión > sistemático > local > desliz.

**Regla de disfluencias** (heredada tal cual de un prototipo de voz anterior): repeticiones, arranques en falso, muletillas ("uh", "like") y autocorrecciones **no son errores**. El observador reconstruye la oración intencionada, evalúa solo esa y, si la cita, cita la versión limpia.

**Tipos de señal (prompts), de menor a mayor explicitud:**

1. *Pedido de aclaración* del NPC dentro de la ficción: "Sorry? A big dog or a small dog?" (el NPC no entiende de verdad; error de predicción, [Probable, E37]).
2. *Repetición con entonación* (Lumi): "¿*She go*...?"
3. *Pista metalingüística* (Lumi, L1): "Ojo con *she*... ¿qué le pasa al verbo?"
4. *Elicitación* (Lumi): "Ella... *she g...*"
5. *Reformulación (recast)* como último paso, sin pedir repetición: "*She goes*. ¡Eso!" y la escena sigue.

La escala sube un escalón por intento fallido y se reinicia en el siguiente error. En A0 se arranca en el escalón 1 o 5 (no se exige autocorrección de algo que nunca se vio); desde A1 se arranca en el escalón 1.

**Pronunciación:** es núcleo desde la v1 (D-044, revierte DP-27) y tiene su propia especificación en §2.4.7. Dentro de la conversación libre, la regla de interrupción de un prototipo de voz anterior sigue: la pronunciación **nunca interrumpe**; si rompe el sentido, el NPC no entiende (escalón 1, pedido de aclaración dentro de la ficción) y nada más.

#### 2.4.5 "Marcar para después"

- El jugador puede pedir que Lumi anote algo: un botón (`M`) durante la escena o tocar una línea del subtítulo del NPC. Ese ítem entra al banco de repaso con prioridad alta.
- Lumi también marca automáticamente los errores que no señaló.
- Todo lo marcado se ve en el **Frasco de Lumi** (cuaderno), con la frase original del NPC, la versión correcta y audio.

#### 2.4.6 Lo que Lumi sabe del jugador

Usa el perfil del alumno (§2.13) en silencio, como un prototipo de voz anterior: detecta recurrencias de errores conocidos, prioriza patrones con riesgo de fosilización, construye sobre lo ya visto. **Nunca menciona el perfil** ("según tu historial...").

#### 2.4.7 Pronunciación (núcleo, D-044)

El juego detecta **cómo** dijo el jugador lo que quiso decir, no solo qué quiso decir, sin presión y sin falsas alarmas. Fuente: `research/pronunciacion-2026-10-06.md` (la investigación de referencias); arquitectura: `03-arquitectura.md` §5.12.

**Las tres piezas:**

| Pieza | Qué ve el jugador | Cómo se detecta | Cuándo |
|---|---|---|---|
| **Momentos guionados** | El NPC o Lumi propone decir algo concreto: *repetir después de mí* (shadowing), *leer en voz alta* (carteles, cartas, el menú de la taberna), *frase clave* (la contraseña del faro) o *par mínimo con consecuencia* ("pedile al barquero el *ship*, no el *sheep*": el mundo responde a lo que **sonó**). Feedback **inmediato y amable**: la palabra coloreada, ≤ 1-2 sonidos marcados por vez, "así lo dijiste vos / así suena" (su clip y el modelo) y reintento sin límite. La consecuencia es narrativa ("¿cómo? no te escuché bien"), nunca un castigo | Evaluación guionada por fonema contra el texto esperado (Azure Pronunciation Assessment; D-150) | Momentos marcados en el contenido de la escena (bloque `pronunciacion`), sobre líneas que ya existen en el guion |
| **Detección en segundo plano** | Nada durante la charla. Al cierre de la misión, si corresponde, "tu sonido de la semana": su propio clip, el modelo y un drill | Reconocedor de fonemas de decodificación libre + tabla de confusiones del español (D-150), solo con alta confianza | En la charla libre. **Nunca interrumpe.** Un error entra al repaso solo si es **recurrente**: ≥ 3 ocurrencias de alta confianza en ≥ 2 escenas |
| **Drills de pares mínimos** | Primero **percepción** (escuchar y elegir entre *ship* / *sheep*), después producción | Percepción: sin detector (audio pre-generado). Producción: detector solo si el tipo está habilitado | En el repaso espaciado (§2.9) y a pedido desde el Frasco |

**Reglas que no se negocian:**
1. **Solo se muestra un tipo de error si pasó la vara de F0.1** (D-151): precisión ≥ 0,90 y falsas alarmas ≤ 3 % por palabra en guionado; ≥ 0,80 de precisión en el repaso desde charla libre. Los tipos que no pasan quedan en percepción y autocomparación, **sin juicio automático**. El diagnóstico explícito ("sonó /i/, va /ɪ/") solo si la herramienta acierta el sonido realizado ≥ 70 % de las veces; si no, Lumi dice "esa palabra no sonó del todo como *ship*, escuchá" y reproduce los dos clips.
2. **Nunca interrumpe** la charla libre. La única consecuencia en vivo es que el NPC no entienda cuando el sentido se rompe (escalón 1 de §2.4.4).
3. **Lenguaje tentativo y sin números:** Lumi dice "me pareció escuchar…", nunca "dijiste mal"; la confianza baja no se muestra; no hay puntajes, porcentajes ni rankings de pronunciación.
4. **Lumi habla por plantillas** (como en todo el juego): un modelo de lenguaje nunca juzga fonemas ni inventa el feedback.
5. **Cruce con gramática:** *she work* puede ser concordancia o una /s/ final omitida. Si el jugador produce /s/ final en otras palabras (*cats*, *bus*, *it's*), es gramática (va al observador gramatical); si la omite en todas, es pronunciación.
6. **Privacidad:** el servidor nunca guarda audio; el clip de "así lo dijiste vos" se guarda solo en el dispositivo del jugador, como máximo 20, y se borra al usarse o a los 7 días (D-155); hay un botón para borrarlos.
7. **Sin micrófono**, los momentos de pronunciación se saltean sin penalidad; los drills de percepción siguen disponibles.

**Los 14 tipos de error que se miden (E1-E14, hispanohablante con foco rioplatense):** vocal tensa/laxa /ɪ/→/i/ (*ship*→*sheep*); /æ/, /ʌ/, /ɑ/→/a/ (*cat*/*cut*); falta de reducción a /ə/; /v/→/b/; /θ/→/t/, /s/, /f/; /ð/→/d/; epéntesis antes de s+consonante (*eschool*); /z/→/s/; /ʃ/→/s/ y /tʃ/↔/ʃ/; sheísmo /j/, /dʒ/→[ʃ]; /h/→[x] u omitida; consonante final o grupo reducido y *-ed* como /ɪd/; acento léxico mal ubicado; falta de aspiración y /r/ vibrante. **Peso alto** (los que más afectan la comprensión): E1, E2, E12, E13. Detalle y qué herramienta ve cada uno: `research/pronunciacion-2026-10-06.md` §4.

**Evidencia y progreso (D-156):** en la v1 no hay nodo `HAB-*` de pronunciación. Lo que se logra (un sonido que pasa de "recurrente" a "resuelto", un drill superado) se registra en el modelo del alumno y se ve en una página **"Sonidos"** del Frasco, con frases "puedo…" y sin números. La pronunciación no da pociones por sí sola (las pociones siguen saliendo de la evidencia de cada escena), salvo el 1/3 por intento del prólogo A0 (M0.2).

### 2.5 Sistema de conversación con NPCs

#### 2.5.1 Principios

1. **Escenas cortas, contexto que se reinicia.** El costo de voz crece de forma cuadrática con la duración de una conversación porque el contexto se re-factura por turno [Negocio §3.2]. Por eso el modo 1 es un rosario de escenas de 2-4 minutos con NPCs distintos, y entre escenas se guarda un **resumen**, no el historial.
2. **Guion de escena + IA.** Apertura y cierre guionados (audio TTS pre-generado y cacheado), parte central abierta con IA dentro de un marco (objetivo, temas, vocabulario, nivel).
3. **El NPC quiere algo.** Cada escena tiene una necesidad del NPC y criterios de éxito verificables.
4. **El NPC no interrumpe.** El turno del jugador termina cuando el jugador lo decide (§2.6).
5. **Coherencia del mundo.** El NPC sabe solo lo que su ficha y el estado del mundo le dicen; no inventa lugares, personas ni eventos fuera del guion.

#### 2.5.2 Arquitectura conceptual (la revisión de arquitectura decide la técnica)

```
[Navegador]                                   [Servidor (reuso de un prototipo de voz anterior)]
micrófono → audio ─────── WebSocket ───────→  proxy → modelo de voz en tiempo real (Gemini Live)
altavoz  ← audio ←──────────────────────────  ←        (persona + guion de escena + estado)
HUD ← transcripciones (subtítulos) ←───────────  
                                              observador (modelo de texto): clasifica errores,
                                              decide señales de Lumi, marca ítems, evalúa criterios
                                              de éxito → eventos al estado del juego
                                              moderación de entrada y salida (§2.17)
```

- **Reuso de un prototipo de voz anterior [Brief]:** proxy Node.js + WebSocket a Gemini Live (voz), modelo de texto para gramática, observador y debrief, reglas de disfluencia, perfil del alumno, TTS Deepgram Aura. Lo nuevo es: guiones de escena, ficha de NPC, criterios de éxito, eventos hacia el juego, moderación para menores, presupuesto de minutos.
- **Tope de ~15 min del lado del servidor** en Gemini Live: deja de ser problema porque ninguna escena llega a 5 min [Negocio §3.2].
- **Alternativa en cascada** (STT + LLM de texto + TTS) para el modo texto y como plan B de costo: ~US$0,025-0,03/min con control fino del ritmo y los silencios [Negocio §3.2]. **El experimento #1 de el análisis de negocio (sonda de costo) decide cuál es la vía principal.** DP-36.

#### 2.5.3 Guion de escena (formato de contenido)

Cada escena se escribe con estos bloques. La corrida que escriba escenas nuevas debe llenarlos todos:

| Bloque | Contenido |
|---|---|
| `escena_id` | `M1.2-E1` |
| `npc` | `NPC-LILY` |
| `lugar` | Plaza, junto a la fuente |
| `situacion` (para el modelo) | "Lily (9) is looking for her dog Biscuit. She is worried but hopeful. The player saw a dog near the pier." |
| `necesidad_npc` | Saber cómo es el perro que vio el jugador y dónde |
| `apertura_guionada` | 1-2 líneas en L2, con audio cacheado |
| `criterios_exito` | Lista verificable por el observador (ej.: "player states at least 2 attributes among color/size/collar"; "player states location: pier") |
| `andamiaje_npc` | Qué hace el NPC si el jugador se traba: reformular la pregunta más simple, ofrecer dos opciones, mostrar con gestos |
| `vocabulario_nivel` | Banda de palabras permitida para el NPC (lista + nivel MCER) |
| `temas_permitidos` | Perros, colores, tamaños, la plaza, el muelle |
| `temas_vedados` (además de la lista global) | Ninguno extra |
| `cierre_guionado` | Línea de cierre y evento de mundo |
| `salida_si_no_converge` | Si a los 4 min no se cumplieron los criterios: el NPC propone el camino más corto ("Can you show me? Let's go to the pier!") y la escena termina con resultado parcial, sin castigo |
| `eventos` | `dog_found`, `lily_trust+1` |
| `resumen_para_siguiente` | Qué se guarda para la próxima escena (2-3 líneas) |

#### 2.5.4 Ficha de NPC (formato de contenido)

| Campo | Ejemplo |
|---|---|
| `id` | `NPC-BEN` |
| `nombre` | Ben Okafor |
| `rol` | Panadero del pueblo |
| `personalidad` | Cálido, bromista, impaciente solo con su horno |
| `forma_de_hablar` | Frases cortas, repite las palabras clave, se ríe; usa "mate" |
| `bandas_mcer` | A0-A2 |
| `voz` | Voz masculina grave y alegre, ritmo medio (DP-20) |
| `sabe` | Recetas, horarios de la panadería, chismes inofensivos del pueblo |
| `no_sabe` | Nada fuera del pueblo; no opina de política, religión ni temas adultos |
| `relacion` | Valores de confianza con el jugador (0-5), solo para variar el saludo y desbloquear misiones; nunca baja |
| `memoria` | Lista corta de hechos del jugador (nombre de juego, misiones hechas con él, una preferencia elegida en juego) |

#### 2.5.5 Duración y presupuesto de una escena

| Parámetro | Default | Razón |
|---|---|---|
| Duración objetivo | 2-4 min de voz | Costo [Negocio §3.2]; ritmo de sesión |
| Tope duro | 5 min | El NPC cierra con gracia ("I have to go check the oven! Thanks!") |
| Turnos objetivo del jugador | 4-10 | Producción > escucha [Probable, E6] |
| Contexto | Se reinicia por escena; se inyecta ficha del NPC + guion + resumen previo + perfil mínimo | Costo |
| Presupuesto de voz | Minutos de voz por semana según plan del usuario/institución (DP-22). Al agotarse, la misma escena sigue en modo texto, sin cortar | Accesibilidad y costo |

> **Las pociones no son minutos de voz.** El análisis de negocio sugirió usar la poción también como moneda de minutos [Negocio §3.3]. Este GDD recomienda **no** hacerlo: convertiría la XP en pago por participar, que es justo lo que socava la motivación intrínseca [Probado en laboratorio, E12]. El presupuesto de voz se muestra aparte, en lenguaje llano ("Te quedan 18 minutos de voz esta semana; el modo texto no tiene límite"). **DP-08.**

#### 2.5.6 Modo texto (sin micrófono o por preferencia)

- Toda escena tiene equivalente escrito: el jugador escribe; el NPC responde en texto y, si el jugador quiere, también en audio (TTS).
- En A0-A1 el modo texto ofrece **opciones sugeridas** (2-3 respuestas tocables) además del campo libre; elegir una opción vale menos evidencia que producirla (pociones de menor peso) pero nunca bloquea.
- Hablar y escribir son modalidades distintas; la evidencia sugiere que mezclar modalidades rinde [Probable] y que practicar en la misma modalidad que se evalúa rinde más [Probable, E6]. Por eso el juego **invita** a hablar (Lumi: "¿Querés probar decirlo en voz alta?") pero nunca obliga.
- El modo texto es también el modo gratuito ilimitado (DP-22) y el modo de respaldo si la red no aguanta la voz.

#### 2.5.7 Líneas guionadas vs generadas

| Tipo | Uso | Audio |
|---|---|---|
| Guionadas | Aperturas, cierres, momentos de historia, pistas de nivel 3, nombres de objetos | TTS pre-generado y cacheado (o voz humana si hay presupuesto, DP-21) |
| Generadas | Cuerpo de la escena | Voz en tiempo real |
| Plantilla | Saludos según relación y hora del día, reacciones genéricas | TTS cacheado por variante |

**Glosario curado:** todo nombre de objeto, traducción y frase modelo que muestra la interfaz sale de un glosario revisado por humanos, no de la IA en vivo. Las traducciones erróneas destruyen la confianza (segunda queja de Terra Alia) [Referencias §4.2.2]. La IA genera conversación; no genera traducciones que se muestren como verdad.

### 2.6 Control del ritmo: más despacio y silencios que cierra el jugador

#### 2.6.1 Más despacio

- **Tres velocidades del NPC:** Natural, Más lenta, Muy lenta. Default según nivel: A0 = Muy lenta, A1 = Más lenta, A2+ = Natural. El jugador cambia cuando quiere (botón y atajo `S`).
- **Qué cambia:** velocidad de habla, pausas entre frases, longitud de frase. La técnica (instrucción al modelo, ajuste de reproducción sin cambiar tono, o TTS con parámetro de velocidad) la decide la revisión de arquitectura. **DP-07.**
- **Evidencia:** los aprendices prefieren el habla lenta, pero en el único experimento abierto no comprendieron más (n = 26) [Hipótesis para el efecto en aprendizaje, E9]. Se mantiene por **comodidad y baja presión** [Probable por cadena E4 + E3], no como palanca de aprendizaje.
- `Repetir` reproduce la última línea del NPC exactamente (audio cacheado de la sesión), sin costo de modelo.

#### 2.6.2 Silencios que termina el jugador

**El silencio es del jugador.** Cuando el NPC termina de hablar, el NPC espera. No hay temporizador visible, no hay "¿hola? ¿estás ahí?".

- **Cómo termina el turno el jugador (default, DP-06):** detección de fin de habla con umbral largo (2,5-4 s de silencio, configurable) **más** un botón/tecla `Terminé` (Espacio o Enter) que cierra el turno de inmediato. Opción de accesibilidad: *pulsar para hablar* (mantener una tecla mientras se habla), útil en aulas ruidosas.
- **Qué ofrece el botón de silencio** (`Pasar el turno`, tecla `Tab` o click): un menú de 4 opciones grandes:
  1. *Pista* (Lumi da una pista del nivel siguiente).
  2. *Repetir* (el NPC repite).
  3. *Más simple* (el NPC reformula con palabras más simples o da dos opciones).
  4. *Seguí vos* (el NPC continúa la conversación sin esperar respuesta, sin penalización).
- **Riesgo de diseño:** si el silencio nunca se cierra solo, el jugador puede quedar sin empuje para producir [Hipótesis, la investigación §2.2]. Mitigación por defecto: a los **10 s** de silencio aparece un chip visual discreto "¿Querés una pista?" (sin sonido, sin animación llamativa, desactivable). El NPC no habla.
- **Experimento A/B #3** (§6.3): botón de silencio vs andamiaje automático tras X segundos. **DP-05.**
- **Evidencia:** el botón de silencio no tiene ningún estudio [Hipótesis, E10]. Es una función de comodidad y un experimento propio.

### 2.7 Pociones de conocimiento (XP) diseñadas contra la sobrejustificación

#### 2.7.1 Regla central

**La poción informa competencia; no paga por participar.** Las pociones se destilan solo cuando el jugador **demuestra** algo (usó una estructura para lograr algo, se autocorrigió tras una señal, recuperó un ítem marcado días después). Nunca por completar una misión, por tiempo jugado, por entrar cada día ni por elegir respuestas al azar.

- Mecanismo de daño: recompensas esperadas y contingentes a participar o completar socavan la motivación intrínseca (d = −0,28 a −0,40), más en niños; el feedback informativo de competencia la aumenta (d = 0,33) [Probado en laboratorio, E12, E13, E14].
- La transferencia a XP de un juego de L2 está [En disputa] (E16): Mekler no encontró daño con puntos y niveles en adultos, pero tampoco mejora de calidad (solo cantidad) [Probable, E15]. Por eso la XP no se usa para empujar volumen; se usa para **decir qué ya sabés hacer**.
- El experimento A/B #2 (§6.3) mide esto en el propio juego (XP informativa vs XP por completar, midiendo libre elección).

#### 2.7.2 Ramas y colores

| Rama | Color | Qué demuestra | Ejemplos de evidencia |
|---|---|---|---|
| **Vincular** (social) | Ámbar | Saludar, presentarse, agradecer, preguntar por el otro, cortesía | Usó "Nice to meet you" al conocer a un NPC; preguntó "How are you?" y respondió a la respuesta |
| **Pedir y ofrecer** (transacción) | Verde | Pedir cosas, cantidades, ofrecer ayuda, aceptar y rechazar | "Can I have three loaves, please?" logró el pedido |
| **Describir y ubicar** | Azul | Describir personas, objetos, lugares; direcciones | Describió el perro con dos rasgos; guió al cartero |
| **Contar** (narrar) | Violeta | Pasado, secuencias, planes | Contó lo que pasó con "first... then..." en pasado |
| **Opinar y convencer** | Rojo coral | Opinar, comparar, argumentar, negociar, condicionales | Dio una razón con "because" y propuso una alternativa |
| **Entender** (comprensión) | Celeste | Seguir instrucciones o información del NPC y actuar en el mundo | Siguió las indicaciones de Sam hasta el correo sin pedir repetir |

#### 2.7.3 Cómo se gana una poción

| Evento | Pociones | Notas |
|---|---|---|
| Uso exitoso de una estructura objetivo para cumplir un criterio de éxito | 1 de la rama | Lo detecta el observador |
| Autocorrección tras una señal de Lumi | 1 de la rama + "gota brillante" (marca visual de autocorrección) | La autocorrección es la conducta que más queremos reforzar con información [Probable, E31] |
| Recuperación correcta de un ítem marcado en una misión posterior (repaso espaciado) | 1 de la rama + el ítem sube de nivel en el banco | [Probado, E34] |
| Elegir una opción sugerida (modo texto A0-A1) | 1/3 de poción | Reconoce el paso sin igualarlo a producir |
| Completar una misión | **0** | Completar no paga. El resultado en el mundo es la recompensa narrativa |
| Entrar al juego, días seguidos | **0** | Regla inviolable 2 |

**El momento de destilar** (post-tarea) es **feedback informativo**: Lumi nombra la conducta concreta ("Le pediste los panes con *could you*; eso es pedir con cortesía") y la poción cae en el frasco de su color. No hay sonido de tragamonedas, ni confeti, ni números grandes. El sonido es un "gluc" suave y una nota.

#### 2.7.4 Qué se hace con las pociones

- Las pociones se acumulan por rama y **nunca se pierden ni se gastan del todo**. Abrir una habilidad del árbol pide "verter" pociones de ciertos colores: quedan visibles dentro del nodo abierto (como un farol que se llenó). La metáfora es invertir lo que sabés en lo que querés poder hacer, no pagar. **DP-09.**
- El nivel de luz de Lumi y de los faroles del pueblo refleja el total de evidencia, visible en el mundo (progreso visible, que acompaña a la adaptación [Probable, E36]).
- **No hay tienda.** No hay ítems cosméticos comprables con pociones en el modo 1. Los cosméticos (ropa del avatar, decoración) se ganan como regalos narrativos de los vecinos al resolver misiones, sin estar anunciados de antemano (los regalos inesperados no producen el efecto de socavamiento de los esperados [Probado en laboratorio, E12, que se limita a recompensas esperadas]).

### 2.8 Árbol de habilidades

#### 2.8.1 Principios

- Las habilidades son **lingüísticas y útiles en la siguiente misión**: nuevas opciones de diálogo, NPCs que antes no hablaban con vos, lugares, tipos de misión [Probable, la investigación §2.3 / E18].
- **Ninguna habilidad es de accesibilidad.** Velocidad, subtítulos, modo texto, pistas: siempre disponibles (regla inviolable 3).
- Abrir una habilidad requiere (a) pociones de la rama y (b) haber demostrado al menos una vez la competencia específica (evento del observador). Esto evita "comprar" habilidades sin la competencia.
- El jugador **elige** qué abrir cuando tiene opciones (autonomía [Probable, E18]).

#### 2.8.2 Árbol de la v1 (ejemplos completos)

| ID | Habilidad | Rama | Requiere | Qué habilita en el juego |
|---|---|---|---|---|
| `HAB-BASE-NOMBRAR` | Preguntarle a Lumi "¿cómo se dice?" | — | Inicio | Inspeccionar objetos y escuchar su nombre (estilo Influent) |
| `HAB-VINC-1` | Presentarme | Ámbar 2 | M0.2 | Los vecinos te saludan por tu nombre de juego; aparecen saludos en el tablero |
| `HAB-VINC-2` | Charla de vereda (small talk) | Ámbar 5 | Preguntó "How are you?" en 2 escenas | 3 NPCs "tímidos" que solo saludaban con la mano ahora conversan; misiones cortas de charla con objetivo (§3.6) |
| `HAB-VINC-3` | Hablar por teléfono | Ámbar 8 + Celeste 4 | Cap. 2 | La cabina del muelle: llamadas a Agnes (organizadora en reposo) y misiones a distancia sin apoyo visual |
| `HAB-PEDIR-1` | Pedir con cortesía | Verde 3 | Usó "please" + "can I" | Opciones de diálogo amables; Ben te deja ayudar en el mostrador (misión M1.5) |
| `HAB-PEDIR-2` | Cantidades y listas | Verde 6 | M1.4 | Tablero de pedidos con listas; misiones de abastecimiento del festival |
| `HAB-PEDIR-3` | Ofrecer y negociar favores | Verde 10 + Coral 3 | Cap. 3 | Intercambios entre vecinos (trueque de favores, sin dinero) |
| `HAB-DESC-1` | Describir cosas | Azul 3 | M1.2 | Misiones de "objetos perdidos" del tablero |
| `HAB-DESC-2` | Dar y seguir direcciones | Azul 6 + Celeste 3 | M2.1 | Sam te presta la bicicleta del correo (traslado rápido entre barrios hablando con Sam) |
| `HAB-DESC-3` | Describir personas | Azul 9 | M2.4 | Misiones de "¿quién es quién?" en el mercado; reconocer vecinos nuevos |
| `HAB-CONT-1` | Contar lo que pasó (pasado simple) | Violeta 3 | M3.1 | Walter cuenta historias del faro y te pide que se las cuentes a otros; la biblioteca abre su "rincón de historias" |
| `HAB-CONT-2` | Hacer planes (going to / will) | Violeta 6 | M3.4 | Planificar actividades del festival con vecinos |
| `HAB-OPIN-1` | Opinar y dar razones | Coral 3 | M3.5 | Nadia te consulta decisiones del jardín; opciones de diálogo con "I think... because..." |
| `HAB-OPIN-2` | Convencer (condicionales, propuestas) | Coral 7 | M4.2 | Desbloquea la asamblea del pueblo (M4.4) |
| `HAB-OPIN-3` | Mediar entre vecinos | Coral 9 + Ámbar 10 | M4.3 | Misiones de mediación: dos NPCs en desacuerdo |
| `HAB-ENT-1` | Oído de muelle | Celeste 5 | — | Los NPCs con acentos distintos (A2+) aparecen con misiones (exposición a variantes) |
| `HAB-ENT-2` | Leer carteles | Celeste 3 + Azul 3 | — | Los carteles del pueblo se vuelven interactivos y dan pistas o misiones ocultas (mezcla de modalidades [Probable]) |

### 2.9 Repaso espaciado dentro de las misiones

- **Banco de repaso:** cada ítem marcado (por Lumi o por el jugador) tiene: forma correcta, contexto de origen, rama, nivel de dominio (0-5) y próxima fecha.
- **Intervalos default:** 1, 3, 7, 14 y 30 días (**ver ADR-020 / D-088: la implementación usa las cajas Leitner `[0, 1, 3, 7, 14, 30]` días, donde la caja 0 vence el mismo día, `03-arquitectura.md` §3.5.4; gana el registro**); sube un nivel con recuperación correcta en producción, baja uno con error (sin castigo visible; solo vuelve antes). Algoritmo concreto: decide la revisión de arquitectura (Leitner o SM-2 simplificado). Espaciar y evocar mejora la retención [Probado, E34].
- **Dónde reaparece el ítem:**
  1. **Dentro de misiones nuevas** (lo principal): el generador de escenas recibe "ítems vencidos" y el NPC crea una situación que los pide en contexto nuevo. Ej.: "brown" marcado en M1.2 → en M1.6 Ben pregunta "What color is the cake you want for Lily?". El jugador tiene que **producirlo**, no reconocerlo [Probado para espaciado y recuperación].
  2. **Preguntas de evocación de Lumi** al cierre de la misión ("¿Cómo dirías...?").
  3. **Repaso de bolsillo** opcional de 60-90 s al entrar: 3-5 palabras sueltas con imagen y audio, producción oral o escrita. El sueño consolida vocabulario aislado pero no el contextual [Probado, condicional, E35]; por eso el repaso de palabras sueltas complementa el uso en contexto.
  4. **Juego de búsqueda** (opcional, estilo "Time Attack" de Influent pero **sin reloj**): Lumi dice una palabra y el jugador encuentra el objeto en la escena [Referencias §4.1.4].
- **Error de predicción:** ante un error de sentido, el NPC puede reaccionar de forma inesperada pero amable (trae una manzana en vez de una pera), lo que puede ayudar [Probable en L2, E37]. Nunca humillante, nunca con risa del NPC hacia el jugador.

### 2.10 Dificultad adaptativa

- **Qué se adapta:** el **andamiaje del NPC**, no el contenido de la misión: velocidad de habla, longitud de frase, banda de vocabulario, cantidad de opciones ofrecidas, nivel de pista inicial, proporción de L1 de Lumi, umbral de chip de pista [Probable, la investigación §2.7].
- **Señales que usa** (ventana móvil de las últimas 3 escenas): tasa de criterios de éxito alcanzados sin pista, pedidos de repetir/más despacio, tasa de autocorrección tras señal, latencia de respuesta (sin penalizar, solo como señal), cantidad de turnos para cumplir el objetivo.
- **Niveles de andamiaje (1 a 5):**

| Nivel | NPC | Lumi | Pistas |
|---|---|---|---|
| 1 (máximo apoyo) | Muy lenta, 3-6 palabras, gestos, repite clave | L1, señal desde recast | Opciones visibles desde el inicio |
| 2 | Lenta, 1 oración simple | L1 | Chip de pista a los 8 s |
| 3 | Lenta/natural, 1-2 oraciones | L1 con frases modelo en L2 | Chip a los 10 s |
| 4 | Natural, 2 oraciones, alguna palabra nueva | Mezcla L1/L2 | Chip a los 15 s |
| 5 (mínimo apoyo) | Natural, 2-3 oraciones, idioms simples | L2 salvo explicaciones | Solo a pedido |

- **Regla de cambio:** sube un nivel si en 3 escenas seguidas cumplió los criterios sin pistas y con ≤1 señal; baja un nivel si en 2 escenas seguidas pidió 3+ pistas o no convergió. El jugador ve "Lumi ajustó la ayuda" en el cuaderno, nunca "bajaste de nivel".
- **Acompañado de progreso visible:** la adaptación sin componente motivacional no mejoró el aprendizaje en el único RCT del corpus (tarea no lingüística) [Probable, E36]; por eso la adaptación va siempre junto con la destilación de pociones y la luz del pueblo.
- **Control del jugador:** en Ajustes puede fijar el nivel de ayuda (desactiva la adaptación automática).

### 2.11 Mapa MCER (A0 a B1 en la v1)

| Banda | Capítulo | "Puedo..." (can-do, resumen) | Funciones y estructuras | Vocabulario (aprox. acumulado) |
|---|---|---|---|---|
| **A0 (pre-A1)** | Prólogo | Saludar, decir mi nombre de juego, entender sí/no, nombrar objetos cercanos | Hello/Hi, I'm..., yes/no, please/thank you, this/that, colores básicos | 60-100 |
| **A1** | Capítulo 1 | Presentarme, describir cosas con color y tamaño, pedir cosas simples, preguntar dónde está algo, decir qué me gusta | to be, have got/have, can (pedido), there is/are, preguntas wh- simples, números 1-20, like | 300-400 |
| **A1→A2** | Capítulo 2 | Dar y seguir direcciones, comprar/pedir cantidades, describir personas, hablar de rutinas, llamar por teléfono | presente simple y continuo, preposiciones de lugar, some/any, how much/many, could you, imperativos | 600-800 |
| **A2** | Capítulo 3 | Contar algo que pasó, dar consejos simples, comparar, hacer planes | pasado simple (regular e irregulares frecuentes), comparativos, should, going to, first/then/after that | 1.000-1.200 |
| **A2→B1** | Capítulo 4 | Dar opiniones con razones, proponer y convencer, explicar un problema, mediar | I think/because, if + presente (1er condicional), would like, could we..., what about...?, reformular | 1.500-1.800 |

- Para el jugador menor de edad se muestran **solo los "puedo..."**, no las etiquetas MCER; para adultos y docentes se muestran ambas (DP-33).
- La correspondencia fina misión → descriptores MCER oficiales queda para el diseño de contenido (tarea del roadmap). Alinear con BNCC (Brasil) y diseños curriculares argentinos es una tarea B2B posterior.

### 2.12 Nivelación inicial

- Sin examen de entrada (genera ansiedad y abandono temprano). Default **DP-25**: el jugador autodeclara su nivel con 4 opciones en L1 ("Nunca estudié inglés" / "Sé algunas palabras" / "Me defiendo con frases simples" / "Puedo charlar pero me trabo") y la primera escena del prólogo ajusta el andamiaje con las señales de §2.10.
- Quien declara "Puedo charlar" igual juega el prólogo (es corto) y puede saltar el capítulo 1 al terminar el prólogo si Lumi detectó desempeño de nivel 4+ ("¿Querés ir directo al muelle? Ben igual te va a extrañar"). Las misiones saltadas quedan disponibles.

### 2.13 Perfil del alumno

| Dato | Para qué | Quién lo ve | Retención (default, DP-13) |
|---|---|---|---|
| Nombre de juego (no real), avatar | Que los NPCs te nombren | Jugador, docente (si es de una clase) | Vida de la cuenta |
| Par de idioma, nivel declarado, nivel de andamiaje actual | Adaptación | Jugador, docente | Vida de la cuenta |
| Preferencias de accesibilidad | Aplicarlas | Jugador | Vida de la cuenta |
| Can-do demostrados y pociones por rama | Progreso | Jugador, docente, tutor | Vida de la cuenta |
| Banco de repaso (ítems, nivel, fechas) | Repaso espaciado | Jugador | Vida de la cuenta |
| Patrones de error (tipo, frecuencia, sistemáticos) | Lumi y adaptación (uso silencioso, como un prototipo de voz anterior) | Jugador (en el cuaderno, en lenguaje amable); docente en agregado | Vida de la cuenta |
| Transcripciones de escenas | Observador y repaso | Jugador (las suyas, 30 días) | 30 días, luego se borran; solo quedan ítems extraídos |
| Audio crudo | — | — | **No se guarda** (default). Se procesa en tiempo real y se descarta |
| Edad o banda de edad | Reglas de seguridad y consentimiento | Sistema, tutor, institución | Vida de la cuenta |

- **Minimización de datos:** no se pide nombre real, email de menores, ubicación, foto ni contactos. Las cuentas de menores se crean vía institución (código de clase) o tutor.
- **Exportar y borrar:** el jugador adulto o el tutor puede exportar el progreso y borrar la cuenta desde Ajustes.

### 2.14 Onboarding: los primeros 10 minutos, paso a paso

> Objetivo de los 10 minutos: que el jugador **diga algo en inglés a alguien y logre algo en el mundo** antes del minuto 5, que sepa que el silencio es suyo y que termine la sesión con ganas, no cansado.

| Tiempo | Pantalla / escena | Qué hace el jugador | Qué hace el juego | Notas de diseño |
|---|---|---|---|---|
| 0:00-0:20 | Carga | Nada | Pantalla de carga con el farol que se enciende; detecta GPU/memoria y elige calidad gráfica (bajo/medio/alto). Precarga solo el muelle | Objetivo: interactivo en < 15 s en PC objetivo (criterio de muerte de el análisis de negocio #5) |
| 0:20-1:00 | Bienvenida (DOM, sin 3D) | Elige idioma de interfaz (default español), banda de edad (si no viene de institución) | Si es menor sin código de clase ni tutor: flujo de tutor (§2.17). Si viene con código de clase: entra directo | Sin formularios largos |
| 1:00-1:40 | Accesibilidad de entrada | Elige: tamaño de letra (3 opciones con vista previa), subtítulos sí/no (default sí), "¿Tenés micrófono?" con prueba de 3 s | Si no hay micrófono o lo rechaza: modo texto, sin culpa ("Podés jugar todo escribiendo; si un día querés hablar, está acá") | Todo cambiable después |
| 1:40-2:10 | Nivel declarado y avatar | Elige 1 de 4 frases de nivel; arma el avatar (cuerpo, piel, pelo, ropa, 4-6 opciones cada uno) y elige nombre de juego (**lista curada**, ver D-074; gana el registro) | Fija andamiaje inicial | Nombre de juego: para menores, solo de una lista de sugerencias (evita nombres reales) |
| 2:10-2:40 | Ferry llegando (escena del mapa HD-2D) | Mira | La cámara, desde arriba, muestra el pueblo apagado, un único farol tenue en el muelle. Lumi aparece desde el farol | Sin texto largo. Música entra suave |
| 2:40-3:20 | Lumi se presenta (L1) | Escucha; aprende 2 botones: `Terminé` y `Pasar el turno` | Lumi: "¡Hola! Soy Lumi. Acá todos hablan inglés. No hay apuro: cuando alguien te hable, el silencio es tuyo. Cuando termines de hablar, tocá *Terminé*. Si no te sale, tocá *Pasar el turno* y te ayudo." | Enseña el contrato de no-presión antes de la primera interacción |
| 3:20-4:40 | **M0.1 "Hola, Rosa"**: la capitana del ferry | Dice "Hello" y su nombre de juego ("I'm ...") | Rosa (muy lenta): "Hello! Welcome to Lantern Bay. I'm Rosa. And you?" El observador acepta cualquier saludo + nombre. Si se traba: Rosa ofrece "I'm... ?" con gesto. Lumi destila la primera poción ámbar | **Primera producción antes del minuto 5** |
| 4:40-5:40 | Caminar por el muelle | Aprende a moverse (click en el suelo o WASD); la cámara se acomoda sola | Tutorial contextual en la capa DOM (2 líneas). Sendero iluminado hacia la plaza | Sin pruebas de destreza |
| 5:40-6:40 | **M0.2 "¿Cómo se dice?"**: nombrar 3 objetos | Pide a Lumi el nombre de 3 objetos (barco, faro, farol) y los repite en voz alta si quiere | Lumi nombra en L2 + L1, con audio cacheado. Repetir en voz alta da 1/3 poción celeste (si lo dice); sin presión si no | Copia lo más elogiado de Influent [Referencias §4.1.1] |
| 6:40-9:00 | **M0.3 "Biscuit"** (primer favor): Lily en la plaza busca a su perro, que el jugador vio en el muelle al llegar | Responde a "Did you see my dog?" con "Yes" + "pier/boat" (señala con click si hace falta) | Lily (muy lenta) pregunta sí/no y dónde. El perro está junto al barco; volvés con Lily. Si el jugador se traba, Lily ofrece dos opciones: "The pier? The park?" | Primer resultado en el mundo logrado con lengua. Precursora de M1.2 |
| 9:00-9:40 | Destilar | Mira | Lumi: "Le dijiste a Lily dónde estaba Biscuit: *Yes, the pier.* Eso es azul: ubicar." Poción azul cae. Pregunta de evocación: "¿Cómo se decía *faro*?" (respuesta oral o escrita, cualquier respuesta es bienvenida; si no sale, Lumi la dice y la marca para mañana) | Feedback informativo + primera evocación |
| 9:40-10:00 | Primera ventana encendida | Elige: seguir o parar | La primera ventana de la plaza se ilumina. Lumi: "Encendiste la primera ventana. Mañana Lily quiere presentarte a alguien. ¿Seguimos un poco o lo dejamos acá?" | Fin de sesión sugerido sin culpa; gancho narrativo, no recompensa por volver |

### 2.15 Duración de sesión (objetivos)

| Unidad | Objetivo | Tope | Fuente/razón |
|---|---|---|---|
| Escena de voz | 2-4 min | 5 min | Costo [Negocio §3.2] |
| Misión | 4-8 min (1-3 escenas + pre y post) | 12 min | Diseño |
| Sesión | 10-20 min (2-4 misiones) | No hay tope duro; sugerencia de pausa a los ~20 min y después cada 15 min | Muchas sesiones cortas [Probable, E23]; minutos óptimos [Hipótesis] |
| Frecuencia objetivo | 3-5 sesiones por semana | — | Espaciado [Probado, E34] |
| Arco completo del modo 1 (v1) | 25-40 h de juego en 3-5 meses | — | Evita el "poco contenido" de Influent y Terra Alia [Referencias §4.2.6] |

### 2.16 Estados de fracaso (ninguno punitivo)

| Situación | Qué pasa | Qué **no** pasa |
|---|---|---|
| El jugador no logra los criterios de éxito en la escena | A los 4 min el NPC ofrece el camino corto ("Can you show me?") y la misión termina con resultado parcial: el mundo avanza igual; la misión queda marcada "se puede mejorar" con una estrella de farol vacía opcional para repetir | No se pierde nada; no hay "misión fallida" |
| Error que rompe el sentido | El NPC no entiende dentro de la ficción y reacciona (error de predicción amable); Lumi da una señal | No hay sonido de error, no hay vidas |
| El jugador se queda en silencio mucho tiempo | Nada. Chip visual opcional (DP-05) | El NPC no presiona ni se va |
| El jugador dice algo fuera de tema | El NPC lo reconduce con amabilidad dentro de la ficción ("Ha! Maybe later. Now, about the dog...") | No se reprende |
| El jugador dice algo inapropiado | El NPC no lo repite, cambia de tema; si se repite, Lumi recuerda las reglas del pueblo en L1, una vez. Evento de seguridad para institución si aplica (§2.17) | No hay humillación pública |
| Se corta la conexión o se acaba la voz | La escena sigue en modo texto desde el último turno | No se pierde la escena |
| El jugador abandona a mitad de misión | Se retoma desde el inicio de la escena en curso | — |
| El jugador no juega en días o semanas | Lumi lo recibe con alegría y un resumen ("Ben preguntó por vos"). Los ítems vencidos se priorizan sin acumular "deuda" visible | No hay racha perdida, no hay "te extrañamos" culposo |

### 2.17 Seguridad para menores y moderación

> Esto describe requisitos de diseño. **No es asesoramiento legal.** El cumplimiento concreto (Argentina: Ley 25.326 de datos personales; Brasil: ECA Digital, Lei 15.211/2025, vigente desde 2026-03-17, y LGPD; EE.UU.: COPPA si se entra) requiere revisión legal antes del primer piloto con menores [Brief; el análisis de negocio §6.5].

#### 2.17.1 Conversaciones con NPCs

1. **Marco cerrado por escena:** cada escena tiene temas permitidos; existe una **lista global de temas vedados** (violencia gráfica, sexualidad, drogas, autolesión, odio, política partidaria, religión como debate, datos personales, contacto fuera del juego, compras, citas/romance). El modelo recibe esa lista en el system prompt y además se filtra la salida.
2. **Moderación doble:** (a) entrada: la transcripción del jugador pasa por un clasificador antes de llegar al NPC; (b) salida: la respuesta del NPC se clasifica antes de mostrarse/reproducirse (en voz en tiempo real, la revisión de arquitectura debe resolver cómo filtrar sin latencia excesiva: p. ej. clasificar el texto paralelo y cortar audio si se dispara). DP-37.
3. **Sin charla libre sin marco en la v1** (DP-30). Ni siquiera para adultos.
4. **El NPC nunca pide datos personales** (nombre real, escuela, dirección, edad, fotos, redes) y si el jugador los da, el NPC no los repite ni los guarda; el observador los elimina del resumen.
5. **Respuestas de contención:** si un jugador expresa algo que sugiere riesgo (autolesión, abuso), el NPC sale de la ficción con una línea guionada y amable que sugiere hablar con un adulto de confianza, y se muestra un recurso de ayuda local (lista curada por país). Evento de seguridad registrado según política de la institución/tutor. Contenido y protocolo: revisión de especialistas (DP-38).
6. **Personajes:** los NPCs adultos nunca tienen relación de intimidad con el jugador; los NPCs niños (Lily) solo aparecen en situaciones de vecindario normales.

#### 2.17.2 Cuentas y roles

| Rol | Qué puede | Qué no puede |
|---|---|---|
| Jugador menor | Jugar, ajustar accesibilidad, ver su cuaderno | Crear cuenta sola/o (requiere código de clase o tutor); chat entre jugadores (no existe en la v1) |
| Jugador adulto | Todo lo anterior; cuenta propia; exportar/borrar | — |
| Tutor/a (guardian) | Dar consentimiento, ver progreso del menor, ver qué datos se guardan, borrar la cuenta, limitar minutos de voz o forzar modo texto | Escuchar audio (no se guarda) |
| Docente | Crear clases y códigos, asignar misiones, ver reportes por can-do, ver alertas de seguridad según política de la institución | Ver transcripciones crudas de menores (default; DP-29) |
| Administrador institucional | Gestionar docentes, licencias y presupuesto de voz de la institución | — |

- **Age gate** (DP-12): default de lanzamiento: cuentas directas solo 18+; menores entran por institución (código de clase) o por invitación de un tutor con consentimiento verificable. Se diseña el cumplimiento desde el día uno porque un juego colorido con compañero es "de probable acceso" por menores aunque apunte a adultos [Negocio §6.5].

### 2.18 Funciones institucionales (B2B), a nivel de concepto

| Función | Descripción | Prioridad |
|---|---|---|
| Clases y códigos de clase | El docente crea una clase, obtiene un código corto; los alumnos entran sin email | v1 piloto |
| Roster | Alta de alumnos por lista (CSV) con nombres de juego generados | v1 piloto |
| Asignar misiones | El docente marca misiones o capítulos como "para esta semana" (no obligatorias dentro del juego; aparecen destacadas en el tablero) | v1 piloto |
| Reporte de progreso por can-do | Por alumno y por clase: can-do demostrados, pociones por rama, minutos de habla, autocorrecciones, ítems más difíciles de la clase | v1 piloto |
| Presupuesto de voz por institución | Pool de minutos de voz que la institución reparte; el modo texto no consume | v1 piloto |
| Alertas de seguridad | Según política acordada con la institución | v1 piloto |
| Modo aula | Pulsar para hablar por defecto, sugerencia de auriculares, volumen de NPC controlado | v1 piloto |
| Exportar reportes | CSV/PDF | Después |
| Integraciones LMS (Google Classroom, Moodle) | — | Después |
| Alineación curricular (BNCC, diseños jurisdiccionales argentinos, MCER) | Mapa misiones → contenidos curriculares | Después |
| Creación de misiones por docentes | Puente con el modo 2 | Año 2 |

**Benchmark:** Noun Town ya vende a instituciones con herramientas docentes [Referencias §3]; la v1 institucional tiene que igualar lo básico (clases, licencias, reportes) y diferenciarse en reportes de habla y control de privacidad.

### 2.19 Funciones de accesibilidad

| Área | Función | Default |
|---|---|---|
| Lectura | Subtítulos del NPC en L2 (siempre) y traducción L1 bajo demanda (tocar la línea) | Subtítulos sí; traducción a demanda |
| Lectura | Tamaño de texto 4 pasos (100-200%), fuente legible sin serif, opción de fuente para dislexia, interlineado ajustable | 125% |
| Lectura | Resaltado palabra por palabra sincronizado con el audio (karaoke) | Apagado en A2+, encendido en A0-A1 |
| Audio | Volúmenes separados (NPC, Lumi, música, ambiente, efectos); voz de Lumi apagable | — |
| Ritmo | Tres velocidades de NPC; `Repetir`; silencio sin límite; botón de pasar turno | §2.6 |
| Entrada | Modo texto completo; pulsar para hablar; umbral de fin de habla configurable; opciones sugeridas | — |
| Visión | Modos para daltonismo (protanopia, deuteranopia, tritanopia) — las ramas de pociones tienen **forma** además de color (ámbar = círculo, verde = hoja, azul = gota, violeta = estrella, coral = triángulo, celeste = onda); alto contraste en HUD | — |
| Visión | Compatible con lector de pantalla en todo el HUD DOM (menús, diálogos, cuaderno) | — |
| Motor | Jugable solo con mouse (click para mover y elegir) o solo con teclado (tabulación por objetos interactivos); sin combinaciones de teclas simultáneas; sin acciones con tiempo límite; teclas remapeables | — |
| Cognitivo | Objetivo actual siempre visible en una línea; resumen "¿qué estaba haciendo?" al volver; sin información solo en audio | — |
| Movimiento | Sin movimientos bruscos de cámara; opción de reducir animación; sin parpadeos | — |
| Rendimiento | Modo gráfico bajo (sin sombras, DPR 1, resolución interna reducida, distancia de dibujo corta, sin postprocesado); modo "solo diálogo" (2D estático con ilustración del NPC) para PCs que no corren el 3D | Auto-detección |
| Red | Modo texto como respaldo automático si la latencia o el ancho de banda no sostienen la voz | — |
| Neurodiversidad | Sin evidencia cuantitativa abierta (dislexia, TDAH) [Investigación §5.5]: se aplican buenas prácticas (fuentes, ritmo, objetivos claros) y se marca como pregunta abierta | — |

**Reglas:** ninguna de estas funciones se desbloquea con progreso ni con pago. El modo gráfico bajo es un requisito de salida de cualquier hito, no una mejora posterior [Referencias §4.4.5].

### 2.20 Persistencia y reanudación

- Guardado automático en servidor (cuenta) con copia local para modo sin conexión parcial (la parte 3D y el cuaderno funcionan sin red; las escenas con NPC necesitan red).
- Al volver: "¿Qué estaba haciendo?" en una línea + vecino que espera.

---

## 3. Guion del modo 1 (Lantern Bay)

> Todo lo de esta sección es contenido de ficción propuesto. Nombres de lugar, personajes y título son provisionales (DP-01, DP-02, DP-11). Los nombres de NPCs son ficticios y no se refieren a personas reales.

### 3.1 Premisa

Lantern Bay es un pueblo costero chico, de casas de colores, un muelle, una colina con un faro viejo y huertas comunitarias. Todos los años, al final del otoño, el pueblo celebraba la **Noche de los Faroles**: cada vecino colgaba un farol de papel y el faro se encendía a medianoche. El invierno pasado una tormenta rompió la lámpara del faro, el festival se suspendió y algo se apagó con él: la gente empezó a cerrar temprano, a saludar de lejos, a no pedirse ayuda.

Agnes Hill, la organizadora de siempre, escribió al programa de voluntarios pidiendo una mano para revivir el festival. El jugador es ese voluntario. El día antes de su llegada, Agnes se quebró una pierna y quedó en reposo en su casa de la plaza: el jugador va a tener que recorrer el pueblo por ella.

En el muelle lo espera **Lumi**, el último farolito que todavía brilla un poco. Lumi explica que los faroles se encienden cuando la gente vuelve a hablarse. Cada vecino que ayudás enciende una ventana; cada barrio con suficientes ventanas encendidas enciende su farol grande; con los cuatro faroles encendidos, el pueblo puede volver a celebrar.

**Tema:** hablar une. El idioma no es un examen, es un puente entre personas. El jugador no es un héroe que salva al pueblo; es un vecino nuevo que se anima a hablar, y eso contagia.

**Tono:** cálido, con humor suave, cotidiano. Sin villanos. El único conflicto adulto es la prudencia del concejal Crane, que tiene razones atendibles. Inspiración de tono: la calidez de *A Short Hike* (pedidos chicos de vecinos, sin apuro), no la épica de un RPG de combate.

### 3.2 El mundo: mapa y barrios

```
                 [Colina del Faro]
              faro · casa de Walter · biblioteca vieja
                        |
   [Huertas] ——— [Plaza] ——— [Muelle]
 huerta comunitaria   panadería · fuente   ferry · muelle de pesca
 veterinaria          café · casa de Agnes correo · cabina de teléfono
 escuela              ayuntamiento         galpón de botes · mercado
```

| Barrio | Farol | Capítulo | Lugares interactivos | Banda |
|---|---|---|---|---|
| **Muelle** (Harbor) | Farol del Muelle | Prólogo + Cap. 2 | Ferry, muelle de pesca, correo, cabina de teléfono, galpón de botes, puestos del mercado | A0, A1→A2 |
| **Plaza** (Square) | Farol de la Plaza | Cap. 1 (+ final) | Panadería de Ben, fuente, café (Jules toca la guitarra), casa de Agnes, ayuntamiento, tablero de pedidos | A1 |
| **Colina del Faro** (Lighthouse Hill) | Farol de la Colina | Cap. 3 | Faro, casa de Walter, biblioteca vieja (Theo), mirador | A2 |
| **Huertas** (Gardens) | Farol de las Huertas | Cap. 4 | Huerta comunitaria (Nadia), veterinaria (Dra. Shah), escuela, invernadero | A2→B1 |

- **Escala:** el pueblo entero se recorre a pie en ~3 minutos. Cada barrio es un "diorama" que se carga por separado (§5.4). No es mundo abierto [Referencias §4.4.1].
- **Hora del día y clima:** ciclo simple de 4 momentos (mañana, tarde, atardecer, noche) que cambia por sesión o por avance, no en tiempo real. Lluvia y niebla como estados guionados de misiones (M2.1 niebla, M4.2 lluvia).
- **El pueblo se ilumina:** ventanas que se encienden, faroles colgados, más vecinos en la calle, música más llena a medida que avanza el arco. Es el principal feedback de progreso visible.
- **Carteles en inglés** por todo el pueblo (Bakery, Post Office, Open/Closed, horarios), con la habilidad `HAB-ENT-2` se vuelven interactivos.

### 3.3 Personajes

#### 3.3.1 Jugador

- Avatar personalizable (cuerpo, tono de piel, pelo, ropa); sin género obligatorio; los NPCs usan el nombre de juego y, si el jugador lo elige, pronombres (he/she/they) que se configuran en el perfil.
- **No tiene voz propia grabada** ni líneas impuestas: lo que dice es lo que el jugador dice.
- Lleva un **cuaderno** (el Frasco de Lumi) y una **canasta prestada** (para los pedidos sin dinero).

#### 3.3.2 Lumi (compañero)

Ver §2.4. Arco propio: empieza tenue y un poco triste ("Hace mucho que nadie me pide que nombre algo"), se vuelve más brillante y bromista, y en el final revela que nunca fue "el último farol": los faroles estaban apagados, no rotos. Cierre: "Mientras sigan hablándose, no me apago."

#### 3.3.3 Vecinos (11 NPCs)

| ID | Nombre | Rol / lugar | Edad | Personalidad | Forma de hablar | Bandas | Lo que necesita (arco) | Voz (dirección) |
|---|---|---|---|---|---|---|---|---|
| `NPC-ROSA` | Rosa Delgado | Capitana del ferry, Muelle | 50s | Calma, paciente, observadora | Muy clara, lenta, gestos; de vez en cuando suelta una palabra en español de su abuela (una vez por capítulo, como guiño, nunca como muleta) | A0-A2 | Que el ferry vuelva a traer gente al festival; decorar los botes | Femenina, media-grave, cálida, ritmo lento |
| `NPC-LILY` | Lily | Vive arriba de la panadería (sobrina de Ben), Plaza | 9 | Curiosa, impaciente, pregunta todo | Frases cortas, muchas preguntas, entusiasmo | A0-A1 | Su perro Biscuit se escapa siempre; quiere un farol propio para el festival | Infantil natural (no caricatura), rápida pero articulada |
| `NPC-BEN` | Ben Okafor | Panadero, Plaza | 40s | Cálido, bromista, ansioso solo con el horno | Repite palabras clave, se ríe, dice "mate" (amigo) | A0-A2 | Hornear el pan de los faroles; volver a abrir hasta tarde | Masculina, grave, alegre |
| `NPC-SAM` | Sam Rivera | Cartero en bicicleta, todo el pueblo | 20s | Despistado, optimista, nuevo en el puesto | Rápido cuando se entusiasma; pide perdón y repite | A1-A2 | Aprender las rutas; entregar las invitaciones del festival | Masculina, joven, ligera |
| `NPC-AGNES` | Agnes Hill | Organizadora del festival, en reposo en su casa, Plaza | 70s | Sabia, divertida, mandona con cariño | Frases completas, claras; humor seco | A1-B1 | Que el festival ocurra aunque ella no pueda caminar | Femenina, mayor, firme y cálida |
| `NPC-WALTER` | Walter Finch | Ex guardián del faro, Colina | 80s | Nostálgico, gruñón tierno, oye un poco menos | Cuenta historias en pasado; pide que le hablen claro ("Speak up, will you?"); acento distinto del general (exposición A2+) | A2 | Reparar la lámpara del faro; que alguien recuerde sus historias | Masculina, mayor, rasposa, ritmo pausado |
| `NPC-THEO` | Theo Park | Bibliotecario, Colina | 30s | Tímido, apasionado por las palabras | Vocabulario rico pero se autocorrige para simplificar; usa "Hmm, in other words..." | A2-B1 | Encontrar el viejo libro de bitácora del faro; animarse a leer en público | Masculina, suave, articulada |
| `NPC-PRIYA` | Dra. Priya Shah | Veterinaria, Huertas | 40s | Precisa, amable, práctica | Preguntas claras, una a la vez; resume lo que entendió | A1-B1 | Atender a los animales del pueblo; que la gente pregunte antes de preocuparse | Femenina, media, serena |
| `NPC-NADIA` | Nadia Haddad | Organizadora de la huerta comunitaria, Huertas | 30s | Energética, opinadora, ecologista | Rápida, opina con razones, cambia de idea si la convencen | A2-B1 | Que el festival use flores y faroles reciclados; un lugar en la plaza | Femenina, enérgica, clara |
| `NPC-JULES` | Jules | Toca la guitarra en el café, Plaza | 16 | Tímido, creativo, escribe canciones | Pocas palabras, se suelta hablando de música | A2-B1 | Animarse a tocar en el festival; escribir la canción del faro | Masculina, adolescente, suave |
| `NPC-CRANE` | Victor Crane | Concejal, ayuntamiento, Plaza | 60s | Prudente, formal, justo | Formal, argumenta con condiciones ("If..., then...") | B1 | Que nadie salga lastimado; lo convencen razones, no ruegos | Masculina, formal, ritmo medio |

**Animales:** Biscuit (perro chico, marrón con collar rojo, se escapa siempre: gag recurrente y vehículo de repaso), Captain (gato gris de Walter).

**Reglas de representación:** diversidad de edades, orígenes y cuerpos sin estereotipos; ningún acento ni rasgo cultural se usa como chiste; el personaje que oye menos no es objeto de burla; Lily y Jules (menores) solo aparecen en situaciones cotidianas de vecindario.

### 3.4 Arco y estructura de capítulos

| Capítulo | Título | Barrio | Banda | Pregunta dramática | Cierre |
|---|---|---|---|---|---|
| Prólogo | La llegada | Muelle → Plaza | A0 | ¿Me animo a decir algo? | Primera ventana encendida |
| 1 | Primeras ventanas | Plaza | A1 | ¿Me dejan entrar a su vida cotidiana? | Farol de la Plaza: Ben vuelve a abrir hasta tarde, el café vuelve a tener música |
| 2 | El muelle despierta | Muelle | A1→A2 | ¿Puedo orientarme y ayudar a otros a orientarse? | Farol del Muelle: Rosa confirma el ferry del festival |
| 3 | Historias del faro | Colina | A2 | ¿Puedo contar lo que pasó y ayudar a planear? | Farol de la Colina: la lámpara del faro funciona en la prueba |
| 4 | La Noche de los Faroles | Huertas → Plaza | A2→B1 | ¿Puedo convencer y unir a los que no están de acuerdo? | Festival; los cuatro faroles; el faro a medianoche |
| Epílogo | El pueblo sigue | Todo | Todas | — | Pedidos diarios del pueblo (fuera de la v1) |

Cada capítulo: 8 misiones principales + 4-8 pedidos del tablero (§3.7). Las misiones principales se desbloquean en grupos para que el jugador **elija** el orden dentro del capítulo (autonomía [Probable, E18]); solo la última misión de cada capítulo exige haber hecho al menos 6 de las 7 anteriores.

### 3.5 Catálogo de misiones

Columnas: ID · título · NPC(s) · banda · can-do · resultado en el mundo · lenguaje objetivo · rama de poción principal · reapariciones (repaso).

#### Prólogo: La llegada (A0)

| ID | Título | NPC | Can-do | Resultado | Lenguaje objetivo | Rama | Reaparece en |
|---|---|---|---|---|---|---|---|
| M0.1 | Hola, Rosa | Rosa | Puedo saludar y decir mi nombre | Rosa te presenta al pueblo y te da el mapa | Hello / Hi, I'm..., Nice to meet you, Thank you | Ámbar | M1.1, M2.3 |
| M0.2 | ¿Cómo se dice? | Lumi | Puedo preguntar y repetir nombres de cosas | Se activa `HAB-BASE-NOMBRAR` | boat, lighthouse, lantern, "What's this?" | Celeste | Repaso de bolsillo |
| M0.3 | Biscuit | Lily | Puedo responder sí/no y decir dónde está algo | Biscuit vuelve con Lily; primera ventana de la plaza | Yes/No, the pier, the boat, here/there | Azul | M1.2, M2.6 |

#### Capítulo 1: Primeras ventanas (Plaza, A1)

| ID | Título | NPC | Can-do | Resultado | Lenguaje objetivo | Rama | Reaparece en |
|---|---|---|---|---|---|---|---|
| M1.1 | Buenos días, Ben | Ben | Puedo presentarme y decir de dónde vengo | Ben te da la credencial de voluntario | Good morning, I'm from..., I'm a volunteer, How are you? / I'm fine, and you? | Ámbar | Todas (saludos) |
| M1.2 | El perro de Lily | Lily, Sam | Puedo describir un animal con color, tamaño y un detalle | Sam encuentra a Biscuit gracias a tu descripción | It's small/big, brown, red collar, Is this your dog?, has got | Azul | M1.6, M2.6 |
| M1.3 | La lista de Agnes | Agnes | Puedo entender una lista simple y preguntar dónde está algo | Agnes te da la lista del festival y te nombra su "pies" | Where is...?, It's next to / near..., There is/are | Celeste | M1.7, M2.1 |
| M1.4 | Harina para el festival | Ben, Rosa, Lily | Puedo pedir cosas con cantidades | Juntás harina, huevos y azúcar prestados; Ben hornea la primera tanda | Can I have...?, two/three..., some, please, How many? | Verde | M1.5, M2.3 |
| M1.5 | Detrás del mostrador | Ben, Rosa, Lily (clientes) | Puedo atender un pedido simple | Ben te deja el mostrador una mañana; vuelven clientes | What would you like?, Here you are, anything else?, numbers | Verde | M2.7 |
| M1.6 | Una torta para Lily (ver D-071) | Ben, Lily | Puedo decir qué le gusta a alguien y elegir colores | Torta de cumpleaños sorpresa | She likes..., Does she like...?, colors, favorite | Ámbar / Azul | M3.6 |
| M1.7 | El reparto | Ben, Lily, Agnes | Puedo preguntar por lugares y seguir indicaciones simples | Pan repartido a 3 casas | Where's the...?, Go straight, turn left/right, opposite | Celeste / Azul | M2.1 |
| M1.8 | Música en el café | Jules | Puedo hablar de gustos y preguntar por los del otro | Jules vuelve a tocar en el café; **Farol de la Plaza** | I like / I don't like, What music do you like?, me too / me neither | Ámbar | M3.6, M4.5 |

#### Capítulo 2: El muelle despierta (Muelle, A1→A2)

| ID | Título | NPC | Can-do | Resultado | Lenguaje objetivo | Rama | Reaparece en |
|---|---|---|---|---|---|---|---|
| M2.1 | Niebla | Sam | Puedo dar direcciones en el pueblo | Sam llega al galpón de botes en la niebla; desbloquea `HAB-DESC-2` | prepositions, imperatives, landmarks, past the..., until you see... | Azul | M2.6, M4.6 |
| M2.2 | La cabina del muelle | Agnes (teléfono) | Puedo hablar por teléfono y contar qué estoy haciendo | Primer reporte a Agnes; desbloquea `HAB-VINC-3` | Hello, it's..., I'm (doing)..., Can you hear me?, presente continuo | Ámbar / Celeste | M3.4, M4.5 |
| M2.3 | Banderines para los botes | Rosa | Puedo preguntar por cantidades y disponibilidad | Los botes decorados | Is there any...?, How much/many?, some/any, a lot of | Verde | M4.6 |
| M2.4 | ¿Quién es quién? | Sam, Rosa, vecinos del mercado | Puedo describir personas y lo que están haciendo | Encontrás a la persona que guarda el papel de farol | She's wearing..., He has got..., the man who is..., presente continuo | Azul | M4.4 |
| M2.5 | Un día de Rosa | Rosa | Puedo hablar de rutinas y horarios | Horario del ferry del festival acordado | What time...?, usually, every day, at/on/in, presente simple | Celeste / Verde | M4.2 |
| M2.6 | Biscuit a bordo | Lily, Rosa | Puedo dar instrucciones precisas | Biscuit sale del barco sin caerse al agua | Stop!, Come here, under/behind/between, Don't... | Azul | — |
| M2.7 | Cartas del correo | Sam | Puedo escribir una nota corta y leer direcciones (mezcla de modalidades) | Invitaciones ordenadas y una nota tuya pegada en el correo | *Dear [nombre],* **solo como encabezado de carta escrita** (excepción explícita del lint de apelativos, F1.2; nunca dicho por un NPC), See you at..., direcciones escritas | Verde / Ámbar | M4.5 |
| M2.8 | La tarde del muelle | Rosa, Sam, Ben, Lily | Puedo sostener charla breve con varias personas | **Farol del Muelle** | small talk: weather, plans, How was your day?, That's great! | Ámbar | Todas |

#### Capítulo 3: Historias del faro (Colina, A2)

| ID | Título | NPC | Can-do | Resultado | Lenguaje objetivo | Rama | Reaparece en |
|---|---|---|---|---|---|---|---|
| M3.1 | La noche de la tormenta | Walter, Theo | Puedo entender un relato en pasado y volver a contarlo | Theo escribe la historia en el registro de la biblioteca | past simple (regular + was/were, went, saw, broke), first/then/after that | Violeta | M3.2, M4.4 |
| M3.2 | El libro de bitácora | Theo, Walter | Puedo hacer preguntas en pasado para encontrar algo | Aparece la bitácora del faro (con el diagrama de la lámpara) | When did you...?, Where did you put...?, Did you...? | Violeta / Azul | M3.4 |
| M3.3 | Captain no come | Walter, Dra. Shah | Puedo explicar un problema de salud simple (de un animal) | Captain se cura; Walter agradecido | He doesn't eat, since yesterday, He looks tired, What should I do?, should | Azul / Coral | M4.7 |
| M3.4 | Planes para la lámpara | Walter, Theo, Agnes (tel.) | Puedo hablar de planes | Plan de reparación acordado | going to, will (decisión en el momento), first we'll... | Violeta | M4.6 |
| M3.5 | ¿Cuál lámpara? | Theo, Walter | Puedo comparar opciones y dar mi preferencia | Se elige la lámpara; desbloquea `HAB-OPIN-1` | bigger/brighter/easier (comparativos sin ningún término monetario), better than, the best, I prefer... because... | Coral | M4.1 |
| M3.6 | La canción del faro | Jules, Walter | Puedo contar una historia breve para que otro la use | Jules escribe la canción del faro (puente con modo 4) | past simple, adjetivos, feelings, It was... | Violeta / Ámbar | M4.8 |
| M3.7 | Theo tiene miedo | Theo | Puedo dar consejos y animar | Theo acepta leer en el festival | You should..., Why don't you...?, Don't worry, You can do it | Coral / Ámbar | M4.8 |
| M3.8 | La prueba del faro | Walter, Theo, Lumi | Puedo contar lo que hicimos en el capítulo | **Farol de la Colina**: la lámpara se enciende en la prueba | recap en pasado, We fixed..., It worked! | Violeta | — |

#### Capítulo 4: La Noche de los Faroles (Huertas y Plaza, A2→B1)

| ID | Título | NPC | Can-do | Resultado | Lenguaje objetivo | Rama | Reaparece en |
|---|---|---|---|---|---|---|---|
| M4.1 | Flores o faroles | Nadia | Puedo dar mi opinión con razones | Plan de decoración de la huerta | I think... because..., In my opinion, I agree/disagree | Coral | M4.3 |
| M4.2 | Si llueve... | Nadia, Rosa | Puedo hacer planes con condiciones | Plan B de lluvia; desbloquea `HAB-OPIN-2` | If it rains, we'll..., What if...?, unless (opcional) | Coral / Violeta | M4.4 |
| M4.3 | El lugar del puesto | Nadia, Ben | Puedo mediar entre dos personas | Ben y Nadia comparten el lugar; desbloquea `HAB-OPIN-3` | So you mean..., What about...?, Both of you..., Could we...? | Coral / Ámbar | M4.6 |
| M4.4 | La asamblea | Crane, Agnes (tel.), vecinos | Puedo presentar un argumento y responder objeciones | Crane aprueba el festival con condiciones | If..., then..., we have already..., safety, Could we agree...? | Coral | — |
| M4.5 | Invitaciones | Sam, Jules, Rosa, Walter (tel.) | Puedo invitar y confirmar detalles | Todo el pueblo invitado | Would you like to...?, It starts at..., Can you bring...? | Ámbar / Verde | — |
| M4.6 | Manos a la obra | Varios | Puedo coordinar tareas entre personas | Preparativos listos | Can you..., while I..., Who is going to...? | Celeste / Verde | — |
| M4.7 | El papel mojado | Nadia, Dra. Shah, Theo | Puedo explicar un problema imprevisto y proponer una solución | Faroles salvados con papel de la biblioteca | The problem is..., We could..., Let's... | Coral / Azul | — |
| M4.8 | La Noche de los Faroles | Todos | Puedo hablar unos segundos frente a otros y charlar en una fiesta | **Farol de las Huertas** + festival + faro a medianoche | Discurso breve preparado (3-5 oraciones, puede leerse), small talk | Todas | Epílogo |

### 3.6 Escenas escritas (guion detallado)

> Formato: **[Apertura guionada]** se graba/cachea. **[Cuerpo IA]** describe objetivo y comportamiento; las líneas son **ejemplos** del estilo y nivel, no un guion fijo. **[Cierre guionado]** se graba/cachea. Lumi habla en L1 (rioplatense neutro) salvo cuando modela una frase.

#### M0.1 · Hola, Rosa (A0)

- **Lugar:** muelle, al bajar del ferry. Mañana. Gaviotas, agua.
- **Necesidad del NPC:** Rosa quiere saber quién sos para anotarte en la lista de pasajeros.
- **Criterios de éxito:** (1) el jugador saluda; (2) el jugador dice su nombre de juego con o sin "I'm". Opcional: "Nice to meet you" / "Thank you".
- **[Apertura guionada]**
  - ROSA: "Hello! Welcome to Lantern Bay." *(saluda con la mano)* "I'm Rosa." *(se señala)* "And you?" *(te señala)*
- **[Cuerpo IA]** — Banda A0, andamiaje 1. Rosa usa máximo 5 palabras por frase y gestos. Si el jugador no responde o pasa el turno: "I'm Rosa." *(se señala)* "You are...?" *(espera)*. Si el jugador dice solo el nombre: "Nice to meet you, [nombre]!" y modela: "*I'm* [nombre]. Yes!" Si dice algo en español: Rosa sonríe: "¡Hola! *(única palabra en español del capítulo)* In English: Hello!" y espera.
- **[Cierre guionado]**
  - ROSA: "Nice to meet you, [nombre]! Here's a map." *(entrega el mapa)* "Lily is in the square. Bye!"
  - LUMI: "¡Primera vez y ya te presentaste! Le dijiste *I'm [nombre]*. Eso va al frasco ámbar: presentarse."
- **Evento:** `map_received`, `rosa_trust+1`. **Repaso marcado:** "Nice to meet you" si no apareció.

#### M0.2 · ¿Cómo se dice? (A0)

- **Lugar:** camino del muelle a la plaza.
- **Mecánica:** el jugador apunta a un objeto resaltado y pide a Lumi el nombre (tecla `Q` o botón "¿Cómo se dice?"). Tres objetos guiados: *boat*, *lighthouse*, *lantern*. Lumi dice la palabra en L2 (audio cacheado), luego en L1, y la muestra escrita.
- **Producción opcional:** "¿Lo decís vos?" — es el primer **momento de pronunciación guionado** (§2.4.7, *repetir después de mí*): si el jugador lo dice, se evalúa contra la palabra y Lumi da feedback amable solo sobre tipos de error habilitados por F0.1 (D-151); si ningún tipo está habilitado, solo verifica que haya intentado la palabra y ofrece "así lo dijiste vos / así suena". 1/3 de poción celeste por intento. (El texto de `02-narrativa-guion.md` no cambia: el momento se arma como dato sobre la línea existente, D-019.)
- **Línea de Lumi al terminar:** "Podés preguntarme cómo se dice cualquier cosa que brille así. Y si querés que me acuerde de una palabra para otro día, tocá *Marcar*."

#### M0.3 · Biscuit (A0)

- **Lugar:** plaza, junto a la fuente. Lily mira para todos lados.
- **Contexto:** al bajar del ferry, una cámara breve mostró un perrito marrón olfateando junto al barco.
- **Necesidad:** Lily quiere saber si viste a su perro y dónde.
- **Criterios:** (1) responde "yes" (o equivalente); (2) indica un lugar (pier / boat / there + click en el mapa).
- **[Apertura guionada]**
  - LILY: "Hi! My dog... Biscuit! Did you see my dog?" *(muestra un dibujo de un perro marrón)*
- **[Cuerpo IA]** — Lily repite "Did you see him?" si hay silencio y el jugador pasa el turno; con "Más simple": "Biscuit. Dog. Yes? No?" Si el jugador dice "yes" sin lugar: "Where? The pier? The park?" (ofrece dos opciones con gestos). Si el jugador dice "no": "Oh no..." y Lumi susurra en L1: "¿No lo viste junto al barco?" (señal de comprensión, no corrección).
- **[Cierre guionado]**
  - LILY: *(corre al muelle, vuelve con Biscuit)* "Biscuit! Thank you! Thank you!" *(Biscuit ladra)*
  - LUMI: "Le dijiste dónde estaba Biscuit: *the pier*. Eso es azul: ubicar cosas. ¿Te acordás cómo se decía *faro*?" *(evocación)*
- **Evento:** `dog_found`, primera ventana encendida.

#### M1.1 · Buenos días, Ben (A1)

- **Lugar:** panadería, mañana. Olor a pan (partículas de vapor).
- **Necesidad:** Ben necesita saber quién sos para darte la credencial de voluntario de Agnes.
- **Criterios:** (1) saludo apropiado a la hora; (2) nombre; (3) de dónde viene (país/ciudad elegida por el jugador; cualquier lugar vale, real o inventado; el NPC no lo guarda como dato personal, solo como dato de juego); (4) responde a "How are you?" y devuelve la pregunta (opcional pero da poción ámbar).
- **[Apertura guionada]**
  - BEN: "Good morning! Ah, you're the new volunteer! Agnes told me. I'm Ben, the baker." *(se limpia la harina)*
- **[Cuerpo IA]** — Banda A1, andamiaje 2. Preguntas en orden flexible: "What's your name?", "Where are you from?", "How are you today?". Reacciona con calidez a cualquier lugar ("Argentina? Wow, far away! Do you like bread?"). Si el jugador dice "I am from Argentina" → bien. Si dice "I from Argentina" (falta el verbo; local, no bloquea) → no se corrige en el momento; Lumi lo marca. Si el error es el objetivo (presentarse) y se repite dos veces → señal escalón 2: Lumi: "¿*I from*...?" Si el jugador dice "mate" por la infusión, Ben se ríe: "Mate? Oh, in Argentina mate is a drink! Here 'mate' means friend!" (momento cultural guionado como rama opcional).
- **[Cierre guionado]**
  - BEN: "Here's your volunteer badge. Welcome to the team, mate!"
  - LUMI: "*Mate* acá es 'amigo', no la infusión. ¿Viste? Ya tenés credencial."
- **Desbloquea:** el tablero de pedidos de la plaza.

#### M1.2 · El perro de Lily (A1) — tarea de brecha de información

- **Escena 1 (Plaza, Lily):** Biscuit se escapó otra vez. Lily describe a Biscuit; el jugador escucha y puede preguntar.
  - **[Apertura]** LILY: "Biscuit ran away AGAIN! Can you help me?"
  - **[Cuerpo IA]** Lily da rasgos solo si el jugador pregunta ("What color is he?", "Is he big?") o si pasa el turno (entonces da uno). Criterio: el jugador obtiene al menos 2 de 3 rasgos (small, brown, red collar). Producción del jugador: preguntas.
- **Escena 2 (Muelle, Sam):** Sam vio varios perros en su ronda.
  - **[Apertura]** SAM: "A dog? I saw three dogs today! Big ones, small ones... What does your dog look like?"
  - **[Cuerpo IA]** El jugador describe. Sam ofrece opciones visibles en el mundo (3 perros distintos en el muelle). Criterio: el jugador transmite 2 rasgos correctos; Sam señala el perro correcto. Si el jugador da un rasgo equivocado ("big"), Sam señala el perro grande (error de predicción amable) y pregunta "This one?" — el jugador corrige ("No, small").
  - **[Cierre]** SAM: "The small brown one with the red collar? He's in my bike basket!" — Biscuit asoma de la canasta.
- **Lumi (post):** destila azul por describir y ámbar por preguntar. Evocación: "¿Cómo le dijiste a Sam que era chiquito?"

#### M1.4 · Harina para el festival (A1) — transacción sin dinero

- **Pre-tarea (Lumi):** "Ben necesita 3 bolsas de harina, 6 huevos y un poco de azúcar. Nadie vende nada: los vecinos prestan. Piezas útiles: *Can I have...?*, *please*, *How many?*"
- **Escena 1 (Ben):** Ben da la lista oralmente; el jugador confirma cantidades ("Three bags of flour?"). Criterio: confirma 2 de 3 ítems con cantidad.
- **Escena 2 (Rosa, en el ferry):** Rosa tiene harina y huevos. Criterio: el jugador pide con cantidad y "please". Rosa pregunta "How many eggs?" — si el jugador dice un número distinto al de la lista, Rosa da esa cantidad y Lumi señala suave al final ("Ben pidió seis..."), oportunidad de volver a pedir.
- **Escena 3 (Lily, en la panadería):** Lily tiene azúcar escondida en su cuarto ("my secret sugar!"). Criterio: pedir con cortesía; Lily negocia en broma ("Can I have a cookie later?") y el jugador acepta/ofrece ("Yes, of course").
- **Cierre:** Ben hornea la primera tanda; vapor dorado; ventana grande de la panadería se enciende.

#### M3.1 · La noche de la tormenta (A2) — ejemplo de escena de nivel medio

- **Escena 1 (Walter, en el faro):** Walter cuenta (2-3 oraciones por turno, pasado) la noche de la tormenta; el jugador hace preguntas para entender ("What happened then?", "Were you scared?"). Walter pide "Speak up!" si el jugador habla bajo (rasgo de personaje; el juego sube la sensibilidad del micrófono, no castiga).
- **Escena 2 (Theo, en la biblioteca):** el jugador **vuelve a contar** la historia a Theo, que la escribe. Criterios: al menos 3 eventos en orden con pasado simple; uso de un conector de secuencia. Theo pregunta para completar huecos ("And after the lamp broke?"). Lumi da señal solo si el error de pasado es global o es el objetivo (lo es en esta misión): escalón 1 lo hace Theo en la ficción ("Sorry, he *goes* or he *went*? I'm writing it down..."), escalón 2+ Lumi.
- **Cierre:** Theo lee en voz alta el registro final (versión correcta, audio cacheado generado a partir del relato del jugador limpio y revisado por el observador): el jugador escucha su propia historia en buen inglés. (Esto es un *recast* global y funciona como modelo, no como corrección.)

#### M4.4 · La asamblea (A2→B1) — escena de persuasión

- **Preparación (con Lumi y Agnes por teléfono):** el jugador elige 3 argumentos de una lista de 6 que se construyeron con las misiones previas (la lámpara reparada, el plan de lluvia, el ferry confirmado, voluntarios coordinados, la veterinaria cerca, la huerta segura). Solo aparecen los argumentos de misiones hechas: el mundo recuerda.
- **Escena 1 (Crane, ayuntamiento):** Crane plantea 3 preocupaciones ("If it rains, people will slip." / "The lighthouse is old." / "Who is going to organize everything?"). El jugador responde con argumentos. Criterios: responder al menos 2 objeciones con un argumento pertinente y una estructura condicional o de propuesta. Crane hace contraobjeción una vez por argumento; si el jugador no la resuelve, Crane acepta parcialmente ("Fine, but only until midnight").
- **Escena 2 (vecinos):** 3 vecinos opinan en la reunión (Nadia, Ben, Rosa); el jugador puede pedir que apoyen ("Rosa, could you tell him about the ferry?") — mediación.
- **Cierre:** Crane: "If all of you are going to be there... then I'll be there too." Votación con faroles de papel levantados.
- **Salida si no converge:** Agnes llama por teléfono en altavoz y ofrece un argumento extra; la asamblea aprueba con condiciones. Nunca se "pierde" la asamblea.

#### M4.8 · La Noche de los Faroles (final)

- **Preparación del discurso (opcional):** Lumi ayuda a armar 3-5 oraciones ("I came to Lantern Bay..."). El jugador puede escribirlas y leerlas, decirlas libremente o elegir "Que lo lea Agnes" (sin penalización; la poción solo se da si habla).
- **Escena 1:** discurso breve en la plaza; los NPCs reaccionan con aplausos y una línea cada uno que recuerda una misión que hicieron juntos (memoria del mundo).
- **Escena 2:** charla libre **con marco** en la fiesta (dos o tres NPCs a elección, 2 min cada uno, temas permitidos: el festival, comida, música, planes).
- **Escena 3 (guionada):** Jules toca la canción del faro (letra construida en M3.6). A medianoche, Walter enciende el faro. Lumi brilla al máximo.
- **Epílogo (Lumi):** "Los faroles nunca estuvieron rotos. Estaban apagados. Mientras sigan hablándose, no me apago." Pantalla de resumen: los can-do demostrados del arco (no números de XP), con una línea por vecino.

### 3.7 Pedidos del tablero (misiones secundarias por plantilla)

Plantillas que el sistema instancia con ítems de repaso vencidos y NPCs disponibles. Cada pedido dura 1-3 minutos.

| Plantilla | Forma | Uso de repaso |
|---|---|---|
| Objeto perdido | Un NPC perdió algo; describirlo a otro que lo encontró | Colores, tamaños, objetos marcados |
| Recado | Llevar algo a alguien y transmitir un mensaje | Frases y saludos marcados |
| Charla de vereda | Conversación breve con objetivo (averiguar un dato: qué va a hacer el NPC hoy) | Ámbar; preguntas marcadas |
| ¿Cómo se dice? (búsqueda sin reloj) | Lumi nombra 5 objetos; el jugador los encuentra | Vocabulario aislado vencido [Probado, condicional, E35] |
| Receta | Ben/Nadia necesitan una lista; pedirla a dos vecinos | Cantidades |
| Mensaje telefónico | Llamar a un vecino y dejar/recibir un mensaje | Teléfono, presente continuo |

### 3.8 Guía de escritura de escenas (para corridas que escriban contenido)

1. Cada escena tiene **una necesidad del NPC** y **criterios de éxito verificables** por el observador. Sin necesidad no hay escena.
2. El NPC **pregunta** más de lo que **cuenta**; en A0-A1, preguntas cerradas o de opción; en A2+, abiertas.
3. Apertura guionada de 1-2 líneas; nunca un monólogo.
4. El NPC usa **solo** la banda de vocabulario de la escena + 1-2 palabras nuevas apoyadas por el contexto visual.
5. El humor sale de los personajes (Biscuit, el horno de Ben, Walter que no oye), nunca del error del jugador.
6. Nada de sarcasmo ni ironía en A0-A2 (no se entiende y genera ansiedad).
7. Toda escena tiene **salida si no converge** y **resultado parcial** narrativamente digno.
8. Referencias culturales del jugador (Argentina; luego Brasil) aparecen como puentes amables (el "mate"), nunca como estereotipo.
9. Ninguna escena requiere datos reales del jugador; si pide un lugar o un gusto, cualquier respuesta inventada vale.
10. Cada escena declara su **resumen para la siguiente** (2-3 líneas) para que el contexto no crezca [Negocio §3.2].

---

## 4. Modos 2 a 5 (visión)

> Estos modos **no se construyen en la v1**. Se describen para que el modo 1 no tome decisiones que los cierren (datos, estado, arte, personajes) y para que el roadmap pueda ordenarlos.

### 4.1 Cómo se conectan los modos con el modo 1

- **Una sola cuenta, un solo perfil, un solo banco de repaso, un solo Lumi.** Todo lo que el jugador demuestra en cualquier modo destila pociones en las mismas ramas.
- **Las habilidades del modo 1 son las llaves de los otros modos** (no se desbloquean por tiempo ni por pago):

| Modo | Se abre con | Por qué |
|---|---|---|
| 2 Contar y construir | `HAB-CONT-1` (contar lo que pasó) + `HAB-DESC-3` (describir personas) — fin del Cap. 3 | Hace falta narrar y describir para "narrar un mundo" |
| 3 Mi día real | Decisión de producto aparte (en suspenso) + adultos solamente | Privacidad |
| 4 Media | `HAB-OPIN-1` (opinar) + M3.6 "La canción del faro" | La canción de Jules es el puente |
| 5 Viaje y cultura | Fin del arco del modo 1 (Noche de los Faroles) | Rosa y el ferry llevan a otros destinos |

- **Regla de estado compartido:** como el mundo 3D y la UI solo hablan a través del estado del juego (§1.4.8), cada modo es un conjunto de pantallas/escenas que lee y escribe el mismo perfil. La revisión de arquitectura define la forma.

### 4.2 Modo 2: Contar y construir (storytelling / world-building)

**Idea:** el jugador **narra** en la lengua meta una escena ("There is a small island with a red house. An old woman lives there. She has a goat...") y el juego la **esculpe** en 3D con piezas del catálogo de assets; después el jugador **habita** ese mundo: los personajes que describió se vuelven NPCs con los que conversa, y otros jugadores (o la clase) pueden visitarlo.

- **Bucle:** describir → ver aparecer → corregir describiendo ("No, the house is *bigger*, next to the tree") → poblar (describir personajes, su personalidad, qué necesitan) → jugar las misiones que surgen de lo que describiste → compartir.
- **Por qué sirve para aprender:** la descripción tiene consecuencia visible inmediata (el error de sentido produce un mundo distinto: error de predicción [Probable, E37]); obliga a producir con precisión espacial y léxica.
- **Construcción tipo tycoon (candidata, DP-15):** la propuesta de terceros trae "grid y construcción" y "loop económico" estilo RollerCoaster Tycoon. En el modo 2 tiene un lugar natural **sin dinero**: colocar edificios y decoración en una grilla describiéndolos o pidiéndolos a NPCs constructores, y que el mundo "funcione" (los NPCs usan los lugares, aparecen pedidos). Si alguna vez aparece una economía, tiene que ser una economía **del mundo** (recursos del pueblo, favores) y no una moneda del jugador que pague por participar. Decisión del operador pendiente.
- **Docentes y UGC:** el docente crea escenarios y misiones para su clase (rama B y D de negocio [Negocio §4]). Requiere moderación de contenido generado.
- **Riesgos:** generación 3D a partir de texto es cara y frágil; se limita a **componer piezas** del catálogo (no generar mallas). Moderación de mundos compartidos con menores.
- **Arte:** reutiliza el mismo kit HD-2D (tiles, volúmenes y sprites) y la paleta (§5) para que todo combine.

### 4.3 Modo 3: Mi día real (en suspenso)

**Idea:** Lumi sale del juego y te acompaña en tu vida diaria en la lengua meta: organizar el calendario, notas, correos, mensajes ("Escribí este mensaje a tu jefe en inglés y lo revisamos juntos").

- **Estado:** en suspenso por decisión del operador; puede enlazar con otro proyecto futuro [Brief].
- **Riesgo:** privacidad alta (correo, calendario, mensajería; voz como dato personal y potencialmente biométrico bajo LGPD) [Negocio §6.6]. **Solo adultos**, nunca para menores.
- **Conexión con el modo 1:** las misiones del modo 1 entrenan las funciones (pedir, explicar problemas, planear) que el modo 3 aplicaría a la vida real; el banco de repaso podría alimentarse de la vida real.

### 4.4 Modo 4: Media (canciones, videos, en vivo o diferido)

**Idea:** aprender con música y video junto a un agente: escuchar una canción, entender la letra, cantarla; ver un video corto y comentarlo con un NPC; ver algo "en vivo" con Lumi al lado.

- **Puente narrativo:** Jules (el músico del café) es el anfitrión; "La canción del faro" (M3.6) es el prototipo de este modo dentro del modo 1.
- **Formas posibles:** karaoke con letra sincronizada; "¿qué entendiste?" con un NPC; canciones y videos originales del juego (sin licencia de terceros) primero; contenido de terceros después.
- **Riesgo:** derechos de autor de canciones y videos de terceros [Negocio §5.1]; el default es producir contenido propio o con licencias abiertas. Integración con plataformas de video: decisión de producto y legal posterior.

### 4.5 Modo 5: Viaje y cultura (sin desarrollar)

**Idea:** Rosa y su ferry llevan al jugador a otros lugares: otros pueblos y ciudades donde se habla la lengua meta, con su cultura, comidas, fiestas y acentos. Cada destino es un "pueblo" con su propio arco corto.

- **Puerta natural de nuevos pares de idioma:** un puerto brasileño para ES→PT (segundo par del [Brief]); una ciudad angloparlante distinta con otros acentos para consolidar EN.
- **Cultura sin estereotipos:** asesoría cultural local por destino.

---

## 5. Dirección de arte, cámara, UI y audio

### 5.1 Principios

1. **Liviano antes que bonito, y bonito por estilo, no por detalle.** El juego vende habla y contexto, no fidelidad gráfica [Referencias §0, §4.4]. Las quejas de las referencias fueron cámara, controles, escalado de UI y rendimiento, nunca "falta de realismo". El estilo elegido por el operador es **HD-2D** (D-139): pixel art sobre un escenario 3D simple con luz real.
2. **Esquemático y claro.** Para aprender, lo esquemático rindió más que lo realista [Hipótesis, E26]; además es más barato y legible.
3. **Diorama, no mundo abierto.** Escenas chicas, con bordes amables (agua, colinas), que se cargan por barrio.
4. **El mundo cuenta el progreso.** Luz, color y vida aumentan con el avance.

### 5.2 Referencias

| Referencia | Qué tomamos | Qué no |
|---|---|---|
| ***Octopath Traveler*** (referencia principal, D-139) y capturas de `docs/refs/estetica/` | **HD-2D**: personajes pixel art como sprites sobre escenarios 3D con texturas pixel art, cámara desde arriba en ángulo, luz cálida, profundidad de campo que hace ver el pueblo como una maqueta | Combate por turnos, menús densos, viñetas oscuras y grano fuerte (bajan la legibilidad del texto) |
| **Townscaper** | Casas de colores apiladas, bordes suaves, paleta pastel saturada, sensación de juguete; agua plana y calma | La generación procedural de edificios (no hace falta) |
| **A Short Hike** | Tono de pedidos de vecinos, calidez, pueblo chico que se recorre en minutos, sin presión; cámara que acompaña | El píxelado como filtro de pantalla completa (acá el pixel art está en las texturas y los sprites, no en un postproceso) |
| **Portfolio 3D de Bruno Simon** | La sensación lúdica de un mundo web que se puede tocar: objetos que reaccionan, sorpresa, todo en el navegador | Física pesada y conducción como eje (DP-14, DP-16): en el modo 1 el movimiento es caminar |
| **Influent** | Todo objeto se puede "preguntar" | Controles de cámara libres y frágiles |
| **Noun Town** | Mundo amable y colorido que se usa en instituciones | Rachas y metas diarias |

### 5.3 Estilo (HD-2D, D-139)

- **HD-2D** (referencia *Octopath Traveler*): el escenario es 3D y simple (tiles con textura pixel art y volúmenes de pocas caras: casas, muelle, faroles) con luz 3D real y sombras suaves; los **personajes son sprites pixel art** que siempre miran a la cámara; la profundidad de campo y el bloom (solo en calidad media y alta) hacen que el pueblo se vea como una maqueta iluminada. Detalle técnico: `03-arquitectura.md` §2.9.
- **Densidad de píxel:** 1 tile = 1 m = 32×32 px; personajes de ~32×48 px a la misma densidad; filtrado sin suavizado (pixel art nítido). Parámetros finales los fija el operador mirando F0.2 (D-154).
- **Objetos interactivos** se distinguen por un brillo suave del color de la rama (o un ícono en modo daltonismo), no por contornos parpadeantes.
- **Personajes:** sprites de proporciones de juguete (cabeza grande, cuerpo simple), legibles a 32-48 px; caminata en 4 direcciones e idle; hablar y saludar si el pack los trae. Diversidad por paleta (piel, pelo, ropa) y accesorios, sobre un pack base por región con licencia registrada (D-153).
- **Lumi:** el objeto más trabajado del juego (§2.4.2): un farolito 3D emisivo de primitivas que brilla sobre la escena pixel (D-082).
- **Modo bajo:** sin postprocesado, sombras *blob*; el estilo se mantiene (el pixel art es barato).

### 5.4 Paleta

Tokens de color (valores de partida, a validar con contraste y modos daltónicos):

| Token | Uso | Valor sugerido |
|---|---|---|
| `mar` | Agua | #5FB3C8 |
| `cielo-dia` | Cielo mañana | #BFE3EC |
| `cielo-atardecer` | Cielo atardecer | #F2B28C |
| `noche` | Cielo noche | #2B3550 |
| `arena` | Caminos, muelle | #E8D3A9 |
| `pasto` | Vegetación | #8CC084 |
| `casa-1..6` | Fachadas (rojo coral, amarillo, menta, celeste, lavanda, blanco cálido) | #E9806E, #F2CF6B, #9ED8B8, #9CC7E8, #B9A6DB, #F4EDE2 |
| `luz-farol` | Emisivos, Lumi | #FFD27A |
| Ramas de pociones | Ámbar / verde / azul / violeta / coral / celeste | #F2A93B / #5FBF6A / #4A86D9 / #9B6BD3 / #EE6F5B / #5FC8D9 (con forma asociada, §2.19) |

- **Progreso por luz:** el pueblo arranca desaturado (saturación −30%) y con pocas luces; cada farol de barrio devuelve saturación y luces cálidas a su zona.
- **HUD:** fondo crema/papel (#FBF6EC) con tinta oscura (#2A2A33) en modo claro; invertido en modo oscuro; contraste mínimo WCAG AA (objetivo AAA para texto de diálogo).

### 5.5 Cámara y controles

- **Cámara desde arriba en ángulo** (D-053, por presets): `topdownOrtho` por defecto (ortográfica, inclinación 55-60°, ~15 tiles de ancho visibles, sigue al jugador con suavizado), `isoOrtho` (girada 45°) como opción, y un encuadre de diálogo al conversar (NPC y jugador a los costados, subtítulos sin tapar caras). **Sin órbita libre**; 3 niveles de zoom. La cámara libre torpe es la lección más cara de las referencias [Referencias §4.2.4, §4.4.2]. Con "reducir movimiento", corte en vez de paneo.
- **Movimiento:** click en el suelo para caminar (pathfinding simple) o WASD/flechas. Sin saltar, sin correr obligatorio (correr opcional con `Shift`). Colisiones simples (no física) por defecto (DP-14).
- **Interacción:** acercarse + `E` / click sobre el NPC u objeto. Íconos de farol sobre NPCs con pedidos.
- **Vehículo lúdico (DP-16):** inspirado en el portfolio de Bruno Simon, la bicicleta del correo (`HAB-DESC-2`) podría ser un momento de juego físico liviano. Default: en la v1 es un traslado rápido animado entre barrios, sin física. Una versión "manejable" con física es candidata para después del vertical slice.

### 5.6 UI y HUD

- **Todo el HUD en la capa DOM** (no dentro del 3D): diálogos, subtítulos, menús, cuaderno, ajustes. Resuelve escalado, accesibilidad y lectores de pantalla [Referencias §4.4.4].
- **Estilo:** papel y tinta, bordes redondeados, tipografía grande y legible (sans humanista; opción para dislexia), íconos simples de línea gruesa.
- **Elementos del HUD en juego:**
  - Línea de objetivo actual (arriba a la izquierda, una línea).
  - Indicador de voz: micrófono escuchando / NPC hablando / tu turno (con forma y color, no solo color).
  - Panel de diálogo (abajo): subtítulos del NPC con palabra resaltada; tocar una palabra = traducción + "Marcar".
  - Barra de andamiaje (abajo, siempre visible en conversación): `Repetir` · `Más despacio` · `Pista` · `Pasar el turno` · `Escribir` · `Marcar` · `Terminé`.
  - Presupuesto de voz (discreto, en el menú, y aviso amable cuando quedan pocos minutos).
  - Frasco de Lumi (cuaderno): pociones por rama, can-do demostrados, ítems para repasar, historial de misiones.
- **Nada de números grandes de XP** en pantalla. El progreso se muestra como frascos, faroles y frases "puedo...".

### 5.7 Estrategia de assets: tiles y sprites pixel art, volúmenes CC0

- **Regla:** las IA de código no modelan 3D ni dibujan sprites. Se usan **packs con licencia registrada**, se copian al proyecto y se ubican por código (posiciones y capas de tiles en datos de escena). [Directiva del operador]
- **Personajes y tiles (D-153):** packs de sprites y tilesets **pixel art** con licencia que permita uso comercial y modificación (CC0 primero; CC-BY con atribución o licencia comercial paga de itch.io como segunda opción), con caminata en 4 direcciones y un **solo pack base por región** para que el estilo sea uniforme. **No** se usan licencias "no comercial" o "solo uso personal" (bloquearían el resto del plan aunque hoy el juego sea del operador), ni sprites generados por IA salvo decisión explícita del operador. **El operador elige y descarga el pack** (y lo compra si es pago).
- **Volúmenes y props (glTF/GLB, CC0):** **Kenney.nl** (kits de ciudad, naturaleza, muebles, embarcaciones, decoración, y packs de **audio**), **Quaternius** y **Poly Pizza** solo con CC0 explícito; con textura pixel o color de paleta para que combinen con los tiles.
- **Registro de assets obligatorio:** `content/assets-registry.yaml` (ruta canónica, `03-arquitectura.md` §4.2.1; campos en §6.4.2) con: archivo, pack, autor, licencia, URL de origen, fecha de descarga, sha256, modificaciones y si exige atribución. Sin registro, el asset no entra; el build falla.
- **Unificación visual:** la misma densidad de píxel (32 px por tile), la misma paleta aplicada por recolor, la misma luz; preferir un pack principal por categoría.
- **Presupuesto (propuesta para validar con F0.2):** cada barrio < 50k triángulos visibles en modo medio; < 150 draw calls (chunks de tiles fusionados, instancias para repetidos); texturas compartidas ≤ 1 atlas de 1024 px por barrio; descarga inicial (muelle + plaza) < 15 MB comprimido; interactivo en < 15 s en una PC modesta.
- **Lumi y elementos de identidad** (faroles, logo): primitivas por código (un farol es geometría simple) o encargo a un artista (DP-39).

### 5.8 Audio, música y voz

- **Música:** acústica, cálida, tempo lento (guitarra, ukelele, piano suave, percusión liviana), un tema por barrio que se "llena" de instrumentos al encender su farol. Durante las conversaciones la música baja (ducking) automáticamente. Fuentes: composición propia o música con licencia libre verificada (DP-40).
- **Ambiente:** mar, gaviotas, viento, pasos, campanita de la panadería. Kenney y otros packs CC0 de audio.
- **Efectos de interfaz:** suaves y cortos; sin sonidos de error. El "gluc" de la poción es la firma sonora.
- **Voces de NPC:** voces del motor de tiempo real asignadas por personaje según la tabla de §3.3.3 (DP-20); las líneas guionadas se pre-generan con la misma voz para que no cambie el timbre entre lo guionado y lo generado. Acento: general claro en NPCs de A0-A1; Walter y uno más con otros acentos desde A2 (exposición a variantes) (DP-26).
- **Voz de Lumi:** TTS en L1 (rioplatense neutro en la v1, DP-28), cálida; en L2 cuando modela frases.
- **Mezcla de accesibilidad:** volúmenes separados por canal (§2.19).

---

## 6. Métricas y experimentos

> Regla: **separar métricas de aprendizaje de métricas de engagement.** Un juego puede subir el engagement sin mover el aprendizaje (puntos y niveles subieron cantidad, no calidad [Probable, E15]) [Investigación §4].

### 6.1 Métricas de aprendizaje (resultado)

| Métrica | Cómo se mide en el juego | Fuente del diseño |
|---|---|---|
| Pre/post con test diferido | Tarea oral estandarizada fuera de las misiones (escena de evaluación con NPC "visitante" que no da pistas), al inicio, al terminar cada capítulo y 1-2 semanas después | Efectos diferidos e inmediatos difieren (0,92 vs 0,58 en Wang 2026) [Investigación §4] |
| Producción oral en tarea nueva (transferencia) | En la tarea de evaluación: complejidad, precisión y fluidez (CAF); diversidad léxica; tasa de autocorrección tras un prompt | [Investigación §4] |
| Retención de ítems marcados | Tasa de uso correcto en su reaparición espaciada (por intervalo) | [Investigación §4], E34 |
| Disposición a hablar y ansiedad | Escalas validadas (FLCA, WTC) cortas, antes y después, en piloto (con consentimiento; menores con tutor/institución) | [Investigación §4], E1, E3 |
| Can-do demostrados | Cantidad y velocidad de can-do demostrados por capítulo | Diseño |

### 6.2 Métricas de engagement (proceso)

| Métrica | Definición |
|---|---|
| Retención por cohorte | D1, D7, D30; sesiones por semana |
| **Libre elección** | Sesiones iniciadas **sin recordatorio ni recompensa pendiente**: el indicador clásico de motivación intrínseca de Deci [Investigación §4]. Métrica norte del engagement |
| Uso de accesibilidad | Uso de `Más despacio`, botón de silencio, modo texto, pistas; y su relación con la producción |
| Producción por sesión | Turnos de producción del jugador por escena y minutos de habla del jugador (no del NPC) |
| Convergencia de escenas | % de escenas que cumplen criterios sin "salida si no converge" |
| Costo | US$ por minuto de voz real y por jugador activo por mes (experimento #1 de el análisis de negocio) |
| Calidad percibida | Reporte de errores de traducción/reconocimiento por los jugadores (botón "algo está mal") |

**Umbrales de referencia (de el análisis de negocio §7, para el prototipo):** D7 de retorno sin recordatorio ≥ 15%; costo de voz ≤ US$0,03/min activo (condición para seguir) y criterio de pivote si ninguna opción baja de US$0,05/min.

### 6.3 Los tres experimentos A/B propuestos por la investigación

| # | Experimento | Brazo A | Brazo B | Métrica principal | Métricas secundarias | Por qué |
|---|---|---|---|---|---|---|
| A/B-1 | **Feedback inmediato+diferido vs solo diferido** | Modo "Acompañado" (señal breve inmediata + repaso al cierre) | Modo "Solo anotar" forzado (sin señales en escena, mismo repaso) | Retención de ítems marcados en reaparición espaciada; precisión en tarea de evaluación diferida | Ansiedad (FLCA corta), libre elección, abandono de escena | Inmediato ≥ diferido [Probable, E32]; dosis [En disputa] |
| A/B-2 | **XP informativa vs XP por completar** | Pociones solo por competencia demostrada (diseño actual) | Pociones por completar misión (misma cantidad promedio) | **Libre elección** (sesiones sin recordatorio ni recompensa pendiente) | Calidad de producción (CAF), D7/D30 | Sobrejustificación [Probado en lab, E12]; transferencia [En disputa, E16] |
| A/B-3 | **Botón de silencio vs andamiaje automático** | Silencio sin límite + botón `Pasar el turno` (chip visual apagado) | Andamiaje automático: tras X s (p. ej. 8 s) el NPC ofrece una pista o dos opciones | Turnos de producción por escena; tasa de producción sin pista | Ansiedad, uso de pistas, libre elección | Sin estudios [Hipótesis, E10]; riesgo de falta de empuje [Hipótesis] |

**Condiciones éticas:** ningún brazo quita funciones de accesibilidad; en menores los experimentos requieren aprobación de la institución y del tutor; los brazos se asignan por cuenta (no por sesión) y se informa en la política de privacidad que el juego se mejora con experimentos.

---

## 7. Glosario

| Término | Definición en este proyecto |
|---|---|
| **L1 / L2** | Lengua materna del jugador / lengua que aprende (lengua meta) |
| **MCER (CEFR)** | Marco Común Europeo de Referencia para las lenguas; niveles A1-C2. **A0** = pre-A1 (principiante absoluto) |
| **Can-do** ("puedo...") | Enunciado de lo que el jugador demostró poder hacer con la lengua |
| **TBLT** | Enseñanza basada en tareas: la lengua como medio para un resultado no lingüístico |
| **Tarea** | Misión con resultado en el mundo que exige usar la lengua |
| **Escena** | Conversación corta (2-4 min) con un NPC, con objetivo y criterios de éxito |
| **Pre-tarea / post-tarea** | Preparación con Lumi / cierre con destilación y evocación |
| **Prompt (feedback)** | Señal que lleva al jugador a autocorregirse (pedido de aclaración, repetición, pista metalingüística, elicitación) |
| **Recast** | Reformulación correcta de lo que dijo el jugador, sin pedirle que repita |
| **Error global / local / sistemático / desliz** | Impide entender / el sentido queda claro / se repite / aislado |
| **Disfluencia** | Repetición, arranque en falso, muletilla o autocorrección; no es error |
| **Observador** | Proceso que analiza los turnos del jugador (errores, criterios de éxito, ítems) y emite eventos al juego (heredado de un prototipo de voz anterior) |
| **Lumi** | El compañero flotante (nombre provisional) |
| **Poción de conocimiento** | Unidad de evidencia de competencia por rama; la "XP" del modo 1 |
| **Destilar** | Momento post-tarea en que Lumi nombra lo demostrado y las pociones caen al frasco |
| **Verter** | Asignar pociones a un nodo del árbol de habilidades para abrirlo (no se pierden) |
| **Frasco de Lumi** | Cuaderno del jugador: pociones, can-do, ítems de repaso, historial |
| **Banco de repaso** | Ítems marcados con su nivel de dominio y próxima fecha |
| **Repaso de bolsillo** | Repaso opcional de 60-90 s al entrar, de palabras sueltas |
| **Andamiaje** | Apoyo que el NPC y Lumi dan (velocidad, longitud, opciones, pistas, L1) |
| **Salida si no converge** | Cierre amable de una escena que no alcanzó sus criterios |
| **Sobrejustificación** | Cuando una recompensa externa esperada reemplaza la motivación propia y la reduce |
| **Libre elección** | Medida de motivación intrínseca: actividad iniciada sin presión ni recompensa pendiente |
| **Diorama** | Escena 3D chica y cerrada, cargada por separado |
| **Modo bajo** | Configuración gráfica mínima para PCs modestas |
| **Modo texto** | Jugar escribiendo en vez de hablar |
| **Presupuesto de voz** | Minutos de voz disponibles por semana según plan o institución |
| **DP (DECISION-PENDING)** | Decisión que el operador debe tomar; tiene default para corridas headless |
| **Vertical slice** | Primera porción jugable de punta a punta con calidad final (ver DP-10) |
| **ATP** | Apto para todo público |
| **ECA Digital** | Estatuto Digital del Niño y del Adolescente de Brasil (Lei 15.211/2025) |

---

## 8. Fuera de alcance (v1 del modo 1)

1. Modos 2, 3, 4 y 5 (solo visión, §4).
2. Construcción en grilla, tycoon, economía, dinero, tiendas, precios (DP-15).
3. Combate de cualquier tipo.
4. Multijugador, chat entre jugadores, perfiles públicos, amigos, tablas de líderes.
5. Rachas, recompensas diarias, notificaciones push con recompensa.
6. Charla libre sin marco con NPCs (DP-30).
7. Puntajes numéricos o rankings de pronunciación (la pronunciación es núcleo, §2.4.7, pero sin números; D-044).
8. Celular nativo o web móvil como plataforma objetivo (DP-31) — solo no cerrarlo.
9. Pares de idioma distintos de ES→EN (ES→PT y PT→EN después).
10. Generación de modelos 3D o sprites por IA (D-153); modelado propio fuera de primitivas simples.
11. Física completa / vehículo manejable (DP-14, DP-16).
12. Contenido de terceros con derechos (canciones, videos).
13. Integraciones LMS, exportaciones avanzadas, creación de misiones por docentes.
14. Pedidos diarios del epílogo (post-arco) generados indefinidamente (DP-34).
15. VR (destino futuro con el mismo stack, épica E-XR; D-142).
16. Almacenamiento de audio crudo en el servidor (solo hasta 20 clips en el dispositivo del jugador, D-155).

---

## 9. Preguntas abiertas y registro de decisiones pendientes (DECISION-PENDING)

> Cada DP tiene un **default recomendado** que una corrida headless usa si el operador no decidió. Al decidir, el operador reemplaza "Pendiente" por la decisión y la fecha. Las marcadas **(revisión de arquitectura)** son de arquitectura: las decide la revisión de arquitectura, el operador valida.

| ID | Decisión | Opciones | Default recomendado | Por qué | Afecta |
|---|---|---|---|---|---|
| DP-01 | Título del juego | *Lantern Bay* / *Bahía de los Faroles* / otro | **Decidido (2026-10-06, D-031): *Mundo Rush*** como título provisorio; *Lantern Bay* queda como nombre del pueblo | Coherente con el mundo y el tema | Marca, arte |
| DP-02 | Nombre y forma del compañero | Lumi farolito / otro nombre / otra forma (luciérnaga, pájaro, nube) | **Lumi**, farolito de papel flotante | Une la metáfora de luz, el progreso visible y el festival | §2.4, arte |
| DP-03 | Idioma en que habla Lumi | Siempre L1 / siempre L2 / transición | L1 en A0-A1; mezcla en A2; L2 salvo explicaciones en B1; ajustable por el jugador | Explicar en L1 baja la carga en principiantes; pasar a L2 aumenta exposición | §2.4, §2.10 |
| DP-04 | Modo de feedback por defecto | Acompañado / Solo anotar / Más ayuda | **Acompañado** (señal inmediata liviana + repaso al cierre); "Solo anotar" como opción del jugador | [Probable, E31, E32]; [Probado, E34] | §2.4.4, A/B-1 |
| DP-05 | Silencio: botón vs andamiaje automático | Solo botón / botón + chip visual a los 10 s / NPC ofrece pista sola tras X s | **Botón + chip visual silencioso a los 10 s** (desactivable); A/B-3 decide | [Hipótesis, E10]; riesgo de falta de empuje | §2.6, A/B-3 |
| DP-06 | Fin de turno del jugador **(revisión de arquitectura)** | VAD con umbral largo + botón / pulsar para hablar / solo botón | **VAD 2,5-4 s configurable + botón `Terminé`**; pulsar para hablar como opción (default en modo aula) | El NPC nunca interrumpe y el jugador no depende de un botón | §2.6.2 |
| DP-07 | Técnica de "más despacio" **(revisión de arquitectura)** | Instrucción al modelo / reproducción más lenta sin cambiar tono / TTS con parámetro | La que mantenga naturalidad con menor latencia; medir | Calidad percibida | §2.6.1 |
| DP-08 | ¿Pociones como moneda de minutos de voz? (sugerencia de el análisis de negocio) | Sí / No | **No.** Presupuesto de voz separado y en lenguaje llano | Convertiría la XP en pago por participar [Probado en lab, E12] | §2.5.5, negocio |
| DP-09 | ¿Pociones gastables? | Se gastan / se acumulan / se "vierten" sin perderse | **Se vierten** en nodos y quedan visibles; nunca se pierden | Mantiene la metáfora de moneda del brief sin castigo ni economía | §2.7.4 |
| DP-10 | Alcance del primer build (vertical slice) | Solo prólogo / prólogo + Cap. 1 / prólogo + Cap. 1-2 | **Prólogo + Capítulo 1** (Muelle + Plaza, 6 NPCs: Rosa, Lily, Ben, Sam, Agnes, Jules; 11 misiones + pedidos del tablero) — **ver D-019 y D-056: 13 vecinos; gana el registro**, ES→EN, PC web, voz + texto, accesibilidad completa, modo bajo — **Decidido (2026-10-06, D-019):** con el guion tal como está, en modo juego (mapa HD-2D) + voz + texto + pronunciación. | Entra en semanas; prueba el loop completo [Negocio §5.1, §6.7] | Roadmap |
| DP-11 | Ambientación | Pueblo costero ficticio angloparlante / ciudad real / otro | **Pueblo costero ficticio** | Evita representar lugares reales; diorama barato | §3 |
| DP-12 | Política de edad al lanzar | Solo 18+ directo y menores vía institución/tutor / ATP directo con verificación / solo adultos | **Cuentas directas 18+; menores solo vía código de clase o invitación de tutor con consentimiento**; revisión legal antes del primer piloto con menores | ATP del brief + ECA Digital [Negocio §6.5] | §2.17 |
| DP-13 | Retención de datos de voz y transcripciones | Guardar audio / no guardar; transcripciones N días | **No guardar audio; transcripciones 30 días**; solo quedan ítems extraídos | Minimización; voz como dato personal | §2.13 |
| DP-14 | Física (Rapier) en el modo 1 **(revisión de arquitectura)** | Sí / No | **No**: controlador cinemático con colisiones simples — **Decidido (2026-10-06, D-087):** Rapier más adelante. | la investigación de referencias §4.4.3; peso y CPU | Stack |
| DP-15 | Construcción/tycoon/economía de la propuesta de terceros | Adoptar en modo 1 / diferir a modo 2 / descartar | **Diferir como candidata del modo 2, sin dinero del jugador**; nunca en el modo 1 — **Decidido (2026-10-06, D-018).** | Choca con "sin dinero" y con el foco en el habla | §1.9, §4.2 |
| DP-16 | Vehículo lúdico estilo Bruno Simon | Ninguno / traslado animado / bicicleta manejable con física | **Traslado animado en la v1**; manejable después del vertical slice si el rendimiento lo permite | Delight sin costo de física | §5.5 |
| DP-17 | Estilo de render | Low-poly plano / cel-shading con contornos / mezcla | **Decidido (2026-10-06, D-139): HD-2D** (sprites pixel art sobre escenario 3D, postprocesado por tier; D-077) | Legible, barato | §5.3 |
| DP-18 | Cámara | Tercera persona asistida / isométrica fija / libre | **Cámara ortográfica desde arriba en ángulo por presets** (`topdownOrtho` default, `isoOrtho` opción; D-053, actualizado por D-139) | Lección de la investigación de referencias §4.4.2 | §5.5 |
| DP-19 | Fuente de personajes animados | Kenney / Quaternius / encargo | **Sprites pixel art de un pack con licencia registrada** (D-078, D-153); glTF CC0 solo para volúmenes | Las IA no modelan ni animan | §5.7 |
| DP-20 | Voces de NPCs | Voces del motor de tiempo real / TTS aparte / actores | **Voces del motor de tiempo real** con las mismas voces para líneas pre-generadas | Coherencia de timbre | §5.8 |
| DP-21 | Líneas guionadas: TTS cacheado o voz humana | TTS / humanos | **TTS cacheado** en la v1; humanos para trailer o si hay presupuesto | Costo | §2.5.7 |
| DP-22 | Presupuesto de voz del plan gratis y de pago | Minutos por semana | **Gratis: 10 min de voz por semana + texto ilimitado** (ejemplo de el análisis de negocio §3.4); pago e institucional: a definir tras el experimento de costo | Accesibilidad sustentable; "el que paga financia al que no" | Negocio, §2.5.5 |
| DP-23 | Rankings o componentes sociales | Ninguno / clase privada / público | **Ninguno en el modo 1** | P3 y menores | — |
| DP-24 | Recordatorios | Ninguno / opt-in sin recompensa / push con recompensa | **Opt-in sin recompensa**, configurable por jugador o docente | Libre elección como métrica norte | §2.2.3 |
| DP-25 | Nivelación inicial | Examen / autodeclaración + adaptación | **Autodeclaración (4 opciones) + adaptación en el prólogo** | Menos ansiedad | §2.12 |
| DP-26 | Variante y acentos del inglés | General americano / británico / mezcla | **General claro en A0-A1; desde A2 aparecen 2 NPCs con otros acentos**; comprensión acepta todas las variantes | Exposición gradual | §5.8 |
| DP-27 | Feedback de pronunciación | Puntaje / solo si rompe el sentido / ninguno | **Decidido (2026-10-06, D-044): núcleo desde la v1** (§2.4.7): momentos guionados con feedback, detección en fondo sin interrumpir, drills; solo tipos que pasan la vara de F0.1 (D-151) | la investigación de referencias §4.2.3 | §2.4.4 |
| DP-28 | Variante del español de interfaz y Lumi | Rioplatense (voseo) / neutro (tuteo) / ambos | **Rioplatense con voseo para Argentina**; variante neutra cuando se expanda | Mercado Argentina primero | UI, voz |
| DP-29 | Acceso del docente a transcripciones de menores | Nunca / agregadas / crudas | **Solo reportes agregados por can-do; transcripciones crudas nunca por defecto**; eventos de seguridad según política de la institución | Privacidad de menores | §2.17, §2.18 |
| DP-30 | Charla libre sin marco con NPCs | No / solo adultos / todos | **No en la v1** | Seguridad y costo | §2.17 |
| DP-31 | Móvil | v1 / después | **Después**; la v1 no cierra el camino (HUD responsive, objetivos táctiles) | Brief: PC primero | §1.6 |
| DP-32 | Sugerencia de fin de sesión | Ninguna / a los ~20 min / tras N misiones | **Tras 2-4 misiones o ~20 min, una vez, y luego cada 15 min** | Sesiones cortas [Probable, E23] | §2.2.2 |
| DP-33 | Mostrar etiquetas MCER al jugador | Sí / no / según edad | **Menores: solo can-do; adultos y docentes: can-do + MCER** | Evitar presión en chicos | §2.11 |
| DP-34 | Epílogo con pedidos diarios generados | Sí / no | **Sí, pero fuera de la v1** | Contenido infinito con repaso | §3.7 |
| DP-35 | Proveedor de IA y residencia de datos para menores | Gemini / otro / mixto | **Revisión legal antes del piloto con menores**; mientras tanto el reuso de un prototipo de voz anterior (Gemini) vale para adultos | ECA Digital, LGPD, Ley 25.326 | §2.17 |
| DP-36 | Vía principal de voz **(revisión de arquitectura + experimento #1)** | Tiempo real (Gemini Live) / cascada STT+LLM+TTS / mixta | **Decidir con la sonda de costo de el análisis de negocio (#1)**; mientras tanto, tiempo real para escenas y cascada para modo texto con audio — **Decidido (2026-10-06, D-092): híbrida** (Live ahora + cascada; F0.1 decide la del piloto, D-149). | Costo cuadrático [Negocio §3.2] | §2.5.2 |
| DP-37 | Moderación de salida en voz en tiempo real **(revisión de arquitectura)** | Filtrar texto paralelo y cortar audio / retrasar audio / solo prompt | **Filtrar el texto paralelo y cortar el audio si dispara**, con medición de latencia | Menores | §2.17 |
| DP-38 | Protocolo ante señales de riesgo de un menor | Definir con especialistas | **Línea guionada de contención + recurso local + evento según política**; revisión de especialistas antes del piloto | Seguridad | §2.17.1 |
| DP-39 | Arte de identidad (Lumi, faroles, logo) | Por código con primitivas / encargo a artista | **Por código con primitivas en la v1**; encargo si hay presupuesto | Las IA no modelan | §5.7 |
| DP-40 | Música | Propia / licencia libre / encargo | **Licencia libre verificada (CC0/CC-BY con atribución) en la v1**; encargo después | Costo | §5.8 |
| DP-41 | Hora del día | Tiempo real / por progreso | **Por progreso y por sesión**, no reloj real | Control narrativo, rendimiento | §3.2 |
| DP-42 | Pronombres configurables del avatar | Sí / no | **Sí** (he/she/they), opcional | Inclusión; los NPCs se dirigen al jugador | §3.3.1 |

### 9.1 Preguntas abiertas de evidencia (no son decisiones del operador; se resuelven midiendo)

1. **Botón de silencio:** ningún estudio [Hipótesis, E10] → A/B-3.
2. **Dosis y forma del feedback correctivo en diálogo con IA** [En disputa] → A/B-1 y parámetro de densidad (§2.4.3).
3. **Efecto de los LLM a largo plazo**, más allá de la novedad (E8) → test diferido en pilotos.
4. **Portugués como L2 para hispanohablantes:** sin fuente específica; la cercanía tipológica puede cambiar qué errores importan y cuánto corregir [Investigación §5.4] → investigar antes del par ES→PT.
5. **Neurodiversidad, baja alfabetización, bajo ancho de banda:** sin evidencia cuantitativa abierta [Investigación §5.5] → pruebas con usuarios y especialistas.
6. **XP que desbloquea habilidades en un juego de L2:** sin estudio directo (E16) → A/B-2.
7. **Abandono en apps gamificadas con datos independientes** [Investigación §5.7] → medir nuestra propia retención.
8. **Menores:** adolescentes podrían ganar más con diálogo y niños sufrir más el socavamiento por recompensas [Investigación §5.8] → pilotos con institución.
9. **Precisión del reconocimiento de voz con acento rioplatense** [Referencias §4.2.3] → medir en la sonda de costo.
10. **Rendimiento real en PC escolar argentina** [Referencias §4.4.5; el análisis de negocio #5] → benchmark antes de cerrar el stack.

---

## 10. Fuentes citadas

Todas las fuentes externas fueron leídas y graduadas por los informes de origen; este GDD no agrega fuentes nuevas.

- **[Brief]** (documento interno) (decisiones del operador, 2026-10-04).
- **[Negocio]** (documento interno) (mercado, unit economics de voz, ramas de negocio, riesgos, experimentos).
- **[Investigación]** (documento interno) y `20-evidencia.md` (E1-E37; Bibauw et al. 2022; Hou & Min 2026; Wang et al. 2026; Li, Wang & Yang 2025; Teimouri et al. 2019; Botes et al. 2022; Lyster & Saito 2010; Xu & Zeng 2023; Li 2018; Deci, Koestner & Ryan 1999; Mekler et al. 2017; Ryan, Rigby & Przybylski 2006; Sailer & Homner 2020; Clark et al. 2016; Bryfonski & McKay 2019; Novak et al. 2019; kim-webb-2022; belardi-2021; schimke-2021/2023; beauchemin-2024; fazekas-2020).
- **[Referencias]** (documento interno) (Terra Alia, Influent, Noun Town, Newcomer, Talk to Me Human; implicaciones para cámara, rendimiento y stack).
- **[Prototipo de voz]** un prototipo de voz anterior (server.js: proxy WebSocket a Gemini Live; teacher-config/rules.md: regla de disfluencias, tono, memoria; teacher-config/prompts.json: modos conversación y corrección; teacher-config/knowledge/sla-research.md: clasificación de errores).
- **Directiva del operador sobre estética y assets:** cel-shaded o low-poly (Townscaper, A Short Hike), portfolio de Bruno Simon, packs gratuitos (Kenney.nl, glTF/GLB) en `public/` ubicados por código (2026-10-05); **reemplazada en el estilo por HD-2D** (D-139, 2026-10-06; referencias en `docs/refs/estetica/`).
- **[Referencias pronunciación]** `docs/research/pronunciacion-2026-10-06.md` y **[Referencias voz]** `docs/research/voz-costo-valor-2026-10-06.md` (2026-10-06).
- **Propuesta de terceros ("prompt para Claude Code")** compartida por el operador: stack y reglas de arquitectura (§1.9).

---

*Fin del GDD v0.1. Siguiente paso según planificación: revisión de la revisión de arquitectura (arquitectura, DPs marcadas "(revisión de arquitectura)") y decisión del operador sobre DP-10 (alcance del vertical slice) antes de que el roadmap por fases convierta este documento en planes ejecutables.*
