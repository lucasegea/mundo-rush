# Propuesta C: Maqueta pintada

**Proyecto:** learning-game (*Mundo Rush*, modo 1 *Kestrel Valley*) · **Fecha:** 2026-10-12 · **Autor:** construcción (el entorno de desarrollo), corrida nocturna sin operador
**Estado:** propuesta para elegir (**la recomendada**). Si el operador la elige, este documento pasa a ser la biblia de arte del juego y reemplaza la dirección HD-2D (D-139) y la densidad de píxel (D-154). La cámara desde arriba por presets (D-053) se mantiene con otro lente.
**Mockup:** [`propuesta-c-maqueta-pintada.html`](propuesta-c-maqueta-pintada.html) (abrilo con doble clic; `#charla` al final de la URL abre directo la conversación). Comparación con las otras: [`index.html`](index.html).

> **En una frase:** el valle como una maqueta de juguete pintada a mano: 3D de formas redondas (sin un solo cubo a la vista), sombreado en bandas suaves con pincelada, visto desde arriba en diagonal con un lente largo que lo hace parecer un diorama, la legibilidad del mapa de *Heroes IV* y el color soleado de los juegos móviles.

---

## 1. Concepto y palabras de ánimo

- **Qué es:** 3D real de pocos polígonos, pero **redondeado** (copas hechas de esferas, casas con aristas biseladas, techos de paja con cumbrera blanda, personajes de cápsulas), pintado con **color por vértice** (degradé de luz y temblor de pincel) y un **material toon de 4 bandas** con una textura de pincelada encima. La cámara es una perspectiva de **lente largo (FOV 30°)** inclinada 50° y girada 45°: se ve casi como un isométrico, pero con profundidad y un poco de perspectiva que lo vuelve "maqueta".
- **Palabras de ánimo:** maqueta, juguete, pintado, redondo, soleado, ordenado, amable.
- **Qué toma de cada referencia:**
  - *Heroes IV* (1): la vista desde arriba en diagonal que deja leer caminos, río, puentes y casas de un vistazo; la densidad de bosque en los bordes; la sensación de "mapa de aventura".
  - Juegos móviles (2 a 4): el color saturado y luminoso, el verde de lomas, el sol, los personajes 3D estilizados con animación, el carro con fardos.
  - *Townscaper* y *A Short Hike* (ya en el GDD §5.2): juguete, pastel saturado, calidez, pueblo chico.
- **Qué no toma:** el pixel art (rechazado), los cubos (rechazados: "todo cuadrado"), la cámara que hay que manejar y la oscuridad épica.

## 2. Mundo: estructura y escala

- **Unidad:** 1 unidad = 1 m. Personajes de ~2.6 m (escala de juguete: más grandes que en la vida real respecto de las casas, para leerse desde arriba), casa de 5.2 × 4.2 m con muros de 2.4 m, árbol de hoja de 4 a 5 m.
- **Zonas:** cada zona del GDD es un **diorama de ~80 × 80 m caminables** sobre un terreno de 96 × 96 m. El borde son lomas suaves de hasta ~5.5 m que suben desde los 22 m del centro con pinos, más la niebla cálida; nunca hay "fin del mundo" visible desde la cámara de juego.
- **Grilla:** el núcleo sigue en celdas de 1 m (colisión, "celda actual", interactuables), pero el terreno es una **malla de alturas continua**: caminos y río se dibujan por curvas (catmull-rom) y el terreno se aplana bajo los caminos y se hunde bajo el agua.
- **Densidad de detalle:** cada 6 a 10 m hay algo que mirar (pozo, buzón, piedras del camino, matas de flores, carro con fardos, cerco). Los caminos tienen 2.6 m libres a cada lado. Los objetos interactivos reciben un brillo suave del color de la rama (GDD §5.3), nunca un contorno que titila.
- **Escala de un recorrido:** a 4 m/s (6.2 trotando) se cruza la zona en ~20 s; con el zoom medio se ven ~28 m de ancho.

## 3. Personajes

