// Plan estetica-c M1 (D-207): las partes puras del look C en world/, sin GPU (D-016). Cámara de lente largo (A1),
// borde invisible (A2), terreno (A3), material único (A4), bisel (A5), props (A6), plano de a dos (A8), etiquetas (A12),
// presupuesto estimado (A15) y la paleta como única fuente de los hex. Lo que vive en el store (A7, A9, A10, A13) está
// en map.test.tsx sobre el mapa real.
import {
  CAMERA_PRESET_IDS, cellCenter, circleBlocked, isWalkable, prepareDiorama, presetAngles, type DioramaLayout,
  type DioramaRuntime,
} from "@lg/core";
import { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, NearestFilter, Sprite, type SpriteMaterial } from "three";
import { describe, expect, test } from "vitest";
import { pickDiorama } from "../src/services/content";
import { buildBlobShadows } from "../src/world/actors/BlobShadows";
import { buildChibi, CHIBI_HEAD_TOP, HEAD_RADIUS, CHIBI_SCALE } from "../src/world/actors/chibiModel";
import { CHIBI_LOOKS, chibiLook } from "../src/world/actors/looks";
import { estimateBudget, withinBudget } from "../src/world/budget/estimate";
import { CAMERA_RIG_PRESETS } from "../src/world/camera/presets";
import {
  cameraOffset, frustumGroundFootprint, PERSPECTIVE, perspectiveFov, shortestYawDelta, TWO_SHOT, twoShotCandidates,
  twoShotFrame, zoomDistance, ZOOM_DISTANCES, type Obstacle,
} from "../src/world/camera/rig";
import { buildDioramaScene } from "../src/world/dioramas/scene";
import { labelEntries, LABEL_STYLES } from "../src/world/labels/labels";
import { createNameLabel } from "../src/world/labels/labelSprite";
import { SUN, HEMI, FOG, TONE, BACKGROUND } from "../src/world/lighting/params";
import { hexToLinear, paintColors, PAINT_DEFAULTS, tokenRgb } from "../src/world/materials/paint";
import { LABEL_CONTRAST_MIN, LABEL_CONTRAST_PAIRS, PALETTE } from "../src/world/materials/palette";
import { auditMaterials, materialKind, tagMaterial, toonMaterial, WORLD_MATERIAL_KINDS } from "../src/world/materials/registry";
import { BRUSH_MAX, BRUSH_MIN, BRUSH_SIZE, brushPixels, brushTexture, toonRamp, toonRampData, TOON_BANDS } from "../src/world/materials/toon";
import { maxDihedralDeg, MAX_DIHEDRAL_DEG } from "../src/world/props/bevel";
import { buildProp, PROP_BUILDERS } from "../src/world/props/builders";
import { buildTerrain, TILE, tileAt } from "../src/world/terrain/buildTerrain";
import { tickWater, waterMaterial } from "../src/world/water/waterMaterial";
import { compiledClientContent } from "./helpers";

const layout = (): DioramaLayout => pickDiorama(compiledClientContent()["dioramas.json"], "test");
const testDiorama = (): DioramaRuntime => prepareDiorama(layout());

const walkableCenters = (d: DioramaRuntime): { x: number; z: number }[] => {
  const out: { x: number; z: number }[] = [];
  for (let row = 0; row < d.grid.rows; row++) {
    for (let col = 0; col < d.grid.cols; col++) if (isWalkable(d.grid, col, row)) out.push(cellCenter(d.grid, col, row));
  }
  return out;
};

