// Open-world-3d T6 (plan v3 M3; D-819, D-823, D-828, D-832): the open-world dock without GPU. AC32 (the path
// has no gaps at any step), AC36 (relief from 2 to 8 m, slopes), AC37 (everything rests on `heightAt`, the ground
// raycast hits the mesh), AC38 (sky), AC40 (fog by zoom), AC42 (textures: KTX2 headers and memory per tier) and
// AC71 (the open-world material audit), and the half of AC35 that concerns the camera (t = 1 without void). The dock is U-GALEANO's, compiled in memory.
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
      // The AC's literals (2 to 8 m, 8 m of flat), not the constants under test (QA M3, finding 6).
      expect(lo).toBeGreaterThanOrEqual(2 - 0.05);
      expect(hi).toBeLessThanOrEqual(8 + 0.05);
      expect(hi - lo).toBeGreaterThan(3); // there is real relief
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
    // Along the center, every 0.25 m: the longest stretch with interpolated ground under 0.5.
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
    // Code props: each loose mesh at its base (the layout's `y` is 0).
    let props = 0;
    for (const b of d.boxes) {
      const m = scene.root.getObjectByName(b.asset);
      if (!(m instanceof Mesh) || m.position.x !== b.x || m.position.z !== b.z) continue;
      expect(Math.abs(m.position.y - (h(b.x, b.z) - PROP_SINK))).toBeLessThanOrEqual(0.05);
      props += 1;
    }
    expect(props).toBeGreaterThan(0);
    // Downward raycast at 20 random points (fixed seed) over the ground picker.
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

// LK6 (open-world-3d T7b): AC38 is a DEFAULT_LOOK rule (the sky horizon is the fog), not an engine one; it runs
// on an explicit DEFAULT_LOOK. A look from another universe may have another sky.
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
 * The corners of the ground seen on the whole map (t = 1) that fall outside the drawn ground, by aspect and yaw. The drawn
 * ground is the terrain extent plus the apron (open-world-3d M3, TERRAIN_APRON): the box of the
 * `terreno:delantal` mesh of the assembled scene is read (what is measured is what is drawn). The pivot at t = 1 is the center of the map
 * (pivotBlend 1), at THIRD_PERSON_VIEW.targetHeight above y = 0 (CameraRig: boundsCenter(bounds, 0)); the ground is measured on
 * the plane of the lowest vertex of what is drawn (the apron is below the skirt): a ray going down hits the
 * real ground before that plane. groundReach (rig.ts) is max(|x|, |z|) of these same corners.
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

/** AC35's aspects (QA M3): desktop, ultrawide and phone in both orientations. */
const AC35_ASPECTS = [16 / 10, 16 / 9, 2, 19.5 / 9, 21 / 9, 4 / 3, 3 / 4, 9 / 16, 9 / 19.5, 9 / 20];

describe("AC35: en el mapa entero (t = 1) el suelo que ve la cámara no pasa lo dibujado (falda y delantal)", () => {
  // Recorded change (open-world-3d M3, D-837): the test «registrado: 21:9 y
  // 9:19,5 pasan la falda solo en los yaws diagonales y por 30 m como mucho» was deleted, as it accepted the gap; the apron closes it.
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
    // The whole apron (from `overlap` m inside the extent) lies past the end of the fade.
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

  // QA M3 (finding 4): before, the test recomputed the fog smoothstep inside the test. Now it pins the
  // real path: the ground is a MeshStandardMaterial with fog, its shader keeps three's `fog_fragment`, which
  // mixes to `fogColor` with smoothstep(fogNear, fogFar, depth) (factor 1 at `far`), and the scene's fog color
  // is the look's (DEFAULT_LOOK: the dome's horizon, AC38).
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
    // With a header, the diffuse (ETC1S) counts the BC7 block bytes of its 11 levels: KTX2Loader's real target with
    // BPTC (recorded change M3, before 8-byte BC1; QA AC42).
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
    // Recorded change (open-world-3d T8, AC71, D-828): before, `pasto` <= 2 (the grass did not exist); now its two
    // materials (cards and real leaves), exactly 2.
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
      // The tiles plus the apron (open-world-3d M3, AC35).
      expect(tiles.children.length).toBe(OPEN_WORLD_DENSITY[tier].terrainTiles[0] * OPEN_WORLD_DENSITY[tier].terrainTiles[1] + 1);
      scene.dispose();
    }
  });
});
