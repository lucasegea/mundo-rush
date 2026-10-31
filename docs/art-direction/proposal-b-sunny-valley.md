# Proposal B: Sunny valley

**Project:** learning-game (*Mundo Rush*, mode 1 *Kestrel Valley*) · **Date:** 2026-10-12 · **Author:** build (the development environment), overnight run without an operator
**Status:** proposal to choose from. If the operator picks it, this document becomes the game's art bible and supersedes the HD-2D direction (D-139), the pixel density (D-154) and the top-down camera by presets (D-053).
**Mockup:** [`proposal-b-sunny-valley.html`](proposal-b-sunny-valley.html) (open it with a double click; `#charla` at the end of the URL opens the conversation directly). Comparison with the others: [`index.html`](index.html).

> **In one sentence:** a bright, open 3D valley, with a huge blue sky, clouds, green hills and pines, explored in third person as in mobile farm and horse games: stylized-semi-realistic, clean, sunny, with the camera behind the character.

---

## 1. Concept and mood words

- **What it is:** stylized 3D with simple PBR materials (no detailed textures, vertex color or a gradient atlas), characters of ~5-head proportion with skeleton and animations, a third-person follow camera and a distant horizon with mountains fading into the haze.
- **Mood words:** luminous, open, fresh, calm adventure, "day in the country", wide.
- **What it takes from each reference:**
  - *Horse Stable: Herd Care Simulator* (2): the big sky with soft clouds, the green hills, the pines, the stylized-semi-real animals, the camera behind.
  - Horse show-jumping game (3): the warm, clean light, the chase camera, the round buttons and the joystick HUD.
  - Mobile farm game (4): the character in a hat carrying bales to the cart, the tropical green, the sun; joystick bottom left, small bar top left.
  - *Heroes IV* (1): the river with a wooden bridge and the cabins; the rest does not apply to this camera.
- **What it does not take:** the monetization of those games (energy, timers, chests), the extreme saturation of some and the camera you have to handle with your finger all the time.

## 2. World: structure and scale

- **Unit:** 1 unit = 1 m. Character about 2.1 m tall with hat (barely heroic scale), house of 6 × 4.6 m with 2.8 m walls, barn of 7 × 6 m.
- **Zones:** each zone of the GDD is an **open valley of about 120 × 120 m walkable** inside a 260 × 260 m terrain, surrounded by a ring of hills and mountains (17 m high, 75 to 125 m from the center) that the fog turns bluish. The walkable edges are the river, wire fences and steep hills.
- **Density:** the village center is open (houses, corral, vegetable garden, cart); pines cluster on the hills from 24 m from the center and form forest from 38 m. Instanced grass tufts near the player (1600 per zone) so the ground does not look smooth.
- **Landmarks visible from afar:** the red barn, the mill or the Crossing's tank, the bridge. In third person you orient yourself by landmarks, not by map.
- **Scale of a walk:** at normal pace (4.2 m/s) the village is crossed in about 25 s; jogging (`Shift`) goes at 7.5 m/s.

## 3. Characters

