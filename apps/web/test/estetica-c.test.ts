// Plan estetica-c M1 (D-207): the pure parts of look C in world/, no GPU (D-016). Long-lens camera (A1),
// invisible edge (A2), terrain (A3), single material (A4), bevel (A5), props (A6), two-person shot (A8), labels (A12),
// estimated budget (A15) and the palette as the only source of hex values. What lives in the store (A7, A9, A10, A13) is
// in map.test.tsx over the real map.
import {
  CAMERA_PRESET_IDS, cellCenter, circleBlocked, isWalkable, prepareDiorama, presetAngles, zoomDistance, ZOOM_DISTANCES,
  type DioramaLayout, type DioramaRuntime,
} from "@lg/core";
import { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, NearestFilter, Sprite, type SpriteMaterial } from "three";
import { describe, expect, test } from "vitest";
import { pickDiorama } from "../src/services/content";
import { buildBlobShadows } from "../src/world/actors/BlobShadows";
import { buildChibi, CHIBI_HEAD_TOP, HEAD_RADIUS, CHIBI_SCALE } from "../src/world/actors/chibiModel";
import { fallbackLook } from "../src/world/actors/looks";
import { estimateBudget, withinBudget } from "../src/world/budget/estimate";
import { CAMERA_RIG_PRESETS } from "../src/world/camera/presets";
import {
  cameraClip, cameraOffset, FAR_MARGIN, frustumGroundFootprint, groundReach, PERSPECTIVE, perspectiveFov, shortestYawDelta,
  TWO_SHOT, twoShotCandidates, twoShotFrame, viewScale, VIEW_REFERENCE_DISTANCE, type Obstacle,
} from "../src/world/camera/rig";
import { buildDioramaScene } from "../src/world/dioramas/scene";
import { LABEL_HIDE_DISTANCE, labelEntries, LABEL_STYLES, labelVisibleAt } from "../src/world/labels/labels";
import { createNameLabel } from "../src/world/labels/labelSprite";
// Recorded change (open-world-3d T7b, D-838/D-839): SUN, HEMI, FOG, TONE and BACKGROUND moved to the look (`WorldLook.light`,
// `fog`, `background` of @lg/art) and D-208's distance `fogFor` was merged into the zoom one (world/sky/palette.ts).
import { SUN_SHADOW, sunShadowFor } from "../src/world/lighting/params";
import { fogFor } from "../src/world/sky/palette";
import { zoomTAt } from "../src/world/camera/zoom";
import { TILT_SHIFT_BASE, tiltShiftFor } from "../src/world/post/tiltShift";
import { DEFAULT_LOOK, DENSITY, PAINTED_LOOK, SCENE_DENSITIES, hexToLinear, insidePolygon, LABEL_CONTRAST_MIN, polylineDistance, LABEL_CONTRAST_PAIRS, maxDihedralDeg, MAX_DIHEDRAL_DEG, paintColors, PAINT_DEFAULTS, PALETTE, tokenRgb } from "@lg/art";
import { auditMaterials, materialKind, tagMaterial, toonMaterial, WORLD_MATERIAL_KINDS } from "../src/world/materials/registry";
import { BRUSH_MAX, BRUSH_MIN, BRUSH_SIZE, brushPixels, brushTexture, toonRamp, toonRampData, TOON_BANDS } from "../src/world/materials/toon";
import { buildProp, PROP_BUILDERS } from "../src/world/props/builders";
import type { CodePropAsset } from "@lg/art";
import { buildTerrain, TERRAIN_SKIRT } from "../src/world/terrain/buildTerrain";
import { setWaterFog, tickWater, waterMaterial } from "../src/world/water/waterMaterial";
import { compiledClientContent, contentLooks, lookOf } from "./helpers";

const layout = (): DioramaLayout => pickDiorama(compiledClientContent()["dioramas.json"], "test");
const testDiorama = (): DioramaRuntime => prepareDiorama(layout());
/** 16:9, 21:9, 4:3 and two portrait ones (9:16 and a phone's, 9:19.5). */
const ASPECTS = [16 / 9, 21 / 9, 4 / 3, 9 / 16, 9 / 19.5];
/** The longest ray from a screen corner to the ground (m), with the game camera at that distance. */
const longestRay = (dist: number, aspect: number, pitchDeg = 50): number => {
  const fov = perspectiveFov(aspect);
  const off = cameraOffset(pitchDeg, 0, dist);
  const cam = [off[0], PERSPECTIVE.targetHeight + off[1], off[2]] as const;
  const fp = frustumGroundFootprint([0, PERSPECTIVE.targetHeight, 0], pitchDeg, 0, dist, fov, aspect) ?? [];
  return Math.max(...fp.map(([x, z]) => Math.hypot(x - cam[0], cam[1], z - cam[2])));
};

const walkableCenters = (d: DioramaRuntime): { x: number; z: number }[] => {
  const out: { x: number; z: number }[] = [];
  for (let row = 0; row < d.grid.rows; row++) {
    for (let col = 0; col < d.grid.cols; col++) if (isWalkable(d.grid, col, row)) out.push(cellCenter(d.grid, col, row));
  }
  return out;
};

