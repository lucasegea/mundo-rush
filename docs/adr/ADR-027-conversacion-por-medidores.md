# ADR-027 — Conversación libre por medidores

- **Estado:** Propuesto (A2, prototipo jugable con Harlan; sin fila de decisión en `00` todavía)
- **Fecha:** 2026-10-12 (construcción, headless, Track A2)
- **Fuente:** brief de el asistente (Track A2) e informe de investigación `l2-letras-y-conversacion-libre/90-informe.md` §2.3-§2.5 (spec de diseño); visión `docs/vision/2026-10-11-ejercicios-y-barras.md`

## Decisión

Una escena puede ser una **conversación libre sin guion** medida por **medidores en orden** (fase = medidor activo). El primero es siempre "conocerse" (rapport); al llenarse se abre el del objetivo (pedir, convencer, …). El cierre es una **acción del juego disparada por código** cuando se llena el último medidor; el modelo del NPC nunca decide el éxito.

Piezas y dueños:

1. **Motor puro** — `packages/core/src/conversation/` (subruta `@lg/core/conversation`). Sin reloj ni azar. Entra la definición del encuentro (dato), su estado y las etiquetas de UN intercambio; salen el estado nuevo y eventos (`points`, `factLearned`, `playerShared`, `tierUnlocked`, `stalled`, `stepDone`, `phaseChanged`, `complete`, `safety`). Reglas de rapport aplicadas por código:
   - una pregunta de seguimiento vale más que una de tema nuevo;
   - los hechos del NPC suman según su nivel de intimidad, y solo cuentan los de niveles ya abiertos (los niveles se abren por hechos aprendidos y datos compartidos);
   - **reciprocidad**: tras `max_preguntas_sin_compartir` preguntas seguidas sin contar nada propio, el medidor se frena (el NPC pregunta de vuelta) hasta que el jugador cuente algo;
   - preguntas repetidas o en ráfaga valen 0;
   - tope de puntos por turno;
   - el medidor no se llena sin mínimos de estructura (hechos, datos compartidos, niveles tocados): sin ellos la barra queda en "casi".

   Turnos en L1, incomprensibles o con bandera de seguridad no suman ni restan; suben la escalera de ayuda.
2. **Juez** — `apps/server/src/conversation/judge.ts`, rol `judge` de `models.yaml` (Gemini por el proveedor de texto existente; un falso en los tests). Solo **etiqueta** el intercambio con listas cerradas (actos de diálogo, ids de hechos y datos, objeciones con calidad, idioma, comprensible, seguridad) y devuelve JSON estricto. Lo validan zod y las listas de la ficha: lo desconocido se descarta, un JSON inválido se reintenta una vez y, si vuelve a fallar, el intercambio no cuenta. Corre **después** de que el NPC respondió (por los ganchos de conversación), así que no agrega latencia a la respuesta. Lo que dijeron jugador y NPC entra como dato entre marcas, nunca como instrucción.
3. **Ficha** — `content/conversaciones/CONV-*.yaml`, esquema `FichaConversacion` (`@lg/content-schema`), compilada a `conversaciones.json`, que solo ve el servidor. Contiene persona extra, mundo, hechos por nivel, lo que el jugador puede contar de su PERSONAJE, secretos (desvío o revelación con condición), medidores con sus reglas y pasos, la escalera de ayuda y ejemplos calibrados para el juez. Una escena la usa con `conversacion: CONV-*` y puede traer `topes` propios. Como es contenido, el modo director la edita igual que el resto del YAML.
4. **Sistema** — `apps/server/src/conversation/system.ts`. Se enchufa a scene-runtime **solo por los ganchos** (`ConversationHooks`, F5.2). No toca la máquina de escena. El gancho de arranque recibe la ficha y un `control` con tres operaciones: `setNpcBrief`, `sendState` y `complete`. El estado del encuentro se guarda en `store/encounters.ts` (`apps/server/data/encounters.json`, se lee en cada consulta).
5. **Nota del NPC** — `conversation/prompt.ts`. Es un bloque que se suma al prompt de la escena y se rearma con el estado:
   - en la fase de conocerse, el NPC **no tiene** el recado ni las objeciones (no puede filtrar lo que no tiene);
   - solo tiene los hechos de niveles abiertos;
   - afina S2 para esta escena: se habla de la vida del personaje en el juego, nunca de datos reales, y sin romance.

   Al abrirse el objetivo entran el recado, lo que el NPC quiere, sus objeciones y el PUENTE ("¿qué te trae?"). Además: "no des el sí final, el juego dice tu cierre". La línea de cierre guionada no entra al prompt de estas escenas, porque nombra el objetivo.
6. **HUD** — mensaje `conversation.state` (protocolo, sin números: anchos 0..1), que pinta `ui/dialogue/ConversationPanel.tsx`:
   - barras animadas con etiqueta y fase;
   - "Lo que sabés de <nombre>";
   - la escalera de ayuda: pista de Lumi y después frases sugeridas. El escalón es el mayor entre el del servidor (turnos sin progreso, reciprocidad, L1, pedido antes de tiempo) y el reloj de silencio del cliente (20 s y 40 s en tu turno);
   - el aviso "aceptó, despedite".

   Anda igual en voz y en texto.

