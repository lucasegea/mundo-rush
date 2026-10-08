// F5.1a A5: libro de costos. La cuenta por adaptador con las tarifas de models.yaml, la fila de escena, el promedio
// móvil y la alerta a US$0,05/min (D-027); A7: el adaptador de archivo es append-only y rechaza binarios.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { loadModelsConfig } from "../src/config/models.ts";
import {
  costPolicyFromConfig, createFileCostLedger, createMemoryCostLedger, readCostLedgerFile, rollingUsdPerMin, UnknownPriceError,
  usdForUsage, type CostPolicy, type SceneCostEntry,
} from "../src/cost/ledger.ts";
import { BinaryDataError } from "../src/store/evidence.ts";

const models = loadModelsConfig();
const policy = costPolicyFromConfig(models);
const AT = "2026-10-08T12:00:00.000Z";
const tmp = mkdtempSync(join(tmpdir(), "lg-cost-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const turn = (sceneRunId: string, usage: Parameters<typeof usdForUsage>[1], adapter = "gemini-live") =>
  ({ at: AT, sceneRunId, turnId: `${sceneRunId}:1`, accountId: "op-local", adapter, provider: "gemini", model: "m", usage });

describe("A5: cuenta por adaptador", () => {
  test("Live: tokens por millón con las tarifas de la config", () => {
    const p = models.prices.adapters["gemini-live"];
    expect(p).toEqual({ audioInPerM: 3, audioOutPerM: 12, textInPerM: 0.75, textOutPerM: 12 });
    const usd = usdForUsage("gemini-live", { kind: "tokens", audioIn: 1_000_000, audioOut: 500_000, textIn: 2_000_000, textOut: 0 }, models.prices);
    expect(usd).toBeCloseTo(3 + 6 + 1.5, 10);
  });

  test("cascada: STT por minuto + texto por millón + TTS por millón de caracteres", () => {
    const usd = usdForUsage("cascade", { kind: "cascade", sttSeconds: 120, textIn: 1_000_000, textOut: 1_000_000, ttsChars: 100_000 }, models.prices);
    expect(usd).toBeCloseTo(2 * 0.0065 + 0.75 + 3.75 + 3, 10);
  });

  test("un uso que no corresponde al adaptador falla claro (nunca se cobra con la tarifa de otro)", () => {
    expect(() => usdForUsage("cascade", { kind: "tokens", audioIn: 1, audioOut: 1, textIn: 1, textOut: 1 }, models.prices)).toThrow(UnknownPriceError);
    expect(() => usdForUsage("gemini-live", { kind: "cascade", sttSeconds: 1, textIn: 1, textOut: 1, ttsChars: 1 }, models.prices)).toThrow(UnknownPriceError);
  });

  test("la escena suma sus turnos (y solo los suyos), con la versión de la tabla", () => {
    const l = createMemoryCostLedger(policy);
    l.recordTurn(turn("s1", { kind: "tokens", audioIn: 1000, audioOut: 0, textIn: 0, textOut: 0 }));
    l.recordTurn(turn("s1", { kind: "tokens", audioIn: 0, audioOut: 1000, textIn: 0, textOut: 0 }));
    l.recordTurn(turn("s2", { kind: "tokens", audioIn: 1_000_000, audioOut: 0, textIn: 0, textOut: 0 }));
    const { entry } = l.closeScene({ at: AT, sceneRunId: "s1", accountId: "op-local", adapter: "gemini-live", wallSeconds: 120 });
    expect(entry).toMatchObject({ kind: "scene", turns: 2, priceTableVersion: models.prices.version });
    expect(entry.usd).toBeCloseTo((1000 * 3 + 1000 * 12) / 1e6, 12);
  });
});

describe("A5: alerta por promedio móvil > US$0,05/min (D-027)", () => {
  const scene = (usd: number, wallSeconds: number): SceneCostEntry =>
    ({ kind: "scene", at: AT, sceneRunId: "x", accountId: "a", adapter: "gemini-live", usd, wallSeconds, turns: 1, priceTableVersion: "v" });
  const small: CostPolicy = { ...policy, windowScenes: 2 };

  test("promedio móvil = US$ totales / minutos totales de las últimas N escenas", () => {
    expect(rollingUsdPerMin([scene(1, 60), scene(0.1, 60), scene(0.1, 120)], 2)).toEqual({ usdPerMin: 0.2 / 3, scenes: 2 });
    expect(rollingUsdPerMin([], 10)).toEqual({ usdPerMin: 0, scenes: 0 });
  });

  test("por debajo no alerta; por encima alerta con el valor y el umbral; justo en el umbral no", () => {
    const l = createMemoryCostLedger(small);
    const close = (id: string, wallSeconds: number) =>
      l.closeScene({ at: AT, sceneRunId: id, accountId: "op-local", adapter: "gemini-live", wallSeconds });
    // US$0,03 en 1 min.
    l.recordTurn(turn("a", { kind: "tokens", audioIn: 10_000, audioOut: 0, textIn: 0, textOut: 0 }));
    expect(close("a", 60).alert).toBeNull();
    // US$0,12 en 1 min: el promedio de las dos (0,15/2 = 0,075) supera 0,05.
    l.recordTurn(turn("b", { kind: "tokens", audioIn: 40_000, audioOut: 0, textIn: 0, textOut: 0 }));
    const { alert } = close("b", 60);
    expect(alert?.thresholdUsdPerMin).toBe(0.05);
    expect(alert?.scenes).toBe(2);
    expect(alert?.usdPerMin).toBeCloseTo(0.075, 10);
    // Justo en el umbral no alerta (la alerta es "supera"): US$0,03 en 1 min con umbral 0,03.
    const e = createMemoryCostLedger({ ...small, windowScenes: 1, alertUsdPerMin: 0.03 });
    e.recordTurn(turn("c", { kind: "tokens", audioIn: 10_000, audioOut: 0, textIn: 0, textOut: 0 }));
    expect(e.closeScene({ at: AT, sceneRunId: "c", accountId: "a", adapter: "gemini-live", wallSeconds: 60 }).alert).toBeNull();
    expect(policy.alertUsdPerMin).toBe(0.05);
  });
});

describe("A7: archivo append-only, sin binarios", () => {
  test("escribe una línea por entrada, sobrevive al reinicio y el promedio móvil sigue", () => {
    const path = join(tmp, "a", "cost-ledger.jsonl");
    const l = createFileCostLedger(policy, path);
    l.recordTurn(turn("s1", { kind: "tokens", audioIn: 100, audioOut: 100, textIn: 100, textOut: 0 }));
    l.closeScene({ at: AT, sceneRunId: "s1", accountId: "op-local", adapter: "gemini-live", wallSeconds: 30 });
    const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    const again = createFileCostLedger(policy, path);
    expect(again.entries()).toEqual(readCostLedgerFile(path));
    expect(again.entries().map((e) => e.kind)).toEqual(["turn", "scene"]);
  });

  test("una línea cortada se saltea al leer y la entrada nueva no se pega a ella", () => {
    const path = join(tmp, "torn.jsonl");
    writeFileSync(path, '{"kind":"scene","at":"2026', "utf8");
    const l = createFileCostLedger(policy, path);
    l.recordTurn(turn("s1", { kind: "tokens", audioIn: 1, audioOut: 1, textIn: 1, textOut: 1 }));
    expect(readCostLedgerFile(path).map((e) => e.kind)).toEqual(["turn"]);
  });

  test("rechaza buffers binarios (el servidor no guarda audio, D-108) y no escribe nada", () => {
    const path = join(tmp, "bin.jsonl");
    const l = createFileCostLedger(policy, path);
    const bad = { ...turn("s1", { kind: "tokens", audioIn: 1, audioOut: 1, textIn: 1, textOut: 1 }), clip: new Int16Array([1, 2]) };
    expect(() => l.recordTurn(bad)).toThrow(BinaryDataError);
    const buf = { ...turn("s1", { kind: "tokens", audioIn: 1, audioOut: 1, textIn: 1, textOut: 1 }), model: Buffer.from("x") as unknown as string };
    expect(() => l.recordTurn(buf)).toThrow(BinaryDataError);
    expect(readCostLedgerFile(path)).toEqual([]);
  });

  test("el cierre de escena también rechaza binarios antes de escribir", () => {
    const path = join(tmp, "bin-scene.jsonl");
    const l = createFileCostLedger(policy, path);
    const bad = { at: "2026-10-07T12:00:00.000Z", sceneRunId: "s1", accountId: "op-local", adapter: "gemini-live", wallSeconds: 60, clip: new Uint8Array([1]) };
    expect(() => l.closeScene(bad)).toThrow(BinaryDataError);
    expect(readCostLedgerFile(path)).toEqual([]);
  });

  test("un campo de más no entra (esquema estricto)", () => {
    const l = createMemoryCostLedger(policy);
    const extra = { ...turn("s1", { kind: "tokens", audioIn: 1, audioOut: 1, textIn: 1, textOut: 1 }), transcript: "hello" };
    expect(() => l.recordTurn(extra)).toThrow();
    expect(l.entries()).toEqual([]);
  });
});
