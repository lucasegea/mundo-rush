// Plan estetica-c M5 (D-207): el diorama en el formato de la maqueta, sin GPU (D-016).
// - test.yaml migrado camina IGUAL que el de tiles: la grilla compilada se compara celda por celda con el fixture de 43c2b48;
// - cada NPC se alcanza desde el spawn por pasillos de 2 celdas o más (03 §6.4.5);
// - terreno: los caminos aplanan las lomas y se pintan `camino`, el agua hunde el terreno y no se camina, la paleta por zona;
// - detalle sembrado por zonas: la cantidad exacta, fuera de caminos, agua y celdas bloqueadas;
// - el estimador de validate:content (tabla de @lg/art) da EXACTAMENTE lo que world/budget/estimate.ts mide sobre el grafo real;
// - la tabla de costos contra los constructores (props, cerco, árboles, cabezas, detalle);
// - la burbuja ámbar de pedido: sale de `selectRequestBubbles` (vacía hoy: M5 SEAM) y es un Sprite de la clase etiqueta;
// - la apariencia llega del contenido (catálogo) y una mal formada falla clara.
// Plan estetica-c M6: el estimador por tier (densidad reducida en `low`, pasada de sombra en `high`) contra el grafo real
// de esa densidad; `low` dentro de 60 llamadas y 25k triángulos con todo a la vista (el zoom más lejano, 160 m).
import {
  BODY_IDS, CODE_PROP_ASSETS, codePropTriangles, DETAIL_TRIANGLES, HAIR_STYLES, HATS, headTriangles, insidePolygon, isCodeProp,
  PLAYER_LOOK, polylineDistance, SCARVES, TIER_BUDGETS, tokenRgb, WORLD_TIERS, type CodePropAsset, type SceneDensity,
} from "@lg/art";
import { Diorama as DioramaSchema, estimarPresupuestoDiorama, PARTE_SOMBRA, type Diorama as DioramaSource } from "@lg/content-schema";
import {
  cellAt, cellCenter, isWalkable, prepareDiorama, type DioramaLayout, type DioramaRuntime, type WalkGrid,
} from "@lg/core";
import { Group, InstancedMesh, Mesh, type BufferGeometry, type Object3D, type SpriteMaterial } from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { describe, expect, test } from "vitest";
import { ContentShapeError, parseDialogOnlyCatalog, pickDiorama } from "../src/services/content";
import { createActions } from "../src/state/actions";
import { selectMapView, selectRequestBubbles } from "../src/state/selectors";
import { createGameStore, type GameState } from "../src/state/store";
import { buildBlobShadows } from "../src/world/actors/BlobShadows";
import { parseCharacterGlb } from "../src/world/actors/characterAssets";
import { bodyAsset, CLIPS_ASSET } from "../src/world/actors/clips";
import { characterHeadGeometry } from "../src/world/actors/head";
import { PLAYER_LOOK_ID, type CharacterLook } from "../src/world/actors/looks";
import { buildSkinnedCharacter } from "../src/world/actors/skinned";
import { estimateBudget } from "../src/world/budget/estimate";
import { buildDioramaScene, dioramaDetail } from "../src/world/dioramas/scene";
import { BUBBLE_FLOAT, BUBBLE_LABEL_RATIO, bubbleCenterY, bubbleScale, createRequestBubble } from "../src/world/labels/bubbleSprite";
import { createNameLabel } from "../src/world/labels/labelSprite";
import { labelScale, labelLayout } from "../src/world/labels/labels";
import { materialKind } from "../src/world/materials/registry";
import { buildProp, PROP_BUILDERS, TREE_HEIGHT } from "../src/world/props/builders";
import { fitToBox, modelUrl, parseModel } from "../src/world/props/gltf";
import { buildTerrain } from "../src/world/terrain/buildTerrain";
import { GRID_FIXTURE } from "./fixtures";
import { compiledClientContent, compiledContent, lookOf } from "./helpers";

