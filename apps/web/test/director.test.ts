// FD0 A3, A4 y el cliente del modo director: selectDirectorSnapshot sobre estados de store de fixture, emisores con
// reloj falso, eventos del diario y la doble llave de boot/dev.ts. Sin navegador ni servidor (D-016).
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  DIALOGUE_CAP, DirectorSnapshotSchema, JournalEventSchema, PATH_CAP, SNAPSHOT_EVENT, type DirectorSnapshot,
} from "@lg/protocol/director";
import type { DioramaLayout } from "@lg/core";
import { runDevHook } from "../src/boot/dev";
import {
  advanceHistory, createJournalEmitter, createSnapshotEmitter, emptyHistory, journalEvents, MIN_INTERVAL_MS,
  newSessionId, selectDirectorSnapshot, startDirector, type DirectorClock, type DirectorHistory,
} from "../src/dev/director";
import { pickDiorama } from "../src/services/content";
import { createActions } from "../src/state/actions";
import { createGameStore, type GameState, type GameStore } from "../src/state/store";
import { compiledClientContent } from "./helpers";

const AT = "2026-10-07T12:00:00.000Z";
const META = { sessionId: "20261007-120000-abcd", at: AT };
const LAYOUT = pickDiorama(compiledClientContent()["dioramas.json"], "test") as DioramaLayout;

/** Un store con el mapa de prueba cargado y el jugador en el spawn. */
const mapStore = (): { store: GameStore; actions: ReturnType<typeof createActions> } => {
  const store = createGameStore();
  const actions = createActions(store);
  actions.dioramaLoaded(LAYOUT);
  return { store, actions };
};

const at = (s: GameState, x: number, z: number): GameState => ({ ...s, player: { ...s.player, position: { x, z } } });
const withScene = (s: GameState, npcId: string, lines: string[] = []): GameState => ({
  ...s,
  ui: { ...s.ui, panels: [{ kind: "scene", npcId }] },
  dialogue: { ...s.dialogue, subtitles: { final: lines, partial: null } },
});

/** Reloj falso: `advance(ms)` corre los timers vencidos en orden. */
const fakeClock = () => {
  let now = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let ids = 0;
  const clock: DirectorClock = {
    now: () => now,
    setTimeout: (fn, ms) => { const id = ++ids; timers.push({ at: now + ms, fn, id }); return id; },
    clearTimeout: (h) => { timers = timers.filter((t) => t.id !== h); },
  };
  const advance = (ms: number): void => {
    const end = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((t) => t !== due);
      now = due.at;
      due.fn();
    }
    now = end;
  };
  return { clock, advance, now: () => now };
};