- **Proportions:** stylized-semi-realistic, **about 5 heads**: slightly big head, long legs, simplified hands and boots. Clean silhouettes, no finger detail.
- **Skeleton and animation:** standard humanoid (compatible with retargeting from Mixamo and from Quaternius's Universal Animation Library). Minimum set: idle, walk, jog, turn in place, talk (looping gestures), wave, nod, shake head, think, sit, crouch to pick up, carry (bale or bucket), hand something over, lean on the fence. Transitions with a 0.2 s blend.
- **Animals:** horses, cows, chickens and the goat Clover from the GDD, with idle, graze, walk. In this proposal the animals are visual protagonists (as in reference 2).
- **NPC readability:** in third person the NPC is seen at 5 or 15 m, so readability is by **silhouette and color**: Tomás's cowboy hat, coral shirt, each NPC with their own shirt color for the zone. The NPC with a request carries a **spinning orange diamond** above the head (visible above the fog and the vegetation). Floating names optional in accessibility.
- **Faces:** big dark eyes, small nose; expressions are made with 4 to 6 *blend shapes* (smile, surprise, think, blink). No fine lip sync; a mouth "open and close" with the voice amplitude is enough.

## 4. Camera

- **Type:** perspective, **vertical FOV 55°**, third person behind the player.
- **Distance and height:** 3 zoom steps at **6.5 / 9 / 13 m**, with a tilt of **9° + 4° per step** (farther = a little higher). It looks at a point **2.3 m above the player**, so the horizon and sky take the top third (the charm of this proposal).
- **Follow:** position and look-at with exponential smoothing (rate 6/s). **The camera settles itself behind the player** while walking (rate 1.6/s); if the player turns around, it does not swing abruptly. **No free mouse orbit by default** (GDD §1.3 pillar and the lesson from *Terra Alia*); `Q` turns 45° to look at something specific. Right-click orbit may exist as an accessibility option, off.
- **Collision:** it never enters the hills (it rises above the terrain + 0.8 m). In production, also, a short *raycast* against houses and trees brings the camera closer if something covers the player.
- **Conversation:** **over-the-shoulder shot**: camera 4.3 m behind the player, 1.7 m to the side, 2.1 m high, FOV 42°, looking at the midpoint between the two at 1.6 m. The NPC faces forward and the player has their back to one side. The player settles on their own at 2.4 m from the NPC before framing. With "reduce motion", the shot change is a cut.

## 5. Light

- **Reference time:** summer mid-morning, clear sky.
- **Sun:** `DirectionalLight` color `#FFF4E0`, **intensity 3.0**, elevation **52°**, azimuth set **behind the initial camera** so the characters look lit from the front. **Soft PCF** shadows, map of **1024 px (medium) / 2048 px (high)** in a 52 × 52 m box that follows the player; `bias -0.0003`, `normalBias 0.04`.
- **Sky:** `HemisphereLight` sky `#BFE6FF`, ground `#6FAE3E`, intensity 1.25. Dome with gradient zenith `#3E9BFF` to horizon `#CFEFFF` and sun halo.
- **Clouds:** 16 clusters of white spheres with emissive `#DDE8F5` at 45 % (they never darken), at 55 to 100 m high, turning very slowly.
- **Fog:** exponential squared `#CFEFFF`, density **0.0065** (medium), 0.0055 (high), 0.011 (low: cuts the draw distance).
- **Tone:** ACES Filmic, exposure 1.0, sRGB output.
- **Water:** shader with blending by view angle (lighter from the side), glints that run and the same fog.
- **Postprocessing:** high tier with soft bloom (threshold 0.9) and, if the budget allows, light SSAO. Nothing on low and medium.
- **Sunset and night (GDD):** light presets by hour (`D-051`): sunset with sun `#FFB27A` at 12° elevation, sky `#F2B28C`; night with bluish moon and emissives (windows, fireflies).

## 6. Palette

| Token | Hex | Use |
|---|---|---|
| `pasto` | `#7CCB4E` | Base grass |
| `pasto-loma` | `#A6DC5A` | Hills in the sun |
| `pasto-sombra` | `#4E9A3A` | Hollows, shade |
| `camino` | `#E6C88F` | Roads |
| `tierra` | `#C79A63` | Road edge, vegetable garden |
| `orilla` | `#E9D9A6` | River sand |
| `pino` / `pino-luz` | `#2E7D4F` / `#4FA36A` | Conifers |
| `copa` / `copa-luz` | `#5DBB45` / `#9BDD5E` | Leafy trees |
| `tronco` | `#7A4E2D` | Trunks |
| `agua` / `agua-honda` | `#39B6E0` / `#1E86B8` | River |
| `espuma` | `#E8FAFF` | Glints |
| `cielo-cenit` / `cielo-horizonte` | `#3E9BFF` / `#CFEFFF` | Dome |
| `nube` / `nube-sombra` | `#FFFFFF` / `#DDE8F5` | Clouds |
| `montaña` | `#7FA8C9` | Distant hills in the haze |
| `muro` | `#FFF4E0` | Houses |
| `techo` | `#E5533D` | Tile roofs |
| `granero` | `#C8432F` | Barn |
| `madera` | `#A86B3C` | Fences, bridge, cart |
| `ui-texto` | `#1F2A44` | Text on white |
| `ui-panel` | `rgba(18,38,68,0.62)` | Translucent dark chips |
| `ui-naranja` | `#FFB020` | Talk button, full meter |
| `ui-verde` | `#20803A` → `#1B6E30` | Done button |
| `ui-azul` | `#2A6FB8` | Secondary round buttons |
| `ui-nombre` | `#C23A26` | NPC name in the bubble |
| `luz-bicho` | `#FFD27A` | Lumi |

**Contrast (WCAG, measured):** `ui-texto` on white 14.26:1 (AAA); white on `ui-panel` 4.98:1 over the sky and 6.70:1 over the grass (AA); text `#5A3200` on `ui-naranja` 6.07:1; white on `ui-verde` 4.99:1; white on `ui-azul` 5.17:1; `ui-nombre` on white 5.35:1; gloss `#5B6B82` on white 5.43:1. In the first version of the mockup three pairs failed (green 2.38, name `#E5533D` 3.73, blue `#4BA3F2` 2.69) and were darkened to the values in the table. **Rule:** the bright green and orange of mobile games go as a button background only with dark text, or are darkened.
**Palette risk:** the translucent chip depends on what is behind it; over a very bright sky it drops to about 5:1. If the operator raises the light, the panel opacity must be raised.

## 7. Render technique

- **Materials:** `MeshStandardMaterial` with `roughness 0.85` to `0.95` and `metalness 0`, vertex color or a shared **256 px gradient atlas** (the format of Synty- and KayKit-style packs). No normal maps or detail textures.
- **Terrain:** a 260 × 260 m height mesh with 200 × 200 segments and vertex color, one per zone. In production: height data in the diorama (YAML compiled to JSON, D-138) and 2-level LOD.
- **Vegetation:** `InstancedMesh` for pines, trees and grass; impostors (billboards) for pines beyond 60 m on low and medium.
- **Characters:** glTF with *skinning*, `AnimationMixer` per character; up to 4 animated at once on low, 8 on medium, 12 on high.
- **Sky and water:** custom shaders (included in the mockup), with `tonemapping_fragment` and `colorspace_fragment` so they respect the tone.
- **Outlines:** no. The look is clean.
- **Resolution:** `devicePixelRatio` with a cap of 0.75 / 1.25 / 2 per tier; on low it renders below native resolution and scales.

## 8. UI and HUD

- **Visual language:** modern mobile. **Round** buttons with a 4 px white border and a hard bottom shadow, translucent dark chips with white text, rounded heavy typography (`Arial Rounded MT Bold`, Trebuchet).
- **Top left:** round player avatar and objective chip ("Objective: get to know Tomás"). There is no health bar (there is no damage); the objective takes its place.
- **Conversation meter ("Get to know Tomás"):** top center, title in a white pill and below **five capsules** that fill with embossed orange; the current one grows; below, the name of the criterion in progress. No XP numbers.
- **Dialogue:** **large white bubble** with a tail pointing at the NPC, name in red, the line at 23 px with the new word highlighted in pale yellow (tap = translation) and the gloss. Below, a row of **pills**: turn state (green dot that pulses), `Repetir`, `Más despacio`, `Pista` and a large green `Terminé`.
- **Bottom right:** large **Talk** button (orange, dims if nobody is near) and secondary round buttons (`Cuaderno`, `Vista táctil`).
- **Bottom left:** on PC, the key help; on touch, the **virtual joystick** (132 px circle with a 58 px knob). The mockup toggles with `T` to show how it would look on mobile.
- **Narrow screens:** the meter and the bubble move down, the key help and the quality chip are hidden. Verified at 390 px.

## 9. Controls

- **PC (main):** WASD/arrows relative to the camera (W = where the camera looks), `Shift` jog, `E` talk, `Espacio`/`Enter` Done, `Esc` leave, `Q` turn camera 45°, wheel or `+` `-` zoom. The mouse is not needed; click on the HUD buttons.
- **Gamepad (natural in this proposal):** left stick move, right stick turn camera slowly (optional, off by default in assisted mode), `A` talk and Done, `B` leave, `X` hint, `Y` repeat, `LB`/`RB` turn 45°.
- **Mobile (later):** virtual joystick on the left and Talk button on the right (the pattern of references 3 and 4). Dragging with the other finger turns the camera; double tap puts it back behind the player. It is the scheme best known by mobile players and the hardest for someone who does not play (GDD §1.3: "does not require knowing how to play video games").

## 10. Performance on modest PCs

| Tier | Max pixel ratio | Shadows | Fog / distance | Extras | Expected cost |
|---|---|---|---|---|---|
| `bajo` | 0.75 | none (blob shadow) | dense (0.011), distant pines as impostors | no clouds | 60 to 90 draw calls, ~40k visible triangles |
| `medio` | 1.25 | PCF 1024 | 0.0065 | clouds | 90 to 140 draw calls, ~120k triangles |
| `alto` | 2 | PCF 2048 | 0.0055 | bloom, light SSAO | up to ~200 draw calls |

- **The good:** the reference games run on mid-range phones, so the style is attainable.
- **What weighs:** the open horizon (a lot to draw), dynamic shadows in a large box, the *skinning* of several characters and the transparency of the water. On old integrated chips the low tier will lose the shadows and much of the horizon, which is exactly what gives this proposal its identity.
- **Measurement in the mockup:** clean browserless check on all three tiers; in software rendering (SwiftShader) it is the heaviest scene of the three.

## 11. Assets: where they come from, license and cost

| Piece | Proposed source | License | Cost | Notes |
|---|---|---|---|---|
| Base characters with skeleton | **KayKit** (Kay Lousberg), **Quaternius** (Ultimate Modular Men/Women) | CC0 | 0 USD | **[verify]** which pack brings ~5-head proportion; KayKit tends toward chibi |
| Animations | **Quaternius Universal Animation Library**, **Mixamo** (Adobe, free with an account, commercial use allowed in games) | CC0 / Mixamo license | 0 USD | Mixamo does not allow redistributing the animations on their own; inside the game it is fine |
| Nature (pines, trees, rocks, grass) | Quaternius Stylized Nature MegaKit, Kenney Nature Kit | CC0 | 0 USD | Recolor to the palette |
| Houses, barn, fences, carts | Kenney (Survival Kit, Fantasy Town Kit), Quaternius Medieval Village MegaKit | CC0 | 0 USD | **[verify]** that there is a barn and a modern country house; if not, model simply |
| Animals (horse, cow, chicken, goat) | Quaternius (animated animal packs) | CC0 | 0 USD | **[verify]** the exact pack content |
| Paid unified-style alternative | **Synty POLYGON** (Farm, Nature) and Synty Sidekick (character creator) | Synty commercial license | ~USD 30 to 150 per pack **[verify price]** | A single author = even style. **[verify]** redistribution clause for a web game (the GLBs remain downloadable in the browser), same as happened with Mana Seed |
| Sky, water, fog, Lumi | own code (mockup shaders) | own | 0 USD | |

**What is necessarily our own:** the cast with their clothes and accessories (13 or 14 villagers as variants of 2 or 3 bodies), the face *blend shapes* if the pack does not bring them, the layout of each zone, sky and water.

## 12. How it fits in the R3F stack and what is reused

- **Stays the same:** Vite + React + TS + R3F + drei, the pure core, the store, the DOM HUD (restyled), the R10 to R15 seams and the layer lint.
- **Changes fundamentally:**
  - `world/camera/`: a new `thirdPerson` preset is needed (`perspective3D` is already declared in `presets.ts`). `followAlpha` and `cutFollow` work; `cameraOffset` is replaced by the chase logic with collision. **This clashes with D-053 and with the pillar "camera that follows on its own from above"**: the operator would have to review it explicitly.
  - **Movement:** the core's 1 m cell grid still serves for collision and "current cell", but movement becomes continuous and relative to the camera; click on the ground becomes secondary.
  - **Terrain:** continuous heights instead of tiles; `world/tiles/` is replaced by a terrain mesh.
  - `world/sprites/`: discarded for characters (they become skinned glTF); remains only for halos and effects.
  - `world/post/Post.tsx`: the bloom is reused; the tilt-shift is removed (does not apply to this camera).
- **Discarded:** `world/art/pixels.ts`, `world/props/Boxes.tsx`, D-154 and the character billboards.
- **For other targets (`07`):** VR is a good case (real 3D characters, human scale). Mobile is possible but is the most GPU-demanding of the three proposals.

## 13. Risks

1. **Clashes with a GDD pillar (high):** "does not require knowing how to play video games" and "camera that follows on its own from above, no free orbit". Third person forces handling camera-relative direction; the references research (*Terra Alia*) flagged the camera as the most costly complaint. *Mitigation:* aggressive assisted camera and optional "click to walk" mode, but it will never feel as easy as looking from above.
2. **Performance on integrated chips (high):** the horizon, shadows and *skinning* are what make the proposal pretty and the first thing turned off on low.
3. **Naming objects in space (medium):** the GDD bets on "asking about any object" (*Influent*); in third person objects end up small and sometimes behind the character. A "look" mode or highlight on approach is needed.
4. **Pack style (medium):** mixing KayKit, Quaternius and Kenney gives different proportions. *Mitigation:* a single character pack and recolor of everything to the palette.
5. **Motion sickness (low to medium):** continuously moving camera. *Mitigation:* "reduce motion" with cuts and fixed FOV.
6. **Supersedes three decisions (D-139, D-154, D-053):** the document cost is higher than in A or C.

## 14. Estimated effort

| Stretch | Agent-days | What it includes |
|---|---|---|
| Third-person camera with collision and chat shot | 5 | The most delicate part; it has to be tested with people |
| Continuous camera-relative movement on top of the grid core | 3 | Keep R7 (per-frame position outside React) |
| Height terrain, water, sky, fog, shadows per tier | 5 | Based on the mockup shaders |
| glTF characters with skeleton, animation blending, 3 NPCs | 6 | Retargeting and recolor |
| First full zone with props and animals | 6 to 8 | |
| HUD restyle (mobile style, joystick for later) | 2 | |
| **Total up to a playable zone** | **~27 to 29** | Plus 2 to 3 days of camera tests with the operator |

**Proposal verdict:** the closest to the mobile references and the best for VR. It is the heaviest to run and the one that fights most with the GDD's accessibility pillars.