const SERVED = import.meta.glob("../public/models/**/*.glb", { query: "?inline", import: "default", eager: true }) as Record<string, string>;
const fromDataUrl = (url: string): Uint8Array => Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0));
const asBuffer = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const served = (asset: string): ArrayBuffer => {
  const url = SERVED[`../public${modelUrl(`modelo/${asset}`)}`];
  if (url === undefined) throw new Error(`no está servido ${asset}`);
  return asBuffer(fromDataUrl(url));
};
const tris = (g: BufferGeometry): number => (g.index ? g.index.count : g.getAttribute("position").count) / 3;

const LAYOUT = (): DioramaLayout => pickDiorama(compiledClientContent()["dioramas.json"], "test");
const testDiorama = (): DioramaRuntime => prepareDiorama(LAYOUT());
const gridRows = (g: WalkGrid): string[] =>
  Array.from({ length: g.rows }, (_, r) => Array.from({ length: g.cols }, (_, c) => (isWalkable(g, c, r) ? "." : "#")).join(""));

describe("la grilla de test.yaml migrado es la de tiles, celda por celda", () => {
  test("misma forma y mismas celdas que el fixture de 43c2b48", () => {
    const g = testDiorama().grid;
    expect({ originX: g.originX, originZ: g.originZ, cols: g.cols, rows: g.rows, cellSize: g.cellSize })
      .toEqual({ originX: GRID_FIXTURE.originX, originZ: GRID_FIXTURE.originZ, cols: GRID_FIXTURE.cols, rows: GRID_FIXTURE.rows, cellSize: GRID_FIXTURE.cellSize });
    const rows = gridRows(g);
    const diffs: string[] = [];
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] !== GRID_FIXTURE.celdas[r]?.[c]) diffs.push(`${c},${r}: ${row[c]} (era ${GRID_FIXTURE.celdas[r]?.[c]})`);
    });
    expect(diffs).toEqual([]);
    expect(rows.join("").split("#").length - 1).toBeGreaterThan(50); // mide algo: hay celdas bloqueadas
  });

  test("teeth: sin el estanque, la grilla ya no coincide", () => {
    const l = LAYOUT();
    expect(gridRows(prepareDiorama({ ...l, agua: [] }).grid)).not.toEqual(GRID_FIXTURE.celdas);
  });
});

/** Celdas donde entra un cuerpo de 2 × 2 celdas (pasillo de 2 o más, 03 §6.4.5), por su esquina [col, row]. */
function corridorReach(g: WalkGrid, from: { x: number; z: number }): Uint8Array {
  const ok = (c: number, r: number): boolean => isWalkable(g, c, r) && isWalkable(g, c + 1, r) && isWalkable(g, c, r + 1) && isWalkable(g, c + 1, r + 1);
  const seen = new Uint8Array(g.cols * g.rows);
  const [sc, sr] = cellAt(g, from.x, from.z);
  const queue: [number, number][] = [];
  for (const [c, r] of [[sc, sr], [sc - 1, sr], [sc, sr - 1], [sc - 1, sr - 1]] as [number, number][]) {
    if (ok(c, r)) {
      seen[r * g.cols + c] = 1;
      queue.push([c, r]);
    }
  }
  while (queue.length > 0) {
    const [c, r] = queue.shift() as [number, number];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + (dc as number);
      const nr = r + (dr as number);
      if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows || seen[nr * g.cols + nc] || !ok(nc, nr)) continue;
      seen[nr * g.cols + nc] = 1;
      queue.push([nc, nr]);
    }
  }
  return seen;
}

const reachesNpc = (d: DioramaRuntime, id: string): boolean => {
  const npc = d.interactables.find((i) => i.id === id);
  if (!npc) return false;
  const seen = corridorReach(d.grid, d.spawn);
  for (let r = 0; r < d.grid.rows; r++) {
    for (let c = 0; c < d.grid.cols; c++) {
      if (!seen[r * d.grid.cols + c]) continue;
      const p = cellCenter(d.grid, c, r);
      // La esquina del bloque de 2 × 2: su centro es la esquina compartida.
      if (Math.hypot(p.x + d.grid.cellSize / 2 - npc.x, p.z + d.grid.cellSize / 2 - npc.z) <= npc.radius) return true;
    }
  }
  return false;
};