describe("A3: selectDirectorSnapshot sobre estados de fixture", () => {
  test("estado inicial (sin mapa ni escena): scene null, campos vacíos y valida", () => {
    const s = createGameStore().getState();
    const snap = selectDirectorSnapshot(s, advanceHistory(emptyHistory(), s, AT), META);
    expect(snap.scene).toBeNull();
    expect(snap.player).toEqual({ tile: null, pos: null, facing: "s" });
    expect(snap).toMatchObject({ diorama: null, region: null, nearby: [], path: [], npcsTalked: [], dialogue: [], lastPick: null });
    expect(DirectorSnapshotSchema.safeParse(snap).success).toBe(true);
  });

  test("en el mapa sin escena: diorama, tile de 1 m bajo el jugador, sin escena; valida", () => {
    const { store } = mapStore();
    const s = at(store.getState(), 12.7, 8.2);
    const snap = selectDirectorSnapshot(s, advanceHistory(emptyHistory(), s, AT), META);
    expect(snap.diorama).toBe("test");
    expect(snap.player.tile).toEqual({ x: 12, y: 8 });
    expect(snap.player.pos).toEqual({ x: 12.7, z: 8.2 });
    expect(snap.scene).toBeNull();
    expect(snap.path).toEqual([{ tile: { x: 12, y: 8 }, at: AT }]);
    expect(DirectorSnapshotSchema.safeParse(snap).success).toBe(true);
  });

  test("con una escena abierta: scene con paso y turno, npcsTalked y las líneas finales", () => {
    const { store } = mapStore();
    const s = withScene(store.getState(), "NPC-NELL", ["Morning!", "Hi, Nell."]);
    const h = advanceHistory(emptyHistory(), s, AT);
    const snap = selectDirectorSnapshot(s, h, META);
    expect(snap.scene).toEqual({ missionId: null, sceneId: null, step: "idle", turnIndex: 2 });
    expect(snap.npcsTalked).toEqual(["NPC-NELL"]);
    expect(snap.dialogue.map((d) => d.text)).toEqual(["Morning!", "Hi, Nell."]);
    expect(snap.dialogue[0]).toEqual({ turnId: "NPC-NELL#0", speaker: "NPC-NELL", text: "Morning!", at: AT });
    expect(DirectorSnapshotSchema.safeParse(snap).success).toBe(true);
    // Al cerrar la escena, scene vuelve a null pero el historial queda.
    const closed = { ...s, ui: { ...s.ui, panels: [] } };
    const after = selectDirectorSnapshot(closed, advanceHistory(h, closed, AT), META);
    expect(after.scene).toBeNull();
    expect(after.npcsTalked).toEqual(["NPC-NELL"]);
    expect(after.dialogue).toHaveLength(2);
  });

  test(`path: solo cambios de tile y a lo sumo ${PATH_CAP} (sale el más viejo)`, () => {
    const { store } = mapStore();
    const base = store.getState();
    let h: DirectorHistory = emptyHistory();
    // Moverse dentro del mismo tile no agrega nada y devuelve el mismo historial.
    h = advanceHistory(h, at(base, 1.1, 1.1), AT);
    const same = advanceHistory(h, at(base, 1.9, 1.4), AT);
    expect(same).toBe(h);
    expect(h.path).toHaveLength(1);
    for (let i = 0; i < PATH_CAP + 20; i++) h = advanceHistory(h, at(base, 1 + (i % 2), 2 + Math.floor(i / 2)), `2026-10-07T12:00:${String(i % 60).padStart(2, "0")}.000Z`);
    expect(h.path).toHaveLength(PATH_CAP);
    expect(h.path[h.path.length - 1]?.tile).toEqual({ x: 1 + ((PATH_CAP + 19) % 2), y: 2 + Math.floor((PATH_CAP + 19) / 2) });
    expect(h.path[0]?.tile).not.toEqual({ x: 1, y: 1 });
    expect(DirectorSnapshotSchema.safeParse(selectDirectorSnapshot(base, h, META)).success).toBe(true);
  });

  test(`dialogue: las últimas ${DIALOGUE_CAP} líneas finales, a través de varias escenas`, () => {
    const { store } = mapStore();
    let h = emptyHistory();
    const many = Array.from({ length: 15 }, (_, i) => `line ${i}`);
    h = advanceHistory(h, withScene(store.getState(), "NPC-NELL", many), AT);
    h = advanceHistory(h, withScene(store.getState(), "NPC-INES", many.slice(0, 10)), AT);
    expect(h.dialogue).toHaveLength(DIALOGUE_CAP);
    expect(h.dialogue[0]).toMatchObject({ speaker: "NPC-NELL", text: "line 5" });
    expect(h.dialogue[DIALOGUE_CAP - 1]).toMatchObject({ speaker: "NPC-INES", text: "line 9" });
    expect(h.npcsTalked).toEqual(["NPC-NELL", "NPC-INES"]);
  });

  test("flags, fundaciones, red y lastPick salen del store tal cual", () => {
    const s0 = createGameStore().getState();
    const s: GameState = {
      ...s0,
      world: { ...s0.world, flags: { cartel_leido: true }, foundations: { "SITIO-PARADA": "idea" }, network: { intros: ["intro:NPC-MAYA"], links: [] }, lastPick: { x: 1, z: 2 } },
    };
    const snap = selectDirectorSnapshot(s, emptyHistory(), META);
    expect(snap).toMatchObject({ worldFlags: { cartel_leido: true }, foundations: { "SITIO-PARADA": "idea" }, network: ["intro:NPC-MAYA"], lastPick: { x: 1, z: 2 } });
    expect(DirectorSnapshotSchema.safeParse(snap).success).toBe(true);
  });
});