- **Proporciones:** **chibi de 2.5 a 3 cabezas**: cabeza grande y redonda (radio 0.42 m), torso de cápsula, piernas y brazos cortos de cápsula, manos de bolita. Se leen desde la cámara alta sin perder la cara en el plano de charla.
- **Cara:** ojos grandes ovalados con brillo blanco, mejillas rosadas, sin boca dibujada en reposo (la boca aparece al hablar como una forma simple). Pelo como casquete que cubre la nuca. **El sombrero no proyecta sombra sobre la cara** (legibilidad antes que realismo).
- **Animación:** esqueleto humanoide simple (compatible con los packs CC0 de KayKit y Quaternius). Set mínimo: idle con respiración y balanceo de cabeza, caminar con rebote, trotar, hablar (gestos), saludar, asentir, negar, pensar, sorprenderse, sentarse, cargar, dar algo. El rebote al caminar es parte del encanto "juguete".
- **Lectura de NPCs:** silueta por sombrero o peinado (paja de Tomás, gorra del jugador, pañuelo, rodete) y un color de remera propio por zona tomado de `casa-1..6`. El NPC con pedido lleva una **burbuja ámbar con tres puntos blancos** que flota y mira siempre a la cámara. El NPC gira la cabeza y el cuerpo hacia el jugador cuando se acerca a menos de 6 m (en el mockup ya lo hace).
- **Lumi:** bicho de luz emisivo con halo aditivo que acompaña al jugador al costado (nunca delante de la cara), el objeto más brillante de la escena.

## 4. Cámara

- **Tipo:** perspectiva con **lente largo**: **FOV vertical 30°** (40.5° en pantallas verticales), **inclinación 50°, giro 45°**. Es el preset `topdownOrtho` de hoy convertido en perspectiva: mantiene "desde arriba, que acompaña sola, sin órbita" (D-053) y gana la profundidad de maqueta.
- **Zoom:** 3 pasos de distancia **22 / 30 / 40 m** (rueda o `+` `-`, atados por `KeyboardEvent.key`, lección F2). El medio muestra ~28 m de ancho en 16:9.
- **Seguimiento:** el objetivo es el jugador a 0.8 m de altura, con suavizado exponencial a tasa 5/s. Sin órbita libre. Con "reducir movimiento", `cutFollow` (ya existe).
- **Conversación (plano de a dos, 3/4):** el jugador se acomoda solo a **2.6 m del NPC**; la cámara baja a **20° de inclinación, 12.5 m de distancia**, y gira hasta quedar **perpendicular a la línea jugador-NPC, corrida ~27° hacia la cara del NPC**. Elige el lado con **menos obstáculos** (un test de oclusión contra árboles, casa y huerta) y baja la mira 0.9 m para que los dos queden en el tercio de arriba, encima del panel. Resultado: NPC de frente en 3/4, jugador de espaldas en 3/4, sin nada tapándolos. Transición suave a tasa 3/s; corte con "reducir movimiento".
- **Retrato aparte:** no hace falta; la cara del NPC se lee en el plano de charla. Para el modo "solo diálogo" (D-030) se renderiza un retrato del mismo modelo 3D.

## 5. Luz

- **Hora de referencia:** media mañana cálida (la del amanecer de Kestrel Valley ya avanzado).
- **Sol:** `DirectionalLight` color `#FFF1D6`, **intensidad 2.3**, elevación **48°**, azimut **-30°**. Sombras **PCF suaves**, mapa de **1024 px (medio) / 2048 (alto)**, radio 3, en una caja de 44 × 44 m que sigue al objetivo de cámara; `bias -0.0004`, `normalBias 0.03`.
- **Cielo:** `HemisphereLight` cielo `#D6ECF2`, suelo `#6E8B4A`, intensidad 1.15. Con la cámara a 50° el cielo casi no se ve; el fondo es la bruma.
- **Bandas toon:** rampa de 4 pasos en luminancia **150 / 195 / 232 / 255** (sombra clara, nunca negra). Así las sombras son de color, no grises.
- **Niebla:** lineal color `#F3E7CF` (bruma cálida), de **34 a 78 m**. Envuelve los bordes y le da aire de diorama.
- **Tono:** ACES Filmic, exposición **1.05**, salida sRGB. El agua usa su propio shader con niebla y tono incluidos.
- **Postprocesado por tier:** bajo, nada; medio, bloom solo en emisivos (Lumi, ventanas) con umbral 0.85 a media resolución; alto, bloom + **tilt-shift** (desenfoque arriba y abajo, 22 % de la pantalla, que remata el efecto maqueta) + viñeta suave. El mockup imita el tilt-shift con un `backdrop-filter` de CSS en el tier alto; en el juego se usa `TiltShift2` de `@react-three/postprocessing`, que ya está en `world/post/Post.tsx`.
- **Atardecer y noche (GDD):** presets por hora (D-051): atardecer con sol `#FFB27A` a 15°, bruma `#F2C8A0`; noche con hemisférica azul `#2B3550`, ventanas y caminitos de bichos de luz emisivos. La **saturación del Cruce** por progreso (GDD §5.4) es un parámetro del color por vértice (se desatura la zona hasta un 30 % y vuelve al fundar).

