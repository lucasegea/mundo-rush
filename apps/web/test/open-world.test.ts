// Open-world-3d T6 (plan v3 M3; D-819, D-823, D-828, D-832): el mundo abierto del muelle sin GPU. AC32 (el camino no
// tiene huecos a ningún paso), AC36 (relieve de 2 a 8 m, pendientes), AC37 (todo apoyado en `heightAt`, el raycast del
// suelo cae en la malla), AC38 (cielo), AC40 (niebla por zoom), AC42 (texturas: cabeceras KTX2 y memoria por tier) y
// AC71 (la auditoría de materiales del mundo abierto), y la mitad de AC35 que mira la cámara (t = 1 sin vacío). El muelle es el de U-GALEANO compilado en memoria.
import {
  DEFAULT_LOOK, GROUND_MAPS, groundTextureFile, OPEN_WORLD_DENSITY, parseKtx2Header, skyEstimate, TERRAIN_APRON, TIER_BUDGETS, WORLD_TIERS,
  type WorldTier,
} from "@lg/art";
import { Diorama as DioramaSchema, estimarPresupuestoDiorama } from "@lg/content-schema";
import { prepareDiorama, type DioramaLayout, type DioramaRuntime } from "@lg/core";
import { Box3, Color, Group, Mesh, MeshBasicMaterial, Raycaster, ShaderChunk, ShaderLib, Vector3 } from "three";
import { describe, expect, test } from "vitest";
import { buildBlobShadows } from "../src/world/actors/BlobShadows";
import { buildChibi } from "../src/world/actors/chibiModel";
import { frustumGroundFootprint } from "../src/world/camera/rig";
import { fitDistance, THIRD_PERSON_VIEW, thirdPersonFov, zoomPose } from "../src/world/camera/zoom";
import { estimateBudget } from "../src/world/budget/estimate";
import { estimateTextureMemory, openWorldTextureParts } from "../src/world/budget/textures";
import { farPlaneFor } from "../src/world/sky/palette";
import { labelAnchorY } from "../src/world/dioramas/Diorama";
import { ACTOR_LIFT, buildDioramaScene, PROP_SINK } from "../src/world/dioramas/scene";
import { createNameLabel } from "../src/world/labels/labelSprite";
import { auditMaterials, materialKind } from "../src/world/materials/registry";
import { tiltShiftOn } from "../src/world/post/tiltShift";
import { actorY, worldGround } from "../src/world/runtime";
import { fogFor } from "../src/world/sky/palette";
import { buildSky, domeColor } from "../src/world/sky/sky";
import { buildTerrain } from "../src/world/terrain/buildTerrain";
import { groundMapsFor, groundMapUrl } from "../src/world/terrain/groundMaterial";
import { compiledUniverseClientContent, lookOf } from "./helpers";

const SERVED = import.meta.glob("../public/textures/*.ktx2", { query: "?inline", import: "default", eager: true }) as Record<string, string>;
const fromDataUrl = (url: string): Uint8Array => Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0));

const layouts = compiledUniverseClientContent("U-GALEANO")["dioramas.json"] as DioramaLayout[];
const muelleLayout = (): DioramaLayout => {
  const l = layouts.find((d) => d.id === "muelle");
  if (!l) throw new Error("sin muelle");
  return l;
};
const muelle = (): DioramaRuntime => prepareDiorama(muelleLayout());
const terrainOf = (tier: WorldTier) => {
  const d = muelle();
  return { d, t: buildTerrain({ bounds: d.bounds, ground: d.ground, tier, look: DEFAULT_LOOK }) };
};

