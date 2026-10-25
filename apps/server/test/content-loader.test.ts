// FD0 A7: el cargador del servidor no observa nada sin LG_DEV_CONTENT_WATCH; con la variable relee para la próxima escena.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdirSync } from "node:fs";
import { createContentLoader, resolverDirUniverso, UNIVERSO_DEFECTO, type WatchDir } from "../src/content/loader.ts";

let dir: string;
const write = (name: string, data: unknown): void => writeFileSync(join(dir, name), JSON.stringify(data));

/** fs.watch falso: registra quién observa y deja disparar el cambio a mano. */
const fakeWatch = () => {
  const calls: string[] = [];
  let fire: (() => void) | null = null;
  const watch: WatchDir = (d, onChange) => {
    calls.push(d);
    fire = onChange;
    return { close: () => { fire = null; } };
  };
  return { watch, calls, change: () => fire?.() };
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lg-loader-"));
  write("npcs.json", [{ id: "NPC-NELL", nombre: "Nell" }]);
  write("indice.json", { modo: "dev" });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("apps/server/src/content/loader.ts", () => {
  test("lee todos los JSON compilados", () => {
    const loader = createContentLoader({ dir, env: {} });
    expect(Object.keys(loader.forNextScene())).toEqual(["indice.json", "npcs.json"]);
  });

  test("sin LG_DEV_CONTENT_WATCH no observa y no relee", () => {
    const w = fakeWatch();
    const loader = createContentLoader({ dir, env: { LG_DEV_CONTENT_WATCH: "0" }, watch: w.watch });
    expect(loader.watching).toBe(false);
    expect(w.calls).toEqual([]);
    const first = loader.forNextScene();
    write("npcs.json", [{ id: "NPC-NELL", nombre: "Nelly" }]);
    expect(loader.forNextScene()).toBe(first);
  });

  test("con LG_DEV_CONTENT_WATCH=1 la escena en curso conserva su contenido y la próxima ve el cambio", () => {
    const w = fakeWatch();
    const loader = createContentLoader({ dir, env: { LG_DEV_CONTENT_WATCH: "1" }, watch: w.watch });
    expect(loader.watching).toBe(true);
    expect(w.calls).toEqual([dir]);
    const sceneA = loader.forNextScene();
    write("npcs.json", [{ id: "NPC-NELL", nombre: "Nelly" }]);
    w.change();
    expect(sceneA["npcs.json"]).toEqual([{ id: "NPC-NELL", nombre: "Nell" }]);
    const sceneB = loader.forNextScene();
    expect(sceneB["npcs.json"]).toEqual([{ id: "NPC-NELL", nombre: "Nelly" }]);
    expect(loader.forNextScene()).toBe(sceneB);
    loader.close();
  });

  // M1 AC3 (D-806): el loader selecciona el universo por session.universeId; unset ⇒ U-CAMPESINO.
  test("resolverDirUniverso: unset y U-CAMPESINO caen en la raíz legacy; otro id en su subcarpeta", () => {
    expect(resolverDirUniverso("/base")).toBe("/base");
    expect(resolverDirUniverso("/base", UNIVERSO_DEFECTO)).toBe("/base");
    expect(resolverDirUniverso("/base", "U-GALEANO")).toBe(join("/base", "U-GALEANO"));
  });

  test("carga el id correcto según universeId (unset = campesino raíz, U-GALEANO = su namespace)", () => {
    // Raíz = U-CAMPESINO (verbatim). Subcarpeta U-GALEANO/ = el build con --universe=U-GALEANO.
    write("npcs.json", [{ id: "NPC-HARLAN", universo: "campesino" }]);
    write("indice.json", { modo: "dev" });
    mkdirSync(join(dir, "U-GALEANO"));
    writeFileSync(join(dir, "U-GALEANO", "npcs.json"), JSON.stringify([{ id: "NPC-POTOSI", universo: "galeano" }]));
    writeFileSync(join(dir, "U-GALEANO", "indice.json"), JSON.stringify({ modo: "dev" }));

    const campesino = createContentLoader({ dir, env: {} }).forNextScene();
    expect(campesino["npcs.json"]).toEqual([{ id: "NPC-HARLAN", universo: "campesino" }]);

    const galeano = createContentLoader({ dir: join(dir, "U-GALEANO"), env: {} }).forNextScene();
    expect(galeano["npcs.json"]).toEqual([{ id: "NPC-POTOSI", universo: "galeano" }]);
  });

  test("si la relectura falla a mitad de una escritura, sigue el último bueno y reintenta", () => {
    const w = fakeWatch();
    const loader = createContentLoader({ dir, env: { LG_DEV_CONTENT_WATCH: "1" }, watch: w.watch });
    const good = loader.forNextScene();
    writeFileSync(join(dir, "npcs.json"), "{ a medio escribir");
    w.change();
    const warn = console.warn;
    console.warn = () => {};
    try {
      expect(loader.forNextScene()).toBe(good);
    } finally {
      console.warn = warn;
    }
    write("npcs.json", []);
    expect(loader.forNextScene()["npcs.json"]).toEqual([]);
  });
});