## 6. Paleta

Parte de la paleta del GDD §5.4 (se respetan `agua`, `cielo-dia`, `casa-1..6`, `luz-bicho` y las ramas) y la lleva a un registro más soleado.

| Token | Hex | Uso |
|---|---|---|
| `pasto` | `#93C25B` | Pasto base |
| `pasto-luz` | `#B9D86E` | Manchas al sol, lomas |
| `pasto-sombra` | `#5E9450` | Variación oscura |
| `camino` | `#E3C58E` | Caminos |
| `tierra-borde` | `#B98F5A` | Borde del camino |
| `orilla` | `#D9C38C` | Arena del río |
| `copa-luz` / `copa` / `copa-sombra` | `#A9D35F` / `#6FAE4A` / `#3F7A45` | Árboles de hoja (degradé por vértice) |
| `pino` | `#3C7354` | Coníferas |
| `tronco` | `#8A5A3B` | Troncos |
| `agua` / `agua-honda` / `brillo` | `#5FB8C9` / `#3A8FA8` / `#E6F7F4` | Río (el `agua` del GDD, apenas más vivo) |
| `cielo` | `#BFE3EC` | Cielo de día (GDD `cielo-dia`) |
| `bruma` | `#F3E7CF` | Niebla y fondo |
| `muro` | `#F4EDE2` | Paredes claras (GDD `casa-6`) |
| `casa-1..5` | `#E9806E` `#F2CF6B` `#9ED8B8` `#9CC7E8` `#B9A6DB` | Fachadas y ropa (GDD) |
| `techo` | `#C9624B` | Techos (con cumbrera `#A84E3B`) |
| `madera` | `#9A6B43` | Cercos, puente, carro |
| `maíz` / `hoja-maíz` | `#D9B65A` / `#8DBE57` | Huerta |
| `ventana` | `#FFD58A` | Ventanas (emisivo en la noche) |
| `papel` | `#FBF6EC` | Fondo del HUD (GDD) |
| `tinta` / `tinta-suave` | `#2A2A33` / `#5B5664` | Texto del HUD |
| `ámbar` / `ámbar-osc` | `#F2A93B` / `#B86E12` | Medidor, chip del nombre, bordes |
| `luz-bicho` | `#FFD27A` | Lumi y caminitos de la red |
| Ramas de pociones | `#F2A93B` `#5FBF6A` `#4A86D9` `#9B6BD3` `#EE6F5B` `#5FC8D9` | Sin cambios (GDD §2.19) |

**Contraste (WCAG, medido):** `tinta` sobre `papel` 13.20:1 (AAA, cumple el objetivo AAA del GDD para el diálogo); `tinta-suave` sobre `papel` 6.59:1 (AA); `#2A1A05` sobre `ámbar` (chip del nombre) 8.42:1 (AAA); botón primario `papel` sobre `tinta` 13.20:1. El `ámbar` lleno sobre `papel` da 1.85:1 y el borde `ámbar-osc` 3.69:1: por eso cada segmento logrado lleva **borde oscuro, etiqueta en negrita y el segmento actual con rayado** (forma), no solo color.
**Daltonismo:** pasto, camino y agua se separan por valor y por textura (pincel en el pasto, liso con brillos en el agua); los interactivos llevan burbuja (forma) además del brillo de rama.

## 7. Técnica de render

