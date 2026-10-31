# Play by voice on your computer (operator mode)

How to start the game, walk up to an NPC and **talk to it by voice** (microphone → our own server → Gemini Live →
the NPC's voice). F5.2-lite status: client-side voice + transport over the scene WebSocket; see "Known limits".

## 1. Start

Requirements: Node 22.18+, `npm ci` run once, and an `.env` at the repo root with `LG_GEMINI_API_KEY` (the file
is in `.gitignore`; `.env.example` has the names).

```bash
npm run dev:play
```

That builds the content (`build:content`) and starts two processes:

| Process | Address | What it does |
|---|---|---|
| `apps/server` | `http://127.0.0.1:8787` | scene server in **operator mode** (`LG_OPERATOR_MODE=1`, set by the script): token without login, `op-local` account, loopback only |
| Vite (`apps/web`) | `http://127.0.0.1:5173` | the game; proxies `/scene-token` and the `/scene` WebSocket to the server |

Open **http://127.0.0.1:5173** in Chrome or Edge (use `127.0.0.1` or `localhost`: the microphone needs a secure
origin). `Ctrl+C` in the terminal stops both processes; if one dies, the script stops the other.

The script's first line says which variables it found, **presence only** (never values):
`[play] .env leído · LG_GEMINI_API_KEY presente · …`. The server repeats the same and ends with `voz: live`.

## 1b. Play a book (universe `U-GALEANO`)

```bash
npm run dev:play -- --universe=U-GALEANO
```

Builds `content/universes/U-GALEANO/` and opens the client at `http://127.0.0.1:5173/?universe=U-GALEANO` (server and
client read the same universe). Without `--universe` you play the campesino one, as always. The book's progress is
saved separately (`apps/server/data/evidence.U-GALEANO.jsonl`, `safety.U-GALEANO.jsonl`, `encounters.U-GALEANO.json`), so it does not
overwrite the campesino's.

1. In the menu: **Jugar en el mapa** (it stays disabled for a moment until the catalog loads).
2. The map is the Cerro Rico: dirt road, stone, bushes and a mine entrance. Three people: **El mitayo**, **El Cerro Rico**
   and **El contador de la corona**. The engine sets the order: first the mitayo, then the cerro, and only
   then does the contador receive you (before that he says you do not know each other yet). Click on the person or **T** / **E** nearby.
3. With the contador you play the conversation by meters until the closing ("The milk was never ours").
4. Text: open the URL with `&voz=0`. Voice with Gemini Live: with `LG_GEMINI_API_KEY` in `.env`, as in the campesino.

## 1c. On-demand browser walk (narrow exception to D-016)

```bash
npm run walk:browser
```

