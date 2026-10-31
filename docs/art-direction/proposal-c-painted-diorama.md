# Proposal C: Painted diorama

**Project:** learning-game (*Mundo Rush*, mode 1 *Kestrel Valley*) · **Date:** 2026-10-12 · **Author:** build (the development environment), overnight run without an operator
**Status:** proposal to choose from (**the recommended one**). If the operator picks it, this document becomes the game's art bible and supersedes the HD-2D direction (D-139) and the pixel density (D-154). The top-down camera by presets (D-053) is kept with a different lens.
**Amendment D-209 (2026-10-30, open-world-3d plan):** by the operator's direction of 2026-10-27, the map camera becomes third person and the world becomes open. This document is not rewritten: the affected sections (§1, §2, §4, §5, §9) carry a dated note "Amendment D-209", and the rest of the bible (round shapes, vertex color, toon, palette) remains in force.
**Mockup:** [`proposal-c-painted-diorama.html`](proposal-c-painted-diorama.html) (open it with a double click; `#charla` at the end of the URL opens the conversation directly). Comparison with the others: [`index.html`](index.html).

> **In one sentence:** the valley as a hand-painted toy diorama: 3D of round shapes (not a single cube in sight), shaded in soft bands with brushwork, seen from above at a diagonal with a long lens that makes it look like a diorama, the map legibility of *Heroes IV* and the sunny color of mobile games.

---

## 1. Concept and mood words

- **What it is:** real low-poly 3D, but **rounded** (canopies made of spheres, houses with beveled edges, thatched roofs with a soft ridge, capsule characters), painted with **vertex color** (light gradient and brush tremor) and a **4-band toon material** with a brushstroke texture on top. The camera is a **long-lens perspective (FOV 30°)** tilted 50° and turned 45°: it looks almost like an isometric, but with depth and a bit of perspective that makes it a "diorama".
- **Mood words:** diorama, toy, painted, round, sunny, tidy, friendly.
- **What it takes from each reference:**
  - *Heroes IV* (1): the diagonal view from above that lets you read roads, river, bridges and houses at a glance; the forest density at the edges; the "adventure map" feeling.
  - Mobile games (2 to 4): the saturated, luminous color, the green of the hills, the sun, the stylized animated 3D characters, the cart with bales.
  - *Townscaper* and *A Short Hike* (already in GDD §5.2): toy, saturated pastel, warmth, small village.
- **What it does not take:** pixel art (rejected), cubes (rejected: "everything square"), the camera you have to handle and the epic darkness. *Amendment D-209 (2026-10-30): the camera becomes third person, which the player turns by dragging or with Q and R; it is still true that nothing requires video game skill: recentering is automatic and clicking on the ground still walks.*

## 2. World: structure and scale

- **Unit:** 1 unit = 1 m. Characters of about 2.6 m (toy scale: bigger than real life relative to the houses, to read from above), house of 5.2 × 4.2 m with 2.4 m walls, leafy tree of 4 to 5 m.
- **Zones:** each zone of the GDD is a **diorama of about 80 × 80 m walkable** on a 96 × 96 m terrain. The edge is soft hills up to about 5.5 m that rise from 22 m from the center with pines, plus the warm fog; there is never a visible "end of the world" from the game camera.
- **Grid:** the core stays on 1 m cells (collision, "current cell", interactables), but the terrain is a **continuous height mesh**: roads and river are drawn by curves (catmull-rom) and the terrain flattens under the roads and sinks under the water.
- **Detail density:** every 6 to 10 m there is something to look at (well, mailbox, road stones, flower clumps, cart with bales, fence). Roads have 2.6 m free on each side. Interactive objects get a soft glow in the branch color (GDD §5.3), never a flickering outline.
- *Amendment D-209 (2026-10-30): the open world measures about 140 × 100 m walkable, with relief of 2 to 6 m and flat plateaus where the NPCs are, plus 160 m of skirt and an apron in the fog color.*
- **Scale of a walk:** at 4 m/s (6.2 jogging) the zone is crossed in about 20 s; at medium zoom about 28 m of width are visible.