describe("A1 cámara de lente largo (perspective3D)", () => {
  test("50° / 45°, escalera de 160 a 22 m (D-208), FOV 30 o 40,5 y registro implementado", () => {
    expect(presetAngles("perspective3D")).toEqual({ pitchDeg: 50, yawDeg: 45 });
    expect(zoomDistance(ZOOM_DISTANCES.length - 1)).toBe(22);
    expect(zoomDistance(0)).toBe(160);
    expect(ZOOM_DISTANCES).toContain(30);
    expect(perspectiveFov(16 / 9)).toBe(30);
    expect(perspectiveFov(1)).toBe(30);
    expect(perspectiveFov(9 / 16)).toBe(40.5);
    expect(Object.keys(CAMERA_RIG_PRESETS).sort()).toEqual([...CAMERA_PRESET_IDS].sort());
    expect(CAMERA_RIG_PRESETS.perspective3D).toBe("implemented");
    expect(PERSPECTIVE.targetHeight).toBe(0.8);
    expect(PERSPECTIVE.followRate).toBe(5);
  });

  test("cameraOffset(50, 45, d) es la fórmula del mockup", () => {
    for (const d of ZOOM_DISTANCES) {
      const p = (50 * Math.PI) / 180;
      const y = (45 * Math.PI) / 180;
      const [x, h, z] = cameraOffset(50, 45, d);
      expect(x).toBeCloseTo(d * Math.cos(p) * Math.sin(y), 9);
      expect(h).toBeCloseTo(d * Math.sin(p), 9);
      expect(z).toBeCloseTo(d * Math.cos(p) * Math.cos(y), 9);
    }
  });
});

