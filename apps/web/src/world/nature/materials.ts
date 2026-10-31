// world/nature/materials.ts — the materials of trees, rocks and detail of the open world (open-world-3d T7, D-828,
// AC71), port of the V6 mockup ones (`world.js` toon, leafMat, instFx). All nature shares four uniforms (the
// player position `uPl`, the LOD radii `uLod`, the clock and the wind amplitude) and each material is a distance
// band with the dithered handoff from @lg/art (`bandLimits`, ±BAND_DITHER m): an instance is in two bands at once
// only in that handoff, and the dither decides which pixel each paints. Each variant has its `customProgramCacheKey`.
//   · `follaje` (leaves and bark of the baked trees, ferns and flowers): the .ktx2 leaf where uv.y >= 0.25
//     (the leaf place in the mockup atlas) and the bark below, in a single material and a single call per
//     species and band (registered deviation: the plan asked for the bark in toon variants; this way the AC71 caps fit)
//   · `toon` (rocks near and far with the 2 × 2 atlas of the scans, pebbles with speckle)
//   · `impostor` (one per baked species, its texture is the impostor.ts bake)
//   · `sombra-blob` (the dark contact under trunks and rocks)
// Open-world-3d T7b (D-842): the leaf gain belongs to the look and enters as a uniform (`uLeafGain`), not as shader
// text: two looks give the same programs.
import {
  DataTexture, DoubleSide, FrontSide, LinearFilter, MeshBasicMaterial, MeshToonMaterial, RedFormat, RGBAFormat, SRGBColorSpace,
  Vector2, type Material, type Texture,
} from "three";
import { BAND_DITHER, CARD_FADE, type ShaderBand } from "@lg/art";
import { tagMaterial } from "../materials/registry";
import { NOISE_GLSL } from "../terrain/groundMaterial";

/** The uniforms shared by all the nature of a scene. */
export interface NatureUniforms {
  uPl: { value: Vector2 };
  uLod: { value: Vector2 };
  uSwayT: { value: number };
  uSwayA: { value: number };
  /** The look leaf gain (`WorldLook.vegetation.leafGain`). */
  uLeafGain: { value: number };
}

export const natureUniforms = (full: number, mid: number, leafGain: number): NatureUniforms => ({
  uPl: { value: new Vector2() },
  uLod: { value: new Vector2(full, mid) },
  uSwayT: { value: 0 },
  uSwayA: { value: 1 },
  uLeafGain: { value: leafGain },
});

/** Edges of each band against uLod = (full, light), as in the mockup (`BAND`). */
const BAND_GLSL: Readonly<Record<ShaderBand, readonly [string, string]>> = {
  near: ["-1e4", "uLod.x"],
  mid: ["uLod.x", "uLod.y"],
  far: ["uLod.y", "1e6"],
  nearMid: ["-1e4", "uLod.y"],
  midFar: ["uLod.x", "1e6"],
};
const D = BAND_DITHER.toFixed(1);

/** Dithered discard of the band (interleaved gradient noise, no texture): the ±BAND_DITHER m handoff. */
export const bandDiscard = (band: ShaderBand): string => {
  const [a, b] = BAND_GLSL[band];
  return `
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (ign >= smoothstep(${a} - ${D}, ${a} + ${D}, vDistP) || ign < smoothstep(${b} - ${D}, ${b} + ${D}, vDistP)) discard;`;
};

/** Card fade (AC44, @lg/art `cardFade` and `CARD_FADE`): |cos| from `face` to `edge` is dithered until it disappears. */
export const FACE_FADE_GLSL = `
  if (fract(52.9829189 * fract(dot(gl_FragCoord.xy + 7.0, vec2(0.06711056, 0.00583715)))) >= smoothstep(${CARD_FADE.edge.toFixed(3)}, ${CARD_FADE.face.toFixed(3)}, vFace)) discard;`;

/** Distance from the instance to the player (and sway by height if `sway`). Without instances, 0 (the bake). */
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
 * The soft ramp of foliage and rocks (mockup `softRampTexture`): from 0.5 to 1 with a smoothstep, without the hard bands
 * of the characters toon (in the forest the bands read as blotches). One per module: 64 px, never freed.
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

/** A 1 × 1 placeholder (opaque white) while the .ktx2 has not arrived. */
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
  /** Leaf (uv.y >= 0.25, with gain) and bark (`uBark`) of the tree atlas. */
  foliage?: { bark: { value: Texture } };
}

