# 03 — Target technical architecture

**Project:** learning-game (provisional title *Mundo Rush*, D-031) · **Document:** architecture v0.3 · **Date:** 2026-10-06 (v0.1: 2026-10-05) · **Author:** architecture review (architect, the development environment); v0.2 integration: planning
**v0.2 (2026-10-06):** integrates the operator decisions of 2026-10-06 (`00-decisiones.md` §1.1), `07-stack-objetivo.md` (architecture review: target stack and seams R10-R15) and the studies from the references research `research/voz-costo-valor-2026-10-06.md` and `research/pronunciacion-2026-10-06.md`. New sections: §2.9 (HD-2D in R3F), §5.11 (hybrid voice), §5.12 (pronunciation service); rules R10-R15 in §3.1; ADR-022 to ADR-025. Where v0.1 said low-poly toon, third-person camera or "pronunciation out of scope", the new text governs.
**v0.3 (2026-10-06, planning integration; the form is reviewed by architecture review):** (a) exact ESLint config of P0 (`docs/reports/P0-2026-10-06.md` §2.3) applied in §4.3-§4.3.2 (`import-x/no-restricted-paths` over resolved paths); (b) new canonical paths from P0 §3 (composition root, `state/actions.ts`, `@lg/*` names, operator persistence D-157, compiled output outside git D-159, `VoiceTransport`, pure DSP); (c) **director mode** for development only (§6.5, ADR-026; D-187, confirmed by the operator in the brief); (d) **foundations layer and visible network** on the map (§2.9, §6.4.3, §6.4.8; D-169, D-194); (e) content folders of `02` v0.2 (`fundaciones/`, `saberes/`, `red/`, `mystery/sobres.yaml`). The "how" amendments of P0 §1 apply with the default of D-196.
**Plan estetica-c M7 (2026-10-13, build; D-207, D-208):** direction C, "Painted diorama" (`docs/art-direction/proposal-c-painted-diorama.md`, art bible), supersedes HD-2D (D-139, D-154) in §1 (C9, C14), §2.7.1, §2.8, §2.9, §3.1 (diagram and R11), §3.3 (`settings` row), §4.2, §6.4, §10 (R16) and §11 (ADR-028, which supersedes ADR-022 and amends ADR-011). The HD-2D code (tiles per chunk, pixel art, billboards, orthographic cameras) was removed from the tree. §9 still tells the sequence as it was built.
**Plan open-world-3d (2026-10-30, build; D-209):** third-person open world on top of the painted diorama. Amends §1 (C14), §2.7.1 (outlines, tilt-shift and the open-world table), §2.8 (ten material classes), §2.9 (`thirdPerson` camera, terrain of about 140 × 100 m with relief, grass, trees, sky, minimap and budget), §3.1 (R11), §6.4.2 (D1 licenses) and §6.5.1 (`data-lg-dev-factors` marker), and annotates the ADR-028 row in §11. The working decisions D-818 to D-846 are rewritten in `00-decisiones.md`, row D-209 and "D-209 in detail".
**Status:** complete proposal for mode 1 (vertical slice and v1). The decisions marked `DP-…` await operator validation; each one carries a default that a headless run uses without stopping.
**Language:** Spanish. Code identifiers, package names and protocol messages, in English (see §3.4).

> **Purpose of this document, in one sentence:** to fix the technical shape of the game (stack, layers, folders, data contracts, voice flow, content, backend, tests and risks) in enough detail for a headless run to build mode 1 without inventing architecture and without violating the GDD rules.

---

## Index

0. How to use this document (contract for headless runs)
1. Constraints (where each shape comes from)
2. Stack verdict, piece by piece, and performance budget
3. Architecture rules, layers and state (Zustand)
4. Repository skeleton, conventions and module boundaries
5. Voice and AI pipeline (reuse of a previous voice prototype)
6. Content and asset pipeline
7. Data and backend (accounts, minors, persistence, institutions, telemetry, security)
8. Test strategy compatible with headless runs
9. Technical build sequence and gates
10. Risks
11. ADRs (architecture decision record)
12. Pending architecture decisions (DP) and resolution of the GDD DPs marked "(architecture review)"
13. Sources and inputs cited

---

## 0. How to use this document (contract for headless runs)

1. **Order of authority:** the only one in force is that of `00-decisiones.md` §0.3 (brief and decided > defaults of `00` > `04` > `03` > `01` > `02` for building). Every contradiction is reported. The defaults of the `DP-A` items in this document are superseded by those of `00-decisiones.md` (§9): if they differ, the register wins. **The paths in §4.2 ("Canonical paths" table) and the budgets in §2.7.3 are the only source of paths and numbers**: `04` and `05` cite them, they do not repeat them.
2. **Every `DP-A..` has a default.** If the operator has not decided, the run uses the default, notes it in its report and moves on. It never adopts or discards in silence something marked as DP.
3. **The "Accepted" ADRs are contract.** A run that needs to depart from an ADR does not do so: it writes a proposal for a new ADR in its report and continues with the current one.
4. **Module boundaries (§4.3) are verified with lint.** If a run needs to cross a boundary, the design is wrong: an action is added to the store, not an import.
5. **Do not assume APIs from memory.** Library and model versions change fast. At bootstrap, exact versions are pinned in the lockfile and every API is verified against the documentation of the installed version. AI model names live in configuration, never in code (§5.10).
6. **Never Playwright or an automated browser.** UI verification is `vitest` + `tsc` + `lint`; the operator reviews in the browser (§8).
7. **Secrets:** no API key reaches the browser, a log, a fixture or a commit (§5.3, §7.8).
8. **No personal data** in content, fixtures, logs or reports.

Tags used: **[Brief]**, **[GDD §x]**, **[Business §x]**, **[Research §x / Ex]**, **[References §x]**, **[LT]** = what was read in the code of a previous voice prototype on 2026-10-05.

---

## 1. Constraints (where each shape comes from)

No shape in this document is justified without one of these constraints. If a run finds that a constraint has changed, the decisions that depend on it are reviewed.