describe("A2 borde invisible: la cámara nunca ve más allá del terreno", () => {
  test("para cada celda caminable, cada zoom y aspectos 16:9, 21:9, 4:3, 9:16 y 9:19,5, la huella cae dentro del terreno", () => {
    const d = testDiorama();
    const { extent } = buildTerrain({ bounds: d.bounds, ground: d.ground, look: PAINTED_LOOK });
    const { pitchDeg, yawDeg } = presetAngles("perspective3D");
    let checked = 0;
    for (const c of walkableCenters(d)) {
      for (const dist of ZOOM_DISTANCES) {
        for (const aspect of ASPECTS) {
          const fp = frustumGroundFootprint([c.x, PERSPECTIVE.targetHeight, c.z], pitchDeg, yawDeg, dist, perspectiveFov(aspect), aspect);
          expect(fp, `${c.x},${c.z} a ${dist} m`).not.toBeNull();
          for (const [x, z] of fp ?? []) {
            if (x < extent.minX || x > extent.maxX || z < extent.minZ || z > extent.maxZ) {
              throw new Error(`se ve el borde desde ${c.x},${c.z} a ${dist} m, aspecto ${aspect.toFixed(2)}: ${x.toFixed(1)},${z.toFixed(1)}`);
            }
          }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  test("teeth: con un terreno sin falda la huella se sale", () => {
    const d = testDiorama();
    const fp = frustumGroundFootprint([d.bounds.maxX, 0.8, d.bounds.maxZ], 50, 45, 40, 30, 21 / 9) ?? [];
    expect(fp.some(([x, z]) => x > d.bounds.maxX + 1 || z > d.bounds.maxZ + 1)).toBe(true);
  });

  test("D-208: la falda cubre el alcance de la huella al zoom más lejano en todo aspecto; la de M1 (48 m) no", () => {
    const { pitchDeg, yawDeg } = presetAngles("perspective3D");
    const far = zoomDistance(0);
    const reach = Math.max(...ASPECTS.map((a) => groundReach(far, pitchDeg, yawDeg, perspectiveFov(a), a)));
    expect(reach).toBeLessThan(TERRAIN_SKIRT);
    expect(reach).toBeGreaterThan(48);
    // Closer, less reach (and the 40 m one, M1's far plane, fell inside the old skirt).
    const reaches = ZOOM_DISTANCES.map((dist) => groundReach(dist, pitchDeg, yawDeg, 30, 21 / 9));
    for (let i = 1; i < reaches.length; i++) expect(reaches[i] as number).toBeLessThan(reaches[i - 1] as number);
    expect(groundReach(40, pitchDeg, yawDeg, 30, 21 / 9)).toBeLessThan(48);
    // With the horizon in view there is no finite reach.
    expect(groundReach(30, 5, 45, 30, 16 / 9)).toBe(Infinity);
  });

  test("D-208: el plano lejano cubre con margen el rayo más largo al suelo en cada zoom y aspecto", () => {
    const { pitchDeg } = presetAngles("perspective3D");
    for (const dist of ZOOM_DISTANCES) {
      for (const aspect of ASPECTS) {
        const fov = perspectiveFov(aspect);
        const { near, far } = cameraClip(dist, pitchDeg, fov, aspect);
        expect(far, `${dist} m, ${aspect.toFixed(2)}`).toBeGreaterThanOrEqual(longestRay(dist, aspect, pitchDeg) * FAR_MARGIN);
        expect(far).toBeGreaterThanOrEqual(PERSPECTIVE.far);
        // The closest thing visible (the bottom corner) stays well away from the near plane.
        expect(near).toBeLessThan(0.5 * dist);
        expect(near).toBeGreaterThanOrEqual(PERSPECTIVE.near);
      }
    }
    expect(cameraClip(30, pitchDeg, 30, 16 / 9)).toEqual({ near: PERSPECTIVE.near, far: PERSPECTIVE.far });
    expect(cameraClip(160, pitchDeg, 30, 16 / 9).far).toBeGreaterThan(250);
    // Vertical two-person shot: the horizon is visible, the far plane stays the usual one.
    expect(cameraClip(TWO_SHOT.distance, TWO_SHOT.pitchDeg, 40.5, 9 / 16).far).toBe(PERSPECTIVE.far);
  });
});

describe("A3 terreno por alturas (test.yaml en el formato de la maqueta; plan estetica-c M7 retiró el adaptador de tiles)", () => {
  const d = testDiorama();
  const t = buildTerrain({ bounds: d.bounds, ground: d.ground, look: PAINTED_LOOK });

  test("toda celda caminable tiene altura 0 en su centro; toda celda del estanque está por debajo de 0", () => {
    for (const c of walkableCenters(d)) expect(Math.abs(t.heightAt(c.x, c.z)), `${c.x},${c.z}`).toBeLessThanOrEqual(1e-6);
    const pond = d.ground.ponds[0];
    if (!pond) throw new Error("test.yaml sin estanque");
    let water = 0;
    for (let row = 0; row < d.grid.rows; row++) {
      for (let col = 0; col < d.grid.cols; col++) {
        const p = cellCenter(d.grid, col, row);
        if (!insidePolygon(p.x, p.z, pond)) continue;
        water++;
        expect(t.heightAt(p.x, p.z), `${p.x},${p.z}`).toBeLessThan(0);
      }
    }
    expect(water).toBeGreaterThan(0);
  });

  test("malla continua: ningún punto xz repetido; fuera de los límites sube en lomas", () => {
    const seen = new Map<string, number>();
    for (let v = 0; v < t.positions.length / 3; v++) {
      const k = `${t.positions[v * 3]},${t.positions[v * 3 + 2]}`;
      expect(seen.has(k), k).toBe(false);
      seen.set(k, t.positions[v * 3 + 1] as number);
    }
    expect(t.heightAt(d.bounds.maxX + 30, d.bounds.maxZ + 30)).toBeGreaterThan(1);
    expect(Math.max(...Array.from({ length: t.positions.length / 3 }, (_, v) => t.positions[v * 3 + 1] as number))).toBeLessThanOrEqual(5.5 + 1e-6);
  });

  test("el color de los vértices bien adentro de un camino está dentro de la tolerancia de `camino` con el temblor", () => {
    const camino = tokenRgb("camino");
    const roads = d.ground.paths.filter((p) => p.surface === "camino");
    const others = d.ground.paths.filter((p) => p.surface !== "camino");
    expect(roads.length).toBeGreaterThan(0);
    let checked = 0;
    for (let v = 0; v < t.positions.length / 3; v++) {
      const x = t.positions[v * 3] as number;
      const z = t.positions[v * 3 + 2] as number;
      if (x < d.bounds.minX || x > d.bounds.maxX || z < d.bounds.minZ || z > d.bounds.maxZ) continue;
      if (!roads.some((p) => polylineDistance(x, z, p.line) < p.width / 2 - 0.5)) continue;
      if (others.some((p) => polylineDistance(x, z, p.line) < p.width / 2 + 0.5)) continue;
      for (let k = 0; k < 3; k++) expect(Math.abs((t.colors[v * 3 + k] as number) - (camino[k] as number)), `${x},${z}`).toBeLessThanOrEqual(0.08);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });

  test("determinística con la misma semilla; otra semilla cambia el color", () => {
    const again = buildTerrain({ bounds: d.bounds, ground: d.ground, look: PAINTED_LOOK });
    expect(again.positions).toEqual(t.positions);
    expect(again.colors).toEqual(t.colors);
    expect(buildTerrain({ bounds: d.bounds, ground: d.ground, seed: 99, look: PAINTED_LOOK }).colors).not.toEqual(t.colors);
  });
});

describe("A4 material único del mundo", () => {
  test("toonRamp da 150 / 195 / 232 / 255 con filtro nearest", () => {
    expect([...TOON_BANDS]).toEqual([150, 195, 232, 255]);
    const data = toonRampData();
    expect([0, 1, 2, 3].map((i) => data[i * 4])).toEqual([150, 195, 232, 255]);
    const r = toonRamp();
    expect(r.magFilter).toBe(NearestFilter);
    expect(r.minFilter).toBe(NearestFilter);
    expect(r.image.width).toBe(4);
  });

  test("brushTexture: 256 × 256, valores de 205 a 255, determinística", () => {
    const a = brushPixels(3);
    expect(a.length).toBe(BRUSH_SIZE * BRUSH_SIZE);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(BRUSH_MIN);
    expect(Math.max(...a)).toBeLessThanOrEqual(BRUSH_MAX);
    expect(Math.min(...a)).toBeLessThan(230); // there are patches
    expect(brushPixels(3)).toEqual(a);
    expect(brushPixels(4)).not.toEqual(a);
    const tex = brushTexture(3);
    expect([tex.image.width, tex.image.height]).toEqual([256, 256]);
    expect(tex.repeat.x).toBe(10);
  });

  test("el diorama de prueba usa a lo sumo 2 instancias de superficie (toon y agua) y ningún material fuera de la lista", () => {
    const scene = buildDioramaScene(testDiorama());
    const all = new Group();
    all.add(scene.root, buildChibi(lookOf("player")).root, buildBlobShadows(scene.blobAnchors), createNameLabel("Inés", true));
    const audit = auditMaterials(all);
    expect(audit.unknown).toEqual([]);
    expect(audit.surfaceInstances).toBeLessThanOrEqual(2);
    expect(audit.byKind.toon).toBe(1);
    expect(audit.byKind.agua).toBe(1);
    // Open-world-3d T6 (AC71, D-828): recorded change. The old assertion was the list of 4 classes ["toon", "agua",
    // "etiqueta", "sombra-blob"]; the list grows with the 6 of the open world. The cap of 2 surfaces of the farmer
    // diorama does not change (the open-world audit is in apps/web/test/open-world.test.ts, AC71).
    expect([...WORLD_MATERIAL_KINDS]).toEqual(["toon", "agua", "etiqueta", "sombra-blob", "terreno", "pasto", "follaje", "impostor", "cielo", "nube"]);
    const toon = toonMaterial();
    expect(toon.vertexColors).toBe(true);
    expect(toon.gradientMap).not.toBeNull();
    expect(toon.map).not.toBeNull();
  });

  test("teeth: un material sin marca, o con una marca fuera de la lista, aparece como desconocido", () => {
    const g = new Group();
    g.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
    expect(auditMaterials(g).unknown.length).toBe(1);
    const fifth = new MeshStandardMaterial();
    fifth.userData["lgMaterial"] = "metal";
    expect(materialKind(fifth)).toBeNull();
    expect(materialKind(tagMaterial(new MeshStandardMaterial(), "toon"))).toBe("toon");
  });

  test("color por vértice pintado: degradé vertical (abajo más oscuro) y temblor acotado, determinístico", () => {
    const pos = new Float32Array([0, 0, 0, 0, 1, 0, 0.5, 0, 0.5, 0.5, 1, 0.5]);
    const rgb = tokenRgb("muro");
    const flat = paintColors(pos, rgb, 1, { jitter: 0 });
    expect(flat[0] as number).toBeCloseTo((rgb[0] as number) * (1 - PAINT_DEFAULTS.bottomDark), 6);
    expect(flat[3] as number).toBeGreaterThan(flat[0] as number);
    const j = paintColors(pos, rgb, 1);
    const jFlat = paintColors(pos, rgb, 1, { jitter: 0 });
    for (let i = 0; i < j.length; i++) expect(Math.abs((j[i] as number) - (jFlat[i] as number))).toBeLessThanOrEqual(0.035 + 1e-6);
    expect(paintColors(pos, rgb, 1)).toEqual(j);
    expect(PAINT_DEFAULTS.bottomDark).toBeGreaterThanOrEqual(0.15);
    expect(PAINT_DEFAULTS.bottomDark).toBeLessThanOrEqual(0.35);
  });
});

describe("A5 regla del bisel", () => {
  test.each(Object.keys(PROP_BUILDERS))("%s: ningún diedro de 80° o más", (asset) => {
    const g = buildProp(asset, { w: 2, h: 2.4, d: 1.6 }, 1);
    const pos = g.getAttribute("position");
    expect(maxDihedralDeg(pos.array, g.index?.array ?? null)).toBeLessThan(MAX_DIHEDRAL_DEG);
  });

  test.each(Object.keys(PROP_BUILDERS))("%s en la densidad reducida de low (plan estetica-c M6): tampoco", (asset) => {
    const g = buildProp(asset, { w: 2, h: 2.4, d: 1.6 }, 1, undefined, "reduced");
    expect(maxDihedralDeg(g.getAttribute("position").array, g.index?.array ?? null)).toBeLessThan(MAX_DIHEDRAL_DEG);
  });

  test("los props del diorama de prueba, con sus tamaños reales, también (en las dos densidades)", () => {
    for (const b of testDiorama().boxes.filter((x) => x.asset.startsWith("codigo/"))) {
      const g = buildProp(b.asset, { w: b.w, h: b.h, d: b.d }, 0, undefined, "reduced");
      expect(maxDihedralDeg(g.getAttribute("position").array, g.index?.array ?? null), `reducido ${b.asset} ${b.w}×${b.h}×${b.d}`).toBeLessThan(MAX_DIHEDRAL_DEG);
    }

    // The `modelo/*` entries (M2 glTF) pass the rule in scripts/assets/optimize.ts or register it (bevel) in the registry.
    for (const b of testDiorama().boxes.filter((x) => x.asset.startsWith("codigo/"))) {
      const g = buildProp(b.asset, { w: b.w, h: b.h, d: b.d }, 0);
      expect(maxDihedralDeg(g.getAttribute("position").array, g.index?.array ?? null), `${b.asset} ${b.w}×${b.h}×${b.d}`).toBeLessThan(MAX_DIHEDRAL_DEG);
    }
  });

  test("el cuerpo del chibi tampoco tiene aristas duras (la cabeza lleva ojos y alas de sombrero finas a propósito)", () => {
    const c = buildChibi(lookOf("NPC-HARLAN"));
    for (const m of c.meshes.filter((x) => x !== c.head)) {
      expect(maxDihedralDeg(m.geometry.getAttribute("position").array, m.geometry.index?.array ?? null)).toBeLessThan(MAX_DIHEDRAL_DEG);
    }
  });

  test("teeth: un BoxGeometry común falla", () => {
    const g = new BoxGeometry(1, 1, 1);
    expect(maxDihedralDeg(g.getAttribute("position").array, g.index?.array ?? null)).toBeGreaterThanOrEqual(MAX_DIHEDRAL_DEG);
  });
});

describe("A6 props por código", () => {
  test("todo asset codigo/* de test.yaml tiene constructor; uno inexistente falla nombrándolo", () => {
    const props = layout().props ?? [];
    // Since M2 a prop is `codigo/*` (builder) or `modelo/*` (glTF with a registry entry; validate:content checks it).
    expect(props.every((p) => p.asset.startsWith("codigo/") || p.asset.startsWith("modelo/")), props.map((p) => p.asset).join(", ")).toBe(true);
    for (const p of props.filter((x) => x.asset.startsWith("codigo/"))) expect(PROP_BUILDERS[p.asset as CodePropAsset], p.asset).toBeTypeOf("function");
    expect(() => buildProp("codigo/inexistente", { w: 1, h: 1, d: 1 })).toThrow(/codigo\/inexistente/);
  });

  test("los árboles nuevos bloquean su huella en la grilla; sin ellos, ese lugar es caminable", () => {
    const l = layout();
    const trees = (l.props ?? []).filter((p) => p.asset === "codigo/arbol" || p.asset === "codigo/pino");
    // Since M5 repeated trees go as `instancias` of a single prop.
    const spots = trees.flatMap((p) => (p.instancias ? p.instancias.map((i) => i.pos) : p.pos ? [p.pos] : []));
    expect(spots.length).toBeGreaterThanOrEqual(8);
    const withTrees = prepareDiorama(l);
    const without = prepareDiorama({ ...l, props: (l.props ?? []).filter((p) => !trees.includes(p)) });
    for (const [x, , z] of spots) {
      expect(circleBlocked(withTrees.grid, x, z, 0.05)).toBe(true);
      expect(circleBlocked(without.grid, x, z, 0.05)).toBe(false);
    }
  });

  test("los repetidos van instanciados: una malla por tipo de árbol", () => {
    const scene = buildDioramaScene(testDiorama());
    const names: string[] = [];
    scene.root.traverse((o) => { if (o instanceof InstancedMesh) names.push(o.name); });
    expect(names.filter((n) => n.includes("arbol")).length).toBe(1);
    expect(names.filter((n) => n.includes("pino")).length).toBe(1);
  });
});

describe("A8 plano de a dos en 3/4", () => {
  const player = { x: 0, z: 2.6 };
  const npc = { x: 0, z: 0 };

  test("inclinación 20°, distancia 12,5 m, mira bajada 0,9 m; giro perpendicular más ~27° hacia la cara del NPC", () => {
    const f = twoShotFrame(player, npc, []);
    expect(f.pitchDeg).toBe(20);
    expect(f.distance).toBe(12.5);
    expect(f.target[1]).toBeCloseTo(TWO_SHOT.chestHeight - 0.9, 9);
    expect(f.target[0]).toBeCloseTo(0, 9);
    expect(f.target[2]).toBeCloseTo(1.3, 9);
    // The player-NPC line goes along z; the perpendicular is yaw ±90° and the shift brings the camera toward the player's side
    // (+z), which is where the NPC faces.
    expect(f.chosen.leanDeg).toBe(27);
    // Perpendicular of the chosen side: (-nz, nx) · side with n = (0, 1) from the NPC to the player, i.e. yaw ∓90°.
    expect(Math.abs(shortestYawDelta(f.chosen.side === 1 ? -90 : 90, f.yawDeg))).toBeCloseTo(27, 6);
    // Shift toward +z (the player's side, where the NPC faces).
    expect(cameraOffset(20, f.yawDeg, 12.5)[2]).toBeGreaterThan(0);
    expect(Math.abs(f.yawDeg)).toBeCloseTo(90 - 27, 6);
  });

  test("con un obstáculo en el lado preferido elige el otro lado", () => {
    const free = twoShotFrame(player, npc, []);
    const off = cameraOffset(20, free.yawDeg, 12.5);
    const mid = { x: free.target[0] + off[0] * 0.4, z: free.target[2] + off[2] * 0.4 };
    const wall: Obstacle = { kind: "circle", x: mid.x, z: mid.z, r: 1.5, height: 6 };
    const blocked = twoShotFrame(player, npc, [wall]);
    expect(blocked.chosen.side).toBe(-free.chosen.side);
    expect(blocked.chosen.score).toBeLessThan(1);
  });

  test("con los 6 candidatos tapados elige el de menor oclusión y no falla", () => {
    const ring: Obstacle[] = Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      return { kind: "circle", x: 1.3 * 0 + Math.sin(a) * 5, z: 1.3 + Math.cos(a) * 5, r: 1.2, height: i === 3 ? 0.5 : 9 };
    });
    const cands = twoShotCandidates(player, npc, ring);
    expect(cands.length).toBe(6);
    expect(cands.every((c) => c.score >= 1)).toBe(true);
    const f = twoShotFrame(player, npc, ring);
    expect(f.chosen.score).toBe(Math.min(...cands.map((c) => c.score)));
  });

  test("con relieve la mira sube con el suelo de los dos y una loma plana no cuenta como oclusión", () => {
    const loma = (): number => 7;
    const f = twoShotFrame(player, npc, [], loma);
    expect(f.target[1]).toBeCloseTo(7 + TWO_SHOT.chestHeight - 0.9, 9);
    expect(f.chosen.score).toBe(0);
    // Each one's ground: between 2 m and 6 m the aim sits at 4 m plus chest height minus the drop.
    const rampa = (_x: number, z: number): number => (z > 1 ? 6 : 2);
    expect(twoShotFrame(player, npc, [], rampa).target[1]).toBeCloseTo(4 + TWO_SHOT.chestHeight - 0.9, 9);
  });
});

describe("A12 etiquetas de nombre", () => {
  const actors = [{ id: "NPC-INES", name: "Inés" }, { id: "NPC-NELL", name: "Nell" }, { id: "NPC-HARLAN", name: "NPC-HARLAN" }];

  test("una por NPC con su nombre (o el id); el NPC de la escena no tiene", () => {
    expect(labelEntries(actors, null, null).map((l) => l.name)).toEqual(["Inés", "Nell", "NPC-HARLAN"]);
    expect(labelEntries(actors, "NPC-NELL", "NPC-INES")).toEqual([
      { id: "NPC-NELL", name: "Nell", highlighted: true }, { id: "NPC-HARLAN", name: "NPC-HARLAN", highlighted: false },
    ]);
  });

  test("Sprite con sizeAttenuation false y depthTest false, material de la clase etiqueta", () => {
    for (const hl of [false, true]) {
      const s = createNameLabel("Inés", hl);
      expect(s).toBeInstanceOf(Sprite);
      const m = s.material as SpriteMaterial;
      expect(m.sizeAttenuation).toBe(false);
      expect(m.depthTest).toBe(false);
      expect(materialKind(m)).toBe("etiqueta");
    }
    expect(LABEL_STYLES.normal).toMatchObject({ fill: PALETTE.papel, text: PALETTE.tinta });
    expect(LABEL_STYLES.highlighted).toMatchObject({ fill: PALETTE["ámbar"], border: PALETTE["ámbar-osc"] });
  });
});

describe("A13/A14 paleta: una sola fuente de los hex", () => {
  test("luz, niebla y fondo de la propuesta C §5 salen de la paleta", () => {
    // Recorded change (T7b): the values live in the looks (both catalog looks share C §5's light). The
    // 34 to 78 m fog (D-208) no longer exists: since T5 the fog is the zoom one, the same for every diorama (AC40).
    for (const look of [PAINTED_LOOK, DEFAULT_LOOK]) {
      expect(look.light.sun).toMatchObject({ color: "#FFF1D6", intensity: 2.3, elevationDeg: 48, azimuthDeg: -30 });
      expect(look.light.hemi).toMatchObject({ sky: "#D6ECF2", ground: "#6E8B4A", intensity: 1.15 });
      expect(look.light.exposure).toBe(1.05);
    }
    expect(PAINTED_LOOK.fog.color).toBe("#F3E7CF");
    expect(PAINTED_LOOK.background).toBe(PALETTE.bruma);
  });

  test("ningún archivo nuevo de world/ escribe un hex fuera de palette.ts", () => {
    // Recorded change (open-world-3d T6): `sky` is added (the new sky does not write hex either; its colors come from palette.ts).
    // Recorded change (open-world-3d T7): `nature` is added (its colors are @lg/art NATURE_COLORS numbers and the cap
    // CAP_COLOR; the zone did not exist before).
    const zones = "materials|terrain|water|labels|budget|lighting|actors|dioramas|camera|props|sky|nature";
    const src = import.meta.glob("../src/world/*/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    // Plan estetica-c M7: the HD-2D stuff (props/Boxes.tsx) was retired; there are no exceptions anymore.
    const files = Object.entries(src)
      .map(([path, text]) => [path.replace(/^.*\/src\/world\//, ""), text] as const)
      .filter(([rel]) => new RegExp(`^(${zones})/`).test(rel));
    expect(files.length).toBeGreaterThan(25);
    expect(files.filter(([, text]) => /#[0-9a-fA-F]{6}\b/.test(text)).map(([rel]) => rel)).toEqual([]);
  });

  test("los pares de las etiquetas son los de la paleta y su mínimo es 7:1", () => {
    expect(LABEL_CONTRAST_MIN).toBe(7);
    expect(LABEL_CONTRAST_PAIRS.map((p) => [p.fg, p.bg])).toEqual([[PALETTE.tinta, PALETTE.papel], [PALETTE["chip-texto"], PALETTE["ámbar"]]]);
    expect(hexToLinear("#FFFFFF")).toEqual([1, 1, 1]);
  });
});

describe("personajes chibi (ítem 13)", () => {
  test("2,5 a 3 cabezas de alto, ≤ 6 mallas, cabeza de radio 0,42 m; cada personaje conocido con su accesorio", () => {
    const heads = CHIBI_HEAD_TOP / (2 * HEAD_RADIUS * CHIBI_SCALE);
    expect(heads).toBeGreaterThanOrEqual(2.5);
    expect(heads).toBeLessThanOrEqual(3);
    expect(HEAD_RADIUS).toBe(0.42);
    for (const id of Object.keys(contentLooks())) expect(buildChibi(lookOf(id)).meshes.length).toBeLessThanOrEqual(6);
    // Since M3 accessories are separate pieces (hat, hairstyle, scarf or muffler), not a single one per character.
    expect(contentLooks()["player"]?.hat).toBe("gorra");
    expect(contentLooks()["NPC-INES"]?.scarf).toBe("panuelo");
    expect(contentLooks()["NPC-NELL"]?.hairStyle).toBe("rodete");
    expect(contentLooks()["NPC-HARLAN"]?.hat).toBe("paja");
    expect(fallbackLook("NPC-OTRO")).toEqual(fallbackLook("NPC-OTRO"));
  });
});

describe("A15 presupuesto estimado (medium)", () => {
  const MEDIUM = { maxDrawCalls: 120, maxTriangles: 50_000 };

  test("test.yaml con 4 chibis, 3 etiquetas y las sombras blob: ≤ 120 llamadas y ≤ 50k triángulos", () => {
    const d = testDiorama();
    const scene = buildDioramaScene(d);
    const actors = ["player", ...d.npcs.map((n) => n.id)].map((id) => buildChibi(lookOf(id)).root);
    const labels = d.npcs.map((n) => createNameLabel(n.id, false));
    const blobs = buildBlobShadows(scene.blobAnchors);
    blobs.count = scene.blobAnchors.length + actors.length;
    const e = estimateBudget([scene.root, ...actors, ...labels, blobs]);
    expect(e.drawCalls, JSON.stringify(e)).toBeLessThanOrEqual(MEDIUM.maxDrawCalls);
    expect(e.triangles, JSON.stringify(e)).toBeLessThanOrEqual(MEDIUM.maxTriangles);
    expect(withinBudget(e, MEDIUM)).toBe(true);
  });

  test("teeth: 500 árboles sin instanciar se pasan", () => {
    const g = new Group();
    const geo = buildProp("codigo/arbol", { w: 0.6, h: 4.5, d: 0.6 });
    for (let i = 0; i < 500; i++) g.add(new Mesh(geo, toonMaterial()));
    expect(withinBudget(estimateBudget([g]), MEDIUM)).toBe(false);
  });
});

describe("agua (ítem 9)", () => {
  test("material propio de la clase agua, con niebla; con «reducir movimiento» los brillos quedan quietos", () => {
    const m = waterMaterial(PAINTED_LOOK);
    expect(materialKind(m)).toBe("agua");
    // Own fog: the scene's at t = 0. Recorded change (T7b): it used to be D-208's 34/78 m, which the light overwrote on
    // the first frame with the zoom one; now it starts with the look's zoom one (45/250 m), the one that is drawn.
    const fog0 = fogFor(PAINTED_LOOK.fog.range, 1, 0);
    expect(m.uniforms["uFogNear"]?.value).toBe(fog0.near);
    expect(m.uniforms["uFogFar"]?.value).toBe(fog0.far);
    expect(m.uniforms["uFog"]?.value.getHexString()).toBe(PALETTE.bruma.slice(1).toLowerCase());
    const t0 = m.uniforms["uTime"]?.value as number;
    tickWater(m, 0.5, true);
    expect(m.uniforms["uTime"]?.value).toBe(t0);
    tickWater(m, 0.5, false);
    expect(m.uniforms["uTime"]?.value).toBeCloseTo(t0 + 0.5, 9);
  });
});

describe("D-208 zoom lejano: niebla, sombra, tilt-shift, etiquetas y presupuesto siguen a la distancia", () => {
  const MEDIUM = { maxDrawCalls: 120, maxTriangles: 50_000 };
  const { pitchDeg, yawDeg } = presetAngles("perspective3D");

  test("viewScale: 1 hasta la distancia de inicio (30 m), lineal después", () => {
    expect(VIEW_REFERENCE_DISTANCE).toBe(30);
    expect(viewScale(12.5)).toBe(1);
    expect(viewScale(22)).toBe(1);
    expect(viewScale(30)).toBe(1);
    expect(viewScale(160)).toBeCloseTo(160 / 30, 9);
  });

  // Recorded change (open-world-3d T7b, "the two fogFor merge into one"): D-208's distance fog
  // (`fogFor(viewScale(d))`, 34-78 m scaled) had no callers since T5; the scene uses the zoom one with the look's range.
  // The test still asks the same of that fog, the one that is drawn: at each core zoom step, with each density's
  // fog scale and each catalog look, the player never enters the fog and the longest ray to the ground
  // ends up with at most 60 % haze. The "34-78 m up close" part and its teeth belonged to M1's fixed fog and are gone.
  test("niebla: de cerca y de lejos el jugador y la mitad de abajo nítidos (la del zoom, para cada look)", () => {
    const fit = zoomDistance(0);
    for (const look of [PAINTED_LOOK, DEFAULT_LOOK]) for (const density of SCENE_DENSITIES) for (const dist of ZOOM_DISTANCES) {
      const fog = fogFor(look.fog.range, DENSITY[density].fogScale, zoomTAt(dist, fit));
      expect(fog.far).toBeGreaterThan(fog.near);
      // The player (at `dist` from the camera) never enters the fog.
      expect(fog.near, `${look.id} ${density} ${dist} m`).toBeGreaterThan(dist);
      // The longest ray to the ground (top of the screen) is not fully covered: at most 60 % haze.
      for (const aspect of ASPECTS) {
        const t = (longestRay(dist, aspect, pitchDeg) - fog.near) / (fog.far - fog.near);
        expect(t, `${look.id} ${density} ${dist} m, ${aspect.toFixed(2)}`).toBeLessThan(0.6);
      }
    }
  });

  test("el agua sigue a la niebla de la escena", () => {
    const m = waterMaterial(PAINTED_LOOK);
    const fog = fogFor(PAINTED_LOOK.fog.range, 1, 1);
    setWaterFog(m, fog.near, fog.far);
    expect(m.uniforms["uFogNear"]?.value).toBe(fog.near);
    expect(m.uniforms["uFogFar"]?.value).toBe(fog.far);
    const fog0 = fogFor(PAINTED_LOOK.fog.range, 1, 0);
    setWaterFog(m, fog0.near, fog0.far);
    expect(m.uniforms["uFogNear"]?.value).toBe(fog0.near);
  });

  test("caja de sombra: la de 44 m hasta 30 m; de lejos cubre la huella del frustum alrededor del jugador", () => {
    expect(sunShadowFor(viewScale(22))).toEqual({ half: SUN_SHADOW.half, distance: SUN_SHADOW.distance, near: SUN_SHADOW.near, far: SUN_SHADOW.far });
    for (const dist of ZOOM_DISTANCES) {
      const box = sunShadowFor(viewScale(dist));
      // The box covers the bottom of the screen and the player (the near half of the footprint).
      const fp = frustumGroundFootprint([0, PERSPECTIVE.targetHeight, 0], pitchDeg, yawDeg, dist, 30, 16 / 9) ?? [];
      const nearHalf = Math.max(...fp.slice(0, 2).map(([x, z]) => Math.max(Math.abs(x), Math.abs(z))));
      expect(box.half, `${dist} m`).toBeGreaterThanOrEqual(nearHalf);
      // The sun stays at the same proportion of the box, and the far plane reaches the bottom of the box.
      expect(box.distance / box.half).toBeCloseTo(SUN_SHADOW.distance / SUN_SHADOW.half, 9);
      expect(box.far).toBeGreaterThan(box.distance + box.half * Math.SQRT2);
    }
  });

  test("tilt-shift: línea de foco horizontal por el centro (el jugador); de lejos menos desenfoque y franja más ancha", () => {
    const near = tiltShiftFor(viewScale(22));
    expect(near).toEqual({ blur: TILT_SHIFT_BASE.blur, taper: TILT_SHIFT_BASE.taper, start: [0, 0.5], end: [1, 0.5] });
    expect(tiltShiftFor(viewScale(30))).toEqual(near);
    let prev = near;
    for (const dist of [...ZOOM_DISTANCES].reverse()) {
      const t = tiltShiftFor(viewScale(dist));
      expect(t.start[1]).toBe(0.5);
      expect(t.end[1]).toBe(0.5);
      expect(t.blur).toBeLessThanOrEqual(prev.blur);
      expect(t.taper).toBeGreaterThanOrEqual(prev.taper);
      expect(t.blur).toBeGreaterThan(0);
      prev = t;
    }
    expect(tiltShiftFor(viewScale(160)).blur).toBeLessThan(TILT_SHIFT_BASE.blur);
  });

  test("etiquetas: de lejos solo la resaltada; de cerca todas", () => {
    const actors = [{ id: "NPC-INES", name: "Inés" }, { id: "NPC-NELL", name: "Nell" }, { id: "NPC-HARLAN", name: "Harlan" }];
    expect(labelVisibleAt(false, LABEL_HIDE_DISTANCE)).toBe(true);
    expect(labelVisibleAt(false, LABEL_HIDE_DISTANCE + 0.01)).toBe(false);
    expect(labelVisibleAt(true, 1000)).toBe(true);
    const shown = ZOOM_DISTANCES.filter((d) => labelEntries(actors, null, null, d).length === 3);
    const hidden = ZOOM_DISTANCES.filter((d) => labelEntries(actors, null, null, d).length === 0);
    expect(shown.length + hidden.length).toBe(ZOOM_DISTANCES.length);
    expect(hidden).toContain(160);
    expect(hidden).toContain(90);
    expect(shown).toContain(65);
    expect(shown).toContain(30);
    expect(labelEntries(actors, "NPC-NELL", null, 160)).toEqual([{ id: "NPC-NELL", name: "Nell", highlighted: true }]);
    // The scene's NPC shows no label or highlight, not even up close.
    expect(labelEntries(actors, "NPC-NELL", "NPC-NELL", 160)).toEqual([]);
    expect(labelEntries(actors, null, null, TWO_SHOT.distance)).toHaveLength(3);
  });

  test("presupuesto en `medium` a 160 m: el terreno extendido y todo el diorama a la vista entran", () => {
    // The estimator sums the whole graph without frustum culling: it is the far view, where everything fits on screen.
    const d = testDiorama();
    const scene = buildDioramaScene(d);
    const actors = ["player", ...d.npcs.map((n) => n.id)].map((id) => buildChibi(lookOf(id)).root);
    const far = zoomDistance(0);
    const labels = labelEntries(d.npcs.map((n) => ({ id: n.id, name: n.id })), d.npcs[0]?.id ?? null, null, far).map((l) => createNameLabel(l.name, l.highlighted));
    expect(labels).toHaveLength(1);
    const blobs = buildBlobShadows(scene.blobAnchors);
    blobs.count = scene.blobAnchors.length + actors.length;
    const e = estimateBudget([scene.root, ...actors, ...labels, blobs]);
    const terrain = estimateBudget(scene.root.children.filter((c) => c.name === "terreno"));
    const msg = JSON.stringify({ e, terrain });
    expect(withinBudget(e, MEDIUM), msg).toBe(true);
    // The far skirt (35 to 160 m) is cheap: the whole terrain stays under 13k triangles.
    expect(terrain.triangles, msg).toBeLessThan(13_000);
    expect(scene.terrain.extent.maxX - d.bounds.maxX).toBe(TERRAIN_SKIRT);
  });
});
