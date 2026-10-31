// world/terrain/groundMaterial.ts: the open world ground shader (open-world-3d T6, D-819, PD-4, class
// `terreno`), port of the V6 mockup splat (`world.js` groundMaterial): grass and sparse grass with anti-tiling (two
// rotated samples blended by noise), path dirt by each vertex `aDirt` weight with a worn,
// noisy edge, two rocks by slope and noise, and the green grass bed under the grass disc (`uGrassBed`, T8). With a
// greener grade than V6 (AC41: the mustard and the mid-zoom patch). The maps are the ground .ktx2 (scripts/assets/
// ktx2.ts) loaded with three/addons KTX2Loader and the self-hosted Basis transcoder in /decoders/; the normals
// are off on `low`. While the maps have not arrived (or if they fail) the ground keeps its vertex color: the scene
// never waits for or breaks over a texture.
// Open-world-3d T7b (D-839, D-842): which map goes in each splat slot and the grass grade belong to the look
// (`WorldLook.ground`); the grade enters as uniforms (not as shader text), so two looks share the program.
import { DataTexture, MeshStandardMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace, Vector2, Vector3, Vector4, type Texture, type WebGLRenderer } from "three";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import {
  GROUND_SLOTS, groundTextureFile, OPEN_WORLD_DENSITY, TEXTURES_DIR, type GroundMap, type GroundSlot, type WorldLook, type WorldTier,
} from "@lg/art";
import { tagMaterial } from "../materials/registry";

/** Value noise and fbm in GLSL (the V6 mockup one). */
export const NOISE_GLSL = /* glsl */ `
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 11.7; a *= 0.5; } return s / 0.9375; }
`;

/** Sampler uniform of each slot (diffuse `t*`, normal `n*`), in GROUND_SLOTS order. */
const SAMPLER: Readonly<Record<GroundSlot, readonly [string, string]>> = {
  grass: ["tG1", "nG1"],
  sparse: ["tG2", "nG2"],
  dirt: ["tD", "nD"],
  rock: ["tR1", "nR1"],
  rockAlt: ["tR2", "nR2"],
};

/*
 * The grass grade (AC41, `WorldLook.ground.grassGrade`, uniforms uGrassLow, uGrassHigh and uSparseGain): from where to
 * where the tone goes according to the large noise. V6 went from (0.34, 0.66, 0.13) to (0.62, 0.74, 0.17) with the sparse at 1.7, and the whole
 * map read as mustard. Measured at LG_GL=gpu, medium, t = 1 (yellow among the terrain pixels, cap 0.35): V6
 * 0.83; T6's first grade (0.3, 0.64, 0.14)-(0.44, 0.7, 0.15) also 0.83 (tonemapping and the warm sun shift the
 * green toward yellow); (0.2, 0.62, 0.18)-(0.3, 0.68, 0.2) 0.015 with the hue pinned at 72°; DEFAULT_LOOK's, 0.012 with the
 * hue at 80-88°.
 */

