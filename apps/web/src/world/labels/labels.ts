// world/labels/labels.ts — qué etiquetas de nombre hay y cómo se ven (plan estetica-c M1 ítems 14 y 15), puro. Una por
// NPC del diorama con su nombre del catálogo (el `MapActor.name`, que ya cae al id si el catálogo no cargó); oculta para
// el NPC de la charla en curso (el panel ya lo nombra). La resaltada es la del NPC que eligió `selectInteractionPrompt`
// (el mismo selector que el aviso del HUD: no pueden diferir, A13): chip `ámbar` con borde `ámbar-osc` y la tecla E.
import { PALETTE } from "../materials/palette";

export interface LabelActor {
  id: string;
  name: string;
}

export interface LabelEntry {
  id: string;
  name: string;
  highlighted: boolean;
}

export function labelEntries(actors: readonly LabelActor[], highlightId: string | null, sceneNpcId: string | null): LabelEntry[] {
  return actors.filter((a) => a.id !== sceneNpcId).map((a) => ({ id: a.id, name: a.name, highlighted: a.id === highlightId }));
}

/** Medidas del chip dibujado a 2x (px del canvas). */
export const LABEL_FONT_PX = 30;
const PAD_X = 18;
const PAD_Y = 10;
const BORDER = 4;
const KEY_GAP = 12;
export const LABEL_FONT = `600 ${LABEL_FONT_PX}px ui-rounded, "Segoe UI Rounded", "Segoe UI", system-ui, sans-serif`;
/** Alto del chip en pantalla, como fracción del alto del canvas (constante en los 3 pasos de zoom). */
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
  /** La tecla E (solo resaltada): cuadro a la izquierda del nombre. */
  key: { x: number; y: number; size: number } | null;
  textX: number;
  textY: number;
}

/** Medidas del chip. `measure` da el ancho del texto en px (en el navegador, measureText del canvas). */
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

/** Escala del sprite (sin atenuación por distancia) para que el chip mida LABEL_SCREEN_FRACTION del alto. */
export function labelScale(layout: Pick<LabelLayout, "width" | "height">, fovDeg: number): [number, number] {
  const h = 2 * LABEL_SCREEN_FRACTION * Math.tan(((fovDeg * Math.PI) / 180) / 2);
  return [h * (layout.width / layout.height), h];
}