- **Material único para el mundo:** `MeshToonMaterial` con `vertexColors`, `gradientMap` de 4 px (las 4 bandas, filtro `nearest`) y `map` = **textura de pincelada de 256 px en escala de grises** (manchas elípticas de 205 a 255) repetida 10 veces sobre el terreno. Todo el mundo comparte 1 o 2 materiales, lo que ayuda al presupuesto de draw calls.
- **Color por vértice "pintado":** cada geometría recibe un degradé vertical (más clara arriba, hasta 15 a 35 % más oscura abajo) y un temblor de pincel de ±0.07 en luminancia por posición. Así los assets CC0 de distintos autores se **unifican**: se descarta su textura o atlas y se repintan con la paleta de la zona por código (en build, en `scripts/assets/optimize.ts`).
- **Formas redondas:** casas con caja biselada (radio 0.28 m), techos por extrusión con bisel y cumbrera de cápsula, copas de 4 a 6 esferas fusionadas, piedras achatadas. **Regla de la biblia: ningún volumen visible con aristas de 90° sin bisel.**
- **Terreno:** malla de alturas de 96 × 96 m con 150 × 150 segmentos y color por vértice (pasto, sol, caminos con borde ruidoso, orillas). Agua: plano con shader propio de bandas y brillos que corren.
- **Instancias:** árboles, pinos, arbustos, flores, cultivos y piedras como `InstancedMesh` (una llamada por tipo).
- **Contornos:** ninguno en v1 (cuestan una pasada más). Si el operador los quiere, un contorno por normales invertidas solo en personajes es barato.
- **Resolución:** `devicePixelRatio` con techo 0.75 / 1.25 / 2 por tier. El look toon aguanta muy bien la resolución baja.

## 8. UI y HUD

- **Lenguaje visual:** "papel y tinta" del GDD §5.6, ya existente, con tarjetas de borde redondeado de 14 px, borde `#E6DCC8` y sombra cálida. Tipografía sans redondeada (`ui-rounded`, `Segoe UI Rounded`, `Nunito`, `Segoe UI`), grande y legible.
- **Arriba a la izquierda:** objetivo en una línea con punto ámbar, y debajo el **medidor "Conocer a Tomás"**: tarjeta con el título, "2 de 5" y **cinco segmentos** con su etiqueta (Saludar, Tu nombre, Su campo, Preguntar, Despedirte). Logrado: ámbar con borde oscuro y etiqueta en negrita. Actual: rayado ámbar. Sin números de XP.
- **Aviso de interacción:** tarjeta abajo al centro, `E` Hablar con Tomás.
- **Diálogo:** tarjeta de papel abajo al centro (hasta 760 px de ancho): chip ámbar con el nombre, la línea del NPC en 22 px con la palabra nueva subrayada con puntos (pasar el puntero o tocar = traducción y "Marcar"), la glosa, el indicador de voz (punto gris "Tomás habla", punto verde que late "Tu turno · podés decir: ...") y la barra de andamiaje: `Repetir` · `Más despacio` · `Pista` · `Escribir` · `Terminé` (botón oscuro con `Espacio`, a la derecha). Es la misma estructura de `ui/dialogue/DialogueHud.tsx`, con tokens nuevos.
- **Abajo a la izquierda:** ayuda de controles (desaparece en la charla). **Abajo a la derecha:** calidad y fps (solo para la prueba).
- **Pantallas angostas:** el medidor baja, se ocultan la ayuda, el chip de calidad y la etiqueta de propuesta. Verificado a 390 px.

## 9. Controles

- **PC (principal):** **clic en el suelo para caminar** o WASD/flechas relativos a la pantalla (W = hacia arriba de la pantalla, que con la cámara fija siempre es la misma dirección del mundo). `E` o clic en el NPC para hablar, `Espacio`/`Enter` Terminé, `Esc` salir, rueda o `+` `-` zoom, `Shift` trotar.
- **Gamepad:** stick izquierdo mover (ejes de pantalla), `A` hablar y Terminé, `B` salir, `Y` repetir, `X` pista, gatillos zoom, cruceta para el HUD.
- **Móvil (después):** tocar para caminar y tocar al NPC (como A); joystick virtual opcional para quien lo prefiera (como B). Pellizcar para zoom.

