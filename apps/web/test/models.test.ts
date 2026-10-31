// Plan estetica-c M2: the world/props/gltf.ts loader without GPU (D-016). Every loaded glTF uses the shared toon
// material (A4 stays at 2 surface instances), the pipeline's real models fit their `tam` box, the self-hosted
// meshopt decoder is the exact copy of three's, and the test diorama with the models stays
// within the `medium` budget.
import { prepareDiorama, type DioramaLayout, type DioramaRuntime, cellAt, isWalkable } from "@lg/core";
import { Document, NodeIO } from "@gltf-transform/core";
import { Box3, Group, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import threeDecoderSource from "three/addons/libs/meshopt_decoder.module.js?raw";
import { describe, expect, test } from "vitest";
import { pickDiorama } from "../src/services/content";
import { buildBlobShadows } from "../src/world/actors/BlobShadows";
import { buildChibi } from "../src/world/actors/chibiModel";
import { estimateBudget, withinBudget } from "../src/world/budget/estimate";
import { buildDioramaScene } from "../src/world/dioramas/scene";
import { createNameLabel } from "../src/world/labels/labelSprite";
import { auditMaterials, toonMaterial } from "../src/world/materials/registry";
import { fitToBox, isModelAsset, modelUrl, meshoptDecoderUrl, parseModel } from "../src/world/props/gltf";
import { compiledClientContent, lookOf } from "./helpers";

// Without node:fs (the client tsconfig has no Node types): the served bytes come in through Vite. The .glb as a data URL
// (`?inline`, with assetsInclude only in the test project) and the decoder as text (`?raw`).
const SERVED_MODELS = import.meta.glob("../public/models/**/*.glb", { query: "?inline", import: "default", eager: true }) as Record<string, string>;
const SERVED_DECODERS = import.meta.glob("../public/decoders/*.js", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const fromDataUrl = (url: string): Uint8Array => Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0));
const layout = (): DioramaLayout => pickDiorama(compiledClientContent()["dioramas.json"], "test");
const testDiorama = (): DioramaRuntime => prepareDiorama(layout());
const asBuffer = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
function servedModel(asset: string): ArrayBuffer {
  const key = `../public${modelUrl(asset)}`;
  const url = SERVED_MODELS[key];
  if (url === undefined) throw new Error(`no está servido ${key}`);
  return asBuffer(fromDataUrl(url));
}

/** A fixture .glb with two distinct source materials and vertex color (without meshopt). */
async function fixtureGlb(withColor = true): Promise<ArrayBuffer> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  const tri = (dx: number) => new Float32Array([dx, 0, 0, dx + 1, 0, 0, dx, 1, 0]);
  for (const [name, dx] of [["Rojo", 0], ["Azul", 2]] as const) {
    const prim = doc.createPrimitive()
      .setMaterial(doc.createMaterial(name).setBaseColorFactor(name === "Rojo" ? [1, 0, 0, 1] : [0, 0, 1, 1]))
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(tri(dx)).setBuffer(buffer))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])).setBuffer(buffer));
    if (withColor) prim.setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(new Float32Array(9).fill(0.5)).setBuffer(buffer));
    scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
  }
  return asBuffer(await new NodeIO().writeBinary(doc));
}

describe("M2 cargador: material toon compartido", () => {
  test("un glTF de fixture con 2 materiales de origen queda con un solo material del mundo (toon)", async () => {
    const model = await parseModel(await fixtureGlb(), "fixture", MeshoptDecoder);
    const audit = auditMaterials(model);
    expect(audit.unknown).toEqual([]);
    expect(audit.byKind.toon).toBe(1);
    expect(audit.surfaceInstances).toBe(1);
    model.traverse((o) => { if ("material" in o) expect(o.material).toBe(toonMaterial()); });
  });

  test("teeth: el mismo glTF sin pasar por el cargador trae 2 materiales fuera de la lista", async () => {
    const raw = await new GLTFLoader().parseAsync(await fixtureGlb(), "");
    expect(auditMaterials(raw.scene).unknown.length).toBe(2);
  });

  test("un modelo sin color por vértice (no salió del pipeline) falla nombrando la pieza", async () => {
    await expect(parseModel(await fixtureGlb(false), "fixture/sin-color", MeshoptDecoder)).rejects.toThrow(/modelo fixture\/sin-color: la malla .* no tiene color por vértice/);
  });

  test("urls: modelo/<pack>/<pieza> sale de public/models y el decodificador de public/decoders", () => {
    expect(isModelAsset("modelo/quaternius-farm-buildings/gallinero")).toBe(true);
    expect(isModelAsset("codigo/casa")).toBe(false);
    expect(modelUrl("modelo/quaternius-farm-buildings/gallinero")).toBe("/models/quaternius-farm-buildings/gallinero.glb");
    expect(meshoptDecoderUrl()).toBe("/decoders/meshopt_decoder.module.js");
  });

  test("el decodificador autoalojado es idéntico al de three (si three cambia, copiarlo de nuevo)", () => {
    const served = SERVED_DECODERS["../public/decoders/meshopt_decoder.module.js"];
    expect(served, "falta apps/web/public/decoders/meshopt_decoder.module.js").toBeDefined();
    expect(threeDecoderSource.length).toBeGreaterThan(1000);
    expect(served === threeDecoderSource, "copiá node_modules/three/examples/jsm/libs/meshopt_decoder.module.js a apps/web/public/decoders/").toBe(true);
  });
});

