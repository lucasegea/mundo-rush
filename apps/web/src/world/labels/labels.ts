// world/labels/labels.ts — which name labels exist and how they look (plan estetica-c M1 items 14 and 15), pure. One per
// diorama NPC with its catalog name (the `MapActor.name`, which already falls back to the id if the catalog did not load); hidden for
// the NPC of the chat in progress (the panel already names it). The highlighted one is the NPC chosen by `selectInteractionPrompt`
// (the same selector as the HUD prompt: they cannot differ, A13): `ámbar` chip with `ámbar-osc` border and the E key.
// From afar (D-208) the chips pile up: past LABEL_HIDE_DISTANCE only the highlighted one remains, the one that will answer E.
import { PALETTE } from "@lg/art";

export interface LabelActor {
  id: string;
  name: string;
}

export interface LabelEntry {
  id: string;
  name: string;
  highlighted: boolean;
}

/**
 * Camera distance (m) from which the non-highlighted labels are hidden. At 65 m you can still tell who is who;
 * at 90 m the chip is bigger than the character and covers the map.
 */
export const LABEL_HIDE_DISTANCE = 75;

/** Is a label drawn at this camera distance? The highlighted one always. */
export function labelVisibleAt(highlighted: boolean, viewDistance: number): boolean {
  return highlighted || viewDistance <= LABEL_HIDE_DISTANCE;
}

/**
 * Open-world-3d T5 (PD-5): with the continuous zoom the labels fade out when moving away (V6 mockup: from t 0.3 to 0.55); past
 * this t only the highlighted one remains, and the beacons appear (Beacons.tsx).
 */
export const LABEL_HIDE_T = 0.45;

export function labelEntries(actors: readonly LabelActor[], highlightId: string | null, sceneNpcId: string | null, viewDistance = 0, zoomT = 0): LabelEntry[] {
  return actors
    .filter((a) => a.id !== sceneNpcId)
    .map((a) => ({ id: a.id, name: a.name, highlighted: a.id === highlightId }))
    .filter((e) => labelVisibleAt(e.highlighted, viewDistance) && (e.highlighted || zoomT < LABEL_HIDE_T));
}

/** Chip measurements drawn at 2x (canvas px). */
export const LABEL_FONT_PX = 30;
const PAD_X = 18;
const PAD_Y = 10;
const BORDER = 4;
const KEY_GAP = 12;
export const LABEL_FONT = `600 ${LABEL_FONT_PX}px ui-rounded, "Segoe UI Rounded", "Segoe UI", system-ui, sans-serif`;
/** Chip screen height, as a fraction of the canvas height (constant at all zoom steps). */
export const LABEL_SCREEN_FRACTION = 0.03;

export interface LabelStyle {
  fill: string;
  border: string;
  text: string;
}

export const LABEL_STYLES: Readonly<Record<"normal" | "highlighted", LabelStyle>> = {
  normal: { fill: PALETTE.papel, border: PALETTE["papel-borde"], text: PALETTE.tinta },
  highlighted: { fill: PALETTE["ámbar"], border: PALETTE["ámbar-osc"], text: PALETTE["chip-texto"] },
};

export interface LabelLayout {
  width: number;
  height: number;
  style: LabelStyle;
  /** The E key (highlighted only): box to the left of the name. */
  key: { x: number; y: number; size: number } | null;
  textX: number;
  textY: number;
}

/** Chip measurements. `measure` gives the text width in px (in the browser, the canvas's measureText). */
export function labelLayout(name: string, highlighted: boolean, measure: (text: string) => number): LabelLayout {
  const textW = Math.ceil(measure(name));
  const height = LABEL_FONT_PX + 2 * PAD_Y + 2 * BORDER;
  const keySize = LABEL_FONT_PX + 4;
  const keyW = highlighted ? keySize + KEY_GAP : 0;
  const width = textW + keyW + 2 * PAD_X + 2 * BORDER;
  return {
    width,
    height,
    style: highlighted ? LABEL_STYLES.highlighted : LABEL_STYLES.normal,
    key: highlighted ? { x: BORDER + PAD_X - 6, y: (height - keySize) / 2, size: keySize } : null,
    textX: BORDER + PAD_X + keyW,
    textY: height / 2,
  };
}

/** Sprite scale (no distance attenuation) so the chip measures LABEL_SCREEN_FRACTION of the height. */
export function labelScale(layout: Pick<LabelLayout, "width" | "height">, fovDeg: number): [number, number] {
  const h = 2 * LABEL_SCREEN_FRACTION * Math.tan(((fovDeg * Math.PI) / 180) / 2);
  return [h * (layout.width / layout.height), h];
}
