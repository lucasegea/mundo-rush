// world/materials/paintGeometry.ts — adaptador de la pintura pura (paint.ts) a una BufferGeometry de three.
import { BufferAttribute, type BufferGeometry } from "three";
import type { PaletteToken } from "./palette";
import { paintColors, tokenRgb, type PaintOptions } from "./paint";

/** Pinta la geometría con un token (o un hex) y la devuelve (misma instancia, con el atributo `color`). */
export function paintGeometry(geo: BufferGeometry, token: PaletteToken | `#${string}`, seed = 0, opts: PaintOptions = {}): BufferGeometry {
  const pos = geo.getAttribute("position");
  geo.setAttribute("color", new BufferAttribute(paintColors(pos.array, tokenRgb(token), seed, opts), 3));
  return geo;
}
