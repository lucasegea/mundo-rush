# 01 — Game Design Document (GDD) of the target game

**Project:** learning-game (working title *Mundo Rush*, D-031) · **Document:** GDD v0.3 · **Date:** 2026-10-06 (v0.1: 2026-10-05) · **Author:** the Mundo Rush team
**v0.2 (2026-10-06):** integrates the operator's answers (`00-decisiones.md` §1.1): title *Mundo Rush*; for now the game is for the operator (D-135); **HD-2D** art (D-139, §5); **core pronunciation** (D-044, §2.4.7, reverts DP-27); map walkable from the start (D-020). The DP rows in §9 that the operator decided point to their `D-NNN`; `00-decisiones.md` governs.
**v0.3 (2026-10-06):** aligns **the whole** GDD with the brief's premise (section "Guion v2 + modo director", 2026-10-06), which supersedes the *Lantern Bay* and lighthouse one. In v0.2 only §3 was aligned; now so are §1 (pitch, modes), §2 (the founding loop and the network loop, Lumi as a firefly in a jar per D-165, card examples, skill tree, the §2.14 onboarding with the content of `02` §5, failure states), §4 (bridges between modes), §5 (art, palette and audio: firefly trails and the Crossing's saturation instead of lanterns) and §9 (DP-01, DP-02, DP-10, DP-11, DP-39 point to their `D-NNN`). No passage of the v0.1 premise remains as a contract; the retired names and ids are listed in `02` §0.5.
**Status:** draft of the vision and specification of mode 1. Pending the architecture review before any headless run builds from it.
**Document language:** Spanish. The NPC dialogue lines are in English because it is the target language of the first pair (Spanish → English).

> **Purpose of this document, in one sentence:** to describe the game we want to have finished (the five modes as a vision, mode 1 specified in detail with its script) so completely that a headless run can design, build and verify mode 1 without asking anyone anything, using the recommended defaults on each pending decision.

---

## Index

0. How to use this document (contract for headless runs)
1. Vision
2. Mode 1, full specification
3. Mode 1 script (world, characters, arc, mission catalog, written scenes)
4. Modes 2 to 5 (vision)
5. Art direction, camera, UI and audio
6. Metrics and experiments
7. Glossary
8. Out of scope
9. Open questions and register of pending decisions (DECISION-PENDING)
10. Cited sources

---

## 0. How to use this document (contract for headless runs)

### 0.1 Inputs this GDD cites and does not redo

| Input | Path | What it provides |
|---|---|---|
| Project brief (operator decisions, binding) | (internal document) | Modes, language pairs, market, ATP audience, who pays, definition of "accessible" |
| Business analysis (internal) | (internal document) | Voice cost quadratic in duration → short scenes; competitive map; validation experiments; risks (minors, 3D vs accessibility) |
| Research | (internal document) and `20-evidencia.md` | Design defaults with evidence tag (E1-E37) |
| Game references | (internal document) | What to copy and what to avoid from Terra Alia, Influent, Noun Town and others; assisted camera; low mode; Rapier is probably unnecessary |
| Reused voice project | a previous voice prototype | Node.js proxy + WebSocket to Gemini Live (voice), text model for grammar/observer/debrief, Deepgram Aura TTS, disfluency rules, learner profile, "conversation" and "correction" modes, server-side session cap of ~15 min |

From here on they are cited as **[Brief]**, **[Business §x]**, **[Research §x / Ex]**, **[References §x]** and **[Voice prototype]**.

### 0.2 Evidence tags

When a design rule rests on research, it carries the research's tag:

| Tag | Meaning |
|---|---|
| [Proven] | high or moderate certainty |
| [Probable] | low certainty |
| [Hypothesis] | very low certainty or no studies |
| [Disputed] | the evidence points in opposite directions |

A rule without a tag is a **design decision** (taste, product, cost or safety), not a claim about learning. They must not be confused.

### 0.3 Rules for a headless run that reads this GDD

1. **Order of authority:** the only one in force is that of `00-decisiones.md` §0.3 (brief and decided > `00` defaults > `04` > `03` > `01` > `02` for construction; `02` > `01` only for the wording of content). If this document contradicts a higher-authority document, that one wins and the contradiction is reported. The defaults of this GDD's DPs are superseded by those of `00-decisiones.md` (§9 translates `DP-NN` → `D-NNN`): **if they differ, the register wins**.
2. **Every `DECISION-PENDING` has a recommended default.** If the operator has not resolved it, the run uses the default, notes it in its report and moves on. It never stops for a DP.
3. **Something marked as a DP is never adopted or discarded silently.** If a run needs to depart from the default, it reports it as an explicit deviation.
4. **The inviolable rules (§1.4) are not DPs.** No default relaxes them.
5. **Mode 1 has no money.** No run adds coins, shops, prices or economy to mode 1. The tycoon-style economy remains a candidate for mode 2 (DP-15).
6. **What is architecture is decided by the architecture review.** This GDD describes *what* the game does and *why*. Where it names technology (R3F, Zustand, Gemini Live) it does so as an inherited constraint or proposal, not as architecture design.
7. **IDs are stable.** Missions (`M1.3`), NPCs (`NPC-NELL`), skills (`HAB-PEDIR-1`), decisions (`DP-07`). A run that changes content keeps the ID or creates a new one; it never reuses an ID for something else.
8. **No personal data** in content, logs or fixtures. NPC names are fictional.

---

## 1. Vision

### 1.1 Working title and one line

- **Working title:** *Mundo Rush* (decided by the operator, D-031). The fiction's world is the agricultural valley of *Kestrel Valley* (D-164); the village the player founds at the Crossing picks its name in M1.8 (D-173). The trademark is checked before any commercial use.
- **One line:** you are an Argentine farm worker who arrives with the harvest crew in an English-speaking agricultural valley where small planes spray right next to the houses; with no money or degrees, with the gift of gab as your only power, you talk with neighbors and landowners, build a network and found a village so that an ordinance keeps the spraying far away. Everything is achieved by talking, and a firefly that came with you in a jar accompanies you without rushing you.
- **Product line:** the place where practicing speaking a second language is not embarrassing, does not mean fighting with the world, and feels like playing.

### 1.2 The problem it solves

- Learning to **speak** a second language requires producing sentences with someone who answers you. That is expensive (teacher, exchange), embarrassing (L2 anxiety, associated with worse achievement, r = −.36 [Proven], [Research §1 / E1]) and often unavailable.
- The dominant apps teach recognition and isolated phrases with habit mechanics (streaks, leagues) and already give away AI conversation without a world [Business §2].
- The existing language games have a world but no conversation (Influent, Terra Alia, Noun Town with scripted NPCs) [References §0, §3].
- In Argentina and Brazil the weakest skill is precisely the oral one (Brazil: speaking 464 vs reading 516 in EF EPI 2025) [Business §1.2].

### 1.3 Pillars

The four pillars order all decisions. If two clash, the lower-numbered one wins.

