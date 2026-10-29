// Open-world-3d T7: la naturaleza del mundo abierto, sin GPU. AC37 (la base de cada árbol sobre el terreno dibujado,
// por raycast), AC44 (bandas de LOD por tier, fundido de tarjeta, impostor de 3 quads con la copa a 58 %, cámaras del
// horneado en world/camera/bakeCamera.ts), AC45 (culling por instancia contra el frustum con 200 instancias sembradas, y
// el portón que solo recorre cuando la vista cambió), AC46 (cada tronco bloquea su celda; caminos y accesos a NPCs
// libres) y AC71 (cada variante tramada con su propio `customProgramCacheKey`).
import { blockingFootprints, CARD_FADE, cardFade, IMPOSTOR_CROWN_HEIGHT, OPEN_WORLD_DENSITY, treeBand, TRUNK_FOOTPRINT, WORLD_TIERS } from "@lg/art";
import { cellCenter, distanceToPolyline, isWalkable, prepareDiorama, type DioramaLayout, type DioramaRuntime } from "@lg/core";
import {
  BoxGeometry, Color, Frustum, InstancedMesh, Matrix4, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector3, type Material,
} from "three";
import { describe, expect, test } from "vitest";
import { impostorBakeCameras, impostorFraming } from "../src/world/camera/bakeCamera";
import { buildDioramaScene } from "../src/world/dioramas/scene";
import { CULL_MOVE_M, CULL_REST_DEG, CULL_REST_M, CULL_TURN_DEG, CullGate, cullGroup, type NatureEntry, type NatureGroup } from "../src/world/nature/culling";
import { NATURE_SINK } from "../src/world/nature/buildNature";
import { impostorGeometry } from "../src/world/nature/geometry";
import { FACE_FADE_GLSL } from "../src/world/nature/materials";
import { compiledUniverseClientContent } from "./helpers";

const layouts = compiledUniverseClientContent("U-GALEANO")["dioramas.json"] as DioramaLayout[];
const muelle = (): DioramaRuntime => prepareDiorama(layouts.find((d) => d.id === "muelle") as DioramaLayout);

describe("AC37 (árboles): la base de cada árbol es el terreno dibujado menos su hundimiento documentado", () => {
  test("muelle en low: raycast hacia abajo en cada base", () => {
    const d = muelle();
    const scene = buildDioramaScene(d, "reduced", "low");
    const nature = scene.nature;
    expect(nature).not.toBeNull();
    const bases = nature?.treeBases ?? [];
    expect(bases.length).toBeGreaterThan(50);
    scene.root.updateMatrixWorld(true);
    const ray = new Raycaster();
    for (const b of bases) {
      if (b.x < d.bounds.minX || b.x > d.bounds.maxX || b.z < d.bounds.minZ || b.z > d.bounds.maxZ) continue;
      ray.set(new Vector3(b.x, 200, b.z), new Vector3(0, -1, 0));
      const hit = ray.intersectObject(scene.picker as never, false)[0];
      expect(hit, `${b.x},${b.z}`).toBeDefined();
      expect(Math.abs(b.y - ((hit?.point.y ?? NaN) - NATURE_SINK[b.kind] * b.s)), `${b.kind} en ${b.x},${b.z}`).toBeLessThanOrEqual(0.05);
    }
    // AC37 ("tree bases equal heightAt plus their documented lift"), fix 1 de QA: lo dibujado es la matriz de cada
    // instancia que culling.ts sube a la GPU, no `treeBases`; su altura (elemento 13) es la base comprobada arriba.
    const baseAt = new Map(bases.map((b) => [`${b.x},${b.z}`, b.y]));
    const treeGroups = (nature?.groups ?? []).filter((g) => g.levels.some((l) => l.mesh.name.endsWith(":completo")));
    expect(treeGroups.length).toBeGreaterThan(3);
    let drawn = 0;
    for (const g of treeGroups) for (const e of g.entries) {
      const y = baseAt.get(`${e.x},${e.z}`);
      expect(y, `${e.x},${e.z}`).toBeDefined();
      expect(Math.abs((e.matrix[13] as number) - (y as number)), `matriz en ${e.x},${e.z}`).toBeLessThanOrEqual(0.05);
      drawn += 1;
    }
    expect(drawn).toBe(bases.length);
    scene.dispose();
  });
});