describe("conectividad (03 §6.4.5): cada NPC se alcanza desde el spawn por pasillos de 2 celdas o más", () => {
  test("los tres NPCs de test.yaml", () => {
    const d = testDiorama();
    expect(d.npcs.length).toBe(3);
    for (const n of d.npcs) expect(reachesNpc(d, n.id), n.id).toBe(true);
  });

  test("teeth: una franja no caminable de borde a borde entre el spawn y Nell la deja inalcanzable", () => {
    const l = LAYOUT();
    const muro = { poligono: [[-16, 3.6], [16, 3.6], [16, 4.4], [-16, 4.4]] as [number, number][] };
    const d = prepareDiorama({ ...l, no_caminable: [...(l.no_caminable ?? []), muro] });
    expect(reachesNpc(d, "NPC-NELL")).toBe(false);
    expect(reachesNpc(d, "NPC-INES")).toBe(true);
  });
});

describe("terreno de la maqueta", () => {
  const d = testDiorama();
  const t = buildTerrain({ bounds: d.bounds, ground: d.ground });

  test("toda celda caminable tiene altura 0; el estanque está bajo 0 y sus celdas no se caminan", () => {
    for (let r = 0; r < d.grid.rows; r++) {
      for (let c = 0; c < d.grid.cols; c++) {
        const p = cellCenter(d.grid, c, r);
        if (isWalkable(d.grid, c, r)) expect(Math.abs(t.heightAt(p.x, p.z)), `${p.x},${p.z}`).toBeLessThanOrEqual(1e-6);
      }
    }
    const pond = d.ground.ponds[0] ?? [];
    expect(t.heightAt(8, -6)).toBeLessThan(-0.3);
    // La pintura (@lg/art insidePolygon) y la grilla (núcleo) coinciden sobre el agua.
    let inside = 0;
    for (let r = 0; r < d.grid.rows; r++) {
      for (let c = 0; c < d.grid.cols; c++) {
        const p = cellCenter(d.grid, c, r);
        if (!insidePolygon(p.x, p.z, pond)) continue;
        inside++;
        expect(isWalkable(d.grid, c, r)).toBe(false);
      }
    }
    expect(inside).toBe(64);
  });

  test("un camino aplana las lomas por donde pasa, fuera de los límites", () => {
    const bounds = { minX: -8, maxX: 8, minZ: -8, maxZ: 8 };
    const con = prepareDiorama({ id: "c", bounds, caminos: [{ puntos: [[0, 0], [60, 0]], ancho: 3 }] });
    const sin = prepareDiorama({ id: "s", bounds, caminos: [] });
    const hCon = buildTerrain({ bounds, ground: con.ground }).heightAt(30, 0);
    const hSin = buildTerrain({ bounds, ground: sin.ground }).heightAt(30, 0);
    expect(hSin).toBeGreaterThan(1);
    // Lejos la malla es gruesa: el punto interpola vértices de los costados del camino, por eso no da 0 justo.
    expect(Math.abs(hCon), `${hCon} contra ${hSin}`).toBeLessThan(0.25 * hSin);
  });

  test("el centro de un camino se pinta `camino` (con el temblor) y el pasto lejos de él no", () => {
    const camino = tokenRgb("camino");
    const near = (x: number, z: number): boolean => {
      const v = t.vertexAt(x, z);
      return [0, 1, 2].every((k) => Math.abs((t.colors[v * 3 + k] as number) - (camino[k] as number)) <= 0.08);
    };
    for (const z of [-10, -8, 8, 10]) expect(near(0, z), `0,${z}`).toBe(true);
    expect(near(-12, -4)).toBe(false);
  });

  test("la paleta por zona cambia el color; determinístico", () => {
    const g2 = { ...d.ground, palette: { pasto: "copa" } };
    expect(buildTerrain({ bounds: d.bounds, ground: g2 }).colors).not.toEqual(t.colors);
    expect(buildTerrain({ bounds: d.bounds, ground: d.ground }).colors).toEqual(t.colors);
  });

  test("un río hunde el terreno a lo largo de la curva y se dibuja con agua", () => {
    const bounds = { minX: -8, maxX: 8, minZ: -8, maxZ: 8 };
    const r = prepareDiorama({ id: "r", bounds, rio: [{ puntos: [[-8, 0], [0, 1], [8, 0]], ancho: 2 }] });
    expect(buildTerrain({ bounds, ground: r.ground }).heightAt(0, 1)).toBeLessThan(-0.3);
    expect(buildDioramaScene(r).root.getObjectByName("agua")).toBeDefined();
    expect(buildDioramaScene(prepareDiorama({ id: "seco", bounds })).root.getObjectByName("agua")).toBeUndefined();
  });
});

