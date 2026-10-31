# ADR-027 — Free conversation by meters

- **Status:** Proposed (A2, playable prototype with Harlan; no decision row in `00` yet)
- **Date:** 2026-10-12 (build, headless, Track A2)
- **Source:** brief from the assistant (Track A2) and research report `l2-letras-y-conversacion-libre/90-informe.md` §2.3-§2.5 (design spec); vision `docs/vision/2026-10-11-ejercicios-y-barras.md`

## Decision

A scene can be a **free, unscripted conversation** measured by **meters in order** (phase = active meter). The first is always "getting to know each other" (rapport); when it fills, the goal meter opens (ask, persuade, …). The closing is a **game action triggered by code** when the last meter fills; the NPC's model never decides success.

Pieces and owners:

1. **Pure engine** — `packages/core/src/conversation/` (subpath `@lg/core/conversation`). No clock or randomness. It takes the encounter definition (data), its state and the tags of ONE exchange; it outputs the new state and events (`points`, `factLearned`, `playerShared`, `tierUnlocked`, `stalled`, `stepDone`, `phaseChanged`, `complete`, `safety`). Rapport rules applied by code:
   - a follow-up question is worth more than a new-topic one;
   - the NPC's facts add up according to their intimacy level, and only those of already open levels count (levels open through facts learned and data shared);
   - **reciprocity**: after `max_preguntas_sin_compartir` consecutive questions without sharing anything of their own, the meter stalls (the NPC asks back) until the player shares something;
   - repeated or rapid-fire questions are worth 0;
   - cap on points per turn;
   - the meter does not fill without structure minimums (facts, shared data, levels touched): without them the bar stays at "almost".

   Turns in L1, incomprehensible ones, or ones with a safety flag neither add nor subtract; they climb the help ladder.
2. **Judge** — `apps/server/src/conversation/judge.ts`, `judge` role of `models.yaml` (Gemini through the existing text provider; a fake in tests). It only **tags** the exchange with closed lists (dialogue acts, fact and data ids, objections with quality, language, comprehensible, safety) and returns strict JSON. It is validated by zod and the sheet's lists: unknown items are discarded, invalid JSON is retried once and, if it fails again, the exchange does not count. It runs **after** the NPC has answered (through the conversation hooks), so it adds no latency to the response. What the player and the NPC said enters as data between markers, never as an instruction.
3. **Sheet** — `content/conversaciones/CONV-*.yaml`, `FichaConversacion` schema (`@lg/content-schema`), compiled to `conversaciones.json`, which only the server sees. It contains extra persona, world, facts per level, what the player can tell about their CHARACTER, secrets (deflection or reveal with a condition), meters with their rules and steps, the help ladder, and calibrated examples for the judge. A scene uses it with `conversacion: CONV-*` and can carry its own `topes`. Being content, director mode edits it like the rest of the YAML.
4. **System** — `apps/server/src/conversation/system.ts`. It plugs into scene-runtime **only through the hooks** (`ConversationHooks`, F5.2). It does not touch the scene machine. The start hook receives the sheet and a `control` with three operations: `setNpcBrief`, `sendState` and `complete`. The encounter state is stored in `store/encounters.ts` (`apps/server/data/encounters.json`, read on every query).
5. **NPC note** — `conversation/prompt.ts`. It is a block added to the scene prompt and rebuilt from the state:
   - in the getting-to-know phase, the NPC **does not have** the errand or the objections (it cannot leak what it does not have);
   - it only has the facts of open levels;
   - it tunes S2 for this scene: the character's life in the game is discussed, never real data, and no romance.

   When the goal opens, the errand, what the NPC wants, its objections and the BRIDGE ("¿qué te trae?") come in. Also: "do not give the final yes, the game says your closing". The scripted closing line does not enter the prompt of these scenes, because it names the goal.
6. **HUD** — `conversation.state` message (protocol, no numbers: widths 0..1), painted by `ui/dialogue/ConversationPanel.tsx`:
   - animated bars with label and phase;
   - "Lo que sabés de <nombre>";
   - the help ladder: a hint from Lumi and then suggested phrases. The step is the greater of the server's (turns without progress, reciprocity, L1, request made too early) and the client's silence clock (20 s and 40 s on your turn);
   - the notice "aceptó, despedite".

   It works the same in voice and in text.