A script (`scripts/dev/browser-walk.ts`), outside `npm run verify`, that starts its own server and Vite on free
ports (operator mode, scripted models, in-memory stores: it never touches `apps/server/data`), opens the Chromium that is already
in the Playwright cache (it downloads nothing; `LG_CHROMIUM=<path>` to pick another) and walks through the game: Galeano
(AC12..AC16) and the campesino (AC17). Screenshots are left in
`_(internal document). It exits with a non-zero code if anything fails.

- **The browser always closes when done** (success, failure or thrown error); only the processes the script
  started are killed. `npm run walk:browser -- --fail-on-purpose` fails on purpose with the browser open, to check that no
  chromium is left alive.
- `LG_WALK_HEADED=1` opens the window; `LG_WALK_DEBUG=1` prints the WebSocket messages.
- Without Chromium in the cache it warns and exits with 2.

## 2. Reach the NPC

1. In the menu: **Jugar en el mapa**.
2. Walk with **WASD** or the **arrow keys** (or click on the floor). **Inés** (M0.1, the foreman) is to the right and a
   bit up from where you spawn. A click on her makes the character walk to her side. Once close,
   **T** (or **E**, or another click on her) opens the scene.
3. Without WebGL, or if you prefer: **Modo solo diálogo** → pick Inés's place → **Hablar con Inés Calder**.

### Map controls (third person, D-209)

The camera follows behind the character. If you never touch it, it recenters by itself.

| Control | What it does |
|---|---|
| **WASD** or **arrows** | walk, relative to the camera (W = forward in the view) |
| **Shift** (held) | run |
| **Q** / **R** (held) | turn the view left / right |
| **Drag** with the mouse | look around (horizontal turns, vertical raises or lowers the camera); a drag does not walk, even if you release it over the floor |
| **Click** on the floor or on a person | walk there |
| **Wheel**, **`+`** / **`-`** or the zoom buttons | zoom in and out smoothly, from 2.5 m up to the whole map (`+` and `-` also work on a Spanish keyboard) |
| **V** | see the whole map; another V returns to the previous distance |
| **T** or **E** near a person | open the scene |
| **Minimap** (bottom right) | 60 m around, heading up; red rings are the people whose scene you have not yet closed, and a red arrow on the edge marks those farther away. It is hidden during the chat |

When the scene opens the browser **asks for microphone permission** (the first time). Accept it.

## 3. Talk

The scene runs in slow turns: **nobody interrupts you** and the NPC does not talk over you.

| Control | What it does |
|---|---|
| **Hold down "Hablar"** | push-to-talk: you talk while you hold it; on release your turn closes |
| **Tap "Hablar"** and then **"Terminé"** | opens your turn and you close it whenever you want (no rush, even if you stay silent) |
| **Space / Enter** with focus on "Hablar" | opens the turn; again, it closes it |
| **Pasar el turno** | the usual 4 options (hint, repeat, simpler, you go on) |
| **Escape** | leaves the scene |

What you will see:

- **"Tu turno…"** (colored dot): you can talk. The **level meter** moves when you talk: use it to check
  the microphone before starting.
- **"Te escucho…"**: your turn is open. Below appears **"Te oigo: …"** with what the server is understanding.
- **"Inés está pensando…"**: you closed the turn; the NPC is preparing the reply.
- **"Habla Inés…"**: her voice is playing. Until it finishes you cannot open another turn.
- Your sentence (as the server understood it) and the NPC's reply are written in the history.

Speak in English. In M0.1 the scene is completed when you greet **and** say your name ("Hello! I'm Nico."); if you want to
chat more, hold back the name.

## 3b. Chat with Harlan, the farmer (free conversation, A2)

An **unscripted** scene: Harlan Moss has his own life (a sheet with facts, secrets and what he wants), you
have yours (your character's), and neither knows what the other wants. Design: `docs/adr/ADR-027-conversation-by-meters.md`.

**How to get there.** On the map, Harlan is **to the right and down** from where you spawn, next to the shed (the big
block). Get close and **T** / **E** / click, same as with Inés. In **Modo solo diálogo**: place **Granero de Harlan** →
**Hablar con Harlan Moss**. It needs no introduction or earlier missions.

**What you will see.** Above the history, the chat panel:

- **"Conocer a Harlan"**: the bar fills only if there is **back and forth**. Ask him about his life, follow up on what
  he tells you (a follow-up is worth more than changing topic) and **tell him things about your character** (made up: game
  name, where they come from, the crew, what they like). If you ask two questions in a row without telling anything about yourself, the
  bar stalls and Harlan asks you.
- **"Lo que sabés de Harlan"**: fills up with what he tells you. The more personal things he only tells once
  he trusts you.
- **Help**: if you get stuck (or 20 s pass in silence), a hint from Lumi appears; if you stay stuck (40 s), suggested
  phrases in English. In text, tap a phrase and it lands in the box; in voice, read it aloud.
- When the first bar fills, **"Conseguir lo que viniste a buscar"** opens and Harlan asks what brings you. Only
  then can you talk about the errand. Tell him why you came, explain what it is for and ask him politely.
- When you succeed: **"¡Harlan aceptó! Despedite o dale las gracias."** Your next sentence closes the scene with the
  scripted line (the numbers are never shown).

**What to try.** Ask him for something right away (he does not talk business with a stranger). Keep asking without telling
anything about yourself (it stalls). Talk to him in Spanish (he asks for English and the help kicks in). Ask him about the seeds (he deflects).
Tell him something about yourself right after he tells you something (counts for more). At 9 minutes Harlan says goodbye in his next reply (10 as a hard cap). If
it is cut off before you succeed, **what you already know about him is saved**: next time you continue from there.

**Restart the chat with Harlan** (to play it again from scratch):

```bash
npm run dev:reset-farmer
```

It deletes only Harlan's data (what you knew about him, the bars and the fact that the mission was done). The rest of your progress
is untouched, and it can be run while the game is running: the next scene starts from zero. For another NPC with a sheet:
`npm run dev:reset-encounter -- --npc NPC-X`.

Without a key (`LG_FAKE_MODELS=1`) the chat works with a judge scripted by words: it is good for seeing the bars and the phase
change, not for evaluating. The real judge is Gemini (role `judge` in `apps/server/config/models.yaml`).

## 4. If something does not work

| Symptom | What is happening / what to do |
|---|---|
| "No hay permiso para usar el micrófono: seguimos por texto." | You denied it. Enable it for `127.0.0.1:5173` (icon to the left of the address) and re-enter the scene. Meanwhile you play by text |
| "No encontramos un micrófono" / "lo está usando otra aplicación" | Connect one or close the other app (Zoom, Meet…) and re-enter |
| "No llegó voz del micrófono…" after a turn | The meter did not move: wrong or muted microphone in the system. Pick it in the browser's site settings |
| "No te entendimos" | Live transcribed nothing: speak closer or a bit louder |
| "La voz no está disponible ahora; la escena sigue por texto." | The server could not open the Live session (network, invalid key, model down). Look at the server terminal. Without `LG_GEMINI_API_KEY` the script warns at startup |
| "No hay conexión con el servidor de escenas" | The server is not up or died: look at the terminal and run `npm run dev:play` again |
| Port 5173 or 8787 busy | Another process is using them. For the server, add `LG_PORT=8788` to `.env` (the Vite proxy follows it). 5173 is fixed: close the other Vite |
| Inés says "ahora no hay nada para hacer acá" | You already completed M0.1: the real progress lives in `apps/server/data/evidence.jsonl`. To repeat the scene, **move** that file to another name (do not delete it: it is your progress) and restart the server. Leaving a scene halfway saves nothing |
| Harlan says "ahora no hay nada para hacer acá" | You already got what you were after: `npm run dev:reset-farmer` and talk to him again |
| The bars do not move with Harlan | The judge did not respond: look at the server terminal (it says "juez de conversación sin resultado" with the reason, never your text). That exchange does not count; the chat continues |
| You want to force text | Open `http://127.0.0.1:5173/?voz=0` |
| You cannot hear the NPC | Raise the system/tab volume. Audio starts with your first tap on "Hablar" (autoplay policy) |