describe("detalle por zonas", () => {
  const d = testDiorama();
  const det = dioramaDetail(d);

  test("la cantidad exacta de cada tipo (lo que cuenta el estimador) y el empedrado por su largo × ancho", () => {
    const want = { flores: 0, matas: 0, piedritas: 0 };
    for (const z of d.ground.detail) want[z.kind as keyof typeof want] += z.count;
    expect({ flores: det.flores.length, matas: det.matas.length, piedritas: det.piedritas.length }).toEqual(want);
    expect(want).toEqual({ flores: 30, matas: 22, piedritas: 25 });
    expect(det.empedrado.length).toBe(24);
  });

  test("ninguna pieza cae en una celda bloqueada, en el agua ni sobre un camino; cada una en su zona", () => {
    for (const kind of ["flores", "matas", "piedritas"] as const) {
      for (const s of det[kind]) {
        const [c, r] = cellAt(d.grid, s.x, s.z);
        expect(isWalkable(d.grid, c, r), `${kind} ${s.x},${s.z}`).toBe(true);
        for (const p of d.ground.paths) expect(polylineDistance(s.x, s.z, p.line)).toBeGreaterThanOrEqual(p.width / 2);
        for (const pond of d.ground.ponds) expect(insidePolygon(s.x, s.z, pond)).toBe(false);
        expect(d.ground.detail.some((z) => z.kind === kind && Math.hypot(s.x - z.x, s.z - z.z) <= z.radius + 1e-9)).toBe(true);
      }
    }
    const plaza = d.ground.paths.find((p) => p.surface === "empedrado");
    for (const s of det.empedrado) expect(polylineDistance(s.x, s.z, plaza?.line ?? [])).toBeLessThanOrEqual((plaza?.width ?? 0) / 2);
  });

  test("determinístico", () => {
    expect(dioramaDetail(testDiorama())).toEqual(det);
  });
});

/** Lo que el estimador de validate:content necesita: el registro y las apariencias del contenido real. */
const contexto = () => {
  const c = compiledContent().conjunto;
  return {
    source: (id: string): DioramaSource => {
      const d = c.dioramas.find((x) => x.data.id === id)?.data;
      if (!d) throw new Error(`sin diorama ${id}`);
      return d;
    },
    ctx: {
      registro: new Map((c.registroAssets?.data.assets ?? []).map((a) => [a.id, a])),
      apariencias: new Map(c.npcs.map((n) => [n.data.id, n.data.apariencia])),
    },
  };
};

const clipsScene = parseCharacterGlb(served(CLIPS_ASSET), MeshoptDecoder);
const bodies = new Map<string, ReturnType<typeof parseCharacterGlb>>();
async function actor(look: CharacterLook, density: SceneDensity = "full"): Promise<Object3D> {
  const asset = bodyAsset(look.body, density);
  let b = bodies.get(asset);
  if (!b) bodies.set(asset, (b = parseCharacterGlb(served(asset), MeshoptDecoder)));
  const [body, clips] = await Promise.all([b, clipsScene]);
  return buildSkinnedCharacter(body.scene, clips.clips, look, 7).root;
}

