// open-world-3d T2(g) (D-833, AC58): lo puro de scripts/dev/perf-probe.ts. La corrida real abre Chromium en la GPU y va
// a pedido, fuera de verify (como la caminata).
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { glArgs } from "./gl-mode.ts";
import { CONFIGS, frameStats, markdownSection, MEM_HOOK, parseProbeArgs, poseAvailable, timingOk, upsertSection, WARMUP_MS, WINDOW_MS, type Row } from "./perf-probe.ts";

const row = (over: Partial<Row> = {}): Row => ({
  config: "main", tier: "medium", pose: "spawn", stats: { frames: 100, mean: 5, p50: 4.9, p95: 7 }, calls: 120, triangles: 50_000, programs: 14,
  mem: { textureMB: 40, textures: 30, renderbufferMB: 12, bufferMB: 3 }, renderer: "ANGLE (NVIDIA)", frameloop: "always", regulators: 0,
  warmupStart: 0, windowStart: WARMUP_MS, windowEnd: WARMUP_MS + WINDOW_MS, pageWindowMs: WINDOW_MS, frameSumMs: WINDOW_MS, ...over,
});

describe("perf-probe: argumentos", () => {
  test("defaults: gpu, todos los tiers, todas las poses, etiqueta adhoc", () => {
    expect(parseProbeArgs([], {})).toMatchObject({ gl: "gpu", tiers: ["low", "medium", "high"], label: "adhoc", build: false });
  });
  test("--gl, --tier, --pose, --label, --build", () => {
    expect(parseProbeArgs(["--gl=igpu", "--tier=low", "--pose=spawn", "--label=T3", "--build"], {}))
      .toEqual({ gl: "igpu", tiers: ["low"], poses: ["spawn"], label: "T3", build: true, failOnPurpose: false });
  });
  test("valores desconocidos fallan antes de lanzar", () => {
    expect(() => parseProbeArgs(["--gl=bogus"], {})).toThrow("modo de GL desconocido");
    expect(() => parseProbeArgs(["--tier=ultra"], {})).toThrow("tier desconocido");
    expect(() => parseProbeArgs(["--pose=cielo"], {})).toThrow("pose desconocida");
  });
  test("LG_GL sirve de default para --gl", () => {
    expect(parseProbeArgs([], { LG_GL: "swiftshader" }).gl).toBe("swiftshader");
  });
});

describe("perf-probe: medida", () => {
  test("media, p50 y p95", () => {
    const times = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(frameStats(times)).toEqual({ frames: 100, mean: 50.5, p50: 51, p95: 96 });
    expect(frameStats([])).toEqual({ frames: 0, mean: 0, p50: 0, p95: 0 });
  });
  test("calentamiento de 12 s y ventana de 10 s", () => {
    expect(WARMUP_MS).toBe(12_000);
    expect(WINDOW_MS).toBe(10_000);
    expect(timingOk(row())).toBe(true);
    expect(timingOk(row({ windowStart: WARMUP_MS - 1 }))).toBe(false);
    expect(timingOk(row({ windowEnd: WARMUP_MS + WINDOW_MS - 1 }))).toBe(false);
    expect(timingOk(row({ pageWindowMs: WINDOW_MS - 1 }))).toBe(false);
  });
  test("columna del gate 1280x720 a DPR 1; DPR 1.5 y 1920x1080 informativas", () => {
    expect(CONFIGS.map((c) => [c.id, c.viewport.width, c.viewport.height, c.dpr])).toEqual([
      ["main", 1280, 720, 1], ["dpr1.5", 1280, 720, 1.5], ["1920x1080", 1920, 1080, 1],
    ]);
  });
  test("sin tope: las banderas de Chromium quitan vsync y el tope de cuadros", () => {
    expect(glArgs("gpu", { uncapped: true })).toEqual(expect.arrayContaining(["--disable-gpu-vsync", "--disable-frame-rate-limit", "--force_high_performance_gpu"]));
  });
  test("al cierre de M1 solo spawn está disponible (close/mid/full con T5, hilltop con T6)", () => {
    expect(poseAvailable("spawn")).toBe(true);
    for (const p of ["close", "mid", "full", "hilltop"] as const) expect(poseAvailable(p)).toBe(false);
  });
  test("el gancho de memoria cuenta las subidas comprimidas", () => {
    expect(MEM_HOOK).toContain("compressedTexImage2D");
    expect(MEM_HOOK).toContain("__lgGpuMem");
  });
});

describe("perf-probe: informe", () => {
  test("la sección lleva renderer, columnas informativas y poses faltantes", () => {
    const md = markdownSection({ gl: "gpu", label: "T3" }, "abc1234", [row(), row({ config: "dpr1.5", stats: { frames: 80, mean: 6, p50: 6, p95: 9 } })], ["close"], []);
    expect(md).toContain("## T3 · gpu · abc1234");
    expect(md).toContain("Renderer: ANGLE (NVIDIA)");
    expect(md).toContain("| medium | spawn | 5 | 4.9 | 7 | 100 | 120 | 50000 | 14 | 40 | 12 | 6 | 9 | n/d |");
    expect(md).toContain("Poses todavía no disponibles: close");
  });
  test("una corrida --build lleva solo la línea de carga", () => {
    const md = markdownSection({ gl: "gpu", label: "T3 (build)" }, "c1", [], ["close"], [{ ms: 800, programs: null, source: "dom" }, { ms: 400, programs: null, source: "dom" }, { ms: 900, programs: null, source: "dom" }]);
    expect(md).not.toContain("| tier |");
    expect(md).toContain("mediana 800 ms");
  });
  test("una etiqueta repetida reemplaza su sección; las otras quedan", () => {
    const a = markdownSection({ gl: "gpu", label: "T3" }, "c1", [row()], [], []);
    const b = markdownSection({ gl: "igpu", label: "T3" }, "c1", [row()], [], []);
    const a2 = markdownSection({ gl: "gpu", label: "T3" }, "c2", [row()], [], []);
    const doc = upsertSection(upsertSection(upsertSection("", "T3", "gpu", a), "T3", "igpu", b), "T3", "gpu", a2);
    expect(doc.match(/^## /gm)?.length).toBe(2);
    expect(doc).toContain("## T3 · gpu · c2");
    expect(doc).not.toContain("## T3 · gpu · c1");
    expect(doc).toContain("## T3 · igpu · c1");
  });
});

describe("perf-probe: higiene (D-815)", () => {
  const src = readFileSync(new URL("./perf-probe.ts", import.meta.url), "utf8");
  test("abre Chromium solo por el lanzador compartido (que cierra en finally) y no mata nada por nombre", () => {
    expect(src).not.toContain("chromium.launch(");
    expect(src).toContain("withGlBrowser(");
    expect(src).not.toMatch(/taskkill|pkill|killall|Stop-Process/);
  });
  test("queda fuera de verify", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["perf:probe"]).toBe("node scripts/dev/perf-probe.ts");
    expect(pkg.scripts["verify"]).not.toContain("perf");
  });
});