describe("AC44: bandas, fundido de tarjeta, impostor y cámaras del horneado", () => {
  test("los radios de banda por tier son los LOD_R del mockup", () => {
    expect(OPEN_WORLD_DENSITY.low.treeLod).toEqual({ full: 0, mid: 24 });
    expect(OPEN_WORLD_DENSITY.medium.treeLod).toEqual({ full: 16, mid: 38 });
    expect(OPEN_WORLD_DENSITY.high.treeLod).toEqual({ full: 24, mid: 58 });
    for (const tier of WORLD_TIERS) {
      const { full, mid } = OPEN_WORLD_DENSITY[tier].treeLod;
      if (full > 0) expect(treeBand(full - 0.01, tier)).toBe("full");
      expect(treeBand(full + 0.01, tier)).toBe("light");
      expect(treeBand(mid - 0.01, tier)).toBe("light");
      expect(treeBand(mid + 0.01, tier)).toBe("impostor");
    }
  });

  test("cardFade: 1 desde |cos| 0,6, 0 hasta 0,4, monótono en el medio", () => {
    for (const c of [0.6, 0.75, 1, -0.6, -1]) expect(cardFade(c)).toBe(1);
    for (const c of [0.4, 0.2, 0, -0.4]) expect(cardFade(c)).toBe(0);
    let prev = 0;
    for (let c = 0.4; c <= 0.6 + 1e-9; c += 0.01) {
      const f = cardFade(c);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(cardFade(0.5)).toBeCloseTo(0.5, 6);
  });

  test("el shader trama la tarjeta con los mismos umbrales que cardFade (0,4 y 0,6, de @lg/art CARD_FADE)", () => {
    // AC44 (cardFade 0 at or below 0.4, 1 at or above 0.6), fix 1 de QA: el GLSL ya no repite los números a mano.
    expect(CARD_FADE).toEqual({ edge: 0.4, face: 0.6 });
    expect(FACE_FADE_GLSL).toContain("smoothstep(0.400, 0.600, vFace)");
  });

  test("el impostor: 3 quads (6 triángulos), dos verticales cruzados y la copa horizontal al 58 % del alto", () => {
    const box = { minX: -2, maxX: 2.2, minZ: -1.8, maxZ: 2, maxY: 9 };
    const g = impostorGeometry(box);
    expect((g.index?.count ?? 0) / 3).toBe(6);
    expect(g.getAttribute("position").count).toBe(12);
    const pos = g.getAttribute("position");
    const ys = [8, 9, 10, 11].map((i) => pos.getY(i));
    expect(IMPOSTOR_CROWN_HEIGHT).toBe(0.58);
    for (const y of ys) expect(y).toBeCloseTo(0.58 * 9, 6);
    // Las dos verticales: una en z = 0 y otra en x = 0, a lo alto del encuadre.
    expect([0, 1, 2, 3].every((i) => pos.getZ(i) === 0)).toBe(true);
    expect([4, 5, 6, 7].every((i) => pos.getX(i) === 0)).toBe(true);
    const { E, ymid } = impostorFraming(box);
    expect(pos.getY(2)).toBeCloseTo(ymid + E, 6);
  });

  test("las cámaras del horneado salen de world/camera/bakeCamera.ts: de costado y desde arriba, ortográficas", () => {
    const { side, top } = impostorBakeCameras({ minX: -1, maxX: 1, minZ: -1, maxZ: 1, maxY: 6 });
    // Proyección paralela (el elemento [15] de la matriz es 1; en una de perspectiva es 0). R11: el nombre de la clase
    // solo aparece en bakeCamera.ts (scripts/lint/retiro-hd2d.test.ts).
    expect(side.projectionMatrix.elements[15]).toBe(1);
    expect(top.projectionMatrix.elements[15]).toBe(1);
    expect(side.getWorldDirection(new Vector3()).z).toBeCloseTo(-1, 6);
    expect(top.getWorldDirection(new Vector3()).y).toBeCloseTo(-1, 6);
  });
});

/** 200 instancias sembradas en un cuadrado de 120 m alrededor del origen, esfera de radio 1,5 m. */
function seededGroup(): NatureGroup {
  let seed = 11;
  const rand = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const entries: NatureEntry[] = Array.from({ length: 200 }, (_, i) => {
    const x = (rand() - 0.5) * 120, z = (rand() - 0.5) * 120;
    return { x, z, base: 0, k: 1, cy: 1.5, rad: 1.5, maxD: Infinity, matrix: new Matrix4().makeTranslation(x, 0, z).toArray(), tint: [i / 200, 0, 0] };
  });
  const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 200);
  mesh.setColorAt(0, new Color(1, 1, 1)); // como world/nature/buildNature.ts: el tinte va en instanceColor
  return { entries, levels: [{ band: "nearMid", mesh }] };
}

