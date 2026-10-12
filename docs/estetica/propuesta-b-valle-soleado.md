# Propuesta B: Valle soleado

**Proyecto:** learning-game (*Mundo Rush*, modo 1 *Kestrel Valley*) · **Fecha:** 2026-10-12 · **Autor:** construcción (el entorno de desarrollo), corrida nocturna sin operador
**Estado:** propuesta para elegir. Si el operador la elige, este documento pasa a ser la biblia de arte del juego y reemplaza la dirección HD-2D (D-139), la densidad de píxel (D-154) y la cámara desde arriba por presets (D-053).
**Mockup:** [`propuesta-b-valle-soleado.html`](propuesta-b-valle-soleado.html) (abrilo con doble clic; `#charla` al final de la URL abre directo la conversación). Comparación con las otras: [`index.html`](index.html).

> **En una frase:** un valle 3D brillante y abierto, con cielo azul enorme, nubes, lomas verdes y pinos, recorrido en tercera persona como en los juegos móviles de granja y caballos: estilizado-semi-realista, limpio, soleado, con la cámara detrás del personaje.

---

## 1. Concepto y palabras de ánimo

- **Qué es:** 3D estilizado con materiales PBR simples (sin texturas detalladas, color por vértice o atlas de degradés), personajes de proporción ~5 cabezas con esqueleto y animaciones, cámara de seguimiento en tercera persona y un horizonte lejano con montañas que se pierden en la bruma.
- **Palabras de ánimo:** luminoso, abierto, fresco, aventura tranquila, "día de campo", amplio.
- **Qué toma de cada referencia:**
  - *Horse Stable: Herd Care Simulator* (2): el cielo grande con nubes suaves, las lomas verdes, los pinos, los animales estilizados-semi-reales, la cámara detrás.
  - Juego de saltos a caballo (3): la luz cálida y limpia, la cámara de persecución, los botones redondos y el HUD de joystick.
  - Juego de granja móvil (4): el personaje de sombrero que carga fardos al carro, el verde tropical, el sol; joystick abajo a la izquierda, barra chica arriba a la izquierda.
  - *Heroes IV* (1): el río con puente de madera y las cabañas; lo demás no aplica a esta cámara.
- **Qué no toma:** la monetización de esos juegos (energía, temporizadores, cofres), la saturación extrema de algunos y la cámara que hay que manejar con el dedo todo el tiempo.

## 2. Mundo: estructura y escala

- **Unidad:** 1 unidad = 1 m. Personaje de ~2.1 m de alto con sombrero (escala apenas heroica), casa de 6 × 4.6 m con muros de 2.8 m, granero de 7 × 6 m.
- **Zonas:** cada zona del GDD es un **valle abierto de ~120 × 120 m caminables** dentro de un terreno de 260 × 260 m, rodeado por un anillo de lomas y montañas (17 m de alto, a 75 a 125 m del centro) que la niebla vuelve azuladas. Los bordes caminables son el río, alambrados y lomas empinadas.
- **Densidad:** el centro del pueblo es abierto (casas, corral, huerta, carro); los pinos se agrupan en las lomas a partir de los 24 m del centro y forman bosque desde los 38 m. Mechones de pasto instanciados cerca del jugador (1600 por zona) para que el suelo no se vea liso.
- **Hitos visibles desde lejos:** el granero rojo, el molino o el tanque del Cruce, el puente. En tercera persona uno se orienta por hitos, no por mapa.
- **Escala de un recorrido:** a paso normal (4.2 m/s) se cruza el pueblo en ~25 s; trotar (`Shift`) va a 7.5 m/s.

## 3. Personajes

- **Proporciones:** estilizado-semi-realista, **~5 cabezas**: cabeza un poco grande, piernas largas, manos y botas simplificadas. Siluetas limpias, sin detalle de dedos.
- **Esqueleto y animación:** humanoide estándar (compatible con retargeting de Mixamo y de la Universal Animation Library de Quaternius). Set mínimo: idle, caminar, trotar, girar en el lugar, hablar (gestos con loop), saludar, asentir, negar, pensar, sentarse, agacharse a juntar, cargar (fardo o balde), dar algo, apoyarse en el cerco. Transiciones con mezcla de 0.2 s.
- **Animales:** caballos, vacas, gallinas y la cabra Clover del GDD, con idle, pastar, caminar. En esta propuesta los animales son protagonistas visuales (como en la referencia 2).
- **Lectura de NPCs:** en tercera persona el NPC se ve a 5 o 15 m, así que la lectura es por **silueta y color**: sombrero vaquero de Tomás, camisa coral, cada NPC con un color de remera propio de la zona. El NPC con pedido lleva un **rombo naranja que gira** sobre la cabeza (visible por encima de la niebla y de la vegetación). Nombres flotantes opcionales en accesibilidad.
- **Caras:** ojos grandes oscuros, nariz chica; las expresiones se hacen con 4 a 6 *blend shapes* (sonrisa, sorpresa, pensar, parpadeo). Sin labios sincronizados finos; un "abre y cierra" de boca con la amplitud de la voz alcanza.

