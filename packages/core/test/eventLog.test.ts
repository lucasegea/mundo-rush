import { describe, expect, test } from "vitest";
import {
  createEventLog,
  createManualClock,
  EventLogError,
  reducerFrom,
  type LoggedEvent,
} from "../src/index";

// Test events with made-up ids (no personal data).
type Ev =
  | { readonly type: "pocion"; readonly tercios: number }
  | { readonly type: "nota"; readonly texto: string; readonly tags: readonly string[] };

const setup = () => {
  const clock = createManualClock(100);
  const log = createEventLog<Ev>(clock);
  return { clock, log };
};

describe("EventLog", () => {
  test("append numera desde 1 y sella el instante del Clock inyectado", () => {
    const { clock, log } = setup();
    const a = log.append({ type: "pocion", tercios: 1 });
    clock.advance(50);
    const b = log.append({ type: "nota", texto: "x", tags: [] });
    expect(a).toEqual({ seq: 1, at: 100, event: { type: "pocion", tercios: 1 } });
    expect(b.seq).toBe(2);
    expect(b.at).toBe(150);
    expect(log.size).toBe(2);
  });

  test("es append-only: los registros y los eventos quedan congelados", () => {
    const { log } = setup();
    const entry = log.append({ type: "nota", texto: "a", tags: ["t"] });
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.event)).toBe(true);
    if (entry.event.type === "nota") expect(Object.isFrozen(entry.event.tags)).toBe(true);
    expect(() => {
      (entry as { seq: number }).seq = 9;
    }).toThrow(TypeError);
  });

  test("entries() devuelve una copia: mutarla no toca el log", () => {
    const { log } = setup();
    log.append({ type: "pocion", tercios: 1 });
    const copy = log.entries() as LoggedEvent<Ev>[];
    copy.pop();
    expect(log.size).toBe(1);
    expect(log.entries()).toHaveLength(1);
  });

  test("since(seq) devuelve solo lo posterior", () => {
    const { log } = setup();
    for (let i = 1; i <= 4; i++) log.append({ type: "pocion", tercios: i });
    expect(log.since(2).map((e) => e.seq)).toEqual([3, 4]);
    expect(log.since(0)).toHaveLength(4);
    expect(log.since(-3)).toHaveLength(4);
    expect(log.since(4)).toEqual([]);
  });

  test("replay pliega en orden y es determinístico", () => {
    const { log } = setup();
    log.append({ type: "pocion", tercios: 1 });
    log.append({ type: "nota", texto: "hola", tags: [] });
    log.append({ type: "pocion", tercios: 2 });
    const fold = (s: string, e: Ev) => s + (e.type === "pocion" ? `+${e.tercios}` : `[${e.texto}]`);
    expect(log.replay(fold, "")).toBe("+1[hola]+2");
    expect(log.replay(fold, "")).toBe(log.replay(fold, ""));
  });

  test("reducerFrom tipa un manejador por tipo; los tipos sin manejador no cambian el estado", () => {
    const { log } = setup();
    log.append({ type: "pocion", tercios: 1 });
    log.append({ type: "nota", texto: "ignorada", tags: [] });
    log.append({ type: "pocion", tercios: 2 });
    const total = reducerFrom<Ev, number>({ pocion: (s, e) => s + e.tercios });
    expect(log.replay(total, 0)).toBe(3);
    const seqs = reducerFrom<Ev, number[]>({ nota: (s, _e, entry) => [...s, entry.seq] });
    expect(log.replay(seqs, [])).toEqual([2]);
  });

  test("append rechaza eventos sin type", () => {
    const { log } = setup();
    expect(() => log.append({ type: "" } as unknown as Ev)).toThrow(EventLogError);
    expect(() => log.append(null as unknown as Ev)).toThrow(/type/);
    expect(log.size).toBe(0);
  });

  test("se retoma desde registros guardados y sigue numerando", () => {
    const { clock, log } = setup();
    log.append({ type: "pocion", tercios: 1 });
    log.append({ type: "pocion", tercios: 2 });
    const saved = JSON.parse(JSON.stringify(log.entries())) as LoggedEvent<Ev>[];
    const resumed = createEventLog<Ev>(clock, saved);
    expect(resumed.entries()).toEqual(log.entries());
    expect(resumed.append({ type: "pocion", tercios: 3 }).seq).toBe(3);
    expect(Object.isFrozen(resumed.entries()[0])).toBe(true);
  });

  test("restaurar con huecos, instantes inválidos o eventos sin type falla claro", () => {
    const clock = createManualClock();
    const ev: Ev = { type: "pocion", tercios: 1 };
    expect(() => createEventLog<Ev>(clock, [{ seq: 2, at: 0, event: ev }])).toThrow(/seq 2/);
    expect(() => createEventLog<Ev>(clock, [{ seq: 1, at: Number.NaN, event: ev }])).toThrow(/instante/);
    expect(() =>
      createEventLog<Ev>(clock, [{ seq: 1, at: 0, event: { type: "" } as unknown as Ev }]),
    ).toThrow(EventLogError);
  });
});