## 3. Characters

- **Proportions:** **chibi of 2.5 to 3 heads**: big round head (radius 0.42 m), capsule torso, short capsule legs and arms, ball hands. They read from the high camera without losing the face in the conversation shot.
- **Face:** big oval eyes with a white highlight, rosy cheeks, no drawn mouth at rest (the mouth appears when talking as a simple shape). Hair as a cap that covers the nape. **The hat does not cast a shadow on the face** (legibility before realism).
- **Animation:** simple humanoid skeleton (compatible with the CC0 packs from KayKit and Quaternius). Minimum set: idle with breathing and head sway, walk with bounce, jog, talk (gestures), wave, nod, shake head, think, be surprised, sit, carry, hand something over. The bounce when walking is part of the "toy" charm.
- **NPC readability:** silhouette by hat or hairstyle (Tomás's straw hat, the player's cap, scarf, bun) and a shirt color of their own per zone taken from `casa-1..6`. The NPC with a request carries an **amber bubble with three white dots** that floats and always faces the camera. The NPC turns head and body toward the player when they come within 6 m (the mockup already does this).
- **Lumi:** emissive firefly with an additive halo that accompanies the player at their side (never in front of the face), the brightest object in the scene.

## 4. Camera

- **Type:** perspective with a **long lens**: **vertical FOV 30°** (40.5° on portrait screens), **tilt 50°, turn 45°**. It is today's `topdownOrtho` preset converted into perspective: it keeps "from above, follows on its own, no orbit" (D-053) and gains the depth of a diorama.
- **Zoom:** 3 distance steps **22 / 30 / 40 m** (wheel or `+` `-`, bound by `KeyboardEvent.key`, lesson F2). The middle one shows about 28 m of width in 16:9.
- **Follow:** the target is the player at 0.8 m height, with exponential smoothing at rate 5/s. No free orbit. With "reduce motion", `cutFollow` (already exists).
- **Conversation (two-person shot, 3/4):** the player settles on their own at **2.6 m from the NPC**; the camera drops to **20° tilt, 12.5 m distance**, and turns until it is **perpendicular to the player-NPC line, shifted about 27° toward the NPC's face**. It picks the side with **fewer obstacles** (an occlusion test against trees, house and garden) and lowers the look-at 0.9 m so both end up in the top third, above the panel. Result: NPC facing forward in 3/4, player from behind in 3/4, with nothing covering them. Smooth transition at rate 3/s; cut with "reduce motion".
- *Amendment D-209 (2026-10-30): the map camera is `thirdPerson`, behind the character. Tilt from 6 to 55° (17° on entry), look by dragging or with Q and R, recentering after 1.5 s without looking and continuous zoom from 2.5 m to the whole map (wheel, `+`/`-`, V for the whole map). The long lens above remains as the panorama (`perspective3D`). The two-person chat shot does not change.*
- **Separate portrait:** not needed; the NPC's face reads in the chat shot. For the "dialogue only" mode (D-030) a portrait of the same 3D model is rendered.

## 5. Light