describe("AC45: culling por instancia y portón del recorrido", () => {
  test("200 instancias sembradas: sube exactamente las que tocan el frustum", () => {
    const g = seededGroup();
    const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 500);
    camera.position.set(0, 20, 30);
    camera.lookAt(0, 0, -20);
    camera.updateMatrixWorld();
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const n = cullGroup(g, { cx: 0, cz: 0, camera: camera.position, frustum, fogFar: Infinity, full: 1000, mid: 1000 });
    const mesh = g.levels[0]?.mesh as InstancedMesh;
    const inside = g.entries.filter((e) => frustum.intersectsSphere({ center: new Vector3(e.x, e.cy, e.z), radius: e.rad } as never));
    expect(inside.length).toBeGreaterThan(20);
    expect(inside.length).toBeLessThan(200);
    expect(n[0]).toBe(inside.length);
    expect(mesh.count).toBe(inside.length);
    // Las subidas son justo las de adentro (por su tinte único).
    const tints = new Set<number>();
    for (let k = 0; k < mesh.count; k++) tints.add(Math.round((mesh.instanceColor?.array[k * 3] as number) * 200));
    expect([...tints].sort((a, b) => a - b)).toEqual(inside.map((e) => Math.round(e.tint[0] * 200)).sort((a, b) => a - b));
  });

  test("el portón: quieto 60 cuadros 0 veces; 4° de giro 0; 6° 1; 1 m de paso 1", () => {
    expect([CULL_MOVE_M, CULL_TURN_DEG]).toEqual([1, 5]);
    const gate = new CullGate();
    const s = { x: 0, z: 0, yawDeg: 10, pitchDeg: -30, distance: 12 };
    expect(gate.shouldUpdate(s)).toBe(true);
    const runs = (): number => gate.runs;
    const r0 = runs();
    for (let i = 0; i < 60; i++) gate.shouldUpdate({ ...s });
    expect(runs() - r0).toBe(0);
    gate.shouldUpdate({ ...s, yawDeg: 14 });
    expect(runs() - r0).toBe(0);
    gate.shouldUpdate({ ...s, yawDeg: 16 });
    expect(runs() - r0).toBe(1);
    gate.shouldUpdate({ ...s, yawDeg: 16, x: 1 });
    expect(runs() - r0).toBe(2);
  });

  test("un giro de 4° sostenido recorre una vez, en el segundo cuadro quieto (desviación registrada de AC45, T7b)", () => {
    // QA T7 (pendiente 1): desde el recorrido al asentarse, "4° de giro 0" vale para un cuadro suelto; sostenido, el
    // segundo cuadro quieto en el lugar nuevo recorre una vez (está quieto y no es donde se recorrió) y después nunca.
    const gate = new CullGate();
    const s = { x: 0, z: 0, yawDeg: 10, pitchDeg: -30, distance: 12 };
    gate.shouldUpdate(s);
    const r0 = gate.runs;
    expect(gate.shouldUpdate({ ...s, yawDeg: 14 })).toBe(false); // primer cuadro a 4°: sin recorrer (bajo CULL_TURN_DEG)
    expect(gate.shouldUpdate({ ...s, yawDeg: 14 })).toBe(true); // segundo cuadro quieto: el recorrido al asentarse
    for (let i = 0; i < 60; i++) expect(gate.shouldUpdate({ ...s, yawDeg: 14 })).toBe(false);
    expect(gate.runs - r0).toBe(1);
  });

  test("al asentarse la cámara por menos del umbral, recorre una sola vez más (pose fija, recorrido fijo)", () => {
    // Fix 1 de QA (hallazgo 5): la cámara que se asienta 3° y 0,5 m sin cruzar umbrales queda con un recorrido viejo.
    expect([CULL_REST_M, CULL_REST_DEG]).toEqual([1e-3, 0.02]);
    const gate = new CullGate();
    const s = { x: 0, z: 0, yawDeg: 10, pitchDeg: -30, distance: 12 };
    gate.shouldUpdate(s);
    const r0 = gate.runs;
    // Se mueve (cada cuadro distinto del anterior, sin cruzar umbrales): no recorre.
    for (let i = 1; i <= 30; i++) expect(gate.shouldUpdate({ ...s, yawDeg: 10 + i * 0.1, x: i * 0.016 })).toBe(false);
    const rest = { ...s, yawDeg: 13, x: 0.48 };
    // Quieto en otro lugar: el primer cuadro quieto recorre, los 60 siguientes no.
    expect(gate.shouldUpdate({ ...rest })).toBe(true);
    for (let i = 0; i < 60; i++) gate.shouldUpdate({ ...rest });
    expect(gate.runs - r0).toBe(1);
  });
});