### Closing without changing the machine (03 §3.5.1)

`criteriaMet` only transitions on `npcTurn`. `control.complete()` marks the run. On the **next** `npcTurn`, the runtime decides `criteriaMet` instead of requesting or showing the NPC's response: the player's turn (their goodbye) is moderated and enters the transcript, and in voice the audio of that response is cut. Then the scripted closing plays. The observer's criteria do not close these scenes; its safety and its evidence do still apply. A conversation that ends without success (cap reached or no convergence) does **not** emit `mission_outcome` or effects: the mission stays open and what is known stays saved. If the encounter was already fulfilled (the cap arrived before the goodbye), the next visit closes on the first turn.

### Phase change in Live

Live does not let you change the system instruction of an open session. When the note changes, the runtime:

1. opens a **new** session in the background with the updated instruction;
2. at the next **safe point** (`playerTurn.waiting`, nobody speaking) injects the scene history ending in a model turn, so it generates nothing;
3. switches sessions and closes the old one.

The cost clock follows that of the first session: the scene keeps **one** cost row. If the note changes again while it was opening, it is discarded and reopened. If the new session does not open, the note enters the current one as `[DIRECTOR]` context, also ending in a model turn. Both paths were verified against `gemini-3.1-flash-live-preview` (real A2 smoke): history through `clientContent` ending in the model is accepted without generating, and a user note does generate a response. Reopening with history was chosen because the system instruction outweighs a note in the middle of the context. Cost: up to one NPC turn with the old note, if the player has already started speaking when the new session arrives.

### How to add a meter (persuasion, negotiation, …)

1. Type in `METER_KINDS` (core) and in the sheet schema (`MedidorObjetivo.tipo` or a new meter in the tuple).
2. A **scorer** (`Scorer`: `score`, `fill`, `isFull`) in `SCORERS` of `engine.ts`. `pedir` and `convencer` share the steps-and-objections one. `negociar` is reserved: the schema accepts it and `createEncounter` rejects it clearly until it has a scorer.
3. If the judge needs new tags, they are added to the closed lists (`DIALOGUE_ACTS` or another) and to the judge's prompt. The code still does the adding: the judge never gives a number.
4. Its phase in `conversation/prompt.ts` (what the NPC knows and wants in that phase) and its mapping in `conversation/sheet.ts`.
5. Pure scorer tests in `packages/core/test/conversation.test.ts`.

### Replaying

`npm run dev:reset-farmer`, or `npm run dev:reset-encounter -- --npc NPC-X` or `--conv CONV-X`. It deletes the encounter state and records a reset of the missions that use that sheet. The evidence log stays append-only: when reading progress, anything from those missions dated up to the reset is ignored (`withoutResets`). The rest of the real progress does not change.

## Rejected alternatives

- Having the NPC's model decide success or score: it is not auditable, it can be manipulated from the dialogue, and the score drifts.
- Having the judge give a numeric score: it is neither calibratable nor reproducible. Closed tags plus rules in code are.
- Judging before the NPC responds: it adds latency to every turn.
- Giving the NPC everything from the start with the order "do not say it until…": it leaks.
- Changing the scene machine to close outside `npcTurn`: it breaks the contract of 03 §3.5.1.
- Injecting only a note into the Live session without reopening: it is weaker than the system instruction. It remains as a fallback.

## Trade-offs

- One extra text call per exchange (the judge).
- One Live session reopening per note change (about 1.5 s in the background).
- The closing arrives one player turn after the goal is met: the goodbye.
- The point rules are initial (report 2.5.B) and are calibrated by playing.

## Notes

Content invented for the prototype, in draft for review in F8: M9.1 is outside the numbering of `02`; Harlan needs no introduction; his grandson Eli, his dog Pepper, that he lives alone, his routine and his opinion about the Crossing are additions over the canon of `02` §3.4.11, without contradicting it. The canonical persona mentions the posts; here it comes out of the persona and lives in the goal meter.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
