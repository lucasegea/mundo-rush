// @lg/art costs.ts: lo que cuesta dibujar cada pieza del mundo (triángulos y llamadas), en dato puro (plan estetica-c M5).
// El estimador de M1 (world/budget/estimate.ts) suma el grafo de three; validate:content corre en Node sin three y sin
// el árbol del cliente, así que suma con esta tabla. La tabla no se escribe a ojo: apps/web/test/contenido-c.test.ts la
// compara pieza por pieza con los constructores reales (cada `codigo/*`, cada cabeza posible, el detalle, los árboles) y
// exige que el estimado de cada diorama del contenido sea IGUAL al del grafo real armado por world/. Si un constructor
// cambia, ese test falla y dice qué número actualizar. Los triángulos de los .glb no están acá: van en su fila del
// registro (`triangulos`, `primitivas`) y check:budgets los compara con el archivo servido.
import type { CharacterLook, HairStyle, Hat, Scarf } from "./looks.ts";

/** Topes por tier de 03 §2.7.1 (la única fuente; esta es su copia legible por máquina, ningún umbral cambia acá). */
export const TIER_BUDGETS = {
  low: { maxDrawCalls: 60, maxTriangles: 25_000 },
  medium: { maxDrawCalls: 120, maxTriangles: 50_000 },
  high: { maxDrawCalls: 150, maxTriangles: 100_000 },
} as const;

/** Los constructores por código de world/props/builders.ts (un test exige que sean exactamente estos). */
export const CODE_PROP_ASSETS = ["codigo/casa", "codigo/galpon", "codigo/caja", "codigo/cerco", "codigo/arbol", "codigo/pino"] as const;
export type CodePropAsset = (typeof CODE_PROP_ASSETS)[number];
export const TREE_ASSETS = ["codigo/arbol", "codigo/pino"] as const satisfies readonly CodePropAsset[];
export type TreeAsset = (typeof TREE_ASSETS)[number];
export const isCodeProp = (asset: string): asset is CodePropAsset => (CODE_PROP_ASSETS as readonly string[]).includes(asset);
export const isTreeProp = (asset: string): asset is TreeAsset => (TREE_ASSETS as readonly string[]).includes(asset);

/** El color principal de cada constructor: el que reemplaza `tinte` (paredes de la casa y del galpón, madera del resto). */
export const CODE_PROP_MAIN_TOKEN = {
  "codigo/casa": "casa-2",
  "codigo/galpon": "casa-1",
  "codigo/caja": "madera",
  "codigo/cerco": "madera",
  "codigo/arbol": "copa",
  "codigo/pino": "pino",
} as const satisfies Record<CodePropAsset, string>;

/** Triángulos fijos por constructor (la geometría no cambia de topología con el tamaño), salvo el cerco. */
const FIXED_PROP_TRIANGLES = { "codigo/casa": 3068, "codigo/galpon": 1268, "codigo/caja": 900, "codigo/arbol": 442, "codigo/pino": 294 } as const;
/** El cerco: un poste cada 1,6 m (como mínimo 2) y dos travesaños. */
export const FENCE = { postSpacing: 1.6, postTriangles: 84, railTriangles: 70, rails: 2 } as const;

export const fencePosts = (length: number): number => Math.max(2, Math.ceil(length / FENCE.postSpacing) + 1);

/** Triángulos de un prop por código del tamaño dado (ancho, alto, profundidad). */
export function codePropTriangles(asset: CodePropAsset, size: { w: number; h: number; d: number }): number {
  if (asset === "codigo/cerco") return fencePosts(Math.max(size.w, size.d)) * FENCE.postTriangles + FENCE.rails * FENCE.railTriangles;
  return FIXED_PROP_TRIANGLES[asset];
}

/** Pinos sembrados en el borde (world/terrain borderPines): cota de arriba (en límites chicos pueden entrar menos). */
export const BORDER_PINES = 16;

/** Tipos de detalle del suelo y triángulos por instancia (cada tipo es una sola malla instanciada). */
export const DETAIL_KINDS = ["flores", "matas", "piedritas"] as const;
export type DetailKind = (typeof DETAIL_KINDS)[number];
export const DETAIL_TRIANGLES = { flores: 60, matas: 100, piedritas: 20, empedrado: 20 } as const;

/** El plano del agua (uno por diorama, cubre todos los estanques y ríos), un quad. */
export const WATER_TRIANGLES = 2;
/** Un Sprite (etiqueta de nombre o burbuja de pedido) es un quad, una llamada. */
export const SPRITE_TRIANGLES = 2;
/** Las sombras blob: un quad instanciado (una llamada) bajo cada tronco y cada personaje. */
export const BLOB_TRIANGLES = 2;

/** Llamadas por personaje con esqueleto: el cuerpo y la cabeza (la boca solo aparece al hablar). */
export const ACTOR_DRAW_CALLS = 2;
/** El asset servido del cuerpo base de cada apariencia (`modelo/` + esto). */
export const bodyAsset = (body: string): string => `kaykit-adventurers-1/cuerpo-${body}`;

/** Cabeza por código (world/actors/head.ts): la base con casquete y cada pieza que suma o resta. */
export const HEAD_TRIANGLES = {
  base: 570,
  hair: { casquete: 0, corto: -46, rodete: 100, coleta: 148, largo: 120 } satisfies Record<HairStyle, number>,
  hat: { gorra: 186, paja: 366, boina: 176 } satisfies Record<Hat, number>,
  scarf: { panuelo: 36, bufanda: 204 } satisfies Record<Scarf, number>,
  /** El pañuelo reemplaza al casquete de pelo: sobre el corto (que es más chico) suma esto de más. */
  panueloOverShortHair: 46,
} as const;

export function headTriangles(look: Pick<CharacterLook, "hairStyle" | "hat" | "scarf">): number {
  const h = HEAD_TRIANGLES;
  let t = h.base + h.hair[look.hairStyle] + (look.hat ? h.hat[look.hat] : 0) + (look.scarf ? h.scarf[look.scarf] : 0);
  if (look.scarf === "panuelo" && look.hairStyle === "corto") t += h.panueloOverShortHair;
  return t;
}

export interface BudgetEstimate {
  drawCalls: number;
  triangles: number;
}

export const addEstimates = (...parts: readonly BudgetEstimate[]): BudgetEstimate =>
  parts.reduce((a, b) => ({ drawCalls: a.drawCalls + b.drawCalls, triangles: a.triangles + b.triangles }), { drawCalls: 0, triangles: 0 });
