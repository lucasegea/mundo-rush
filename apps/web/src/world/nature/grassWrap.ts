// world/nature/grassWrap.ts — la envoltura del pasto alrededor del disco (open-world-3d T8, D-821, AC75): la única fórmula
// que pone una mata en el mundo. Las matas viven en un cuadrado de lado GRASS_TILE_SPAN × radio, en coordenadas de
// [-1, 1] (aData.xy); cada una se dibuja en la copia de ese cuadrado que cae más cerca del centro del disco. La CPU la
// usa para elegir qué matas suben (el disco y el frustum) y el sombreador del pasto incluye GRASS_WRAP_GLSL, emitido acá
// con las mismas constantes: los dos lados no pueden separarse. El fragmento GLSL usa solo `mod`, `vec2`, números y
// + - * / (el test de AC75 lo evalúa con un intérprete chico de ese subconjunto y falla con cualquier otro token).

/** Lado del cuadrado de matas en radios del disco (la mata repite cada GRASS_TILE_SPAN × radio metros). */
export const GRASS_TILE_SPAN = 2;

/** `mod` de GLSL: x - y · floor(x / y) (siempre en [0, y) para y > 0). */
export const glslMod = (x: number, y: number): number => x - y * Math.floor(x / y);

/**
 * Dónde se dibuja una mata: `ax`, `az` en [-1, 1] (su lugar en el cuadrado), el centro del disco (`cx`, `cz`) y su radio
 * `r` (m). Devuelve x, z del mundo, siempre dentro del cuadrado de lado GRASS_TILE_SPAN × r centrado en el disco.
 */
export function grassWrap(ax: number, az: number, cx: number, cz: number, r: number): [number, number] {
  const span = GRASS_TILE_SPAN * r;
  return [cx + glslMod(ax * r - cx + r, span) - r, cz + glslMod(az * r - cz + r, span) - r];
}

/** El mismo cálculo en GLSL (lo incluye el sombreador del pasto; ninguna otra aritmética de envoltura vive allí). */
export const GRASS_WRAP_GLSL = /* glsl */ `vec2 grassWrap(vec2 a, vec2 c, float r) {
  return c + mod(a * r - c + vec2(r), vec2(${GRASS_TILE_SPAN.toFixed(1)} * r)) - vec2(r);
}`;
