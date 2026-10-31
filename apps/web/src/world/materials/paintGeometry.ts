// world/materials/paintGeometry.ts — adapter from the pure paint (paint.ts) to a three BufferGeometry.
import { BufferAttribute, type BufferGeometry } from "three";
import { paintColors, tokenRgb, type PaintOptions, type PaletteToken } from "@lg/art";

/** Paints the geometry with a token (or a hex) and returns it (same instance, with the `color` attribute). */
export function paintGeometry(geo: BufferGeometry, token: PaletteToken | `#${string}`, seed = 0, opts: PaintOptions = {}): BufferGeometry {
  const pos = geo.getAttribute("position");
  geo.setAttribute("color", new BufferAttribute(paintColors(pos.array, tokenRgb(token), seed, opts), 3));
  return geo;
}
