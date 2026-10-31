// @lg/art palette.ts: the world palette of proposal C §6 (D-207), the single source of the hex values. Pure data:
// no three, no DOM. Imported by world/ (materials, painting, labels), scripts/a11y/contrast.ts (the name
// label pairs, A14) and scripts/assets/ (glTF repainting). Moved from world/materials/ in M2 without rewriting
// (plan estetica-c §10, question 3).

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
  /** `casa-6` from the GDD: the same hex as `muro` (proposal C §6); as clothing it is the light T-shirt (plan estetica-c M3). */
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
  /** Chip text over `ámbar` (proposal C §6, contrast 8.42:1). */
  "chip-texto": "#2A1A05",
  "luz-bicho": "#FFD27A",
  // Supporting tones from the mockup (not tokens of the table, but they come from the same bible):
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
  // Open-world-3d T6 (D-819, D-823): the open world's ground (per-vertex color under the splat; from the V6 mockup, with the
  // high and the alternate ones greener: AC41 asks for less yellow than V6) and the sky. `cielo-horizonte` is the open
  // world's fog (world/sky: the dome's horizon IS the fog color, AC38).
  "suelo-bajo": "#4F9A35",
  "suelo-alto": "#7FB944",
  "suelo-alterno": "#93BE4A",
  "suelo-bosque": "#2F6A34",
  roca: "#8C928A",
  "roca-calida": "#9A8F80",
  "cielo-cenit": "#2F86D6",
  "cielo-medio": "#68B6EA",
  "cielo-horizonte": "#CFE7EE",
  // Lights from proposal C §5 (they are not painted, but their hex values also live here):
  sol: "#FFF1D6",
  "luz-cielo": "#D6ECF2",
  "luz-suelo": "#6E8B4A",
} as const;

export type PaletteToken = keyof typeof PALETTE;

/** The facades and clothing (`casa-1..5`). */
export const HOUSE_TOKENS = ["casa-1", "casa-2", "casa-3", "casa-4", "casa-5"] as const satisfies readonly PaletteToken[];

/** Character clothing: `casa-1..6` (D-153 reread by D-207, plan estetica-c M3). */
export const SHIRT_TOKENS = ["casa-1", "casa-2", "casa-3", "casa-4", "casa-5", "casa-6"] as const satisfies readonly PaletteToken[];

/** Name label text pairs (A14): check:contrast reads them from here, without copying them into tokens.css. */
export const LABEL_CONTRAST_PAIRS = [
  { name: "etiqueta: tinta sobre papel", fg: PALETTE.tinta, bg: PALETTE.papel },
  { name: "etiqueta resaltada: chip-texto sobre ámbar", fg: PALETTE["chip-texto"], bg: PALETTE["ámbar"] },
] as const;
/** Minimum for the labels (A14: AAA, like the dialogue). */
export const LABEL_CONTRAST_MIN = 7;