/** The nature shader patch over a three material (toon or basic). */
function patch<M extends Material>(m: M, u: NatureUniforms, o: Patch, key: string): M {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uPl: u.uPl, uLod: u.uLod, uSwayT: u.uSwayT, uSwayA: u.uSwayA });
    if (o.foliage) {
      sh.uniforms["uBark"] = o.foliage.bark;
      sh.uniforms["uLeafGain"] = u.uLeafGain;
    }
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
      ${o.foliage ? "uniform sampler2D uBark; uniform float uLeafGain;" : ""}`);
    if (o.foliage) {
      // The leaf lives at uv.y from 0.25 to 1 (top of the image at 1) and the .ktx2 is not flipped: leaf v = 1 - ...
      fs = fs.replace("#include <map_fragment>", `
        #ifdef USE_MAP
          leafW = step(0.25, vMapUv.y);
          vec4 leafC = texture2D(map, vec2(vMapUv.x / 0.75, 1.0 - (vMapUv.y - 0.25) / 0.75));
          vec4 barkC = vec4(texture2D(uBark, vec2(vMapUv.x, 0.5)).rgb, 1.0);
          diffuseColor *= mix(barkC, leafC, leafW);
        #endif`);
    }
    fs = fs.replace("#include <color_fragment>", `#include <color_fragment>
      ${o.foliage ? "diffuseColor.rgb *= mix(1.0, uLeafGain, leafW);" : ""}
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

/** The nature maps (sRGB diffuse; the rock normal, linear). They arrive later: until then, placeholder. */
export interface NatureMaps {
  leaf: { value: Texture };
  bark: { value: Texture };
  rockDiff: { value: Texture };
  rockNor: { value: Texture };
}

/**
 * The foliage of the baked trees and the ferns: one variant per band (`near`, `mid`, `nearMid`), or `null` for
 * the impostor bake (no band, out of the scene). Double-sided, alpha cutoff 0.5, sway and speckle.
 */
export function foliageMaterial(u: NatureUniforms, maps: NatureMaps, band: ShaderBand | null): MeshToonMaterial {
  const m = new MeshToonMaterial({ vertexColors: true, gradientMap: softRamp(), side: DoubleSide, map: maps.leaf.value, alphaTest: 0.5 });
  return tagMaterial(patch(m, u, { band, sway: band !== null, mottle: true, foliage: { bark: maps.bark } }, `follaje-${band ?? "horneado"}`), "follaje");
}

/** The flowers (their own canvas texture, AC: own art): `nearMid` band foliage with sway. */
export function flowerMaterial(u: NatureUniforms, map: Texture): MeshToonMaterial {
  const m = new MeshToonMaterial({ gradientMap: softRamp(), side: DoubleSide, map, alphaTest: 0.5 });
  return tagMaterial(patch(m, u, { band: "nearMid", sway: true }, "follaje-flores"), "follaje");
}

/** The rocks: the scan atlas with the normal (`near` only and if the tier uses it). Class `toon`. */
export function rockMaterial(u: NatureUniforms, maps: NatureMaps, band: "near" | "midFar", normals: boolean): MeshToonMaterial {
  const m = new MeshToonMaterial({ vertexColors: true, gradientMap: softRamp(), side: FrontSide, map: maps.rockDiff.value });
  if (normals) m.normalMap = maps.rockNor.value;
  return tagMaterial(patch(m, u, { band }, `roca-${band}${normals ? "-n" : ""}`), "toon");
}

/** The pebbles: speckled vertex color, `nearMid` band. Class `toon`. */
export function pebbleMaterial(u: NatureUniforms): MeshToonMaterial {
  const m = new MeshToonMaterial({ vertexColors: true, gradientMap: softRamp() });
  return tagMaterial(patch(m, u, { band: "nearMid", mottle: true }, "piedritas"), "toon");
}

/** A species impostor: cards with its bake, `far` band and edge fade (AC44). */
export function impostorMaterial(u: NatureUniforms, species: string): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ alphaTest: 0.5, side: DoubleSide });
  return tagMaterial(patch(m, u, { band: "far", faceFade: true }, `impostor-${species}`), "impostor");
}

/** The dark contact under trunks and rocks (mockup `aoMesh`): one quad per instance, not writing depth. */
export function contactShadowMaterial(map: Texture): MeshBasicMaterial {
  return tagMaterial(new MeshBasicMaterial({
    map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }), "sombra-blob");
}