/** Ground color fragment (replaces `color_fragment`); `vColor` is buildTerrain's vertex color. */
const COLOR_GLSL = /* glsl */ `#include <color_fragment>
  if (uMaps > 0.5) {
    vec2 gq = vWPos.xz;
    vec3 Nw0 = normalize(vNW);
    float big = fbm(gq * 0.03);
    float mid = fbm(gq * 0.15 + 7.0);
    float slope = 1.0 - Nw0.y;
    float rockW = smoothstep(0.1, 0.26, slope + (mid - 0.5) * 0.1);
    float edge = vDirt + (fbm(gq * 0.8) - 0.5) * 0.75 + (vn(gq * 3.3) - 0.5) * 0.3;
    float pathW = smoothstep(0.5, 0.7, edge) * (1.0 - rockW);
    float wear = smoothstep(0.3, 0.55, edge) * (1.0 - pathW);
    vec2 pG = gq / 2.4, pD = gq / 2.0, pR = gq / 3.6;
    vec4 g1 = tx(tG1, pG), g2 = tx(tG2, pG * 1.3 + 4.7);
    float gm = smoothstep(0.3, 0.7, big);
    vec3 gc = mix(g1.rgb, g2.rgb * uSparseGain, gm * 0.6);
    float gl = dot(gc, vec3(0.3, 0.59, 0.11));
    vec3 tone = mix(uGrassLow, uGrassHigh, smoothstep(0.3, 0.72, big));
    gc = (vec3(gl) * 2.6 * tone + (gc - vec3(gl)) * 0.7) * (0.85 + 0.35 * mid) * 1.15;
    gc *= 0.55 + 0.9 * dot(vColor.rgb, vec3(0.3, 0.5, 0.2));
    vec3 dc = tx(tD, pD).rgb * 1.5;
    vec3 r1 = tx(tR1, pR).rgb * 1.15, r2 = tx(tR2, pR * 1.1 + 2.0).rgb * 1.2;
    vec3 rc = mix(r1, r2, smoothstep(0.35, 0.65, fbm(gq * 0.11 + 3.0)));
    // La cama de pasto bajo el disco (T8): plena hasta el 35 % del radio, nada en el borde; fuera del camino.
    float cover = uGrassBed.w * (1.0 - smoothstep(0.35 * uGrassBed.z, uGrassBed.z, length(gq - uGrassBed.xy))) * (1.0 - smoothstep(0.3, 0.6, edge));
    float streak = vn(vec2(gq.x * 7.0 + gq.y * 2.0, gq.y * 31.0)) * 0.5 + vn(vec2(gq.x * 29.0, gq.y * 8.0 - gq.x * 3.0)) * 0.5;
    vec3 bed = vec3(dot(gc, vec3(0.3, 0.59, 0.11))) * uBedTint * (0.8 + 0.4 * streak) * (0.85 + 0.3 * mid);
    gc = mix(gc, bed, cover * 0.85);
    vec3 dg = mix(gc, dc, 0.55);
    vec3 col = mix(gc, dg, wear);
    col = mix(col, dc, pathW);
    col = mix(col, rc, rockW);
    diffuseColor.rgb = col;
    gPathW = pathW; gWear = wear; gRockW = rockW; gGm = gm; gPG = pG; gPD = pD; gPR = pR; gQ = gq;
  }
`;

/** Map normals (replaces `normal_fragment_maps`), only with `uNormOn` and the maps loaded. */
const NORMAL_GLSL = /* glsl */ `
  if (uMaps > 0.5 && uNormOn > 0.5) {
    vec3 n1 = nx(nG1, gPG), n2 = nx(nG2, gPG * 1.3 + 4.7);
    vec3 ng = mix(n1, n2, gGm * 0.6);
    vec3 nd = nx(nD, gPD);
    vec3 nr = mix(nx(nR1, gPR), nx(nR2, gPR * 1.1 + 2.0), smoothstep(0.35, 0.65, fbm(gQ * 0.11 + 3.0)));
    vec3 tn = mix(ng * vec3(0.9, 0.9, 1.0), mix(ng, nd, 0.55), gWear);
    tn = mix(tn, nd, gPathW);
    tn = normalize(mix(tn, nr, gRockW));
    vec3 Nw = normalize(vNW);
    vec3 Tw = normalize(vec3(1.0, 0.0, 0.0) - Nw * Nw.x);
    vec3 Bw = cross(Nw, Tw);
    normal = normalize((viewMatrix * vec4(normalize(Tw * tn.x + Bw * tn.y + Nw * tn.z), 0.0)).xyz);
  }
`;

/**
 * The world edge (open-world-3d M3, AC35, TERRAIN_APRON): after the fog, the color blends into the fog one
 * according to the distance (Chebyshev, the extent one) outside the walkable bounds `uEdge`, from `uEdgeFade.x` to
 * `uEdgeFade.y` m. It uses `fogColor` from the same `fog_fragment`, so the edge ends up the exact color of the background and horizon.
 */