describe("AC36: relieve de 2 a 8 m, pendiente de 25° como mucho, de 8° como mucho en los llanos", () => {
  for (const tier of WORLD_TIERS) {
    test(`muelle en ${tier}, retícula de 1 m sobre los límites caminables`, () => {
      const { d, t } = terrainOf(tier);
      let lo = Infinity;
      let hi = -Infinity;
      let steepest = 0;
      let steepestPad = 0;
      const pads = d.ground.pads;
      const slopeDeg = (x: number, z: number): number => {
        const gx = (t.heightAt(x + 0.5, z) - t.heightAt(x - 0.5, z));
        const gz = (t.heightAt(x, z + 0.5) - t.heightAt(x, z - 0.5));
        return (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI;
      };
      for (let x = d.bounds.minX + 1; x <= d.bounds.maxX - 1; x += 1) {
        for (let z = d.bounds.minZ + 1; z <= d.bounds.maxZ - 1; z += 1) {
          const h = t.heightAt(x, z);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
          const s = slopeDeg(x, z);
          steepest = Math.max(steepest, s);
          if (pads.some(([px, pz]) => Math.hypot(x - px, z - pz) <= 8)) steepestPad = Math.max(steepestPad, s);
        }
      }
      // Los literales del AC (2 a 8 m, 8 m de llano), no las constantes que se prueban (QA M3, hallazgo 6).
      expect(lo).toBeGreaterThanOrEqual(2 - 0.05);
      expect(hi).toBeLessThanOrEqual(8 + 0.05);
      expect(hi - lo).toBeGreaterThan(3); // hay relieve de verdad
      expect(steepest).toBeLessThanOrEqual(25);
      expect(steepestPad).toBeLessThanOrEqual(8);
    });
  }
});

describe("AC32: un camino de 3 m en low no tiene huecos", () => {
  test("todo vértice a 1,5 m o menos del centro pesa 0,5 o más, y ningún tramo sin tierra es más largo que una celda", () => {
    const base = muelleLayout();
    const layout: DioramaLayout = { ...base, caminos: [{ puntos: [[-50, -20], [-20, -5], [10, -10], [40, 10]], ancho: 3 }] };
    const d = prepareDiorama(layout);
    const t = buildTerrain({ bounds: d.bounds, ground: d.ground, tier: "low", look: DEFAULT_LOOK });
    const road = d.ground.paths[0]?.line ?? [];
    const near: number[] = [];
    for (let k = 0; k < t.dirt.length; k++) {
      const x = t.positions[k * 3] as number;
      const z = t.positions[k * 3 + 2] as number;
      let best = Infinity;
      for (let i = 0; i < road.length - 1; i++) {
        const a = road[i] as { x: number; z: number };
        const b = road[i + 1] as { x: number; z: number };
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const u = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
        best = Math.min(best, Math.hypot(x - a.x - dx * u, z - a.z - dz * u));
      }
      if (best <= 1.5) near.push(t.dirt[k] as number);
    }
    expect(near.length).toBeGreaterThan(10);
    expect(Math.min(...near)).toBeGreaterThanOrEqual(0.5);
    // A lo largo del centro, cada 0,25 m: el tramo más largo con tierra interpolada bajo 0,5.
    let gap = 0;
    let worst = 0;
    for (let i = 0; i < road.length - 1; i++) {
      const a = road[i] as { x: number; z: number };
      const b = road[i + 1] as { x: number; z: number };
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let s = 0; s < len; s += 0.25) {
        const w = t.dirtAt(a.x + ((b.x - a.x) * s) / len, a.z + ((b.z - a.z) * s) / len);
        gap = w < 0.5 ? gap + 0.25 : 0;
        worst = Math.max(worst, gap);
      }
    }
    expect(worst).toBeLessThanOrEqual(t.step);
  });
});

describe("AC37: actores, etiquetas, props y árboles sobre `heightAt`; el clic del suelo cae en la malla", () => {
  test("muelle en low", () => {
    const d = muelle();
    const scene = buildDioramaScene(d, "reduced", "low");
    const h = scene.terrain.heightAt;
    worldGround.heightAt = h;
    worldGround.lift = ACTOR_LIFT;
    try {
      for (const p of [d.spawn, ...d.npcs]) {
        expect(Math.abs(actorY(p.x, p.z) - (h(p.x, p.z) + ACTOR_LIFT))).toBeLessThanOrEqual(0.05);
        expect(labelAnchorY(h, ACTOR_LIFT, p.x, p.z)).toBeGreaterThan(h(p.x, p.z));
      }
    } finally {
      worldGround.heightAt = () => 0;
      worldGround.lift = 0;
    }
    // Props por código: cada malla suelta en su base (la `y` del layout es 0).
    let props = 0;
    for (const b of d.boxes) {
      const m = scene.root.getObjectByName(b.asset);
      if (!(m instanceof Mesh) || m.position.x !== b.x || m.position.z !== b.z) continue;
      expect(Math.abs(m.position.y - (h(b.x, b.z) - PROP_SINK))).toBeLessThanOrEqual(0.05);
      props += 1;
    }
    expect(props).toBeGreaterThan(0);
    // Raycast hacia abajo en 20 puntos al azar (semilla fija) sobre el selector del suelo.
    const picker = scene.picker;
    expect(picker).not.toBeNull();
    scene.root.updateMatrixWorld(true);
    const ray = new Raycaster();
    let seed = 7;
    const rand = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 20; i++) {
      const x = d.bounds.minX + rand() * (d.bounds.maxX - d.bounds.minX);
      const z = d.bounds.minZ + rand() * (d.bounds.maxZ - d.bounds.minZ);
      ray.set(new Vector3(x, 200, z), new Vector3(0, -1, 0));
      const hits = ray.intersectObject(picker as never, false);
      expect(hits.length, `${x},${z}`).toBeGreaterThan(0);
      expect(hits[0]?.object).toBe(picker);
      expect(Math.abs((hits[0]?.point.y ?? NaN) - h(x, z))).toBeLessThanOrEqual(0.05);
    }
    scene.dispose();
  });
});