## 5. Costs and privacy

- Each turn is recorded in the cost ledger (`apps/server/data/cost-ledger.jsonl`). In operator mode there is **no voice
  budget cutoff**: if the average exceeds US$0.05/min, the server only prints an alert (D-027, D-135).
- The server **does not store audio**: the turn's clip lives in memory for the observer and is released when it ends or after
  10 s (D-108). The client does not store audio either.
- The key never reaches the browser: the client talks only to our own server.

## Known limits (F5.2-lite)

- Scripted lines (opening, closing) are shown as text: they do not have cached audio yet (F8).
- No moderation holdback on Live's voice (F5.1b): the NPC's line is moderated before it is written, but its audio
  plays as it arrives.
- "Slower" (OLA time-stretch) and the VAD that closes the turn only after 3 s of silence are out of this run:
  the turn is always closed by the player.
- Tested with tests (fake Live server, fake audio engine) and a short smoke against the real API (the session opens and
  audio comes back). The full run with a real microphone in the browser is the operator's first test.

## For conversation systems (hooks)

`scene-runtime` exposes conversation hooks (`apps/server/src/scene-runtime/hooks.ts`): `onSceneStart`, `onTurn`
(each player and NPC turn, by text or voice; in voice also what is being heard with `final: false`) and
`onSceneEnd`. They are passed to `createGameServer({ conversation })`. A hook that throws (or an async hook whose promise
rejects) does not cut the scene. A2: `onSceneStart` also receives the scene's conversation sheet and a `control`
(`setNpcBrief`, `sendState`, `complete`); the meters system (`apps/server/src/conversation/`) is one of
these systems, plugged in by default when the server has a judge and an encounters store.