describe("A4: emisor con reloj falso", () => {
  const snap = (x: number, atIso = AT): DirectorSnapshot => ({
    ...selectDirectorSnapshot(createGameStore().getState(), emptyHistory(), META),
    at: atIso,
    player: { tile: { x, y: 0 }, pos: { x, z: 0 }, facing: "s" },
  });

  test("con un cambio en cada cuadro (60/s durante 3 s): ≤ 4 envíos en cualquier ventana de 1 s, y el último estado llega", () => {
    const { clock, advance } = fakeClock();
    const sent: { t: number; s: DirectorSnapshot }[] = [];
    const e = createSnapshotEmitter((s) => sent.push({ t: clock.now(), s }), clock);
    for (let i = 0; i < 180; i++) {
      e.push(snap(i));
      advance(1000 / 60);
    }
    advance(1000);
    for (const { t } of sent) expect(sent.filter((x) => x.t >= t && x.t < t + 1000).length).toBeLessThanOrEqual(4);
    expect(sent.length).toBeGreaterThanOrEqual(11);
    expect(sent[sent.length - 1]?.s.player.pos?.x).toBe(179);
    for (let i = 1; i < sent.length; i++) expect((sent[i]?.t ?? 0) - (sent[i - 1]?.t ?? 0)).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
  });

  test("sin cambios no manda nada (aunque cambie la marca de tiempo)", () => {
    const { clock, advance } = fakeClock();
    const sent: DirectorSnapshot[] = [];
    const e = createSnapshotEmitter((s) => sent.push(s), clock);
    e.push(snap(1));
    expect(sent).toHaveLength(1);
    for (let i = 0; i < 100; i++) {
      e.push(snap(1, `2026-10-07T12:01:${String(i % 60).padStart(2, "0")}.000Z`));
      advance(50);
    }
    advance(2000);
    expect(sent).toHaveLength(1);
  });

  test("un cambio que vuelve atrás dentro de la ventana no se manda", () => {
    const { clock, advance } = fakeClock();
    const sent: DirectorSnapshot[] = [];
    const e = createSnapshotEmitter((s) => sent.push(s), clock);
    e.push(snap(1));
    e.push(snap(2));
    e.push(snap(1));
    advance(1000);
    expect(sent).toHaveLength(1);
  });

  test("stop cancela el envío pendiente", () => {
    const { clock, advance } = fakeClock();
    const sent: DirectorSnapshot[] = [];
    const e = createSnapshotEmitter((s) => sent.push(s), clock);
    e.push(snap(1));
    e.push(snap(2));
    e.stop();
    advance(1000);
    expect(sent).toHaveLength(1);
  });

  test("el emisor del diario manda lotes (a lo sumo uno cada 250 ms) y flush fuerza el envío", () => {
    const { clock, advance } = fakeClock();
    const batches: number[] = [];
    const j = createJournalEmitter((ev) => batches.push(ev.length), clock);
    j.add([{ type: "interact", at: AT, targetId: "NPC-NELL" }]);
    j.add([{ type: "interact", at: AT, targetId: "NPC-INES" }]);
    j.add([]);
    expect(batches).toEqual([]);
    advance(MIN_INTERVAL_MS);
    expect(batches).toEqual([2]);
    j.add([{ type: "session.end", at: AT }]);
    j.flush();
    expect(batches).toEqual([2, 1]);
  });
});

describe("eventos del diario (03 §6.5.2)", () => {
  test("moverse de tile, abrir y cerrar una escena con líneas: los eventos validan con seq", () => {
    const { store } = mapStore();
    const s0 = at(store.getState(), 1.5, 1.5);
    const s1 = at(s0, 2.5, 1.5);
    const s2 = withScene(s1, "NPC-NELL", []);
    const s3 = withScene(s1, "NPC-NELL", ["Morning!"]);
    const s4 = { ...s3, ui: { ...s3.ui, panels: [] } };
    const events = [s0, s1, s2, s3, s4].flatMap((s, i, all) => journalEvents(i === 0 ? null : (all[i - 1] as GameState), s, AT));
    expect(events.map((e) => e.type)).toEqual(["move.cell", "move.cell", "interact", "scene.start", "line", "scene.end"]);
    events.forEach((e, seq) => expect(JournalEventSchema.safeParse({ ...e, seq }).success, e.type).toBe(true));
  });

  test("el mismo estado no produce eventos", () => {
    const { store } = mapStore();
    const s = store.getState();
    expect(journalEvents(s, s, AT)).toEqual([]);
  });
});

describe("startDirector: manda el snapshot y el diario por el canal de HMR", () => {
  test("session.start, snapshot inicial válido, y movimientos limitados por el emisor", () => {
    const { store, actions } = mapStore();
    const { clock, advance } = fakeClock();
    const sent: { event: string; data: unknown }[] = [];
    const page = new EventTarget();
    const stop = startDirector({ hot: { send: (event, data) => sent.push({ event, data }) }, store, clock, sessionId: META.sessionId, pageEvents: page });
    const snaps = () => sent.filter((m) => m.event === SNAPSHOT_EVENT).map((m) => m.data as DirectorSnapshot);
    expect(snaps()).toHaveLength(1);
    expect(DirectorSnapshotSchema.safeParse(snaps()[0]).success).toBe(true);
    actions.enterScene("NPC-NELL");
    advance(300);
    expect(snaps()[snaps().length - 1]?.npcsTalked).toEqual(["NPC-NELL"]);
    const journal = sent.filter((m) => m.event === "lg:director:journal").flatMap((m) => (m.data as { sessionId: string; events: { type: string }[] }).events);
    expect(journal.map((e) => e.type)).toEqual(["session.start", "move.cell", "interact", "scene.start"]);
    page.dispatchEvent(new Event("pagehide"));
    const last = sent[sent.length - 1]?.data as { events: { type: string }[] };
    expect(last.events.map((e) => e.type)).toEqual(["session.end"]);
    const count = sent.length;
    stop();
    actions.closePanel();
    advance(1000);
    expect(sent).toHaveLength(count);
  });

  test("newSessionId: ordenable por fecha y seguro como nombre de archivo", () => {
    const id = newSessionId(Date.parse("2026-10-07T18:30:12.000Z"), () => 0.123456);
    expect(id).toMatch(/^20261007-183012-[a-z0-9]{4}$/);
  });
});