/** The test diorama's modelo/* props, loaded from public/models with meshopt and placed in their box. */
async function loadedModels(d: DioramaRuntime): Promise<{ slot: ReturnType<typeof buildDioramaScene>["models"][number]; model: Object3D }[]> {
  const scene = buildDioramaScene(d);
  return Promise.all(scene.models.map(async (slot) => ({
    slot,
    model: fitToBox(await parseModel(servedModel(slot.asset), slot.asset, MeshoptDecoder), slot),
  })));
}

describe("M2 modelos reales del pipeline en el diorama de prueba", () => {
  test("test.yaml trae al menos 2 props modelo/* y el grafo los deja como huecos a cargar, con su obstáculo", () => {
    const d = testDiorama();
    const scene = buildDioramaScene(d);
    const fromLayout = (layout().props ?? []).filter((p) => isModelAsset(p.asset)).map((p) => p.asset).sort();
    expect(fromLayout.length).toBeGreaterThanOrEqual(2);
    expect(scene.models.map((m) => m.asset).sort()).toEqual(fromLayout);
    for (const m of scene.models) {
      expect(scene.obstacles.some((o) => o.kind === "rect" && Math.abs((o.minX + o.maxX) / 2 - m.x) < 1e-9 && Math.abs((o.minZ + o.maxZ) / 2 - m.z) < 1e-9), m.asset).toBe(true);
      const [c, r] = cellAt(d.grid, m.x, m.z);
      expect(isWalkable(d.grid, c, r), `${m.asset} bloquea su huella`).toBe(false);
    }
  });

  test("cada modelo entra en su caja tam con escala uniforme, apoyado en el suelo y con el material toon", async () => {
    for (const { slot, model } of await loadedModels(testDiorama())) {
      const bb = new Box3().setFromObject(model);
      const size = bb.getSize(new Vector3());
      expect(size.x, slot.asset).toBeLessThanOrEqual(slot.w + 1e-3);
      expect(size.y, slot.asset).toBeLessThanOrEqual(slot.h + 1e-3);
      expect(size.z, slot.asset).toBeLessThanOrEqual(slot.d + 1e-3);
      const fill = Math.max(size.x / slot.w, size.y / slot.h, size.z / slot.d);
      expect(fill, slot.asset).toBeCloseTo(1, 3); // touches the box on at least one axis
      expect(bb.min.y, slot.asset).toBeCloseTo(slot.y, 3);
      const c = bb.getCenter(new Vector3());
      expect(c.x, slot.asset).toBeCloseTo(slot.x, 3);
      expect(c.z, slot.asset).toBeCloseTo(slot.z, 3);
      expect(auditMaterials(model).byKind.toon).toBe(1);
    }
  });

  test("con los modelos cargados: 2 instancias de superficie como máximo y dentro de medium (≤ 120 llamadas, ≤ 50k triángulos)", async () => {
    const d = testDiorama();
    const scene = buildDioramaScene(d);
    const models = new Group();
    for (const { model } of await loadedModels(d)) models.add(model);
    const actors = ["player", ...d.npcs.map((n) => n.id)].map((id) => buildChibi(lookOf(id)).root);
    const labels = d.npcs.map((n) => createNameLabel(n.id, false));
    const blobs = buildBlobShadows(scene.blobAnchors);
    blobs.count = scene.blobAnchors.length + actors.length;
    const all = new Group();
    all.add(scene.root, models, ...actors, ...labels, blobs);
    const audit = auditMaterials(all);
    expect(audit.unknown).toEqual([]);
    expect(audit.surfaceInstances).toBeLessThanOrEqual(2);
    const withModels = estimateBudget([all]);
    const without = estimateBudget([scene.root, ...actors, ...labels, blobs]);
    expect(withModels.drawCalls - without.drawCalls).toBe(models.children.length); // one call per piece (join)
    expect(withinBudget(withModels, { maxDrawCalls: 120, maxTriangles: 50_000 }), JSON.stringify(withModels)).toBe(true);
  });
});