// LK6 (open-world-3d T7b): AC38 es una regla de DEFAULT_LOOK (el horizonte del cielo es la niebla), no del motor; corre
// sobre DEFAULT_LOOK explícito. Un look de otro universo puede tener otro cielo.
describe("AC38 (DEFAULT_LOOK): cielo de degradé cuyo horizonte es la niebla", () => {
  const SKY = DEFAULT_LOOK.sky;
  test("cénit, bruma y horizonte distintos; el horizonte es el token de la niebla; la cúpula pinta horizonte abajo", () => {
    expect(new Set([SKY.zenith, SKY.haze, SKY.horizon]).size).toBe(3);
    expect(DEFAULT_LOOK.fog.color).toBe(SKY.horizon);
    expect(DEFAULT_LOOK.background).toBe(SKY.horizon);
    expect(domeColor(SKY, -0.5).getHex()).toBe(new Color(DEFAULT_LOOK.fog.color).getHex());
    expect(domeColor(SKY, 1).getHex()).toBe(new Color(SKY.zenith).getHex());
  });

  for (const tier of WORLD_TIERS) {
    test(`${tier}: llamadas del cielo (1 en low, 2 si hay nubes), clases cielo y nube, sin profundidad ni niebla`, () => {
      const sky = buildSky(tier, DEFAULT_LOOK);
      const e = estimateBudget([sky.group]);
      expect(e).toEqual(skyEstimate(tier));
      expect(e.drawCalls).toBe(tier === "low" ? 1 : 2);
      const dome = sky.dome.material as MeshBasicMaterial;
      expect(materialKind(dome)).toBe("cielo");
      expect([dome.depthWrite, dome.fog]).toEqual([false, false]);
      if (sky.clouds) expect(materialKind(sky.clouds.material as MeshBasicMaterial)).toBe("nube");
      sky.follow(3, 4, 5, 1, true);
      expect(sky.dome.position.toArray()).toEqual([3, 4, 5]);
      sky.dispose();
    });
  }
});

/**
 * Las esquinas del suelo visto en el mapa entero (t = 1) que caen fuera del suelo dibujado, por aspecto y yaw. El suelo
 * dibujado es la extensión del terreno más el delantal (open-world-3d M3, TERRAIN_APRON): se lee la caja de la malla
 * `terreno:delantal` de la escena armada (lo medido es lo dibujado). El pivote en t = 1 es el centro del mapa
 * (pivotBlend 1), a THIRD_PERSON_VIEW.targetHeight sobre y = 0 (CameraRig: boundsCenter(bounds, 0)); el suelo se mide en
 * el plano del vértice más bajo de lo dibujado (el delantal está debajo de la falda): un rayo que baja choca con el
 * suelo real antes que con ese plano. groundReach (rig.ts) es max(|x|, |z|) de estas mismas esquinas.
 */