**P1. Accessible (in the operator's sense).** "Accessible" means *the device and the ways of learning*: anyone can have a second language without fighting against the world [Brief].
- Runs on a modest school PC, in the browser, with nothing to install. A low graphics mode is mandatory [References §4.4].
- It can be played without a microphone (full text mode).
- Nothing that is accessibility is unlocked by progress: speed, subtitles, font size, text mode, pauses are always available.
- It is paid, as cheap as possible but sustainable; **the one who pays funds the one who does not** (institutions, grants) [Brief].
- It does not require knowing how to play videogames: minimal controls, a camera that follows on its own from above (no free orbit), no reflexes.

**P2. Play first, learn inside.** The player is helping a neighbor, not "doing a lesson". The language is the tool for achieving something in the world, never an exam stuck on the side.
- Every mission is solved by **speaking** (or writing in text mode). If a mission can be completed without using the language, it is badly designed [References §4.2.1].
- Missions are tasks in the TBLT sense: non-linguistic outcome, language as the means [Research §2.4 / E29, E7] [Probable].

**P3. Speaking without pressure.** No clock, no punishment, no humiliation.
- Low anxiety and enjoyment are associated with more willingness to speak [Proven as an association, E1, E3].
- The NPC does not interrupt you; the silence is yours and you close it (button) [Hypothesis, E10], with an adjustable pace (a comfort feature; effect on learning [Hypothesis], E9).
- The companion corrects little, briefly and respectfully, and lets you self-correct [Probable, E31, E32].
- There are no streaks, no rewards for logging in every day, no leaderboards in mode 1 [Proven in the lab that expected rewards contingent on participation undermine intrinsic motivation, more so in children, E12, E14].

**P4. A world that remembers you.** Neighbors remember what you did and what you said; the words that were hard for you come back in new situations, more spaced out each time [Proven for spacing and retrieval, E34]. What you achieve by talking stays founded on the map and the network of people who know you is seen as firefly trails.

### 1.4 Inviolable rules (they are not pending decisions)

1. **Mode 1 has no money or economy.** The only "currency" is the knowledge potion, and it reflects demonstrated competence.
2. **No streaks, no rewards for daily login, no punishment for missing, no leaderboards, no loot boxes, no in-game purchases that give an advantage.**
3. **No accessibility feature is locked behind progress or payment.**
4. **There is no punitive failure state.** Progress, potions or a relationship with an NPC are never lost for making a mistake.
5. **NPCs do not leave the safety script.** Each scene has one permitted topic; the AI does not drift into unsafe topics, does not ask for personal data and has no free chat without a frame (see §2.17).
6. **The companion never pressures:** it does not rush, does not count time out loud, does not compare with other players.
7. **The language circulates through the mechanics:** without use of the language there is no mission resolution.
8. **The 3D world and the DOM interface do not talk to each other directly.** Game state is the only source of truth (architecture rule inherited from the third-party proposal; see §1.9). The architecture review defines how.

### 1.5 Audience

> **For now (D-135, 2026-10-06):** the game is built **for the operator** (single user, adult, a Spanish speaker learning English). He decides by playing what works; there are no external users, price or pilot at this stage. The audience below is that of the product when it opens: it still guides the design (accessibility, modest PC, minors' data), but no phase waits to validate it yet. The first pilot, when it comes, is with adults (D-023).

| Axis | Decision | Source |
|---|---|---|
| Age | ATP (suitable for all audiences). Includes minors → compliance with minors' data from the design stage | [Brief] |
| Market | Argentina first, then Brazil | [Brief] |
| Language pairs, in order | ES → EN; then ES → PT; then PT → EN | [Brief] |
| Who pays | Mainly institutions (schools, institutes, NGOs, government); paying consumer at a price above the estimated LatAm ceiling, with a generous free version | [Brief] |
| Level | A0 (pre-A1) to B1 in v1 of mode 1 | Task of this GDD |

**Player profiles (design personas, fictional):**

| Persona | Age | Context | What they need from the game |
|---|---|---|---|
| "The school student" | 11-15 | Uses the school lab PC; the English teacher assigns missions with a class code; sometimes without good headphones | That it loads fast on an old PC; text mode if there is no microphone; that it does not embarrass her in front of classmates; progress visible to the teacher |
| "The adult who needs to speak" | 18-35 | Remote work or an interview in English; can read but freezes when speaking | Real oral practice without judgment; short sessions at night; useful feedback |
| "The curious older person" | 55+ | Wants to travel or talk with grandchildren who live abroad; little videogame experience | Minimal controls, large font, slow pace, explanation in their language |
| "The teacher" | adult | Coordinates a course; needs oral practice hours between classes | Class codes, assigning missions, reports by "can-do", without having to listen to audio |
| "The guardian" | adult | Responsible for a minor who plays at home | Consent, control, seeing what is stored, deleting data |

### 1.6 Platform

- **v1: PC in a web browser** (recent Chrome, Edge, Firefox; macOS Safari as a secondary target). No installation. Keyboard + mouse; playable with keyboard only and with mouse only.
- **Mobile stays open**, it is not the starting point [Brief]. The design avoids whatever would make porting later impossible: a scaling interface, touch targets of at least 44 px in the DOM layer, no mechanic that requires hover or multiple simultaneous keys. See **DP-31**.
- **Minimum target hardware (proposal, to be measured):** a PC with 4 GB of RAM and integrated graphics, a stable 1-2 Mbps connection for voice. The hardware benchmark is experiment #5 of the business analysis [Business §7].
- Named tension: in Brazil 87% of class DE accesses only by mobile phone [Business §6.3]. "PC first" serves the payer first. It is sequence, not oversight.

### 1.7 What makes it different

| Product | What it does | What it does not do (and we do) |
|---|---|---|
| **Duolingo** (Super/Max) | Short lessons, streaks, leagues; video call with an AI character, almost free | No world, no missions with consequences, no companion that waits out your silence. Its habit engine is streaks and leagues, which we avoid by design (P3). Our differentiator is not "talking to AI" (already a commodity [Business §2.1]) but world + companion + Latin American L1 + accessibility |
| **Noun Town** | 3D world, +1,000 words, voice recognition with 16 **scripted** NPCs, SRS, streaks and daily goals; teacher tools and group licenses | Its NPCs do not really converse; it uses streaks. It is the institutional benchmark to beat [References §3] |
| **Terra Alia** | Isometric RPG; words = magic; imprecise voice for single words | Combat disconnected from learning, wrong translations, bugs, rigid camera [References §1.4]. Us: no combat, missions solved by speaking, curated glossary |
| **Influent** | 3D apartment; click an object and you hear its name | No grammar, no speaking, little content [References §2]. We copy the "naming in spatial context" (the companion's base skill) and add conversation |
| **SpeakRPG** | Light RPG with voice and a cat companion, iOS | The concept exists, the traction does not [Business §2]. Us: web, PC, Latin American L1, institutions |

**Summary of the differentiator:** (a) real voice conversation with objectives inside a world, (b) a pedagogical companion that corrects little, on time and without pressure, (c) silences and pace in the learner's hands, (d) progress that reports competence instead of paying for participation, (e) made for Latin American institutions and for modest PCs.

### 1.8 The five modes at a glance

| # | Mode | Status | Relationship to mode 1 |
|---|---|---|---|
| 1 | **RPG for good** (*Kestrel Valley*) | Built first | Core: speech, prosocial missions, the network, founding without money, companion, potions |
| 2 | **Tell and build** (storytelling / world-building) | Vision; year 2 | Unlocked with mode 1's narrative skills; candidate for the tycoon-style building mechanic (DP-15) |
| 3 | **My real day** (calendar, notes, mail, messaging) | On hold | Reuses the companion outside the game; high privacy risk |
| 4 | **Media** (songs, videos, live or deferred with an agent) | Vision | The Crossing's song (M3.6, Kofi and Noor, for the Crossing Radio) as a bridge |
| 5 | **Travel and culture** | Undeveloped | Other valleys and destinations; natural door for new language pairs (ES→PT: the same scheme in Brazil, [Brief]) |

### 1.9 The third-party proposal ("prompt for Claude Code") and what is done with it

The operator shared a prompt that proposes an MVP "open-world RPG + RollerCoaster Tycoon-style building + business + narrative" with a stack and architecture rules. This GDD **separates what is adopted, what is deferred and what clashes**:

| Element of the prompt | Treatment in this GDD |
|---|---|
| Vite + React + TS, React Three Fiber + drei, Zustand, HUD in React DOM + Tailwind | Taken as the **proposed stack** (coincides with the [Brief]). The architecture review decides |
| Rapier (physics) | **DP-14**, default: not in mode 1 (references research §4.4: movement is walking and interacting) |
| Declarative 3D code as components | Adopted as an inherited constraint (the architecture review confirms) |
| "The 3D world and the UI never communicate directly; global state is the only source of truth" | **Adopted as an inviolable rule** (§1.4.8). It also enables the 2D/2.5D plan B that the references research asks for: logic does not depend on the render |
| Low-poly style, run smoothly on the web | "Run smoothly on the web" adopted; the style was replaced by the operator with **HD-2D** (D-139, §5) |
| Folders separating logic, DOM UI and 3D render | Adopted as a requirement; the architecture review defines the form |
| Third-person open world | **Reduced:** a small diorama-style village, with zones, seen from above at an angle (D-053), not an open world [References §4.4.1] |
| Tycoon building, business development, economy | **Clashes with mode 1** (no money, centered on speech). Deferred as a mode 2 candidate. **DP-15**. Mode 1 has its own way of building **without economy**: founding with what is achieved by talking (§2.2.3, `02` §1.8, D-169) |
| Phases: Setup, Movement and Camera, Grid and Building, DOM Dialogues, Economic Loop | The roadmap uses Setup, Movement and Camera (alongside dialogue, D-020) and Dialogues; "Grid and Building" and "Economic Loop" move to mode 2. Mode 1's phases replace the economic loop with "Speech and potions loop" |

---

## 2. Mode 1, full specification: "RPG for good" (*Kestrel Valley*)

### 2.1 Summary of the mode

The player is an Argentine farm worker who arrives with the harvest crew in *Kestrel Valley*, a fictional English-speaking agricultural valley. At a crossroads of dirt roads (*the Crossing*) live about twelve families, almost all from the crew, with the neighboring field right up against the back of the houses; several times a season a crop-dusting plane goes by. It is not a village: it has no council or rules of its own. The player wants to **found a village** so that, by ordinance, the applications stay far from the houses and the school. He has no money: his power is **the gift of gab**. He travels the valley, meets the neighbors and the landowners (no villains: each has their reasons) and helps them with concrete requests (finding Maya's goat, getting seeds and a hose for the garden, agreeing with the pilot on a warning flag, persuading at the public hearing). Each request is resolved by **speaking** with NPCs in English; each conversation adds someone to **the network** and leaves something **founded** on the map. Lumi, a firefly that came with him in a jar, listens, helps if you ask, corrects little and reminds you what is worth reviewing. What you demonstrate you know is distilled into knowledge potions that open useful language skills; what you achieve by talking makes the village grow before your eyes. What is learned about farming is **real and verifiable** (`02` §1.5, D-170). Detail of the world and the cast: §3 and `02`.

### 2.2 Game loops (core loop)

#### 2.2.1 Minute by minute (inside a scene)

```
Escuchar al NPC (subtítulo opcional, velocidad elegida)
   → pensar (el silencio es tuyo; nada se apura)
   → hablar (o escribir)
   → el NPC reacciona en el mundo (gesto, objeto, información nueva)
   → si hubo un error que rompe el sentido o es el objetivo de la misión: Lumi da una señal breve para autocorregirte
   → repetir hasta lograr el objetivo de la escena
```

- **Length of a turn:** the NPC speaks in short phrases suited to the level (A0: 3-6 words; A1: 1 simple sentence; A2: 1-2 sentences; B1: 2-3 sentences).
- **Proportion of turns:** the design prioritizes the player's **production** turns over listening turns [Probable, research §2.5 / E6]. Scene-writing rule: the NPC never speaks two turns in a row without giving the player room to speak, except in the scripted opening.
- **Scaffolding resources always visible** (bottom bar): `Repetir`, `Más despacio`, `Pista`, `Terminé de hablar` / `Pasar el turno`, `Escribir en vez de hablar`, `Marcar para después` (ask Lumi to note something you want to review).

#### 2.2.2 Session (10 to 20 minutes)

```
Entrar → (opcional) Repaso de bolsillo de 60-90 s
   → elegir una misión del tablero del Cruce o hablar con un vecino con ícono de pedido (un bichito de luz)
   → misión (1 a 3 escenas cortas, 2-4 min de voz cada una)
   → cierre de misión: Lumi destila pociones (qué demostraste) + mini-repaso de evocación de 1-3 ítems
   → lo conseguido avanza una fundación en el mapa (idea → en marcha → fundado → crece) y, si sumaste a alguien, aparece un caminito de luz nuevo en la red
   → (opcional) otra misión
   → al terminar 2-4 misiones o ~20 min, Lumi sugiere un buen lugar para parar, sin culpa
```

- The session is designed to be **short and repeatable**. Multi-session games outperform the control and single-session ones do not [Probable, E23]; spacing improves retention [Proven, E34]. There is no evidence of an optimal duration in minutes [Hypothesis, research §2.6]; the 10-20 min are a design and cost decision [Business §3.2].
- **Saving:** automatic at the end of each scene and when closing the tab. No more than the scene in progress is ever lost.

#### 2.2.3 Meta (days and weeks)

```
Ayudar vecinos → demostrar competencias → pociones por rama
   → abrir habilidades (nuevas opciones de diálogo, NPCs que antes no hablaban con vos, lugares, tipos de misión)
   → ampliar la red (presentaciones: un vecino te presenta a otro) y fundar lo que, en la ficción del valle, el condado pide para reconocer un pueblo [FICCIÓN]: gente, un nombre, un lugar de reunión y servicios que funcionen entre todos
   → nuevas misiones más exigentes (siguiente nivel MCER)
   → lo que te costó reaparece días después en otras situaciones (repaso espaciado dentro de las misiones)
   → el condado reconoce el pueblo → concejo → ordenanza con zona de resguardo (anillo verde, sin metros) → Día del Pueblo (final del arco)
   → después del final: el pueblo sigue con pedidos diarios generados por plantillas (fuera de la v1)
```

- **Founding is not buying** (D-169, `02` §1.8): nothing is bought or sped up with potions; each foundation needs an idea from someone in the network, a site on the map (`SITIO-*`), something the player achieved by talking and people who lend a hand. No foundation is completed without a conversation with a goal.
- **The network** (D-168, `02` §1.7): some neighbors only open their scene if another introduces you ("Tell June: Nell sent you!"); key NPCs have two introduction paths so as not to block. The network is not a counter or a currency, it is not lost and it gives no potions by itself.
- **Why come back tomorrow:** a neighbor is left waiting for an answer ("Come back tomorrow, the pump will be fixed!"), a review item is ready, a newly opened skill enables a new mission. No reason is "losing the streak".
- **Reminders:** only if the player or the teacher turns them on, with no associated reward (DP-24).

### 2.3 Mission structure as tasks (TBLT)

#### 2.3.1 Principle

Each mission is a **task**: a non-linguistic outcome (a neighbor gets something) that requires using the language, with a dialogue the system guides toward a goal. Open free chat is not the best-supported form; goal-oriented, guided systems perform better [Probable, research §2.4 / E7, E29]. Mixing modalities (speaking + reading or writing) performed better [Probable, §2.4].

#### 2.3.2 The three phases of each mission

| Phase | What happens | Duration | Who drives it |
|---|---|---|---|
| **Pre-task** ("Lumi tells you") | Lumi presents the situation in L1 (or L2 depending on level, DP-03), shows 2-4 "useful pieces" (chunks) that could help, without forcing their use. In A0-A1 you can listen to each piece and repeat it under your breath (optional). | 20-40 s | Scripted |
| **Task** (scene or scenes with NPC) | Conversation with a goal. The NPC needs something; the player has to obtain or give information, ask, negotiate, explain. The NPC reacts in the world. | 2-4 min per scene, hard cap 5 min (§2.5.5) | AI with scene script |
| **Post-task** ("Lumi distills") | Outcome in the world (Clover returns to Maya, the garden is founded). Lumi names what you demonstrated (potions) and asks 1-3 retrieval questions about what was marked ("¿Cómo le pediste las semillas a June?") | 40-90 s | Scripted + scene data |

#### 2.3.3 Mission card (content as data)

Each mission is defined as a content record, not as code. A headless run creates missions by filling in this card. The concrete format (YAML, JSON, TS) is decided by the architecture review; the fields are design fields:

| Field | Description | Example (M1.2) |
|---|---|---|
| `id` | Stable | `M1.2` |
| `titulo` | In L1 for the menu | "La cabra de Maya" |
| `capitulo` | 0-4 | 1 |
| `mcer` | Target band | A1 |
| `can_do` | "I can..." statement in L1 | "Puedo describir un animal con color, tamaño y un detalle" |
| `resultado_mundo` | What changes if it goes well | Ollie finds Clover from your description; `SITIO-PARADA` → `fundado` (mail stop); Ollie gives you his map of mailboxes |
| `npcs` | IDs | `NPC-MAYA`, `NPC-OLLIE` |
| `escenas` | List of scenes with their script (§2.5.3) | 2 scenes |
| `lenguaje_objetivo` | Functions and pieces | colors, sizes, "What color is she?", "Is this your goat?", "She's small and white", "She has got a red bell" |
| `criterios_exito` | What has to happen in the conversation for the NPC to "understand" | The player conveys at least 2 traits of the goat and a confirmation question |
| `andamiaje` | Hints on 3 levels (§2.10) | P1: "Ollie wants to know: color?"; P2: two options; P3: model phrase |
| `pociones` | Branch and evidence | Amber (social) for a confirmation question; blue (describe) for traits |
| `items_repaso` | What enters the review bank if marked | "white", "She's small", "bell" |
| `reapariciones` | In which future missions use is forced | M1.6 (the flowers' colors), M2.6 (Clover in the barn) |
| `seguridad` | Permitted topic and forbidden topics | Animals, colors, the Crossing, the mail route. Forbidden: the player's personal data |
| `modo_texto` | Written equivalent | Identical, with keyboard input and suggested options |
| `duracion_objetivo` | Minutes of voice | 3 + 3 (2 scenes) |
| `saberes`, `red`, `fundacion` | The other three threads of the mission (schema in `02` §6.2.2) | `[SAB-PUPILAS]`; registration of `NPC-OLLIE` by `NPC-NELL`; `SITIO-PARADA` → `fundado` |

#### 2.3.4 Task types used in mode 1

| Task type (TBLT) | Example in the village | Language functions |
|---|---|---|
| Information gap | Maya knows what her goat looks like; Ollie saw three goats. The data has to be put together (M1.2) | Describing, asking, confirming |
| Transaction | Getting seeds, a hose and having Bea fix the pump for the garden (M1.4) | Quantities, asking, thanking, **no money or prices** (the player carries Nell's list; neighbors give, lend or gift, they do not sell) |
| Orientation | Guiding Ollie along the roads in the fog (M2.1) | Directions, places, prepositions |
| Problem solving | Explaining to June what is wrong with Clover, who is not eating (M3.3) | Simple animal problem, time, advice |
| Narration / reconstruction | Retelling Harlan's story of the plague year (M3.1) | Simple past, sequence |
| Decision making | Comparing airplane and drone with Caleb and Wes (M3.5) | Giving opinions, comparing, agreeing |
| Persuasion / negotiation | Presenting the ordinance at the public hearing and answering objections (M4.4) | Arguing, conditionals, politeness |
| Mediation (bridge) | Helping Ruth and Harlan agree on a shared fence (M4.3) | Rephrasing, summarizing, softening |

> **Note on "transaction without money":** in mode 1 nobody sells or charges. The valley runs on favors, loans and gifts. This respects inviolable rule 1 and keeps the practice of quantities and requests.

### 2.4 The floating companion: Lumi

> Name: **D-032** (*Lumi*, kept). Form: **firefly in a jar** (D-165, supersedes the paper lantern of D-032's default); biography, voice and templates in `02` §2. Functional reference: the character that floats over the runner in a racing game and appears when needed. No third-party intellectual property is used.

#### 2.4.1 Who it is

- **What it is:** a firefly from the protagonist's village, on the Argentine plains, that traveled with him hidden in a glass jar (D-165). It leaves the jar and flies at the player's shoulder height, slightly behind, with a slow sway; when not needed, it goes back into the jar. Its light is dimmer at first and grows as the player demonstrates competences (visual progress signal, §2.7). "Lumi's Jar" (notebook, §2.4.5) is, literally, that jar.
- **Personality:** curious, calm, a bit poetic, with gentle humor; it misses home and wants to find other lights. It admires the neighbors. It knows nothing of agronomy, chemistry or law: it learns with the player and sends him to ask whoever knows ("Preguntale a June"). It likes to ask "¿cómo se dice...?" as if it were learning too. **It is not a teacher who evaluates; it is a companion who knows a little more and looks after you.**
- **Who sees it (D-165):** the player always; Maya (9) sees it as a firefly that glows by day; adults neither see nor hear it. That is why it speaks Spanish (it comes from home) and **cannot speak for the player**: the neighbors do not hear it.
- **What it never does:** rush, sigh, say "wrong", compare with others, talk over an NPC, count time, insist twice in a row, speak in a childish tone to adults.
- **What it does:** name objects when you ask (a base skill like Influent's [References §4.1.1]), give you a brief signal so you self-correct, silently note what is worth reviewing, remind you at closing what you demonstrated, suggest stopping.

#### 2.4.2 How it looks and sounds

| Aspect | Specification |
|---|---|
| Model | 3D firefly built from code primitives (D-082 read with D-165's shape): small body of 2-3 volumes with an emissive abdomen and a soft halo, two wings as translucent planes, two simple "eyes" (two emissive rounded rectangles) that blink and change shape (happy, curious, attentive, thoughtful). The jar (glass cylinder with a lid) is in the player sprite's backpack and in the HUD |
| Animation | Slow figure-eight flight with sinusoidal sway (period 3-4 s); moves 20 cm closer when it speaks; dims its light when listening (does not distract); goes in and out of the jar |
| "Listening" state | Lumi turns toward the NPC, its eyes narrow, no sound |
| "Noted something" state | A minimal flash (no sound by default) and a dot that goes into its "jar". Configurable to invisible for those who get nervous |
| "Correction signal" state | It comes closer, a soft two-note tone, a text bubble with the signal (plus voice if enabled) |
| Voice | TTS in the player's L1 for explanations (neutral Rioplatense Spanish in v1, see DP-28), warm timbre, neither childish nor robotic, 0.9x speed by default. L2 voice when it models a phrase. Lumi's voice can be muted, leaving text only |
| Bubbles | Always in the DOM layer (HUD), at the top left of the character on screen or in a fixed panel depending on preference (accessibility: fixed position for screen readers) |

#### 2.4.3 When Lumi speaks

| Moment | Speaks | Example |
|---|---|---|
| Pre-task | Yes, briefly | "Esa nena busca algo. ¿Te acordás de la cabrita del canal? Piezas útiles: *Yes*, *the canal*." |
| During the scene, error that breaks meaning or is the mission's goal | Yes, a brief signal (prompt) | "Mmm... ¿*a* goat o *the* goat que viste vos?" |
| During the scene, error that does not block | **No.** It notes it silently | — |
| The player asks for `Pista` | Yes, according to hint level (§2.10) | "Probá con: *Is this your...?*" |
| The player asks to name an object (`Q` or right click on the object with Lumi active) | Yes | "*Plane*. Avioneta." (L2 + L1 audio) |
| Long silence with no request | **It does not speak.** It may show a visual chip "¿Querés una pista?" according to DP-05 | — |
| Post-task | Yes: distills potions and asks 1-3 retrieval questions | "Le preguntaste '*Is this your goat?*' Eso es ámbar. ¿Te acordás cómo dijiste que era chiquita?" |
| Suggested end of session | Yes, once | "Hoy la huerta quedó en marcha y June ya te conoce. Es un buen lugar para parar." |

**Density rule:** at most **one corrective intervention every 3 player turns** and never two in a row about the same error within a scene. If the error repeats, it is noted for review. The optimal dose of corrective feedback in AI dialogue is [Disputed] (Bibauw yes, Hou & Min do not find it as a moderator) [Research §2.1]; this density is a design default and a parameter of A/B experiment #1.

#### 2.4.4 The feedback modes

The player chooses in Settings (and can change at any time, even within a scene with a shortcut):

| Mode | During the scene | At closing | Status |
|---|---|---|---|
| **Accompanied (default)** | Immediate brief signal (prompt for self-correction) only on **global** errors (they break meaning) or **goal** errors (the structure the mission practices). If after the signal the player does not manage it, Lumi or the NPC rephrase (recast) and move on. The rest is noted silently. | Retrieval review of 1-3 marked items | Backed default: immediate is equal to or more effective than delayed [Probable, E32]; prompts beat recasts [Probable, E31]; retrieval review turns the delayed into spaced retrieval [Proven, E34] |
| **Note only (for later)** | Lumi never intervenes. Everything is noted. | Same retrieval review | Comfort option (anxiety). **Not presented as better for learning** [Research §2.1] |
| **More help** | Signals also on frequent (systematic) local errors, up to 1 every 2 turns | Same | For those who ask (adults who want precision). Equivalent to the "correction" mode of a previous voice prototype, softened |

**Error classification used by the observer** (inherited from a previous voice prototype): *global* (prevents understanding), *local* (the meaning stays clear), *systematic* (repeats), *slip* (isolated). Priority: global > mission goal > systematic > local > slip.

**Disfluency rule** (inherited as is from a previous voice prototype): repetitions, false starts, fillers ("uh", "like") and self-corrections **are not errors**. The observer reconstructs the intended sentence, evaluates only that one and, if it quotes it, quotes the clean version.

**Types of signal (prompts), from least to most explicit:**

1. *Clarification request* from the NPC within the fiction: "Sorry? A big goat or a small goat?" (the NPC does not really understand; prediction error, [Probable, E37]).
2. *Repetition with intonation* (Lumi): "¿*She go*...?"
3. *Metalinguistic clue* (Lumi, L1): "Ojo con *she*... ¿qué le pasa al verbo?"
4. *Elicitation* (Lumi): "Ella... *she g...*"
5. *Reformulation (recast)* as a last step, without asking for repetition: "*She goes*. ¡Eso!" and the scene goes on.

The scale goes up one step per failed attempt and resets at the next error. In A0 it starts at step 1 or 5 (self-correction is not demanded of something never seen); from A1 it starts at step 1.

**Pronunciation:** it is core from v1 (D-044, reverts DP-27) and has its own specification in §2.4.7. Within free conversation, the interruption rule of a previous voice prototype still holds: pronunciation **never interrupts**; if it breaks meaning, the NPC does not understand (step 1, clarification request within the fiction) and nothing more.

#### 2.4.5 "Marcar para después"

- The player can ask Lumi to note something: a button (`M`) during the scene or tapping a line of the NPC's subtitle. That item enters the review bank with high priority.
- Lumi also automatically marks the errors it did not signal.
- Everything marked is seen in **Lumi's Jar** (notebook), with the NPC's original phrase, the correct version and audio.

#### 2.4.6 What Lumi knows about the player

It uses the learner profile (§2.13) silently, like a previous voice prototype: it detects recurrences of known errors, prioritizes patterns at risk of fossilization, builds on what has already been seen. **It never mentions the profile** ("according to your history...").

#### 2.4.7 Pronunciation (core, D-044)

The game detects **how** the player said what they meant to say, not just what they meant to say, without pressure and without false alarms. Source: `research/pronunciacion-2026-10-06.md` (the references research); architecture: `03-architecture.md` §5.12.

**The three pieces:**

| Piece | What the player sees | How it is detected | When |
|---|---|---|---|
| **Scripted moments** | The NPC or Lumi proposes saying something specific: *repeat after me* (shadowing), *read aloud* (valley signs, letters, Nell's list), *key phrase* (the valley's name, *Kestrel Valley*, or the name of the village voted in M1.8) or *minimal pair with consequence* ("pedile a June *beans*, no *bins*": the world responds to what **sounded**). **Immediate and kind** feedback: the word colored, ≤ 1-2 sounds marked at a time, "así lo dijiste vos / así suena" (their clip and the model) and unlimited retry. The consequence is narrative ("¿cómo? no te escuché bien"), never a punishment | Scripted per-phoneme evaluation against the expected text (Azure Pronunciation Assessment; D-150) | Moments marked in the scene content (`pronunciacion` block), on lines that already exist in the script |
| **Background detection** | Nothing during the chat. At mission close, if applicable, "tu sonido de la semana": their own clip, the model and a drill | Free-decoding phoneme recognizer + Spanish confusion table (D-150), only with high confidence | In free chat. **It never interrupts.** An error enters the review only if it is **recurrent**: ≥ 3 high-confidence occurrences in ≥ 2 scenes |
| **Minimal-pair drills** | First **perception** (listen and choose between *ship* / *sheep*), then production | Perception: no detector (pre-generated audio). Production: detector only if the type is enabled | In spaced review (§2.9) and on request from the Jar |

**Non-negotiable rules:**
1. **An error type is shown only if it passed the F0.1 bar** (D-151): precision ≥ 0.90 and false alarms ≤ 3 % per word in scripted; ≥ 0.80 precision in review from free chat. Types that do not pass remain in perception and self-comparison, **with no automatic judgment**. The explicit diagnosis ("sonó /i/, va /ɪ/") only if the tool gets the realized sound right ≥ 70 % of the time; otherwise Lumi says "esa palabra no sonó del todo como *ship*, escuchá" and plays the two clips.
2. **It never interrupts** free chat. The only live consequence is that the NPC does not understand when meaning breaks (step 1 of §2.4.4).
3. **Tentative language and no numbers:** Lumi says "me pareció escuchar…", never "dijiste mal"; low confidence is not shown; there are no pronunciation scores, percentages or rankings.
4. **Lumi speaks through templates** (as in the whole game): a language model never judges phonemes or invents the feedback.
5. **Crossover with grammar:** *she work* can be agreement or an omitted final /s/. If the player produces final /s/ in other words (*cats*, *bus*, *it's*), it is grammar (goes to the grammar observer); if they omit it in all of them, it is pronunciation.
6. **Privacy:** the server never stores audio; the "así lo dijiste vos" clip is stored only on the player's device, at most 20, and is deleted when used or after 7 days (D-155); there is a button to delete them.
7. **Without a microphone**, pronunciation moments are skipped without penalty; perception drills remain available.

**The 14 error types that are measured (E1-E14, Spanish speaker with a Rioplatense focus):** tense/lax vowel /ɪ/→/i/ (*ship*→*sheep*); /æ/, /ʌ/, /ɑ/→/a/ (*cat*/*cut*); lack of reduction to /ə/; /v/→/b/; /θ/→/t/, /s/, /f/; /ð/→/d/; epenthesis before s+consonant (*eschool*); /z/→/s/; /ʃ/→/s/ and /tʃ/↔/ʃ/; sheísmo /j/, /dʒ/→[ʃ]; /h/→[x] or omitted; final consonant or reduced cluster and *-ed* as /ɪd/; misplaced lexical stress; lack of aspiration and trilled /r/. **High weight** (those that most affect comprehension): E1, E2, E12, E13. Detail and which tool sees each one: `research/pronunciacion-2026-10-06.md` §4.

**Evidence and progress (D-156):** in v1 there is no pronunciation `HAB-*` node. What is achieved (a sound going from "recurrent" to "resolved", a drill passed) is recorded in the learner model and seen on a **"Sonidos"** page of the Jar, with "puedo…" phrases and no numbers. Pronunciation gives no potions by itself (potions keep coming from each scene's evidence), except the 1/3 per attempt of the A0 prologue (M0.2).

### 2.5 NPC conversation system

#### 2.5.1 Principles

1. **Short scenes, context that resets.** Voice cost grows quadratically with the duration of a conversation because the context is re-billed per turn [Business §3.2]. That is why mode 1 is a string of 2-4 minute scenes with different NPCs, and between scenes a **summary** is saved, not the history.
2. **Scene script + AI.** Scripted opening and closing (pre-generated, cached TTS audio), open central part with AI within a frame (goal, topics, vocabulary, level).
3. **The NPC wants something.** Each scene has an NPC need and verifiable success criteria.
4. **The NPC does not interrupt.** The player's turn ends when the player decides (§2.6).
5. **World coherence.** The NPC knows only what its card and the world state tell it; it does not invent places, people or events outside the script.

#### 2.5.2 Conceptual architecture (the architecture review decides the technique)

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

- **Reuse of a previous voice prototype [Brief]:** Node.js proxy + WebSocket to Gemini Live (voice), text model for grammar, observer and debrief, disfluency rules, learner profile, Deepgram Aura TTS. What is new: scene scripts, NPC card, success criteria, events toward the game, moderation for minors, minutes budget.
- **~15 min server-side cap** in Gemini Live: stops being a problem because no scene reaches 5 min [Business §3.2].
- **Cascade alternative** (STT + text LLM + TTS) for text mode and as a cost plan B: ~US$0.025-0.03/min with fine control of pace and silences [Business §3.2]. **Experiment #1 of the business analysis (cost probe) decides which is the main route.** DP-36.

#### 2.5.3 Scene script (content format)

Each scene is written with these blocks. The run that writes new scenes must fill in all of them:

| Block | Content |
|---|---|
| `escena_id` | `M1.2-E1` |
| `npc` | `NPC-MAYA` |
| `lugar` | El Cruce, junto al corral |
| `situacion` (for the model) | "Maya (9) lost her goat Clover again. She is half laughing, half annoyed. She gives one feature at a time, only when the player asks." |
| `necesidad_npc` | That the player finds out what Clover looks like so as to look for her with Ollie |
| `apertura_guionada` | 1-2 lines in L2, with cached audio |
| `criterios_exito` | List verifiable by the observer (e.g.: "player asks about at least 2 attributes among color/size/bell"; "player restates the attributes to confirm") |
| `andamiaje_npc` | What the NPC does if the player gets stuck: rephrase the simpler question, offer two options, show with gestures |
| `vocabulario_nivel` | Word band allowed for the NPC (list + CEFR level) |
| `temas_permitidos` | Goats, colors, sizes, the Crossing, the canal |
| `temas_vedados` (besides the global list) | None extra |
| `cierre_guionado` | Closing line and world event |
| `salida_si_no_converge` | If at 4 min the criteria were not met: the NPC proposes the shortest path ("She's small and white, with a red bell! Go ask Ollie!") and the scene ends with a partial result, without punishment |
| `eventos` | `clover_features_known`, `maya_trust+1` |
| `resumen_para_siguiente` | What is saved for the next scene (2-3 lines) |

#### 2.5.4 NPC card (content format)

| Field | Example |
|---|---|
| `id` | `NPC-NELL` |
| `nombre` | Nell Ashby |
| `rol` | Retired teacher of the Crossing's closed school; network connector |
| `personalidad` | Warm, organizer, knows everyone who passed through her school |
| `forma_de_hablar` | Clear, unhurried, like a teacher; repeats the key words; asks about the player's mate (cultural bridge of M1.1) |
| `bandas_mcer` | A1-B1 |
| `voz` | Mature, warm female voice, unhurried pace (DP-20) |
| `sabe` | Who is who in the valley, the history of the school and the Crossing, where everything is |
| `no_sabe` | Agronomy, chemistry or health (defers to June, Ruth or Grace); gives no opinion on partisan politics, religion or adult topics |
| `relacion` | Trust values with the player (0-5), only to vary the greeting and unlock missions; never goes down |
| `memoria` | Short list of facts about the player (game name, missions done with them, a preference chosen in game) |

#### 2.5.5 Duration and budget of a scene

| Parameter | Default | Reason |
|---|---|---|
| Target duration | 2-4 min of voice | Cost [Business §3.2]; session pace |
| Hard cap | 5 min | The NPC closes gracefully ("I have to go water the garden! Thanks!") |
| Target player turns | 4-10 | Production > listening [Probable, E6] |
| Context | Resets per scene; NPC card + script + previous summary + minimal profile are injected | Cost |
| Voice budget | Minutes of voice per week according to the user's/institution's plan (DP-22). When exhausted, the same scene continues in text mode, without cutting | Accessibility and cost |

> **Potions are not voice minutes.** The business analysis suggested using the potion also as a currency of minutes [Business §3.3]. This GDD recommends **not** doing so: it would turn XP into payment for participating, which is exactly what undermines intrinsic motivation [Proven in the lab, E12]. The voice budget is shown separately, in plain language ("Te quedan 18 minutos de voz esta semana; el modo texto no tiene límite"). **DP-08.**

#### 2.5.6 Text mode (without microphone or by preference)

- Every scene has a written equivalent: the player writes; the NPC responds in text and, if the player wants, in audio too (TTS).
- In A0-A1 text mode offers **suggested options** (2-3 tappable answers) besides the free field; choosing an option is worth less evidence than producing it (lower-weight potions) but never blocks.
- Speaking and writing are different modalities; the evidence suggests that mixing modalities pays off [Probable] and that practicing in the same modality that is evaluated pays off more [Probable, E6]. That is why the game **invites** speaking (Lumi: "¿Querés probar decirlo en voz alta?") but never forces it.
- Text mode is also the unlimited free mode (DP-22) and the fallback mode if the network cannot sustain voice.

#### 2.5.7 Scripted vs generated lines

| Type | Use | Audio |
|---|---|---|
| Scripted | Openings, closings, story moments, level 3 hints, object names | Pre-generated, cached TTS (or human voice if there is budget, DP-21) |
| Generated | Body of the scene | Real-time voice |
| Template | Greetings by relationship and time of day, generic reactions | TTS cached per variant |

**Curated glossary:** every object name, translation and model phrase the interface shows comes from a human-reviewed glossary, not from the live AI. Wrong translations destroy trust (Terra Alia's second complaint) [References §4.2.2]. The AI generates conversation; it does not generate translations that are shown as truth.

### 2.6 Pace control: slower and silences that the player closes

#### 2.6.1 Slower

- **Three NPC speeds:** Natural, Slower, Very slow. Default by level: A0 = Very slow, A1 = Slower, A2+ = Natural. The player changes whenever they want (button and shortcut `S`).
- **What changes:** speech rate, pauses between phrases, phrase length. The technique (instruction to the model, playback adjustment without changing pitch, or TTS with a speed parameter) is decided by the architecture review. **DP-07.**
- **Evidence:** learners prefer slow speech, but in the only open experiment they did not comprehend more (n = 26) [Hypothesis for the effect on learning, E9]. It is kept for **comfort and low pressure** [Probable via chain E4 + E3], not as a learning lever.
- `Repetir` replays the NPC's last line exactly (session-cached audio), at no model cost.

#### 2.6.2 Silences that the player ends

**The silence belongs to the player.** When the NPC finishes speaking, the NPC waits. There is no visible timer, no "hello? are you there?".

- **How the player ends the turn (default, DP-06):** end-of-speech detection with a long threshold (2.5-4 s of silence, configurable) **plus** a `Terminé` button/key (Space or Enter) that closes the turn immediately. Accessibility option: *push to talk* (hold a key while speaking), useful in noisy classrooms.
- **What the silence button offers** (`Pasar el turno`, `Tab` key or click): a menu of 4 large options:
  1. *Pista* (Lumi gives a hint of the next level).
  2. *Repetir* (the NPC repeats).
  3. *Más simple* (the NPC rephrases with simpler words or gives two options).
  4. *Seguí vos* (the NPC continues the conversation without waiting for an answer, without penalty).
- **Design risk:** if the silence never closes by itself, the player may be left without a push to produce [Hypothesis, research §2.2]. Default mitigation: after **10 s** of silence a discreet visual chip "¿Querés una pista?" appears (no sound, no flashy animation, can be turned off). The NPC does not speak.
- **A/B experiment #3** (§6.3): silence button vs automatic scaffolding after X seconds. **DP-05.**
- **Evidence:** the silence button has no study at all [Hypothesis, E10]. It is a comfort feature and an experiment of our own.

### 2.7 Knowledge potions (XP) designed against overjustification

#### 2.7.1 Central rule

**The potion reports competence; it does not pay for participating.** Potions are distilled only when the player **demonstrates** something (used a structure to achieve something, self-corrected after a signal, retrieved a marked item days later). Never for completing a mission, for time played, for logging in every day or for choosing answers at random.

- Harm mechanism: expected rewards contingent on participating or completing undermine intrinsic motivation (d = −0.28 to −0.40), more so in children; informative competence feedback increases it (d = 0.33) [Proven in the lab, E12, E13, E14].
- Transfer to the XP of an L2 game is [Disputed] (E16): Mekler found no harm with points and levels in adults, but no improvement in quality either (only quantity) [Probable, E15]. That is why XP is not used to push volume; it is used to **say what you can already do**.
- A/B experiment #2 (§6.3) measures this in the game itself (informative XP vs XP for completing, measuring free choice).

#### 2.7.2 Branches and colors

| Branch | Color | What it demonstrates | Examples of evidence |
|---|---|---|---|
| **Bonding** (social) | Amber | Greeting, introducing oneself, thanking, asking about the other, courtesy | Used "Nice to meet you" on meeting an NPC; asked "How are you?" and responded to the answer |
| **Asking and offering** (transaction) | Green | Asking for things, quantities, offering help, accepting and refusing | "Can I have three packets of beans, please?" achieved the request |
| **Describing and locating** | Blue | Describing people, objects, places; directions | Described the goat with two traits; guided Ollie in the fog |
| **Telling** (narrating) | Violet | Past, sequences, plans | Told what happened with "first... then..." in the past |
| **Opining and persuading** | Coral red | Opining, comparing, arguing, negotiating, conditionals | Gave a reason with "because" and proposed an alternative |
| **Understanding** (comprehension) | Light blue | Following the NPC's instructions or information and acting in the world | Followed Ruth's directions to the traps without the route visible (D-076) |

#### 2.7.3 How a potion is earned

| Event | Potions | Notes |
|---|---|---|
| Successful use of a target structure to meet a success criterion | 1 of the branch | Detected by the observer |
| Self-correction after a Lumi signal | 1 of the branch + "bright drop" (visual self-correction mark) | Self-correction is the behavior we most want to reinforce with information [Probable, E31] |
| Correct retrieval of a marked item in a later mission (spaced review) | 1 of the branch + the item goes up a level in the bank | [Proven, E34] |
| Choosing a suggested option (text mode A0-A1) | 1/3 of a potion | Acknowledges the step without equating it to producing |
| Completing a mission | **0** | Completing does not pay. The outcome in the world is the narrative reward |
| Entering the game, consecutive days | **0** | Inviolable rule 2 |

**The distilling moment** (post-task) is **informative feedback**: Lumi names the concrete behavior ("Le pediste la manguera a Bea con *could you*; eso es pedir con cortesía") and the potion falls into the jar of its color. There is no slot-machine sound, no confetti, no big numbers. The sound is a soft "gluc" and a note.

#### 2.7.4 What is done with potions

- Potions accumulate by branch and are **never lost or fully spent**. Opening a skill in the tree asks to "pour" potions of certain colors: they remain visible inside the opened node (like a jar that filled with light). The metaphor is investing what you know in what you want to be able to do, not paying. **DP-09.**
- Lumi's glow reflects the total evidence; what is founded and the network (firefly trails) show on the map what was achieved by talking (visible progress, which accompanies adaptation [Probable, E36]).
- **There is no shop.** There are no cosmetic items purchasable with potions in mode 1. Cosmetics (avatar clothing, decoration) are earned as narrative gifts from neighbors on resolving missions, without being announced beforehand (unexpected gifts do not produce the undermining effect of expected ones [Proven in the lab, E12, which is limited to expected rewards]).

### 2.8 Skill tree

#### 2.8.1 Principles

- Skills are **linguistic and useful in the next mission**: new dialogue options, NPCs who previously did not talk to you, places, mission types [Probable, research §2.3 / E18].
- **No skill is an accessibility skill.** Speed, subtitles, text mode, hints: always available (inviolable rule 3).
- Opening a skill requires (a) potions of the branch and (b) having demonstrated the specific competence at least once (observer event). This avoids "buying" skills without the competence.
- The player **chooses** what to open when they have options (autonomy [Probable, E18]).

#### 2.8.2 v1 tree (complete examples)

| ID | Skill | Branch | Requires | What it enables in the game |
|---|---|---|---|---|
| `HAB-BASE-NOMBRAR` | Asking Lumi "¿cómo se dice?" | — | Start | Inspect objects and hear their name (Influent style) |
| `HAB-VINC-1` | Introducing myself | Amber 2 | M0.2 | Neighbors greet you by your game name; greetings appear on the board |
| `HAB-VINC-2` | Sidewalk chat (small talk) | Amber 5 | Asked "How are you?" in 2 scenes | 3 shy or busy NPCs who only greeted (Harlan, Grace and Vance, `02` §3.5) now converse; short chat missions with a goal (P-R1.1, P-R1.2) |
| `HAB-VINC-3` | Speaking at a distance (radio, phone) | Amber 8 + Light blue 4 | Ch. 2 (M2.2) | The Crossing Radio: talking with Nell and Bea by radio and remote missions without visual support |
| `HAB-PEDIR-1` | Asking politely | Green 3 | Used "please" + "can I" | Polite dialogue options; Wes agrees to listen to your request for a favor (requirement of M1.5) |
| `HAB-PEDIR-2` | Quantities and lists | Green 6 | M1.4 | Crossing board with lists; requests for materials for the foundations (lent or gifted, never bought) |
| `HAB-PEDIR-3` | Offering and negotiating favors | Green 10 + Coral 3 | Ch. 3 | Exchanges between neighbors (barter of favors, no money) |
| `HAB-DESC-1` | Describing things | Blue 3 | M1.2 | "Lost objects" missions on the board |
| `HAB-DESC-2` | Giving and following directions | Blue 6 + Light blue 3 | M2.1 | Ollie takes you in the mail truck (fast travel between zones by talking with Ollie) |
| `HAB-DESC-3` | Describing people | Blue 9 | M2.4 | "Who's who?" missions at the Saturday fair; recognizing new neighbors |
| `HAB-CONT-1` | Telling what happened (simple past) | Violet 3 | M3.1 | Harlan tells the story of the plague year and asks you to tell it to others; the Crossing Radio opens its "stories corner" |
| `HAB-CONT-2` | Making plans (going to / will) | Violet 6 | M3.4 | Planning the little clinic and the weather station with the neighbors |
| `HAB-OPIN-1` | Opining and giving reasons | Coral 3 | M3.5 | Caleb and Wes consult you between airplane and drone; dialogue options with "I think... because..." |
| `HAB-OPIN-2` | Persuading (conditionals, proposals) | Coral 7 | M4.2 | Unlocks the public hearing (M4.4) |
| `HAB-OPIN-3` | Mediating between neighbors | Coral 9 + Amber 10 | M4.3 | Mediation missions: two disagreeing NPCs |
| `HAB-ENT-1` | Crew's ear | Light blue 5 | — | NPCs with different accents (A2+) appear with missions (exposure to variants; the crew comes from many places) |
| `HAB-ENT-2` | Reading signs | Light blue 3 + Blue 3 | — | The valley's signs become interactive and give hints or hidden missions (modality mixing [Probable]) |

### 2.9 Spaced review inside missions

- **Review bank:** each marked item (by Lumi or by the player) has: correct form, source context, branch, mastery level (0-5) and next date.
- **Default intervals:** 1, 3, 7, 14 and 30 days (**see ADR-020 / D-088: the implementation uses the Leitner boxes `[0, 1, 3, 7, 14, 30]` days, where box 0 is due the same day, `03-architecture.md` §3.5.4; the register wins**); goes up a level with correct retrieval in production, goes down one with an error (no visible punishment; it just returns sooner). Concrete algorithm: decided by the architecture review (Leitner or simplified SM-2). Spacing and retrieval improve retention [Proven, E34].
- **Where the item reappears:**
  1. **Inside new missions** (the main one): the scene generator receives "due items" and the NPC creates a situation that asks for them in a new context. E.g.: "white" marked in M1.2 → in M1.6 Caleb asks "What color are the flowers Maya likes?". The player has to **produce** it, not recognize it [Proven for spacing and retrieval].
  2. **Lumi's retrieval questions** at mission close ("¿Cómo dirías...?").
  3. Optional **pocket review** of 60-90 s on entry: 3-5 isolated words with image and audio, oral or written production. Sleep consolidates isolated vocabulary but not contextual [Proven, conditional, E35]; that is why isolated-word review complements use in context.
  4. **Search game** (optional, Influent "Time Attack" style but **without a clock**): Lumi says a word and the player finds the object in the scene [References §4.1.4].
- **Prediction error:** facing a meaning error, the NPC may react in an unexpected but kind way (brings an apple instead of a pear), which can help [Probable in L2, E37]. Never humiliating, never with the NPC laughing at the player.

### 2.10 Adaptive difficulty

- **What adapts:** the **NPC's scaffolding**, not the mission content: speech rate, phrase length, vocabulary band, number of options offered, initial hint level, proportion of Lumi's L1, hint-chip threshold [Probable, research §2.7].
- **Signals it uses** (sliding window of the last 3 scenes): rate of success criteria reached without hints, requests to repeat/slower, self-correction rate after a signal, response latency (without penalizing, only as a signal), number of turns to meet the goal.
- **Scaffolding levels (1 to 5):**

| Level | NPC | Lumi | Hints |
|---|---|---|---|
| 1 (maximum support) | Very slow, 3-6 words, gestures, repeats key | L1, signal from recast | Options visible from the start |
| 2 | Slow, 1 simple sentence | L1 | Hint chip at 8 s |
| 3 | Slow/natural, 1-2 sentences | L1 with model phrases in L2 | Chip at 10 s |
| 4 | Natural, 2 sentences, some new word | L1/L2 mix | Chip at 15 s |
| 5 (minimum support) | Natural, 2-3 sentences, simple idioms | L2 except explanations | Only on request |

- **Change rule:** goes up one level if in 3 scenes in a row the player met the criteria without hints and with ≤1 signal; goes down one level if in 2 scenes in a row they asked for 3+ hints or did not converge. The player sees "Lumi ajustó la ayuda" in the notebook, never "bajaste de nivel".
- **Accompanied by visible progress:** adaptation without a motivational component did not improve learning in the corpus's only RCT (non-linguistic task) [Probable, E36]; that is why adaptation always goes together with the distilling of potions and with what is founded and the network visible on the map.
- **Player control:** in Settings they can fix the help level (disables automatic adaptation).

### 2.11 CEFR map (A0 to B1 in v1)

| Band | Chapter | "I can..." (can-do, summary) | Functions and structures | Vocabulary (approx. cumulative) |
|---|---|---|---|---|
| **A0 (pre-A1)** | Prologue | Greet, say my game name, understand yes/no, name nearby objects | Hello/Hi, I'm..., yes/no, please/thank you, this/that, basic colors | 60-100 |
| **A1** | Chapter 1 | Introduce myself, describe things with color and size, ask for simple things, ask where something is, say what I like | to be, have got/have, can (request), there is/are, simple wh- questions, numbers 1-20, like | 300-400 |
| **A1→A2** | Chapter 2 | Give and follow directions, buy/ask for quantities, describe people, talk about routines, phone | simple and continuous present, prepositions of place, some/any, how much/many, could you, imperatives | 600-800 |
| **A2** | Chapter 3 | Tell something that happened, give simple advice, compare, make plans | simple past (regular and frequent irregulars), comparatives, should, going to, first/then/after that | 1,000-1,200 |
| **A2→B1** | Chapter 4 | Give opinions with reasons, propose and persuade, explain a problem, mediate | I think/because, if + present (1st conditional), would like, could we..., what about...?, rephrasing | 1,500-1,800 |

- For the underage player **only the "puedo..."** are shown, not the CEFR labels; for adults and teachers both are shown (DP-33).
- The fine correspondence mission → official CEFR descriptors is left for content design (roadmap task). Aligning with BNCC (Brazil) and Argentine curricular designs is a later B2B task.

### 2.12 Initial placement

- No entrance exam (it generates anxiety and early dropout). Default **DP-25**: the player self-declares their level with 4 options in L1 ("Nunca estudié inglés" / "Sé algunas palabras" / "Me defiendo con frases simples" / "Puedo charlar pero me trabo") and the first scene of the prologue adjusts the scaffolding with the signals of §2.10.
- Whoever declares "Puedo charlar" still plays the prologue (it is short) and can skip chapter 1 after finishing the prologue if Lumi detected level 4+ performance ("¿Querés ir directo al capítulo 2? Nell igual te va a extrañar"). Skipped missions remain available.

### 2.13 Learner profile

| Data | What for | Who sees it | Retention (default, DP-13) |
|---|---|---|---|
| Game name (not real), avatar | So NPCs name you | Player, teacher (if from a class) | Life of the account |
| Language pair, declared level, current scaffolding level | Adaptation | Player, teacher | Life of the account |
| Accessibility preferences | Applying them | Player | Life of the account |
| Demonstrated can-dos and potions by branch | Progress | Player, teacher, guardian | Life of the account |
| Review bank (items, level, dates) | Spaced review | Player | Life of the account |
| Error patterns (type, frequency, systematic) | Lumi and adaptation (silent use, like a previous voice prototype) | Player (in the notebook, in kind language); teacher in aggregate | Life of the account |
| Scene transcripts | Observer and review | Player (their own, 30 days) | 30 days, then deleted; only extracted items remain |
| Raw audio | — | — | **Not stored** (default). Processed in real time and discarded |
| Age or age band | Safety and consent rules | System, guardian, institution | Life of the account |

- **Data minimization:** no real name, minors' email, location, photo or contacts are requested. Minors' accounts are created via an institution (class code) or guardian.
- **Export and delete:** the adult player or the guardian can export progress and delete the account from Settings.

### 2.14 Onboarding: the first 10 minutes, step by step

> Goal of the 10 minutes: that the player **says something in English to someone and achieves something in the world** before minute 5, knows that the silence is theirs and ends the session wanting more, not tired.

| Time | Screen / scene | What the player does | What the game does | Design notes |
|---|---|---|---|---|
| 0:00-0:20 | Loading | Nothing | Loading screen with a jar filling with light ("Despertando al bicho de luz…"); detects GPU/memory and picks graphics quality (low/medium/high). Preloads only Los Campos (`muelle` diorama, D-180) | Goal: interactive in < 15 s on the target PC (kill criterion of business analysis #5) |
| 0:20-1:00 | Welcome (DOM, no 3D) | Chooses interface language (default Spanish), age band (if not coming from an institution) | If a minor without class code or guardian: guardian flow (§2.17). If coming with class code: goes straight in | No long forms |
| 1:00-1:40 | Entry accessibility | Chooses: font size (3 options with preview), subtitles yes/no (default yes), "¿Tenés micrófono?" with a 3 s test | If there is no microphone or they refuse: text mode, without guilt ("Podés jugar todo escribiendo; si un día querés hablar, está en Ajustes"). The test audio is not stored | Everything changeable later |
| 1:40-2:10 | Declared level and avatar | Chooses 1 of 4 level phrases; builds the avatar (body, skin, hair, clothes, 4-6 options each; free, D-167) and chooses game name (**curated list** that excludes the cast's names, see D-074; the register wins) | Sets initial scaffolding | Game name: for minors, only from a list of suggestions (avoids real names) |
| 2:10-2:40 | The harvest bus arrives (HD-2D map scene) and the jar | Watches | The camera, from above, shows the cornfields at dawn, the dull, dusty valley and a plane far away. Kofi: "Kestrel Valley! Last stop!". Brief shot of a little white goat with a red bell by the canal (seeds M0.3). In the lodge, the player leaves the backpack on the bunk; the jar peeks out with a dim light and, on the pillow, the seed envelope `SOBRE-0`. Lumi leaves the jar | No long text. Music enters softly |
| 2:40-3:20 | Lumi introduces itself (L1) and the envelope | Listens; learns 2 buttons: `Terminé` and `Pasar el turno`; chooses who reads the envelope's note | Lumi: "¡Hola! Perdón, me quedé dormido en el frasco. Soy Lumi. Vine con vos desde casa. Acá todos hablan inglés; yo te ayudo, pero no puedo hablar por vos: no me escuchan." No-pressure contract (the silence is yours; *Terminé*; *Pasar el turno*). The envelope: "*Plant me where people meet.*" The Jar's "Misterios" page is created, without announcing it | Teaches the no-pressure contract before the first interaction. Verbatim lines in `02` §5 |
| 3:20-4:40 | **M0.1 "Hola, Inés"**: the crew foreman | Says "Hello" and their game name ("I'm ...") | Inés (very slow): "Hello! Welcome to Kestrel Valley. I'm Inés. And you?" The observer accepts any greeting + name. If stuck: Inés offers "I'm... ?" with a gesture. Close: she gives the key to the bunk and a map ("Maya lives at the Crossing"). Lumi distills the first amber potion | **First production before minute 5** |
| 4:40-5:40 | Walking through Los Campos | Learns to move (click on the ground or WASD); the camera settles by itself | Contextual tutorial in the DOM layer (2 lines). Dirt path to the crew's shed | No dexterity tests |
| 5:40-6:40 | **M0.2 "¿Cómo se dice?"**: naming 3 objects | Asks Lumi for the name of 3 objects (the distant plane, the corn, a firefly) and repeats them aloud if they want; Kofi joins | Lumi names in L2 + L1 (*plane*, *corn*, *firefly*), with cached audio. Repeating aloud gives 1/3 light-blue potion (if they say it); no pressure if not | Copies Influent's most praised feature [References §4.1.1] |
| 6:40-9:00 | **M0.3 "Clover"** (first favor): Maya, at the Crossing, looks for her goat, which the player saw by the canal on arrival | Answers "Did you see my goat?" with "Yes" + "the canal" (points with a click if needed) | Maya (very slow) sees Lumi ("A firefly! In the day?") and asks yes/no and where. If the player gets stuck, Maya offers two options. Maya returns with Clover and introduces you to Nell | First outcome in the world achieved with language. Precursor of M1.2 |
| 9:00-9:40 | Distill | Watches | Lumi: "Le dijiste dónde estaba Clover: *the canal*. Eso es azul: ubicar cosas." Blue potion falls. Retrieval question: "¿Te acordás cómo se decía *maíz*?" (oral or written answer, any answer is welcome; if it does not come out, Lumi says it and marks it for tomorrow) | Informative feedback + first retrieval |
| 9:40-10:00 | The first firefly | Chooses: continue or stop | Dusk; Maya and Clover walk toward the Crossing; in the big tree a firefly lights up. Lumi: "Mirá: un bicho de luz en el Cruce. Mañana Maya te presenta a Nell. ¿Seguimos un poco o lo dejamos acá?" | Suggested end of session without guilt; narrative hook, not a reward for coming back. Both buttons with the same visual weight |

> The verbatim lines, branches and template ids (`LUMI-ONB-*`, `LUMI-SOBRE0-*`) are in `02` §5; for the **wording**, `02` > `01`. The times and goals in this table are the ones that count for building and verifying (F9).

### 2.15 Session duration (goals)

| Unit | Goal | Cap | Source/reason |
|---|---|---|---|
| Voice scene | 2-4 min | 5 min | Cost [Business §3.2] |
| Mission | 4-8 min (1-3 scenes + pre and post) | 12 min | Design |
| Session | 10-20 min (2-4 missions) | No hard cap; break suggestion at ~20 min and then every 15 min | Many short sessions [Probable, E23]; optimal minutes [Hypothesis] |
| Target frequency | 3-5 sessions per week | — | Spacing [Proven, E34] |
| Full arc of mode 1 (v1) | 25-40 h of play in 3-5 months | — | Avoids the "little content" of Influent and Terra Alia [References §4.2.6] |

### 2.16 Failure states (none punitive)

| Situation | What happens | What does **not** happen |
|---|---|---|
| The player does not meet the success criteria in the scene | At 4 min the NPC offers the short path ("Can you show me?") and the mission ends with a partial result: the world advances anyway; the mission is marked "se puede mejorar" with an optional empty sprout to repeat | Nothing is lost; there is no "failed mission" |
| Error that breaks meaning | The NPC does not understand within the fiction and reacts (kind prediction error); Lumi gives a signal | No error sound, no lives |
| The player stays silent a long time | Nothing. Optional visual chip (DP-05) | The NPC does not pressure or leave |
| The player says something off-topic | The NPC kindly steers back within the fiction ("Ha! Maybe later. Now, about Clover...") | No reprimand |
| The player says something inappropriate | The NPC does not repeat it, changes the subject; if it repeats, Lumi recalls the valley's rules in L1, once. Safety event for the institution if applicable (§2.17) | No public humiliation |
| The connection drops or the voice runs out | The scene continues in text mode from the last turn | The scene is not lost |
| The player abandons mid-mission | Resumes from the start of the scene in progress | — |
| The player does not play for days or weeks | Lumi receives them with joy and a summary ("Nell preguntó por vos"). Due items are prioritized without accumulating visible "debt" | No lost streak, no guilt-tripping "we missed you" |

### 2.17 Safety for minors and moderation

> This describes design requirements. **It is not legal advice.** Concrete compliance (Argentina: Law 25.326 on personal data; Brazil: ECA Digital, Lei 15.211/2025, in force since 2026-03-17, and LGPD; US: COPPA if entered) requires legal review before the first pilot with minors [Brief; business analysis §6.5].

#### 2.17.1 Conversations with NPCs

1. **Closed frame per scene:** each scene has permitted topics; there is a **global list of forbidden topics** (graphic violence, sexuality, drugs, self-harm, hatred, partisan politics, religion as debate, personal data, contact outside the game, purchases, dating/romance). The model receives that list in the system prompt and the output is also filtered.
2. **Double moderation:** (a) input: the player's transcript goes through a classifier before reaching the NPC; (b) output: the NPC's response is classified before being shown/played (in real-time voice, the architecture review must resolve how to filter without excessive latency: e.g. classify the text in parallel and cut audio if triggered). DP-37.
3. **No free chat without a frame in v1** (DP-30). Not even for adults.
4. **The NPC never asks for personal data** (real name, school, address, age, photos, social networks) and if the player gives them, the NPC does not repeat or store them; the observer removes them from the summary.
5. **Containment responses:** if a player expresses something that suggests risk (self-harm, abuse), the NPC steps out of the fiction with a scripted, kind line that suggests talking to a trusted adult, and a local help resource is shown (list curated by country). Safety event recorded according to the institution's/guardian's policy. Content and protocol: specialist review (DP-38).
6. **Characters:** adult NPCs never have an intimate relationship with the player; minor NPCs (currently Maya, 9, and Noor, 16; marked by the card's `es_menor: true` field, `02` §6.2.1, not by name) appear only in everyday situations and public places.

#### 2.17.2 Accounts and roles

| Role | What they can do | What they cannot do |
|---|---|---|
| Minor player | Play, adjust accessibility, see their notebook | Create an account on their own (requires class code or guardian); chat between players (does not exist in v1) |
| Adult player | All of the above; own account; export/delete | — |
| Guardian | Give consent, see the minor's progress, see what data is stored, delete the account, limit voice minutes or force text mode | Listen to audio (not stored) |
| Teacher | Create classes and codes, assign missions, see can-do reports, see safety alerts according to the institution's policy | See minors' raw transcripts (default; DP-29) |
| Institutional administrator | Manage teachers, licenses and the institution's voice budget | — |

- **Age gate** (DP-12): launch default: direct accounts only 18+; minors enter through an institution (class code) or by invitation from a guardian with verifiable consent. Compliance is designed from day one because a colorful game with a companion is "likely to be accessed" by minors even if it targets adults [Business §6.5].

### 2.18 Institutional (B2B) features, at concept level

| Feature | Description | Priority |
|---|---|---|
| Classes and class codes | The teacher creates a class, gets a short code; students enter without email | v1 pilot |
| Roster | Student registration by list (CSV) with generated game names | v1 pilot |
| Assign missions | The teacher marks missions or chapters as "for this week" (not mandatory inside the game; they appear highlighted on the board) | v1 pilot |
| Progress report by can-do | Per student and per class: demonstrated can-dos, potions by branch, speaking minutes, self-corrections, the class's hardest items | v1 pilot |
| Voice budget per institution | Pool of voice minutes the institution distributes; text mode does not consume | v1 pilot |
| Safety alerts | According to the policy agreed with the institution | v1 pilot |
| Classroom mode | Push to talk by default, headphone suggestion, controlled NPC volume | v1 pilot |
| Export reports | CSV/PDF | Later |
| LMS integrations (Google Classroom, Moodle) | — | Later |
| Curricular alignment (BNCC, Argentine jurisdictional curricula, CEFR) | Missions → curricular contents map | Later |
| Mission creation by teachers | Bridge to mode 2 | Year 2 |

**Benchmark:** Noun Town already sells to institutions with teacher tools [References §3]; the institutional v1 has to match the basics (classes, licenses, reports) and differentiate itself in speech reports and privacy control.

### 2.19 Accessibility features

| Area | Feature | Default |
|---|---|---|
| Reading | NPC subtitles in L2 (always) and L1 translation on demand (tap the line) | Subtitles yes; translation on demand |
| Reading | Text size in 4 steps (100-200%), legible sans-serif font, dyslexia font option, adjustable line spacing | 125% |
| Reading | Word-by-word highlighting synchronized with the audio (karaoke) | Off at A2+, on at A0-A1 |
| Audio | Separate volumes (NPC, Lumi, music, ambience, effects); Lumi's voice can be turned off | — |
| Pace | Three NPC speeds; `Repetir`; unlimited silence; pass-turn button | §2.6 |
| Input | Full text mode; push to talk; configurable end-of-speech threshold; suggested options | — |
| Vision | Color-blindness modes (protanopia, deuteranopia, tritanopia) — the potion branches have a **shape** besides color (amber = circle, green = leaf, blue = drop, violet = star, coral = triangle, light blue = wave); high contrast in the HUD | — |
| Vision | Screen-reader compatible across the whole DOM HUD (menus, dialogues, notebook) | — |
| Motor | Playable with mouse only (click to move and choose) or keyboard only (tabbing through interactive objects); no simultaneous key combinations; no time-limited actions; remappable keys | — |
| Cognitive | Current goal always visible in one line; "what was I doing?" summary on return; no audio-only information | — |
| Motion | No abrupt camera movements; option to reduce animation; no flicker | — |
| Performance | Low graphics mode (no shadows, DPR 1, reduced internal resolution, short draw distance, no post-processing); "dialogue only" mode (static 2D with NPC illustration) for PCs that cannot run the 3D | Auto-detection |
| Network | Text mode as an automatic fallback if latency or bandwidth cannot sustain voice | — |
| Neurodiversity | No open quantitative evidence (dyslexia, ADHD) [Research §5.5]: good practices (fonts, pace, clear goals) are applied and it is marked as an open question | — |

**Rules:** none of these features is unlocked by progress or payment. The low graphics mode is an exit requirement of any milestone, not a later improvement [References §4.4.5].

### 2.20 Persistence and resumption

- Automatic saving on the server (account) with a local copy for partial offline mode (the 3D part and the notebook work without network; NPC scenes need network).
- On return: "¿Qué estaba haciendo?" in one line + neighbor who is waiting.

---

## 3. Mode 1 script (Kestrel Valley)

> Everything in this section is proposed fiction content, aligned with the brief's premise (section "Guion v2 + modo director", 2026-10-06), which supersedes the *Lantern Bay* one. The full detail (cards, prompts, the 11 scripted missions, onboarding, templates) is in `02-narrative-script.md` v0.2; for the **wording** of the content, `02` > `01` (`00` §0.3). Place and character names are fictional and do not refer to real people (D-164, D-166). The mission ids `M0.x`…`M4.x` are kept; their content changes.

### 3.1 Premise

*Kestrel Valley* is a fictional English-speaking agricultural valley: fields of corn, wheat and soy, an apple orchard, a small diversified farm, an irrigation canal and a grass airstrip from which a crop-dusting plane takes off. In the middle of the valley, at a crossroads of dirt roads (*the Crossing*), live about twelve families, almost all rural workers, next to an enormous tree, a closed one-room school and an empty lot. It is not a village: it has no council or rules of its own, and the neighboring field reaches the back of the houses.

The player is **an Argentine farm worker** who arrives with the harvest crew. In their hometown they saw neighbors achieve, by talking, an ordinance that keeps spraying away from the houses and the school. Here they recognize the situation and set themselves something big with the only thing they have: **the gift of gab**. For an ordinance to set a buffer zone, a council is needed; for a council, a village; and for a village (in the valley's fiction, D-171) you need **people, a name, a meeting place and services that work among everyone**. They have no money or degrees: they persuade, introduce people, get things and **found** things, and each founded thing appears built on the HD-2D map. It is building without an economy (the tycoon with money belongs to mode 2, D-018).

**Lumi** traveled with them, a firefly from their village who lived in a glass jar (D-165). Lumi speaks Spanish because it comes from home; the valley's adults cannot hear it, so it cannot speak for the player.

**Theme:** talking builds. Each conversation gets something, adds someone to the network and leaves something founded. Language is not an exam: it is the tool with which a village is put together.

**Tone:** warm, curious, everyday, with gentle humor. **No villains:** each landowner has their reasons (Caleb changes fast; Ruth needs data and trust; Harlan may never change, but he keeps his word and is generous); the pilot, Wes, is a person who loves flying and watches the wind; the county official, Vance, is prudent and fair. The topic is serious, the tone is not fearful: health is handled with simple prevention facts, nothing graphic (D-176). What the game teaches about farming is **real and verifiable** and is marked `[FUENTE-PENDIENTE]` until a person checks it (D-170); the protagonist is not an expert: the neighbors teach them. Tonal inspiration: the warmth of *A Short Hike*, not the epic or the pamphlet.

### 3.2 The world: map and zones

```
                         [Monte de Ruth]  (norte; cap. 1 escena, cap. 3)
                     manzanos · tanque · portón · tractor viejo
                                  |
 [Los Campos] —— Crossing Road —— [El Cruce] —— campo de Caleb (este)
 albergue · granero de Harlan     árbol y tablero · lote/huerta      |
 canal · tanque · empaque         escuela · casa de Nell · taller    |
 pista y hangar de Wes            de Bea · casa de Inés y Maya        |
                                  buzones · (Larkford → oeste, condado)
                                  |
                         [Granja de June]  (sur, pasando el canal; escena)
```

| Zone | Diorama (`04` F3) | Chapter | Interactive places | Band |
|---|---|---|---|---|
| **Los Campos** (*the Fields*) | id `muelle` (same budget, D-180) | Prologue + ch. 1 (scenes) + ch. 3 | Crew lodge, Inés's table, Harlan's barn and house, canal, tank, packing shed, Wes's airstrip and hangar | A0, A1→A2 |
| **El Cruce** (*the Crossing*) | id `plaza` (D-180) | Ch. 1 (+ the whole arc) | Tree and board, lot (garden), school, Nell's house, Bea's workshop, Inés and Maya's house, mailboxes, edge with Caleb's field | A1 |
| **Ruth's orchard and June's farm** | Scenes in Region 1; own diorama in ch. 3 | Chs. 1 and 3 | Apple trees, traps, beehives, garden beds, goats | A1, A2 |
| **The whole valley** (road to Larkford) | Ch. 4 | Ch. 4 | School/council, green ring, airstrip | A2→B1 |

- **Scale:** each zone is walked in 1-2 minutes; each diorama loads separately (§5.4). It is not an open world [References §4.4.1].
- **Time of day and weather:** simple cycle of 4 moments (morning, afternoon, dusk, night) per session or per progress. Wind and fog as scripted states (M2.1 fog, M4.2 wind).
- **The Crossing gets founded:** what the player achieves by talking appears built at fixed sites on the map (`SITIO-*`: board, mail stop, garden, windsock and flag, flower fence, traps, Crossing Table, sign; later radio, school, seed bank, clinic, weather station, council and the green ring of the buffer zone). Visible states: idea → underway → founded → grows. In addition, each link of the network is seen at dusk as a little trail of fireflies. It is the main visible-progress feedback.
- **Signs in English** throughout the valley (*Bunkhouse*, *Garage – Open*, *Mail stop*, *Sprayed field – Keep out until Thursday*); with `HAB-ENT-2` they become interactive.

### 3.3 Characters

#### 3.3.1 Player

- Argentine farm worker in the fiction (D-167); customizable avatar (body, skin tone, hair, clothes), game name and optional pronouns (he/she/they). No mandatory gender.
- **Has no recorded voice of their own** and no imposed lines: what they say is what the player says.
- Carries a backpack, their **mate** (cultural bridge of M1.1), a notebook and **Lumi's jar**, which is also the player's notebook (potions, network, knowledge items, mysteries).
- Is an expert in communicating and building networks, not in agronomy or law: the technical part is taught by the neighbors.

#### 3.3.2 Lumi (companion)

See §2.4 and `02` §2. Firefly from the protagonist's village, who traveled in a jar (D-165). Maya, the girl, sees it; the adults do not. Own arc: starts dim and homesick, becomes brighter and jokier, and on closing Region 1 sees **other little lights** over the new fence and says its first whole sentence in English: "*I see… other lights.*" (D-185). Arc closing: "No era el único. Donde la gente se habla, hay luz."

#### 3.3.3 Neighbors of Region 1 (14 NPCs, D-166)

| ID | Name | Role / place | Age | Stance / personality | Way of speaking | Bands | What they need (arc) |
|---|---|---|---|---|---|---|---|
| `NPC-INES` | Inés Calder | Crew foreman, Los Campos | 50s | Calm, patient, organized | Very clear, slow, gestures; one "¡Hola!" in Spanish once per chapter (D-184) | A0-A2 | That the crew work safely and her granddaughter grow up in a village |
| `NPC-MAYA` | Maya | Inés's granddaughter, El Cruce; owner of the goat Clover | 9 | Curious, impatient, asks everything | Short phrases, questions, enthusiasm; "Pinky promise!" | A0-A1 | That Clover not run away; yellow flowers; a village with a name |
| `NPC-KOFI` | Kofi Mensah | Crew companion, Los Campos | 30s | Cheerful, supportive; learned English as an adult | Simple, encouraging | A0-A2 | That the crew have a voice in the village |
| `NPC-NELL` | Nell Ashby | Retired teacher, El Cruce (uses a wheelchair) | 70s | Warm, organizer; knows everyone | Clear, unhurried, like a teacher | A1-B1 | That the Crossing talk to each other again and the school reopen |
| `NPC-OLLIE` | Ollie Pratt | Rural mail carrier in a van, whole valley | 20s | Absent-minded, optimistic | Fast when excited; apologizes and repeats | A1-A2 | That someone wait for him on his route |
| `NPC-BEA` | Bea Lund | Mechanic, Crossing workshop | 40s | Practical, joker ("Old but gold!") | Direct, short | A1-B1 | That the old things work again (the pump, the radio) |
| `NPC-JUNE` | June Takeda | Small diversified farm · **has already changed** | 40s | Serene, generous, non-judgmental ("Every farm is different") | Clear, with examples you can see | A1-B1 | Sharing seeds and knowledge |
| `NPC-WES` | Wes Carver | **Pilot** of the plane, airstrip | 40s | Loves flying; careful with the wind; fears losing his job | Friendly, simple technical | A1-B1 | Doing his job well without harming anyone |
| `NPC-CALEB` | Caleb Hart | Young owner of the field next to the Crossing · **changes fast** | 20s | Enthusiast of the new; did not see the houses from the tractor | Fast, "Let's try it!" | A1-B1 | Doing things right with new technology |
| `NPC-RUTH` | Ruth Brandt | Owner of the apple orchard · **changes with data and relationship** | 50s | Careful, scientific; Nell's former student | Precise, "Data first." | A1-B1 | Not losing the harvest; deciding with evidence |
| `NPC-HARLAN` | Harlan Moss | Owner of the biggest cornfield · **may never change** (D-177) | 70s | Terse, traditional, generous; shy (`HAB-VINC-2`) | Very short phrases ("Morning.") | A1-A2 | That what his family did be respected |
| `NPC-NOOR` | Noor Haddad | Teenager who draws, El Cruce | 16 | Shy, creative | Few words; loosens up talking about drawing | A1-B1 | That someone look at what she draws |
| `NPC-GRACE` | Grace Adeyemi | Rural nurse (only health voice, D-176) | 40s | Precise, kind, always busy (`HAB-VINC-2`) | One question at a time; factual prevention | A1-B1 | That people take care of themselves before worrying |
| `NPC-VANCE` | Theo Vance | County liaison (cameo in Region 1) | 60s | Prudent, formal, fair | Formal, conditions ("If…, then…") | A2-B1 | That everything be done right and nobody be harmed |

**Animal:** Clover (small white goat with a red bell, always escapes: moderate gag and review vehicle, D-174).

**The network:** some neighbors only start a mission if another introduces you ("Tell him Ollie sent you"); their first line acknowledges the introducer. Key NPCs have two introduction paths so as not to block (D-168).

**Representation rules:** diversity of ages, origins and bodies without stereotypes; no accent or cultural trait is used as a joke; Nell's chair is never a scene topic; Maya and Noor (minors) appear only in everyday situations and public places; no owner, the pilot or the official is presented as bad.

### 3.4 Arc and chapter structure

| Chapter | Title | Zone | Band | Dramatic question | Founded | Close |
|---|---|---|---|---|---|---|
| Prologue | Arrival in the valley | Los Campos → El Cruce | A0 | Do I dare say something? | (light trail to the Crossing) | First firefly at the Crossing |
| 1 | The Crossing | El Cruce (+ Los Campos) | A1 | Will they let me into their lives? Does the Crossing dare to be something? | Board, mail stop, garden, windsock and flag, flower fence, traps, Table, sign | The Crossing picks its name (D-173); Vance brings the county's list `[FICCIÓN]` |
| 2 | The network | El Cruce + roads | A1→A2 | Can I find my way around and connect people to each other? | Crossing Radio, open school, seed bank, spraying notice | First radio broadcast; signatures gathered |
| 3 | Data and flights | Ruth's orchard, June's farm, airstrip | A2 | Can I tell what happened and compare options with data? | Grace's clinic, weather station, drone test | The county recognizes the village; the council is chosen |
| 4 | The ordinance | The whole valley | A2→B1 | Can I persuade and unite those who don't think alike? | Council at the school, buffer zone (green ring, no meters, D-186) | Public hearing; ordinance approved; Village Day |
| Epilogue | The village goes on | Everything | All | — | — | Daily village requests (outside v1) |

Each chapter: 8 main missions + 4-8 board requests (§3.7). The main missions unlock in groups so that the player **chooses** the order within the chapter (autonomy [Probable, E18]); only the last mission of each chapter requires having done at least 6 of the previous 7. **Each mission crosses four threads:** gets something by talking, adds or uses the network, founds or advances something visible and teaches a real knowledge item (`02` §1.5, §6.3).

### 3.5 Mission catalog

Columns: ID · title · NPC(s) · can-do · outcome in the world (what is obtained / founded) · target language · main potion branch · reappearances (review). The knowledge items and verifiable facts of each mission of the prologue and Region 1 are in `02` §4.4 and §8; those of chapters 2-4 are written with the `SAB-*` template of `02` §6.2.7.

#### Prologue: Arrival in the valley (A0)

| ID | Title | NPC | Can-do | Outcome | Target language | Branch | Reappears in |
|---|---|---|---|---|---|---|---|
| M0.1 | Hola, Inés | Inés | I can greet and say my name | Inés gives you the bunk key and the map; knowledge item: the plane | Hello / Hi, I'm..., Nice to meet you, Thank you | Amber | M1.1, M2.3 |
| M0.2 | ¿Cómo se dice? | Lumi (+ Kofi) | I can ask for and repeat names of things | `HAB-BASE-NOMBRAR` is activated; Kofi joins the network | plane, corn, firefly, "What's this?" | Light blue | Pocket review |
| M0.3 | Clover | Maya | I can answer yes/no and say where something is | Clover returns to Maya; Maya introduces you to Nell; first firefly at the Crossing | Yes/No, the canal, the field, here/there | Blue | M1.2, M2.6 |

#### Chapter 1: The Crossing (A1)

| ID | Title | NPC | Can-do | Outcome | Target language | Branch | Reappears in |
|---|---|---|---|---|---|---|---|
| M1.1 | Buenos días, Nell | Nell | I can introduce myself and say where I'm from | Key to the board → **Crossing Board** founded; Nell introduces you to Ollie | Good morning, I'm from..., How are you? / I'm fine, and you? | Amber | All (greetings) |
| M1.2 | La cabra de Maya | Maya, Ollie | I can describe an animal with color, size and a detail | Ollie finds Clover from your description; **mail stop** founded; map of mailboxes | She's small/white, red bell, Is this your goat?, has got | Blue | M1.6, M2.6 |
| M1.3 | La lista de Nell | Nell | I can understand a simple list and ask where something is | Garden list; **garden underway**; Nell introduces you to June, Bea and Ruth | Where is...?, It's next to / opposite / behind..., There is/are | Light blue | M1.7, M2.1 |
| M1.4 | Semillas y una manguera | June, Bea, Maya | I can ask for things with quantities | Seeds, hose and repaired pump (no money); **garden founded**; Bea introduces you to Wes | Can I have...?, two/three..., some, please, How many? | Green | M1.5, M2.3 |
| M1.5 | La bandera de Wes | Wes | I can ask about times and days, and ask a favor politely | Agreement on a yellow flag the day before; **windsock** founded | What time...?, at six, on Mondays, Can you..., please?, Thank you very much | Green / Light blue | M2.5, M2.1 |
| M1.6 | Flores para el borde | Caleb, Maya | I can say what someone likes and choose colors | Caleb plants a **flower fence** between his field and the houses | She likes..., Does she like...?, colors, favorite | Amber / Blue | M3.6 |
| M1.7 | Las trampas de Ruth | Ruth | I can ask about places and follow simple directions | Three **traps** set; Ruth agrees to count before spraying | Where's the...?, Go straight, turn left/right, first/second/third, next to | Light blue / Blue | M2.1 |
| M1.8 | El cartel del Cruce | Noor; Maya, Nell, Kofi; Vance (cameo) | I can talk about likes and ask about the other's | Noor paints the **sign**; the Crossing votes its name; **Crossing Table**; Vance brings the county's list | I like / I don't like, What do you like to draw?, me too / me neither, Can you paint...? | Amber | M3.6, M4.5 |

> **Change of objective with respect to v0.1:** M1.5 is no longer "tending a counter" (*What would you like? / Here you are / numbers*): the valley has no shop and founding uses no money. It brings forward *What time…? / on Mondays* (which M2.5 deepens) and keeps the Green branch for the favor request. *Here you are* stays in M1.4. If `04`/`06-grafo.yaml` depend on M1.5's old objective, the run reports it.

#### Chapter 2: The network (A1→A2)

| ID | Title | NPC | Can-do | Outcome | Target language | Branch | Reappears in |
|---|---|---|---|---|---|---|---|
| M2.1 | Niebla en los caminos | Ollie | I can give directions | Ollie reaches the Crossing in the fog with the radio equipment; unlocks `HAB-DESC-2` | prepositions, imperatives, landmarks, past the..., until you see... | Blue | M2.6, M4.6 |
| M2.2 | La radio de Bea | Bea, Nell (by radio) | I can speak on the radio and tell what I'm doing | **Crossing Radio** founded; first test; unlocks `HAB-VINC-3` | Hello, it's..., I'm (doing)..., Can you hear me?, present continuous | Amber / Light blue | M3.4, M4.5 |
| M2.3 | El banco de semillas | June | I can ask about quantities and availability | **Seed bank** founded (lent and returned) | Is there any...?, How much/many?, some/any, a lot of | Green | M4.6 |
| M2.4 | ¿Quién es quién? | Ollie, neighbors at the Saturday fair | I can describe people and what they are doing | You find the three neighbors from other fields who were missing for the signatures | She's wearing..., He has got..., the man who is..., present continuous | Blue | M4.4 |
| M2.5 | Un día de Wes | Wes | I can talk about routines and schedules | **Spraying notice** on the radio, agreed with Wes | What time...?, usually, every day, at/on/in, simple present | Light blue / Green | M4.2 |
| M2.6 | Clover en el granero | Maya, Harlan | I can give precise instructions | Clover comes out of Harlan's barn without breaking anything; Harlan laughs for the first time | Stop!, Come here, under/behind/between, Don't... | Blue | — |
| M2.7 | Firmas para el condado | Ollie, Nell | I can write a short note and read addresses (modality mixing) | Notes in every mailbox and signatures collected `[FICCIÓN]` | *Dear [nombre],* **only as a written-letter header** (explicit exception to the forms-of-address lint, F1.2; never spoken by an NPC), See you at..., written addresses | Green / Amber | M4.5 |
| M2.8 | La primera emisión | Nell, Bea, Kofi, Maya, Noor | I can hold a short chat with several people | **Open school** (reading room) and first radio broadcast from the classroom; signatures gathered | small talk: weather, plans, How was your day?, That's great! | Amber | All |

#### Chapter 3: Data and flights (A2)

| ID | Title | NPC | Can-do | Outcome | Target language | Branch | Reappears in |
|---|---|---|---|---|---|---|---|
| M3.1 | El año de la plaga | Harlan, Noor | I can understand a story in the past and retell it | Noor draws Harlan's story for the radio (layer C of the mystery) | past simple (regular + was/were, went, saw, lost), first/then/after that | Violet | M3.2, M4.4 |
| M3.2 | El cuaderno de Ruth | Ruth, Nell | I can ask questions in the past to find something | The orchard's old counts appear: data to compare | When did you...?, Where did you put...?, Did you...? | Violet / Blue | M3.4 |
| M3.3 | Clover no come | Maya, June | I can explain a simple health problem (of an animal) | June helps Clover; Maya is calm | She doesn't eat, since yesterday, She looks tired, What should I do?, should | Blue / Coral | M4.7 |
| M3.4 | Planes para la salita | Grace, Bea, Nell (by radio) | I can talk about plans | Grace's **clinic** underway; **weather station** planned on the school roof | going to, will (on-the-spot decision), first we'll... | Violet | M4.6 |
| M3.5 | ¿Avioneta o dron? | Caleb, Wes | I can compare options and give my preference | Caleb and Wes choose to test a drone on the lot far from the houses; unlocks `HAB-OPIN-1` | bigger/quieter/more precise (comparatives without any monetary term), better than, the best, I prefer... because... | Coral | M4.1 |
| M3.6 | La canción del Cruce | Kofi, Noor | I can tell a brief story for someone else to use | Kofi and Noor make the Crossing's song for the radio (bridge to mode 4) | past simple, adjectives, feelings, It was... | Violet / Amber | M4.8 |
| M3.7 | Noor tiene miedo | Noor | I can give advice and encourage | Noor agrees to show her mural on Village Day | You should..., Why don't you...?, Don't worry, You can do it | Coral / Amber | M4.8 |
| M3.8 | La prueba del dron | Caleb, Wes, Ruth, Lumi | I can tell what we did in the chapter | Drone test; **clinic and station founded**; the county recognizes the village and the council is chosen `[FICCIÓN]` | recap in the past, We fixed..., It worked! | Violet | — |

#### Chapter 4: The ordinance (A2→B1)

| ID | Title | NPC | Can-do | Outcome | Target language | Branch | Reappears in |
|---|---|---|---|---|---|---|---|
| M4.1 | ¿Dónde va el anillo? | June, Ruth | I can give my opinion with reasons | Buffer zone proposal (houses, school, garden) | I think... because..., In my opinion, I agree/disagree | Coral | M4.3 |
| M4.2 | Si sopla el viento... | Wes, Ruth | I can make plans with conditions | Notice and wind plan for the ordinance; unlocks `HAB-OPIN-2` | If the wind blows to the houses, we'll..., What if...?, unless (optional) | Coral / Violet | M4.4 |
| M4.3 | El alambrado de Ruth y Harlan | Ruth, Harlan | I can mediate between two people | Ruth and Harlan agree on a shared fence; unlocks `HAB-OPIN-3` | So you mean..., What about...?, Both of you..., Could we...? | Coral / Amber | M4.6 |
| M4.4 | La audiencia pública | Vance, council, neighbors, owners | I can present an argument and answer objections | The council approves the ordinance (with conditions); Harlan agrees to comply | If..., then..., we have already..., safety, Could we agree...? | Coral | — |
| M4.5 | Invitaciones | Ollie, Noor, Inés, Harlan (by radio) | I can invite and confirm details | The whole valley invited to Village Day | Would you like to...?, It starts at..., Can you bring...? | Amber / Green | — |
| M4.6 | Manos a la obra | Several | I can coordinate tasks among people | **Green ring** planted and marked (`SITIO-RESGUARDO`) | Can you..., while I..., Who is going to...? | Light blue / Green | — |
| M4.7 | La manga rota | Bea, Wes, Grace | I can explain an unexpected problem and propose a solution | A gale breaks the windsock and the antenna; they are fixed in time | The problem is..., We could..., Let's... | Coral / Blue | — |
| M4.8 | El Día del Pueblo | Everyone | I can speak for a few seconds in front of others and chat at a party | Village party; reveal of the envelopes; fireflies across the whole network | Brief prepared speech (3-5 sentences, may be read), small talk | All | Epilogue |

### 3.6 Written scenes (detailed script)

> Format: **[Scripted opening]** is recorded/cached. **[AI body]** describes goal and behavior; the lines are **examples** of the style and level, not a fixed script. **[Scripted closing]** is recorded/cached. Lumi speaks in L1 (Rioplatense) except when it models a phrase. Full version of the prologue and chapter 1 scenes (beat sheet, dialogue skeleton, criteria, exit if it does not converge, potions, review, pronunciation, verifiable facts): `02` §4.4.

#### M0.1 · Hola, Inés (A0)

- **Place:** Los Campos, next to the harvest bus, in front of the lodge. Morning. Wind in the corn.
- **NPC need:** Inés wants to know who you are to put you on the crew list.
- **Success criteria:** (1) the player greets; (2) says their game name with or without "I'm". Optional: "Nice to meet you" / "Thank you".
- **[Scripted opening]**
  - INÉS: "Hello! Welcome to Kestrel Valley." *(waves)* "I'm Inés." *(points to herself)* "And you?" *(points to you)*
- **[AI body]** — Band A0, scaffolding 1. Inés uses at most 5 words per phrase and gestures. If the player does not respond or passes the turn: "I'm Inés." *(points to herself)* "You are...?" If they say only the name: "Nice to meet you, [nombre]!" If they say something in Spanish: "¡Hola!" *(her only word in Spanish of the chapter)* "In English: Hello!" and waits. If they ask about the plane passing far away: "A plane. It sprays the fields." (knowledge item `SAB-AVIONETA`).
- **[Scripted closing]**
  - INÉS: "Nice to meet you, [nombre]! Here's your key. And a map. Maya lives at the Crossing. Bye!"
  - LUMI: "¡Primer día y ya te presentaste! Le dijiste *I'm [nombre]*. Eso va al frasco ámbar: presentarse."
- **Event:** `map_received`, `key_received`, `ines_trust+1`. **Review marked:** "Nice to meet you" if it did not appear.

#### M0.2 · ¿Cómo se dice? (A0)

- **Place:** path from the lodge to the crew's shed.
- **Mechanic:** the player points at a highlighted object and asks Lumi for the name (`Q` key or "¿Cómo se dice?" button). Three guided objects: *plane* (the distant plane), *corn*, *firefly* (Lumi, as a joke). Lumi says the word in L2 (cached audio), then in L1, and shows it written. Kofi passes by and joins the network.
- **Optional production:** "¿Lo decís vos?" — it is the first **scripted pronunciation moment** (§2.4.7, *repeat after me*): if the player says it, it is evaluated against the word and Lumi gives kind feedback only on error types enabled by F0.1 (D-151); if no type is enabled, it only verifies that they attempted the word and offers "así lo dijiste vos / así suena". 1/3 light-blue potion per attempt. (The moment is built as data on the existing line of `02` §4.4 M0.2; the reading of D-019 as "script in force" is in D-182.)
- **Lumi's line at the end:** "Podés preguntarme cómo se dice cualquier cosa que brille así. Y si querés que me acuerde de una palabra, tocá *Marcar*."

#### M0.3 · Clover (A0)

- **Place:** Los Campos, next to the canal. Maya looks in all directions.
- **Context:** on getting off the bus, a brief camera shot showed a little white goat with a bell by the canal.
- **Need:** Maya wants to know whether you saw her goat and where.
- **Criteria:** (1) answers "yes" (or equivalent); (2) indicates a place (the canal / the field / there + click on the map).
- **[Scripted opening]**
  - MAYA: "Hi! Oh! A firefly! In the day?" *(Lumi blinks)* "My goat… Clover! Did you see my goat?" *(shows a chalk drawing)*
- **[AI body]** — Maya repeats "Did you see her?" if there is silence and the player passes the turn; with "Más simple": "Clover. Goat. Yes? No?" If they say "yes" without a place: "Where? The canal? The field?" If they say "no": "Oh no..." and Lumi whispers in L1: "¿No la viste junto al canal?" (comprehension signal, not correction).
- **[Scripted closing]**
  - MAYA: *(returns with Clover)* "Clover! Thank you! Thank you!" "Clover eats weeds! Good goat!" "Come to the Crossing! Nell knows everybody!"
  - LUMI: "Le dijiste dónde estaba Clover: *the canal*. Eso es azul: ubicar cosas. ¿Te acordás cómo se decía *maíz*?" *(retrieval)*
- **Event:** `goat_found`, `intro:NPC-NELL<-NPC-MAYA`, first firefly at the Crossing. Knowledge item: `SAB-CABRAS`.

#### M1.1 · Buenos días, Nell (A1)

- **Place:** Nell's porch, next to the closed school, morning.
- **Need:** Nell wants to know who the newcomer Maya sent is and whether they will stay to help.
- **Criteria:** (1) greeting appropriate to the time; (2) name; (3) where they come from (any place is valid; not stored as personal data); (4) responds to "How are you?" and returns the question (optional; amber potion).
- **[Scripted opening]**
  - NELL: "Good morning! You're the new worker! Maya told me. I'm Nell. I was the teacher here."
- **[AI body]** — Band A1, scaffolding 2. Questions in flexible order: "Where are you from?", "How are you today?". Reacts warmly ("Argentina? Far away!"). "I from Argentina" (missing verb; local) → recast, Lumi notes it; if the error is the goal and repeats → Lumi step 2: "¿*I from*...?". Knowledge item: "That was our school. One room, all the children." Optional cultural branch if mate appears: "Argentina! Mate, right? A tea in a gourd!" (one per chapter, D-066).
- **[Scripted closing]**
  - NELL: "Here's the key to the board. Write what the Crossing needs. Ollie knows every mailbox. Talk to him! Tell him Nell sent you."
  - LUMI: "Le dijiste de dónde venís: *I'm from…* Eso es ámbar. Y el tablero del Cruce vuelve a estar abierto."
- **Unlocks:** the Crossing's request board (`SITIO-TABLERO` founded).

#### M1.2 · La cabra de Maya (A1) — information-gap task

- **Scene 1 (El Cruce, Maya):** Clover escaped again. Maya knows what she looks like; the player asks.
  - **[Opening]** MAYA: "Clover ran away AGAIN! Can you help me?"
  - **[AI body]** Maya gives traits only if the player asks ("What color is she?", "Is she big?") or if they pass the turn (then she gives one). Criterion: obtains ≥2 of 3 traits (small, white, red bell).
- **Scene 2 (Los Campos, Ollie, next to the van):** Ollie saw three goats (big black, small brown, small white with a bell).
  - **[Opening]** OLLIE: "Nell sent you? Great! A goat? I saw three goats today! What is your goat like?"
  - **[AI body]** The player describes. If they give a wrong trait ("big"), Ollie points to the big goat (kind prediction error): "This one?" — the player corrects. Criterion: conveys 2 correct traits.
  - **[Closing]** OLLIE: "The small white one with the red bell? She's in my van!" — Clover peeks out the window. "Look at her eyes! Long lines!" (knowledge item `SAB-PUPILAS`). Ollie gives his map of mailboxes, introduces Caleb and decides to stop at the Crossing (`SITIO-PARADA`).
- **Lumi (post):** distills blue for describing and amber for asking. Retrieval: "¿Cómo le dijiste a Ollie que era chiquita?"

#### M1.4 · Semillas y una manguera (A1) — transaction without money

- **Pre-task (Lumi):** "La lista de Nell dice: tres sobres de porotos, dos de zapallo, una bolsa de maíz. Nadie vende nada: los vecinos prestan y comparten. Piezas útiles: *Can I have…?*, *please*, *How many?*"
- **Scene 1 (June, at her farm):** the player asks with a quantity and "please"; June asks "How many?" — if the number does not match the list, June gives that quantity and Lumi notes it at the end. Minimal pair *three/tree* with consequence in the world (June points to a little tree). Knowledge item: "A ladybug. It eats aphids. Ladybugs help me." (`SAB-VAQUITAS`).
- **Scene 2 (Bea, at the workshop):** ask for a hose and buckets; Bea fixes the old pump ("One minute!… It works!") and introduces Wes.
- **Scene 3 (Maya, in the garden):** Maya has secret sunflower seeds; she jokingly negotiates ("Can I plant one? My sunflower?") and the player accepts ("Yes, of course").
- **Closing:** they sow; Inés brings the crew's tools and Kofi waters; the **Crossing garden** appears on the map with its credits.

#### M3.1 · El año de la plaga (A2) — example of a mid-level scene

- **Scene 1 (Harlan, on his porch):** Harlan tells (2-3 sentences per turn, past) about the year he almost lost the harvest to a pest, when he was young and his father ran the farm. The player asks to understand ("What happened then?", "Were you scared?"). Harlan speaks little and softly; if the player speaks softly, Harlan says "Hm? Again?" (character trait; the game raises microphone sensitivity, does not punish). No figures or product names.
- **Scene 2 (Noor, on the garden bench):** the player **retells** the story to Noor, who draws it in panels for the radio. Criteria: at least 3 events in order with simple past; a sequence connector. Noor asks to fill in gaps ("And after the bugs came?"). Step 1 is done by Noor in the fiction ("Wait, he *loses* or he *lost*? I'm drawing it..."), step 2+ by Lumi.
- **Closing:** Nell reads the panels' text on the radio (correct version, cached audio generated from the player's account, cleaned and reviewed by the observer): the player hears their own story in good English (global *recast* as a model, not correction). Harlan listens from his porch and nods. Clue to layer C of the mystery.

#### M4.4 · La audiencia pública (A2→B1) — persuasion scene

- **Preparation (with Lumi and Nell):** the player chooses 3 arguments from a list of 6 built from what they did and learned (Caleb's fence, Ruth's counts, Wes's flag and windsock, Grace's clinic, the weather station, the drone test). Only arguments from missions done and knowledge items gathered appear: the world remembers. Arguments that use real facts come from verified `SAB-*` cards (in release, only the verified ones).
- **Scene 1 (Vance and the council, in the school classroom):** 3 reasonable objections are raised ("If we stop the plane, some farms can lose their harvest." / "Who is going to check the wind?" / "Harlan's family farmed here for years."). The player responds with arguments. Criteria: respond to at least 2 objections with a pertinent argument and a conditional or proposal structure. Counter-objection once per argument; if not resolved, the council partially accepts ("Fine, but we review it next season").
- **Scene 2 (neighbors and owners):** Ruth, June and Wes give their views; the player can ask them to back them up ("Wes, could you tell them about the wind?") — mediation. Harlan speaks once: "I don't change my ways. But a rule is a rule." (D-177).
- **Closing:** VANCE: "If all of you are going to look after it... then the council can vote." Show-of-hands vote; the **buffer zone** appears as a green ring on the map (no meters, D-186).
- **Exit if it does not converge:** Nell asks for the floor and offers an extra argument; the council approves with conditions. The hearing is never "lost".

#### M4.8 · El Día del Pueblo (finale)

- **Speech preparation (optional):** Lumi helps put together 3-5 sentences ("I came to Kestrel Valley for the harvest..."). The player can write and read them, say them freely or choose "Que lo lea Nell" (no penalty; the potion is only given if they speak).
- **Scene 1:** brief speech under the Crossing's tree; the NPCs react with one line each that recalls something they founded together (world memory and credits).
- **Scene 2:** free chat **with a frame** at the party (two or three NPCs of choice, 2 min each; permitted topics: the village, food, music, plans).
- **Scene 3 (scripted):** choral reveal of the seed envelopes (Inés, Nell, June and Harlan wrote one; Harlan, the last, D-172/D-177). Kofi and Noor play the Crossing's song. At dusk, fireflies light up over each trail of the network. Lumi shines at maximum.
- **Epilogue (Lumi):** "No era el único. Donde la gente se habla, hay luz." Summary screen: the arc's demonstrated can-dos (not XP numbers), what was founded with its credits and one line per neighbor.

### 3.7 Board requests (secondary missions by template)

Templates that the system instantiates with due review items and available NPCs. Each request lasts 1-3 minutes. None uses money: payment is with help, lent objects or time. The Region 1 requests (P-R1.1…P-R1.6) are written in `02` §4.5.

| Template | Form | Review use |
|---|---|---|
| Lost object | An NPC lost something; describe it to another who found it (Nell's blue scarf in Ollie's van) | Colors, sizes, marked objects |
| Errand | Take something to someone and relay a message (Grace's errand to the crew) | Marked phrases and greetings |
| Sidewalk chat | Brief conversation with a goal, often with a shy or busy neighbor (Harlan, Grace) | Amber; marked questions |
| ¿Cómo se dice? (search without a clock) | Lumi names 5 objects; the player finds them | Due isolated vocabulary [Proven, conditional, E35] |
| List | Nell or June need a list; ask two neighbors for it | Quantities |
| Sign | Read a sign in English and relay it (the notice on re-entering a lot) | Reading, days and hours |
| Radio message (from ch. 2) | Call over the Crossing radio and leave/receive a message | Present continuous |

### 3.8 Scene-writing guide (for runs that write content)

The full guide (30 rules, schemas and lint) is in `02` §6.3 and §6.6. The essentials:

1. Each scene has **one NPC need** and **success criteria verifiable** by the observer. Without a need there is no scene.
2. The NPC **asks** more than it **tells**; in A0-A1, closed or multiple-choice questions; in A2+, open ones.
3. Scripted opening of 1-2 lines; never a monologue.
4. The NPC uses **only** the scene's vocabulary band + 1-2 new words supported by the visual context.
5. Humor comes from the characters (Clover who escapes, Bea's old pump, Ollie's van), never from the player's mistake.
6. No sarcasm or irony in A0-A2.
7. Every scene has an **exit if it does not converge** and a narratively dignified **partial result**.
8. Cultural references of the player (Argentina; then Brazil) as kind bridges (mate), never as stereotype.
9. No scene requires real data from the player; if it asks for a place or a taste, any invented answer is valid.
10. Each scene declares its **summary for the next one** (2-3 lines) so that the context does not grow [Business §3.2].
11. **Each mission crosses four threads:** gets something by talking, network, foundation and a real knowledge item.
12. **Facts:** every real datum comes from a `SAB-*` card with verifiable facts `HV-*` marked `[FUENTE-PENDIENTE]` until verified; no figures; no names of products, brands, companies or real people (D-170).
13. **No villains:** owners, pilot and official always with reasonable motives. **Health:** only Grace, factual and preventive, nothing graphic (D-176). **Marked fiction:** the valley's legal path is `[FICCIÓN]` (D-171).
14. **Founding uses neither money nor potions** and always shows the credits of those who lent a hand (D-169).

---

## 4. Modes 2 to 5 (vision)

> These modes are **not built in v1**. They are described so that mode 1 does not make decisions that close them off (data, state, art, characters) and so that the roadmap can order them.

### 4.1 How the modes connect with mode 1

- **A single account, a single profile, a single review bank, a single Lumi.** Everything the player demonstrates in any mode distills potions in the same branches.
- **Mode 1's skills are the keys to the other modes** (not unlocked by time or payment):

| Mode | Opens with | Why |
|---|---|---|
| 2 Tell and build | `HAB-CONT-1` (telling what happened) + `HAB-DESC-3` (describing people) — end of Ch. 3 | You need to narrate and describe to "narrate a world" |
| 3 My real day | Separate product decision (on hold) + adults only | Privacy |
| 4 Media | `HAB-OPIN-1` (opining) + M3.6 "La canción del Cruce" | The song Kofi and Noor make for the Crossing Radio is the bridge |
| 5 Travel and culture | End of mode 1's arc (Village Day, M4.8) | The crew follows the harvests: the bus takes you to other valleys and destinations |

- **Shared-state rule:** since the 3D world and the UI talk only through the game state (§1.4.8), each mode is a set of screens/scenes that reads and writes the same profile. The architecture review defines the form.

### 4.2 Mode 2: Tell and build (storytelling / world-building)

**Idea:** the player **narrates** a scene in the target language ("There is a small farm with a red barn. An old woman lives there. She has a goat...") and the game **sculpts** it in 3D with pieces from the asset catalog; then the player **inhabits** that world: the characters they described become NPCs they converse with, and other players (or the class) can visit it.

- **Loop:** describe → see it appear → correct by describing ("No, the house is *bigger*, next to the tree") → populate (describe characters, their personality, what they need) → play the missions that emerge from what you described → share.
- **Why it works for learning:** description has an immediate visible consequence (a meaning error produces a different world: prediction error [Probable, E37]); it forces production with spatial and lexical precision.
- **Tycoon-style building (candidate, DP-15):** the third-party proposal brings "grid and building" and a RollerCoaster Tycoon-style "economic loop". In mode 2 it has a natural place **without money**: placing buildings and decoration on a grid by describing them or asking builder NPCs, and having the world "work" (NPCs use the places, requests appear). If an economy ever appears, it has to be a **world** economy (village resources, favors) and not a player currency that pays for participating. Operator decision pending.
- **Teachers and UGC:** the teacher creates scenarios and missions for their class (business branch B and D [Business §4]). Requires moderation of generated content.
- **Risks:** 3D generation from text is expensive and fragile; it is limited to **composing pieces** from the catalog (not generating meshes). Moderation of shared worlds with minors.
- **Art:** reuses the same HD-2D kit (tiles, volumes and sprites) and the palette (§5) so everything matches.

### 4.3 Mode 3: My real day (on hold)

**Idea:** Lumi leaves the game and accompanies you in your daily life in the target language: organizing the calendar, notes, emails, messages ("Escribí este mensaje a tu jefe en inglés y lo revisamos juntos").

- **Status:** on hold by operator decision; it may link with another future project [Brief].
- **Risk:** high privacy (mail, calendar, messaging; voice as personal and potentially biometric data under LGPD) [Business §6.6]. **Adults only**, never for minors.
- **Connection with mode 1:** mode 1's missions train the functions (asking, explaining problems, planning) that mode 3 would apply to real life; the review bank could be fed by real life.

### 4.4 Mode 4: Media (songs, videos, live or deferred)

**Idea:** learning with music and video alongside an agent: listening to a song, understanding the lyrics, singing it; watching a short video and commenting on it with an NPC; watching something "live" with Lumi beside you.

- **Narrative bridge:** Kofi (who sings on the crew) and Noor (who draws) are the hosts; "La canción del Cruce" (M3.6), made for the Crossing Radio, is the prototype of this mode inside mode 1.
- **Possible forms:** karaoke with synchronized lyrics; "what did you understand?" with an NPC; original game songs and videos (no third-party license) first; third-party content later.
- **Risk:** copyright of third-party songs and videos [Business §5.1]; the default is to produce own content or with open licenses. Integration with video platforms: later product and legal decision.

### 4.5 Mode 5: Travel and culture (undeveloped)

**Idea:** the crew follows the harvests, and the bus takes the player to other places: other valleys, towns and cities where the target language is spoken, with their culture, foods, festivals and accents. Each destination is a "village" with its own short arc.

- **Natural door for new language pairs:** a Brazilian agricultural region for ES→PT, with the same scheme of founding and the network (second pair of the [Brief]); a different English-speaking city with other accents to consolidate EN.
- **Culture without stereotypes:** local cultural advice per destination.

---

## 5. Art direction, camera, UI and audio

### 5.1 Principles

1. **Light before pretty, and pretty by style, not by detail.** The game sells speech and context, not graphic fidelity [References §0, §4.4]. The references' complaints were camera, controls, UI scaling and performance, never "lack of realism". The style chosen by the operator is **HD-2D** (D-139): pixel art over a simple 3D stage with real light.
2. **Schematic and clear.** For learning, the schematic paid off more than the realistic [Hypothesis, E26]; it is also cheaper and more legible.
3. **Diorama, not open world.** Small scenes, with kind edges (fences, the canal, hills, cornfields), loaded by zone.
4. **The world tells the progress.** What is founded, the Crossing's color, the network's firefly trails and the people outside grow with progress (`02` §1.9).

### 5.2 References

| Reference | What we take | What we do not |
|---|---|---|
| ***Octopath Traveler*** (main reference, D-139) and screenshots in `docs/refs/estetica/` | **HD-2D**: pixel art characters as sprites over 3D stages with pixel art textures, camera from above at an angle, warm light, depth of field that makes the village look like a model | Turn-based combat, dense menus, dark vignettes and heavy grain (they lower text legibility) |
| **Townscaper** | Colorful houses, soft edges, saturated pastel palette, toy feeling | Procedural building generation (not needed) |
| **A Short Hike** | Tone of neighbor requests, warmth, small village walked in minutes, no pressure; accompanying camera | Pixelation as a full-screen filter (here the pixel art is in the textures and sprites, not in a post-process) |
| **Bruno Simon's 3D portfolio** | The playful feeling of a web world you can touch: objects that react, surprise, all in the browser | Heavy physics and driving as the axis (DP-14, DP-16): in mode 1 movement is walking |
| **Influent** | Every object can be "asked" | Free and fragile camera controls |
| **Noun Town** | Kind, colorful world used in institutions | Streaks and daily goals |

### 5.3 Style (HD-2D, D-139)

> **Note (2026-10-30):** this section is now history. The style in force is the painted diorama (D-207, `docs/art-direction/proposal-c-painted-diorama.md`), seen in third person in an open world (D-209). The technique is in `03-architecture.md` §2.8 and §2.9.

- **HD-2D** (reference *Octopath Traveler*): the stage is 3D and simple (tiles with pixel art texture and low-face-count volumes: houses, sheds, fences, the tank, the big tree) with real 3D light and soft shadows; the **characters are pixel art sprites** that always face the camera; depth of field and bloom (only at medium and high quality) make the valley look like a lit model. Technical detail: `03-architecture.md` §2.9.
- **Pixel density:** 1 tile = 1 m = 32×32 px; characters of ~32×48 px at the same density; unsmoothed filtering (crisp pixel art). Final parameters are set by the operator looking at F0.2 (D-154).
- **Interactive objects** are distinguished by a soft glow in the branch color (or an icon in color-blindness mode), not by flashing outlines.
- **Characters:** toy-proportioned sprites (big head, simple body), legible at 32-48 px; 4-direction walk and idle; talk and greet if the pack provides them. Diversity through palette (skin, hair, clothes) and accessories, over a base pack per region with a registered license (D-153).
- **Lumi:** the most carefully worked object in the game (§2.4.2): an emissive 3D firefly built from primitives that glows over the pixel scene (D-082 read with D-165's shape). The **network trails** (fireflies at dusk between connected houses) use the same emissive, as cheap particles.
- **Low mode:** no post-processing, *blob* shadows; the style is kept (pixel art is cheap).

### 5.4 Palette

Color tokens (starting values, to validate with contrast and color-blind modes):

| Token | Use | Suggested value |
|---|---|---|
| `agua` | Canal, tank, puddles | #5FB3C8 |
| `cielo-dia` | Morning sky | #BFE3EC |
| `cielo-atardecer` | Dusk sky | #F2B28C |
| `noche` | Night sky | #2B3550 |
| `tierra` | Dirt roads, lots | #E8D3A9 |
| `pasto` | Vegetation, fences | #8CC084 |
| `campo` | Ripe corn and wheat | #D9B65A |
| `casa-1..6` | Facades (coral red, yellow, mint, light blue, lavender, warm white) | #E9806E, #F2CF6B, #9ED8B8, #9CC7E8, #B9A6DB, #F4EDE2 |
| `luz-bicho` | Emissives: Lumi and the network's firefly trails | #FFD27A |
| Potion branches | Amber / green / blue / violet / coral / light blue | #F2A93B / #5FBF6A / #4A86D9 / #9B6BD3 / #EE6F5B / #5FC8D9 (with associated shape, §2.19) |

- **Visible progress:** the Crossing starts desaturated (saturation −30 %), dusty and without fireflies; each foundation returns saturation to its zone (garden green, flower yellow and blue) and, at dusk, each link of the network is seen as a trail of fireflies (`luz-bicho`). On closing Region 1, the Crossing is at normal saturation (`02` §1.9).
- **HUD:** cream/paper background (#FBF6EC) with dark ink (#2A2A33) in light mode; inverted in dark mode; minimum WCAG AA contrast (AAA target for dialogue text).

### 5.5 Camera and controls

> **Amendment D-209 (2026-10-30):** third-person camera behind the character. Look by dragging or with Q and R, automatic recentering after 1.5 s without looking, continuous zoom from 2.5 m to the whole map (wheel, `+`/`-`, buttons; V for the whole map), WASD relative to the camera, `Shift` to run and a minimap with the NPCs still missing. Clicking on the ground still walks, and a drag does not walk. The camera still requires no skill: nothing is lost if the player never rotates it. What follows describes the previous camera (D-053).

- **Camera from above at an angle** (D-053, by presets): `topdownOrtho` by default (orthographic, 55-60° tilt, ~15 tiles of visible width, follows the player with smoothing), `isoOrtho` (rotated 45°) as an option, and a dialogue framing when conversing (NPC and player at the sides, subtitles not covering faces). **No free orbit**; 3 zoom levels. The clumsy free camera is the most expensive lesson of the references [References §4.2.4, §4.4.2]. With "reduce motion", cut instead of pan.
- **Movement:** click on the ground to walk (simple pathfinding) or WASD/arrows. No jumping, no mandatory running (optional running with `Shift`). Simple collisions (not physics) by default (DP-14).
- **Interaction:** get close + `E` / click on the NPC or object. Firefly icons over NPCs with requests.
- **Playful vehicle (DP-16):** inspired by Bruno Simon's portfolio, the trip in Ollie's mail van (`HAB-DESC-2`) could be a light physical play moment. Default: in v1 it is an animated fast travel between zones, without physics. A "drivable" version with physics is a candidate for after the vertical slice.

### 5.6 UI and HUD

- **The whole HUD in the DOM layer** (not inside the 3D): dialogues, subtitles, menus, notebook, settings. Solves scaling, accessibility and screen readers [References §4.4.4].
- **Style:** paper and ink, rounded borders, large legible typography (humanist sans; dyslexia option), simple thick-line icons.
- **HUD elements in game:**
  - Current goal line (top left, one line).
  - Voice indicator: microphone listening / NPC speaking / your turn (with shape and color, not only color).
  - Dialogue panel (bottom): NPC subtitles with highlighted word; tapping a word = translation + "Marcar".
  - Scaffolding bar (bottom, always visible in conversation): `Repetir` · `Más despacio` · `Pista` · `Pasar el turno` · `Escribir` · `Marcar` · `Terminé`.
  - Voice budget (discreet, in the menu, and a kind warning when few minutes remain).
  - Lumi's Jar (notebook): potions by branch, demonstrated can-dos, items to review, mission history, the network, knowledge items and mysteries.
- **No big XP numbers** on screen. Progress is shown as jars, what is founded on the map, the network and "puedo..." phrases.

### 5.7 Asset strategy: pixel art tiles and sprites, CC0 volumes

- **Rule:** code AIs do not model 3D or draw sprites. **Packs with a registered license** are used, copied into the project and placed by code (positions and tile layers in scene data). [Operator directive]
- **Characters and tiles (D-153):** **pixel art** sprite packs and tilesets with a license that allows commercial use and modification (CC0 first; CC-BY with attribution or paid commercial itch.io license as second option), with 4-direction walk and a **single base pack per region** so the style is uniform. "Non-commercial" or "personal use only" licenses are **not** used (they would block the rest of the plan even though today the game is the operator's), nor AI-generated sprites except by explicit operator decision. **The operator chooses and downloads the pack** (and buys it if paid).
- **Volumes and props (glTF/GLB, CC0):** **Kenney.nl** (city, nature, furniture, boat, decoration kits, and **audio** packs), **Quaternius** and **Poly Pizza** only with explicit CC0; with pixel texture or palette color so they match the tiles.
- **Mandatory asset registry:** `content/assets-registry.yaml` (canonical path, `03-architecture.md` §4.2.1; fields in §6.4.2) with: file, pack, author, license, source URL, download date, sha256, modifications and whether it requires attribution. Without a registry entry, the asset does not enter; the build fails.
- **Visual unification:** the same pixel density (32 px per tile), the same palette applied by recolor, the same light; prefer one main pack per category.
- **Budget (proposal to validate with F0.2):** each zone < 50k visible triangles in medium mode; < 150 draw calls (merged tile chunks, instances for repeated ones); shared textures ≤ 1 atlas of 1024 px per zone; initial download (Los Campos + El Cruce, `muelle` + `plaza` dioramas, D-180) < 15 MB compressed; interactive in < 15 s on a modest PC.
- **Lumi and identity elements** (Lumi, its jar, logo): primitives by code (a firefly and a jar are simple geometry) or commission to an artist (DP-39).

### 5.8 Audio, music and voice

- **Music:** acoustic, warm, slow tempo (guitar, ukulele, soft piano, light percussion), one theme per zone that "fills" with instruments as it is founded (the Crossing's theme adds one instrument per foundation, `02` §1.9). During conversations the music lowers (ducking) automatically. Sources: own composition or music with verified free license (DP-40).
- **Ambience:** wind in the corn, cicadas, the canal's water, steps on dirt, Clover's little bell, the plane far away. Kenney and other CC0 audio packs.
- **Interface effects:** soft and short; no error sounds. The potion's "gluc" is the sonic signature.
- **NPC voices:** voices of the real-time engine assigned per character according to the table in §3.3.3 (DP-20); scripted lines are pre-generated with the same voice so the timbre does not change between scripted and generated. Accent: clear general in A0-A1 NPCs; from A2, two NPCs with other accents (exposure to variants) (DP-26, D-043).
- **Lumi's voice:** TTS in L1 (neutral Rioplatense in v1, DP-28), warm; in L2 when it models phrases.
- **Accessibility mix:** separate volumes per channel (§2.19).

---

## 6. Metrics and experiments

> Rule: **separate learning metrics from engagement metrics.** A game can raise engagement without moving learning (points and levels raised quantity, not quality [Probable, E15]) [Research §4].

### 6.1 Learning metrics (outcome)

| Metric | How it is measured in the game | Design source |
|---|---|---|
| Pre/post with delayed test | Standardized oral task outside the missions (evaluation scene with a "visitor" NPC who gives no hints), at the start, at the end of each chapter and 1-2 weeks later | Delayed and immediate effects differ (0.92 vs 0.58 in Wang 2026) [Research §4] |
| Oral production in a new task (transfer) | In the evaluation task: complexity, accuracy and fluency (CAF); lexical diversity; self-correction rate after a prompt | [Research §4] |
| Retention of marked items | Rate of correct use on their spaced reappearance (per interval) | [Research §4], E34 |
| Willingness to speak and anxiety | Short validated scales (FLCA, WTC), before and after, in a pilot (with consent; minors with guardian/institution) | [Research §4], E1, E3 |
| Demonstrated can-dos | Number and speed of can-dos demonstrated per chapter | Design |

### 6.2 Engagement metrics (process)

| Metric | Definition |
|---|---|
| Retention by cohort | D1, D7, D30; sessions per week |
| **Free choice** | Sessions started **without reminder or pending reward**: Deci's classic indicator of intrinsic motivation [Research §4]. North-star engagement metric |
| Accessibility use | Use of `Más despacio`, silence button, text mode, hints; and their relationship with production |
| Production per session | Player production turns per scene and player speaking minutes (not the NPC's) |
| Scene convergence | % of scenes that meet criteria without "exit if it does not converge" |
| Cost | US$ per minute of real voice and per active player per month (experiment #1 of the business analysis) |
| Perceived quality | Report of translation/recognition errors by players ("algo está mal" button) |

**Reference thresholds (from business analysis §7, for the prototype):** D7 return without reminder ≥ 15%; voice cost ≤ US$0.03/active min (condition to continue) and pivot criterion if no option goes below US$0.05/min.

### 6.3 The three A/B experiments proposed by the research

| # | Experiment | Arm A | Arm B | Main metric | Secondary metrics | Why |
|---|---|---|---|---|---|---|
| A/B-1 | **Immediate+delayed feedback vs delayed only** | "Accompanied" mode (brief immediate signal + review at closing) | "Note only" mode forced (no signals in scene, same review) | Retention of marked items on spaced reappearance; accuracy in delayed evaluation task | Anxiety (short FLCA), free choice, scene abandonment | Immediate ≥ delayed [Probable, E32]; dose [Disputed] |
| A/B-2 | **Informative XP vs XP for completing** | Potions only for demonstrated competence (current design) | Potions for completing a mission (same average amount) | **Free choice** (sessions without reminder or pending reward) | Production quality (CAF), D7/D30 | Overjustification [Proven in lab, E12]; transfer [Disputed, E16] |
| A/B-3 | **Silence button vs automatic scaffolding** | Unlimited silence + `Pasar el turno` button (visual chip off) | Automatic scaffolding: after X s (e.g. 8 s) the NPC offers a hint or two options | Production turns per scene; production rate without hints | Anxiety, hint use, free choice | No studies [Hypothesis, E10]; risk of lack of push [Hypothesis] |

**Ethical conditions:** no arm removes accessibility features; for minors the experiments require approval from the institution and guardian; arms are assigned per account (not per session) and the privacy policy states that the game is improved with experiments.

---

## 7. Glossary

| Term | Definition in this project |
|---|---|
| **L1 / L2** | The player's mother tongue / the language they are learning (target language) |
| **CEFR (MCER)** | Common European Framework of Reference for languages; levels A1-C2. **A0** = pre-A1 (absolute beginner) |
| **Can-do** ("puedo...") | Statement of what the player demonstrated being able to do with the language |
| **TBLT** | Task-based language teaching: language as a means to a non-linguistic outcome |
| **Task** | Mission with an outcome in the world that requires using the language |
| **Scene** | Short conversation (2-4 min) with an NPC, with a goal and success criteria |
| **Pre-task / post-task** | Preparation with Lumi / closing with distilling and retrieval |
| **Prompt (feedback)** | Signal that leads the player to self-correct (clarification request, repetition, metalinguistic clue, elicitation) |
| **Recast** | Correct reformulation of what the player said, without asking them to repeat |
| **Global / local / systematic error / slip** | Prevents understanding / the meaning stays clear / repeats / isolated |
| **Disfluency** | Repetition, false start, filler or self-correction; not an error |
| **Observer** | Process that analyzes the player's turns (errors, success criteria, items) and emits events to the game (inherited from a previous voice prototype) |
| **Lumi** | The companion: a firefly that came with the protagonist in a jar (D-165); provisional name (D-032) |
| **Knowledge potion** | Unit of competence evidence per branch; mode 1's "XP" |
| **Distill** | Post-task moment when Lumi names what was demonstrated and the potions fall into the jar |
| **Pour** | Assign potions to a skill-tree node to open it (they are not lost) |
| **Lumi's Jar** | The jar where Lumi lives, which is also the player's notebook: potions, can-dos, review items, history, network, knowledge items, mysteries |
| **The network** | The neighbors who know the player; it grows through introductions (D-168, `02` §1.7); seen as firefly trails |
| **Found / foundation** | Something the player achieves by talking and that stays built at a `SITIO-*` on the map, without money (D-169, `02` §1.8) |
| **Knowledge item (`SAB-*`)** | Card of real, verifiable knowledge that a mission teaches, with its source (D-170, `02` §1.5) |
| **Envelope (`SOBRE-*`)** | Seed envelope of the meta-mystery (D-172, `02` §1.6) |
| **Review bank** | Marked items with their mastery level and next date |
| **Pocket review** | Optional 60-90 s review on entry, of isolated words |
| **Scaffolding** | Support that the NPC and Lumi give (speed, length, options, hints, L1) |
| **Exit if it does not converge** | Kind closing of a scene that did not reach its criteria |
| **Overjustification** | When an expected external reward replaces one's own motivation and reduces it |
| **Free choice** | Measure of intrinsic motivation: activity started without pressure or pending reward |
| **Diorama** | Small, closed 3D scene, loaded separately (Region 1: Los Campos, id `muelle`; El Cruce, id `plaza`; D-180) |
| **Low mode** | Minimal graphics configuration for modest PCs |
| **Text mode** | Playing by writing instead of speaking |
| **Voice budget** | Voice minutes available per week according to plan or institution |
| **DP (DECISION-PENDING)** | Decision the operator must make; it has a default for headless runs |
| **Vertical slice** | First playable portion from end to end at final quality (see DP-10) |
| **ATP** | Suitable for all audiences |
| **ECA Digital** | Brazil's Digital Statute of the Child and Adolescent (Lei 15.211/2025) |

---

## 8. Out of scope (v1 of mode 1)

1. Modes 2, 3, 4 and 5 (vision only, §4).
2. Grid building, tycoon, economy, money, shops, prices (DP-15).
3. Combat of any kind.
4. Multiplayer, chat between players, public profiles, friends, leaderboards.
5. Streaks, daily rewards, push notifications with reward.
6. Free chat without a frame with NPCs (DP-30).
7. Numeric scores or rankings of pronunciation (pronunciation is core, §2.4.7, but without numbers; D-044).
8. Native mobile or mobile web as a target platform (DP-31) — only do not close it off.
9. Language pairs other than ES→EN (ES→PT and PT→EN later).
10. AI generation of 3D models or sprites (D-153); own modeling beyond simple primitives.
11. Full physics / drivable vehicle (DP-14, DP-16).
12. Third-party content with rights (songs, videos).
13. LMS integrations, advanced exports, mission creation by teachers.
14. Indefinitely generated daily requests of the epilogue (post-arc) (DP-34).
15. VR (future destination with the same stack, epic E-XR; D-142).
16. Storage of raw audio on the server (only up to 20 clips on the player's device, D-155).

---

## 9. Open questions and register of pending decisions (DECISION-PENDING)

> Each DP has a **recommended default** that a headless run uses if the operator has not decided. On deciding, the operator replaces "Pending" with the decision and the date. Those marked **(architecture review)** are architecture ones: the architecture review decides them, the operator validates.

| ID | Decision | Options | Recommended default | Why | Affects |
|---|---|---|---|---|---|
| DP-01 | Game title | *Mundo Rush* / other | **Decided (2026-10-06, D-031): *Mundo Rush*** as working title. The world is *Kestrel Valley* (D-164); the village votes its name in M1.8 (D-173). The v0.1 options named the coastal town, retired (`02` §0.5) | Coherent with the world and theme | Brand, art |
| DP-02 | Name and form of the companion | Lumi firefly in a jar / other name / other form | **Lumi, firefly that came in a jar** (D-165, which supersedes the default of D-032; the name *Lumi* is kept) | Joins the light metaphor, visible progress (the network's trails) and the journey from home; justifies speaking in L1 | §2.4, art |
| DP-03 | Language in which Lumi speaks | Always L1 / always L2 / transition | L1 in A0-A1; mixed in A2; L2 except explanations in B1; adjustable by the player | Explaining in L1 lowers the load for beginners; moving to L2 increases exposure | §2.4, §2.10 |
| DP-04 | Default feedback mode | Accompanied / Note only / More help | **Accompanied** (light immediate signal + review at closing); "Note only" as a player option | [Probable, E31, E32]; [Proven, E34] | §2.4.4, A/B-1 |
| DP-05 | Silence: button vs automatic scaffolding | Button only / button + visual chip at 10 s / NPC offers a hint on its own after X s | **Button + silent visual chip at 10 s** (can be turned off); A/B-3 decides | [Hypothesis, E10]; risk of lack of push | §2.6, A/B-3 |
| DP-06 | End of the player's turn **(architecture review)** | VAD with long threshold + button / push to talk / button only | **VAD 2.5-4 s configurable + `Terminé` button**; push to talk as an option (default in classroom mode) | The NPC never interrupts and the player does not depend on a button | §2.6.2 |
| DP-07 | "Slower" technique **(architecture review)** | Instruction to the model / slower playback without changing pitch / TTS with parameter | The one that keeps naturalness with lower latency; measure | Perceived quality | §2.6.1 |
| DP-08 | Potions as a currency of voice minutes? (suggestion of the business analysis) | Yes / No | **No.** Separate voice budget in plain language | It would turn XP into payment for participating [Proven in lab, E12] | §2.5.5, business |
| DP-09 | Spendable potions? | Spent / accumulated / "poured" without being lost | **Poured** into nodes and remain visible; never lost | Keeps the brief's currency metaphor without punishment or economy | §2.7.4 |
| DP-10 | Scope of the first build (vertical slice) | Prologue only / prologue + Ch. 1 / prologue + Ch. 1-2 | **Prologue + Chapter 1** (Los Campos + El Cruce, `muelle` + `plaza` dioramas per D-180; the 14 neighbors of D-166; 11 missions + 6 board requests), ES→EN, PC web, voice + text, full accessibility, low mode — **Decided (2026-10-06, D-019):** with the script in force (`02` v0.2, reading D-182), in game mode (HD-2D map) + voice + text + pronunciation. | Fits in weeks; tests the full loop [Business §5.1, §6.7] | Roadmap |
| DP-11 | Setting | Fictional English-speaking agricultural valley / real place / other | **Fictional English-speaking agricultural valley (*Kestrel Valley*)**: brief premise (Guion v2, 2026-10-06); D-038 is superseded by D-164 | Avoids depicting real places; cheap diorama | §3 |
| DP-12 | Age policy at launch | Only 18+ direct and minors via institution/guardian / direct ATP with verification / adults only | **Direct accounts 18+; minors only via class code or guardian invitation with consent**; legal review before the first pilot with minors | Brief's ATP + ECA Digital [Business §6.5] | §2.17 |
| DP-13 | Retention of voice data and transcripts | Store audio / do not store; transcripts N days | **Do not store audio; transcripts 30 days**; only extracted items remain | Minimization; voice as personal data | §2.13 |
| DP-14 | Physics (Rapier) in mode 1 **(architecture review)** | Yes / No | **No**: kinematic controller with simple collisions — **Decided (2026-10-06, D-087):** Rapier later. | references research §4.4.3; weight and CPU | Stack |
| DP-15 | Building/tycoon/economy of the third-party proposal | Adopt in mode 1 / defer to mode 2 / discard | **Defer as a mode 2 candidate, without player money**; never in mode 1 — **Decided (2026-10-06, D-018).** | Clashes with "no money" and with the focus on speech | §1.9, §4.2 |
| DP-16 | Playful Bruno Simon-style vehicle | None / animated trip / drivable bicycle with physics | **Animated trip in v1**; drivable after the vertical slice if performance allows | Delight at no physics cost | §5.5 |
| DP-17 | Render style | Flat low-poly / cel-shading with outlines / mix | **Decided (2026-10-06, D-139): HD-2D** (pixel art sprites over 3D stage, post-processing by tier; D-077) | Legible, cheap | §5.3 |
| DP-18 | Camera | Assisted third person / fixed isometric / free | **Orthographic camera from above at an angle by presets** (`topdownOrtho` default, `isoOrtho` option; D-053, updated by D-139). **Today (D-209, 2026-10-30): third person behind the character (`thirdPerson`), with look by drag or Q/R, automatic recentering and continuous zoom up to the whole map; D-207 had previously moved to long-lens perspective** | Lesson from references research §4.4.2 | §5.5 |
| DP-19 | Source of animated characters | Kenney / Quaternius / commission | **Pixel art sprites from a pack with a registered license** (D-078, D-153); CC0 glTF only for volumes | AIs neither model nor animate | §5.7 |
| DP-20 | NPC voices | Real-time engine voices / separate TTS / actors | **Real-time engine voices** with the same voices for pre-generated lines | Timbre coherence | §5.8 |
| DP-21 | Scripted lines: cached TTS or human voice | TTS / humans | **Cached TTS** in v1; humans for trailer or if there is budget | Cost | §2.5.7 |
| DP-22 | Voice budget of the free and paid plan | Minutes per week | **Free: 10 min of voice per week + unlimited text** (example from business analysis §3.4); paid and institutional: to be defined after the cost experiment | Sustainable accessibility; "the one who pays funds the one who does not" | Business, §2.5.5 |
| DP-23 | Rankings or social components | None / private class / public | **None in mode 1** | P3 and minors | — |
| DP-24 | Reminders | None / opt-in without reward / push with reward | **Opt-in without reward**, configurable by player or teacher | Free choice as north-star metric | §2.2.3 |
| DP-25 | Initial placement | Exam / self-declaration + adaptation | **Self-declaration (4 options) + adaptation in the prologue** | Less anxiety | §2.12 |
| DP-26 | English variant and accents | General American / British / mix | **Clear general in A0-A1; from A2, 2 NPCs with other accents appear**; comprehension accepts all variants | Gradual exposure | §5.8 |
| DP-27 | Pronunciation feedback | Score / only if it breaks meaning / none | **Decided (2026-10-06, D-044): core from v1** (§2.4.7): scripted moments with feedback, background detection without interrupting, drills; only types that pass the F0.1 bar (D-151) | references research §4.2.3 | §2.4.4 |
| DP-28 | Interface and Lumi Spanish variant | Rioplatense (voseo) / neutral (tuteo) / both | **Rioplatense with voseo for Argentina**; neutral variant when expanding | Argentina-first market | UI, voice |
| DP-29 | Teacher access to minors' transcripts | Never / aggregated / raw | **Only aggregated reports by can-do; raw transcripts never by default**; safety events according to the institution's policy | Minors' privacy | §2.17, §2.18 |
| DP-30 | Free chat without a frame with NPCs | No / adults only / all | **Not in v1** | Safety and cost | §2.17 |
| DP-31 | Mobile | v1 / later | **Later**; v1 does not close off the path (responsive HUD, touch targets) | Brief: PC first | §1.6 |
| DP-32 | End-of-session suggestion | None / at ~20 min / after N missions | **After 2-4 missions or ~20 min, once, and then every 15 min** | Short sessions [Probable, E23] | §2.2.2 |
| DP-33 | Show CEFR labels to the player | Yes / no / by age | **Minors: only can-do; adults and teachers: can-do + CEFR** | Avoid pressure on children | §2.11 |
| DP-34 | Epilogue with generated daily requests | Yes / no | **Yes, but outside v1** | Infinite content with review | §3.7 |
| DP-35 | AI provider and data residency for minors | Gemini / other / mixed | **Legal review before the pilot with minors**; meanwhile the reuse of a previous voice prototype (Gemini) holds for adults | ECA Digital, LGPD, Law 25.326 | §2.17 |
| DP-36 | Main voice route **(architecture review + experiment #1)** | Real time (Gemini Live) / STT+LLM+TTS cascade / mixed | **Decide with the business analysis's cost probe (#1)**; meanwhile, real time for scenes and cascade for text mode with audio — **Decided (2026-10-06, D-092): hybrid** (Live now + cascade; F0.1 decides the pilot's, D-149). | Quadratic cost [Business §3.2] | §2.5.2 |
| DP-37 | Output moderation in real-time voice **(architecture review)** | Filter parallel text and cut audio / delay audio / prompt only | **Filter the parallel text and cut the audio if it triggers**, with latency measurement | Minors | §2.17 |
| DP-38 | Protocol for a minor's risk signals | Define with specialists | **Scripted containment line + local resource + event according to policy**; specialist review before the pilot | Safety | §2.17.1 |
| DP-39 | Identity art (Lumi and its jar, logo) | By code with primitives / commission to an artist | **By code with primitives in v1**; commission if there is budget | AIs do not model | §5.7 |
| DP-40 | Music | Own / free license / commission | **Verified free license (CC0/CC-BY with attribution) in v1**; commission later | Cost | §5.8 |
| DP-41 | Time of day | Real time / by progress | **By progress and by session**, not real clock | Narrative control, performance | §3.2 |
| DP-42 | Configurable avatar pronouns | Yes / no | **Yes** (he/she/they), optional | Inclusion; NPCs address the player | §3.3.1 |

### 9.1 Open evidence questions (they are not operator decisions; they are resolved by measuring)

1. **Silence button:** no study [Hypothesis, E10] → A/B-3.
2. **Dose and form of corrective feedback in AI dialogue** [Disputed] → A/B-1 and density parameter (§2.4.3).
3. **Long-term effect of LLMs**, beyond novelty (E8) → delayed test in pilots.
4. **Portuguese as L2 for Spanish speakers:** no specific source; typological closeness may change which errors matter and how much to correct [Research §5.4] → investigate before the ES→PT pair.
5. **Neurodiversity, low literacy, low bandwidth:** no open quantitative evidence [Research §5.5] → tests with users and specialists.
6. **XP that unlocks skills in an L2 game:** no direct study (E16) → A/B-2.
7. **Dropout in gamified apps with independent data** [Research §5.7] → measure our own retention.
8. **Minors:** adolescents could gain more with dialogue and children suffer more from reward undermining [Research §5.8] → pilots with an institution.
9. **Speech recognition accuracy with a Rioplatense accent** [References §4.2.3] → measure in the cost probe.
10. **Real performance on an Argentine school PC** [References §4.4.5; business analysis #5] → benchmark before closing the stack.

---

## 10. Cited sources

All external sources were read and graded by the source reports; this GDD adds no new sources.

- **[Brief]** (internal document) (operator decisions, 2026-10-04; premise "Guion v2 + modo director", 2026-10-06).
- **[Business]** (internal document) (market, voice unit economics, business branches, risks, experiments).
- **[Research]** (internal document) and `20-evidencia.md` (E1-E37; Bibauw et al. 2022; Hou & Min 2026; Wang et al. 2026; Li, Wang & Yang 2025; Teimouri et al. 2019; Botes et al. 2022; Lyster & Saito 2010; Xu & Zeng 2023; Li 2018; Deci, Koestner & Ryan 1999; Mekler et al. 2017; Ryan, Rigby & Przybylski 2006; Sailer & Homner 2020; Clark et al. 2016; Bryfonski & McKay 2019; Novak et al. 2019; kim-webb-2022; belardi-2021; schimke-2021/2023; beauchemin-2024; fazekas-2020).
- **[References]** (internal document) (Terra Alia, Influent, Noun Town, Newcomer, Talk to Me Human; implications for camera, performance and stack).
- **[Voice prototype]** a previous voice prototype (server.js: WebSocket proxy to Gemini Live; teacher-config/rules.md: disfluency rule, tone, memory; teacher-config/prompts.json: conversation and correction modes; teacher-config/knowledge/sla-research.md: error classification).
- **Operator directive on aesthetics and assets:** cel-shaded or low-poly (Townscaper, A Short Hike), Bruno Simon's portfolio, free packs (Kenney.nl, glTF/GLB) in `public/` placed by code (2026-10-05); **replaced in style by HD-2D** (D-139, 2026-10-06; references in `docs/refs/estetica/`).
- **[Pronunciation references]** `docs/research/pronunciacion-2026-10-06.md` and **[Voice references]** `docs/research/voz-costo-valor-2026-10-06.md` (2026-10-06).
- **Third-party proposal ("prompt for Claude Code")** shared by the operator: stack and architecture rules (§1.9).

---

*End of GDD v0.3. Next step according to planning: review of the architecture review (architecture, DPs marked "(architecture review)") and operator decision on DP-10 (vertical slice scope) before the phased roadmap turns this document into executable plans.*
