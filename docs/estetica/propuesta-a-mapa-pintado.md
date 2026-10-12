# Propuesta A: Mapa pintado

**Proyecto:** learning-game (*Mundo Rush*, modo 1 *Kestrel Valley*) · **Fecha:** 2026-10-12 · **Autor:** construcción (el entorno de desarrollo), corrida nocturna sin operador
**Estado:** propuesta para elegir. Si el operador la elige, este documento pasa a ser la biblia de arte del juego y reemplaza la dirección HD-2D (D-139) y la densidad de píxel (D-154).
**Mockup:** [`propuesta-a-mapa-pintado.html`](propuesta-a-mapa-pintado.html) (abrilo con doble clic; `#charla` al final de la URL abre directo la conversación). Comparación con las otras: [`index.html`](index.html).

> **En una frase:** el valle como un mapa de aventura pintado a mano, visto en isométrico desde arriba, con la riqueza de *Heroes of Might and Magic IV* y el tono amable de un libro ilustrado: ríos que serpentean, puentes de madera, cabañas con techo de paja, molinos, bosques tupidos y caminos que se leen solos.

---

## 1. Concepto y palabras de ánimo

- **Qué es:** un mundo 2D pintado (pinceladas visibles, luz horneada, sombras pintadas) proyectado en isométrico 2:1. El suelo es una gran pintura por zona; casas, árboles, molino y personajes son sprites pintados que se ordenan por profundidad. Se lee como una maqueta de cuento, no como un videojuego de bloques.
- **Palabras de ánimo:** pintado, cálido, frondoso, de cuento, artesanal, sereno, legible.
- **Qué toma de cada referencia:**
  - *Heroes IV* (referencia principal): la vista de mapa isométrica, la densidad pintada del bosque, el río ancho con orillas de arena, los puentes de tablas, los caminos claros que se distinguen del pasto, la paleta rica de verdes, el minimapa.
  - Juegos móviles (referencias 2 a 4): el sol, el color saturado y el aire "vacaciones en el campo"; de ahí sale que la paleta sea más luminosa y menos ocre que la de *Heroes IV*.
- **Qué no toma:** la oscuridad y el tono épico de *Heroes IV*, los marcos de interfaz recargados, el combate. Los marcos de madera y pergamino se quedan, pero livianos.

## 2. Mundo: estructura y escala

- **Unidad:** 1 tile = 1 m. En pantalla, un tile mide 64 × 32 px a zoom 1 (isométrico 2:1); 1 m de altura = 34 px.
- **Zonas:** cada zona del GDD (Los Campos, El Cruce, la huerta, el canal) es un **diorama pintado** de 40 × 40 tiles como máximo (el mockup es una zona de 40 × 40). Un borde de bosque lejano horneado de 8 tiles rodea cada zona: es el límite amable (se ve, no se camina).
- **Capas por zona:**
  1. **Suelo pintado** (una o más texturas grandes): pasto, caminos, orillas, agua base, surcos, cercos bajos, flores, fardos, el puente. Todo lo que el jugador nunca tapa ni lo tapa.
  2. **Sprites ordenados por profundidad** (x + z del pie): árboles cercanos, casas, molino, carros, personajes, animales. Cada uno con su punto de apoyo pintado.
  3. **Animación barata encima:** brillos del río, humo de chimeneas, aspas del molino, sombras de nubes, Lumi.
- **Densidad de detalle:** el bosque es tupido en los bordes y abierto en el centro; los caminos siempre tienen 2.4 m sin árboles a cada lado para que se lean desde lejos. Los objetos interactivos llevan un anillo dorado pintado en el suelo, no un contorno.
- **Escala de un recorrido:** a zoom 1 se ven ~20 × 22 tiles. Cruzar una zona caminando lleva ~15 s, en línea con "un pueblo chico que se recorre en minutos" (GDD §5.2).

## 3. Personajes