## 10. Rendimiento en PCs modestas

| Tier | Pixel ratio máx. | Sombras | Post | Costo esperado |
|---|---|---|---|---|
| `bajo` | 0.75 | ninguna (sombra blob siempre) | ninguno | ~40 a 60 draw calls, ~60k triángulos visibles |
| `medio` | 1.25 | PCF suave 1024 | bloom en emisivos (media resolución) | ~60 a 90 draw calls |
| `alto` | 2 | PCF suave 2048 | bloom + tilt-shift + viñeta | ~90 a 110 draw calls |

- **Por qué es liviano:** la cámara alta limita lo que se ve (no hay horizonte), el material toon es más barato que el PBR, todo comparte 1 o 2 materiales y la vegetación va instanciada. Entra en el presupuesto del GDD §5.7 (< 50k triángulos visibles y < 150 draw calls en medio) con margen, y no pide texturas grandes: la única textura del mundo es la pincelada de 256 px.
- **Descarga:** los modelos son livianos (color por vértice, sin texturas); una zona debería quedar por debajo de 4 a 6 MB comprimida con Draco o Meshopt, la mejor de las tres propuestas.
- **Medición en el mockup:** chequeo sin navegador limpio en los tres tiers; el mockup carga 300+ instancias, sombras y el shader de agua sin texturas externas.

## 11. Assets: de dónde salen, licencia y costo

| Pieza | Fuente propuesta | Licencia | Costo | Notas |
|---|---|---|---|---|
| Personajes chibi con esqueleto | **KayKit** (Kay Lousberg: personajes redondeados de cabeza grande) | CC0 | 0 USD (hay extras pagos opcionales) | **[verificar]** cuál pack de personajes trae ropa de campo; se recolorean a la paleta |
| Animaciones | KayKit (animaciones de sus personajes), **Quaternius Universal Animation Library**, Mixamo | CC0 / licencia Mixamo | 0 USD | Retargeting al esqueleto elegido |
| Naturaleza redondeada | **Quaternius Stylized Nature MegaKit**, Kenney Nature Kit | CC0 | 0 USD | Se usan las formas; el color se repinta por vértice |
| Casas, cercos, pozo, carro | Quaternius Medieval Village MegaKit, Kenney (Survival Kit, Fantasy Town Kit), KayKit | CC0 | 0 USD | Lo que tenga aristas duras se bisela o se rehace por código |
| Animales (caballo, vaca, gallina, cabra Clover) | Quaternius (packs de animales) | CC0 | 0 USD | **[verificar]** contenido exacto |
| Props simples por código | primitivas biseladas (el mockup entero está hecho así) | propia | 0 USD | Pozo, buzón, fardos, piedras, puente, cercos |
| Pincelada, rampa toon, agua, Lumi | código propio (incluidos en el mockup) | propia | 0 USD | |

**Costo total esperado:** 0 USD con CC0. **Lo que sí o sí es propio:** el repintado a la paleta (script), la variación de ropa y accesorios del elenco, el layout de cada zona, el agua, Lumi y los biselados. Todo entra en `content/assets-registry.yaml` como pide el GDD §5.7.

## 12. Cómo encaja en el stack R3F y qué se reutiliza

Es la propuesta que **más código actual conserva**.

- **Se queda igual:** Vite + React + TS + R3F + drei, el núcleo puro (grilla, movimiento, clic para caminar, interactuables, máquina de escena), el store, el HUD DOM (se cambian tokens, no componentes), las costuras R10 a R15 y el lint de capas.
- **Se reutiliza con cambios chicos:**
  - `world/camera/rig.ts`: `cameraOffset(pitch, yaw, distance)` es exactamente la fórmula del mockup; `followAlpha` y `cutFollow` se usan igual. Se agrega el preset perspectiva de lente largo (el `perspective3D` ya declarado en `presets.ts`) y se retiran `zoomPixelScales`/`snapToPixelGrid` (eran para pixel art). `dialogueFrame` ya existe: le suma el test de oclusión y el giro de 3/4.
  - `world/post/Post.tsx`: `Bloom`, `TiltShift2` y `Vignette` por tier quedan como están (el tier alto del mockup los imita).
  - `world/lighting/Lighting.tsx`: hemisférica + direccional como hoy, con los valores de §5 y sombras.
  - `world/dioramas/Diorama.tsx`: layout como datos; se agregan curvas de camino y río y alturas.
  - `world/actors/`: `Player.tsx` y el futuro `Npc.tsx` pasan de sprite a modelo con esqueleto.
