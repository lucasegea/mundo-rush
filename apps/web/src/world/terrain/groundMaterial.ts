// world/terrain/groundMaterial.ts: el sombreador del suelo del mundo abierto (open-world-3d T6, D-819, PD-4, clase
// `terreno`), port del splat del mockup V6 (`world.js` groundMaterial): pasto y pasto ralo con antirrepetición (dos
// muestras giradas mezcladas por ruido), tierra del camino por el peso `aDirt` de cada vértice con borde gastado y
// ruidoso, dos rocas por pendiente y ruido, y la cama de pasto verde bajo el disco de pasto (`uGrassBed`, T8). Con un
// grado más verde que V6 (AC41: el mostaza y el parche de zoom medio). Los mapas son los .ktx2 del suelo (scripts/assets/
// ktx2.ts) cargados con KTX2Loader de three/addons y el transcodificador Basis autoalojado en /decoders/; los normales
// van apagados en `low`. Mientras los mapas no llegaron (o si fallan) el suelo queda con su color por vértice: la escena
// nunca espera ni se rompe por una textura.
// Open-world-3d T7b (D-839, D-842): qué mapa va en cada ranura del splat y el grado del pasto son del look
// (`WorldLook.ground`); el grado entra como uniforms (no como texto del sombreador), así dos looks comparten el programa.
import { DataTexture, MeshStandardMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace, Vector2, Vector3, Vector4, type Texture, type WebGLRenderer } from "three";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import {
  GROUND_SLOTS, groundTextureFile, OPEN_WORLD_DENSITY, TEXTURES_DIR, type GroundMap, type GroundSlot, type WorldLook, type WorldTier,
} from "@lg/art";
import { tagMaterial } from "../materials/registry";

/** Ruido de valor y fbm en GLSL (el del mockup V6). */
export const NOISE_GLSL = /* glsl */ `
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 11.7; a *= 0.5; } return s / 0.9375; }
`;

/** Uniform del sampler de cada ranura (difuso `t*`, normal `n*`), en el orden de GROUND_SLOTS. */
const SAMPLER: Readonly<Record<GroundSlot, readonly [string, string]>> = {
  grass: ["tG1", "nG1"],
  sparse: ["tG2", "nG2"],
  dirt: ["tD", "nD"],
  rock: ["tR1", "nR1"],
  rockAlt: ["tR2", "nR2"],
};

/*
 * El grado del pasto (AC41, `WorldLook.ground.grassGrade`, uniforms uGrassLow, uGrassHigh y uSparseGain): de dónde a
 * dónde va el tono según el ruido grande. V6 iba de (0,34, 0,66, 0,13) a (0,62, 0,74, 0,17) con el ralo a 1,7, y el mapa
 * entero se leía mostaza. Medido en LG_GL=gpu, medium, t = 1 (amarillo entre los píxeles de terreno, tope 0,35): V6
 * 0,83; el primer grado de T6 (0,3, 0,64, 0,14)-(0,44, 0,7, 0,15) también 0,83 (el tonemapping y el sol cálido corren el
 * verde al amarillo); (0,2, 0,62, 0,18)-(0,3, 0,68, 0,2) 0,015 con el tono pegado a 72°; el de DEFAULT_LOOK, 0,012 con el
 * tono en 80-88°.
 */

/** Fragmento del color del suelo (reemplaza `color_fragment`); `vColor` es el color por vértice de buildTerrain. */
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

/** Normales de los mapas (reemplaza `normal_fragment_maps`), solo con `uNormOn` y los mapas cargados. */
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
 * El borde del mundo (open-world-3d M3, AC35, TERRAIN_APRON): después de la niebla, el color se funde al de la niebla
 * según la distancia (Chebyshev, la de la extensión) fuera de los límites caminables `uEdge`, de `uEdgeFade.x` a
 * `uEdgeFade.y` m. Usa `fogColor` del mismo `fog_fragment`, así el borde queda del color exacto del fondo y del horizonte.
 */
const EDGE_GLSL = /* glsl */ `#include <fog_fragment>
  #ifdef USE_FOG
    vec2 edgeOut = max(uEdge.xy - vWPos.xz, vWPos.xz - uEdge.zw);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(uEdgeFade.x, uEdgeFade.y, max(edgeOut.x, edgeOut.y)));
  #endif
`;

