// Open-world-3d T10 (d), AC63: the load marks. Each one once per page, and the first-frame one only after
// the entry one; without `performance`, nothing.
import { describe, expect, test } from "vitest";
import { LOAD_MARKS, markWorldEnter, markWorldFirstFrame, type MarkSink } from "../src";

const perf = (): MarkSink & { names: string[]; details: unknown[] } => {
  const entries: { name: string; detail: unknown }[] = [];
  return {
    get names() {
      return entries.map((e) => e.name);
    },
    get details() {
      return entries.map((e) => e.detail);
    },
    mark: (name, o) => entries.push({ name, detail: o?.detail }),
    getEntriesByName: (name) => entries.filter((e) => e.name === name),
  };
};

describe("marcas de carga del mundo", () => {
  test("los nombres que mide la sonda", () => {
    expect(LOAD_MARKS).toEqual({ worldEnter: "lg:world-enter", worldFirstFrame: "lg:world-first-frame" });
  });

  test("entrada y primer cuadro, en ese orden, una vez cada una", () => {
    const p = perf();
    expect(markWorldFirstFrame(p, { programs: 3 })).toBe(false);
    expect(markWorldEnter(p)).toBe(true);
    expect(markWorldEnter(p)).toBe(false);
    expect(markWorldFirstFrame(p, { programs: 21 })).toBe(true);
    expect(markWorldFirstFrame(p, { programs: 22 })).toBe(false);
    expect(p.names).toEqual(["lg:world-enter", "lg:world-first-frame"]);
    expect(p.details[1]).toEqual({ programs: 21 });
  });

  test("sin performance no marca", () => {
    expect(markWorldEnter(undefined)).toBe(false);
    expect(markWorldFirstFrame(undefined, { programs: 1 })).toBe(false);
  });
});
