# Proposal A: Painted map

**Project:** learning-game (*Mundo Rush*, mode 1 *Kestrel Valley*) · **Date:** 2026-10-12 · **Author:** build (the development environment), overnight run without an operator
**Status:** proposal to choose from. If the operator picks it, this document becomes the game's art bible and supersedes the HD-2D direction (D-139) and the pixel density (D-154).
**Mockup:** [`proposal-a-painted-map.html`](proposal-a-painted-map.html) (open it with a double click; `#charla` at the end of the URL opens the conversation directly). Comparison with the others: [`index.html`](index.html).

> **In one sentence:** the valley as a hand-painted adventure map, seen isometrically from above, with the richness of *Heroes of Might and Magic IV* and the friendly tone of an illustrated book: winding rivers, wooden bridges, thatched cabins, mills, dense forests and roads that read at a glance.

---

## 1. Concept and mood words

- **What it is:** a painted 2D world (visible brushstrokes, baked light, painted shadows) projected in 2:1 isometric. The ground is one big painting per zone; houses, trees, mill and characters are painted sprites sorted by depth. It reads as a storybook diorama, not as a blocky video game.
- **Mood words:** painted, warm, leafy, storybook, handcrafted, serene, legible.
- **What it takes from each reference:**
  - *Heroes IV* (main reference): the isometric map view, the painted density of the forest, the wide river with sandy banks, the plank bridges, the clear roads that stand out from the grass, the rich palette of greens, the minimap.
  - Mobile games (references 2 to 4): the sun, the saturated color and the "vacation in the countryside" air; that is why the palette is brighter and less ochre than that of *Heroes IV*.
- **What it does not take:** the darkness and epic tone of *Heroes IV*, the heavy interface frames, the combat. The wood and parchment frames stay, but light.

## 2. World: structure and scale

- **Unit:** 1 tile = 1 m. On screen, a tile measures 64 × 32 px at zoom 1 (2:1 isometric); 1 m of height = 34 px.
- **Zones:** each zone of the GDD (Los Campos, the Crossing, the vegetable garden, the canal) is a **painted diorama** of at most 40 × 40 tiles (the mockup is a 40 × 40 zone). A baked 8-tile border of distant forest surrounds each zone: it is the friendly limit (you see it, you do not walk it).
- **Layers per zone:**
  1. **Painted ground** (one or more large textures): grass, roads, banks, base water, furrows, low fences, flowers, bales, the bridge. Everything the player never covers and that never covers the player.
  2. **Sprites sorted by depth** (foot x + z): nearby trees, houses, mill, carts, characters, animals. Each with its painted anchor point.
  3. **Cheap animation on top:** river glints, chimney smoke, mill blades, cloud shadows, Lumi.
- **Detail density:** the forest is dense at the edges and open in the center; roads always have 2.4 m without trees on each side so they read from afar. Interactive objects carry a golden ring painted on the ground, not an outline.
- **Scale of a walk:** at zoom 1 about 20 × 22 tiles are visible. Crossing a zone on foot takes about 15 s, in line with "a small village you cover in minutes" (GDD §5.2).

## 3. Characters