- **Proporciones:** de cuento, ~3 cabezas de alto. Cabeza grande y redonda, cuerpo de óvalo, manos de bolita, pies chiquitos. Altura en pantalla: **~56 px a zoom 1** (casi 2 tiles), ~100 px en el encuadre de charla.
- **Estilo:** pintado como el resto (relleno con degradé de luz desde arriba a la izquierda, borde oscuro suave de 1.2 px al 55 %, mejillas rosadas). Nada de contorno negro duro.
- **Direcciones:** 8 direcciones (o 5 pintadas + 3 espejadas: S, SE, E, NE, N y espejo de SE, E, NE). Con 4 direcciones el isométrico se ve robótico al caminar en diagonal, que es lo más común.
- **Set de animación mínimo por personaje:** idle (respirar, 4 cuadros), caminar (8 cuadros), hablar (gesto de manos, 4 cuadros), saludar (6 cuadros), asentir y negar (4 cuadros), "pensar" (mano al mentón, loop de 2). Opcional por rol: cargar fardo, regar, martillar.
- **Lectura de NPCs:** cada NPC tiene una **silueta propia** (sombrero de paja de Tomás, delantal, boina, gorra) y un color de ropa que no repite otro vecino de la misma zona. El NPC con pedido lleva un **globo de pergamino con tres puntos dorados** encima y un anillo dorado que late en el suelo. El jugador lleva boina azul y bufanda amarilla, que nadie más usa.
- **Retratos:** cada NPC tiene un **retrato pintado de busto** (240 × 240) para el panel de diálogo. Es la pieza más expresiva: lleva 3 o 4 variantes de gesto (contento, pensando, sorprendido, tranquilo).

## 4. Cámara

- **Tipo:** ortográfica fija, isométrica 2:1. En R3F equivale a una `OrthographicCamera` con **yaw 45° y elevación 30°** (la elevación que da el 2:1 exacto). Sin rotación: el arte está pintado para un solo ángulo.
- **Zoom:** 3 pasos, **0.75 / 1 / 1.35**, con rueda o `+` `-` (el `+` y el `-` se atan por `KeyboardEvent.key`, lección F2 del proyecto). El paso medio muestra ~20 tiles de ancho en 1280 px.
- **Seguimiento:** centrada en el jugador con suavizado exponencial (tasa 5 por segundo: `1 - e^(-5·dt)`). Con "reducir movimiento", corte en vez de paneo (la función `cutFollow` actual sirve tal cual).
- **Conversación:** la cámara se acerca a **zoom 1.8** y se centra en el punto medio entre el jugador y el NPC, corrida 1.1 m hacia abajo de la pantalla para que los dos queden en el tercio de arriba, encima del panel. El jugador mira al NPC (se lo ve de espaldas o de perfil), el NPC mira a la cámara. La cara grande vive en el **retrato** del panel, no en el mapa.
- **Minimapa:** arriba a la derecha, la misma pintura reducida, con el jugador (blanco), los NPCs con pedido (dorado) y el rectángulo de vista. Es identidad *Heroes IV* y además ayuda a orientarse.

## 5. Luz

La luz está **pintada**, no calculada: es lo que da el look y lo que lo hace barato.

- **Hora del día de referencia:** media mañana dorada. La luz viene de **arriba a la izquierda** de la pantalla y las sombras se pintan hacia **abajo a la derecha**, alargadas a ~1.4 veces el ancho del objeto.
- **Sombras:** elipses pintadas con multiplicación (`rgba(25,40,15,0.28)`) para árboles, y sombra de contacto bajo casas. Personajes: elipse `rgba(25,40,15,0.32)` de 24 × 10 px corrida 4 px a la derecha.
- **Ambiente vivo (código):** sombras de nubes que pasan (elipses de 440 × 180 px a `rgba(20,35,30,0.10)`, velocidad 0.5 tiles/s), brillos del agua que corren con el río (70 trazos a la vez), humo de chimenea, aspas a 0.9 rad/s.
- **Viñeta:** cálida, `radial-gradient(transparent 55 %, rgba(60,40,15,0.38))`. Sin niebla: el bosque lejano oscuro hace de borde.
- **Atardecer y noche (para el GDD):** se resuelven con **variantes de paleta** sobre la misma pintura (una capa de color multiplicada: ámbar `#F2B28C` al 25 % para el atardecer, azul `#2B3550` al 55 % para la noche) más las ventanas encendidas y los caminitos de bichos de luz como sprites aditivos. No hace falta repintar todo.
- **Postprocesado:** ninguno obligatorio. En el tier alto, un bloom suave solo sobre Lumi y las ventanas.