/** Límites caminables y distancias (m fuera de ellos) donde el suelo empieza y termina de fundirse a la niebla. */
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
  /** Centro (x, z), radio y encendido (0 a 1) de la cama de pasto; la mueve el pasto (world/nature/grass.ts, T8). */
  grassBed: Vector4;
  /**
   * Baja los mapas del tier y los pone en el material (una sola vez). Llamado después de `dispose` (el doble efecto de
   * StrictMode) lo revive: los mapas vuelven a subir a la GPU en el próximo cuadro.
   */
  loadMaps(renderer: WebGLRenderer): Promise<void>;
  /** Libera material y mapas; los mapas que llegan después (carga en curso) se liberan al llegar y no se asignan. */
  dispose(): void;
}

/** La url servida de un mapa del suelo (apps/web/public/textures/... → <base>textures/...). */
export const groundMapUrl = (map: GroundMap, kind: "diff" | "nor", base = "/"): string =>
  `${base}${groundTextureFile(map, kind).slice(TEXTURES_DIR.length - "textures".length)}`;

/** Los mapas que pide un tier con un look: los 5 difusos siempre, los 5 normales solo si el tier los usa. */
export function groundMapsFor(tier: WorldTier, look: WorldLook): { slot: GroundSlot; map: GroundMap; kind: "diff" | "nor" }[] {
  const kinds: ("diff" | "nor")[] = OPEN_WORLD_DENSITY[tier].groundNormals ? ["diff", "nor"] : ["diff"];
  return GROUND_SLOTS.flatMap((slot) => kinds.map((kind) => ({ slot, map: look.ground.maps[slot], kind })));
}

let ktx2: KTX2Loader | null = null;

/** El cargador KTX2 del mundo (uno solo: el suelo y, desde T7, la naturaleza), con el transcodificador autoalojado. */
export function ktx2Loader(renderer: WebGLRenderer): KTX2Loader {
  ktx2 ??= new KTX2Loader().setTranscoderPath(`${import.meta.env.BASE_URL}decoders/`).detectSupport(renderer);
  return ktx2;
}

/** El material del suelo del mundo abierto (uno por escena), con los mapas y el grado del look. */
export function groundMaterial(tier: WorldTier, look: WorldLook, edge: GroundEdge | null = null): GroundMaterial {
  const normals = OPEN_WORLD_DENSITY[tier].groundNormals;
  const material = tagMaterial(new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }), "terreno");
  const grassBed = new Vector4(0, 0, 1, 0);
  const uniforms: Record<string, { value: unknown }> = {
    uMaps: { value: 0 },
    uNormOn: { value: normals ? 1 : 0 },
    uGrassBed: { value: grassBed },
    // Sin borde, el fundido queda fuera de alcance (de 1e5 a 2e5 m; dos bordes distintos también en float32).
    uEdge: { value: edge ? new Vector4(edge.bounds.minX, edge.bounds.minZ, edge.bounds.maxX, edge.bounds.maxZ) : new Vector4() },
    uEdgeFade: { value: edge ? new Vector2(edge.fade[0], edge.fade[1]) : new Vector2(1e5, 2e5) },
    uGrassLow: { value: new Vector3(...look.ground.grassGrade.low) },
    uGrassHigh: { value: new Vector3(...look.ground.grassGrade.high) },
    uSparseGain: { value: look.ground.grassGrade.sparseGain },
    // T8 (D-839): el tinte de la cama de pasto es del look (`grass.bed`), como uniform.
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
        const maps = await Promise.all(groundMapsFor(tier, look).map(async ({ slot, map, kind }) => {
          const tex = await loader.loadAsync(groundMapUrl(map, kind, import.meta.env.BASE_URL));
          tex.wrapS = tex.wrapT = RepeatWrapping;
          tex.anisotropy = 4;
          if (kind === "diff") tex.colorSpace = SRGBColorSpace;
          tex.needsUpdate = true;
          return { name: SAMPLER[slot][kind === "diff" ? 0 : 1], tex };
        }));
        if (!alive) {
          // Liberado mientras bajaban (cambio de tier rápido): no se asignan; la próxima carga, si la hay, baja de nuevo.
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
      // El 1 × 1 de espera ya no está en los uniforms cuando llegaron los mapas, pero subió a la GPU en los primeros cuadros.
      fallback.dispose();
      material.dispose();
    },
  };
}