### Cierre sin cambiar la máquina (03 §3.5.1)

`criteriaMet` solo transiciona en `npcTurn`. `control.complete()` marca la corrida. En el **próximo** `npcTurn`, el runtime decide `criteriaMet` en lugar de pedir o mostrar la respuesta del NPC: el turno del jugador (su despedida) se modera y entra al transcripto, y en voz el audio de esa respuesta se corta. Después sale el cierre guionado. Los criterios del observador no cierran estas escenas; su seguridad y su evidencia sí siguen. Una charla que termina sin éxito (tope o no converge) **no** emite `mission_outcome` ni efectos: la misión queda abierta y lo conocido queda guardado. Si el encuentro ya estaba cumplido (el tope llegó antes de la despedida), la próxima visita cierra en el primer turno.

### Cambio de fase en Live

Live no deja cambiar la instrucción de sistema de una sesión abierta. Cuando la nota cambia, el runtime:

1. abre una sesión **nueva** en segundo plano con la instrucción actualizada;
2. en el próximo **punto seguro** (`playerTurn.waiting`, nadie hablando) le inyecta el historial de la escena terminado en un turno del modelo, así no genera nada;
3. cambia de sesión y cierra la vieja.

El reloj de costo sigue el de la primera sesión: la escena conserva **una** fila de costo. Si la nota vuelve a cambiar mientras abría, se descarta y se reabre. Si la sesión nueva no abre, la nota entra a la vigente como contexto `[DIRECTOR]`, también terminado en un turno del modelo. Las dos vías se verificaron contra `gemini-3.1-flash-live-preview` (smoke real de A2): el historial por `clientContent` terminado en el modelo se acepta sin generar, y una nota del usuario genera respuesta. Se eligió reabrir con historial porque la instrucción de sistema manda más que una nota en el medio del contexto. Costo: hasta un turno del NPC con la nota vieja, si el jugador ya empezó a hablar cuando llega la sesión nueva.

### Cómo se agrega un medidor (persuasión, negociación, …)

1. Tipo en `METER_KINDS` (core) y en el esquema de la ficha (`MedidorObjetivo.tipo` o un medidor nuevo en la tupla).
2. Un **puntuador** (`Scorer`: `score`, `fill`, `isFull`) en `SCORERS` de `engine.ts`. `pedir` y `convencer` comparten el de pasos y objeciones. `negociar` está reservado: el esquema lo acepta y `createEncounter` lo rechaza claro hasta que tenga puntuador.
3. Si el juez necesita etiquetas nuevas, se agregan a las listas cerradas (`DIALOGUE_ACTS` u otra) y al prompt del juez. El código sigue sumando: el juez nunca da un número.
4. Su fase en `conversation/prompt.ts` (qué sabe y qué quiere el NPC en esa fase) y su mapeo en `conversation/sheet.ts`.
5. Tests puros del puntuador en `packages/core/test/conversation.test.ts`.

### Rejugar

`npm run dev:reset-farmer`, o `npm run dev:reset-encounter -- --npc NPC-X` o `--conv CONV-X`. Borra el estado del encuentro y registra un reinicio de las misiones que usan esa ficha. El log de evidencia sigue append-only: al leer el progreso se ignora lo de esas misiones fechado hasta el reinicio (`withoutResets`). El resto del progreso real no cambia.

## Alternativas descartadas

- Que el modelo del NPC decida el éxito o puntúe: no es auditable, se puede manipular desde el diálogo y el puntaje deriva.
- Que el juez dé un puntaje numérico: no es calibrable ni reproducible. Etiquetas cerradas más reglas en código sí lo son.
- Juzgar antes de que el NPC responda: suma latencia a cada turno.
- Darle todo al NPC desde el principio con la orden "no lo digas hasta…": filtra.
- Cambiar la máquina de escena para cerrar fuera de `npcTurn`: rompe el contrato de 03 §3.5.1.
- Inyectar solo una nota en la sesión de Live sin reabrir: es más débil que la instrucción de sistema. Queda como respaldo.

## Qué se resigna

- Una llamada de texto extra por intercambio (el juez).
- Una reapertura de sesión de Live por cambio de nota (unos 1,5 s en segundo plano).
- El cierre llega un turno del jugador después de cumplido el objetivo: la despedida.
- Las reglas de puntos son iniciales (informe 2.5.B) y se calibran jugando.

## Notas

Contenido inventado para el prototipo, en borrador para revisar en F8: M9.1 está fuera de la numeración de `02`; Harlan no requiere presentación; su nieto Eli, su perra Pepper, que vive solo, su rutina y su opinión sobre el Cruce son agregados sobre el canon de `02` §3.4.11, sin contradecirlo. La persona canónica menciona los postes; acá sale de la persona y vive en el medidor del objetivo.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