function voidCorners(aspects: readonly number[], yawStep: number): { out: { aspect: number; yaw: number; past: number }[]; ext: string } {
  const d = muelle();
  const scene = buildDioramaScene(d, "reduced", "low");
  const apron = scene.root.getObjectByName("terreno:delantal") as Mesh | undefined;
  expect(apron, "el delantal está en la escena").toBeDefined();
  expect(materialKind((apron as Mesh).material as MeshBasicMaterial), "el delantal usa el material del suelo").toBe("terreno");
  const box = new Box3().setFromObject(apron as Mesh);
  const ext = { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z };
  expect(ext.maxX - scene.terrain.extent.maxX).toBe(TERRAIN_APRON.width);
  let groundMin = box.min.y;
  for (let i = 1; i < scene.terrain.positions.length; i += 3) groundMin = Math.min(groundMin, scene.terrain.positions[i] ?? Infinity);
  scene.dispose();
  const cx = (d.bounds.minX + d.bounds.maxX) / 2;
  const cz = (d.bounds.minZ + d.bounds.maxZ) / 2;
  const out: { aspect: number; yaw: number; past: number }[] = [];
  for (const aspect of aspects) {
    for (let yaw = 0; yaw < 360; yaw += yawStep) {
      const pose = zoomPose(1, fitDistance(yaw, aspect, d.bounds), THIRD_PERSON_VIEW.overviewPitchDeg);
      expect(pose.pivotBlend).toBe(1);
      const fp = frustumGroundFootprint([0, THIRD_PERSON_VIEW.targetHeight - groundMin, 0], pose.pitchDeg, yaw, pose.distance, thirdPersonFov(aspect), aspect);
      expect(fp, `yaw ${yaw}: el horizonte no entra en t = 1`).not.toBeNull();
      for (const [x, z] of fp ?? []) {
        const past = Math.max(ext.minX - (cx + x), cx + x - ext.maxX, ext.minZ - (cz + z), cz + z - ext.maxZ);
        if (past > 0) out.push({ aspect, yaw, past });
      }
    }
  }
  return { out, ext: `x ${ext.minX}..${ext.maxX}, z ${ext.minZ}..${ext.maxZ}` };
}

/** Los aspectos de AC35 (QA M3): escritorio, ultra ancho y teléfono en las dos orientaciones. */
const AC35_ASPECTS = [16 / 10, 16 / 9, 2, 19.5 / 9, 21 / 9, 4 / 3, 3 / 4, 9 / 16, 9 / 19.5, 9 / 20];

describe("AC35: en el mapa entero (t = 1) el suelo que ve la cámara no pasa lo dibujado (falda y delantal)", () => {
  // Cambio registrado (open-world-3d M3, D-837): se borró la prueba «registrado: 21:9 y
  // 9:19,5 pasan la falda solo en los yaws diagonales y por 30 m como mucho», que aceptaba el hueco; el delantal lo cierra.
  test("16:10, 16:9, 2:1, 19,5:9, 21:9, 4:3, 3:4, 9:16, 9:19,5 y 9:20, yaw cada 15°: ninguna esquina cae fuera", () => {
    const r = voidCorners(AC35_ASPECTS, 15);
    expect(r.out, r.ext).toEqual([]);
  });

  test("teeth: sin el delantal (solo la extensión de la falda), 21:9 y 9:19,5 en yaw diagonal sí caen fuera", () => {
    const d = muelle();
    const t = buildTerrain({ bounds: d.bounds, ground: d.ground, tier: "low", look: DEFAULT_LOOK });
    const cx = (d.bounds.minX + d.bounds.maxX) / 2;
    const cz = (d.bounds.minZ + d.bounds.maxZ) / 2;
    let groundMin = Infinity;
    for (let i = 1; i < t.positions.length; i += 3) groundMin = Math.min(groundMin, t.positions[i] ?? Infinity);
    let worst = 0;
    for (const aspect of [21 / 9, 9 / 19.5]) {
      const pose = zoomPose(1, fitDistance(45, aspect, d.bounds), THIRD_PERSON_VIEW.overviewPitchDeg);
      const fp = frustumGroundFootprint([0, THIRD_PERSON_VIEW.targetHeight - groundMin, 0], pose.pitchDeg, 45, pose.distance, thirdPersonFov(aspect), aspect) ?? [];
      for (const [x, z] of fp) worst = Math.max(worst, t.extent.minX - (cx + x), cx + x - t.extent.maxX, t.extent.minZ - (cz + z), cz + z - t.extent.maxZ);
    }
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThan(TERRAIN_APRON.width);
  });

  test("el suelo se funde a la niebla al llegar al borde de la falda y el delantal es todo color de niebla", () => {
    const d = muelle();
    const scene = buildDioramaScene(d, "reduced", "low");
    const g = scene.ground;
    expect(g).not.toBeNull();
    const sh = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
    (g as NonNullable<typeof g>).material.onBeforeCompile(sh as never, null as never);
    expect(sh.fragmentShader).toContain("mix(gl_FragColor.rgb, fogColor, smoothstep(uEdgeFade.x, uEdgeFade.y");
    const edge = (sh.uniforms["uEdge"]?.value as { toArray(): number[] }).toArray();
    expect(edge).toEqual([d.bounds.minX, d.bounds.minZ, d.bounds.maxX, d.bounds.maxZ]);
    const [f0, f1] = (sh.uniforms["uEdgeFade"]?.value as { toArray(): number[] }).toArray() as [number, number];
    const skirt = scene.terrain.extent.maxX - d.bounds.maxX;
    expect([f0, f1]).toEqual([skirt - TERRAIN_APRON.fade[0], skirt - TERRAIN_APRON.fade[1]]);
    // Todo el delantal (desde `overlap` m adentro de la extensión) queda pasado el final del fundido.
    expect(skirt - TERRAIN_APRON.overlap).toBeGreaterThanOrEqual(f1);
    scene.dispose();
  });
});