## 6. Paleta

| Token | Hex | Uso |
|---|---|---|
| `pasto-claro` | `#8DB046` | Pasto al sol, claros del bosque |
| `pasto` | `#5E8C31` | Pasto base |
| `pasto-sombra` | `#3E6B2A` | Pasto bajo árboles, matas |
| `camino` | `#C9A46A` | Caminos de tierra |
| `camino-borde` | `#9C7A45` | Borde y huellas del camino |
| `roca` | `#A39A8A` | Piedras |
| `copa-luz` | `#9CC452` | Lado iluminado de las copas |
| `copa` | `#4F8A2E` | Copa base |
| `copa-sombra` | `#2C5524` | Interior y lado en sombra |
| `pino` / `pino-luz` | `#2F5A3A` / `#4E7F4A` | Coníferas |
| `tronco` | `#6A4428` | Troncos |
| `agua-honda` | `#2F6E8E` | Centro del río |
| `agua` | `#4C9DB8` | Agua base |
| `agua-brillo` | `#BFE6EE` | Reflejos y espuma |
| `orilla` | `#D8C48E` | Arena de las orillas |
| `bosque-lejano` | `#2A4A26` | Borde horneado de la zona |
| `muro` | `#E9DDBF` | Paredes encaladas |
| `paja` | `#C89B4E` | Techos de paja, fardos |
| `teja-roja` | `#B5523B` | Techos de teja, cintas |
| `madera` | `#7A5232` | Vigas, cercos, puente |
| `trigo` | `#D9B65A` | Cultivos maduros |
| `pergamino` | `#F3E6C4` | Fondo del HUD |
| `tinta` | `#3A2A1A` | Texto del HUD |
| `tinta-suave` | `#6B5338` | Texto secundario |
| `marco-madera` / `madera-osc` | `#6B4426` / `#4A2E18` | Marcos y botones |
| `oro` | `#D9A441` | Acentos, gemas del medidor, botón primario |
| `luz-bicho` | `#FFD27A` | Lumi y caminitos de bichos de luz |
| Ramas de pociones | `#F2A93B` `#5FBF6A` `#4A86D9` `#9B6BD3` `#EE6F5B` `#5FC8D9` | Se mantienen las del GDD §5.4 |

**Contraste (WCAG, medido):** `tinta` sobre `pergamino` 11.09:1 (AAA); `tinta-suave` sobre `pergamino` 5.80:1 (AA); texto crema `#FCEFD0` sobre botón `madera` 7.42:1 (AAA); `madera-osc` sobre `oro` (botón primario) 5.51:1 (AA). El `oro` sobre `pergamino` da 1.81:1: por eso las gemas llenas **nunca** son la única señal (llevan brillo, borde y la etiqueta en negrita) y no se usa oro para texto.
**Daltonismo:** el mapa depende de verdes; caminos, agua y cultivos se separan por **valor** (claro/oscuro) además de tono, y los interactivos llevan anillo y globo (forma), no solo color.

## 7. Técnica de render