describe("doble llave de boot/dev.ts (03 §6.5.1 punto 1)", () => {
  afterEach(() => vi.unstubAllEnvs());
  const deps = () => {
    const { store, actions } = mapStore();
    const sent: string[] = [];
    const hot = { send: (event: string) => sent.push(event), on: () => undefined };
    return { store, actions, sent, hot };
  };

  test("sin VITE_LG_DIRECTOR=1 no carga nada (aunque haya HMR)", async () => {
    vi.stubEnv("VITE_LG_DIRECTOR", "");
    const d = deps();
    expect(await runDevHook({ store: d.store, actions: d.actions, baseUrl: "/", hot: d.hot })).toBeNull();
    expect(d.sent).toEqual([]);
  });

  test("con DEV false no carga nada aunque la variable esté", async () => {
    vi.stubEnv("VITE_LG_DIRECTOR", "1");
    vi.stubEnv("DEV", false);
    const d = deps();
    expect(await runDevHook({ store: d.store, actions: d.actions, baseUrl: "/", hot: d.hot })).toBeNull();
    expect(d.sent).toEqual([]);
  });

  test("con las dos llaves arranca el modo director y devuelve con qué detenerlo", async () => {
    vi.stubEnv("VITE_LG_DIRECTOR", "1");
    const d = deps();
    const stop = await runDevHook({ store: d.store, actions: d.actions, baseUrl: "/", hot: d.hot });
    expect(stop).toBeTypeOf("function");
    expect(d.sent).toContain(SNAPSHOT_EVENT);
    stop?.();
  });
});

describe("plan estetica-c M6: contadores del renderer en la instantánea", () => {
  const SAMPLE = { drawCalls: 29, triangles: 22302, textures: 9, geometries: 41, fps: 30 };

  test("con el lector, el snapshot lleva `render` y valida; sin él, no lleva la clave (el v1 de siempre)", () => {
    const { store } = mapStore();
    const s = store.getState();
    const h = advanceHistory(emptyHistory(), s, AT);
    const withRender = selectDirectorSnapshot(s, h, { ...META, render: SAMPLE });
    expect(withRender.render).toEqual(SAMPLE);
    expect(DirectorSnapshotSchema.safeParse(withRender).success).toBe(true);
    expect(DirectorSnapshotSchema.safeParse(selectDirectorSnapshot(s, h, { ...META, render: null })).success).toBe(true);
    expect("render" in selectDirectorSnapshot(s, h, META)).toBe(false);
  });

  test("teeth: un contador negativo o un campo de más no valida (objeto estricto)", () => {
    const s = createGameStore().getState();
    const snap = selectDirectorSnapshot(s, advanceHistory(emptyHistory(), s, AT), META);
    expect(DirectorSnapshotSchema.safeParse({ ...snap, render: { ...SAMPLE, drawCalls: -1 } }).success).toBe(false);
    expect(DirectorSnapshotSchema.safeParse({ ...snap, render: { ...SAMPLE, audio: 1 } }).success).toBe(false);
  });

  test("startDirector re-arma el snapshot cada segundo con la muestra nueva aunque el store no cambie, y para al detenerse", () => {
    const { store } = mapStore();
    const { clock, advance } = fakeClock();
    const sent: DirectorSnapshot[] = [];
    let sample = { ...SAMPLE };
    const stop = startDirector({
      hot: { send: (event, data) => { if (event === SNAPSHOT_EVENT) sent.push(data as DirectorSnapshot); } },
      store, clock, sessionId: META.sessionId, render: () => sample,
    });
    advance(10);
    expect(sent.at(-1)?.render).toEqual(SAMPLE);
    sample = { ...SAMPLE, drawCalls: 33, fps: 58.5 };
    advance(1000);
    expect(sent.at(-1)?.render).toEqual(sample);
    const count = sent.length;
    stop();
    sample = { ...SAMPLE, drawCalls: 99 };
    advance(5000);
    expect(sent.length).toBe(count);
  });
});