const EDGE_GLSL = /* glsl */ `#include <fog_fragment>
  #ifdef USE_FOG
    vec2 edgeOut = max(uEdge.xy - vWPos.xz, vWPos.xz - uEdge.zw);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(uEdgeFade.x, uEdgeFade.y, max(edgeOut.x, edgeOut.y)));
  #endif
`;

/** Walkable bounds and distances (m outside them) where the ground starts and finishes blending into the fog. */
export interface GroundEdge {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  fade: readonly [number, number];
}

const placeholder = (): Texture => {
  const t = new DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, RGBAFormat);
  t.needsUpdate = true;
  return t;
};

export interface GroundMaterial {
  material: MeshStandardMaterial;
  /** Center (x, z), radius and on state (0 to 1) of the grass bed; the grass moves it (world/nature/grass.ts, T8). */
  grassBed: Vector4;
  /**
   * Downloads the tier maps and puts them on the material (only once). Called after `dispose` (StrictMode double
   * effect) it revives it: the maps upload to the GPU again on the next frame.
   */
  loadMaps(renderer: WebGLRenderer): Promise<void>;
  /** Frees material and maps; maps that arrive later (load in progress) are freed on arrival and not assigned. */
  dispose(): void;
}

/** The served url of a ground map (apps/web/public/textures/... → <base>textures/...). */
export const groundMapUrl = (map: GroundMap, kind: "diff" | "nor", base = "/"): string =>
  `${base}${groundTextureFile(map, kind).slice(TEXTURES_DIR.length - "textures".length)}`;

/**
 * The maps a tier asks for with a look: the 5 diffuse ones always, the 5 normal ones only if the tier uses them (or if `normals`,
 * the T10 (b) knob, says so).
 */
export function groundMapsFor(
  tier: WorldTier, look: WorldLook, normals = OPEN_WORLD_DENSITY[tier].groundNormals,
): { slot: GroundSlot; map: GroundMap; kind: "diff" | "nor" }[] {
  const kinds: ("diff" | "nor")[] = normals ? ["diff", "nor"] : ["diff"];
  return GROUND_SLOTS.flatMap((slot) => kinds.map((kind) => ({ slot, map: look.ground.maps[slot], kind })));
}

let ktx2: KTX2Loader | null = null;

/** The world KTX2 loader (only one: the ground and, since T7, the nature), with the self-hosted transcoder. */
export function ktx2Loader(renderer: WebGLRenderer): KTX2Loader {
  ktx2 ??= new KTX2Loader().setTranscoderPath(`${import.meta.env.BASE_URL}decoders/`).detectSupport(renderer);
  return ktx2;
}

/**
 * The open world ground material (one per scene), with the look maps and grade. `normals` (T10 (b)): by
 * default the tier ones; false builds the shader without normal maps and does not download them.
 */
