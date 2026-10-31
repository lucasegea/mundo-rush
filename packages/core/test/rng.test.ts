import { describe, expect, test } from "vitest";
import { createRng, createRngFromState, seedToState } from "../src/index";

// Golden values of mulberry32: they pin the algorithm (if they change, saved replays break).
const GOLDEN_SEED_1 = [627074, 2735, 527447];
const GOLDEN_KESTREL_STATE = 1679345713;

const take = (seed: number | string, n: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe("Rng con semilla", () => {
  test("misma semilla, misma secuencia (reproducible)", () => {
    expect(take(42, 50)).toEqual(take(42, 50));
    expect(take("kestrel", 50)).toEqual(take("kestrel", 50));
  });

  test("valores fijados: la secuencia no cambia entre versiones ni máquinas", () => {
    // If this test fails, the algorithm changed: every saved replay stops reproducing.
    const rng = createRng(1);
    expect([rng.int(0, 1_000_000), rng.int(0, 1_000_000), rng.int(0, 1_000_000)]).toEqual(GOLDEN_SEED_1);
    expect(seedToState("kestrel")).toBe(GOLDEN_KESTREL_STATE);
  });

  test("semillas distintas dan secuencias distintas", () => {
    expect(take(1, 10)).not.toEqual(take(2, 10));
    expect(take("a", 10)).not.toEqual(take("b", 10));
  });

  test("next() queda en [0, 1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  test("int() cubre el rango con ambos extremos incluidos", () => {
    const rng = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) {
      const v = rng.int(-2, 2);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
    expect(rng.int(3, 3)).toBe(3);
  });

  test("int() rechaza rangos inválidos", () => {
    const rng = createRng(1);
    expect(() => rng.int(5, 1)).toThrow(RangeError);
    expect(() => rng.int(0.5, 2)).toThrow(RangeError);
    expect(() => rng.int(0, 2 ** 32)).toThrow(RangeError);
  });

  test("pick() elige de la lista y falla con lista vacía", () => {
    const rng = createRng("pick");
    const items = ["a", "b", "c"] as const;
    for (let i = 0; i < 100; i++) expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow(/vacía/);
  });

  test("state() + createRngFromState retoma la secuencia exacta", () => {
    const a = createRng("save");
    a.next();
    a.next();
    const b = createRngFromState(a.state());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(Array.from({ length: 20 }, () => a.next()));
  });

  test("semillas y estados inválidos fallan claro", () => {
    expect(() => createRng(1.5)).toThrow(/semilla/);
    expect(() => createRng(Number.NaN)).toThrow(RangeError);
    expect(() => createRngFromState(-1)).toThrow(/estado/);
    expect(() => createRngFromState(2 ** 32)).toThrow(RangeError);
  });

  test("semillas numéricas se reducen a 32 bits sin signo", () => {
    expect(seedToState(-1)).toBe(0xffffffff);
    expect(seedToState(2 ** 32 + 5)).toBe(5);
  });
});