- **Suelo:** textura pintada por zona. En producción: **chunks de 1024 × 1024 px** (o 2048 en el tier alto) a una densidad de **~32 px por metro** de suelo proyectado (equivale a la pintura del mockup a zoom 1). Se dibujan como planos con `MeshBasicMaterial` (sin luz) bajo una cámara ortográfica.
- **Sprites:** PNG con alfa, pintados al doble de tamaño y mostrados a la mitad (bordes suaves sin aliasing). Filtrado **lineal con mipmaps** (no `nearest`: esto ya no es pixel art). Un atlas por zona de ≤ 2048 px para árboles, props y casas; un atlas por personaje con sus 8 direcciones.
- **Orden de dibujo:** por la profundidad del pie (x + z), con `renderOrder` o, en R3F, con `depthWrite` apagado y orden explícito por grupo. Planos verticales con `alphaTest 0.5` para la silueta y `transparent` solo en bordes suaves y humo.
- **Agua:** la pintura base más un shader barato que desplaza UV de una textura de brillos sobre la máscara del río, o sprites de brillo animados como en el mockup.
- **Contornos:** ninguno como efecto; el borde suave está pintado en el sprite.
- **Escala de resolución:** el canvas usa `devicePixelRatio` con techo por tier (1 / 1.25 / 2). El arte aguanta bien el escalado hacia abajo porque es pintado.
- **Cómo se fabrica el arte (recomendado):** **pre-render desde 3D**, como lo hacía *Heroes IV*: modelos 3D (CC0 o propios) renderizados en Blender con un material pintado (rampa de color + textura de pincel + borde suave), desde el ángulo exacto de la cámara, y retocados a mano. Así salen las 8 direcciones de los personajes sin dibujarlas una por una.

## 8. UI y HUD

- **Lenguaje visual:** pergamino y madera, livianos. Panel con fondo `pergamino`, borde de 3 px `marco-madera`, sombra inferior de madera. Títulos en serif clásica (`Palatino Linotype`, `Book Antiqua`, Georgia); texto de lectura en sans humanista (`Segoe UI`, Trebuchet) por legibilidad y para respetar la opción de fuente para dislexia del GDD.
- **Medidor de conversación ("Conocer a Tomás"):** cinta con **cinco gemas** unidas por una vara de madera; cada gema es un criterio (Saludar, Tu nombre, Su campo, Preguntar, Despedirte). La gema actual late en dorado; las logradas se llenan de oro con brillo. Arriba a la izquierda, debajo del objetivo. Sin números de XP (GDD §5.6); solo "2 de 5".
- **Diálogo:** panel de pergamino abajo, con el **retrato pintado** del NPC en un marco circular dorado a la izquierda, chapa de madera con el nombre, la línea del NPC en serif grande (22 px) con la palabra nueva subrayada con puntos (pasar el puntero o tocar = traducción), la glosa debajo, el indicador de voz (forma y color: punto gris "Tomás habla", punto verde que late "Tu turno") y la barra de andamiaje como fichas de madera: `Repetir` · `Más despacio` · `Pista` · `Escribir` · `Terminé` (dorado, a la derecha).
- **Objetivo:** pergamino arriba a la izquierda, una línea.
- **Aviso de interacción:** etiqueta de pergamino abajo al centro: `E` Hablar con Tomás.
- **Minimapa:** arriba a la derecha (se oculta en la charla y en pantallas chicas).
- **En pantallas angostas (≤ 720 px):** el retrato se achica a 64 px y sube, desaparecen minimapa, ayuda de controles y chip de calidad. Verificado a 390 px de ancho.

## 9. Controles

- **PC (principal):** **clic en el suelo para caminar** (la forma natural de un mapa isométrico) y también WASD/flechas en ejes de pantalla (W = arriba de la pantalla). `E` o clic sobre el NPC para hablar, `Espacio`/`Enter` = Terminé, `Esc` = salir de la charla, rueda o `+` `-` = zoom, `Shift` = trotar.
- **Gamepad:** stick izquierdo mueve en ejes de pantalla; `A` hablar y Terminé; `B` salir; `Y` repetir; `X` pista; gatillos zoom; cruceta navega los botones del HUD.
- **Móvil (después):** tocar el suelo para caminar, tocar al NPC para hablar, pellizcar para zoom. No necesita joystick: es la propuesta más cómoda para táctil.