export function groundMaterial(
  tier: WorldTier, look: WorldLook, edge: GroundEdge | null = null, normals = OPEN_WORLD_DENSITY[tier].groundNormals,
): GroundMaterial {
  const material = tagMaterial(new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }), "terreno");
  const grassBed = new Vector4(0, 0, 1, 0);
  const uniforms: Record<string, { value: unknown }> = {
    uMaps: { value: 0 },
    uNormOn: { value: normals ? 1 : 0 },
    uGrassBed: { value: grassBed },
    // Without an edge, the fade stays out of reach (from 1e5 to 2e5 m; two distinct edges also in float32).
    uEdge: { value: edge ? new Vector4(edge.bounds.minX, edge.bounds.minZ, edge.bounds.maxX, edge.bounds.maxZ) : new Vector4() },
    uEdgeFade: { value: edge ? new Vector2(edge.fade[0], edge.fade[1]) : new Vector2(1e5, 2e5) },
    uGrassLow: { value: new Vector3(...look.ground.grassGrade.low) },
    uGrassHigh: { value: new Vector3(...look.ground.grassGrade.high) },
    uSparseGain: { value: look.ground.grassGrade.sparseGain },
    // T8 (D-839): the grass bed tint belongs to the look (`grass.bed`), as a uniform.
    uBedTint: { value: new Vector3(...look.grass.bed) },
  };
  const fallback = placeholder();
  for (const [t, n] of Object.values(SAMPLER)) {
    uniforms[t] = { value: fallback };
    if (normals) uniforms[n] = { value: fallback };
  }
  const samplers = Object.values(SAMPLER).flatMap(([t, n]) => (normals ? [t, n] : [t])).map((n) => `uniform sampler2D ${n};`).join("\n");
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aDirt; varying float vDirt; varying vec3 vWPos; varying vec3 vNW;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n vDirt = aDirt; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vNW = normalize(mat3(modelMatrix) * normal);");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying float vDirt; varying vec3 vWPos; varying vec3 vNW; uniform float uMaps; uniform float uNormOn; uniform vec4 uGrassBed;
        uniform vec4 uEdge; uniform vec2 uEdgeFade; uniform vec3 uGrassLow; uniform vec3 uGrassHigh; uniform float uSparseGain; uniform vec3 uBedTint;
        ${samplers}
        ${NOISE_GLSL}
        vec4 tx(sampler2D t, vec2 p) {
          vec4 a = texture2D(t, p);
          vec4 b = texture2D(t, mat2(0.8, 0.6, -0.6, 0.8) * p * 0.43 + 0.37);
          return mix(a, b, smoothstep(0.25, 0.75, vn(p * 0.17)));
        }
        ${normals ? `vec3 nx(sampler2D t, vec2 p) {
          vec3 a = texture2D(t, p).xyz * 2.0 - 1.0;
          vec3 b = texture2D(t, mat2(0.8, 0.6, -0.6, 0.8) * p * 0.43 + 0.37).xyz * 2.0 - 1.0;
          return mix(a, b, smoothstep(0.25, 0.75, vn(p * 0.17)));
        }` : ""}
        float gPathW = 0.0, gWear = 0.0, gRockW = 0.0, gGm = 0.0; vec2 gPG = vec2(0.0), gPD = vec2(0.0), gPR = vec2(0.0), gQ = vec2(0.0);`)
      .replace("#include <color_fragment>", COLOR_GLSL)
      .replace("#include <normal_fragment_maps>", normals ? NORMAL_GLSL : "")
      .replace("#include <fog_fragment>", EDGE_GLSL);
  };
  material.customProgramCacheKey = () => `terreno-${normals ? "n" : "s"}`;
  let loading: Promise<void> | null = null;
  let alive = true;
  return {
    material,
    grassBed,
    loadMaps(renderer) {
      alive = true;
      loading ??= (async () => {
        const loader = ktx2Loader(renderer);
        const maps = await Promise.all(groundMapsFor(tier, look, normals).map(async ({ slot, map, kind }) => {
          const tex = await loader.loadAsync(groundMapUrl(map, kind, import.meta.env.BASE_URL));
          tex.wrapS = tex.wrapT = RepeatWrapping;
          tex.anisotropy = 4;
          if (kind === "diff") tex.colorSpace = SRGBColorSpace;
          tex.needsUpdate = true;
          return { name: SAMPLER[slot][kind === "diff" ? 0 : 1], tex };
        }));
        if (!alive) {
          // Freed while downloading (fast tier change): they are not assigned; the next load, if any, downloads again.
          for (const m of maps) m.tex.dispose();
          loading = null;
          return;
        }
        for (const m of maps) (uniforms[m.name] as { value: unknown }).value = m.tex;
        (uniforms["uMaps"] as { value: number }).value = 1;
      })();
      return loading;
    },
    dispose() {
      alive = false;
      for (const u of Object.values(uniforms)) if ((u.value as Texture | undefined)?.isTexture) (u.value as Texture).dispose();
      // The 1 × 1 placeholder is no longer in the uniforms when the maps arrived, but it was uploaded to the GPU in the first frames.
      fallback.dispose();
      material.dispose();
    },
  };
}