## 4. Cámara

- **Tipo:** perspectiva, **FOV vertical 55°**, de tercera persona detrás del jugador.
- **Distancia y altura:** 3 pasos de zoom a **6.5 / 9 / 13 m**, con inclinación de **9° + 4° por paso** (más lejos = un poco más alta). Mira a un punto **2.3 m sobre el jugador**, así el horizonte y el cielo ocupan el tercio de arriba (la gracia de esta propuesta).
- **Seguimiento:** posición y mira con suavizado exponencial (tasa 6/s). **La cámara se acomoda sola detrás del jugador** mientras camina (tasa 1.6/s); si el jugador da media vuelta, no gira de golpe. **Sin órbita libre con mouse por defecto** (pilar del GDD §1.3 y lección de *Terra Alia*); `Q` gira 45° para mirar algo puntual. La órbita con clic derecho puede existir como opción de accesibilidad apagada.
- **Colisión:** nunca entra en las lomas (se eleva por encima del terreno + 0.8 m). En producción, además, un *raycast* corto contra casas y árboles acerca la cámara si algo tapa al jugador.
- **Conversación:** **plano sobre el hombro**: cámara 4.3 m detrás del jugador, 1.7 m al costado, 2.1 m de alto, FOV 42°, mirando al punto medio entre los dos a 1.6 m. El NPC queda de frente y el jugador de espaldas a un costado. El jugador se acomoda solo a 2.4 m del NPC antes de encuadrar. Con "reducir movimiento", el cambio de plano es un corte.

## 5. Luz

- **Hora de referencia:** media mañana de verano, cielo despejado.
- **Sol:** `DirectionalLight` color `#FFF4E0`, **intensidad 3.0**, elevación **52°**, azimut puesto **a espaldas de la cámara inicial** para que los personajes se vean iluminados de frente. Sombras **PCF suaves**, mapa de **1024 px (medio) / 2048 px (alto)** en una caja de 52 × 52 m que sigue al jugador; `bias -0.0003`, `normalBias 0.04`.
- **Cielo:** `HemisphereLight` cielo `#BFE6FF`, suelo `#6FAE3E`, intensidad 1.25. Domo con degradé cenit `#3E9BFF` a horizonte `#CFEFFF` y halo del sol.
- **Nubes:** 16 racimos de esferas blancas con emisivo `#DDE8F5` al 45 % (no se oscurecen nunca), a 55 a 100 m de alto, girando muy despacio.
- **Niebla:** exponencial al cuadrado `#CFEFFF`, densidad **0.0065** (medio), 0.0055 (alto), 0.011 (bajo: corta la distancia de dibujo).
- **Tono:** ACES Filmic, exposición 1.0, salida sRGB.
- **Agua:** shader con mezcla por ángulo de vista (más clara de costado), brillos que corren y la misma niebla.
- **Postprocesado:** tier alto con bloom suave (umbral 0.9) y, si el presupuesto da, SSAO liviano. Nada en bajo y medio.
- **Atardecer y noche (GDD):** presets de luz por hora (`D-051`): atardecer con sol `#FFB27A` a 12° de elevación, cielo `#F2B28C`; noche con luna azulada y emisivos (ventanas, bichos de luz).

## 6. Paleta