- **Reference time:** warm mid-morning (the one of the Kestrel Valley dawn, already advanced).
- **Sun:** `DirectionalLight` color `#FFF1D6`, **intensity 2.3**, elevation **48°**, azimuth **-30°**. **Soft PCF** shadows, map of **1024 px (medium) / 2048 (high)**, radius 3, in a 44 × 44 m box that follows the camera target; `bias -0.0004`, `normalBias 0.03`.
- **Sky:** `HemisphereLight` sky `#D6ECF2`, ground `#6E8B4A`, intensity 1.15. With the camera at 50° the sky is barely seen; the background is the haze. *Amendment D-209 (2026-10-30): in third person the sky is visible. It is a dome centered on the camera with zenith, horizon and haze, with the horizon exactly the fog color, and flat clouds from medium. The hemisphere light does not change.*
- **Toon bands:** 4-step ramp in luminance **150 / 195 / 232 / 255** (light shadow, never black). That way the shadows are colored, not gray.
- **Fog:** linear color `#F3E7CF` (warm haze), from **34 to 78 m**. It wraps the edges and gives a diorama air.
- **Tone:** ACES Filmic, exposure **1.05**, sRGB output. The water uses its own shader with fog and tone included.
- **Postprocessing per tier:** low, nothing; medium, bloom only on emissives (Lumi, windows) with threshold 0.85 at half resolution; high, bloom + **tilt-shift** (blur at top and bottom, 22 % of the screen, which tops off the diorama effect) + soft vignette. *Amendment D-209 (2026-10-30): the tilt-shift runs only in the panorama and in the chat, never behind the character (it would cover the sky and the feet).* The mockup imitates the tilt-shift with a CSS `backdrop-filter` on the high tier; in the game `TiltShift2` from `@react-three/postprocessing` is used, which is already in `world/post/Post.tsx`.
- **Sunset and night (GDD):** presets by hour (D-051): sunset with sun `#FFB27A` at 15°, haze `#F2C8A0`; night with blue hemisphere `#2B3550`, emissive windows and firefly trails. The **Crossing's saturation** by progress (GDD §5.4) is a vertex-color parameter (the zone desaturates by up to 30 % and comes back on founding).

## 6. Palette

Starts from the palette in GDD §5.4 (`agua`, `cielo-dia`, `casa-1..6`, `luz-bicho` and the branches are respected) and takes it to a sunnier register.