/** El grafo real de un diorama con todo a la vista: escena, modelos, personajes, etiqueta y burbuja por NPC, sombras. */
async function realGraph(d: DioramaRuntime, density: SceneDensity = "full"): Promise<Group> {
  const scene = buildDioramaScene(d, density);
  const models = new Group();
  for (const slot of scene.models) models.add(fitToBox(await parseModel(served(slot.asset.slice("modelo/".length)), slot.asset, MeshoptDecoder), slot));
  const actors = await Promise.all([PLAYER_LOOK_ID, ...d.npcs.map((n) => n.id)].map((id) => actor(lookOf(id), density)));
  const labels = d.npcs.map((n) => createNameLabel(n.id, false));
  const bubbles = d.npcs.map(() => createRequestBubble());
  const blobs = buildBlobShadows(scene.blobAnchors);
  blobs.count = scene.blobAnchors.length + actors.length;
  const all = new Group();
  all.add(scene.root, models, ...actors, ...labels, ...bubbles, blobs);
  return all;
}

/**
 * Un diorama sintético pesado para los dientes del estimador: los límites, props y NPCs de test.yaml, sin caminos, agua
 * ni detalle propios, y 400 matas en dos zonas libres (plan estetica-c M7: antes se armaba sobre el fixture de tiles).
 */
const heavyDiorama = (): DioramaSource => {
  const base: Partial<DioramaSource> = { ...contexto().source("test") };
  delete base.caminos;
  delete base.rio;
  delete base.agua;
  delete base.detalle;
  return DioramaSchema.parse({
    ...base,
    detalle: [{ tipo: "matas", centro: [-12, -8], radio: 3, cantidad: 200 }, { tipo: "matas", centro: [12, 8], radio: 3, cantidad: 200 }],
  });
};

describe("el estimador de validate:content es el grafo que dibuja world/", () => {
  test("test.yaml: mismas llamadas y triángulos que estimateBudget sobre el grafo real, dentro de medium", async () => {
    const { source, ctx } = contexto();
    const e = estimarPresupuestoDiorama(source("test"), ctx);
    const real = estimateBudget([await realGraph(testDiorama())]);
    expect(e.faltan).toEqual([]);
    expect(e.total, JSON.stringify(e.partes)).toEqual(real);
    expect(real).toEqual({ drawCalls: 29, triangles: 49164 });
    expect(real.triangles).toBeLessThanOrEqual(50_000);
  });

  test("teeth: un diorama sintético de más se pasa de medium en los dos", async () => {
    const { ctx } = contexto();
    const src = heavyDiorama();
    const e = estimarPresupuestoDiorama(src, ctx);
    const real = estimateBudget([await realGraph(prepareDiorama(src as unknown as DioramaLayout))]);
    expect(e.total).toEqual(real);
    expect(real.triangles).toBeGreaterThan(50_000);
  });
});

/** Lo que dibuja la escena (sin la pasada de sombra, que no es un objeto del grafo). */
const sinSombra = (partes: Record<string, { drawCalls: number; triangles: number }>) =>
  Object.entries(partes).filter(([k]) => k !== PARTE_SOMBRA).reduce((a, [, e]) => ({ drawCalls: a.drawCalls + e.drawCalls, triangles: a.triangles + e.triangles }), { drawCalls: 0, triangles: 0 });