| Token | Hex | Uso |
|---|---|---|
| `pasto` | `#7CCB4E` | Pasto base |
| `pasto-loma` | `#A6DC5A` | Lomas al sol |
| `pasto-sombra` | `#4E9A3A` | Hondonadas, sombra |
| `camino` | `#E6C88F` | Caminos |
| `tierra` | `#C79A63` | Borde del camino, huerta |
| `orilla` | `#E9D9A6` | Arena del río |
| `pino` / `pino-luz` | `#2E7D4F` / `#4FA36A` | Coníferas |
| `copa` / `copa-luz` | `#5DBB45` / `#9BDD5E` | Árboles de hoja |
| `tronco` | `#7A4E2D` | Troncos |
| `agua` / `agua-honda` | `#39B6E0` / `#1E86B8` | Río |
| `espuma` | `#E8FAFF` | Brillos |
| `cielo-cenit` / `cielo-horizonte` | `#3E9BFF` / `#CFEFFF` | Domo |
| `nube` / `nube-sombra` | `#FFFFFF` / `#DDE8F5` | Nubes |
| `montaña` | `#7FA8C9` | Lomas lejanas en la bruma |
| `muro` | `#FFF4E0` | Casas |
| `techo` | `#E5533D` | Techos de teja |
| `granero` | `#C8432F` | Granero |
| `madera` | `#A86B3C` | Cercos, puente, carro |
| `ui-texto` | `#1F2A44` | Texto sobre blanco |
| `ui-panel` | `rgba(18,38,68,0.62)` | Chips oscuros translúcidos |
| `ui-naranja` | `#FFB020` | Botón Hablar, medidor lleno |
| `ui-verde` | `#20803A` → `#1B6E30` | Botón Terminé |
| `ui-azul` | `#2A6FB8` | Botones redondos secundarios |
| `ui-nombre` | `#C23A26` | Nombre del NPC en el globo |
| `luz-bicho` | `#FFD27A` | Lumi |

**Contraste (WCAG, medido):** `ui-texto` sobre blanco 14.26:1 (AAA); blanco sobre `ui-panel` 4.98:1 sobre el cielo y 6.70:1 sobre el pasto (AA); texto `#5A3200` sobre `ui-naranja` 6.07:1; blanco sobre `ui-verde` 4.99:1; blanco sobre `ui-azul` 5.17:1; `ui-nombre` sobre blanco 5.35:1; glosa `#5B6B82` sobre blanco 5.43:1. En la primera versión del mockup tres pares fallaban (verde 2.38, nombre `#E5533D` 3.73, azul `#4BA3F2` 2.69) y se oscurecieron a los valores de la tabla. **Regla:** el verde y el naranja brillantes de los juegos móviles van como fondo de botón solo con texto oscuro, o se oscurecen.
**Riesgo de la paleta:** el chip translúcido depende de lo que haya detrás; sobre un cielo muy claro baja a ~5:1. Si el operador sube la luz, hay que subir la opacidad del panel.

## 7. Técnica de render

- **Materiales:** `MeshStandardMaterial` con `roughness 0.85` a `0.95` y `metalness 0`, color por vértice o un **atlas de degradés de 256 px** compartido (el formato de los packs estilo Synty y KayKit). Sin mapas normales ni texturas de detalle.
- **Terreno:** malla de alturas de 260 × 260 m con 200 × 200 segmentos y color por vértice, una por zona. En producción: datos de altura en el diorama (YAML compilado a JSON, D-138) y LOD de 2 niveles.
- **Vegetación:** `InstancedMesh` para pinos, árboles y pasto; impostores (billboards) para los pinos de más de 60 m en bajo y medio.
- **Personajes:** glTF con *skinning*, `AnimationMixer` por personaje; hasta 4 animados a la vez en bajo, 8 en medio, 12 en alto.
- **Cielo y agua:** shaders propios (incluidos en el mockup), con `tonemapping_fragment` y `colorspace_fragment` para que respeten el tono.
- **Contornos:** no. El look es limpio.
- **Resolución:** `devicePixelRatio` con techo 0.75 / 1.25 / 2 por tier; en bajo se renderiza por debajo de la resolución nativa y se escala.

## 8. UI y HUD

- **Lenguaje visual:** móvil moderno. Botones **redondos** con borde blanco de 4 px y sombra dura inferior, chips oscuros translúcidos con texto blanco, tipografía redondeada y pesada (`Arial Rounded MT Bold`, Trebuchet).
- **Arriba a la izquierda:** avatar redondo del jugador y chip de objetivo ("Objetivo: conocé a Tomás"). No hay barra de vida (no hay daño); su lugar lo ocupa el objetivo.
- **Medidor de conversación ("Conocer a Tomás"):** arriba al centro, título en píldora blanca y debajo **cinco cápsulas** que se llenan de naranja con relieve; la actual se agranda; debajo, el nombre del criterio en curso. Sin números de XP.
- **Diálogo:** **globo blanco grande** con cola apuntando al NPC, nombre en rojo, la línea en 23 px con la palabra nueva resaltada en amarillo pálido (tocar = traducción) y la glosa. Abajo, una fila de **píldoras**: estado de turno (punto verde que late), `Repetir`, `Más despacio`, `Pista` y un `Terminé` verde grande.
- **Abajo a la derecha:** botón grande **Hablar** (naranja, se apaga si no hay nadie cerca) y botones redondos secundarios (`Cuaderno`, `Vista táctil`).
- **Abajo a la izquierda:** en PC, la ayuda de teclas; en táctil, el **joystick virtual** (círculo de 132 px con perilla de 58 px). El mockup alterna con `T` para mostrar cómo quedaría en móvil.
- **Pantallas angostas:** el medidor y el globo bajan, se oculta la ayuda de teclas y el chip de calidad. Verificado a 390 px.

