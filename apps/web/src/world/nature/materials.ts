// world/nature/materials.ts — los materiales de árboles, rocas y detalle del mundo abierto (open-world-3d T7, D-828,
// AC71), port de los de mockup V6 (`world.js` toon, leafMat, instFx). Toda la naturaleza comparte cuatro uniforms (la
// posición del jugador `uPl`, los radios de LOD `uLod`, el reloj y la amplitud del viento) y cada material es una banda
// de distancia con el relevo tramado de @lg/art (`bandLimits`, ±BAND_DITHER m): una instancia está en dos bandas a la vez
// solo en ese relevo, y el tramado decide qué píxel pinta cada una. Cada variante tiene su `customProgramCacheKey`.
//   · `follaje` (hojas y corteza de los árboles horneados, helechos y flores): la hoja de la .ktx2 donde uv.y >= 0,25
//     (el lugar de la hoja en el atlas del mockup) y la corteza debajo, en un solo material y una sola llamada por
//     especie y banda (desviación registrada: el plan pedía la corteza en variantes toon; así entran los topes de AC71)
//   · `toon` (rocas cerca y lejos con el atlas 2 × 2 de los escaneos, piedritas con moteado)
//   · `impostor` (uno por especie horneada, su textura es el horneado de impostor.ts)
//   · `sombra-blob` (el contacto oscuro bajo troncos y rocas)
import {
  DataTexture, DoubleSide, FrontSide, LinearFilter, MeshBasicMaterial, MeshToonMaterial, RedFormat, RGBAFormat, SRGBColorSpace,
  Vector2, type Material, type Texture,
} from "three";
import { BAND_DITHER, CARD_FADE, type ShaderBand, TREE_LEAF_GAIN } from "@lg/art";
import { tagMaterial } from "../materials/registry";
import { NOISE_GLSL } from "../terrain/groundMaterial";

/** Los uniforms compartidos por toda la naturaleza de una escena. */
export interface NatureUniforms {
  uPl: { value: Vector2 };
  uLod: { value: Vector2 };
  uSwayT: { value: number };
  uSwayA: { value: number };
}

export const natureUniforms = (full: number, mid: number): NatureUniforms => ({
  uPl: { value: new Vector2() },
  uLod: { value: new Vector2(full, mid) },
  uSwayT: { value: 0 },
  uSwayA: { value: 1 },
});

/** Bordes de cada banda contra uLod = (completo, liviano), como en el mockup (`BAND`). */
const BAND_GLSL: Readonly<Record<ShaderBand, readonly [string, string]>> = {
  near: ["-1e4", "uLod.x"],
  mid: ["uLod.x", "uLod.y"],
  far: ["uLod.y", "1e6"],
  nearMid: ["-1e4", "uLod.y"],
  midFar: ["uLod.x", "1e6"],
};
const D = BAND_DITHER.toFixed(1);

/** Descarte tramado de la banda (ruido de gradiente intercalado, sin textura): el relevo de ±BAND_DITHER m. */
export const bandDiscard = (band: ShaderBand): string => {
  const [a, b] = BAND_GLSL[band];
  return `
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (ign >= smoothstep(${a} - ${D}, ${a} + ${D}, vDistP) || ign < smoothstep(${b} - ${D}, ${b} + ${D}, vDistP)) discard;`;
};

/** Fundido de tarjeta (AC44, @lg/art `cardFade` y `CARD_FADE`): |cos| de `face` a `edge` se trama hasta desaparecer. */
export const FACE_FADE_GLSL = `
  if (fract(52.9829189 * fract(dot(gl_FragCoord.xy + 7.0, vec2(0.06711056, 0.00583715)))) >= smoothstep(${CARD_FADE.edge.toFixed(3)}, ${CARD_FADE.face.toFixed(3)}, vFace)) discard;`;