| # | Constraint | Source | What it forces in the architecture |
|---|---|---|---|
| C1 | Runs in the browser of a modest PC (today the operator's, D-135; tomorrow a school's), with nothing to install; low graphics mode mandatory; interactive in < 15 s on the target PC | [GDD §1.3 P1, §2.14, §5.7], [References §4.4.5], [Business §7 #5] | Hard performance budget (§2.7), quality tiers, loading by neighborhood, 3D in a deferred chunk, "dialog only" mode without WebGL |
| C2 | The product sells speech, not graphics; the client's CPU and network are used for real-time audio, which competes with rendering | [References §4.4], [Business §2.1] | Audio has priority: AudioWorklet off the main thread, lowering the render rate during conversations (§2.7.4) |
| C3 | Voice cost is quadratic in session length (the context is re-billed per turn); target ≤ US$0.03/active min, dead if nothing brings it below US$0.05/min | [Business §3.2, §3.3, §7 #1] | One voice session per 2-4 min scene (cap 5), minimal context, do not transmit silence, per-minute cost accounting from day 1 |
| C4 | Reuse of `un prototipo de voz anterior` (Gemini Live, ~15 min cap on the server side) | [Brief] | The voice gateway is born from the LT code (§5.2) |
| C5 | ATP audience: minors enter through an institution or guardian; Argentina first (Law 25.326), then Brazil (LGPD, ECA Digital in force since 2026-03-17) | [Brief], [GDD §2.17], [Business §6.5] | Data minimization, no stored audio, double moderation, consent, AI provider suitable for minors (§7) |
| C6 | Mainly the institution pays; "whoever pays funds whoever doesn't"; free version with limited voice and unlimited text | [Brief], [GDD DP-22] | Institution → class → student model, voice-minute pools, first-class text mode |
| C7 | The 3D world and the DOM UI never talk to each other directly; state is the single source of truth | [GDD §1.4.8], third-party proposal | Single store (Zustand) + rules core in pure TS + module boundaries verified by lint (§3, §4.3) |
| C8 | Mode 1 without money or economy; tycoon/building only as a mode 2 candidate | [GDD §1.4.1, DP-15] | There is no economy slice; mode 2 is added as a new module without touching the core (§3.6) |
| C9 | Code AIs do not model 3D by hand: CC0 3D packs with a registered license, repainted to the palette by script (D-153 re-read by D-207), and props rounded by code, placed by code | Operator directive, [GDD §5.7], D-207 | Asset pipeline with license register, diorama layout as data (§6.4) |
| C10 | Headless development in many runs | Operator's intent | Content as schema-validated data, deterministic testable core, automatic gates without a browser (§8, §9) |
| C11 | No Playwright or automated browser; UI = vitest + tsc + lint; the operator looks in the browser | Operator rule | Test pyramid without browser E2E; budget verification by scripts (§8). Bounded exception (row of 2026-10-26 in `00-decisiones.md`, RATIFIED 2026-10-27): an on-demand browser walk, outside `verify`, that always closes the browser when done |
| C12 | Mobile open, not the starting point | [Brief], [GDD DP-31] | Responsive, touch-first HUD from day 1; nothing in the core depends on mouse or keyboard |
| C13 | Team of 1-2 people, scope in weeks | [Business §6.7] | Bias toward fewer pieces: no microservices, no queues, a single server, a single database |
| C14 | **"Painted diorama"** art (direction C) decided by the operator: rounded 3D painted per vertex, 4-band toon with brushstroke, long lens from above on the diagonal and two-shot conversation framing; supersedes HD-2D (D-139). **Amended by D-209 (2026-10-30):** the map camera becomes third person (`thirdPerson`, continuous zoom out to the whole map) in an open world of about 140 × 100 m; the two-shot conversation framing stays | D-207 (2026-10-12), D-209 (2026-10-30) | Painted diorama render in R3F (§2.9, ADR-028), camera by presets, postprocessing as a tier effect, pipeline of repainted 3D assets (§6.4) |
| C15 | A stack that does not force a move: web today; desktop app, mobile and, eventually, VR later | D-086 / D-136 (2026-10-06), `07-stack-objetivo.md` | Seams R10-R15 from day 1 (§3.1), without building the destinations yet |
| C16 | Pronunciation is core from v1, without false alarms and without interrupting | D-044 (2026-10-06), [References pronunciation] | Server-side pronunciation service behind interfaces (§5.12); the turn clip is shared by observer and pronunciation; only error types that pass the F0.1 bar (D-151) |

What I do **not** have as a constraint, and therefore do not invent: expected number of concurrent users (I assume a pilot of hundreds, not thousands; §7.9), monthly infrastructure budget, and the result of the cost probe (#1) and the hardware benchmark (#5). Decisions that depend on those numbers stay as DPs with a reversible default.

---

## 2. Stack verdict, piece by piece, and performance budget

### 2.1 Summary

| Piece | Verdict | Alternatives considered | What is given up |
|---|---|---|---|
| Vite + React + TypeScript | **Adopt** | Next.js; Svelte/SvelteKit; vanilla TS | Server-side rendering (we do not need it) |
| React Three Fiber + drei (on top of three.js) | **Adopt, with discipline** | imperative three.js; Babylon.js; PlayCanvas; game engine exported to web (Godot/Unity); 2D (Pixi/Phaser) | A bit of React overhead in the render loop; depending on the pmndrs ecosystem |
| Rapier (physics) | **Not in mode 1** (resolves DP-14). Kinematic controller over a walkability grid + A* + 2D collisions in the XZ plane | Rapier; cannon-es; three-mesh-bvh for collisions against mesh | The Bruno Simon-style "physical toy"; reserved for the bicycle (DP-16) as an optional chunk |
| Zustand | **Adopt** as a single store with slices; rules in a pure TS core | Redux Toolkit; Jotai; XState as store; signals | Automatic immutability guarantees (we provide them with pure core functions) |
| HUD in React DOM + Tailwind | **Adopt** | CSS Modules; UI inside the canvas (troika-text, drei Html) | Nothing important; Tailwind demands token discipline |
| Gemini Live via own gateway (from LT) | **Adopt as the initial voice path** (DP-36 interim) | STT + LLM + TTS cascade; OpenAI Realtime; ephemeral tokens directly from the browser | Immediate provider independence (offset with adapters, §5.10) |
| Node.js + TypeScript for the server | **Adopt** | Bun (LT has a `server.ts` for Bun); Deno; Python | Bun's startup speed; we gain the runtime LT already runs in production (`server.js` uses Node + `ws`) |
| Managed Postgres | **Adopt** | SQLite/JSON files (what LT uses); Firestore; Supabase with its auth | Simplicity of local files; we gain multi-user and queries for reports |

### 2.2 Vite + React + TypeScript

- **Why:** the game is a client SPA with a rich DOM layer (HUD, notebook, settings, onboarding, teacher panel) and a 3D canvas. React is the most direct way for the DOM UI and the 3D (via R3F) to share the same component model and the same store. Vite gives fast builds, code-splitting through dynamic `import()` and multiple entries (game and teacher panel) with no special configuration.
- **Alternatives:** Next.js adds SSR and server routes that we do not use and complicates the long-lived WebSocket (C13). Svelte performs somewhat better in DOM but R3F has no mature equivalent in Svelte (Threlte exists, with a smaller ecosystem). Vanilla TS forces hand-writing the UI's reactivity.
- **Mandatory configuration:** TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`; ESLint with boundary rules (§4.3); multi-page build with `index.html` (game) and `docente.html` (teacher panel, no 3D).
- **Possible failure:** the React + three bundle grows out of control. Mitigated with a bundle budget verified in CI (§2.7.3).

### 2.3 React Three Fiber + drei

- **Why:** it lets us write the world as declarative components (a rule from the third-party proposal), with the same store as the UI. drei provides proven pieces that are not worth rewriting: GLTF loading with the meshopt decoder, `Instances`/`Merged`, `Outlines` (inverted hull), `PerformanceMonitor`, `AdaptiveDpr`, `Bvh` for cheap raycasts.
- **Mandatory discipline (without this, R3F is slow):**
  1. Nothing that changes every frame goes through React state. Animations, camera interpolation and position smoothing are done in `useFrame` by mutating refs.
  2. 3D components subscribe to the store with **fine-grained selectors** and transient reads (`store.getState()` inside `useFrame` or `store.subscribe` with a selector), never to the whole store.
  3. Static diorama props are merged per material at build time (§6.4.4) or instanced; no repeated prop is drawn as an independent mesh.
  4. Only the drei modules that are used are imported (tree-shaking verified by the bundle budget).
- **Alternatives and why not:**
  - *Imperative three.js:* less overhead, but it breaks "declarative 3D" and forces hand-building the bridge to the store. R3F's overhead is negligible if the discipline above is respected.
  - *Babylon.js / PlayCanvas:* full engines, heavier in bundle (Babylon) or with a proprietary editor (PlayCanvas); neither integrates with React DOM as directly.
  - *Godot or Unity exported to web:* builds of tens of MB, slow startup on 4 GB PCs, their own UI that loses DOM accessibility, and code AIs handle them worse. Clashes with C1 and C10.
  - *2D (Pixi/Phaser):* lighter, and [Business §0] recommends it for the prototype. I do not choose it as the main render because the operator asked for a 3D low-poly/cel-shaded art direction (superseded by D-139, HD-2D, and then by D-207: painted diorama inside R3F, §2.9) and "naming objects in spatial context" [References §4.4] wins with 3D. **But** the architecture keeps 2D possible: the core does not depend on the render (§3.1) and the "dialog only" mode (DOM with a static illustration) exists from the vertical slice as a real plan B.

### 2.4 Rapier: not in mode 1 (resolves DP-14)

**Decision:** mode 1 does not load a physics engine. Movement is walking and interacting [GDD §5.5]; no mode 1 mechanic needs rigid-body dynamics.

**What is used instead (all in `packages/core/movement`, pure TS, testable without WebGL):**

1. **Walkability grid per diorama.** 0.5 m cells in the XZ plane. It is generated at build time from the footprints (2D collision boxes) of the props declared in the diorama layout (§6.4.3), plus manual polygons of "not walkable" (water, edges) and "forced walkable" (ramps, dock). Result: `walkable: Uint8Array` + metadata, serialized in the diorama JSON.
2. **Ground height:** sampling function per cell (heights stored in the grid). No physical slopes: the camera and the character follow the interpolated height.
3. **Click to walk:** the canvas raycasts against a ground plane/mesh (drei `Bvh` to keep it cheap) and dispatches the `moveTo(x, z)` action. The core solves **A\*** over the grid (8 neighbors, path smoothing by line of sight) and returns waypoints.
4. **WASD/arrows:** the core integrates velocity and resolves **circle vs. blocked cells** collision (sliding along edges). Fixed simulation step (for example, 30 Hz) independent of framerate, so the result is deterministic and testable.
5. **Interactables:** interaction radius per entity; the core computes `nearbyInteractables` (for the "E to talk" prompt and for the keyboard-accessible list).
6. **NPCs:** they move along scripted routes on the same grid (waypoints in data), with no complex dynamic avoidance; if the player blocks, the NPC waits.

**What is given up:** the "pushable toy world" feel of Bruno Simon's portfolio. **How it stays open:** the mail bicycle (DP-16) and any future physical toy are implemented as an **isolated feature** that loads Rapier as a deferred chunk (WASM) only when used, behind its own ADR. Nothing in the movement core depends on Rapier existing.

**Possible failure of this option:** geometry that does not match the grid (the character passes through a prop's corner or gets stuck in a narrow corridor). Mitigation: the diorama validator (§6.4.5) checks connectivity between points of interest and minimum corridor width (2 cells), and in development there is a grid overlay (§6.4.6).

### 2.5 Zustand

- **Why:** it is the smallest store that allows (a) subscriptions with a selector from React DOM and from R3F, (b) reading and writing **outside React** (the voice, input and persistence services are not components) and (c) transient reads in `useFrame` without re-rendering. It is what the R3F ecosystem uses.
- **How it is used (detail in §3):** a single store composed of slices; the store actions call pure core functions (`packages/core`) that receive state and return new state. Middleware: `subscribeWithSelector` and `devtools` only in development. **No Zustand `persist` for progress** (persistence is done by a service with versioning and server, §7.4); `localStorage` only for per-device preferences.
- **Alternatives:** Redux Toolkit (more ceremony, same model); Jotai (scattered atoms, harder to read as a "single source" for headless runs); XState as store (excellent for state machines, but imposing it on the whole game state is more complex than necessary: the game's state machines are written as transition tables in pure TS, §3.5).
- **What is given up:** library-guaranteed immutability. Compensated with pure functions in the core and tests that actions do not mutate their input.

### 2.6 HUD in React DOM + Tailwind

- **Why:** text scaling, contrast, screen readers, keyboard navigation, `prefers-reduced-motion` and focus are solved with the DOM and not inside the canvas. It is the direct answer to the UI complaints about Terra Alia [References §1.3, §4.4.4] and to the GDD's accessibility features [GDD §2.19].
- **Tailwind:** configured with the GDD tokens (GDD §5.4) as CSS variables (`--lg-color-*`, `--lg-font-scale`); every text size in `rem` so that the size setting (100-200%) scales the whole HUD by changing a single root value.
- **Components:** native HTML elements with correct semantics are used (`<button>`, `<dialog>`, `<input type="range">`, `aria-live` for subtitles). No headless component library is added unless a specific component fails the accessibility review (decision in an ADR if that happens).
- **Typography:** a legible main font with an open license, self-hosted (for example Atkinson Hyperlegible, SIL OFL) and a dyslexia option with a license verified when it is incorporated. **Nothing is loaded from third-party CDNs** (fonts included) so as not to leak minors' browsing data.
- **What is given up:** rich 3D text "in the world". The village signs are textures or simple geometry; their accessible reading is offered in the DOM (when interacting with a sign, the text appears in the HUD).

### 2.7 Performance budget (typical school PC)

**Minimum target PC (proposal, to be measured with experiment #5 of the business analysis):** 4 GB of RAM, low-power CPU with 2-4 cores (Celeron/Pentium Silver class or similar), integrated graphics of the same generation, 1366×768 screen, recent Chrome or Edge, shared classroom connection. *Probable* that this represents netbooks from Argentine public programs and lab PCs; not verified with our own measurements. Until the benchmark exists, these numbers are the contract; the benchmark adjusts them.

#### 2.7.1 Quality tiers

| Parameter | `low` (mandatory) | `medium` (default on modern integrated GPU) | `high` | `dialog-only` (no WebGL or on request) |
|---|---|---|---|---|
| Target FPS | ≥ 30 stable while exploring | 60 (floor 45) | 60 | n/a |
| Max DPR | 1 | 1.5 | 2 | n/a |
| Internal resolution | 75-100% (dynamic) | 100% | 100% | n/a |
| Visible triangles | ≤ 25k | ≤ 50k (GDD §5.7) | ≤ 100k | 0 |
| Draw calls per frame | ≤ 60 | ≤ 120 | ≤ 150 (GDD cap) | 0 |
| Visible animated characters (with skeleton, D-207; the rest stay frozen, plan estetica-c M3) | ≤ 4 | ≤ 8 | ≤ 12 | 0 |
| Shadows | none (blob shadows as a textured quad) | blob | 1 directional light with 1024 shadow map only on dynamic objects | — |
| Outlines | none | none (D-209; before: characters + focused interactive) | none (D-209; before: characters + interactives) | — |
| Dynamic lights | 1 hemispheric + 1 directional | + up to 2 point lights | + up to 4 point lights | — |
| Postprocessing (D-077, §2.9) | none | cheap bloom (high threshold, half resolution) | bloom + tilt-shift-style depth of field + vignette (tilt-shift only in the panorama and in conversation, never behind the character; D-209) | — |
| Texture memory on GPU | ≤ 24 MB | ≤ 48 MB | ≤ 96 MB | — |
| Draw distance / fog | short | medium | full diorama | — |

Rules that hold for all tiers:
- **The valley's lights (Lumi, the network's firefly trails, windows) are emissive materials + halo sprites**, not point lights. In forward rendering every point light makes all lit materials more expensive; dozens of fireflies as real lights would sink the low tier.
- **Progress desaturation** [GDD §5.4]: a parameter of the per-vertex color of the world's toon material (D-207, proposal C §5), not a postprocessing pass.
- **Textures (D-207):** the color of the world goes per vertex, not per texture. The only textures are the 256 px grayscale brushstroke and the 4-band ramp of the toon material (the ramp is the only one with `nearest` filtering, `world/materials/toon.ts`), and the name chips and bubbles generated by code; the pipeline's glTFs enter without textures (§6.4.1). The per-tier memory is estimated by `world/budget/textures.ts` (plan estetica-c M6). **D-209 exception:** the photographic ground and rock maps, the leaf atlas and the bark are served as external `.ktx2` files (Basis, encoded offline with a pinned basisu) in `apps/web/public/textures/`, each with its register row; the estimator counts them at 16 B per block (BC7, the worst case) by reading the KTX2 header. Textures made by code at runtime remain uncompressed.
- **Open world (D-209; `OPEN_WORLD_DENSITY` in `packages/art/src/density.ts`, the only table):**

  | Parameter | `low` | `medium` | `high` |
  |---|---|---|---|
  | Terrain interior step (fine / maximum near / growth far) | 3.5 m / 3.5 / 8 | 2.6 m / 3 / 6 | 2.2 m / 3 / 4 |
  | Grass tufts (count, radius, real-leaf radius, leaves per tuft) | 1,000, 15 m, 4.5 m, 8 | 2,300, 24 m, 6 m, 8 | 7,000, 34 m, 8 m, 10 |
  | Trees (pines, far pines, broadleaves, shrubs, rocks) | 16, 90, 3, 0, 8 | 58, 150, 8, 22, 30 | 88, 170, 12, 40, 40 |
  | Tree bands (full / half radius; beyond, impostor) | 0 / 24 m | 16 / 38 m | 24 / 58 m |
  | Clouds and ground normals | no / no | yes / yes | yes / yes |
  | Estimated texture memory (cap) | 14.6 MB (24) | 20.9 MB (48) | 24.9 MB (96) |

  The tree bands shrink with zoom (`treeLodShrink`) and the grass disc turns off at a distance. No ceiling in the table above moved. If a gate fails, the order of cuts is: grass tufts, far pines and ground detail, radius of light trees, radius of full trees, terrain step and, last, lowering medium's `maxDpr` from 1.5 to 1.25 and then to 1.0 (it can only go down).
- **Tiers as a contract (R12):** they are read from a single object (`apps/web/src/services/quality/quality.ts`); the type includes `xr`, reserved and never chosen until the E-XR epic.

#### 2.7.2 Detection and adaptation

1. On the loading screen [GDD §2.14, 0:00-0:20]: if there is no WebGL2 → `dialog-only` and a friendly notice. If there is, the renderer information is read and a ~1 s micro-benchmark is run (render the loading scene N frames and measure); with that the initial tier is chosen. A downloaded third-party GPU database is not used.
2. In play: drei's `PerformanceMonitor` lowers the tier (or the DPR) if FPS falls below the floor for more than a few seconds, and never raises it by itself during a conversation (avoids visual jumps while speaking).
3. The player can fix the tier in Settings; the manual choice wins over the automatic one.
4. WebGL context loss (frequent on weak GPUs): `webglcontextlost` is caught, the game switches to `dialog-only` without losing the scene in progress and offers a retry.

#### 2.7.3 Bundle and download

| Element | Budget (gzip) | How it is verified |
|---|---|---|
| Shell (onboarding, settings, HUD, services, no three) | ≤ 300 KB JS+CSS | size script over the `vite build` output (CI) |
| 3D chunk (three + R3F + used drei + world) | ≤ 450 KB | idem |
| Teacher panel (`docente.html`) | ≤ 250 KB, no three | idem |
| First diorama assets (Dock) | ≤ 6 MB | asset budget script |
| Dock + Plaza (initial download of the vertical slice) | ≤ 15 MB [GDD §5.7] | idem |
| Cached audio of scripted lines per mission | ≤ 1,5 MB (Opus/OGG) | idem |
| Interactive (shell) | < 3 s at 10 Mbps | manual operator review |
| Interactive 3D on target PC | < 15 s [GDD §2.14] | benchmark #5 (manual) |

The shell loads without three.js: the player can go through the welcome, accessibility and avatar while the 3D chunk and the first diorama download in the background.

**This table is the only source of budgets** (`00-decisiones.md` §0.3). F1.1 creates its machine-readable copy, `scripts/budgets/budgets.json` (keys: `shell_js_css_gzip_kb: 300`, `chunk_3d_gzip_kb: 450`, `docente_gzip_kb: 250`, `assets_muelle_mb: 6`, `assets_muelle_plaza_mb: 15`, `audio_lineas_por_mision_mb: 1.5`), which `check:budgets` reads. If the JSON and this table differ, the table wins and the run corrects the JSON. A threshold only changes with an operator decision; P0 may **propose** new numbers in its report, not apply them. The per-tier budgets (triangles, draw calls, texture memory) are those of §2.7.1.

#### 2.7.4 Render + audio coexistence (C2)

- Audio capture and playback in **AudioWorklet** (off the main thread). LT uses `ScriptProcessorNode` [LT `public/index.html`], which runs on the main thread and is deprecated; it is not ported that way.
- During a conversation scene the canvas drops to **30 FPS maximum** and freezes non-essential animations (water, background NPCs); the camera is still in the dialog framing, so the visual loss is nil and CPU is freed for audio and the WebSocket.
- When a full-screen DOM panel is opened (notebook, settings), the canvas switches to `frameloop="demand"` (it does not render if nothing changes).

### 2.8 Single world material: 4-band toon with brushstroke (resolves the "how" of DP-17; D-207, ADR-028)

> **Since D-207 (plan estetica-c M1, HD-2D removal in M7):** the whole world (terrain, code props, pipeline models, characters) shares a single instance of the toon material; the water has its own shader. It replaces the v0.2 approach (toon only for volumes, characters as sprites; D-139). ADR-028 amends ADR-011. The custom shaders stay isolated in `world/materials` and `world/water` so they can be ported to nodes (TSL) if WebGPU is ever enabled (D-144).

| Piece | What it is like | Path |
|---|---|---|
| Toon material | `MeshToonMaterial` with `vertexColors`, a 4 px `gradientMap` at luminance 150 / 195 / 232 / 255 with `nearest` filter and `map` = 256 px grayscale brushstroke generated by code with a fixed seed | `apps/web/src/world/materials/toon.ts` |
| "Painted" vertex color | Vertical gradient (darker at the bottom) and brush jitter in luminance by position, over the palette of proposal C §6. The core is pure TS without three in `@lg/art`: `world/` and `scripts/assets/` use it (a single implementation) | `packages/art/` · `apps/web/src/world/materials/` |
| Material registry | Closed list of 10 classes since D-209: `toon`, `agua`, `etiqueta`, `sombra-blob`, `terreno`, `pasto`, `follaje`, `impostor`, `cielo`, `nube`; a class outside the list fails the test. Every material goes through `tagMaterial`; the toon has a base instance plus up to 3 dither variants per band, each with its `customProgramCacheKey` | `apps/web/src/world/materials/registry.ts` |
| Water | Plane with its own shader of bands and moving glints, with fog and tone included; the glints stay still with "reduce motion" and during conversation | `apps/web/src/world/water/` |
| Outlines | None in v1 (proposal C leaves them out): the NPC about to be spoken to is read by its label highlighted in amber | n/a |

**Bevel rule (proposal C §1):** no visible volume has 90° edges without a bevel. A dihedral test runs on every `codigo/*` constructor and on every piece that enters through the pipeline (`@lg/art`; plan estetica-c M1 and M2).

**Why a single one:** one material instance compiles one program per variant (faster startup) and, since the color goes per vertex, pieces of different colors merge into a single mesh without losing the palette.


### 2.9 Painted diorama in R3F (D-207, D-208, D-209; ADR-028)

> **Since D-209 (plan open-world-3d, 2026-10-30):** the diorama is explored in third person in an open world. The camera, terrain, light, postprocessing and budget rows below carry the amendment; the new rows are grass, trees, sky and minimap. Where the 2026-10-13 text says "from above on the diagonal" or "no orbit", D-209 governs.

**What it is:** the valley as a hand-painted toy diorama: low-poly but rounded 3D, painted per vertex with the toon material of §2.8, seen from above on the diagonal with a long-lens perspective, with warm light, haze and, in the high tier, tilt-shift (art bible: `docs/art-direction/proposal-c-painted-diorama.md` and its mockup). It supersedes HD-2D (D-139: pixel sprites on tiles with an orthographic camera; ADR-022). It is built **within the same stack** (R3F + drei); data, grid, movement, input and store are those from before, and the diorama works as is in VR (`xrTabletop`, `07-stack-objetivo.md` §3).

| Piece | How it is done | Path |
|---|---|---|
| **Terrain** | Continuous heightmap mesh with per-vertex color, derived from the layout in the diorama format (§6.4.3): flat at y = 0 within the walkable bounds (the ground raycast is still the invisible plane), flattened under paths, sunk under water with a shore, and hills of up to 5.5 m outside. It extends 160 m beyond the diorama with ever larger cells (D-208), so no game camera sees the edge. **D-209:** the open world measures about 140 × 100 m, with the pure `reliefAt` relief of `@lg/art` (flat plateaus where the NPCs are; `heightAt` interpolates over the mesh triangles), interior step per tier (§2.7.1), paths painted with soft weight and a 120 m apron in the fog color that closes the void at any screen aspect ratio. The RG16F height-and-soil texture that the grass uses is built and owned by `world/terrain` | `apps/web/src/world/terrain/` · `packages/art/` |
| **Water** | Ponds (polygons) and rivers (curves) under a single plane with the shader of §2.8 | `apps/web/src/world/water/` |
| **Props** | Constructors by code `codigo/*` (beveled, one mesh per prop, merged pieces) and `modelo/*` models from the pipeline (§6.4.1), both with the toon material; repeated ones as `InstancedMesh`. Ground detail (flowers, tufts, pebbles, cobblestones) instanced | `apps/web/src/world/props/` · `apps/web/src/world/dioramas/scene.ts` |
| **Characters** | Chibi of 2.5 to 3 heads: body with a skeleton from the pipeline (repainted KayKit), head by code, clips and gestures driven by a pure animation machine; each NPC's appearance comes from its content sheet (`apariencia`). Blob shadow in all tiers | `apps/web/src/world/actors/` |
| **Labels and bubbles** | Name above the head as a three `Sprite` of fixed on-screen size, texture drawn by code; amber highlight on the NPC that answers to E (the same selector as the HUD prompt); amber request bubble. Hidden beyond 75 m except the highlighted NPC's (D-208) | `apps/web/src/world/labels/` |
| **Camera** | `CameraRig` by presets (R11, D-053 with the lens of D-207): `perspective3D` (vertical FOV 30°, 40.5° on portrait screens; tilt 50°, yaw 45°; 8-step zoom ladder from 160 to 22 m starting at 30 m, D-208; follows the player; no orbit) and `dialogueFrame` (three-quarter two-shot: 20°, 12.5 m, 6 candidate angles with occlusion test). With "reduce motion", a cut. `xrTabletop` declared. No orthographic cameras. **D-209 (default since 2026-10-30):** `thirdPerson`, behind the character: tilt from 6 to 55° (17° on entry), look by dragging more than 6 px (`LOOK_DRAG_PX`) or with Q and R, recentering after 1.5 s without looking, continuous zoom `t` in [0, 1] from 2.5 m to the whole map (log; wheel, `+`/`-` and buttons at 0.07 per step; V toggles with t = 1). Yaw and tilt live in the store and the rig reads them with `getState()` in `useFrame`. `perspective3D` stays registered, and a saved setting with it opens `thirdPerson` at t = 1 | `apps/web/src/world/camera/` · `packages/core/src/camera/camera.ts` |
| **Light** | Warm sun at 48° elevation, hemispheric, linear haze fog from 34 to 78 m (scales with distance beyond 30 m, D-208), ACES Filmic with exposure 1.05; shadows per tier (§2.7.1); presets by time of day (D-051); emissives + halos for fireflies and windows | `apps/web/src/world/lighting/` |
| **Postprocessing per tier** | In its own chunk (`low` and `dialog-only` never download it): `low` none; `medium` bloom on emissives; `high` bloom + tilt-shift + vignette. Turned off with "reduce motion" and during context loss. **D-209:** tilt-shift only runs in the panorama and in `dialogueFrame`, never behind the character; no outlines in any tier. Antialiasing stays off and is decided with a pair of captures that the operator looks at | `apps/web/src/world/post/` |
| **Sky** (D-209) | Dome centered on the camera, with no depth writes or fog, with zenith, horizon and haze colors from the look; the horizon is exactly the fog color. Flat clouds from medium (class `nube`) | `apps/web/src/world/sky/` · `packages/art/src/sky.ts` |
| **Grass** (D-209) | Tufts in the style of mockup V6: card with atlas and real leaves up close, two `InstancedMesh` with a `ShaderMaterial` of class `pasto` (fog included). Chosen by disc, height texture, soil and frustum, and uploaded to the GPU only when the chosen set changes. The position wrapping comes from a module that also emits the GLSL (parity test); no wind with the view still or with "reduce motion" | `apps/web/src/world/nature/` |
| **Trees and rocks** (D-209) | Trees baked at build time with vendored ez-tree (`tooling/vendor/ez-tree/`, `scripts/assets/bake-trees.ts`, our `glb-write.ts`) in three bands: full, light and impostor with a crown card, with dither between bands and culling. Rocks as bare geometry with `.ktx2` maps. Every served GLB still has no embedded material or texture and has `COLOR_0` | `apps/web/src/world/nature/` · `apps/web/public/models/generated/trees/` |
| **Minimap** (D-209) | 2D canvas in the HUD from the pure `minimapModel` (heading-oriented, 60 m), redrawn at most every 100 ms; the missing NPCs are red rings in the DOM (`data-npc-id`) with an ink halo, arrow at the edge; hidden in conversation and in `dialog-only` | `packages/core/src/world/minimap.ts` · `apps/web/src/ui/hud/Minimap.tsx` |

| **Portraits** | From the same game model, rendered in the operator's browser from a development-only studio and committed as PNG with their register (D-030; plan estetica-c M3); if missing, the SVG by code | `apps/web/src/world/portraits/` · `apps/web/public/portraits/` |
| **Foundations layer and visible network** (F3.3; D-169, D-194; `02` §1.7-§1.9, §4.1.3) | What the player founds by speaking **appears on the map**: each `SITIO-*` has an anchor in the diorama layout (`sitios:`, §6.4.3) and a foundation sheet (`content/fundaciones/`, `02` §6.2.6) with a visual per state (`idea` → `en_marcha` → `fundado` → `crece`). A pure function `foundationVisuals(fundaciones, diorama)` (in `packages/core/src/world/`) translates the store state (`world.fundaciones`) into the list of props to draw, in the vocabulary of §6.4.3 (`codigo/*` or `modelo/*` with `rotY`, `tinte` and `instancias`; per-state variants are prop or tint changes); `world/foundations/FoundationLayer.tsx` only paints it. The same goes for the **network**: `networkPaths(red, casas)` gives the dusk firefly trails (one per link, `02` §1.7), sampled with the same curve as the paths; and the **Crossing's saturation** by progress (−30 % at the start, normal on closing Region 1, `02` §1.9) is a per-vertex color parameter that comes from a selector. Nothing is bought or accelerated (D-169): the state only changes through mission effects emitted when scenes close (§6.4.8) | `packages/core/src/world/` · `apps/web/src/world/foundations/` · `content/fundaciones/` |

**Budget:** an `InstancedMesh` counts as 1 draw call; each code prop is one mesh; a character counts its body, its head, its label and its bubble. The static estimator (`world/budget/` and its copy of costs in `@lg/art`) runs inside `validate:content` for each diorama and each tier, with everything in view (the farthest zoom), and fails above §2.7.1 (§6.4.5; plan estetica-c M5 and M6). In development, director mode shows the real `renderer.info` counters. **D-209:** in the open world the estimator adds the worst case of the grass and the apron; the `perf:probe` probe (outside `verify`, with a real GPU) measures draw calls, triangles and times per tier and pose, and the 60 fps gate at medium on the integrated GPU (1280×720, DPR 1) and the 3 s load of the built game remain pending measurement (`docs/reports/open-world-3d-pendientes.md`). `renderer.compileAsync` runs before the first frame of the world. **Risks:** "generic low-poly" (mitigated by the bevel rule, mandatory repainting and the brushstroke); 25k triangles in `low` (reduced density, §2.7.1); PCF shadows in `medium` and DPR ceilings (open questions of plan estetica-c, decided with measured numbers).

---

## 3. Architecture rules, layers and state (Zustand)

### 3.1 Layers

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

**Rules (contract, verified by lint where possible):**

1. **R1 — Declarative 3D.** The whole world (dioramas, actors, lights, camera) is instantiated as React components in `world/`. The imperative (mutating refs in `useFrame`) is allowed only for presentation animation.
2. **R2 — The store is the single source of truth for game state.** `ui/` and `world/` read from the store and write only by dispatching store actions. They never import each other.
3. **R3 — 3D and DOM never talk directly.** No DOM events inside the canvas, no 3D object refs in the UI, no `drei/Html` for the HUD. If the DOM needs to know something about the world (which NPC is nearby, where the player is on the minimap), the world publishes it to the store through an action, and the DOM reads it.
4. **R4 — Game rules live in `packages/core`.** Pure functions, no React, no three, no Zustand, no browser APIs, no direct `Date.now()` or `Math.random()` (clock and RNG are injected). Store actions are thin: they call the core and save the result.
5. **R5 — Effects (network, audio, storage, telemetry) live in `services/`.** A service subscribes to the store and/or receives external events (WebSocket), and dispatches actions. No component opens sockets or touches `AudioContext`.
6. **R6 — Ephemeral presentation state may stay local.** The text being typed in an input, a hover, an opening animation: local React state. **Cut rule:** if another layer (another distant component, the world, a service, the save) needs to read it, it goes to the store.
7. **R7 — High frequency without re-render.** The interpolated position of the player and the camera live in refs inside `world/`. The store keeps the **logical** position (that of the movement core, at 30 Hz simulation) and the UI reads it with low-frequency selectors (for example, current cell or nearby NPC), never the per-frame position.
8. **R8 — The server is the authority over the voice scene and the evidence.** The client presents; the server decides when a scene ends, what evidence was recorded and what signal Lumi gives (§5.6). The client never fabricates evidence events.
9. **R9 — Content as data.** Missions, scenes, NPCs, glossary, skill tree, diorama layouts and Lumi's lines are schema-validated files (§6); the code contains no hardcoded game text except interface strings in i18n.

**Day-1 seams (R10-R15, D-145; origin: `07-stack-objetivo.md` §5.3; ADR-025).** They cost interfaces and a `web` adapter, not features; they are what allows reaching desktop, mobile and VR without a move (C15). All are verified without a browser (import lint and tests).

10. **R10 — Semantic input.** `services/input/` translates devices (keyboard, mouse, touch, gamepad; later XR controllers) into **actions**: `move(dir)`, `moveTo(cell)`, `interact()`, `talk.start/stop`, `menu.open`, `confirm`, `back`, `openNotebook`. The core, the store and `world/` only see actions. Lint: keyboard, pointer or gamepad `addEventListener` only inside `services/input/` (native DOM controls with focus keep working as always).
11. **R11 — Camera by presets.** `world/camera/CameraRig` is the only one that creates or moves cameras; it receives a preset from data: `thirdPerson` (behind the character, continuous zoom out to the whole map; default since D-209), `perspective3D` (long lens, registered as the panorama; it was the default from D-207 to D-209) and `dialogueFrame` (conversation two-shot); later `xrTabletop` (E-XR). The impostor-baking camera comes from a factory in `world/camera/bakeCamera.ts`. Since D-207 (plan estetica-c M7, architecture review 2026-10-12) the HD-2D orthographic presets left R11 and there are no orthographic cameras in the tree (proven by `scripts/lint/retiro-hd2d.test.ts`). The rig registry (`world/camera/presets.ts`) has exactly the keys of `CAMERA_PRESET_IDS`. In XR the camera is controlled by the head and the rig moves the diorama. Lint: three/drei cameras only inside `world/camera/`.
12. **R12 — Quality tiers as a contract.** The tiers of §2.7.1 are read from a single object (`services/quality/quality.ts`); the type is `'low' | 'medium' | 'high' | 'dialog-only' | 'xr'` with `xr` reserved. No component decides quality on its own.
13. **R13 — Audio and voice transport behind interfaces.** A single `AudioContext`, created in `services/audio/`; capture and playback in AudioWorklet (§2.7.4); the client's voice transport is the `VoiceTransport` interface (WebSocket today; room for WebRTC); microphone permissions go through the platform adapter (R15). On the server side, the NPC's voice is `RealtimeVoiceProvider` with interchangeable adapters (§5.11).
14. **R14 — UI as a view of the store.** `ui/` components present named view-models from `state/selectors/` (text, order and states of each screen) and dispatch actions; no state logic inside the JSX. The future XR UI (uikit, D-143) consumes the same view-models.
15. **R15 — Platform behind an adapter.** `services/platform/` with the `Platform` interface (permissions, local storage, updates, opening links, fullscreen) and, today, only the `web` implementation; `desktop`, `mobile` and `xr` arrive with their epics. Lint: `@tauri-apps/*`, `@capacitor/*` and `navigator.xr` only inside `services/platform/`.

### 3.2 Why a pure core in addition to the store

- It makes everything that matters testable without a browser (movement, progression, review, adaptation, companion policy, state machines): C10 and C11.
- It lets **the server use the same rules** as the client (for example, folding evidence into potions for the teacher reports, §3.5.3), without duplicating logic.
- It makes the render plan B real: `dialog-only` mode and an eventual 2D render are another view over the same store and the same core [References §4.4.5].

### 3.3 Store: slices

A single store (`useGameStore`) composed of slices. Each slice declares its state, its actions and whether it is persisted. The names are contract.

| Slice | State (main fields) | Who writes (actions) | Who reads | Persistence |
|---|---|---|---|---|
| `session` | app phase (`boot`, `onboarding`, `world`, `scene`, `notebook`, `dialogOnly`), account (opaque id, role, age band, institution/class if applicable), connection state, assigned experiment arms, remaining voice budget (minutes), interface language, language pair | auth/persistence/voice services; onboarding | all | server (account) |
| `settings` | accessibility (text size, font, subtitles, karaoke, colorblindness, contrast, reduce motion, per-channel volumes, Lumi's voice on/off), input (push to talk, end-of-turn threshold, button only, key mapping), feedback mode (`accompanied`/`flagOnly`/`moreHelp`), preferred NPC speed, fixed help level (or automatic), graphics tier (auto/manual), camera (only `perspective3D` since D-207; an old saved value falls back to that default on load, R11) | `ui/settings`, onboarding | all | server + local copy (per-device preferences such as graphics tier only local) |
| `world` | current and loaded diorama, time of day, scripted weather, light level per neighborhood, world flags (mission events: `goat_found`…), **foundations** (`SITIO-*` → `idea`/`en_marcha`/`fundado`/`crece`, D-169), **network** (consummated introductions `intro:<NPC>` and links, D-168), last point chosen in inspection mode (`lastPick`, used only by director mode, §6.5.3), NPC state (logical position, route, available, request icon), relationship per NPC (0-5, never goes down), nearby interactables, focused interactable | world core via actions; `world/` dispatches `interact(id)`, `moveTo(x,z)`; scene results | `world/`, `ui/` (interaction prompt, current objective, accessible list) | server (flags, relationships, light) |
| `player` | logical position (cell and simulation coordinates), destination/path, orientation, avatar, game name, pronouns, basket (borrowed mission objects) | movement core; onboarding | `world/`, `ui/` | server (avatar, name, pronouns, basket); position only to resume |
| `dialogue` | active scene (`sceneId`, `npcId`), scene machine state (§3.5.1), turn sub-state, modality (`voice`/`text`), subtitles (final lines and partial), NPC's last line (for `Repetir`), effective speed, silence menu open, visible hint chip, suggested options (text mode), criteria progress (for the objective line, without revealing evaluation), reason for fallback to text | `voice-client` service (server messages), `ui/dialogue` (buttons: `Terminé`, `Pasar el turno`, `Repetir`, `Más despacio`, `Escribir`, `Marcar`) | `ui/dialogue`, `world/` (speech animations, camera framing) | no (the scene resumes from its start [GDD §2.16]) |
| `companion` | Lumi's state (`idle`, `listening`, `speaking`, `signal`, `noted`), active signal (text, ladder rung, audio), visible bubble, line queue, glow (derived from total evidence), items noted in the current scene | `voice-client` service (`companion.*` server messages), core (pre-task and distillate lines) | `ui/companion`, `world/actors/Lumi` | no (derives from `progression` and `learner`) |
| `progression` | local log of evidence events (server ids), potions per branch (derived, in whole thirds), opened skills and poured potions, demonstrated can-dos, state per mission (`locked`, `available`, `done`, `canImprove`), chapter | **only** applying events confirmed by the server (`scene.end`) and the `pourPotions(skillId)` action | `ui/notebook`, `world/` (Lumi's glow), `companion` | server (source: events) |
| `learner` | review bank (Leitner items), error patterns (normalized key, type, count, systematic), scaffolding level (1-5) and signal window of the last 3 scenes, due items | server events (`scene.end` brings updates), pocket review | voice service (to request a scene with due items), `ui/notebook` | server |
| `ui` | open panels, active modal, toasts, accessible navigation focus, pointer mode (`pointerMode`: `play` by default or `inspect`, which only activates director mode, §6.5.3) | `ui/`; `dev/director` only with `setPointerMode` | `ui/`, `world/` (pause camera input if there is a modal; in `inspect` the click picks a point with `pickTile` instead of moving) | no |

**Store design notes:**
- **Potions in whole thirds.** The suggested option is worth 1/3 of a potion [GDD §2.7.3]; to avoid floats, `thirds: number` is stored and the UI shows flasks. Core rule, tested.
- **Named selectors** in `state/selectors/` (for example `selectCurrentObjective`, `selectNearbyInteractables`, `selectPotionsByBranch`). Runs do not write ad hoc selectors inside components except trivial ones.
- **There is no economy or construction slice.** See §3.6.

### 3.4 Typical flow (full example: talking to Maya)

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

At no step does `ui/` touch `world/` or vice versa.

### 3.5 State machines and core rules (contracts)

State machines are written as **typed transition tables** (`{ [state]: { [event]: (ctx, event) => [newState, effects[]] } }`), with no external dependency. Effects are data (for example `{type: "send", msg}`), executed by the corresponding service: this way the machine is pure and testable.

#### 3.5.1 Scene machine (shared client/server, `packages/core/scene`)

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

**Events (closed list; they are not renamed or added to without a decision):** `interact`, `pretaskDone`, `sceneReady`, `sceneFailed`, `openingDone`, `speechStart`, `speechPause`, `speechResume`, `turnTimer`, `pressDone`, `pressPass`, `choose`, `npcDone`, `companionSignal`, `companionDone`, `criteriaMet`, `nonConvergingDone`, `softCap`, `hardCap`, `voiceLost`, `budgetExhausted`, `safetyRisk`, `containmentDone`, `closingDone`, `posttaskDone`, `abort`.

**Timers (three):** `turnTimer` (end-of-turn threshold in `endPending`), `softCap` (scene clock ≥ 4:00) and `hardCap` (scene clock ≥ 5:00). The **scene clock** starts on entering `npcOpening` and does not run in `pretask` (D-130). Both caps are fired by the server; the client only reflects them.

**Cap rules (D-130):**

- `softCap` never transitions by itself: it only sets `ctx.softCapReached`. The move to `nonConverging` happens at the next natural boundary (end of the NPC's or Lumi's line), so nobody is cut off mid-sentence and the player who is speaking finishes their turn.
- `hardCap` exits from **any** state with a clock, including `playerTurn` in any sub-state (also `waiting` with the player silent: the silence belongs to the player, the cost cap does not). Effects, in this order: (1) if it exits from `playerTurn.speaking|endPending`, the partial speech is committed to the transcript for the observer, without generating an NPC reply; (2) if it exits from `npcTurn|signal|nonConverging`, the audio in progress is cut; (3) the server **closes the Live session** on entering `closing(hard cap)`; (4) the NPC's closing line ("I have to go check the oven! Thanks!") is a **cached scripted line** from the scene sheet (like the opening one), not generated by the Live session. This way the 5:00 cap is exact in cost.
- **State/effects order:** the effects of a transition run with the destination state already in force. The closing line is emitted in `closing`, never in `playerTurn`, and invariant (a) also holds when the cap arrives with the player's turn open.
- `hardCap` in `containment`, `closing`, `posttask`, `done` or `aborted` is ignored (safety containment finishes its line; the rest have already closed).

Tested invariants: (a) in no state does the NPC speak during `playerTurn` (the server does not send NPC audio while the turn is the player's), (b) `signal` never occurs twice in a row on the same error, (c) every scene ends in `done` or `aborted` (no hanging states), (d) `nonConverging` never causes progress loss, (e) no scene continues with an open Live session after `hardCap` (test: `hardCap` during `playerTurn.waiting` → `closing`, session closed, closing line already emitted in `closing`).

#### 3.5.2 Companion policy (`packages/core/companion`)

Pure function:

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

**This block is the only definition of the `decideCompanion` contract.** `04-roadmap.md` F6 and `05-prompts-por-etapa.md` F6 cite it as is; if any other text describes another signature or another set of outputs, this one wins. Clarifications: a signal's `step` goes from **2 to 5** (2 repetition with intonation, 3 metalinguistic hint, 4 elicitation, 5 recast and move on; step 1 is done by the NPC, see below); `template` is the **id** of a Lumi template from the catalog (`02-narrative-script.md` §2.7, compiled from `content/companion/lumi.es-AR.yaml`); `flag` adds items to the closing review without saying anything in the scene; `none` does nothing. The mode keys are exactly `accompanied` ("Acompañado", default D-034), `flagOnly` ("Solo anotar") and `moreHelp` ("Más ayuda").

Default rules (from the GDD, parameterized for A/B-1): priority global > mission target > systematic > local > slip; at most one signal every 3 turns (`moreHelp`: every 2) and never two in a row on the same error; `flagOnly` never gives a signal; the ladder goes up one rung per failed attempt and resets with each new error; at A0 it starts at rung 1 or 5 depending on the error type [GDD §2.4.3, §2.4.4]. Ladder step 1 (clarification request) is said by the **NPC** within the fiction, not by Lumi.

#### 3.5.3 Progression as a fold of events (`packages/core/progression`)

- The source of truth for progress is the **evidence event log** (append-only) emitted by the server: `{id, accountId, at, kind: "target_use"|"self_correction"|"review_recall"|"option_choice"|"can_do"|"mission_outcome", branch?, structureId?, missionId, sceneId, quote?}`.
- `potions = fold(events, rules)`: `target_use` = 3 thirds, `self_correction` = 3 thirds + "bright drop" mark, `review_recall` = 3 thirds, `option_choice` = 1 third, `mission_outcome` = 0, nothing for time or login [GDD §2.7.3, §1.4.2].
- `pourPotions(skillId)` is the only spend and does not destroy: it moves thirds from "free" to "poured into the node", visible [GDD DP-09]. Opening requires enough thirds **and** a `can_do` or `target_use` event of the specific competency [GDD §2.8.1].
- **Why event-sourcing:** (a) server and client compute the same thing with the same function, (b) teacher reports are honest and recomputable, (c) changing a rule (for example arm B of A/B-2) does not require migrating balances, (d) merging offline progress is a union of events by id. **What is given up:** a bit more up-front design and a materialized view on the server for fast reports (§7.4).

#### 3.5.4 Spaced review (`packages/core/review`)

- **6-box Leitner (0-5)** with intervals `[0, 1, 3, 7, 14, 30]` days [GDD §2.9]. A correct recall **in production** moves up one box; an error moves down one (minimum 0), with no visible punishment. Chosen over SM-2 because the GDD intervals are already a fixed ladder and SM-2 adds a per-item ease factor that we have no data to calibrate. Review if telemetry shows systematic forgetting.
- Days computed in the player's time zone (injected), so that "tomorrow" is tomorrow.
- `dueItems(bank, now, limit)` feeds the next scene (the server injects them into the NPC's prompt as "situations that call for these items") and the pocket review.

#### 3.5.5 Adaptive scaffolding (`packages/core/scaffold`)

- Input: window of the last 3 scenes with `{criteriosSinPista, señales, pedidosRepetir, pedidosMasDespacio, autocorrecciones, turnosHastaObjetivo, convergio}`.
- Rule [GDD §2.10]: goes up one level if 3 scenes in a row met the criteria without hints and with ≤ 1 signal; goes down if 2 scenes in a row had 3+ hints or did not converge. If the player fixed the level, it does not change.
- Output: level 1-5 → scene parameters (speed, phrase length, vocabulary band, visible options, hint chip threshold, proportion of Lumi's L1) in a content table, not in code.

### 3.6 Where mode 2 (tycoon/building) would fit without touching mode 1

The third-party proposal brings "Grid and building system" and "Economic loop". The GDD defers them to mode 2 as candidates, without player money (**GDD DP-15, operator decision pending**). What this architecture guarantees so as not to close it or adopt it in silence:

- The movement core already uses a **grid per diorama**; a grid-based building system would be a new module `packages/core/build` that adds/removes footprints and regenerates walkability.
- A new mode = **new slice** (`build`) + new views in `world/` and `ui/` + new content scenes. It does not modify `progression`, `learner` or `companion`; everything the player demonstrates in mode 2 enters as evidence events in the same log [GDD §4.1].
- If a "world economy" ever exists (village resources, favors), it is world state (`world`), never a player currency in `progression`.
- **No mode 1 run creates the `build` slice, a building grid or an economic loop.** If a run proposes it, it reports it as a deviation.

---

## 4. Repository skeleton, conventions and module boundaries

### 4.1 Repo shape: small monorepo with npm workspaces (DP-A01)

Three consumers share types and rules: the web client, the server and the content scripts. With a single package, the server would drag React dependencies into the client's lockfile and vice versa, and the protocol types would be duplicated. With npm workspaces (no turborepo, no pnpm) it is solved with the minimum.

### 4.2 Tree

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
│  ├─ 02-narrative-script.md     # biblia y guion de la Región 1
│  ├─ 03-architecture.md         # este documento
│  ├─ 04-roadmap.md              # fases, criterios, dependencias
│  ├─ 05-prompts-por-etapa.md    # contrato común y prompts por fase
│  ├─ 06-grafo.yaml              # grafo de fases (derivado de 00/04/05)
│  ├─ 07-stack-objetivo.md       # stack objetivo y costuras R10-R15 (revisión de arquitectura, insumo integrado acá)
│  ├─ research/                  # estudios de la investigación de referencias (voz costo-valor, pronunciación)
│  ├─ refs/                      # referencias visuales (estética; la vigente es la maqueta pintada, D-207, en docs/art-direction/)
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

#### 4.2.1 Canonical paths

This table is the project's **only source of paths** (`00-decisiones.md` §0.3). Every phase prompt of `05-prompts-por-etapa.md` cites it; if a prompt names another path, this table wins and the difference is reported. A run that needs a new path adds it here in its report as a proposal and uses a path consistent with the tree in §4.2.

| What | Canonical path | Phase that creates it |
|---|---|---|
| Asset license register | `content/assets-registry.yaml` (in the disposable spike: `experiments/f0-hd2d-spike/LICENSES.md`) | F3 (F0.2 in the spike) |
| Diorama layout (diorama format and `sitios` anchors, §6.4.3) | `content/dioramas/muelle.yaml` (Los Campos), `content/dioramas/plaza.yaml` (the Crossing): diorama and budget ids not renamed (D-180); F2 uses `content/dioramas/test.yaml` (migrated to the diorama format in plan estetica-c M5) | F2 (test), F3.1 (muelle), F3.2 (plaza), F3.3 (sitios) |
| Places for dialog-only | `content/world/places.yaml` (F1.2 already validates scene→place references) | F1.2 |
| Content compiler | `scripts/content/build.ts` | F1.2 |
| Compiled output | `apps/web/public/content/` (client, no prompts) · `apps/server/generated/content/` (server); **both ignored by git and regenerated by `build`/`validate:content`** (D-159); `content/audio-lines.manifest.json` is versioned | F1.2 |
| Glossary | `content/glossary/en.es-AR.yaml` | F1.2 |
| Missions · NPCs · board · mystery | `content/missions/M<c>.<n>.yaml` · `content/npcs/NPC-<NOMBRE>.yaml` · `content/board/P-R<r>.<n>.yaml` · `content/mystery/sobres.yaml`, `content/mystery/clues.yaml` (seed envelopes, D-172) | F1.2, F8 |
| Level cards and base NPC prompt | `content/level-cards/<nivel>.yaml` · `content/prompts/npc-base.txt` | F1.2 (used by F4.1) |
| Lumi templates | `content/companion/lumi.es-AR.yaml` (schema and catalog with ids: `02-narrative-script.md` §2.7) | F1.2, F6 |
| Offline Lumi authoring prompt | `content/authoring/lumi-variantes.txt` (`02` §2.6; outside the compiler, never at runtime) | F1.2 |
| Safety | `content/safety/topics.global.yaml` · `content/safety/containment.es-AR.yaml` · `content/safety/blocklists/` | F1.2, F4.2 |
| Skill tree | `content/skills/skill-tree.yaml` | F1.2 |
| Models and prices | `apps/server/config/models.yaml` | F4.1 |
| Budgets | §2.7.3 + `scripts/budgets/budgets.json` (read by `check:budgets`; includes `check:dev-only`, §6.5.1) | F1.1b (FD0 adds `check:dev-only`) |
| World → store bridge | `apps/web/src/state/bridge.ts` (FD1 adds `pickTile`) | F2 |
| Public actions for `ui/` and director mode | `apps/web/src/state/actions.ts` (P0 T2) | F1.1a (empty), F1.3 |
| Composition root | `apps/web/src/main.tsx`, `App.tsx`, `apps/web/src/boot/` (P0 T1; markers in F1.1a) | F1.1a, F1.3 |
| Package names | `@lg/core`, `@lg/protocol`, `@lg/content-schema` (P0 T3); `apps/web` aliases: `@ui/*`, `@world/*`, `@state/*`, `@services/*`, `@i18n/*`, `@teacher/*` | F1.1a |
| Lint config and its fixtures | `eslint.config.js` (§4.3.1) · `tooling/eslint-fixtures/` or `lintText` with a virtual `filePath` (§4.3.2) | F1.1a |
| Retired IDs and lint allowlist | `content/retired-ids.yaml` · `content/lint-allowlist.yaml` (P0 T5) | F1.2 |
| Foundations · knowledge items · network (v0.2 content) | `content/fundaciones/SITIO-*.yaml` · `content/saberes/SAB-*.yaml` (with their `HV-*`) · `content/red/presentaciones.yaml` (`02` §6.1, §6.2.6-§6.2.8) | F1.2 (schemas + prologue/M1.1-M1.2), F8 |
| Foundations and network layer on the map | `packages/core/src/world/` (`foundationVisuals`, `networkPaths`) · `apps/web/src/world/foundations/` · `sitios:` anchors in `content/dioramas/*.yaml` (§6.4.8) | F3.3 |
| Operator persistence (no Postgres) | `apps/server/src/store/` (interfaces `EvidenceStore`, `SaveStore`, `LearnerStore`) · `apps/server/data/evidence.jsonl`, `apps/server/data/saves/`, `apps/server/data/learner.jsonl` (gitignored) (D-157) | F4.1 (evidence), F7 (rest) |
| Server operator mode | `LG_OPERATOR_MODE=1`, bound to `127.0.0.1`, pseudonymous account `op-local` (D-158) | F4.1 |
| Client voice transport | `apps/web/src/services/voice/transport.ts` (`VoiceTransport`) + `ws.ts` (P0 T7) | F5.2 |
| Pure audio DSP | `apps/web/src/services/audio/dsp/` · `services/audio/worklets/` (shells) (P0 T8) | F5.2 |
| Director mode (development only) | client `apps/web/src/dev/director/` (loaded by `apps/web/src/boot/dev.ts`) · Node `tooling/director/` · typed snapshot and journal in `packages/protocol/src/director.ts` · `.director/state.json`, `.director/journal/<sessionId>.jsonl` (gitignored) · `.mcp.json` · server content loader `apps/server/src/content/loader.ts` (§6.5) | FD0 |
| Director mode copilot | `tooling/director/src/copilot/` · panel `apps/web/src/dev/director/panel/` · `tooling/director/config.yaml` · cost `.director/cost.jsonl` (§6.5.3) | FD1 |
| DOM layer | `apps/web/src/ui/` (includes `ui/hud/`, `ui/dialogue/`, `ui/companion/`, `ui/notebook/`, `ui/dialog-only/`, …) | F1.3 |
| 3D layer | `apps/web/src/world/` | F2 |
| Asset optimizer | `scripts/assets/optimize.ts` → `apps/web/public/models/<pack>/` (props and characters, no textures, repainted to the palette; D-207) | plan estetica-c M2 (before: F3) |
| Painted diorama render | `apps/web/src/world/terrain/` · `apps/web/src/world/materials/` · `apps/web/src/world/props/` · `apps/web/src/world/actors/` · `apps/web/src/world/camera/CameraRig.tsx` · `apps/web/src/world/post/` (§2.8, §2.9) | plan estetica-c M1 to M7 |
| R10-R15 seams | `apps/web/src/services/input/` (R10) · `apps/web/src/world/camera/` (R11) · `apps/web/src/services/quality/quality.ts` (R12) · `apps/web/src/services/audio/` + `VoiceTransport` (R13) · `apps/web/src/state/selectors/` (R14) · `apps/web/src/services/platform/` (R15) | F1.1 (lint), F1.3, F2, F5.2 |
| Portraits for dialog-only | PNG rendered from the 3D model in `apps/web/public/portraits/<id>.png` with its register (D-030); if missing, SVG by code | F1.3 (SVG), plan estetica-c M3 |
| Hybrid voice (server) | `apps/server/src/providers/gemini-live/` · `apps/server/src/providers/cascade/` · selection in `apps/server/config/models.yaml` (`voice.npc.adapter`) (§5.11) | F5.1 |
| Pronunciation | core `packages/core/src/pronunciation/` · server `apps/server/src/pronunciation/` · UI `apps/web/src/ui/pronunciation/` · local clips `apps/web/src/services/audio/clipStore.ts` · data `content/pronunciation/` · model `apps/server/models/zipa/` (gitignored) (§5.12) | FP |
| Operator cost ledger | `apps/server/data/cost-ledger.jsonl` (gitignored; Postgres `cost_ledger` arrives with F11.1) | F5.1a |
| Scripted-line audio | `scripts/audio/pregenerate-lines.ts` · `scripts/audio/lines-to-generate.json` · `apps/web/public/audio/lines/` | F8 |
| Opt-in live eval | `scripts/eval/live-text.ts` | F4.1 |
| Prototype report | `scripts/fv/report.ts` | FV |
| Glossary check before the FV deploy | `scripts/fv/check-glossary.ts` (invoked by `build:release` with `MODE=fv`, §8.3; D-128) | FV |
| Legal texts (FV informed consent and privacy notices) | `docs/legal/` (e.g. `docs/legal/consentimiento-fv.es-AR.md`; written/approved by the `[operador]`, D-124; a run only leaves a marked draft) | FV (draft) · operator |
| NPC voice session (port of a previous voice prototype) | `apps/server/src/providers/gemini-live/` (Live adapter) · `apps/server/src/scene-runtime/` (one session per scene, timers, cut-off, reconnection) | F5.1 |
| ADRs | `docs/adr/ADR-NNN-<slug>.md` (ADR-001…026) | F1.1b |
| Reports | `docs/reports/F<n>-<AAAA-MM-DD>.md` · operator's FV verdict: `docs/reports/FV-veredicto-<AAAA-MM-DD>.md` | each phase · operator |
| Chapter template | `docs/content/plantilla-capitulo.md` | F8.3 |
| Probes | `experiments/f0-voice-probe/` (pronunciation outputs in `out/`; audio in `data/audio/`, gitignored) · `experiments/f0-hd2d-spike/` | F0.1, F0.2 |
| Environment variables | `LG_` prefix (§4.4): `LG_GEMINI_API_KEY`, `LG_DEEPGRAM_API_KEY`, `LG_AZURE_SPEECH_KEY`, `LG_AZURE_SPEECH_REGION`, `LG_SPEECHACE_API_KEY`, `LG_SPEECHSUPER_APP_KEY`, `LG_SPEECHSUPER_SECRET_KEY` and optional ones (`LG_OPENAI_API_KEY`, `LG_ASSEMBLYAI_API_KEY`, `LG_ELEVENLABS_API_KEY`); director mode: `VITE_LG_DIRECTOR` (development flag, not secret), `LG_DEV_CONTENT_WATCH`, `LG_ANTHROPIC_API_KEY` (only the `tooling/director` process, FD1, D-189); operator mode: `LG_OPERATOR_MODE` (D-158); only names in `.env.example` (D-134, D-150) | F0.1, F1.1b, FD0, FD1 |

### 4.3 Module boundaries (verified by ESLint with resolved paths and by environment)

The tool is `import-x/no-restricted-paths` (plugin `eslint-plugin-import-x` + `eslint-import-resolver-typescript`), which compares the **resolved path** of the import; `no-restricted-imports` only compares the text and a `../../world/x` evades it (P0 §2.1). Those two development dependencies are justified by that. Exact config in §4.3.1; how it is tested in §4.3.2.

| From | Can import | Cannot import |
|---|---|---|
| `packages/core` (`@lg/core`) | only `packages/protocol` (types) and standard TS; `tsconfig` with `"lib": ["ES2022"]` and `"types": []` | `react`, `three`, `@react-three/*`, `zustand`, `node:*`, any `apps/*`; browser or Node globals; `Date.now()`, `new Date()` without arguments, `Math.random()` (Clock and Rng are injected) |
| `packages/content-schema` (`@lg/content-schema`) | `zod`, `yaml`, `packages/core` (types) | `apps/*`, `react`, `three`, `zustand` |
| `packages/protocol` (`@lg/protocol`) | `zod` | everything else |
| composition root (`apps/web/src/main.tsx`, `App.tsx`, `boot/`) | all of `apps/web/src` (mounts `ui/`, loads `world/GameCanvas` with `import()`, starts `services/`; `boot/dev.ts` loads `dev/director` with `import()` only with `DEV && VITE_LG_DIRECTOR=1`) | `apps/server`, `tooling/` |
| `apps/web/src/ui` | `state/selectors/` and `state/actions.ts` (R14), `i18n/`, `ui/primitives`, `packages/core` (types only) | `world/`, `three`, `@react-three/*`, `services/`, `state/slices/`, `state/store.ts`, `dev/` |
| `apps/web/src/world` | `state/selectors/` and `state/bridge.ts` (actions exposed to the world), `three`, `@react-three/*`, `packages/core` (types only) | `ui/`, `services/`, `state/slices/`, `state/store.ts`, `dev/`, rule modules of `packages/core` |
| `apps/web/src/services` | `state/`, `packages/*` | `ui/`, `world/`, `dev/` |
| `apps/web/src/state` | `packages/core`, `packages/protocol` | `ui/`, `world/`, `services/`, `dev/` |
| `apps/web/src/teacher` | `packages/protocol`, `i18n/`, `ui/primitives` | `world/`, `services/`, `state/`, `three`, `dev/` |
| `apps/web/src/dev` (director mode, development only; ADR-026) | `state/selectors/`, `state/actions.ts`, `ui/primitives`, `packages/protocol` (snapshot types), `import.meta.hot`, `fetch`/`EventSource` toward `/__director/*` | `world/`, `services/`, `state/slices/`, `state/store.ts`, the rest of `ui/`, `three`, model SDKs; and **nobody in the game imports it** |
| `apps/server` | `packages/*` | `apps/web`, `tooling/`; disk writes (`fs.write*`, `createWriteStream`, `appendFile`) outside `apps/server/src/store/` and `apps/server/src/cost/` (D-108; those modules reject binary buffers, test) |
| `tooling/director` (Node, development only) | `packages/*`, `yaml`, `zod`, the content compiler, `@modelcontextprotocol/sdk` (D-188), `@anthropic-ai/claude-agent-sdk` (FD1, D-189) | `apps/web/src/**` at runtime (the only import from `apps/` allowed is `tooling/director/vite.config.ts` → `apps/web/vite.config.ts`, to do `mergeConfig`); and nothing in `apps/**`, `packages/**` or `scripts/**` imports `tooling/` (including `apps/web/vite.config.ts`, which falls in the zone because the lint covers `apps/**/*.{ts,tsx}`) |
| outside `apps/web/src/services/platform/` | — | `@tauri-apps/*`, `@capacitor/*`, `navigator.xr` (R15) |
| outside `apps/web/src/services/input/` | — | keyboard, pointer or gamepad `addEventListener` and `navigator.getGamepads` (R10). JSX handlers (`onKeyDown` on a `<button>`, R3F `onClick`/`onPointerDown` on `world/` meshes to pick a point) are **not** device listeners and remain allowed; the R3F ones only dispatch semantic actions through `bridge.ts` (P0, ADR-025) |
| outside `apps/web/src/world/camera/` | — | creating three/drei cameras, `OrbitControls`/`MapControls`/`CameraControls`, `camera`/`orthographic` props of `<Canvas>` (R11) |
| outside `apps/web/src/services/audio/` | — | `new AudioContext`/`webkitAudioContext`/`OfflineAudioContext`/`Audio` (R13) |
| `apps/web/src/{ui,world,state}` | — | `fetch`, `WebSocket`, `indexedDB`, `localStorage`, `sessionStorage` (R5: effects only in `services/`) |

#### 4.3.1 Exact configuration (`eslint.config.js`, flat config, ESLint 9)

It is that of P0 §2.3 (architecture review), with planning additions for director mode: `dev/` and `tooling/` zones, `tooling/**` inside the linted files and `.director/**` ignored. F1.1a creates the full config (the `dev/` and `tooling/` zones cost nothing even if those folders do not exist yet, except the `dev/director/index.ts` marker that F1.1a creates so they can be tested). F1.1a verifies each option against the installed version (§0.5); `regex` support inside `no-restricted-imports.patterns` depends on the version and this config does not use it.

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

Notes (P0 §2.3, plus those of director mode):
1. In flat config, if two blocks configure the **same rule** for the same file, the last one wins (the options are not merged). That is why the seam folders repeat the other restrictions instead of "turning off" one. Block 3 uses the typescript-eslint rule and block 4 the core one: they do not overwrite each other. F1.1a adds a test that confirms `ui/` still cannot import `three` even though block 4 also configures `no-restricted-imports` for the same file.
2. `no-restricted-globals` in `packages/core` + a `tsconfig` without `lib: DOM` or `@types/node` give the environment neutrality.
3. The composition root (`main.tsx`, `App.tsx`, `boot/`) has no forbidden zone inside `apps/web/src`; the seams (block 4) do apply to it.
4. `apps/server` also forbids disk writes outside `src/store/` and `src/cost/` (rule on `fs`), which F4.1 adds when those folders exist; it replaces the "CI grep" of F5.1/FP (there is no CI; P0 §7).
5. `dev/` uses `import.meta.hot`, `fetch` and `EventSource` toward `/__director/*`: it is deliberately not in block 5 (it is a development tool with its own effects, isolated by the zones of block 1 and by the dev-only rule of §6.5.1).

#### 4.3.2 How it is tested (F1.1a; P0 §2.4)

- Fixtures **outside** the tree that `verify` lints (`tooling/eslint-fixtures/`, ignored and excluded from `tsc`) or, better, in-memory text: `new ESLint({ cwd }).lintText(code, { filePath: "apps/web/src/ui/__probe__.tsx" })`.
- `no-restricted-paths` resolves the target: the fixture's import has to point to a **file that exists** (the marker `index.ts` files of `ui/`, `world/`, `services/`, `state/`, `dev/director/`, plus `state/bridge.ts`, `state/actions.ts`, `state/selectors/index.ts`). An import to a nonexistent path does not resolve and does not trigger the rule: a false green.
- Each forbidden fixture fails **for the expected rule** (the test compares `ruleId` and the message), not for any error; each row also has an allowed import that passes.

A red `npm run lint` because of a boundary is a **blocker**, not a warning.

### 4.4 Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Code identifiers | English, camelCase; types PascalCase | `applySceneEnd`, `ObserverResult` |
| React components | PascalCase, one component per file | `ScaffoldBar.tsx` |
| Hooks | `useX` | `useNearbyInteractables` |
| Slices | `<name>Slice.ts`, actions verb first | `dialogueSlice.ts` → `pressDone()` |
| WS messages | `domain.verb` in lowercase | `scene.start`, `companion.signal` |
| Content IDs | those of the GDD, stable, never reused | `M1.2`, `M1.2-E1`, `NPC-MAYA`, `HAB-PEDIR-1` |
| Keys of the content files | **those of the GDD, in Spanish snake_case** (DP-A02) | `criterios_exito`, `necesidad_npc` |
| Environment variables | `LG_` + SCREAMING_SNAKE | `LG_GEMINI_API_KEY` |
| CSS tokens | `--lg-*` | `--lg-color-luz-bicho` |
| Asset files | `<pack>/<piece>.glb` in kebab-case, no spaces | `kenney-city/house-small-a.glb` |
| Git branches | `feat/…`, `fix/…`, `content/…` | `content/m1-plaza-scenes` |
| Units | meters, seconds, potion thirds (integers) | `thirds: 3` |

**Why the content keys are in Spanish (DP-A02):** the GDD defines the fields in Spanish and the runs that write content read the GDD; translating field names between document and file is a gratuitous source of errors. **What is given up:** the code has mixed accesses (`mission.criterios_exito`). If the operator prefers English, it is changed once in the schemas with a correspondence table in `content/README.md`.

---

## 5. Voice and AI pipeline (reuse of an earlier voice prototype)

### 5.1 What an earlier voice prototype has today (read in the code, 2026-10-05)

| Piece | What it does | Where |
|---|---|---|
| WebSocket proxy | The browser connects to `/proxy`; the server opens a WebSocket to Gemini Live with the server-side key and **relays frames in both directions without interpreting them**. Queue of messages sent before the connection opens, sanitizing of close codes | `server.js` (Node + `ws`); `server.ts` is an older Bun version of the same proxy |
| Live session configuration | **The browser** builds it: model (`gemini-3.1-flash-live-preview`), `responseModalities: AUDIO`, prebuilt voice, `systemInstruction` (teacher prompt + profile + preferences), `contextWindowCompression.slidingWindow`, `sessionResumption` with handle | `public/index.html` |
| Audio | Capture at 16 kHz PCM16 with `ScriptProcessorNode` as base64 inside JSON; PCM playback at 24 kHz; pitch-preserving OLA time-stretch for speed | `public/index.html` |
| Session handling | `goAway` (cut-off warning), resumption with handle, input and output transcriptions (`inputTranscription`/`outputTranscription`), `interrupted`, `turnComplete` | `public/index.html` |
| Accounting | Adds up `usageMetadata` by modality (audio/text, input/output) **on the client**; `/session/end` saves counters in `sessions.json`; `/usage` panel | client + `server.js` |
| Per-turn observer | `/analyze-turn`: text model (`gemini-2.5-flash`) with forced JSON: errors (type, global/local, fossilization risk), what the **teacher** corrected and what they missed | `server.js` |
| Analysis and debrief | `/analyze` (sentence), `/analyze-session` (end-of-session report) with `finishReason` guards so truncation is not confused with a parse error | `server.js` |
| Learner profile | `learner-profile.json` on disk, **one entry per language** (a single implicit user): error patterns, topics, next focus | `server.js` |
| Rules and prompts | `teacher-config/prompts.json` (conversation/correction modes), `rules.md` (disfluency rule, tone, silent memory), `knowledge/` | `teacher-config/` |
| Observer knowledge base | Correction principles (global/local/systematic/slip classification, correction strategies), neuroscience sources | `observer-knowledge-base.md` |
| TTS | `/tts` against Deepgram Aura (English voice) | `server.js` |
| Admin | Config file editor, chat that launches an AI CLI as a subprocess, login with a password hardcoded in the code | `server.js` |

### 5.2 Reuse decision: port modules into the game server, do not link to or run LT as a service

| Option | What it gives | What it costs / where it fails | Verdict |
|---|---|---|---|
| A. Run LT as-is as a separate service and call it | Zero initial work | The proxy is transparent: **the browser builds the system prompt** → anyone can replace the NPC's safety script from the console (unacceptable with minors, C5); single-user profile in a file; admin with a password in the code; logs that print prompts and transcripts | **No** |
| B. Extract LT into a shared package used by both projects | A single voice codebase | Couples two products with different requirements (LT is one adult's lab; the game has minors, scenes, moderation); every change breaks the other | **Not for now** |
| C. **Port** the proven modules to the game server, with a provenance note, and leave LT as a lab | Reuses what works (and the fixes already learned) with the limits the game needs | Future divergence between the two codebases | **Yes (ADR-005)** |

**What is ported (with adaptation) and what is not:**

| Ported | Required adaptation |
|---|---|
| Core of the WS relay (pre-open queue, sanitizing of close codes/reasons, safe close) | The server stops being transparent: **the client never sends `setup`** (if it does, it is discarded and logged); the server builds the session from the content (§5.4) |
| Known Live configuration: `contextWindowCompression`, `sessionResumption`, `goAway` handling, transcription reading, `interrupted`/`turnComplete` | Used per scene (short sessions); resumption only covers network drops within a scene |
| Per-modality accounting of `usageMetadata` | Moves **to the server** (the client is not trustworthy for costs) and feeds the ledger (§5.9) |
| Pitch-preserving OLA time-stretch | Rewritten inside an AudioWorklet (§5.5.4) |
| Guards for `finishReason` / truncated JSON responses from the text model | Same, wrapped in the provider adapter |
| Disfluency rule (`rules.md`) and error taxonomy (global/local/systematic/slip) | Copied into the observer prompt; they already are the GDD rule [GDD §2.4.4] |
| Per-turn observer pattern with JSON output | **New** prompt: evaluates the **player** against the scene criteria and the target structures, not the teacher (§5.7) |

| Not ported | Why |
|---|---|
| Building the `setup` in the browser | Security (C5) |
| `learner-profile.json` / `sessions.json` on disk | Multi-user and privacy: they go to Postgres with their own schema (§7.4) |
| Admin panel, hardcoded password, chat that launches a CLI as a subprocess | Attack surface; out of scope |
| Content logs (`console.log` of prompts and of the first hundred characters of each message) | With minors, logs cannot contain transcripts or prompts with a profile (§7.8) |
| `ScriptProcessorNode` and base64 audio inside JSON | Main thread and +33% bandwidth (§5.5) |
| "Professor Caserta" prompts | The game has scripted NPCs, not a tutor; the persona and the frame come from the content |

**Observer knowledge base (`observer-knowledge-base.md`):** used as a reference for taxonomy and correction strategies. **Caution:** its neuroscience claims were not graded by the research and its principle 1 ("flag every uncorrected error") clashes with the GDD density rule. Resolution: the observer **detects and records** all errors (they feed the learner model); the **companion's policy** (§3.5.2) decides which ones are pointed out. Detection and intervention stay separate. The game's observer prompt cites the GDD policy, not the KB's claims.

**LT stays alive as a lab:** experiment #1 of the business analysis (cost probe: 20 scenes of 3 min, Live vs cascade, reading `usage_metadata`) runs with the LT harness, as [Business §7] asks, without waiting for the game server.

### 5.3 Server boundary and secrets

```
[Navegador]  ──HTTPS──►  apps/server  ──►  proveedores (Gemini Live/texto, TTS, moderación)
     │                       ▲  claves solo acá (variables de entorno del host)
     └──WSS (cookie de sesión, token de escena de un solo uso)──┘
```

- Provider keys exist only as environment variables of the server process (the host's secrets manager). Never in the bundle, in `public/`, in responses, in logs or in error messages.
- **Ephemeral tokens straight from browser → Gemini: ruled out for v1.** They would lower latency and server load, but (a) the server would not see the stream to moderate and cut audio, (b) accounting would depend on the client, (c) control of the `setup` would depend on token restrictions. Revisit if per-provider moderation and costs allow it (ADR-005, recorded alternative).
- The WS is authenticated with the session cookie and a **single-use scene token** issued by the API when a scene is requested (it prevents opening voice sessions without a budget or without an account).

### 5.4 Scene = one voice session (strategy against the ~15 min cap and the quadratic cost)

1. **One Live session per scene**, opened during the pre-task (Lumi speaks for 20-40 s: plenty of time for the handshake) and closed when the scene ends. Target scene 2-4 min; `softCap` at 4:00 moves to `nonConverging` at the next natural edge (`npcDone`/`companionDone`), without cutting anyone off, and a silent player past 4:00 ends by `hardCap` at 5:00 (D-130); hard cap 5:00 enforced **on the server** [GDD §2.5.5]. It never gets near the ~15 min cap or the expensive quadratic stretch [Business §3.2].
2. **Minimal context injected per scene** (target ≤ 1,500 tokens of system instruction), built by `scene-runtime` from the compiled content:
   - global safety block (forbidden topics, never ask for personal data, never leave the frame; containment if risk appears);
   - NPC sheet (personality, way of speaking, knows/doesn't know, current relationship);
   - scene script (situation, need, success criteria in the model's language, NPC scaffolding, allowed topics, vocabulary band, short-turn rule per level);
   - scaffolding parameters of the current level (sentence length, indicated speed, when to offer options);
   - previous summary (2-3 lines, already scrubbed of personal data) and due review items (≤ 5) with the instruction to create situations that call for them;
   - rule of not interrupting and not speaking twice in a row.
3. **Scripted openings and closings do not go through Live:** they play as pre-generated audio with the NPC's same voice (§6.3). The NPC "knows" it already said the opening because the server injects it as a previous turn in the context.
4. **No history is carried between scenes**, only the summary generated by the observer at the close.
5. `contextWindowCompression` is left on as a safety net (scenes longer than expected because of a bug), and `sessionResumption` only for network drops: if resumption fails, the scene continues in text mode from the last turn [GDD §2.16].

### 5.5 Real-time voice flow and turns (resolves DP-06 and DP-07 of the GDD)

#### 5.5.1 Diagram

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

#### 5.5.2 End of turn (DP-06): manual activity detection + local VAD + button

- **Decision:** the provider's automatic activity detection is turned off and the **client** marks the start and end of the turn (`activityStart`/`activityEnd` of the Live API; verify exact names and shape in the docs of the current version). The turn ends by (a) the `Terminé` button (Space/Enter) or (b) a configurable local silence threshold (default 3 s, range 2.5-4 s, or "button only") [GDD §2.6.2]. Push to talk: held key = start/end.
- **Why not the provider's automatic VAD with a long threshold:** with server VAD, a thinking pause longer than the threshold is taken as end of turn and the NPC answers: it violates "the silence belongs to the player". With manual control, the NPC **cannot** answer until the client closes the turn.
- **Sending only during speech:** the capture worklet sends audio only between `speechStart` (with 300 ms of pre-roll) and the end of the turn. Effects: (1) silence audio is not billed as input tokens (to be confirmed in the probe: the input audio bill is per second sent), (2) upload bandwidth drops to almost zero while the player thinks, (3) NPC echo through speakers does not trigger turns (the local VAD is muted while the NPC speaks; with classroom speakers, default to push to talk in "classroom mode") [GDD §2.18].
- **Local VAD:** energy detector with hysteresis and smoothing in the worklet (cheap on weak CPUs). No neural VAD model is loaded in v1 (it weighs megabytes and CPU); revisit if noisy classrooms demand it (DP-A06).
- **Interruptions:** if the player starts speaking while the NPC speaks, `activityStart` is sent, the provider interrupts and the client flushes the playback queue (`interrupted`). The NPC never interrupts the player.

#### 5.5.3 Silence button (`Pasar el turno`) and its 4 options

| Option [GDD §2.6.2] | Implementation |
|---|---|
| *Pista* | Lumi, not the NPC: the core picks the next hint level from the content (the mission's `andamiaje`); hint P3 is a model sentence with cached audio; P1-P2 are content templates |
| *Repetir* | **No model cost:** the client plays the audio of the NPC's last line, which it kept in memory |
| *Más simple* | The server injects a direction turn to the model (text, not audio) of the form `[DIRECTOR] El jugador pidió algo más simple: reformulá tu última línea con menos palabras y ofrecé dos opciones.` and closes the player's turn. The system prompt establishes that `[DIRECTOR]` notes are never verbalized |
| *Seguí vos* | Same, with `[DIRECTOR] Continuá la conversación sin esperar respuesta; dale al jugador una pregunta fácil de sí/no.` No penalty |

The visual chip "¿Querés una pista?" at 10 s (DP-05 of the GDD) is purely client-side (timer in the `waiting` sub-state, can be turned off, silent); it does not touch the server.

#### 5.5.4 Slow mode (DP-07)

Three layers, in this order of preference:

1. **Instruction to the model by scaffolding level:** shorter sentences, pauses between sentences, repetition of key words. It changes what is said, not just how it sounds; it helps most at A0-A1.
2. **Client-side pitch-preserving time-stretch** (OLA, already proven in LT): 1.0 / 0.85 / 0.7 for Natural / Más lenta / Muy lenta. Runs in the playback worklet; zero model cost.
3. **Scripted lines:** pre-generated at natural speed and stretched on the client the same as generated audio (a single file per line).

As of the date of this document I have not verified a speech-speed parameter in Gemini Live's voice configuration; if one exists in the current version, it replaces layer 2 for generated audio. **Possible failure:** OLA at 0.7 sounds "metallic" with some voices. Mitigation: listen and adjust the floor (the operator decides by ear, related to DP-A07).

#### 5.5.5 Bandwidth (shared classroom risk)

- Today, in LT: PCM16 at 16 kHz in base64 inside JSON ≈ 340 kbps of continuous upload; output at 24 kHz ≈ 510 kbps of download. A class of 25 simultaneous students would multiply that on a school link that may be only a few Mbps.
- v1: **binary frames** (no base64: −25%) and **upload only during speech** (§5.5.2). Download only exists while the NPC speaks.
- If measurement in a real school falls short (DP-A06): Opus in both directions between browser and server (the server decodes/encodes toward the provider). It adds CPU on the server and a codec dependency; that is why it is not in v1 without data.

### 5.6 The companion as a second observer

- **Lumi is not inside the NPC's Live session.** They are two distinct "models": the NPC (real-time voice, in the fiction) and the observer (text, outside the fiction). This keeps the NPC from acting as a teacher and keeps the voice session cost low (the observer does not re-bill audio).
- **Trigger:** when each player turn closes, `scene-runtime` calls the observer with: **the turn's audio clip, in memory** (D-095; the same clip is read by the pronunciation service, §5.12), player transcript (with disfluencies), the NPC's last line, the scene's success criteria, the mission's target structures, review items the scene was aiming at, CEFR level and known error patterns (key + type, no free text from the profile).
- **Concurrency:** the observer runs while the NPC answers (1-2 s typical for a fast text model). Lumi's decision is applied **after** the NPC finishes its turn: Lumi never speaks over the NPC [GDD §2.4.1].
- **Output validated with a schema** (§5.7). If the observer fails, truncates or does not answer in time, the scene continues without a signal (silent degradation of the feedback, never of the conversation) and the turn is re-evaluated when the scene closes.
- **Lumi's voice:** TTS in the L1 (Rioplatense, DP-28 of the GDD). Lumi's lines are **content templates** with blanks (`"Mmm... ¿{forma_erronea}...?"`), not free text from the model: the observer supplies the blank (the player's form cleaned of disfluencies, the correct form from the glossary when it exists) and the core assembles the template. Fixed templates have pre-generated audio; those with a blank are synthesized on the fly with a per-text cache (DP-A07).
- **Distillation and recall (post-task):** the server sends in `scene.end` the evidence events and the 1-3 recall questions chosen by the core from what was flagged; the phrasings come from templates in `lumi.es-AR.yaml`.

### 5.7 Error detection pipeline → learner model

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

Observer output contract (in `packages/protocol`, zod):

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

**Central pipeline risk (R2):** automatic transcripts tend to "normalize" speech toward grammatical forms (the player says *she go*, the transcript writes *she goes*), which **hides errors** from the observer; and the Rioplatense accent can degrade the transcript [References §4.2.3]. The evidence from the references research (`research/voz-costo-valor-2026-10-06.md` §3.1) says it is a real problem, so **the observer always receives the turn's audio** (D-095; ~US$0.0001-0.0003 per turn with a cheap multimodal model). Mandatory measurement in F0.1 (block G): operator recordings with seeded errors → **error preservation rate (EPR)** and rate of invented errors per source. Rule (D-149): Lumi corrects grammar live with confidence only if some source reaches EPR ≥ 80 % and invented ≤ 5 %; otherwise, she notes it for review with tentative language (`observer.liveGrammarSignals=false`).

### 5.8 Text mode and fallback

- **Text mode = same scene, different transport:** the player types; `scene-runtime` uses a text model with the same scene context; the NPC answers in text and, if the player wants, in TTS audio cached by text. **Synchronous** moderation completes before display (in text everything can be blocked).
- **Suggested options (A0-A1):** generated by the core from the content's `andamiaje` (not the model), to guarantee they are correct; choosing one emits `option_choice` (1 third).
- **Automatic fallback to text** (without losing the scene): voice budget exhausted, network drop without resumption, round-trip latency > threshold sustained, provider down, microphone denied. The client shows the reason in plain language.
- This is also the "cascade" route of DP-36 of the GDD for text mode with audio.

### 5.9 Cost instrumentation from day 1

- **Per-scene ledger** (`cost_ledger` table, §7.4), written by the server when each scene and each auxiliary call closes:
  `{sceneRunId, accountBucket, role (npcVoice|observer|textNpc|tts|moderation|summary), provider, model, audioInTokens, audioOutTokens, textInTokens, textOutTokens, ttsChars, wallSeconds, playerSpeechSeconds, npcSpeechSeconds, usd, priceTableVersion}`.
- **Versioned price table** in `apps/server/config/models.yaml` (lookup date and source per price); USD is computed on write and can be recomputed.
- **Derived metrics** (SQL queries, simple internal panel): US$/active voice minute, US$/scene, US$/active player/month, distribution by role (how much does the observer weigh?), turns per scene vs cost (to see the quadratic curve).
- **Alert thresholds** from the business case in configuration: ≤ US$0.03/min target, alert at US$0.05/min [Business §0, §7]. Exceeding the threshold does not cut the game; it fires an alert to the operator.
- **Voice budget** (`budget/`): before opening a Live session, the balance of the account or the institution's pool is checked; during the scene it is deducted per second of player and NPC audio; when it runs out, fallback to text without cutting [GDD §2.5.5]. Message in plain language ("Te quedan 18 minutos de voz esta semana; el modo texto no tiene límite"), never tied to potions (DP-08 of the GDD).

### 5.10 Models as configuration

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

- Adapter interfaces in `providers/`: `RealtimeVoiceProvider`, `SttProvider`, `TextModelProvider`, `TtsProvider`, `ModerationProvider`; in `pronunciation/`: `ScriptedAssessor`, `RealizationRecognizer` (§5.12). v1 implements Gemini Live, the cascade (Deepgram Flux + Gemini Flash + TTS) as a second `RealtimeVoiceProvider` (§5.11) and Azure + ZIPA for pronunciation; adding another provider is one adapter, without touching `scene-runtime`.
- Voice block in `models.yaml`: `voice.npc.adapter: live | cascade` (default: whichever F0.1 recommends per D-149; without F0.1, `live`), `voice.observer.source` (transcription source), `observer.liveGrammarSignals` (D-149), `cascade.stt`, `cascade.text`, `cascade.tts` and, for pronunciation, `pronunciation.scripted: azure | speechace` and `pronunciation.free: zipa | off`.
- "Preview" model ids change and are retired frequently: the server validates at startup that the configured models exist (provider listing call) and fails clearly if not.
- **Provider surface and minors (DP-A05, tied to DP-35 of the GDD):** as of my knowledge date, the additional terms of the Gemini API (via AI Studio) restricted its use in services directed at or likely to be accessed by people under 18, and the free tier allows data to be used to improve products. **Verify the current terms before any pilot with minors.** Default: development and adult pilot on the paid API; before the first pilot with minors, migrate to the same provider's enterprise channel (Vertex AI) or another provider whose terms allow it, after legal review. The adapter makes this a configuration change, not an architecture change.


### 5.11 Hybrid voice: Live and cascade interchangeable (D-092, D-148, D-149; ADR-023)

**Why:** with manual turns (`Terminé`, ADR-007) speech-to-speech loses its main advantage (natural turns) and keeps its quadratic cost: Gemini Live re-bills the context on every turn and has no cache. Estimate from the references research for a 20-min session: Live ~US$0.34-0.58, cascade ~US$0.16-0.27; several Gemini prices double on 2027-01-01 (`research/voz-costo-valor-2026-10-06.md` §5). The operator decided "voice probably real-time, but per feature and per stage, with data": that is why both routes exist from F5.1 and are chosen by configuration.

| Adapter | Chain | Strength | Weakness |
|---|---|---|---|
| `gemini-live` (port of LT, ADR-005) | audio → Live → audio | Hears the audio: better understands what the player *meant* to say despite errors or accent; expressive voice | Quadratic cost, no cache; "preview" ids that change |
| `cascade` | streaming STT (Deepgram Flux) → text model (Gemini Flash) with the same prompt → TTS (Gemini Flash-Lite TTS; Aura-2 alternative) with a speed parameter | Linear cost and ~2× lower; each piece can be swapped on its own; slow mode uses the TTS `speed` parameter | The ASR "fixes" errors (does not affect the NPC, does affect the observer: that is why the audio goes to the observer, D-095); added latency (budget in the study §3.3) |

**Contract:** both adapters implement `RealtimeVoiceProvider` and emit **the same events** toward `scene-runtime` and the scene machine (§3.5.1): `npcAudioChunk`, `npcTranscript`, `playerTranscript`, `turnDone`, `usage`, `error`. A shared contract test runs against both (F5.1). Moderation with holdback (§7.7) applies equally over the output transcript of either one. The ledger records cost **per adapter** (§5.9).

**Map by feature (D-148):** live NPC = the configured adapter (today Live; pilot, the winner of F0.1); observer = cheap multimodal model with audio + transcript; Lumi's corrections = templates + cached es-AR TTS; mission review = one text call; pronunciation = §5.12; slow speech = TTS `speed` when it exists + OLA on the client (§5.5.4); content = offline in Batch; drills = pre-generated audio + cheap STT.

### 5.12 Pronunciation service (D-044, D-150, D-151, D-155; ADR-024)

**What it does:** says *how* what the player said sounded, per phoneme, without false alarms. It lives on the server (`apps/server/src/pronunciation/`), receives the **same turn clip** as the observer (§5.7) and discards it when done (D-108). Nothing runs in the browser in v1.

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

**Rules:** (1) an LLM **never** judges phonemes; if it writes anything, it is from the structured output and outside Lumi's mouth, who only uses templates with an id (ADR-008); (2) an error type is shown only if `habilitados.yaml` enables it for that use (`guionado`, `libre`, `diagnostico`), and that table comes out of F0.1 (without F0.1, everything is `false`: only perception and self-comparison); (3) low confidence is not shown; (4) the only live effect in free speech is narrative when meaning breaks down (the NPC does not understand: rung 1 of the ladder, §3.5.2); (5) the server never stores audio; the client may store up to 20 clips in IndexedDB for "así lo dijiste vos / así suena", deleted on use or after 7 days (`services/audio/clipStore.ts`, D-155); (6) without a key or without a model, the adapter stays off and whatever depends on it is not shown.

**Cost:** ~US$0.02-0.05 per 20-min session (cap US$0.08 if Azure contrasts all free speech); US$0 for the operator as long as Azure's free F0 tier (5 h/month) suffices (`research/pronunciacion-2026-10-06.md` §6.3). **Target latency:** p95 ≤ 1.5 s in scripted moments (D-151).

---

## 6. Content and asset pipeline

### 6.1 Format and validation

- **Source:** YAML in `content/` (readable, allows comments in Spanish for whoever writes scenes). **Compiled:** JSON in `apps/web/public/content/` (only what the client may see) and in `apps/server/generated/content/` (everything, including prompts and level cards), generated by `scripts/content/build.ts`. Nobody edits the JSON by hand.
- **Schemas:** zod in `packages/content-schema` (they give TS types and runtime validation with the same code). One per type: `Mission`, `Scene`, `Npc`, `GlossaryEntry`, `SkillNode`, `ScaffoldLevel`, `LumiLine`, `Diorama`, `BoardTemplate`, `SafetyTopics`, `AssetRecord`.
- **Cross validations (they fail the build):**
  1. Unique and stable IDs; format `M<cap>.<n>`, `M<cap>.<n>-E<k>`, `NPC-<NOMBRE>`, `HAB-<RAMA>-<n>` [GDD §0.3.7]. An ID that disappears relative to the previous content version is an error unless it is listed in `content/retired-ids.yaml`.
  2. Every reference exists: a mission's NPCs, `reapariciones`, required skills, diorama interactables, referenced Lumi lines, assets referenced in the layout (and registered in `assets-registry.yaml`).
  3. Every scene has **all** the blocks of GDD §2.5.3 (including `salida_si_no_converge`, `temas_permitidos`, `resumen_para_siguiente`) and an equivalent `modo_texto`.
  4. **Vocabulary band:** scripted lines (openings, closings, hints, model sentences) use only words from the scene's CEFR band ∪ the glossary. Token lint with a word list per band.
  5. **Curated glossary:** every translation or object name the interface shows references a glossary entry with `estado: approved` (D-067; in the `MODE=fv` build also `reviewed`, D-128). In the release build (`npm run build:release`, §8.3), a referenced unapproved entry fails the build; in the development build (`npm run build`, the one in `verify`), it warns. That is why `verify` stays green with an all-`draft` glossary.
  6. **Safety:** no scene declares allowed topics that clash with the global forbidden list; every scene with an NPC whose sheet has `es_menor: true` (`02` §6.2.1; in Region 1, Maya and Noor) declares an everyday context and a public place [GDD §2.17.1, §3.3.3]. The rule fires on the field, never on a list of names.
  7. **No personal data:** pattern lint (emails, phones, disallowed URLs) over all content.
- The keys of the files are those of the GDD (DP-A02). Abbreviated example:

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

The ids and names of the v0.1 premise are never used in examples or fixtures: the list is in `02` §0.5.1 and is dumped by `content/retired-ids.yaml`.

### 6.2 Curated glossary

- `content/glossary/en.es-AR.yaml`: `{id, l2, l1: [traducciones], pos, banda, audio_l2, audio_l1, ejemplo_l2, ejemplo_l1, estado (draft|reviewed|approved, D-067), revisado_fecha, notas}`.
- It is the **only** source of translations and object names that the interface shows as truth [GDD §2.5.7]. The AI generates conversation; never translations shown as truth.
- Review is human (the operator or a native reviewer); a headless run may **propose** entries with `estado: draft` and never moves them to `reviewed` or `approved`.
- Tapping a word in a generated subtitle: if the word is in the glossary, the entry is shown; if not, "Marcar para repasar" is offered with no invented translation. (The "model translation labeled as automatic" variant of DP-A20 is **not** the default: see D-068, the registry wins.)

### 6.3 Audio of scripted lines

- `scripts/audio/pregenerate-lines.ts` (manual, needs a key; **does not run in CI or in headless runs without authorization**): walks the scripted lines, generates audio with the voice assigned to each NPC (same voice as in Live, DP-20 of the GDD; verify that the provider's TTS engine offers the same voices) and writes `public/audio/lines/<lineId>.<hash>.ogg` + `content/audio-lines.manifest.json`.
- The name carries the hash of text + voice: if the text changes, the manifest marks the line as outdated and the build warns (in `build:release`, §8.3, it fails).
- While a line has no audio, the client shows it as text + live TTS (acceptable degradation in development).

### 6.4 Assets: CC0 3D models repainted to the palette and props by code (D-207; D-153 re-read)

#### 6.4.1 Flow

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

#### 6.4.2 License registry (mandatory, `content/assets-registry.yaml`)

`{assetId, archivo, pack, autor, licencia (CC0-1.0 | CC-BY-4.0 | comercial-con-modificacion …), url_origen, fecha_descarga, sha256_original, modificaciones, atribucion_requerida, notas}`. **Policy D1 since D-209 (2026-10-30):** closed list of free-to-use licenses (CC0-1.0, CC-BY-3.0, CC-BY-4.0 with attribution; MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Zlib, OFL-1.1 with `archivo_licencia`); anything non-commercial, no-derivatives, share-alike, GPL/LGPL/AGPL, personal use, unknown or without proven provenance fails closed. Every served or vendored file carries `sha256` and `procedencia` (a test recomputes them); generated rows carry `generador` instead of URL and date; vendored code goes in `content/code-registry.yaml`; production npm licenses are checked with the exceptions table `content/npm-licence-overrides.yaml`; a derivation blacklist (AC10) tests paths and contents; `npm run assets:refetch` re-downloads, re-derives and compares bytes. The build fails if a file in `public/models`, `public/portraits`, `public/audio` or `public/textures` has no record, if its license is "non-commercial" or "personal use only" (D-153), or if a record with `atribucion_requerida: true` does not appear in the generated credits screen. The ZIPA ONNX model (CC BY 4.0) is registered all the same even though it lives on the server. The exact names of the Kenney kits and whether the characters come with rig and animations are verified on download [GDD §5.7, DP-19].

#### 6.4.3 Diorama layout as data

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

(The example uses the diorama id `plaza` = the Crossing, D-180. `02` §6.2.6 writes `diorama: cruce` in an example sheet: until the architecture review renames the ids, the content uses `plaza` and `muelle`, and the difference is reported.)

Since the estetica-c plan M7 (D-207) the HD-2D keys `tiles` and `atlas_tiles` are rejected with a message that points to this format (M5). The compiler generates: walkability grid (0.5 m cells), the curves and water for `world/terrain/`, the budget estimate per tier (§6.4.5), the interactables table and the **site anchors** table (`validate:content` fails if a sheet in `content/fundaciones/` has no anchor in its diorama, if an anchor has no sheet, or if a state that occupies cells leaves an NPC or interactable without a path; F3.3).

#### 6.4.4 Instancing and merging

- Every asset with ≥ 3 appearances in a diorama is drawn with instances (one draw call).
- Static non-interactive props that share the toon material are **merged** at build into a few meshes per diorama (with per-vertex tint to preserve the palette).
- Interactables stay as separate meshes (they need raycast, glow and outline).

#### 6.4.5 Diorama validator (fails the build)

Connectivity between the player's spawn, each NPC and interactable (BFS over the grid); corridors of at least 2 cells; budgets of the `medium` tier (§2.7.1) estimated statically: total triangles, estimated draw calls (merged meshes + instance groups + interactables + characters), texture memory.

#### 6.4.6 Placing by code without an editor

Code AIs place assets by writing coordinates in YAML. So the operator can correct by eye without an editor: in development mode there is an overlay with the grid (axes and coordinates) and a "click to copy coordinates" mode that puts the position of the clicked point on the clipboard. No level editor is built (DP-A16).

#### 6.4.7 Characters and Lumi

- Characters (since D-207; plan estetica-c M3 and M5): **rigged chibi 3D** of 2.5 to 3 heads, a repainted CC0 base body (KayKit) with a head made by code and clips retargeted to a single skeleton (idle, walk, talk, gestures); diversity of the 14 neighbors of `02` §3.1 (D-166) through an `apariencia` block in their content sheet, which `validate:content` requires for every NPC placed in a diorama. Clover (the goat, D-174) depends on the animal pack. The player is also a rigged character.
- Animation off-screen or far away: frozen; cap on animated characters per tier (§2.7.1); during conversation only the player and the scene's NPC are animated (§2.7.4).
- Lumi: **a light bug that travels in a jar** (D-165, supersedes the little lantern): a small emissive core by code + halo + trail, and the glass jar as a simple volume the player carries; it leaves the jar and floats near the player (whatever remains valid of DP-39 of the GDD). It is the most polished object but also the cheapest to produce.

#### 6.4.8 World that reacts to state (foundations, network, saturation)

Rule (D-169, D-194): **the map is a view of the world state**, never the other way around. Mission effects (the `efectos` field of the mission or scene in the content: `fundacion: {sitio, estado}`, `intro: NPC-X`, `flag: …`) are applied by the core when a scene closes (the server emits it as an event, R8) and end up in `world.fundaciones` and `world.red`; `world/foundations/` draws with pure functions (`foundationVisuals`, `networkPaths`) and the Crossing's saturation comes from a selector (`selectCrossingSaturation`). The credits of each foundation ("La hicieron Nell, June… y vos", `02` §1.8) are shown on inspection, in the HUD (DOM), from a selector. Until F7 that state lives in memory; F7 persists it in `SaveStore` (D-157). In director mode, the snapshot includes `foundations` and `network` (§6.5.2).

### 6.5 Director mode (development only; FD0 and FD1; ADR-026)

**What it is.** A development tool so the operator can play and fix content at the same moment, with a copilot alongside (D-187: confirmed by the operator in the brief, 2026-10-06). It is not a game feature and **never** reaches a production build. Not to be confused with the audio "director" of `services/audio/` nor with the `[DIRECTOR]` notes of the NPC prompt (§5.5.3).

#### 6.5.1 Dev-only rule (contract)

1. **Double key on the client:** the director mode code is only loaded with `import.meta.env.DEV && import.meta.env.VITE_LG_DIRECTOR === "1"`, through a dynamic `import()` from the composition root (`apps/web/src/boot/dev.ts`). In `vite build`, `import.meta.env.DEV` is a literal `false`: the branch is eliminated and the chunk is not emitted (tree-shaking).
2. **Node separate:** everything Node lives in `tooling/director/` (workspace `private: true`, outside `apps/`): the Vite plugin (`apply: "serve"`, never in `build`), the CLI, the MCP server and (FD1) the copilot. `apps/**`, `packages/**` and `scripts/**` do not import it (lint, §4.3.1).
   **Plugin wiring (single path):** the plugin is registered **only** in `tooling/director/vite.config.ts`, which does `mergeConfig(baseConfig, { plugins: [directorPlugin()] })` over the config imported from `apps/web/vite.config.ts` (with `root` at `apps/web`). `npm run dev:director` = `VITE_LG_DIRECTOR=1 vite --config tooling/director/vite.config.ts` (variable set with `cross-env` or the equivalent the repo already uses, with no new dependency if one already exists). `apps/web/vite.config.ts` **never** names or imports director mode: `npm run dev` and `vite build` use that config and, by construction, do not load the plugin. This way the production build is free of the director **structurally**, not only through `apply: "serve"`. The `apps → tooling` lint zone guarantees it (it covers `apps/web/vite.config.ts`) and its fixture (FD0 A2). `apps/server` does not depend on any director SDK.
3. **Exclusion test:** `check:budgets` includes `check:dev-only`: after `vite build` (also with `VITE_LG_DIRECTOR=1` in the environment) it walks `apps/web/dist/**` and fails if it finds a marker (`__lg_director`, `/__director/`, `lg:director:`, `DirectorPanel`, `claude-agent-sdk`, `LG_ANTHROPIC`, `data-lg-dev-factors`) or a chunk whose name starts with `director`. `data-lg-dev-factors` is the attribute set by the dev-only performance-factor registry (`world/budget/devFactors.ts`, `?factor=...`, plan open-world-3d T10, D-209); the probe hook (`__lg_director:perf-probe`) falls under `__lg_director`. A test plants a marker in a fixture `dist` and checks that the detector finds it (no false green).
4. **Local only:** the plugin refuses to activate if Vite's development server listens outside `127.0.0.1`/`localhost` (same rule as D-158) and says so in the console.
5. **Nothing leaves the machine:** `.director/` is in `.gitignore`; the journal never stores audio (D-108); the copilot's key never reaches the browser.

#### 6.5.2 v0 (FD0): live state, tool for Claude Code, hot reload, journal

- **Snapshot.** Type `DirectorSnapshot` (zod, `packages/protocol/src/director.ts`, version `v: 1`): `{ v, sessionId, at, build: { contentHash, gitSha }, region, diorama, player: { tile: {x, y}, pos: {x, z}, facing }, nearby: [interactableId], scene: { missionId, sceneId, step, turnIndex } | null, path: [{ tile, at }], npcsTalked: [npcId], dialogue: [{ turnId, speaker, text, at }], worldFlags, foundations: { "SITIO-*": estado }, network: ["intro:NPC-*"], lastPick | null, contentErrors: [{ file, key, message }] }`. `step` is the state of the scene machine (§3.5.1); `path` stores only cell changes (≤ 500, the oldest drops out); `dialogue`, the last 20 final lines. It is built by **one** selector (`selectDirectorSnapshot`, in `apps/web/src/dev/director/`) that only reads `state/selectors/`: no game layer knows about director mode. Fields from phases that do not exist yet (scene, dialogue, foundations) come out `null` or empty: the selector invents nothing; when a slice changes shape, the selector stops compiling (`tsc` in `verify`) and the phase that changed it fixes it.
- **Transport.** The client sends the snapshot over Vite's HMR channel (`import.meta.hot.send("lg:director:snapshot", …)`) with throttling (≤ 4 per second and only if it changed). The plugin writes `.director/state.json` atomically (temp + rename) and exposes `GET /__director/state` and `GET /__director/journal?session=<id>&tail=<n>` on the development server.
- **Tool for Claude Code (the assistant alongside the browser).** CLI `npm run director -- state | where | journal [--tail N] [--session ID] | sessions | content <id>` (no new dependencies; reads `.director/` and `content/`; `where` prints one readable line: diorama, cell, nearby NPC, mission and step) and an MCP server over stdio (`tooling/director/src/mcp.ts`; tools `director_state`, `director_journal`, `director_sessions`, `director_content_lookup`), registered in `.mcp.json` (D-188). Both are shells over `tooling/director/src/read.ts`.
- **Content hot reload.** The plugin watches `content/**` and, on a change, runs the **incremental** content compilation (the one from `scripts/content/build.ts`, exposed as a function), validates (zod, references, `validate:content` lints) and: if it passes, writes the compiled output and emits `lg:content:updated` with the touched ids; `services/content/` reloads that JSON and dispatches `contentReloaded(ids)`; if a diorama changed, the world re-derives grid and chunks; if an open scene uses a touched id, the change applies **on the next scene**, never mid-scene. If it does not pass, nothing is written, the game continues with the last good content and the error (file + key) shows up in the Vite overlay and in `contentErrors`. The server re-reads `apps/server/generated/content/` only with `LG_DEV_CONTENT_WATCH=1` (`apps/server/src/content/loader.ts`), also for the next scene. Without restarting anything.
- **Test-session journal.** `.director/journal/<sessionId>.jsonl`, append-only. Events `{ seq, at, type, … }` (schema in `packages/protocol/src/director.ts`): `session.start` (git sha, content hash, tier), `move.cell`, `interact`, `scene.start`, `scene.end` (result, criteria met), `choice` (`pressDone`, `pressPass`, `choose` with the option), `line` (final text of the turn, never audio), `content.reload` (ids, ok or error), `director.note` and `director.edit` (FD1), `session.end`. Retention: D-192.

#### 6.5.3 v1 (FD1): side panel with copilot

- **Panel (DOM).** React + Tailwind in `apps/web/src/dev/director/panel/`, mounted in its own root (`#lg-director-root`) next to the game. Its state (messages, pins, proposals, connection) lives in **its own development Zustand store** (`apps/web/src/dev/director/store.ts`), outside the game store (the 9 slices of §3.3 do not change). It reads the game only through `state/selectors/` and dispatches only `state/actions.ts`.
- **Click on the map to pin a place (respects R3).** The panel puts the game in `ui.pointerMode = "inspect"` (public action `setPointerMode`). In `inspect`, the R3F click on the ground or on an object in `world/` dispatches through `state/bridge.ts` the semantic action `pickTile({ diorama, tile, targetId? })`, which saves `world.lastPick` instead of moving the player; in `play` (default) the same click is still `moveTo`. The panel reads `selectLastPick` and adds it as a **pin** to the request (diorama, cell, nearby ids, `SITIO-*` if any). The world never imports the panel and the panel never touches 3D objects.
- **Server-side copilot.** `tooling/director/src/copilot/` uses the **Claude Agent SDK** (package `@anthropic-ai/claude-agent-sdk`, `query()` with tools and an in-process MCP server; **[assumption: names and options are verified against the installed version, §0.5]**) inside the Vite development server process: `POST /__director/chat` with a streaming response (SSE). The `LG_ANTHROPIC_API_KEY` key is read only by that process; it never carries a `VITE_` prefix, never goes to the browser, a log or the journal (tests). The model lives in `tooling/director/config.yaml`, never in code (like ADR-018). All behind the `CopilotRunner` interface (`agent-sdk` adapter + scripted fake adapter for tests).
- **Copilot tools (closed list).** Repo reading (`Read`, `Glob`, `Grep`) and its own tools: `director_state`, `director_journal`, `content_validate(candidate)`, `content_apply(candidate, summary)`, `content_revert(sha)`. `Write`, `Edit`, `Bash`, `WebFetch` and the SDK's other write or shell tools are disabled and a `canUseTool` rejects them anyway (double key). The copilot prompt is written in English (D-025) and carries the snapshot, the pins, the last journal lines and the rules of `02` §0.2 (no money, no personal data, knowledge items with a sheet, no figures).
- **Applying a change (fixed order).** (1) **Allowed path** (D-190): only `content/**/*.yaml` and `content/prompts/*.txt`; never `content/authoring/`, `content/assets-registry.yaml`, binaries, code or `docs/`. (2) **Validation** of the full set with the candidate overlaid in memory: zod + references + safety and band lints (those of `validate:content`). (3) **State guards:** it does not raise a glossary `estado` to `reviewed`/`approved` nor a knowledge item's to `verificado`/`revisado` (D-067, D-195), does not reuse retired ids (`content/retired-ids.yaml`) nor rename existing ids. (4) If everything passes: writes, recompiles (hot reload shows it) and **commits** (D-191): first `git add -- <paths>` (needed when the candidate **creates** a new file, for example an NPC, a knowledge item or a foundation: `git commit --only` with a path git does not know fails with *pathspec did not match*) and then `git commit --only -- <paths>` with message `director(content): <summary>` and trailer `Director-Session: <id>`; if any already-existing path had uncommitted changes from the operator (checked **before** writing and before `git add`), it does not apply and says so. (5) Records `director.edit` with the sha in the journal and shows the diff in the panel. **Undo** = `git revert --no-edit <sha>`, only if that commit touches only `content/` and the files did not change afterwards; otherwise it warns and forces nothing. Never `push`, `reset --hard` or history rewriting.
- **Cost.** Each request records usage (tokens) in `.director/cost.jsonl`; alert per D-189. Headless runs never call the real copilot (D-027): tests use the fake adapter and a temporary git repo.

#### 6.5.4 What it does not do

It is not a visual editor of levels or assets (DP-A16 stands); it does not edit code, docs or decisions of `00`; it does not mark glossary or knowledge items as reviewed; it does not exist in production; it does not store audio; it does not replace headless runs (a mechanics change still goes through `/develop`).

---

## 7. Data and backend

> This section describes technical design requirements. **It is not legal advice.** Concrete compliance (Argentina: Ley 25.326; Brazil: LGPD and ECA Digital, Lei 15.211/2025, in force since 2026-03-17; US: COPPA if entering) requires legal review before the first pilot with minors [GDD §2.17].

### 7.1 Shape of the backend

**A single Node process** (`apps/server`) that serves: the static build, the REST API, the scene WebSocket and scheduled jobs (retention). A single managed Postgres database. No queues, no microservices, no Redis in v1 (C13).

| Hosting option | Pro | Con |
|---|---|---|
| **Container on Cloud Run, São Paulo region (default DP-A03)** | WebSockets supported with a configurable request timeout (scenes last ≤ 5 min); scales to zero; same provider as Gemini's enterprise route (DP-A05); region close to Argentina | Cold start (mitigate with 1 minimum instance during pilots); WS sessions tied to one instance |
| Fly.io / Railway | Simple, native WS | One more provider; South American region to be verified |
| Own VPS | Full control, fixed cost | Operations (patches, TLS, backups) fall to a team of 1-2 |

**Expected scale without data (assumption):** pilot of hundreds of students, peaks of one or two simultaneous classrooms (≤ 60 voice sessions). One process handles that; the bottleneck is the voice provider, not the server. If it grows to thousands of concurrent users, revisit (WS affinity, several instances, a shared store for budgets).

### 7.2 Accounts, roles and minors

| Role | Sign-up | Login | Data requested |
|---|---|---|---|
| Adult player (18+) | Direct | Magic link by email (DP-A09) | Email, game name, declared age band |
| Minor player | **Only** via class code (teacher) or guardian invitation | Class code + access card (DP-A08: image + word, no email) | Game name (from a suggestion list), age band. **Nothing else** |
| Guardian | Invited by the minor flow or by the institution | Magic link | Guardian's email, recorded consent |
| Teacher | Invited by institutional admin | Magic link | Institutional email |
| Institutional admin | Manual sign-up by the operator in v1 | Magic link | Institutional email |

- **Age gate** (DP-12 of the GDD): direct accounts only 18+; a minor without a class code or guardian enters the guardian flow [GDD §2.14].
- **Consent:** `consents` table with `{subjectAccountId, grantorRole (guardian|institution), grantorAccountId, scope (voice_processing, transcripts_30d, experiments, safety_alerts), text version, at, revokedAt}`. Voice is not processed for a minor without current consent with scope `voice_processing`: the game works in text mode.
- **Guardian control:** view progress, view what is stored, export, delete the account, limit voice minutes or force text mode [GDD §2.17.2].
- **Sessions:** `httpOnly`, `Secure`, `SameSite=Lax` cookie, rotation; no tokens in `localStorage`.

### 7.3 Data minimization (implementation of GDD §2.13 and DP-13)

| Data | Stored | Retention | Technical notes |
|---|---|---|---|
| Raw audio | **Never** | — | Passes through server memory toward the provider and is discarded; no buffer is written to disk or logs |
| Scene transcripts | Yes, encrypted at rest (database encryption) | **30 days** and deletion by job | Visible only to the player (and their guardian); the teacher never sees raw ones from minors (DP-29 of the GDD) |
| Extracted items (review bank, error patterns, evidence) | Yes | Account lifetime | No free text from the player beyond the minimal evidence `quote`; the `quote` passes through the personal-data scrubber |
| Summary between scenes | Yes | Lifetime of the next scene + 30 days | Scrubbed: the observer flags `personalDataDetected`; a deterministic filter (patterns) and the model remove real names, schools, addresses, phones |
| Telemetry | Yes, pseudonymous | 13 months (DP-A14) | Pseudonymous account id in the events table; no stored IP; no fingerprinting; no third-party SDKs |
| Server logs | Metadata only | 30 days | Logging audio, transcripts, prompts with profile, emails is forbidden (log lint + review) |

**International transfers:** voice processing happens at the AI provider, outside Argentina and Brazil. Ley 25.326 and LGPD regulate international transfers; the choice of provider, region and contract (DP-A05) enters the legal review.

### 7.4 Persistence (data model at concept level)

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

- **While F11 is postponed (D-135, D-157, D-158):** the same sources of truth live behind interfaces (`EvidenceStore`, `SaveStore`, `LearnerStore` in `apps/server/src/store/`) with an append-only file adapter in `apps/server/data/` (gitignored), on a local server bound to `127.0.0.1` with `LG_OPERATOR_MODE=1` and the pseudonymous account `op-local`. F4.1 creates `EvidenceStore`; F7 completes saving (includes `world.fundaciones` and `world.red`) and the learner model; F11.1 adds the Postgres adapter without touching the consumers.
- **Hand-written SQL migrations**, numbered, applied by an in-house script that verifies the result against `information_schema` (do not trust a migration tool's "success" without verifying). Queries with a lightweight Postgres client; no ORM in v1 (DP-A04 includes the Postgres provider).
- **Saving:** the client saves when each scene ends and when the tab closes [GDD §2.2.2]: (1) `saves` with `schemaVersion` and migrations in `packages/core/save`; (2) progress is not "saved": the server emits it as events. Local copy in IndexedDB for the part that works without network (3D, notebook) [GDD §2.20]; on reconnect, it is merged (settings: last write wins with a timestamp; events: union by id).
- **Teacher reports:** queries over `progress_by_account` aggregated by class and can-do; they never expose transcripts of minors.

### 7.5 Institutions and classes (concept)

- Institution → admins, teachers, pool of voice minutes per period, safety-alert policy (who sees what).
- Class → short 6-character code without visual ambiguity (no 0/O, 1/I), roster by CSV with generated game names, printable access cards, weekly assignments, "classroom mode" (push to talk by default, bounded NPC volume) [GDD §2.18].
- The teacher panel is a separate entry (`docente.html`) that only talks to the REST API; it does not load three.js.

### 7.6 Telemetry: learning separated from engagement

| Flow | Events | Use |
|---|---|---|
| **Learning** (`learning_events` + `evidence_events`) | evidence (already described), result of criteria per scene, self-correction after a signal, item retrieval by interval, results of the assessment task (visiting NPC without hints) [GDD §6.1] | Reports, A/B, outcome metrics |
| **Engagement** (`engagement_events`) | `session_start {trigger: "free"|"reminder"|"teacher_assignment", pendingReward: false}` (for **free choice**, the north-star metric [GDD §6.2]), `scene_start/end`, accessibility use (slower, silence, text, hints), scene abandonment, graphics tier, fallback to text and reason | Retention by cohort, accessibility, technical health |
| **Cost** (`cost_ledger`) | §5.9 | Unit economics |
| **Quality** | "algo está mal" button (translation, recognition), observer schema rejections, moderation cuts | Trust in the content and the AI |

- A/B arm assignment per account, deterministic (hash of account id + experiment id) and recorded; no arm removes accessibility; for minors it requires approval from the institution and the guardian [GDD §6.3].
- No third-party analytics (DP-A14): everything to Postgres through an own endpoint with batching; a basic internal query panel.

### 7.7 Safety and moderation layer for model output (resolves DP-37 of the GDD)

Defense in layers; no single one is enough.

1. **Scene frame** (prompt): allowed topics, global forbidden topics, never ask for personal data, `[DIRECTOR]` notes never verbalized, containment if risk appears. Provider safety settings at the strictest level for minor accounts.
2. **Input (what the player says):** the transcript passes through the fast filter (per-language lexicon + patterns) and, in parallel, through the classifier. **Honest limit:** the player's audio has already reached the voice model when it is transcribed; input moderation cannot prevent the model from "hearing" it, but it can (a) inject a direction note to redirect, (b) trigger containment or (c) close the scene. In text mode it is blocked before reaching the model.
3. **Output (what the NPC says) in voice:** `outputTranscription` is scanned with the fast filter synchronously and with the classifier per sentence. The server applies **audio holdback**: it forwards the NPC's audio with a fixed delay (default 500 ms for minor accounts, 0-200 ms for adults; configurable) so the transcript has time to arrive and be filtered. If it fires: it stops forwarding audio, sends `npc.interrupt` (the client flushes the queue), discards the rest of the turn and plays a scripted safe line from the NPC ("Hmm, let's get back to the dog!"); records a `safety_event`.
   - **Accepted and documented residual risk:** if the transcript arrives later than the holdback, a short fragment of audio may sound before the cut. The real transcript latency is measured in the probe (#1) and the holdback is adjusted. If the measured residual risk is not acceptable for minors, the alternative is the cascade (text → moderation → TTS) for minor accounts, with its higher latency.
4. **Output in text:** full synchronous moderation before display.
5. **Containment (DP-38 of the GDD):** on `safety: "risk"`, the scene moves to `containment`: scripted line outside the fiction, local help resource from a list curated per country, `safety_event` with visibility per the institution's or guardian's policy. The protocol and the texts are reviewed by specialists before the pilot.
6. **Personal data:** if the player gives it, the NPC does not repeat it (instruction) and the observer removes it from the summary; the evidence `quote` is scrubbed.
7. **Audit:** sampling of scenes (transcripts from adults with consent, or synthetic) to review quality and safety; never transcripts of minors without the agreed policy.

### 7.8 Application security (minimums)

Keys only on the server; strict CSP (no third-party scripts, `connect-src` only to the own API); zod validation of every WS and REST message; rate limits per account and per IP on the API and on scene opening; maximum audio frame size; logs pass through a redactor (list of forbidden fields) and there is a test that fails if a logger receives fields marked as sensitive; dependencies with lockfile and audit in CI.

---

## 8. Testing strategy compatible with headless runs

**Operator rule:** no Playwright and no automated browser. The UI is verified with `vitest` + `tsc` + `lint`; the operator reviews in the browser. Limited exception, RATIFIED 2026-10-27 (with the condition that the browser always closes when done): `npm run walk:browser` (`scripts/dev/browser-walk.ts`), on request, never in `verify`, CI or Vercel, only with scripted models (row of 2026-10-26 in `00-decisiones.md`). All automated tests run without GPU, without microphone, without network and without keys.

### 8.1 Pyramid

| Level | What it covers | Tool | Determinism |
|---|---|---|---|
| Core (most of it) | Movement (A*, collision, fixed step), scene machine (all the transitions and invariants of §3.5.1), companion policy (density, ladder, modes, A/B arms), evidence folding (thirds, spill, unlocks), Leitner (intervals, time zone), scaffolding (ups and downs), save migrations, experiment assignment | vitest | Injected clock and RNG; no `Date.now()` or `Math.random()` |
| Content | All schemas, cross references, vocabulary band, reviewed glossary, safety, personal data, diorama validator, asset registry | `npm run validate:content` (vitest + script) | Total |
| Store | Each action: calls the core, does not mutate the input, selectors return what is expected; full flow "interact → scene.end → progress" with simulated server messages | vitest | Total |
| Protocol | Message schemas, binary audio framing (round trip) | vitest | Total |
| Server | `scene-runtime` against an in-process **fake Live server** that replays event scripts (transcripts, synthetic audio, `turnComplete`, `goAway`, drops); observer against **recorded responses** (including truncated and invalid ones); moderation (holdback and cut); budget (exhaustion mid-scene → text); cost ledger (calculation with price table); retention (deletion job); log redactor | vitest | No network; providers are fakes |
| Observer contract | "Golden files": turn inputs → expected `ObserverResult` from the fakes; verifies that the deterministic rules (key normalization, disfluency discard) always give the same result | vitest | Total |
| DOM UI | HUD components, dialogue, notebook, settings, onboarding, teacher panel: render with seeded store state, accessible roles and names, keyboard navigation (simulated events), `aria-live` in subtitles, no hardcoded text outside i18n | vitest + Testing Library + jsdom | Total |
| 3D world | R3F components: that a diorama mounts the expected instances, that `Npc` changes animation according to `dialogue.state`, that the dialogue camera picks the content's framing | vitest + `@react-three/test-renderer` (no WebGL) | Total |
| Budgets | Bundle (§2.7.3), assets (§6.4.5), count of dynamic lights per tier | scripts in CI | Total |
| Types and boundaries | `tsc --noEmit` across the whole monorepo; ESLint with module boundaries and log rules | tsc, eslint | Total |

### 8.2 What is NOT automated (and who reviews it)

- How it looks and feels (aesthetics, camera, real performance on the target PC): **the operator in the browser**, with a per-milestone checklist written by the run in its report (what to look at, in what order, what to expect).
- Real voice quality, latency, naturalness of slow mode, chosen voices: the operator, by ear.
- **Evaluation with real models** (`npm run eval:live`): optional suite, **never** in the default `test`, only with explicit authorization and the operator's key, with a configured spending cap; it runs scenes with synthetic players (text) and measures convergence, respect for the frame and observer quality. Headless runs do not run it on their own.

### 8.3 Gates (root scripts)

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

**Development build vs release build.** `npm run build` (the one `verify` runs) is the **development build**: content rules that depend on human steps (referenced unapproved glossary, outdated or missing line audio) **warn** and do not fail. `npm run build:release` is the **release build**: same outputs, but those rules **fail**; with `MODE=release` it requires an `approved` glossary; with `MODE=fv` it accepts `approved` + `reviewed` and runs `scripts/fv/check-glossary.ts` (D-128). The FV phase creates it (before that it is not needed: nothing is deployed). `build:release` is **not** part of `verify` or of any headless run: the `[operator]` (or a deploy pipeline) runs it before deploying. A headless run never interprets "build" as the release build.

**Glossary in the interface (single rule, D-131).** The content compiler writes `glossaryDisplay: "dev" | "release" | "fv"` into the compiled manifest and the HUD filters by that value: **dev** (`npm run dev` / `npm run build`, the one in `verify` and in the operator's H1/H2 gates) shows `approved` unmarked and `reviewed`/`draft` with a visible "borrador" mark; **release** (`build:release` with `MODE=release`) only `approved`; **fv** (`MODE=fv`) `approved` + `reviewed`, never `draft` (D-128). In all three, a word without an entry is not translated (D-068).

A phase of a headless run is done when `npm run verify` passes (before F1.1 —P0, F0.1, F0.2— the gate is the phase's local command and no root `package.json` is created, D-133) and the report includes the manual verification checklist for the operator. A red gate is not "fixed" by lowering the threshold without an explicit DP.

---

## 9. Technical build sequence and gates

Order by technical dependencies (the product roadmap decides schedule and content). Each step ends with `npm run verify` green.

| # | Step | Deliverable | Depends on |
|---|---|---|---|
| T0 | Bootstrap | Monorepo, strict TS, ESLint with boundaries, vitest, empty gate scripts, `.env.example`, README | — |
| T1 | Base core | `runtime` (Clock/Rng), versioned `save`, `experiments`, `movement` (grid, A*, collision) with tests | T0 |
| T2 | Minimal content | Zod schemas for all types, compiler, validations; prologue content (M0.1-M0.3) and Muelle diorama | T0 |
| T3 | DOM shell + store | Slices, selectors, onboarding without 3D, accessibility settings, i18n es-AR, `dialog-only` | T1, T2 |
| T4 | Minimal HD-2D map | Deferred Canvas, `buildTileChunk`, billboards, `CameraRig` by presets, semantic input, Player with click and WASD, tiers with postprocessing and detection (§2.9) | T3 |
| T5 | Asset pipeline | `optimize.ts` (volumes, tile atlas, sprite sheets), registry, `inspect-budgets`, first packs in Muelle and Plaza | T2, T4 |
| T6 | Scene machine + text mode | `core/scene`, `scene-runtime` with text model (fake in tests), text moderation, full dialogue HUD with scaffolding bar and silence menu | T3, T2 |
| T7 | Voice | WS gateway with two adapters (Live ported from LT, no client `setup`; cascade) (§5.11), capture/VAD/playback worklets with time-stretch, manual turns, fallback to text, per-adapter cost ledger and budget | T6 |
| T8 | Observer + Lumi | Multimodal observer with schema, `decideCompanion`, signals, annotate, distillation, recall, Lumi on the map and bubbles | T6 (text) and T7 (voice) |
| T8b | Pronunciation | Pronunciation service (§5.12), recurrence core, scripted moments, drills, local clips | T8 |
| T9 | Progression and review | Evidence events, potions, tree, Leitner (with pronunciation items), adaptive scaffolding, notebook | T8, T8b |
| T10 | Accounts and data | Postgres, migrations, auth (adult, class, guardian), consents, saving, retention | T3 (can start in parallel from T1) |
| T11 | Minimal institutional | Teacher panel, classes, codes, assignments, reports by can-do, voice pools | T9, T10 |
| TD0 | Director mode v0 (dev only) | Vite plugin, live snapshot, CLI + MCP, content hot reload (client and server), session journal, `check:dev-only` (§6.5.2) | T2, T3, T4 |
| TD1 | Director mode v1 (dev only) | Side panel, `pickTile`/`pointerMode`, copilot with Claude Agent SDK behind `CopilotRunner`, validate → apply → commit → undo (§6.5.3) | TD0, T6 |
| TF | Foundations and network layer | `sitios` anchors, `foundationVisuals`, `networkPaths`, saturation, credits (§6.4.8) | T5 |
| T12 | Vertical slice (DP-10 of the GDD) | Prologue + Ch. 1 complete with pre-generated audio; operator's manual verification checklist | everything above |

**Mapping to the roadmap phases:** T0-T1 = F1.1a/F1.1b (D-161); T2 = F1.2; T3 = F1.3; T4 = F2; TD0 = FD0; T5 = F3.1-F3.2; TF = F3.3; T6 = F4; TD1 = FD1; T7 = F5.1a, F5.1b, F5.2; T8 = F6; T8b = FP.1-FP.2; T9 = F7; T10-T11 = F11 (postponed, D-135); T12 = F8-F10. T4-T5 run in parallel with T6-T8b (D-020); TD0 goes before the mission content phases (F8) and TD1 after the dialogue HUD (F4.2).

**Mapping to the phases of the third-party proposal:** "Setup" = T0-T3; "Movement and Camera" = T4-T5; "DOM Dialogue System" = T6-T8; "Grid and Building" and "Economic loop" **do not exist in mode 1** (DP-15 of the GDD) and are replaced by "Speech and potions loop" = T8-T9.

**Experiments that must run before closing decisions** (they do not block T0-T6): F0.1 in the LT harness and in `experiments/f0-voice-probe/` (cost per adapter, observer EPR, pronunciation detection table; decides D-148-D-151 and calibrates the holdback), F0.2 with the HD-2D spike (calibrates §2.7 and D-154), bandwidth measurement in a school (DP-A06, postponed with the pilot).

---

## 10. Risks

| # | Risk | Probability / impact | Early signal | Mitigation in the architecture |
|---|---|---|---|---|
| R1 | **AI provider terms vs minors:** the Gemini API via AI Studio might not allow services likely to be accessed by minors; also, free-tier data used for training | Medium / very high (blocks school pilots) | Reading current terms | Provider adapters; adult default on paid API and migration to an enterprise channel or another provider before minors (DP-A05); legal review |
| R2 | **Transcription normalizes the player's errors** or fails with the Rioplatense accent → the observer misses errors or sees false ones | High / high (the companion loses authority) | EPR per source in F0.1 | Observer always with audio (D-095); D-149 rule (without a reliable source, Lumi only notes with tentative language) |
| R3 | Shared **classroom bandwidth** does not sustain 25 simultaneous voices | Medium / high in schools | Measurement in a school | Binary, upload only with speech, classroom mode; Opus if needed (DP-A06); automatic fallback to text |
| R4 | **Performance on school PCs** worse than assumed | Medium / high | Benchmark #5 | Tiers, `dialog-only`, budgets verified in CI, 30 FPS in conversation |
| R5 | **Voice cost** above the threshold (billed silence, context re-billing, expensive observer) | Medium / very high (business model) | Ledger from day 1 | Short scenes, minimal context, no silence transmitted, `Repetir` at no cost, text mode, alerts |
| R6 | **"Preview" models retired** or with API changes | High / medium | Validation failure at startup | Models in configuration, startup validation, adapters, fakes that freeze the contract |
| R7 | **Voice moderation with latency**: an inappropriate fragment sounds before the cut | Low-medium / very high with minors | Measured transcript latency | Layers of defense, holdback, safe line, cascade for minors if residual risk is not acceptable |
| R8 | **Heterogeneous assets**: packs of different styles, characters without useful animations | High / medium | First integration (T5) | Palette by tint, single material, one main pack per category, DP-19 of the GDD |
| R9 | **Lumi's Rioplatense voice** of low quality or with the wrong accent | Medium / medium | Listening test | DP-A07: choose by ear; fixed pre-generated lines; Lumi in text if there is no acceptable voice |
| R10 | **Drift in headless runs** (cross imports, hardcoded text, economy in mode 1, invented APIs) | High / medium | Lint and validators | Boundaries by lint, gates, validated content, "do not assume APIs from memory", deviations reported |
| R11 | **Variable audio capture** across browsers (sample rate ignored, echo cancellation with speakers) | Medium / medium | Operator's manual tests in Chrome/Edge/Firefox | Own resample in the worklet, VAD muted while the NPC speaks, push to talk in the classroom |
| R12 | **WebGL context loss** on weak GPUs | Medium / low | Events in telemetry | Switch to `dialog-only` without losing the scene |
| R13 | **Different timbre** between pre-generated lines and live voice | Medium / low-medium | Operator's listening | Same engine and same voice when available; if not, openings and closings also through Live with injected fixed text (more cost) |
| R14 | **Divergence from LT** after porting | High / low | — | Provenance notes in the code; LT stays as a lab and is not synchronized automatically |
| R15 | **Unreliable pronunciation detection** with a Rioplatense accent: false alarms that make Lumi distrusted, or normalization that hides errors | Medium / high (pronunciation is core) | E# type × tool table from F0.1 | Bar per type (D-151), only enabled types, low confidence hidden, perception and self-comparison always, never interrupts (§5.12) |
| R16 | **Painted-diorama characters** (D-207): there are no 14 ready CC0 countryside villagers; retargeting between authors; cost of animating in `low` | Medium / medium | Plan estetica-c M3 and M6 | One repainted base body + head by code + `apariencia` per sheet; a single target skeleton; frozen off-screen and cap per tier (§2.7.1) |
| R17 | **Voice prices that double** (Gemini, 2027-01-01) or retirement of a model | High / medium | Dated price table | Cascade adapter from F5.1 (§5.11), per-adapter ledger, models in configuration |

---

## 11. ADRs (architecture decision records)

Status: **Proposed** = a decision from the architecture review that the operator validates; it holds as a contract for headless runs until the operator changes it. Each ADR lives in `docs/adr/ADR-NNN-<slug>.md` (F1.1b copies ADR-001…026); an ADR backed by a `decided` row of `00-decisiones.md` is copied as **Accepted** (ADR-001/003 by D-086/D-136, ADR-002 by D-087, ADR-022 by D-139, ADR-023 by D-092, ADR-028 by D-207; ADR-022 is superseded by ADR-028); new ADRs proposed by future runs take the next number with the same format.

| ADR | Decision | Discarded alternatives | What is given up | Status |
|---|---|---|---|---|
| ADR-001 | Vite + React + TS; R3F + drei on three.js with render discipline (§2.2-2.3) | Next.js, Babylon, PlayCanvas, Godot/Unity web, 2D as the main render | SSR; some React overhead | Proposed |
| ADR-002 | No physics engine in mode 1: walkability grid + A* + circle-cell collision in the core; Rapier only as an optional chunk for the bicycle (resolves DP-14) | Rapier, cannon-es, BVH against mesh | Bruno Simon-style physics toy in v1 | Proposed |
| ADR-003 | Single Zustand store by slices + pure TS core; 3D and DOM only through the store; boundaries by lint (§3, §4.3) | Redux Toolkit, Jotai, XState as store | Automatic immutability | Proposed |
| ADR-004 | Progress as a fold of evidence events emitted by the server; potions in whole thirds (§3.5.3) | Mutable balances on the account | Initial simplicity; requires a materialized view | Proposed |
| ADR-005 | Port modules from an earlier voice prototype into an own gateway that builds the `setup` on the server; no ephemeral tokens in v1; LT stays as a lab (§5.2-5.3) | Use LT as a service; shared package; direct ephemeral tokens | Lowest possible latency; a single voice codebase | Proposed |
| ADR-006 | One voice session per scene, minimal context, scripted openings and closings outside Live, 5 min cap on the server (§5.4) | Long session with context compression | Long conversational continuity | Proposed |
| ADR-007 | Turns by manual activity from the client + local VAD + `Terminé` button; audio only during speech (resolves DP-06) | Provider's automatic VAD with a long threshold; button only | Simplicity of the provider's VAD | Proposed |
| ADR-008 | Text observer separate from the NPC + deterministic companion policy in the core, run on the server; Lumi's lines by templates (§5.6, §3.5.2) | Have the NPC correct; have an LLM decide interventions; freely generated Lumi | Lumi's spontaneity | Proposed |
| ADR-009 | Content in YAML with GDD keys, zod schemas, compiled to JSON, cross validations as a gate (§6.1) | Hand-written JSON, TS as content, CMS | Ergonomics of a visual editor | Proposed |
| ADR-010 | glTF pipeline with gltf-transform and meshopt, mandatory license registry, instancing and merging at build, layout as data (§6.4) | Draco, assets without registry, level editor | Visual level editing | Proposed |
| ADR-011 | Single toon material with a 2-3 band ramp for the **volumes** that need it; outlines only on interactables; postprocessing becomes a tier effect (amended by ADR-022; amended by ADR-028: 4-band toon with brushstroke for the whole world, no outlines in v1) (§2.8) | Outline by postprocess; PBR materials | Perfect outlines everywhere | Proposed (amended 2026-10-06; amended 2026-10-13 by ADR-028) |
| ADR-012 | Tiers `low/medium/high/dialog-only` with own detection and hot degradation; 30 FPS in conversation (§2.7) | A single quality level; third-party GPU database | Maximum automatic fidelity | Proposed |
| ADR-013 | Monorepo with npm workspaces (`apps/web`, `apps/server`, `packages/core`, `packages/content-schema`, `packages/protocol`) (§4) | Single package; pnpm + turborepo | Simplicity of a single `package.json` | Proposed |
| ADR-014 | A Node process (static + API + WS + jobs) and managed Postgres with hand-written verified SQL migrations; own auth with class login for minors (§7) | Supabase Auth (requires email), Firebase, JSON files (like LT) | Third-party managed auth | Proposed |
| ADR-015 | Layered moderation with audio holdback and cut in voice; synchronous in text (resolves DP-37) | Prompt only; delay all audio until each sentence is moderated | Zero latency on minor accounts | Proposed |
| ADR-016 | Browserless tests: vitest (+ jsdom and R3F test-renderer), tsc, lint, validators and budgets; evaluation with real models manual only (§8) | Playwright/browser E2E (forbidden by the operator) | Automatic detection of visual regressions | Proposed |
| ADR-017 | Audio in binary frames over WS, worklets off the main thread; Opus only if measurement requires it (§5.5.5) | base64 in JSON (LT); Opus from day 1; WebRTC | Minimum possible bandwidth in v1 | Proposed |
| ADR-018 | Models and prices in configuration with adapters per role; startup validation (§5.10) | Model ids in code | — | Proposed |
| ADR-019 | i18n with a minimal own helper (`Intl.PluralRules`) over JSON per locale | i18next/FormatJS | Advanced formatting features | Proposed |
| ADR-020 | Review with a 6-box Leitner and GDD intervals (§3.5.4) | SM-2, FSRS | Fine tuning per item | Proposed |
| ADR-021 | State machines as pure transition tables in the core, without XState (§3.5) | XState | XState's visualizer and tools | Proposed |
| ADR-022 | **HD-2D render inside R3F**: tiles merged per chunk with pixel atlas (`nearest`), simple volumes, characters as billboards, tilted orthographic camera by presets, postprocessing per tier (§2.9) | Pure 2D (Phaser/Pixi); low-poly 3D world (previous default of the architecture review, `07` option B); separate engine | Reusable 3D characters in VR (the character art is redone if VR is reached) | Accepted (D-139, decided); **superseded by ADR-028** (D-207, 2026-10-13) |
| ADR-023 | **Hybrid** voice: `RealtimeVoiceProvider` with Live and cascade adapters that emit the same events, chosen by configuration; observer always with audio; per-adapter ledger (§5.11) | Live only; cascade only; own WebRTC | A single, simpler voice route | Accepted (D-092, decided; the pilot's adapter is decided by D-149) |
| ADR-024 | **Pronunciation** service on the server: `ScriptedAssessor` (Azure PA) + `RealizationRecognizer` (ZIPA ONNX) with L1 confusion table; pure recurrence core and per-type enabling; LLM never the judge; no audio on the server (§5.12) | Multimodal LLM as judge; ELSA/SpeechSuper as sole source; recognition in the browser | Coverage of all error types from day 1 | Proposed (D-150) |
| ADR-025 | **Day-1 seams R10-R15** (semantic input, camera by presets, tiers as contract, audio and voice behind interfaces, UI as view-models, platform behind an adapter), with lint and tests (§3.1) | Add them when each target arrives | Some early indirection | Proposed (D-145) |
| ADR-026 | **Development-only director mode** (§6.5): live state over Vite's HMR channel to `.director/`, CLI + MCP for Claude Code, content hot reload, session journal; v1 with a DOM panel with its own store, `pickTile` through `bridge.ts`, copilot with Claude Agent SDK in a development Node process, content-only changes, validated and committed; double key `DEV && VITE_LG_DIRECTOR` + `check:dev-only` | In-game feature with a runtime flag; visual level editor; copilot inside `apps/server`; calling the model from the browser | A bit of own tooling that is not reused in production | Proposed (D-187 decided; form: planning, review of the architecture review pending) |
| ADR-028 | **Painted-diorama render inside R3F** (D-207, D-208): height-based terrain, rounded props by code and repainted CC0 models, rigged chibi characters, all with a single 4-band toon material with brushstroke and per-vertex color; long-lens `perspective3D` camera and two-person `dialogueFrame`; per-tier postprocessing in a separate chunk (§2.8, §2.9). Supersedes ADR-022 and amends ADR-011. **Amended by D-209 (2026-10-30):** `thirdPerson` camera with continuous zoom as default, open world of about 140 × 100 m, grass, baked trees, sky and minimap; photographic maps as external KTX2 | HD-2D (ADR-022, D-139); proposals A and B of `docs/art-direction/`; generic low-poly 3D without bevel or painting | The pixel readability of HD-2D; hand-painted textures per piece; outlines in v1 | Accepted (D-207, decided); amended 2026-10-30 by D-209 |

**P0 amendments (`docs/reports/P0-2026-10-06.md` §1).** They are "how" and not "what", and change no decision. With the D-196 default they hold as a contract and F1.1b copies them into `docs/adr/` marked "amended (P0)": ADR-003 and ADR-025 (lint with resolved paths and exact zones, §4.3.1), ADR-004 (`EvidenceStore` with a file adapter, D-157), ADR-005 (request input and output transcriptions, manual activity, binary audio, do not log content), ADR-006 (injection through `clientContent` with a test against the fake), ADR-007 (F0.1 probe in manual mode), ADR-008 (multimodal observer), ADR-009 (`retired-ids`, `lint-allowlist`, output outside git, D-159), ADR-010 (two paths: PNG for tiles and sprites (historical; since D-207 there are no tiles or character sprites), glTF for volumes), ADR-012 (`xr` reserved; render at low internal resolution as an option to measure in F0.2), ADR-013 (`@lg/*` names; `test.projects` if `vitest.workspace.ts` is deprecated), ADR-014 (local operator mode, D-158), ADR-015 (holdback in `scene-runtime`; in cascade, moderate before the TTS), ADR-016 ("CI" = `verify`; pure DSP outside the worklet; lint tested with `lintText`), ADR-018 (model validation at startup skipped in tests and without a key), ADR-022 (post in a deferred chunk as implementation; the budget row is decided by D-160), ADR-023 (full P0 §4.3 contract: `turnId` in every event, `npcTextFinal`, `interrupted`, `sessionEnding`, usage as a discriminated union; methods `startTurn`, `endTurn`, `sendAudio`, `injectContext`, `interrupt`, `close`), ADR-024 (ZIPA in `worker_threads`, runtime proven from Node in F0.1, D-163).

---

## 12. Pending decisions (DP)

### 12.1 GDD DPs that are architecture matters: architecture review recommendation

| GDD DP | Recommendation (default for headless runs) | Where |
|---|---|---|
| DP-06 End of turn | Manual activity from the client + local VAD with a 3 s configurable threshold (2.5-4 s or "button only") + `Terminé` button; push to talk as an option and default in classroom mode; audio only during speech | §5.5.2, ADR-007 |
| DP-07 "Slower" technique | Instruction to the model by level + pitch-preserving OLA time-stretch on the client (1.0 / 0.85 / 0.7); native speed parameter if the current version offers it | §5.5.4 |
| DP-14 Physics | Not in mode 1; kinematic controller in the core | §2.4, ADR-002 |
| DP-36 Main voice route | **Decided by the operator (D-092, 2026-10-06): hybrid.** Live now + cascade adapter; F0.1 decides the pilot's (D-149) | §5.11, ADR-023 |
| DP-37 Output moderation in voice | Layers + audio holdback (500 ms minors, 0-200 ms adults) + cut and safe line; cascade for minors if the measured residual risk is not acceptable | §7.7, ADR-015 |

### 12.2 New architecture DPs (the operator decides; default for headless runs)

| ID | Decision | Options | Recommended default | Why | Affects |
|---|---|---|---|---|---|
| DP-A01 | Repo shape | Single package / npm workspaces / pnpm + turborepo | **npm workspaces** with no orchestrator | Types and rules shared between web, server and scripts with the minimum | §4 |
| DP-A02 | Language of the content file keys | GDD Spanish / English with a correspondence table | **GDD keys in Spanish snake_case** | Runs that write content read the GDD; zero field translation | §4.4, §6.1 |
| DP-A03 | Server hosting | Cloud Run São Paulo / Fly.io / Railway / VPS | **Cloud Run in São Paulo**, 1 minimum instance in pilots; the same container serves the static build | WS supported, scales to zero, close to Argentina, same provider as the AI enterprise route | §7.1 |
| DP-A04 | Managed Postgres | Neon / Supabase (only as Postgres) / Cloud SQL | **Managed Postgres in the São Paulo region; Neon by default** (database branches useful for headless runs) | Plain Postgres, without depending on the provider's auth | §7.4 |
| DP-A05 | AI provider surface for minors | Gemini API (AI Studio) / Vertex AI / other provider | **Adults: paid API. Before any pilot with minors: enterprise channel (Vertex AI) or another provider with terms that allow it, after legal review** | R1; tied to DP-35 of the GDD | §5.10, §7 |
| DP-A06 | Audio format on the wire and VAD | Binary PCM / Opus / WebRTC; energy VAD / neural VAD | **Binary PCM + upload only during speech + energy VAD**; Opus and neural VAD only if measurement in a school demands it | Fewer pieces until there is data | §5.5 |
| DP-A07 | Lumi's voice in L1 (Rioplatense) | Same provider's TTS / another TTS with es-AR or es-419 voices / text only | **Listening test of 3 candidates; the operator chooses by ear**; meanwhile, Lumi in text + the best available es-419 voice | Lumi's voice is product identity and cannot be decided without listening | §5.6 |
| DP-A08 | Minors' login | Class code + image and word card / code + numeric PIN | **Class code + card (image + word)**, resettable by the teacher | Low reading load, no email | §7.2 |
| DP-A09 | Adults' login | Magic link / Google OAuth / both | **Magic link by email** | Minimization; no dependency on an identity provider | §7.2 |
| DP-A10 | Raw packs in git | Version the raw ones / ignore them and record URL + hash | **Raw ones outside git (`assets-src/` ignored); only the optimized GLBs are versioned**; the registry keeps URL and sha256 to re-download | Light repo; CC0 does not require keeping the original | §6.4 |
| DP-A11 | Mesh compression | meshopt / Draco / none | **meshopt** with a self-hosted decoder | Small, fast decoder on weak CPUs | §6.4.1 |
| DP-A12 | Who generates the audio of scripted lines | Operator's manual script / CI with key / always live | **Operator's manual script; output versioned in git** | Keys do not enter CI or headless runs | §6.3 |
| DP-A13 | Teacher panel | Separate entry in the same app / separate app / inside the game | **Separate entry (`docente.html`) in `apps/web`**, without three.js | One build, separate bundles | §7.5 |
| DP-A14 | Analytics | Own in Postgres / analytics SaaS | **Own in Postgres**, 13-month retention | Minors; no third-party trackers | §7.6 |
| DP-A15 | Observer with audio | Text only / text + turn audio | **Always text + turn audio** (updated 2026-10-06, D-095): the evidence of ASR normalization is strong and the cost is ~US$0.0002/turn; F0.1 measures which source to use (D-149) | R2 | §5.7 |
| DP-A16 | Tool for placing assets | YAML only / grid overlay in dev / level editor | **YAML + grid overlay and "click to copy coordinates" in development**; no editor | Fewer pieces; the operator corrects by eye | §6.4.6 |
| DP-A17 | State machines | Own tables / XState | **Own transition tables in the core** | Zero dependencies; testable | §3.5, ADR-021 |
| DP-A18 | Audio holdback by age band | Values | **500 ms minors, 150 ms adults**, adjustable after measuring transcript latency | Safety vs latency | §7.7 |
| DP-A19 | Initial real-time voice model | The one LT uses today / other | **The Live model LT uses today**, if still available at bootstrap; if not, the documented successor | Reuses what was measured | §5.10 |
| DP-A20 | Translation of words outside the glossary | None (only "mark") / model translation labeled as automatic | **Only "mark for review" in v1**; no model translations in the interface | Trust: lesson from Terra Alia [References §4.2.2] | §6.2 |
| DP-A21 | "Systematic error" threshold | Count and window | **≥ 3 occurrences in 3 distinct scenes** | Separate slip from pattern; adjustable with data | §5.7 |

### 12.3 On the third-party proposal (record, not an architecture review decision)

- **Adopted as contract:** Vite + React + TS, R3F + drei, Zustand, DOM HUD + Tailwind, declarative 3D, "3D and DOM never directly; state is the single source of truth", folders separated by logic / UI / 3D (§2, §3, §4). The proposal's "low-poly" was replaced by the operator with HD-2D (D-139, §2.9).
- **Adjusted:** Rapier → not in mode 1 (ADR-002). Open world → dioramas per neighborhood [GDD §1.9]. "Logic in hooks/stores" → logic in a pure TS core; stores are thin (ADR-003).
- **Deferred without adopting or discarding:** build grid, tycoon and economic loop → **DP-15 of the GDD**, operator's decision; the architecture leaves room for it (§3.6) and forbids building it in mode 1.

---

## 13. Cited sources and inputs

| Tag | Input |
|---|---|
| [Brief] | (internal document) (operator's decisions as of 2026-10-04) |
| [GDD] | `learning-game/docs/01-gdd.md` v0.3 (2026-10-06; v0.1: 2026-10-05) |
| [Business] | (internal document) (§3 voice unit economics, §6 risks, §7 experiments) |
| [Research] | (internal document) and `20-evidencia.md` (defaults for feedback, pacing, XP, review) |
| [References] | (internal document) (§4.4 stack implications) |
| [LT] | an earlier voice prototype: `server.js`, `server.ts`, `public/index.html` (Live configuration, audio, accounting), `teacher-config/prompts.json`, `teacher-config/rules.md`, `observer-knowledge-base.md`, `package.json` — read on 2026-10-05; no secrets file was read |

Technical claims about third-party APIs (Gemini Live: manual activity, transcriptions, voice speed; terms of use for minors; capabilities of drei, gltf-transform and Cloud Run) are from my knowledge as of the cutoff date and **must be verified against current documentation** at bootstrap (rule 0.5).