## 9. Controles

- **PC (principal):** WASD/flechas relativas a la cámara (W = hacia donde mira la cámara), `Shift` trotar, `E` hablar, `Espacio`/`Enter` Terminé, `Esc` salir, `Q` girar cámara 45°, rueda o `+` `-` zoom. El mouse no es necesario; clic en los botones del HUD.
- **Gamepad (natural en esta propuesta):** stick izquierdo mover, stick derecho girar cámara despacio (opcional, apagado por defecto en el modo asistido), `A` hablar y Terminé, `B` salir, `X` pista, `Y` repetir, `LB`/`RB` girar 45°.
- **Móvil (después):** joystick virtual a la izquierda y botón Hablar a la derecha (patrón de las referencias 3 y 4). Arrastrar con el otro dedo gira la cámara; doble toque la vuelve atrás del jugador. Es el esquema más conocido por los jugadores de móvil y el más difícil para quien no juega (GDD §1.3: "no exige saber jugar videojuegos").

## 10. Rendimiento en PCs modestas

| Tier | Pixel ratio máx. | Sombras | Niebla / distancia | Extras | Costo esperado |
|---|---|---|---|---|---|
| `bajo` | 0.75 | ninguna (sombra blob) | densa (0.011), pinos lejanos como impostores | sin nubes | 60 a 90 draw calls, ~40k triángulos visibles |
| `medio` | 1.25 | PCF 1024 | 0.0065 | nubes | 90 a 140 draw calls, ~120k triángulos |
| `alto` | 2 | PCF 2048 | 0.0055 | bloom, SSAO liviano | hasta ~200 draw calls |

- **Lo bueno:** los juegos de referencia corren en teléfonos de gama media, así que el estilo es alcanzable.
- **Lo que pesa:** el horizonte abierto (mucho para dibujar), las sombras dinámicas en una caja grande, el *skinning* de varios personajes y la transparencia del agua. En integradas viejas el tier bajo va a perder las sombras y gran parte del horizonte, que es justo lo que le da identidad a esta propuesta.
- **Medición en el mockup:** chequeo sin navegador limpio en los tres tiers; en el render por software (SwiftShader) es la escena más pesada de las tres.

## 11. Assets: de dónde salen, licencia y costo

| Pieza | Fuente propuesta | Licencia | Costo | Notas |
|---|---|---|---|---|
| Personajes base con esqueleto | **KayKit** (Kay Lousberg), **Quaternius** (Ultimate Modular Men/Women) | CC0 | 0 USD | **[verificar]** cuál pack trae proporción ~5 cabezas; KayKit tiende a chibi |
| Animaciones | **Quaternius Universal Animation Library**, **Mixamo** (Adobe, gratis con cuenta, uso comercial permitido en juegos) | CC0 / licencia Mixamo | 0 USD | Mixamo no permite redistribuir las animaciones sueltas; dentro del juego está bien |
| Naturaleza (pinos, árboles, rocas, pasto) | Quaternius Stylized Nature MegaKit, Kenney Nature Kit | CC0 | 0 USD | Recolorear a la paleta |
| Casas, granero, cercos, carros | Kenney (Survival Kit, Fantasy Town Kit), Quaternius Medieval Village MegaKit | CC0 | 0 USD | **[verificar]** que haya granero y casa de campo moderna; si no, modelar simple |
| Animales (caballo, vaca, gallina, cabra) | Quaternius (packs de animales animados) | CC0 | 0 USD | **[verificar]** el contenido exacto del pack |
| Alternativa paga de estilo unificado | **Synty POLYGON** (Farm, Nature) y Synty Sidekick (creador de personajes) | licencia comercial de Synty | ~USD 30 a 150 por pack **[verificar precio]** | Un solo autor = estilo parejo. **[verificar]** cláusula de redistribución para un juego web (los GLB quedan descargables en el navegador), igual que pasó con Mana Seed |
| Cielo, agua, niebla, Lumi | código propio (shaders del mockup) | propia | 0 USD | |