/** Distancia de la instancia al jugador (y vaivén por altura si `sway`). Sin instancias, 0 (el horneado). */
const vertexBand = (sway: boolean): string => `#include <begin_vertex>
  #ifdef USE_INSTANCING
    vDistP = distance(instanceMatrix[3].xz, uPl);
    float swPh = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
  #else
    vDistP = 0.0;
    float swPh = 0.0;
  #endif
  ${sway ? `float swK = clamp(transformed.y * 0.14, 0.0, 1.6) * uSwayA;
  transformed.x += sin(uSwayT * 1.25 + swPh) * 0.055 * swK;
  transformed.z += cos(uSwayT * 0.95 + swPh * 1.3) * 0.04 * swK;` : ""}`;

/**
 * La rampa suave del follaje y las rocas (mockup `softRampTexture`): de 0,5 a 1 con un smoothstep, sin las bandas duras
 * del toon de los personajes (en el bosque las bandas se leían como manchas). Una por módulo: 64 px, nunca se libera.
 */
let ramp: DataTexture | null = null;
export const softRamp = (): DataTexture => {
  if (ramp) return ramp;
  const N = 64;
  const d = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const t = Math.min(1, Math.max(0, (i / (N - 1) - 0.04) / 0.86));
    d[i] = Math.round((0.5 + 0.5 * t * t * (3 - 2 * t)) * 255);
  }
  ramp = new DataTexture(d, N, 1, RedFormat);
  ramp.minFilter = ramp.magFilter = LinearFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
};

/** Un 1 × 1 de espera (blanco opaco) mientras la .ktx2 no llegó. */
export const placeholderTexture = (): DataTexture => {
  const t = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat);
  t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
};

interface Patch {
  band: ShaderBand | null;
  sway?: boolean;
  mottle?: boolean;
  faceFade?: boolean;
  /** Hoja (uv.y >= 0,25, con ganancia) y corteza (`uBark`) del atlas de los árboles. */
  foliage?: { bark: { value: Texture } };
}

/** El parche de sombreador de la naturaleza sobre un material de three (toon o básico). */
function patch<M extends Material>(m: M, u: NatureUniforms, o: Patch, key: string): M {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uPl: u.uPl, uLod: u.uLod, uSwayT: u.uSwayT, uSwayA: u.uSwayA });
    if (o.foliage) sh.uniforms["uBark"] = o.foliage.bark;
    let vs = sh.vertexShader.replace("#include <common>", `#include <common>
      uniform vec2 uPl; uniform float uSwayT; uniform float uSwayA; varying float vDistP;
      ${o.mottle ? "varying vec3 vPosO;" : ""}${o.faceFade ? "varying float vFace;" : ""}`)
      .replace("#include <begin_vertex>", vertexBand(o.sway === true));
    if (o.mottle) vs = vs.replace("#include <begin_vertex>", "#include <begin_vertex>\n vPosO = position;");
    if (o.faceFade) {
      vs = vs.replace("#include <project_vertex>", `#include <project_vertex>
        #ifdef USE_INSTANCING
          mat4 fM = modelMatrix * instanceMatrix;
        #else
          mat4 fM = modelMatrix;
        #endif
        vFace = abs(dot(normalize(mat3(fM) * normal), normalize(cameraPosition - (fM * vec4(transformed, 1.0)).xyz)));`);
    }
    let fs = sh.fragmentShader.replace("#include <common>", `#include <common>
      uniform vec2 uLod; varying float vDistP; float leafW = 0.0;
      ${o.mottle ? `varying vec3 vPosO;\n${NOISE_GLSL}` : ""}${o.faceFade ? "varying float vFace;" : ""}
      ${o.foliage ? "uniform sampler2D uBark;" : ""}`);
    if (o.foliage) {
      // La hoja va en uv.y de 0,25 a 1 (arriba de la imagen en 1) y el .ktx2 no se da vuelta: v de la hoja = 1 - ...
      fs = fs.replace("#include <map_fragment>", `
        #ifdef USE_MAP
          leafW = step(0.25, vMapUv.y);
          vec4 leafC = texture2D(map, vec2(vMapUv.x / 0.75, 1.0 - (vMapUv.y - 0.25) / 0.75));
          vec4 barkC = vec4(texture2D(uBark, vec2(vMapUv.x, 0.5)).rgb, 1.0);
          diffuseColor *= mix(barkC, leafC, leafW);
        #endif`);
    }
    fs = fs.replace("#include <color_fragment>", `#include <color_fragment>
      ${o.foliage ? `diffuseColor.rgb *= mix(1.0, ${TREE_LEAF_GAIN.toFixed(2)}, leafW);` : ""}
      ${o.mottle ? `float mt = vn(vPosO.xz * 13.0 + vPosO.y * 7.0) * 0.6 + vn(vPosO.xy * 31.0 + vPosO.z * 17.0) * 0.4;
      diffuseColor.rgb *= 0.72 + 0.56 * mt;` : ""}
      ${o.band ? bandDiscard(o.band) : ""}
      ${o.faceFade ? FACE_FADE_GLSL : ""}`);
    sh.vertexShader = vs;
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => key;
  return m;
}