describe("AC40: la niebla sigue al zoom y al tier", () => {
  test("near < far <= plano lejano, low la más corta en todo t, y el color a `far` es el de la niebla", () => {
    for (const t of [0, 0.5, 1]) {
      const fogs = WORLD_TIERS.map((tier) => fogFor(DEFAULT_LOOK.fog.range, OPEN_WORLD_DENSITY[tier].fogScale, t));
      for (const f of fogs) {
        expect(f.near).toBeLessThan(f.far);
        expect(f.far).toBeLessThanOrEqual(farPlaneFor(t));
      }
      const [low, medium, high] = fogs as [{ far: number; near: number }, { far: number; near: number }, { far: number; near: number }];
      expect(low.far).toBeLessThan(medium.far);
      expect(low.far).toBeLessThan(high.far);
      expect(low.near).toBeLessThan(Math.min(medium.near, high.near));
    }
  });

  // QA M3 (hallazgo 4): antes la prueba recalculaba el smoothstep de la niebla adentro de la prueba. Ahora fija el
  // camino real: el suelo es un MeshStandardMaterial con niebla, su sombreador conserva `fog_fragment` de three, que
  // mezcla al `fogColor` con smoothstep(fogNear, fogFar, profundidad) (factor 1 en `far`), y el color de la niebla de la
  // escena es la del look (DEFAULT_LOOK: el horizonte de la cúpula, AC38).
  test("la loma lejana en `far` toma el color de la niebla: el suelo pasa por fog_fragment de three con fog: true", () => {
    expect(ShaderChunk.fog_fragment).toMatch(/smoothstep\(\s*fogNear,\s*fogFar,\s*vFogDepth\s*\)/);
    expect(ShaderChunk.fog_fragment).toMatch(/mix\(\s*gl_FragColor\.rgb,\s*fogColor,\s*fogFactor\s*\)/);
    const scene = buildDioramaScene(muelle(), "reduced", "low");
    const g = scene.ground as NonNullable<typeof scene.ground>;
    expect(g.material.fog).toBe(true);
    const sh = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
    g.material.onBeforeCompile(sh as never, null as never);
    expect(sh.fragmentShader).toContain("#include <fog_fragment>");
    expect(sh.vertexShader).toContain("#include <fog_vertex>");
    scene.dispose();
    expect(scene.look).toBe(DEFAULT_LOOK);
    expect(new Color(DEFAULT_LOOK.fog.color).getHex()).toBe(domeColor(DEFAULT_LOOK.sky, 0).getHex());
  });

  test("D-823: el tilt-shift no va en thirdPerson", () => {
    expect(tiltShiftOn("thirdPerson")).toBe(false);
    expect(tiltShiftOn("perspective3D")).toBe(true);
    expect(tiltShiftOn("dialogueFrame")).toBe(true);
  });
});

