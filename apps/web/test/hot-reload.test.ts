// FD0 A6 (lado del cliente): `lg:content:updated` → services/content vuelve a pedir el JSON compilado → contentReloaded.
// Con una escena abierta el cambio espera: aplica en la PRÓXIMA escena. Un diorama tocado re-deriva grilla y capas.
import { describe, expect, test, vi } from "vitest";
import { isWalkable, type DioramaLayout } from "@lg/core";
import { pickDiorama, type FetchJson } from "../src/services/content";
import { CONTENT_UPDATED, startContentHotReload } from "../src/services/content/hotReload";
import { createActions } from "../src/state/actions";
import { createGameStore } from "../src/state/store";
import { compiledClientContent } from "./helpers";

const BASE = compiledClientContent();
const LAYOUT = pickDiorama(BASE["dioramas.json"], "test") as DioramaLayout;

/** Contenido "recompilado": Nell cambia de nombre y el diorama suma un bloque que tapa el spawn. */
const edited = (): Record<string, unknown> => {
  const npcs = (BASE["npcs.json"] as { id: string; nombre: string }[]).map((n) => (n.id === "NPC-NELL" ? { ...n, nombre: "Nell Editada" } : n));
  const layout = structuredClone(LAYOUT) as DioramaLayout & { props?: unknown[] };
  const spawn = layout.spawn ?? [0, 0, 0];
  layout.props = [...(layout.props ?? []), { asset: "bloque", pos: [spawn[0], 0, spawn[2]], tam: [1, 1, 1] }];
  return { ...BASE, "npcs.json": npcs, "dioramas.json": (BASE["dioramas.json"] as DioramaLayout[]).map((d) => (d.id === "test" ? layout : d)) };
};

const fakeHot = () => {
  const handlers = new Map<string, (data: unknown) => void>();
  return {
    hot: { on: (e: string, cb: (d: unknown) => void) => { handlers.set(e, cb); }, off: (e: string) => { handlers.delete(e); } },
    emit: (data: unknown) => handlers.get(CONTENT_UPDATED)?.(data),
    listening: () => handlers.has(CONTENT_UPDATED),
  };
};

const setup = (files: Record<string, unknown>) => {
  const store = createGameStore();
  const actions = createActions(store);
  actions.contentLoaded({ regionName: "x", places: [], npcs: [{ id: "NPC-NELL", name: "Nell", placeId: "p" }] });
  actions.dioramaLoaded(LAYOUT);
  const fetchJson: FetchJson = (url) => {
    const name = url.slice(url.lastIndexOf("/") + 1);
    return name in files ? Promise.resolve(files[name]) : Promise.reject(new Error(`404 ${url}`));
  };
  const spy = vi.spyOn(actions, "contentReloaded");
  const h = fakeHot();
  const stop = startContentHotReload({ hot: h.hot, store, actions, baseUrl: "/", fetchJson });
  return { store, actions, spy, ...h, stop };
};

const nellName = (store: ReturnType<typeof createGameStore>) => store.getState().world.npcs.find((n) => n.id === "NPC-NELL")?.name;

describe("A6: recarga en caliente en el cliente", () => {
  test("sin escena: el aviso con ids recarga el catálogo y despacha contentReloaded(ids)", async () => {
    const t = setup(edited());
    t.emit({ ids: ["NPC-NELL"] });
    await vi.waitFor(() => expect(t.spy).toHaveBeenCalledTimes(1));
    expect(t.spy.mock.calls[0]?.[0]).toEqual(["NPC-NELL"]);
    expect(nellName(t.store)).toBe("Nell Editada");
    // El diorama no estaba entre los ids: no se vuelve a pedir ni cambia.
    expect(t.spy.mock.calls[0]?.[1].diorama).toBeNull();
    t.stop();
    expect(t.listening()).toBe(false);
  });

  test("con una escena abierta el cambio espera y aplica cuando se cierra (la próxima escena lo ve)", async () => {
    const t = setup(edited());
    t.actions.enterScene("NPC-NELL");
    t.emit({ ids: ["NPC-NELL", "M1.1-E1"] });
    await new Promise((r) => setTimeout(r, 20));
    expect(t.spy).not.toHaveBeenCalled();
    expect(nellName(t.store)).toBe("Nell");
    t.actions.closePanel();
    expect(t.spy).toHaveBeenCalledTimes(1);
    expect(nellName(t.store)).toBe("Nell Editada");
  });

  test("dos avisos en la misma escena: un solo despacho con la unión de ids", async () => {
    const t = setup(edited());
    t.actions.enterScene("NPC-NELL");
    t.emit({ ids: ["NPC-NELL"] });
    t.emit({ ids: ["test"] });
    await new Promise((r) => setTimeout(r, 20));
    t.actions.closePanel();
    expect(t.spy).toHaveBeenCalledTimes(1);
    expect(t.spy.mock.calls[0]?.[0]).toEqual(["NPC-NELL", "test"]);
    expect(t.spy.mock.calls[0]?.[1].diorama).not.toBeNull();
  });

  test("un diorama tocado re-deriva grilla y capas; si el jugador queda dentro de un bloque pasa a la celda libre más cercana", async () => {
    const t = setup(edited());
    const before = t.store.getState().world.diorama;
    t.emit({ ids: ["test"] });
    await vi.waitFor(() => expect(t.spy).toHaveBeenCalledTimes(1));
    const after = t.store.getState().world.diorama;
    expect(after).not.toBe(before);
    expect(after?.boxes.length).toBe((before?.boxes.length ?? 0) + 1);
    expect(after?.grid.walkable).not.toEqual(before?.grid.walkable);
    const { position, cell } = t.store.getState().player;
    expect(position).not.toEqual({ x: LAYOUT.spawn?.[0], z: LAYOUT.spawn?.[2] });
    expect(after && cell && isWalkable(after.grid, cell[0], cell[1])).toBe(true);
  });

  test("un cambio de diorama que no bloquea al jugador lo deja donde está", () => {
    const store = createGameStore();
    const actions = createActions(store);
    actions.dioramaLoaded(LAYOUT);
    const pos = store.getState().player.position;
    actions.contentReloaded(["test"], { catalog: null, diorama: structuredClone(LAYOUT) });
    expect(store.getState().player.position).toBe(pos);
    expect(store.getState().world.diorama).not.toBeNull();
  });

  test("ids vacíos o con otra forma no hacen nada; un fetch que falla deja el último contenido bueno", async () => {
    const t = setup({});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    t.emit({ nada: true });
    t.emit({ ids: ["NPC-NELL"] });
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(t.spy).not.toHaveBeenCalled();
    expect(nellName(t.store)).toBe("Nell");
    warn.mockRestore();
    const s = t.store.getState();
    t.actions.contentReloaded([], { catalog: null, diorama: null });
    expect(t.store.getState()).toBe(s);
  });
});