describe("estetica-c M6: el estimador por tier es el grafo que dibuja world/ con la densidad del tier", () => {
  test("test.yaml en low: el grafo reducido real coincide y entra en 60 llamadas / 25k triángulos (todo a la vista = 160 m)", async () => {
    const { source, ctx } = contexto();
    const e = estimarPresupuestoDiorama(source("test"), ctx, "low");
    const real = estimateBudget([await realGraph(testDiorama(), "reduced")]);
    expect(e.faltan).toEqual([]);
    expect(e.total, JSON.stringify(e.partes)).toEqual(real);
    expect(real).toEqual({ drawCalls: 29, triangles: 22302 });
    expect(real.drawCalls).toBeLessThanOrEqual(TIER_BUDGETS.low.maxDrawCalls);
    expect(real.triangles).toBeLessThanOrEqual(TIER_BUDGETS.low.maxTriangles);
  });

  test("test.yaml en high: el grafo completo más la pasada de sombra (una llamada y el cuerpo por personaje)", async () => {
    const { source, ctx } = contexto();
    const e = estimarPresupuestoDiorama(source("test"), ctx, "high");
    const medium = estimarPresupuestoDiorama(source("test"), ctx, "medium");
    expect(sinSombra(e.partes)).toEqual(medium.total);
    expect(e.partes[PARTE_SOMBRA]).toEqual({ drawCalls: 4, triangles: 12310 });
    expect(e.total).toEqual({ drawCalls: 33, triangles: 61474 });
    expect(e.total.triangles).toBeLessThanOrEqual(TIER_BUDGETS.high.maxTriangles);
  });

  test("cada tier de test.yaml entra en su presupuesto (la regla de validate:content)", () => {
    const { source, ctx } = contexto();
    for (const tier of WORLD_TIERS) {
      const { total } = estimarPresupuestoDiorama(source("test"), ctx, tier);
      expect(total.drawCalls, tier).toBeLessThanOrEqual(TIER_BUDGETS[tier].maxDrawCalls);
      expect(total.triangles, tier).toBeLessThanOrEqual(TIER_BUDGETS[tier].maxTriangles);
    }
  });

  test("teeth: un diorama sintético pesado se pasa de low en el estimador y en el grafo reducido real", async () => {
    const { ctx } = contexto();
    const src = heavyDiorama();
    const e = estimarPresupuestoDiorama(src, ctx, "low");
    const real = estimateBudget([await realGraph(prepareDiorama(src as unknown as DioramaLayout), "reduced")]);
    expect(e.total).toEqual(real);
    expect(real.triangles).toBeGreaterThan(TIER_BUDGETS.low.maxTriangles);
  });
});