describe("AC42: los mapas del suelo son .ktx2 y la memoria de texturas sale de sus cabeceras", () => {
  const headers = Object.fromEntries(GROUND_MAPS.flatMap((m) => (["diff", "nor"] as const).map((k) => {
    const file = groundTextureFile(m, k);
    const url = SERVED[`../public/${file.slice("apps/web/public/".length)}`];
    if (!url) throw new Error(`falta ${file}`);
    return [file, parseKtx2Header(fromDataUrl(url))];
  })));

  test("cada mapa del suelo es ETC1S, con mips, difusos de 1024 y normales de 512", () => {
    for (const [file, h] of Object.entries(headers)) {
      expect(h.format, file).toBe("etc1s");
      expect(h.width).toBe(file.endsWith("-diff.ktx2") ? 1024 : 512);
      expect(h.levels).toBe(file.endsWith("-diff.ktx2") ? 11 : 10);
    }
    expect(groundMapsFor("low", DEFAULT_LOOK).every((m) => m.kind === "diff")).toBe(true);
    expect(groundMapsFor("high", DEFAULT_LOOK).length).toBe(10);
    expect(groundMapUrl("leafy_grass", "diff", "/")).toBe("/textures/leafy-grass-diff.ktx2");
  });

  test("estimateTextureMemory cuenta todo el mundo abierto por tier dentro de 24 / 48 / 96 MB", () => {
    for (const tier of WORLD_TIERS) {
      const labels = [{ width: 300, height: 58 }, { width: 300, height: 58 }, { width: 300, height: 58 }];
      const e = estimateTextureMemory({ labels, bubbles: 3, shadowMap: tier === "high", openWorld: { tier, look: DEFAULT_LOOK, headers } });
      expect(e.mb, `${tier}: ${JSON.stringify(e.parts)}`).toBeLessThanOrEqual(TIER_BUDGETS[tier].maxTextureMb);
      for (const id of ["suelo/leafy_grass-diff", "impostores", "pasto/atlas", "pasto/altura"]) expect(e.parts[id], id).toBeGreaterThan(0);
    }
    // Con cabecera, el difuso (ETC1S) cuenta los bytes de bloque BC7 de sus 11 niveles: el destino real de KTX2Loader con
    // BPTC (cambio registrado M3, antes BC1 de 8 bytes; QA AC42).
    const diff = openWorldTextureParts("low", DEFAULT_LOOK, headers)["suelo/leafy_grass-diff"] as number;
    let bc7 = 0;
    for (let l = 0; l < 11; l++) bc7 += Math.ceil(Math.max(1, 1024 >> l) / 4) ** 2 * 16;
    expect(diff).toBe(bc7);
  });
});

describe("AC71: la auditoría de materiales del mundo abierto (cambio registrado, D-828)", () => {
  test("muelle en high, con el jugador, sombras blob y una etiqueta: nada fuera de la lista y cada clase en su tope", () => {
    const d = muelle();
    const scene = buildDioramaScene(d, "full", "high");
    const all = new Group();
    all.add(scene.root, buildChibi(lookOf("player")).root, buildBlobShadows(scene.blobAnchors, scene.terrain.heightAt), createNameLabel("Mitayo", true));
    const a = auditMaterials(all);
    expect(a.unknown).toEqual([]);
    expect(a.byKind.toon).toBeLessThanOrEqual(4);
    expect(a.byKind.terreno).toBe(1);
    expect(a.byKind.cielo).toBe(1);
    expect(a.byKind.nube).toBeLessThanOrEqual(1);
    expect(a.byKind.agua).toBeLessThanOrEqual(1);
    expect(a.byKind.follaje).toBeLessThanOrEqual(4);
    expect(a.byKind.impostor).toBeLessThanOrEqual(5);
    // Cambio registrado (open-world-3d T8, AC71, D-828): antes `pasto` <= 2 (el pasto no existía); ahora sus dos
    // materiales (tarjetas y hojas reales), exactamente 2.
    expect(a.byKind.pasto).toBe(2);
    expect(a.surfaceInstances).toBeLessThanOrEqual(17);
    scene.dispose();
  });

  test("el estimador de validate:content cuenta las baldosas del terreno y el cielo como el grafo, en cada tier", () => {
    const src = DioramaSchema.parse(muelleLayout());
    for (const tier of WORLD_TIERS) {
      const e = estimarPresupuestoDiorama(src, { registro: new Map(), apariencias: new Map() }, tier);
      const scene = buildDioramaScene(muelle(), tier === "low" ? "reduced" : "full", tier);
      const tiles = scene.root.getObjectByName("terreno") as Group;
      expect(estimateBudget([tiles])).toEqual(e.partes["terreno"]);
      expect(estimateBudget([scene.sky?.group as Group])).toEqual(e.partes["cielo"]);
      // Las baldosas más el delantal (open-world-3d M3, AC35).
      expect(tiles.children.length).toBe(OPEN_WORLD_DENSITY[tier].terrainTiles[0] * OPEN_WORLD_DENSITY[tier].terrainTiles[1] + 1);
      scene.dispose();
    }
  });
});