describe("AC46: los troncos bloquean su celda; caminos y accesos a NPCs libres (semilla de Galeano)", () => {
  const d = muelle();
  const grid = d.grid;
  const half = grid.cellSize / 2;
  const prints = blockingFootprints(d.vegetation ?? { pines: [], broads: [], bushes: [], rocks: [], flowers: [], ferns: [], pebbles: [] }, d.bounds);
  const overlaps = (cx: number, cz: number, f: { x: number; z: number; r: number }): boolean =>
    Math.min(cx + half, f.x + f.r) - Math.max(cx - half, f.x - f.r) > 0 && Math.min(cz + half, f.z + f.r) - Math.max(cz - half, f.z - f.r) > 0;
  const cellsOf = (f: { x: number; z: number; r: number }): [number, number][] => {
    const out: [number, number][] = [];
    for (let col = 0; col < grid.cols; col++) for (let row = 0; row < grid.rows; row++) {
      const c = cellCenter(grid, col, row);
      if (Math.abs(c.x - f.x) > f.r + half || Math.abs(c.z - f.z) > f.r + half) continue;
      if (overlaps(c.x, c.z, f)) out.push([col, row]);
    }
    return out;
  };

  test("cada huella de tronco (y de roca grande) es una celda bloqueada", () => {
    // AC46 ("every tree trunk footprint is a blocked cell"), fix 1 de QA: el radio de la huella queda fijado en el
    // valor del build T7 (pino 0,35 y latifoliada 0,4 m por unidad de escala); achicarlo dejaría pasar el tronco.
    expect(TRUNK_FOOTPRINT).toEqual({ pine: 0.35, broad: 0.4 });
    expect(d.vegetation).not.toBeNull();
    expect(prints.length).toBeGreaterThan(30);
    for (const f of prints) {
      const cells = cellsOf(f);
      expect(cells.length, `${f.x},${f.z}`).toBeGreaterThan(0);
      for (const [col, row] of cells) expect(isWalkable(grid, col, row), `${f.x},${f.z} celda ${col},${row}`).toBe(false);
    }
  });

  test("ninguna huella pisa una celda de camino ni el acceso a un NPC", () => {
    const roads = d.ground.paths.filter((p) => p.surface === "camino");
    expect(roads.length).toBeGreaterThan(0);
    for (let col = 0; col < grid.cols; col++) for (let row = 0; row < grid.rows; row++) {
      const c = cellCenter(grid, col, row);
      const road = roads.some((p) => distanceToPolyline(c.x, c.z, p.points.map(([x, z]) => ({ x, z }))) <= p.width / 2);
      const access = d.interactables.some((i) => i.kind === "npc" && Math.hypot(c.x - i.x, c.z - i.z) <= i.radius && Math.hypot(c.x - i.x, c.z - i.z) > 0.5);
      if (!road && !access) continue;
      for (const f of prints) expect(overlaps(c.x, c.z, f), `${road ? "camino" : "acceso"} ${c.x},${c.z} y tronco ${f.x},${f.z}`).toBe(false);
    }
  });
});

describe("AC71: cada variante tramada de la naturaleza con su propio customProgramCacheKey", () => {
  test("muelle en high: claves distintas por material, una por banda y clase", () => {
    const scene = buildDioramaScene(muelle(), "full", "high");
    const mats = new Set<Material>();
    scene.root.traverse((o) => {
      const m = (o as { material?: Material | Material[] }).material;
      for (const x of Array.isArray(m) ? m : m ? [m] : []) mats.add(x);
    });
    const patched = [...mats].filter((m) => Object.hasOwn(m, "customProgramCacheKey"));
    const keys = patched.map((m) => m.customProgramCacheKey());
    expect(keys.length).toBeGreaterThanOrEqual(7);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of ["follaje-near", "follaje-mid", "follaje-nearMid", "follaje-flores", "roca-midFar", "piedritas"]) expect(keys, k).toContain(k);
    expect(keys.some((k) => k.startsWith("roca-near"))).toBe(true);
    expect(keys.filter((k) => k.startsWith("impostor-")).length).toBeLessThanOrEqual(5);
    scene.dispose();
  });
});