- **Proportions:** storybook, about 3 heads tall. Big round head, oval body, ball hands, tiny feet. On-screen height: **about 56 px at zoom 1** (almost 2 tiles), about 100 px in the conversation framing.
- **Style:** painted like the rest (fill with a light gradient from the top left, soft dark edge of 1.2 px at 55 %, rosy cheeks). No hard black outline.
- **Directions:** 8 directions (or 5 painted + 3 mirrored: S, SE, E, NE, N and mirrors of SE, E, NE). With 4 directions isometric looks robotic when walking diagonally, which is the most common case.
- **Minimum animation set per character:** idle (breathing, 4 frames), walk (8 frames), talk (hand gesture, 4 frames), wave (6 frames), nod and shake head (4 frames), "think" (hand on chin, loop of 2). Optional per role: carry a bale, water, hammer.
- **NPC readability:** each NPC has its **own silhouette** (Tomás's straw hat, apron, beret, cap) and a clothing color that does not repeat another neighbor in the same zone. The NPC with a request carries a **parchment bubble with three golden dots** above and a golden ring that pulses on the ground. The player wears a blue beret and a yellow scarf, which nobody else uses.
- **Portraits:** each NPC has a **painted bust portrait** (240 × 240) for the dialogue panel. It is the most expressive piece: it takes 3 or 4 gesture variants (happy, thinking, surprised, calm).

## 4. Camera

- **Type:** fixed orthographic, 2:1 isometric. In R3F it is equivalent to an `OrthographicCamera` with **yaw 45° and elevation 30°** (the elevation that gives the exact 2:1). No rotation: the art is painted for a single angle.
- **Zoom:** 3 steps, **0.75 / 1 / 1.35**, with the wheel or `+` `-` (`+` and `-` are bound by `KeyboardEvent.key`, project lesson F2). The middle step shows about 20 tiles of width at 1280 px.
- **Follow:** centered on the player with exponential smoothing (rate 5 per second: `1 - e^(-5·dt)`). With "reduce motion", a cut instead of a pan (the current `cutFollow` function works as is).
- **Conversation:** the camera zooms in to **zoom 1.8** and centers on the midpoint between the player and the NPC, shifted 1.1 m down the screen so both end up in the top third, above the panel. The player looks at the NPC (seen from behind or in profile), the NPC looks at the camera. The big face lives in the panel's **portrait**, not on the map.
- **Minimap:** top right, the same painting scaled down, with the player (white), NPCs with a request (gold) and the view rectangle. It is *Heroes IV* identity and also helps with orientation.

## 5. Light

The light is **painted**, not computed: it is what gives the look and what makes it cheap.

- **Reference time of day:** golden mid-morning. The light comes from the **top left** of the screen and shadows are painted toward the **bottom right**, elongated to about 1.4 times the width of the object.
- **Shadows:** ellipses painted with multiply (`rgba(25,40,15,0.28)`) for trees, and contact shadow under houses. Characters: ellipse `rgba(25,40,15,0.32)` of 24 × 10 px shifted 4 px to the right.
- **Living ambience (code):** passing cloud shadows (ellipses of 440 × 180 px at `rgba(20,35,30,0.10)`, speed 0.5 tiles/s), water glints that run with the river (70 strokes at once), chimney smoke, blades at 0.9 rad/s.
- **Vignette:** warm, `radial-gradient(transparent 55 %, rgba(60,40,15,0.38))`. No fog: the dark distant forest acts as the edge.
- **Sunset and night (for the GDD):** solved with **palette variants** over the same painting (a multiplied color layer: amber `#F2B28C` at 25 % for sunset, blue `#2B3550` at 55 % for night) plus lit windows and firefly trails as additive sprites. There is no need to repaint everything.
- **Postprocessing:** none required. On the high tier, a soft bloom only over Lumi and the windows.

## 6. Palette

| Token | Hex | Use |
|---|---|---|
| `pasto-claro` | `#8DB046` | Grass in the sun, forest clearings |
| `pasto` | `#5E8C31` | Base grass |
| `pasto-sombra` | `#3E6B2A` | Grass under trees, thickets |
| `camino` | `#C9A46A` | Dirt roads |
| `camino-borde` | `#9C7A45` | Road edge and tracks |
| `roca` | `#A39A8A` | Stones |
| `copa-luz` | `#9CC452` | Lit side of the canopies |
| `copa` | `#4F8A2E` | Base canopy |
| `copa-sombra` | `#2C5524` | Interior and shaded side |
| `pino` / `pino-luz` | `#2F5A3A` / `#4E7F4A` | Conifers |
| `tronco` | `#6A4428` | Trunks |
| `agua-honda` | `#2F6E8E` | River center |
| `agua` | `#4C9DB8` | Base water |
| `agua-brillo` | `#BFE6EE` | Reflections and foam |
| `orilla` | `#D8C48E` | Sand of the banks |
| `bosque-lejano` | `#2A4A26` | Baked edge of the zone |
| `muro` | `#E9DDBF` | Whitewashed walls |
| `paja` | `#C89B4E` | Thatched roofs, bales |
| `teja-roja` | `#B5523B` | Tile roofs, ribbons |
| `madera` | `#7A5232` | Beams, fences, bridge |
| `trigo` | `#D9B65A` | Ripe crops |
| `pergamino` | `#F3E6C4` | HUD background |
| `tinta` | `#3A2A1A` | HUD text |
| `tinta-suave` | `#6B5338` | Secondary text |
| `marco-madera` / `madera-osc` | `#6B4426` / `#4A2E18` | Frames and buttons |
| `oro` | `#D9A441` | Accents, meter gems, primary button |
| `luz-bicho` | `#FFD27A` | Lumi and firefly trails |
| Potion branches | `#F2A93B` `#5FBF6A` `#4A86D9` `#9B6BD3` `#EE6F5B` `#5FC8D9` | The ones from GDD §5.4 are kept |

**Contrast (WCAG, measured):** `tinta` on `pergamino` 11.09:1 (AAA); `tinta-suave` on `pergamino` 5.80:1 (AA); cream text `#FCEFD0` on a `madera` button 7.42:1 (AAA); `madera-osc` on `oro` (primary button) 5.51:1 (AA). `oro` on `pergamino` gives 1.81:1: that is why the filled gems are **never** the only signal (they carry glow, border and the bold label) and gold is not used for text.
**Color blindness:** the map depends on greens; roads, water and crops are separated by **value** (light/dark) as well as hue, and interactives carry a ring and a bubble (shape), not just color.

## 7. Render technique

- **Ground:** painted texture per zone. In production: **1024 × 1024 px chunks** (or 2048 on the high tier) at a density of **about 32 px per meter** of projected ground (equivalent to the mockup's painting at zoom 1). They are drawn as planes with `MeshBasicMaterial` (unlit) under an orthographic camera.
- **Sprites:** PNG with alpha, painted at double size and shown at half (soft edges without aliasing). **Linear filtering with mipmaps** (not `nearest`: this is no longer pixel art). One atlas per zone of ≤ 2048 px for trees, props and houses; one atlas per character with its 8 directions.
- **Draw order:** by foot depth (x + z), with `renderOrder` or, in R3F, with `depthWrite` off and explicit order per group. Vertical planes with `alphaTest 0.5` for the silhouette and `transparent` only on soft edges and smoke.
- **Water:** the base painting plus a cheap shader that shifts the UV of a glint texture over the river mask, or animated glint sprites as in the mockup.
- **Outlines:** none as an effect; the soft edge is painted into the sprite.
- **Resolution scale:** the canvas uses `devicePixelRatio` with a cap per tier (1 / 1.25 / 2). The art holds up well when scaled down because it is painted.
- **How the art is made (recommended):** **pre-render from 3D**, as *Heroes IV* did: 3D models (CC0 or our own) rendered in Blender with a painted material (color ramp + brush texture + soft edge), from the exact camera angle, and touched up by hand. That is how the 8 directions of the characters come out without drawing them one by one.

## 8. UI and HUD

- **Visual language:** parchment and wood, light. Panel with a `pergamino` background, a 3 px `marco-madera` border, a wooden bottom shadow. Titles in classic serif (`Palatino Linotype`, `Book Antiqua`, Georgia); reading text in humanist sans (`Segoe UI`, Trebuchet) for legibility and to respect the GDD's dyslexia font option.
- **Conversation meter ("Get to know Tomás"):** a ribbon with **five gems** joined by a wooden rod; each gem is a criterion (Greet, Your name, Their field, Ask, Say goodbye). The current gem pulses gold; the achieved ones fill with gold with a glow. Top left, below the objective. No XP numbers (GDD §5.6); only "2 of 5".
- **Dialogue:** parchment panel at the bottom, with the NPC's **painted portrait** in a golden circular frame on the left, a wooden plate with the name, the NPC's line in large serif (22 px) with the new word underlined with dots (hover or tap = translation), the gloss below, the voice indicator (shape and color: gray dot "Tomás talks", green dot that pulses "Your turn") and the scaffolding bar as wooden tokens: `Repetir` · `Más despacio` · `Pista` · `Escribir` · `Terminé` (gold, on the right).
- **Objective:** parchment top left, one line.
- **Interaction prompt:** parchment label at the bottom center: `E` Talk to Tomás.
- **Minimap:** top right (hidden in the chat and on small screens).
- **On narrow screens (≤ 720 px):** the portrait shrinks to 64 px and moves up; minimap, controls help and quality chip disappear. Verified at 390 px width.

## 9. Controls

- **PC (main):** **click on the ground to walk** (the natural way of an isometric map) and also WASD/arrows on screen axes (W = up the screen). `E` or click on the NPC to talk, `Espacio`/`Enter` = Done, `Esc` = leave the chat, wheel or `+` `-` = zoom, `Shift` = jog.
- **Gamepad:** left stick moves on screen axes; `A` talk and Done; `B` leave; `Y` repeat; `X` hint; triggers zoom; d-pad navigates the HUD buttons.
- **Mobile (later):** tap the ground to walk, tap the NPC to talk, pinch to zoom. It needs no joystick: it is the most comfortable proposal for touch.

## 10. Performance on modest PCs

| Tier | Ground | Max pixel ratio | Extras | Expected cost |
|---|---|---|---|---|
| `bajo` | texture at 0.6× | 1 | no cloud shadows, no water glints | ~10 draw calls, < 120 MB of VRAM per zone |
| `medio` | 1× | 1.25 | cloud shadows, glints, smoke | ~15 draw calls |
| `alto` | 1.4× | 2 | + particles (pollen, leaves), bloom on emissives | ~20 draw calls |

- **The good:** it is the lightest proposal on GPU. There are no computed lights or shadows; each frame is composing textured planes. It runs on old integrated chips.
- **What weighs:** **memory and download**. A zone painted at 1× takes about 3000 × 2000 px of ground (~24 MB in uncompressed VRAM) plus sprite atlases. It must be compressed with **KTX2/Basis** (in three.js, `KTX2Loader`) to cut VRAM and download by 4 to 6 times. Proposed budget: **< 12 MB of download per zone** and < 15 MB for startup (GDD §5.7).
- **Measurement in the mockup:** the mockup's 2D canvas paints the ground once (~0.5 s on load) and then only composes; in the browserless check there were no errors on any tier.

## 11. Assets: where they come from, license and cost

Code AIs do not draw (operator directive, GDD §5.7), and generative image AI is out unless explicitly decided (D-153). With those rules, A is the proposal that is **hardest to source**:

| Piece | Proposed source | License | Cost | Notes |
|---|---|---|---|---|
| Base models for pre-render (houses, trees, mill, props, characters) | Quaternius, KayKit (Kay Lousberg), Kenney | CC0 | 0 USD | Used as a "maquette" to render; the final result is our own art |
| Painted render and 8 directions | **Blender** (free, GPL; the art that comes out is yours) with a Python script in `blender -b` mode | own | 0 USD | Automatable by agents: one script per asset |
| Touch-up and ground painting | **Krita** (free) or procedural painting by code as in the mockup, plus human touch-up | own | 0 USD + hours | The mockup's ground is 100 % code: it serves as a base |
| Bust portraits (14 NPCs × 4 gestures) | 2D illustrator on commission | rights assignment by contract | **rough estimate USD 1,500 to 4,000** | It is what makes the game most expensive; hard to get from pre-render |
| Full kit of a region on commission (if pre-render is not done) | Environment illustrator | contract | **rough estimate USD 3,000 to 10,000** | Not quoted; order of magnitude |
| Painted store packs | CraftPix.net, GameDev Market, itch.io | each store's commercial license (verify) | USD 10 to 60 per pack | **[verify]** that there is painted isometric consistent with 13 or 14 villagers in 8 directions; I did not find one that covers everything |

**What is necessarily our own:** the painting of each zone (it is unique), the portraits, Lumi (emissive by code), the animated water and the interface.

## 12. How it fits in the R3F stack and what is reused

- **Stays the same:** Vite + React + TS + R3F, the pure core (`packages/core`: grid, movement, interactables, scene machine), the Zustand store and its selectors, all the DOM HUD (`ui/hud/WorldHud.tsx`, `ui/dialogue/DialogueHud.tsx`), the R10 to R15 seams and the layer lint.
- **Reused with small changes:**
  - `world/camera/` (`rig.ts`, `presets.ts`, `CameraRig.tsx`): the `isoOrtho` preset already exists; it is fixed at 30° elevation (2:1) and `zoomPixelScales`/`snapToPixelGrid` are deleted (they were for pixel art). `followAlpha` and `cutFollow` are used as they are. `dialogueFrame` becomes "zoom in and center".
  - `world/sprites/` (`Billboard.tsx`, `orientation.ts`, `sheet.ts`): frame selection by direction goes from 4 to 8 directions; the billboard stops turning (in fixed isometric the sprites are fixed planes facing the camera).
  - `world/tiles/` (`buildTileChunk.ts`, `atlas.ts`): the ground stops being tiles and becomes painted texture chunks; the core's logical walking grid does not change.
  - `world/dioramas/Diorama.tsx`: the layout as data continues; the layer types change (painted ground, sprites, animations).
- **Discarded:** `world/art/pixels.ts` (pixel placeholders), `world/props/Boxes.tsx` (boxes), the toon material of volumes, D-154 (32 px per tile) and almost all of `world/post/` (optional bloom remains).
- **For other targets (`07-stack-objetivo.md`):** mobile is the best case. VR is the worst: a painted map has no volume; in `xrTabletop` it would look like a sheet on the table (nice as a board, but without real 3D).

## 13. Risks

1. **Art sourcing (high):** every new zone is new painting. Without a pre-render pipeline that works, the game stays tied to an illustrator. *Mitigation:* a 3-day spike with Blender in batch mode rendering 1 house, 1 tree and 1 character in 8 directions before committing.
2. **Style coherence (high):** mixing pre-render, hand painting and store packs shows much more in a painted style than in low-poly. *Mitigation:* a single render pipeline with the same ramp, the same brush and the same light direction for everything.
3. **Single angle (medium):** the art is painted for one camera only. There is no rotation, no dramatic close-ups, and mode 2's build mode has to live in this same isometric.
4. **Expensive animation (medium):** 8 directions × 6 animations × 14 NPCs are about 670 sequences. With pre-render it is automatic; by hand it is unfeasible.
5. **Memory on 4 GB machines (medium):** large textures. *Mitigation:* KTX2 mandatory and 40 × 40 zones as the cap.
6. **Distance from the current decision (low):** supersedes D-139 (HD-2D) and D-154. The operator already rejected the current look, so the cost is only documents.

## 14. Estimated effort

Estimates in agent-days (build runs plus verification), not counting commissioned art.

| Stretch | Days | What it includes |
|---|---|---|
| Pipeline spike (Blender batch, 3 assets, 8 directions) | 3 | Decides whether A is viable without an illustrator |
| Map rendering in R3F (2:1 camera, painted chunks, sprites by depth, water) | 5 | Replaces tiles and billboards |
| Asset pipeline (render scripts, atlas, KTX2, license registry) | 6 | What allows producing zones |
| First full zone (Los Campos) with 3 NPCs | 8 to 12 | Includes painting and touch-up |
| HUD restyle (parchment, gems, portrait) | 2 | New tokens over the existing components |
| **Total up to a playable zone** | **~24 to 28** | Plus commissioned art (portraits) in parallel |

**Proposal verdict:** the prettiest and the lightest to run, the most expensive to produce. It wins if the operator wants a game with an illustrated-book identity and accepts paying for art or investing in a pre-render pipeline.
