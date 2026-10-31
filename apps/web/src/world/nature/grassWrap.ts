// world/nature/grassWrap.ts — the grass wrap around the disc (open-world-3d T8, D-821, AC75): the only formula
// that places a tuft in the world. Tufts live in a square of side GRASS_TILE_SPAN × radius, in coordinates of
// [-1, 1] (aData.xy); each is drawn in the copy of that square that falls closest to the disc center. The CPU
// uses it to choose which tufts are uploaded (the disc and the frustum) and the grass shader includes GRASS_WRAP_GLSL, emitted here
// with the same constants: the two sides cannot drift apart. The GLSL fragment uses only `mod`, `vec2`, numbers and
// + - * / (the AC75 test evaluates it with a small interpreter of that subset and fails on any other token).

/** Side of the tuft square in disc radii (the tuft repeats every GRASS_TILE_SPAN × radius meters). */
export const GRASS_TILE_SPAN = 2;

/** GLSL `mod`: x - y · floor(x / y) (always in [0, y) for y > 0). */
export const glslMod = (x: number, y: number): number => x - y * Math.floor(x / y);

/**
 * Where a tuft is drawn: `ax`, `az` in [-1, 1] (its place in the square), the disc center (`cx`, `cz`) and its radius
 * `r` (m). Returns world x, z, always inside the square of side GRASS_TILE_SPAN × r centered on the disc.
 */
export function grassWrap(ax: number, az: number, cx: number, cz: number, r: number): [number, number] {
  const span = GRASS_TILE_SPAN * r;
  return [cx + glslMod(ax * r - cx + r, span) - r, cz + glslMod(az * r - cz + r, span) - r];
}

/** The same calculation in GLSL (included by the grass shader; no other wrap arithmetic lives there). */
export const GRASS_WRAP_GLSL = /* glsl */ `vec2 grassWrap(vec2 a, vec2 c, float r) {
  return c + mod(a * r - c + vec2(r), vec2(${GRASS_TILE_SPAN.toFixed(1)} * r)) - vec2(r);
}`;