describe("tabla de costos de @lg/art contra los constructores", () => {
  test("los props por código de la tabla son exactamente los constructores", () => {
    expect(Object.keys(PROP_BUILDERS).sort()).toEqual([...CODE_PROP_ASSETS].sort());
  });

  test("triángulos de cada prop por código, con y sin tinte, a varios tamaños", () => {
    const sizes = [[1, 1, 1], [4, 3, 3], [5, 2.5, 3], [0.6, 4.5, 0.6], [2, 6, 2]] as const;
    for (const asset of CODE_PROP_ASSETS.filter((a) => a !== "codigo/cerco")) {
      for (const [w, h, d] of sizes) {
        for (const tint of [undefined, "casa-2"] as const) {
          expect(tris(buildProp(asset, { w, h, d }, 0, tint)), `${asset} ${w}x${h}x${d} ${tint ?? ""}`).toBe(codePropTriangles(asset, { w, h, d }));
        }
      }
    }
    for (const asset of ["codigo/arbol", "codigo/pino"] as const) {
      expect(tris(buildProp(asset, { w: 0.6, h: TREE_HEIGHT[asset], d: 0.6 }, 1))).toBe(codePropTriangles(asset, { w: 0.6, h: 1, d: 0.6 }));
    }
  });

  test("plan estetica-c M6: la densidad reducida de la tabla es exactamente la de los constructores", () => {
    const sizes = [[1, 1, 1], [4, 3, 3], [5, 2.5, 3], [0.6, 4.5, 0.6], [2, 6, 2]] as const;
    for (const asset of CODE_PROP_ASSETS.filter((a) => a !== "codigo/cerco")) {
      for (const [w, h, d] of sizes) {
        const full = codePropTriangles(asset, { w, h, d });
        const low = codePropTriangles(asset, { w, h, d }, "reduced");
        expect(tris(buildProp(asset, { w, h, d }, 0, "casa-2", "reduced")), `${asset} ${w}x${h}x${d}`).toBe(low);
        expect(low, `${asset} reduce`).toBeLessThan(full);
      }
    }
    for (let len = 0.5; len <= 12; len += 0.5) {
      expect(tris(buildProp("codigo/cerco", { w: 0.2, h: 1, d: len }, 0, undefined, "reduced")), `${len}`).toBe(codePropTriangles("codigo/cerco", { w: 0.2, h: 1, d: len }, "reduced"));
    }
  });

  test("cerco: de 0,5 a 12 m en los dos sentidos", () => {
    for (let len = 0.5; len <= 12; len += 0.5) {
      expect(tris(buildProp("codigo/cerco", { w: 0.2, h: 1, d: len })), `${len}`).toBe(codePropTriangles("codigo/cerco", { w: 0.2, h: 1, d: len }));
      expect(tris(buildProp("codigo/cerco", { w: len, h: 1, d: 0.2 }))).toBe(codePropTriangles("codigo/cerco", { w: len, h: 1, d: 0.2 }));
    }
  });

  test("cabeza: cada combinación de peinado, sombrero y cuello", () => {
    let n = 0;
    for (const hairStyle of HAIR_STYLES) {
      for (const hat of [null, ...HATS]) {
        for (const scarf of [null, ...SCARVES]) {
          const look: CharacterLook = { ...PLAYER_LOOK, hairStyle, hat, scarf };
          expect(tris(characterHeadGeometry(look)), `${hairStyle} ${hat} ${scarf}`).toBe(headTriangles(look));
          n++;
        }
      }
    }
    expect(n).toBe(HAIR_STYLES.length * 4 * 3);
  });

  test("detalle, agua y sombras: los triángulos de las mallas de la escena", () => {
    const scene = buildDioramaScene(testDiorama());
    for (const kind of ["flores", "matas", "piedritas", "empedrado"] as const) {
      const m = scene.root.getObjectByName(`detalle:${kind}`) as InstancedMesh;
      expect(m, kind).toBeInstanceOf(InstancedMesh);
      expect(tris(m.geometry)).toBe(DETAIL_TRIANGLES[kind]);
    }
    expect(tris((scene.root.getObjectByName("agua") as Mesh).geometry)).toBe(2);
    expect(tris(buildBlobShadows([]).geometry)).toBe(2);
  });

  test("un prop codigo/* desconocido sigue fallando en el constructor (y en validate:content)", () => {
    expect(isCodeProp("codigo/molino")).toBe(false);
    expect(() => buildProp("codigo/molino", { w: 1, h: 1, d: 1 })).toThrow(/codigo\/molino/);
  });

  test("el tinte cambia el color principal del prop, no su forma", () => {
    const base = buildProp("codigo/casa" as CodePropAsset, { w: 4, h: 3, d: 3 });
    const tinted = buildProp("codigo/casa", { w: 4, h: 3, d: 3 }, 0, "casa-5");
    expect(Array.from(tinted.getAttribute("position").array)).toEqual(Array.from(base.getAttribute("position").array));
    expect(Array.from(tinted.getAttribute("color").array)).not.toEqual(Array.from(base.getAttribute("color").array));
  });

  test("un prop girado lleva el giro en la malla (un solo ejemplar) y su huella girada", () => {
    const l = LAYOUT();
    const props = (l.props ?? []).map((p) => (p.asset === "codigo/galpon" ? { ...p, rotY: 90 } : p));
    const scene = buildDioramaScene(prepareDiorama({ ...l, props }));
    expect(scene.root.getObjectByName("codigo/galpon")?.rotation.y).toBeCloseTo(Math.PI / 2, 9);
    const rect = scene.obstacles.find((o) => o.kind === "rect" && Math.abs((o.minX + o.maxX) / 2 - 11) < 1e-9 && Math.abs((o.minZ + o.maxZ) / 2 - 7) < 1e-9);
    expect(rect && rect.kind === "rect" ? [rect.maxX - rect.minX, rect.maxZ - rect.minZ] : null).toEqual([3, 5]);
  });
});

