# ADR-028: Painted diorama render inside R3F

- **Status:** Accepted (D-207, decided) · supersedes ADR-022 · amends ADR-011 · amended 2026-10-30 by D-209
- **Date:** 2026-10-12 (operator decision, D-207) · camera extension 2026-10-13 (D-208) · written 2026-10-13 (plan estetica-c M7)
- **Source:** `docs/03-architecture.md` §2.8, §2.9 and §11 (status in the `03` table: Accepted (D-207, decided)); art bible `docs/art-direction/proposal-c-painted-diorama.md`; plan `docs/plans/estetica-c-refactor.md`

## Decision

**Painted diorama render inside R3F** (D-207, D-208): the valley as a hand-painted toy diorama, with the same stack (Vite, React, R3F, drei) and the same data, grid, movement, input and store as before.

- **Terrain:** continuous heightfield mesh with vertex color, derived from the diorama layout in the diorama format (roads and rivers by curves, ponds by polygons, detail by zones); flat inside the walkable bounds, hills outside, and extended 160 m beyond the diorama (D-208).
- **Props:** rounded builders in code (`codigo/*`) and CC0 models repainted to the palette by the pipeline (`modelo/*`); no visible volume with unbeveled 90° edges, with a dihedral test.
- **Characters:** 3D chibi with a skeleton, repainted base body and head in code, appearance by content sheet; dialogue-only portraits rendered from the same model.
- **Material:** a single 4-band toon instance with brushwork and vertex color for the whole world; water with its own shader; closed registry of material classes; no outlines in v1.
- **Camera:** R11 presets `perspective3D` (long lens: FOV 30°, tilt 50°, yaw 45°, 8-step zoom ladder from 160 to 22 m starting at 30 m, D-208) and `dialogueFrame` (two-shot in 3/4); `xrTabletop` declared. No orthographic cameras.
- **Post-processing:** by tier and in its own chunk (bloom in `medium`; bloom, tilt-shift and vignette in `high`).

## Rejected alternatives

HD-2D (ADR-022, D-139: pixel tiles per chunk, characters as billboards, orthographic camera); "Painted map" and "Sunny valley" (proposals A and B in `docs/art-direction/`); generic low-poly 3D without bevel or paint

## Trade-offs

The pixel look of HD-2D; hand-painted textures per piece (color goes per vertex); outlines in v1; the orthographic camera presets

## Notes

Supersedes **ADR-022** (D-207 replaces D-139 and D-154) and amends **ADR-011** (toon becomes the material of the whole world). The HD-2D code was removed in the estetica-c plan M7 and `scripts/lint/retiro-hd2d.test.ts` prevents it from coming back: there is no `OrthographicCamera` in `apps/` or `packages/`, and the `nearest` filter lives only in the toon ramp. The content schema rejects the `tiles` and `atlas_tiles` keys with a message that points to the diorama format.

## Amendment D-209 (2026-10-30)

Open-world-3d plan, at the operator's direction of 2026-10-27; row D-209 of `00-decisiones.md`. This file is not rewritten; the amendment is added here.

- **Camera:** the default becomes `thirdPerson`, behind the character, with look by dragging or with Q and R and continuous zoom from 2.5 m to the whole map (V toggles). `perspective3D` and its 8-step ladder remain registered as a panorama; `dialogueFrame` does not change.
- **World:** open, about 140 × 100 m, with relief, instanced grass, trees baked at build time with impostors, dome sky and minimap.
- **Material:** no outlines in any tier. The closed registry grows to ten classes (`toon`, `agua`, `etiqueta`, `sombra-blob`, `terreno`, `pasto`, `follaje`, `impostor`, `cielo`, `nube`).
- **Textures:** color stays per vertex. Only the photographic ground and rock maps, the leaf atlas and the bark are served as registered external KTX2.
- **Post-processing:** tilt-shift runs only in the panorama and in conversation.
- **Character:** the open-world one goes through the same character pipeline.

## How to change

A change to this decision enters as a new ADR with the next number (D-088); this file is not rewritten.