describe("A1 cámara de lente largo (perspective3D)", () => {
  test("50° / 45°, distancias 22 / 30 / 40, FOV 30 o 40,5 y registro implementado", () => {
    expect(presetAngles("perspective3D")).toEqual({ pitchDeg: 50, yawDeg: 45 });
    expect([2, 1, 0].map(zoomDistance)).toEqual([22, 30, 40]);
    expect([...ZOOM_DISTANCES]).toEqual([40, 30, 22]);
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
  test("para cada celda caminable, cada zoom y aspectos 16:9, 21:9, 4:3 y 9:16, la huella cae dentro del terreno", () => {
    const d = testDiorama();
    const { extent } = buildTerrain({ bounds: d.bounds, layers: d.layers });
    const { pitchDeg, yawDeg } = presetAngles("perspective3D");
    let checked = 0;
    for (const c of walkableCenters(d)) {
      for (const dist of ZOOM_DISTANCES) {
        for (const aspect of [16 / 9, 21 / 9, 4 / 3, 9 / 16]) {
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
});

describe("A3 terreno por alturas", () => {
  const d = testDiorama();
  const t = buildTerrain({ bounds: d.bounds, layers: d.layers });
  const suelo = d.layers.find((l) => l.name === "suelo");

  test("toda celda caminable tiene altura 0 en su centro; toda celda de agua está por debajo de 0", () => {
    for (const c of walkableCenters(d)) expect(Math.abs(t.heightAt(c.x, c.z)), `${c.x},${c.z}`).toBeLessThanOrEqual(1e-6);
    let water = 0;
    if (!suelo) throw new Error("sin capa suelo");
    for (let j = 0; j < suelo.height; j++) {
      for (let i = 0; i < suelo.width; i++) {
        if (suelo.tiles[j * suelo.width + i] !== TILE.agua) continue;
        water++;
        expect(t.heightAt(suelo.originX + i + 0.5, suelo.originZ + j + 0.5)).toBeLessThan(0);
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

  test("el color del centro de una celda de camino está dentro de la tolerancia de `camino` con el temblor", () => {
    if (!suelo) throw new Error("sin capa suelo");
    const camino = tokenRgb("camino");
    let checked = 0;
    for (let j = 0; j < suelo.height; j++) {
      for (let i = 0; i < suelo.width; i++) {
        const x = suelo.originX + i + 0.5;
        const z = suelo.originZ + j + 0.5;
        if (tileAt(suelo, x, z) !== TILE.camino || tileAt(suelo, x - 1, z) !== TILE.camino || tileAt(suelo, x + 1, z) !== TILE.camino) continue;
        if (tileAt(suelo, x, z - 1) !== TILE.camino || tileAt(suelo, x, z + 1) !== TILE.camino) continue;
        const v = t.vertexAt(x, z);
        expect(v).toBeGreaterThanOrEqual(0);
        for (let k = 0; k < 3; k++) expect(Math.abs((t.colors[v * 3 + k] as number) - (camino[k] as number))).toBeLessThanOrEqual(0.08);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  test("determinística con la misma semilla; otra semilla cambia el color", () => {
    const again = buildTerrain({ bounds: d.bounds, layers: d.layers });
    expect(again.positions).toEqual(t.positions);
    expect(again.colors).toEqual(t.colors);
    expect(buildTerrain({ bounds: d.bounds, layers: d.layers, seed: 99 }).colors).not.toEqual(t.colors);
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
    expect(Math.min(...a)).toBeLessThan(230); // hay manchas
    expect(brushPixels(3)).toEqual(a);
    expect(brushPixels(4)).not.toEqual(a);
    const tex = brushTexture(3);
    expect([tex.image.width, tex.image.height]).toEqual([256, 256]);
    expect(tex.repeat.x).toBe(10);
  });

  test("el diorama de prueba usa a lo sumo 2 instancias de superficie (toon y agua) y ningún material fuera de la lista", () => {
    const scene = buildDioramaScene(testDiorama());
    const all = new Group();
    all.add(scene.root, buildChibi(chibiLook("player")).root, buildBlobShadows(scene.blobAnchors), createNameLabel("Inés", true));
    const audit = auditMaterials(all);
    expect(audit.unknown).toEqual([]);
    expect(audit.surfaceInstances).toBeLessThanOrEqual(2);
    expect(audit.byKind.toon).toBe(1);
    expect(audit.byKind.agua).toBe(1);
    expect([...WORLD_MATERIAL_KINDS]).toEqual(["toon", "agua", "etiqueta", "sombra-blob"]);
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

  test("los props del diorama de prueba, con sus tamaños reales, también", () => {
    for (const b of testDiorama().boxes) {
      const g = buildProp(b.asset, { w: b.w, h: b.h, d: b.d }, 0);
      expect(maxDihedralDeg(g.getAttribute("position").array, g.index?.array ?? null), `${b.asset} ${b.w}×${b.h}×${b.d}`).toBeLessThan(MAX_DIHEDRAL_DEG);
    }
  });

  test("el cuerpo del chibi tampoco tiene aristas duras (la cabeza lleva ojos y alas de sombrero finas a propósito)", () => {
    const c = buildChibi(chibiLook("NPC-HARLAN"));
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
  test("todo asset de test.yaml tiene constructor; uno inexistente falla nombrándolo", () => {
    for (const p of layout().props ?? []) expect(PROP_BUILDERS[p.asset], p.asset).toBeTypeOf("function");
    expect(() => buildProp("codigo/inexistente", { w: 1, h: 1, d: 1 })).toThrow(/codigo\/inexistente/);
  });

  test("los árboles nuevos bloquean su huella en la grilla; sin ellos, ese lugar es caminable", () => {
    const l = layout();
    const trees = (l.props ?? []).filter((p) => p.asset === "codigo/arbol" || p.asset === "codigo/pino");
    expect(trees.length).toBeGreaterThanOrEqual(8);
    const withTrees = prepareDiorama(l);
    const without = prepareDiorama({ ...l, props: (l.props ?? []).filter((p) => !trees.includes(p)) });
    for (const t of trees) {
      expect(circleBlocked(withTrees.grid, t.pos[0], t.pos[2], 0.05)).toBe(true);
      expect(circleBlocked(without.grid, t.pos[0], t.pos[2], 0.05)).toBe(false);
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
    // La línea jugador-NPC va por z; la perpendicular es yaw ±90° y el corrimiento acerca la cámara al lado del jugador
    // (+z), que es hacia donde mira el NPC.
    expect(f.chosen.leanDeg).toBe(27);
    // Perpendicular del lado elegido: (-nz, nx) · side con n = (0, 1) del NPC al jugador, o sea yaw ∓90°.
    expect(Math.abs(shortestYawDelta(f.chosen.side === 1 ? -90 : 90, f.yawDeg))).toBeCloseTo(27, 6);
    // Corrida hacia +z (el lado del jugador, hacia donde mira el NPC).
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
    expect(SUN).toMatchObject({ color: "#FFF1D6", intensity: 2.3, elevationDeg: 48, azimuthDeg: -30 });
    expect(HEMI).toMatchObject({ sky: "#D6ECF2", ground: "#6E8B4A", intensity: 1.15 });
    expect(FOG).toEqual({ color: "#F3E7CF", near: 34, far: 78 });
    expect(TONE.exposure).toBe(1.05);
    expect(BACKGROUND).toBe(PALETTE.bruma);
  });

  test("ningún archivo nuevo de world/ escribe un hex fuera de palette.ts", () => {
    const zones = "materials|terrain|water|labels|budget|lighting|actors|dioramas|camera|props";
    const src = import.meta.glob("../src/world/*/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    // Lo de HD-2D queda hasta M7 (D-207) y no es del look C.
    const legacy = new Set(["props/Boxes.tsx"]);
    const files = Object.entries(src)
      .map(([path, text]) => [path.replace(/^.*\/src\/world\//, ""), text] as const)
      .filter(([rel]) => new RegExp(`^(${zones})/`).test(rel) && rel !== "materials/palette.ts" && !legacy.has(rel));
    expect(files.length).toBeGreaterThan(25);
    expect(files.filter(([, text]) => /#[0-9a-fA-F]{6}/.test(text)).map(([rel]) => rel)).toEqual([]);
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
    for (const id of Object.keys(CHIBI_LOOKS)) expect(buildChibi(chibiLook(id)).meshes.length).toBeLessThanOrEqual(6);
    expect(CHIBI_LOOKS["player"]?.accessory).toBe("gorra");
    expect(CHIBI_LOOKS["NPC-INES"]?.accessory).toBe("panuelo");
    expect(CHIBI_LOOKS["NPC-NELL"]?.accessory).toBe("rodete");
    expect(CHIBI_LOOKS["NPC-HARLAN"]?.accessory).toBe("paja");
    expect(chibiLook("NPC-OTRO")).toEqual(chibiLook("NPC-OTRO"));
  });
});

describe("A15 presupuesto estimado (medium)", () => {
  const MEDIUM = { maxDrawCalls: 120, maxTriangles: 50_000 };

  test("test.yaml con 4 chibis, 3 etiquetas y las sombras blob: ≤ 120 llamadas y ≤ 50k triángulos", () => {
    const d = testDiorama();
    const scene = buildDioramaScene(d);
    const actors = ["player", ...d.npcs.map((n) => n.id)].map((id) => buildChibi(chibiLook(id)).root);
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
    const m = waterMaterial();
    expect(materialKind(m)).toBe("agua");
    // Niebla propia con los valores de la propuesta C §5 (los mismos que la escena).
    expect(m.uniforms["uFogNear"]?.value).toBe(FOG.near);
    expect(m.uniforms["uFogFar"]?.value).toBe(FOG.far);
    const t0 = m.uniforms["uTime"]?.value as number;
    tickWater(m, 0.5, true);
    expect(m.uniforms["uTime"]?.value).toBe(t0);
    tickWater(m, 0.5, false);
    expect(m.uniforms["uTime"]?.value).toBeCloseTo(t0 + 0.5, 9);
  });
});
