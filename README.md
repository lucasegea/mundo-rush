# Mundo Rush

**A browser game where you learn a second language by living in a world and talking to its people. You choose the
world: the book or film you love becomes the game.**

One engine, any universe. The player picks a book or a film. Mundo Rush researches that universe in the background,
asks the player a few questions to finish defining it, and builds a playable world from it: its places, its
characters, its missions and what there is to discover. The engine and the learning method are always the same;
only the world changes.

Inside that world, you walk a 3D open world in third person, meet characters, and talk to them out loud, in the language you are
learning. The characters answer by voice, in character, and an AI evaluates what you said against the goals of the
scene: did you ask the right question, did you understand, did you get your point across. A scene ends when you
actually achieve something in the conversation, not when you pick the right option.

For teenagers and adults. The first fully supported languages will be **Spanish, English and Portuguese** (a native
speaker of any of them learns either of the others); the pair playable today is Spanish → English.

> Status: working prototype, in active development. Built and played on PC in the browser.

## What makes it different

- **Conversation is the game mechanic.** Most language apps teach recognition and isolated phrases with habit
  mechanics (streaks, leagues). Here the core loop is a real spoken conversation with a goal, inside a world with
  consequences.
- **Evaluation by meters, not by right answers.** A separate model labels each exchange (understanding, asking,
  following up, using what you learned) and the game adds it up. The character never breaks the scene to correct
  you.
- **Short scenes by design.** Real-time voice gets more expensive the longer a conversation runs, so scenes are
  short and repeatable. That also matches what the learning research recommends.
- **Your universe, the same engine.** The player chooses the book or film. A pipeline researches it, defines the
  world (with a short questionnaire to the player when choices are open) and emits a universe: places, characters,
  missions and the knowledge to discover, all checked against a schema. The engine and the learning method never
  change, so motivation comes from a story the player already cares about.
- **Content as data.** Worlds, characters, missions, conversations and safety rules are YAML files compiled and
  validated at build time. A new universe is new content, not new code.
- **Safety built in.** Model output goes through moderation (in text mode, before it is shown), with containment
  rules for sensitive topics, because the audience includes teenagers.

## What is built today

| Area | State |
|---|---|
| 3D open world | Third-person camera, continuous zoom to a full-map view, relief terrain, trees, grass, minimap with the characters still to visit, quality tiers for integrated GPUs |
| Characters | Animated rigs (CC0 assets), name labels, two-shot camera during conversations |
| Voice conversations | Real-time voice with Gemini Live; falls back to text if voice is unavailable |
| Evaluation | Observer and judge models score each turn; progress is saved when a scene succeeds |
| Universes | Two playable universes on the same engine: an original village story, and a test universe built from a book (the Potosí chapter of Eduardo Galeano's *Las venas abiertas de América Latina*), used to prove that a book can become a world |
| Universe pipeline | The universe contract and its final stage are real: the emit stage writes a complete, validated universe that the engine plays unchanged. The earlier stages (ingest, research, world definition, player questionnaire) are designed and stubbed; for the test universe their output was written by hand |
| Quality gates | Type checks, lint with module boundaries, about 2,000 unit tests, content validation, accessibility contrast check, bundle and asset budgets |

## Tech

TypeScript end to end. Web client: React, three.js with React Three Fiber, Zustand, Vite. Server: Node.js with
WebSockets. AI: Google Gemini (Live API for voice, text models for the character, the observer and the judge).
Schemas and the content compiler use zod. Tests with Vitest.

```
apps/web        the game client (world, UI, audio, state)
apps/server     scene server: conversations, evaluation, moderation, progress
packages/core   pure game logic (movement, conversation engine), no DOM or Node
packages/*      protocol, content schema, art palette
content/        the game content as YAML (the default universe + content/universes/)
tooling/        book analyzer and a developer "director" mode
docs/           game design (GDD), narrative, architecture and ADRs, in Spanish
```

## Run it locally

Requirements: Node 22.18 or newer and npm.

```bash
npm ci
cp .env.example .env        # then set LG_GEMINI_API_KEY (Google AI Studio)
npm run dev:play -- --universe=U-GALEANO
```

Open the URL it prints (`http://127.0.0.1:5173/?universe=U-GALEANO`). Walk with WASD or by clicking the ground,
press **E** next to a character to talk, **V** for the full map.

Without an API key, set `LG_FAKE_MODELS=1` in `.env`: characters answer with scripted lines so you can walk the
whole flow without spending API credit. Without `--universe`, the game plays the default village story.

Run every quality gate with `npm run verify`.

## Documentation

The design documents are in Spanish:

- [`docs/01-gdd.md`](docs/01-gdd.md): game design document (vision, the five modes, mode 1 in detail)
- [`docs/02-narrativa-guion.md`](docs/02-narrativa-guion.md): narrative and script
- [`docs/03-arquitectura.md`](docs/03-arquitectura.md): architecture
- [`docs/adr/`](docs/adr/): architecture decision records
- [`docs/estetica/`](docs/estetica/): art direction proposals
- [`docs/PLAY.md`](docs/PLAY.md): how to play locally

## License

Copyright © 2026 Lucas Egea. **All rights reserved.** The source is published for evaluation only; no license is
granted to copy, modify or distribute it. Third-party assets and code keep their own licenses (CC0, MIT and
others), listed in `content/assets-registry.yaml`, `content/code-registry.yaml` and `docs/licencias/`.