describe("burbuja ámbar de pedido", () => {
  const store = () => {
    const s = createGameStore();
    createActions(s).dioramaLoaded(LAYOUT());
    return s;
  };
  const withState = (s: GameState, patch: (s: GameState) => GameState): GameState => patch(s);
  const pedido = (s: GameState, id: string): GameState => ({
    ...s, world: { ...s.world, npcStates: { ...s.world.npcStates, [id]: { cell: null, available: true, requestIcon: true } } },
  });

  test("M5 SEAM: sin un sistema que escriba `requestIcon`, ningún NPC la muestra", () => {
    expect(selectRequestBubbles(store().getState())).toEqual([]);
  });

  test("con `requestIcon` en el estado del NPC aparece; el NPC de la charla en curso no la muestra", () => {
    const s0 = store().getState();
    const s1 = pedido(pedido(s0, "NPC-INES"), "NPC-NELL");
    expect(selectRequestBubbles(s1)).toEqual(["NPC-NELL", "NPC-INES"]);
    const talking = withState(s1, (s) => ({
      ...s,
      session: { ...s.session, phase: "world" },
      player: { ...s.player, position: { x: 0, z: 0 } },
      ui: { ...s.ui, panels: [{ kind: "scene", npcId: "NPC-INES" }] },
    }));
    expect(selectRequestBubbles(talking)).toEqual(["NPC-NELL"]);
    // Un id que no está en el diorama no aparece.
    expect(selectRequestBubbles(pedido(s0, "NPC-OTRO"))).toEqual([]);
  });

  test("Sprite de la clase etiqueta (sin material nuevo), tamaño constante en pantalla y siempre encima", () => {
    const b = createRequestBubble();
    const m = b.material as SpriteMaterial;
    expect(materialKind(m)).toBe("etiqueta");
    expect(m.sizeAttenuation).toBe(false);
    expect(m.depthTest).toBe(false);
    expect(b.renderOrder).toBeGreaterThan(createNameLabel("x", false).renderOrder);
    const [, h] = bubbleScale(30);
    const [, lh] = labelScale(labelLayout("x", false, () => 10), 30);
    expect(h / lh).toBeCloseTo(BUBBLE_LABEL_RATIO, 9);
  });

  test("queda arriba de la etiqueta; flota, y con «reducir movimiento» queda quieta", () => {
    // center.y negativo: el sprite sube por encima de su punto de anclaje más de un alto de etiqueta.
    const still = bubbleCenterY(0, true);
    expect(still).toBeLessThan(-1 / BUBBLE_LABEL_RATIO);
    for (const t of [0.3, 0.9, 1.4]) expect(bubbleCenterY(t, true)).toBe(still);
    const moving = [0.2, 0.45, 0.9, 1.35].map((t) => bubbleCenterY(t, false));
    expect(new Set(moving).size).toBeGreaterThan(1);
    for (const v of moving) expect(Math.abs(v - still)).toBeLessThanOrEqual(BUBBLE_FLOAT.amplitude + 1e-9);
  });
});

describe("apariencia desde el contenido", () => {
  test("el mapa lleva la apariencia de cada ficha (no la de reserva)", () => {
    const s = createGameStore();
    const a = createActions(s);
    const catalog = parseDialogOnlyCatalog(compiledClientContent()["lugares.json"], compiledClientContent()["npcs.json"]);
    a.contentLoaded(catalog);
    a.dioramaLoaded(LAYOUT());
    const view = selectMapView(s.getState());
    expect(view.actors.length).toBe(3);
    for (const actorView of view.actors) {
      expect(actorView.look, actorView.id).toEqual(lookOf(actorView.id));
      expect(BODY_IDS).toContain(actorView.look?.body);
    }
  });

  test("teeth: una apariencia mal formada en npcs.json falla clara (ContentShapeError), sin inventar otra", () => {
    const npcs = structuredClone(compiledClientContent()["npcs.json"]) as { id: string; apariencia: Record<string, unknown> | null }[];
    const ines = npcs.find((n) => n.id === "NPC-INES");
    if (!ines?.apariencia) throw new Error("NPC-INES sin apariencia");
    ines.apariencia["piel"] = "#ffcc99";
    expect(() => parseDialogOnlyCatalog(compiledClientContent()["lugares.json"], npcs)).toThrow(ContentShapeError);
    expect(() => parseDialogOnlyCatalog(compiledClientContent()["lugares.json"], npcs)).toThrow(/NPC-INES: apariencia inválida \(piel/);
  });

  test("sin apariencia (null), el catálogo da null y el mundo dibuja la de reserva", () => {
    const npcs = (structuredClone(compiledClientContent()["npcs.json"]) as { id: string; apariencia: unknown }[]).map((n) => ({ ...n, apariencia: null }));
    const catalog = parseDialogOnlyCatalog(compiledClientContent()["lugares.json"], npcs);
    expect(catalog.npcs.every((n) => n.look === null)).toBe(true);
  });
});