## 10. Rendimiento en PCs modestas

| Tier | Suelo | Pixel ratio máx. | Extras | Costo esperado |
|---|---|---|---|---|
| `bajo` | textura a 0.6× | 1 | sin sombras de nubes, sin brillos del agua | ~10 draw calls, < 120 MB de VRAM por zona |
| `medio` | 1× | 1.25 | sombras de nubes, brillos, humo | ~15 draw calls |
| `alto` | 1.4× | 2 | + partículas (polen, hojas), bloom en emisivos | ~20 draw calls |

- **Lo bueno:** es la propuesta más liviana en GPU. No hay luces ni sombras calculadas; cada frame es componer planos texturados. Corre en integradas viejas.
- **Lo que pesa:** **memoria y descarga**. Una zona pintada a 1× ocupa ~3000 × 2000 px de suelo (~24 MB en VRAM sin comprimir) más atlas de sprites. Hay que comprimir con **KTX2/Basis** (en three.js, `KTX2Loader`) para bajar 4 a 6 veces la VRAM y la descarga. Presupuesto propuesto: **< 12 MB de descarga por zona** y < 15 MB para el arranque (GDD §5.7).
- **Medición en el mockup:** el canvas 2D del mockup pinta el suelo una vez (~0.5 s al cargar) y después solo compone; en el chequeo sin navegador no hubo errores en ningún tier.

## 11. Assets: de dónde salen, licencia y costo

Las IA de código no dibujan (directiva del operador, GDD §5.7), y la IA generativa de imágenes está fuera salvo decisión explícita (D-153). Con esas reglas, A es la propuesta **más difícil de abastecer**:

| Pieza | Fuente propuesta | Licencia | Costo | Notas |
|---|---|---|---|---|
| Modelos base para pre-render (casas, árboles, molino, props, personajes) | Quaternius, KayKit (Kay Lousberg), Kenney | CC0 | 0 USD | Se usan como "maqueta" para renderizar; el resultado final es arte propio |
| Render pintado y 8 direcciones | **Blender** (gratis, GPL; el arte que sale es tuyo) con script Python en modo `blender -b` | propia | 0 USD | Automatizable por agentes: un script por asset |
| Retoque y pintura del suelo | **Krita** (gratis) o pintura procedural por código como en el mockup, más retoque humano | propia | 0 USD + horas | El suelo del mockup es 100 % código: sirve de base |
| Retratos de busto (14 NPCs × 4 gestos) | Ilustrador/a 2D por encargo | cesión de derechos por contrato | **estimación gruesa USD 1.500 a 4.000** | Es lo que más cara le pone al juego; difícil de sacar por pre-render |
| Kit completo de una región por encargo (si no se hace pre-render) | Ilustrador/a de escenarios | contrato | **estimación gruesa USD 3.000 a 10.000** | Sin cotizar; orden de magnitud |
| Packs pintados de tienda | CraftPix.net, GameDev Market, itch.io | licencia comercial de cada tienda (verificar) | USD 10 a 60 por pack | **[verificar]** que haya isométrico pintado coherente con 13 o 14 aldeanos en 8 direcciones; no encontré uno que lo cubra todo |

**Lo que sí o sí es propio:** la pintura de cada zona (es única), los retratos, Lumi (emisivo por código), el agua animada y la interfaz.

## 12. Cómo encaja en el stack R3F y qué se reutiliza

