import { describe, expect, test } from "vitest";
import { clockFrom, createManualClock } from "../src/index";

describe("Clock", () => {
  test("el reloj manual arranca donde se le dice y avanza a pedido", () => {
    const clock = createManualClock(1_000);
    expect(clock.now()).toBe(1_000);
    expect(clock.advance(250)).toBe(1_250);
    expect(clock.now()).toBe(1_250);
    clock.set(2_000);
    expect(clock.now()).toBe(2_000);
  });

  test("arranca en 0 por defecto", () => {
    expect(createManualClock().now()).toBe(0);
  });

  test("no retrocede ni acepta tiempos no finitos", () => {
    const clock = createManualClock(10);
    expect(() => clock.advance(-1)).toThrow(RangeError);
    expect(() => clock.set(5)).toThrow(/no retrocede/);
    expect(() => clock.advance(Number.NaN)).toThrow(RangeError);
    expect(() => createManualClock(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(clock.now()).toBe(10);
  });

  test("clockFrom adapta una fuente del entorno y la valida", () => {
    let t = 5;
    const clock = clockFrom(() => t);
    expect(clock.now()).toBe(5);
    t = 7;
    expect(clock.now()).toBe(7);
    expect(() => clockFrom(() => Number.NaN).now()).toThrow(/clockFrom/);
  });
});
