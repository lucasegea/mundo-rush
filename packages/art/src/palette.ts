// @lg/art palette.ts: la paleta del mundo de la propuesta C §6 (D-207), única fuente de los hex. Dato puro:
// sin three, sin DOM. La importan world/ (materiales, pintura, etiquetas), scripts/a11y/contrast.ts (pares de las
// etiquetas de nombre, A14) y scripts/assets/ (repintado de glTF). Movida desde world/materials/ en M2 sin reescribirse
// (plan estetica-c §10, pregunta 3).

export const PALETTE = {
  pasto: "#93C25B",
  "pasto-luz": "#B9D86E",
  "pasto-sombra": "#5E9450",
  camino: "#E3C58E",
  "tierra-borde": "#B98F5A",
  orilla: "#D9C38C",
  "copa-luz": "#A9D35F",
  copa: "#6FAE4A",
  "copa-sombra": "#3F7A45",
  pino: "#3C7354",
  tronco: "#8A5A3B",
  agua: "#5FB8C9",
  "agua-honda": "#3A8FA8",
  brillo: "#E6F7F4",
  cielo: "#BFE3EC",
  bruma: "#F3E7CF",
  muro: "#F4EDE2",
  "casa-1": "#E9806E",
  "casa-2": "#F2CF6B",
  "casa-3": "#9ED8B8",
  "casa-4": "#9CC7E8",
  "casa-5": "#B9A6DB",
  /** `casa-6` del GDD: el mismo hex que `muro` (propuesta C §6); como ropa es la remera clara (plan estetica-c M3). */
  "casa-6": "#F4EDE2",
  techo: "#C9624B",
  cumbrera: "#A84E3B",
  madera: "#9A6B43",
  "maíz": "#D9B65A",
  "hoja-maíz": "#8DBE57",
  ventana: "#FFD58A",
  papel: "#FBF6EC",
  tinta: "#2A2A33",
  "tinta-suave": "#5B5664",
  "ámbar": "#F2A93B",
  "ámbar-osc": "#B86E12",
  /** Texto del chip sobre `ámbar` (propuesta C §6, contraste 8,42:1). */
  "chip-texto": "#2A1A05",
  "luz-bicho": "#FFD27A",
  // Tonos de apoyo del mockup (no son tokens de la tabla, pero salen de la misma biblia):
  piedra: "#C7BBA6",
  zocalo: "#B9A891",
  piel: "#E8B48F",
  "piel-2": "#C98E68",
  pelo: "#4A3326",
  "pelo-2": "#5A4636",
  pantalon: "#4F5D8C",
  "pantalon-2": "#7A5A3E",
  paja: "#E8C77A",
  gorra: "#4A86D9",
  mejilla: "#F2A08A",
  blanco: "#FFFFFF",
  "papel-borde": "#E6DCC8",
  "flor-centro": "#F7F2E6",
  chimenea: "#B98A6A",
  // Luces de la propuesta C §5 (no se pintan, pero sus hex también viven acá):
  sol: "#FFF1D6",
  "luz-cielo": "#D6ECF2",
  "luz-suelo": "#6E8B4A",
} as const;

export type PaletteToken = keyof typeof PALETTE;

/** Las fachadas y la ropa (`casa-1..5`). */
export const HOUSE_TOKENS = ["casa-1", "casa-2", "casa-3", "casa-4", "casa-5"] as const satisfies readonly PaletteToken[];

/** La ropa de los personajes: `casa-1..6` (D-153 releída por D-207, plan estetica-c M3). */
export const SHIRT_TOKENS = ["casa-1", "casa-2", "casa-3", "casa-4", "casa-5", "casa-6"] as const satisfies readonly PaletteToken[];

/** Pares de texto de las etiquetas de nombre (A14): los lee check:contrast desde acá, sin copiarlos en tokens.css. */
export const LABEL_CONTRAST_PAIRS = [
  { name: "etiqueta: tinta sobre papel", fg: PALETTE.tinta, bg: PALETTE.papel },
  { name: "etiqueta resaltada: chip-texto sobre ámbar", fg: PALETTE["chip-texto"], bg: PALETTE["ámbar"] },
] as const;
/** Mínimo de las etiquetas (A14: AAA, como el diálogo). */
export const LABEL_CONTRAST_MIN = 7;