- **Se queda igual:** Vite + React + TS + R3F, el núcleo puro (`packages/core`: grilla, movimiento, interactuables, máquina de escena), el store Zustand y sus selectores, todo el HUD DOM (`ui/hud/WorldHud.tsx`, `ui/dialogue/DialogueHud.tsx`), las costuras R10 a R15 y el lint de capas.
- **Se reutiliza con cambios chicos:**
  - `world/camera/` (`rig.ts`, `presets.ts`, `CameraRig.tsx`): el preset `isoOrtho` ya existe; se fija en elevación 30° (2:1) y se borran `zoomPixelScales`/`snapToPixelGrid` (eran para pixel art). `followAlpha` y `cutFollow` se usan igual. `dialogueFrame` pasa a "acercar y centrar".
  - `world/sprites/` (`Billboard.tsx`, `orientation.ts`, `sheet.ts`): la selección de cuadro por dirección pasa de 4 a 8 direcciones; el billboard deja de girar (en isométrico fijo los sprites son planos fijos mirando a la cámara).
  - `world/tiles/` (`buildTileChunk.ts`, `atlas.ts`): el suelo deja de ser tiles y pasa a chunks de textura pintada; la grilla lógica de caminata del núcleo no cambia.
  - `world/dioramas/Diorama.tsx`: el layout como datos sigue; cambian los tipos de capa (suelo pintado, sprites, animaciones).
- **Se descarta:** `world/art/pixels.ts` (placeholders pixel), `world/props/Boxes.tsx` (cajas), el material toon de volúmenes, D-154 (32 px por tile) y casi todo `world/post/` (queda bloom opcional).
- **Para otros destinos (`07-stack-objetivo.md`):** móvil es el mejor caso. VR es el peor: un mapa pintado no tiene volumen; en `xrTabletop` se vería como una lámina sobre la mesa (lindo como tablero, pero sin 3D real).

## 13. Riesgos

1. **Abastecimiento del arte (alto):** cada zona nueva es pintura nueva. Sin un pipeline de pre-render que funcione, el juego queda atado a un ilustrador. *Mitigación:* spike de 3 días con Blender en modo batch renderizando 1 casa, 1 árbol y 1 personaje en 8 direcciones antes de comprometerse.
2. **Coherencia de estilo (alto):** mezclar pre-render, pintura a mano y packs de tienda se nota mucho más en un estilo pintado que en low-poly. *Mitigación:* un solo pipeline de render con la misma rampa, el mismo pincel y la misma dirección de luz para todo.
3. **Ángulo único (medio):** el arte está pintado para una sola cámara. No hay rotación, no hay acercamientos dramáticos y el modo de construcción del modo 2 tiene que vivir en este mismo isométrico.
4. **Animación cara (medio):** 8 direcciones × 6 animaciones × 14 NPCs son ~670 secuencias. Con pre-render es automático; a mano es inviable.
5. **Memoria en máquinas de 4 GB (medio):** texturas grandes. *Mitigación:* KTX2 obligatorio y zonas de 40 × 40 como tope.
6. **Distancia con la decisión vigente (bajo):** reemplaza D-139 (HD-2D) y D-154. El operador ya rechazó el look actual, así que el costo es solo de documentos.

## 14. Esfuerzo estimado

Estimaciones en días de agente (corridas de build más verificación), sin contar el arte encargado.

| Tramo | Días | Qué incluye |
|---|---|---|
| Spike de pipeline (Blender batch, 3 assets, 8 direcciones) | 3 | Decide si A es viable sin ilustrador |
| Render de mapa en R3F (cámara 2:1, chunks pintados, sprites por profundidad, agua) | 5 | Reemplaza tiles y billboards |
| Pipeline de assets (scripts de render, atlas, KTX2, registro de licencias) | 6 | Lo que permite producir zonas |
| Primera zona completa (Los Campos) con 3 NPCs | 8 a 12 | Incluye pintura y retoque |
| Restyle del HUD (pergamino, gemas, retrato) | 2 | Tokens nuevos sobre los componentes existentes |
| **Total hasta una zona jugable** | **~24 a 28** | Más arte encargado (retratos) en paralelo |

**Veredicto de la propuesta:** la más linda y la más liviana de correr, la más cara de producir. Gana si el operador quiere un juego con identidad de libro ilustrado y acepta pagar arte o invertir en un pipeline de pre-render.