/** Los mapas de la naturaleza (difusos sRGB; la normal de roca, lineal). Llegan después: hasta entonces, espera. */
export interface NatureMaps {
  leaf: { value: Texture };
  bark: { value: Texture };
  rockDiff: { value: Texture };
  rockNor: { value: Texture };
}

/**
 * El follaje de los árboles horneados y los helechos: una variante por banda (`near`, `mid`, `nearMid`), o `null` para
 * el horneado de impostores (sin banda, fuera de la escena). Doble cara, recorte alfa 0,5, vaivén y moteado.
 */
export function foliageMaterial(u: NatureUniforms, maps: NatureMaps, band: ShaderBand | null): MeshToonMaterial {
  const m = new MeshToonMaterial({ vertexColors: true, gradientMap: softRamp(), side: DoubleSide, map: maps.leaf.value, alphaTest: 0.5 });
  return tagMaterial(patch(m, u, { band, sway: band !== null, mottle: true, foliage: { bark: maps.bark } }, `follaje-${band ?? "horneado"}`), "follaje");
}

/** Las flores (su propia textura de lienzo, AC: arte propio): follaje de banda `nearMid` con vaivén. */
export function flowerMaterial(u: NatureUniforms, map: Texture): MeshToonMaterial {
  const m = new MeshToonMaterial({ gradientMap: softRamp(), side: DoubleSide, map, alphaTest: 0.5 });
  return tagMaterial(patch(m, u, { band: "nearMid", sway: true }, "follaje-flores"), "follaje");
}

/** Las rocas: el atlas de los escaneos con la normal (solo `near` y si el tier la usa). Clase `toon`. */
export function rockMaterial(u: NatureUniforms, maps: NatureMaps, band: "near" | "midFar", normals: boolean): MeshToonMaterial {
  const m = new MeshToonMaterial({ vertexColors: true, gradientMap: softRamp(), side: FrontSide, map: maps.rockDiff.value });
  if (normals) m.normalMap = maps.rockNor.value;
  return tagMaterial(patch(m, u, { band }, `roca-${band}${normals ? "-n" : ""}`), "toon");
}

/** Las piedritas: color por vértice moteado, banda `nearMid`. Clase `toon`. */
export function pebbleMaterial(u: NatureUniforms): MeshToonMaterial {
  const m = new MeshToonMaterial({ vertexColors: true, gradientMap: softRamp() });
  return tagMaterial(patch(m, u, { band: "nearMid", mottle: true }, "piedritas"), "toon");
}

/** El impostor de una especie: tarjetas con su horneado, banda `far` y fundido de canto (AC44). */
export function impostorMaterial(u: NatureUniforms, species: string): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ alphaTest: 0.5, side: DoubleSide });
  return tagMaterial(patch(m, u, { band: "far", faceFade: true }, `impostor-${species}`), "impostor");
}

/** El contacto oscuro bajo troncos y rocas (mockup `aoMesh`): un quad por instancia, sin escribir profundidad. */
export function contactShadowMaterial(map: Texture): MeshBasicMaterial {
  return tagMaterial(new MeshBasicMaterial({
    map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }), "sombra-blob");
}