| Token | Hex | Use |
|---|---|---|
| `pasto` | `#93C25B` | Base grass |
| `pasto-luz` | `#B9D86E` | Patches in the sun, hills |
| `pasto-sombra` | `#5E9450` | Dark variation |
| `camino` | `#E3C58E` | Roads |
| `tierra-borde` | `#B98F5A` | Road edge |
| `orilla` | `#D9C38C` | River sand |
| `copa-luz` / `copa` / `copa-sombra` | `#A9D35F` / `#6FAE4A` / `#3F7A45` | Leafy trees (vertex gradient) |
| `pino` | `#3C7354` | Conifers |
| `tronco` | `#8A5A3B` | Trunks |
| `agua` / `agua-honda` / `brillo` | `#5FB8C9` / `#3A8FA8` / `#E6F7F4` | River (the GDD's `agua`, slightly more vivid) |
| `cielo` | `#BFE3EC` | Daytime sky (GDD `cielo-dia`) |
| `bruma` | `#F3E7CF` | Fog and background |
| `muro` | `#F4EDE2` | Light walls (GDD `casa-6`) |
| `casa-1..5` | `#E9806E` `#F2CF6B` `#9ED8B8` `#9CC7E8` `#B9A6DB` | Facades and clothing (GDD) |
| `techo` | `#C9624B` | Roofs (with ridge `#A84E3B`) |
| `madera` | `#9A6B43` | Fences, bridge, cart |
| `maíz` / `hoja-maíz` | `#D9B65A` / `#8DBE57` | Vegetable garden |
| `ventana` | `#FFD58A` | Windows (emissive at night) |
| `papel` | `#FBF6EC` | HUD background (GDD) |
| `tinta` / `tinta-suave` | `#2A2A33` / `#5B5664` | HUD text |
| `ámbar` / `ámbar-osc` | `#F2A93B` / `#B86E12` | Meter, name chip, borders |
| `luz-bicho` | `#FFD27A` | Lumi and the network's trails |
| Potion branches | `#F2A93B` `#5FBF6A` `#4A86D9` `#9B6BD3` `#EE6F5B` `#5FC8D9` | Unchanged (GDD §2.19) |

**Contrast (WCAG, measured):** `tinta` on `papel` 13.20:1 (AAA, meets the GDD's AAA target for dialogue); `tinta-suave` on `papel` 6.59:1 (AA); `#2A1A05` on `ámbar` (name chip) 8.42:1 (AAA); primary button `papel` on `tinta` 13.20:1. Filled `ámbar` on `papel` gives 1.85:1 and the `ámbar-osc` border 3.69:1: that is why every achieved segment carries a **dark border, a bold label and the current segment with hatching** (shape), not just color.
**Color blindness:** grass, road and water are separated by value and by texture (brush on the grass, smooth with glints on the water); interactives carry a bubble (shape) in addition to the branch glow.

## 7. Render technique

- **Single material for the world:** `MeshToonMaterial` with `vertexColors`, a 4 px `gradientMap` (the 4 bands, `nearest` filter) and `map` = **256 px grayscale brushstroke texture** (elliptical blotches from 205 to 255) repeated 10 times over the terrain. The whole world shares 1 or 2 materials, which helps the draw-call budget.
- **"Painted" vertex color:** each geometry gets a vertical gradient (lighter on top, up to 15 to 35 % darker at the bottom) and a brush tremor of ±0.07 in luminance by position. That way the CC0 assets from different authors are **unified**: their texture or atlas is discarded and they are repainted with the zone's palette by code (at build, in `scripts/assets/optimize.ts`).
- **Round shapes:** houses with a beveled box (radius 0.28 m), roofs by extrusion with bevel and capsule ridge, canopies of 4 to 6 fused spheres, flattened stones. **Bible rule: no visible volume with 90° edges without a bevel.**
- **Terrain:** a 96 × 96 m height mesh with 150 × 150 segments and vertex color (grass, sun, roads with noisy edge, banks). Water: plane with a custom shader of bands and running glints.
- **Instances:** trees, pines, bushes, flowers, crops and stones as `InstancedMesh` (one call per type).
- **Outlines:** none in v1 (they cost an extra pass). If the operator wants them, an inverted-normals outline only on characters is cheap.
- **Resolution:** `devicePixelRatio` with a cap of 0.75 / 1.25 / 2 per tier. The toon look holds up very well at low resolution.

## 8. UI and HUD

- **Visual language:** the GDD §5.6 "paper and ink", already existing, with cards with a 14 px rounded border, `#E6DCC8` border and warm shadow. Rounded sans typography (`ui-rounded`, `Segoe UI Rounded`, `Nunito`, `Segoe UI`), large and legible.
- **Top left:** objective in one line with an amber dot, and below the **"Get to know Tomás" meter**: card with the title, "2 of 5" and **five segments** with their label (Greet, Your name, Their field, Ask, Say goodbye). Achieved: amber with dark border and bold label. Current: amber hatching. No XP numbers.
- **Interaction prompt:** card at the bottom center, `E` Talk to Tomás.
- **Dialogue:** paper card at the bottom center (up to 760 px wide): amber chip with the name, the NPC's line at 22 px with the new word underlined with dots (hover or tap = translation and "Mark"), the gloss, the voice indicator (gray dot "Tomás talks", green dot that pulses "Your turn · you can say: ...") and the scaffolding bar: `Repetir` · `Más despacio` · `Pista` · `Escribir` · `Terminé` (dark button with `Espacio`, on the right). It is the same structure as `ui/dialogue/DialogueHud.tsx`, with new tokens.
- **Bottom left:** controls help (disappears in the chat). **Bottom right:** quality and fps (only for the test).
- **Narrow screens:** the meter moves down, the help, the quality chip and the proposal label are hidden. Verified at 390 px.

## 9. Controls

- **PC (main):** **click on the ground to walk** or WASD/arrows relative to the screen (W = up the screen, which with the fixed camera is always the same world direction). `E` or click on the NPC to talk, `Espacio`/`Enter` Done, `Esc` leave, wheel or `+` `-` zoom, `Shift` jog. *Amendment D-209 (2026-10-30): WASD and the arrows are relative to the camera (W = forward in the view); dragging with the mouse or holding Q and R turns the view; the wheel, `+`/`-` and the HUD buttons do continuous zoom; V toggles the whole map; `Shift` runs; bottom right, a minimap with the NPCs still pending.*
- **Gamepad:** left stick move (screen axes), `A` talk and Done, `B` leave, `Y` repeat, `X` hint, triggers zoom, d-pad for the HUD.
- **Mobile (later):** tap to walk and tap the NPC (as A); optional virtual joystick for whoever prefers it (as B). Pinch to zoom.

## 10. Performance on modest PCs

| Tier | Max pixel ratio | Shadows | Post | Expected cost |
|---|---|---|---|---|
| `bajo` | 0.75 | none (blob shadow always) | none | ~40 to 60 draw calls, ~60k visible triangles |
| `medio` | 1.25 | soft PCF 1024 | bloom on emissives (half resolution) | ~60 to 90 draw calls |
| `alto` | 2 | soft PCF 2048 | bloom + tilt-shift + vignette | ~90 to 110 draw calls |

- **Why it is light:** the high camera limits what is seen (there is no horizon), the toon material is cheaper than PBR, everything shares 1 or 2 materials and vegetation is instanced. It fits the GDD §5.7 budget (< 50k visible triangles and < 150 draw calls on medium) with margin, and asks for no large textures: the world's only texture is the 256 px brushstroke.
- **Download:** the models are light (vertex color, no textures); a zone should come in under 4 to 6 MB compressed with Draco or Meshopt, the best of the three proposals.
- **Measurement in the mockup:** clean browserless check on all three tiers; the mockup loads 300+ instances, shadows and the water shader without external textures.

## 11. Assets: where they come from, license and cost

| Piece | Proposed source | License | Cost | Notes |
|---|---|---|---|---|
| Chibi characters with skeleton | **KayKit** (Kay Lousberg: rounded big-headed characters) | CC0 | 0 USD (optional paid extras exist) | **[verify]** which character pack brings country clothes; they are recolored to the palette |
| Animations | KayKit (animations of their characters), **Quaternius Universal Animation Library**, Mixamo | CC0 / Mixamo license | 0 USD | Retargeting to the chosen skeleton |
| Rounded nature | **Quaternius Stylized Nature MegaKit**, Kenney Nature Kit | CC0 | 0 USD | The shapes are used; the color is repainted per vertex |
| Houses, fences, well, cart | Quaternius Medieval Village MegaKit, Kenney (Survival Kit, Fantasy Town Kit), KayKit | CC0 | 0 USD | Whatever has hard edges is beveled or redone by code |
| Animals (horse, cow, chicken, goat Clover) | Quaternius (animal packs) | CC0 | 0 USD | **[verify]** exact content |
| Simple props by code | beveled primitives (the whole mockup is made this way) | own | 0 USD | Well, mailbox, bales, stones, bridge, fences |
| Brushstroke, toon ramp, water, Lumi | own code (included in the mockup) | own | 0 USD | |

**Expected total cost:** 0 USD with CC0. **What is necessarily our own:** the repainting to the palette (script), the variation of clothes and accessories of the cast, the layout of each zone, the water, Lumi and the bevels. All goes into `content/assets-registry.yaml` as GDD §5.7 asks.

## 12. How it fits in the R3F stack and what is reused

It is the proposal that **keeps the most current code**.

- **Stays the same:** Vite + React + TS + R3F + drei, the pure core (grid, movement, click to walk, interactables, scene machine), the store, the DOM HUD (tokens change, not components), the R10 to R15 seams and the layer lint.
- **Reused with small changes:**
  - `world/camera/rig.ts`: `cameraOffset(pitch, yaw, distance)` is exactly the mockup's formula; `followAlpha` and `cutFollow` are used as they are. The long-lens perspective preset is added (the `perspective3D` already declared in `presets.ts`) and `zoomPixelScales`/`snapToPixelGrid` are removed (they were for pixel art). `dialogueFrame` already exists: it gains the occlusion test and the 3/4 turn.
  - `world/post/Post.tsx`: `Bloom`, `TiltShift2` and `Vignette` per tier stay as they are (the mockup's high tier imitates them).
  - `world/lighting/Lighting.tsx`: hemisphere + directional as today, with the values in §5 and shadows.
  - `world/dioramas/Diorama.tsx`: layout as data; road and river curves and heights are added.
  - `world/actors/`: `Player.tsx` and the future `Npc.tsx` go from sprite to skeleton model.
- **Replaced:** `world/tiles/` (pixel tile chunks) by a terrain mesh with vertex color; `world/sprites/` remains only for halos and bubbles; `world/props/Boxes.tsx` by repainted glTF props; `world/art/pixels.ts` goes away.
- **Decisions that change:** D-139 (HD-2D) and D-154 (32 px per tile) are superseded; D-053 (camera by presets from above, no orbit) **is kept**; D-153 (pixel packs) is rewritten as "CC0 3D packs repainted to the palette".
- **For other targets (`07`):** natural VR in `xrTabletop` (a 3D diorama on the table is literally this style); mobile viable thanks to being light; desktop same as web.

## 13. Risks

1. **That it reads as "generic low-poly" (medium):** uncared-for CC0 low-poly looks cheap. *Mitigation:* the bible mandates vertex repainting, brushwork, warm bands and bevel; an asset that does not go through the repaint script does not get in.
2. **Chibi characters from packs (medium):** KayKit and Quaternius do not come with 14 ready-made country villagers. *Mitigation:* 2 or 3 base bodies + hats, hairstyles and clothing by color (as D-153 asked), or capsule models by code as in the mockup, which already read well.
3. **Chat framing in tight places (low to medium):** the mockup's occlusion test chooses among 6 angles; in a crowded square there may be no clean angle. *Mitigation:* fade (dither) the objects that block the camera-characters line in the chat.
4. **Tilt-shift on integrated chips (low):** high tier only.
5. **Distance from what was decided (low):** it replaces the look, not the architecture.

## 14. Estimated effort

| Stretch | Agent-days | What it includes |
|---|---|---|
| Long-lens camera preset + 3/4 chat with occlusion | 2 | On top of the existing `rig.ts` |
| Height terrain with vertex color, roads and river by curves, water | 4 | Base: the mockup's code |
| Toon material + brushstroke + glTF repaint script to the palette | 3 | In `world/materials` and `scripts/assets` |
| Characters with skeleton (2 base bodies, 3 NPCs), animations | 5 | Recolor, accessories |
| First full zone (props, instanced vegetation, animals) | 5 to 7 | |
| HUD restyle (paper-and-ink tokens, segment meter) | 1 to 2 | The components already exist |
| **Total up to a playable zone** | **~20 to 23** | The shortest of the three |

## 15. Knobs (to bring it closer to A or to B without changing proposal)

| Knob | Toward A (more painted) | Default | Toward B (more mobile) |
|---|---|---|---|
| Camera tilt | 60° | **50°** | 40° (horizon starts to show) |
| FOV | 22° (almost isometric) | **30°** | 40° |
| Brushstroke | repeat 6, more contrast | **repeat 10, soft** | off (flat color) |
| Toon bands | 3 marked bands | **4 soft bands** | continuous ramp (Lambert) |
| Palette saturation | −10 % and more ochre | **palette from the table** | +10 % and cooler greens |
| Outline | painted outline on characters | **no outline** | no outline |
| HUD | parchment and wood (from A) | **paper and ink** | round buttons (from B) |

**Proposal verdict:** the one that best joins the common thread of the references (colorful, sunny, leafy, warm, round, legible) with the GDD pillars (camera that follows on its own from above, no video game skill), the one that keeps the most code, the cheapest to source and the lightest to download.