**Lo que sí o sí es propio:** el elenco con su ropa y accesorios (13 o 14 aldeanos como variantes de 2 o 3 cuerpos), los *blend shapes* de cara si el pack no los trae, el layout de cada zona, cielo y agua.

## 12. Cómo encaja en el stack R3F y qué se reutiliza

- **Se queda igual:** Vite + React + TS + R3F + drei, el núcleo puro, el store, el HUD DOM (se re-estiliza), las costuras R10 a R15 y el lint de capas.
- **Cambia de fondo:**
  - `world/camera/`: hace falta un preset nuevo `thirdPerson` (ya está declarado `perspective3D` en `presets.ts`). `followAlpha` y `cutFollow` sirven; `cameraOffset` se reemplaza por la lógica de persecución con colisión. **Esto choca con D-053 y con el pilar "cámara que acompaña sola desde arriba"**: el operador tendría que revisarlo explícitamente.
  - **Movimiento:** la grilla de celdas de 1 m del núcleo sigue sirviendo para colisión y "celda actual", pero el movimiento pasa a ser continuo y relativo a la cámara; el clic en el suelo se vuelve secundario.
  - **Terreno:** alturas continuas en lugar de tiles; `world/tiles/` se reemplaza por una malla de terreno.
  - `world/sprites/`: se descarta para personajes (pasan a glTF con esqueleto); queda solo para halos y efectos.
  - `world/post/Post.tsx`: se reusa el bloom; se quita el tilt-shift (no aplica a esta cámara).
- **Se descarta:** `world/art/pixels.ts`, `world/props/Boxes.tsx`, D-154 y los billboards de personajes.
- **Para otros destinos (`07`):** VR es buen caso (personajes 3D reales, escala humana). Móvil es posible pero es el más exigente de GPU de las tres propuestas.

## 13. Riesgos

1. **Choca con un pilar del GDD (alto):** "no exige saber jugar videojuegos" y "cámara que acompaña sola desde arriba, sin órbita libre". La tercera persona obliga a manejar dirección relativa a la cámara; la investigación de referencias (*Terra Alia*) marcó la cámara como la queja más cara. *Mitigación:* cámara asistida agresiva y modo "clic para caminar" opcional, pero nunca se va a sentir tan fácil como mirar desde arriba.
2. **Rendimiento en integradas (alto):** el horizonte, las sombras y el *skinning* son lo que hace linda la propuesta y lo primero que se apaga en bajo.
3. **Nombrar objetos en el espacio (medio):** el GDD apuesta a "preguntar por cualquier objeto" (*Influent*); en tercera persona los objetos quedan chicos y a veces detrás del personaje. Hace falta un modo "mirar" o resaltar al acercarse.
4. **Estilo de los packs (medio):** mezclar KayKit, Quaternius y Kenney da proporciones distintas. *Mitigación:* un solo pack de personajes y recolor de todo a la paleta.
5. **Mareo (bajo a medio):** cámara en movimiento continuo. *Mitigación:* "reducir movimiento" con cortes y FOV fijo.
6. **Reemplaza tres decisiones (D-139, D-154, D-053):** el costo de documentos es mayor que en A o C.

## 14. Esfuerzo estimado

| Tramo | Días de agente | Qué incluye |
|---|---|---|
| Cámara de tercera persona con colisión y plano de charla | 5 | La parte más delicada; hay que probarla con gente |
| Movimiento continuo relativo a la cámara sobre el núcleo de grilla | 3 | Mantener R7 (posición por frame fuera de React) |
| Terreno por alturas, agua, cielo, niebla, sombras por tier | 5 | Base en los shaders del mockup |
| Personajes glTF con esqueleto, mezcla de animaciones, 3 NPCs | 6 | Retargeting y recolor |
| Primera zona completa con props y animales | 6 a 8 | |
| Restyle del HUD (estilo móvil, joystick para después) | 2 | |
| **Total hasta una zona jugable** | **~27 a 29** | Más 2 a 3 días de pruebas de cámara con el operador |

**Veredicto de la propuesta:** la más parecida a las referencias móviles y la mejor para VR. Es la más pesada de correr y la que más pelea con los pilares de accesibilidad del GDD.