- **Se reemplaza:** `world/tiles/` (chunks de tiles pixel) por una malla de terreno con color por vértice; `world/sprites/` queda solo para halos y burbujas; `world/props/Boxes.tsx` por props glTF repintados; `world/art/pixels.ts` se va.
- **Decisiones que cambian:** D-139 (HD-2D) y D-154 (32 px por tile) se reemplazan; D-053 (cámara por presets desde arriba, sin órbita) **se mantiene**; D-153 (packs pixel) se reescribe como "packs 3D CC0 repintados a la paleta".
- **Para otros destinos (`07`):** VR natural en `xrTabletop` (una maqueta 3D sobre la mesa es literalmente este estilo); móvil viable por lo liviano; desktop igual que web.

## 13. Riesgos

1. **Que se lea "low-poly genérico" (medio):** el low-poly CC0 sin cuidado se ve barato. *Mitigación:* la biblia obliga el repintado por vértice, la pincelada, las bandas cálidas y el bisel; un asset que no pasa por el script de repintado no entra.
2. **Personajes chibi de packs (medio):** KayKit y Quaternius no traen 14 aldeanos de campo listos. *Mitigación:* 2 o 3 cuerpos base + sombreros, peinados y ropa por color (como pedía D-153), o modelos de cápsulas por código como en el mockup, que ya se leen bien.
3. **Encuadre de charla en lugares apretados (bajo a medio):** el test de oclusión del mockup elige entre 6 ángulos; en una plaza llena puede no haber ángulo limpio. *Mitigación:* atenuar (dither) los objetos que tapen la línea cámara-personajes en la charla.
4. **Tilt-shift en integradas (bajo):** solo en alto.
5. **Distancia con lo decidido (bajo):** reemplaza el look, no la arquitectura.

## 14. Esfuerzo estimado

| Tramo | Días de agente | Qué incluye |
|---|---|---|
| Preset de cámara de lente largo + charla 3/4 con oclusión | 2 | Sobre `rig.ts` existente |
| Terreno por alturas con color por vértice, caminos y río por curvas, agua | 4 | Base: el código del mockup |
| Material toon + pincelada + script de repintado de glTF a la paleta | 3 | En `world/materials` y `scripts/assets` |
| Personajes con esqueleto (2 cuerpos base, 3 NPCs), animaciones | 5 | Recolor, accesorios |
| Primera zona completa (props, vegetación instanciada, animales) | 5 a 7 | |
| Restyle del HUD (tokens de papel y tinta, medidor de segmentos) | 1 a 2 | Los componentes ya existen |
| **Total hasta una zona jugable** | **~20 a 23** | La más corta de las tres |

## 15. Perillas (para acercarla a A o a B sin cambiar de propuesta)

| Perilla | Hacia A (más pintado) | Default | Hacia B (más móvil) |
|---|---|---|---|
| Inclinación de cámara | 60° | **50°** | 40° (se empieza a ver horizonte) |
| FOV | 22° (casi isométrico) | **30°** | 40° |
| Pincelada | repeat 6, más contraste | **repeat 10, suave** | apagada (color liso) |
| Bandas toon | 3 bandas marcadas | **4 bandas suaves** | rampa continua (Lambert) |
| Saturación de paleta | −10 % y más ocre | **paleta de la tabla** | +10 % y verdes más fríos |
| Contorno | contorno pintado en personajes | **sin contorno** | sin contorno |
| HUD | pergamino y madera (de A) | **papel y tinta** | botones redondos (de B) |

**Veredicto de la propuesta:** la que mejor junta el hilo común de las referencias (colorido, soleado, frondoso, cálido, redondo, legible) con los pilares del GDD (cámara que acompaña sola desde arriba, sin habilidad de videojuego), la que más código conserva, la más barata de abastecer y la más liviana en descarga.
