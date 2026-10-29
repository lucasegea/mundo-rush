// open-world-3d T2(f) (AC12, AC58): lo puro del lanzador por modo de GL. El navegador real lo prueban la caminata y la
// sonda; acá: el modo por defecto, el modo desconocido, las banderas de cada modo y el renderer que no coincide.
import { describe, expect, test } from "vitest";
import { GL_MODES, glArgs, parseGlMode, rendererMismatch, VIEWPORT } from "./gl-mode.ts";

const NVIDIA = "ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Ti Laptop GPU (0x000025A0) Direct3D11 vs_5_0 ps_5_0, D3D11)";
const AMD = "ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)";
const SWIFT = "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)";

describe("parseGlMode", () => {
  test("sin variable es gpu; los tres modos pasan", () => {
    expect(parseGlMode(undefined)).toBe("gpu");
    expect(parseGlMode("")).toBe("gpu");
    for (const m of GL_MODES) expect(parseGlMode(m)).toBe(m);
  });
  test("un modo desconocido es un error (antes de lanzar nada)", () => {
    expect(() => parseGlMode("bogus")).toThrow('modo de GL desconocido "bogus"');
  });
});

describe("glArgs", () => {
  test("gpu: ANGLE d3d11 con la GPU de alto rendimiento", () => {
    expect(glArgs("gpu")).toEqual(expect.arrayContaining(["--use-angle=d3d11", "--force_high_performance_gpu"]));
    expect(glArgs("gpu")).not.toContain("--force_low_power_gpu");
  });
  test("igpu: la integrada, y el respaldo --use-adapter-luid solo si se pide", () => {
    expect(glArgs("igpu")).toEqual(expect.arrayContaining(["--use-angle=d3d11", "--force_low_power_gpu"]));
    expect(glArgs("igpu").some((a) => a.startsWith("--use-adapter-luid"))).toBe(false);
    expect(glArgs("igpu", { adapterLuid: "0x1234" })).toContain("--use-adapter-luid=0x1234");
    expect(glArgs("gpu", { adapterLuid: "0x1234" }).some((a) => a.startsWith("--use-adapter-luid"))).toBe(false);
  });
  test("swiftshader: como antes de T2", () => {
    expect(glArgs("swiftshader")).toEqual(expect.arrayContaining(["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]));
  });
  test("la sonda suma sin vsync y sin tope de cuadros", () => {
    for (const m of GL_MODES) {
      expect(glArgs(m, { uncapped: true })).toEqual(expect.arrayContaining(["--disable-gpu-vsync", "--disable-frame-rate-limit"]));
      expect(glArgs(m)).not.toContain("--disable-gpu-vsync");
    }
  });
  test("el viewport compartido es 1280x720", () => {
    expect(VIEWPORT).toEqual({ width: 1280, height: 720 });
  });
});

describe("rendererMismatch (un string inyectado simula la GPU equivocada)", () => {
  test("cada modo acepta su renderer", () => {
    expect(rendererMismatch("gpu", NVIDIA)).toBeNull();
    expect(rendererMismatch("igpu", AMD)).toBeNull();
    expect(rendererMismatch("swiftshader", SWIFT)).toBeNull();
  });
  test("y rechaza los otros", () => {
    expect(rendererMismatch("gpu", AMD)).toContain("no es el del modo gpu");
    expect(rendererMismatch("gpu", SWIFT)).not.toBeNull();
    expect(rendererMismatch("igpu", NVIDIA)).toContain("no es el del modo igpu");
    expect(rendererMismatch("swiftshader", NVIDIA)).not.toBeNull();
    expect(rendererMismatch("gpu", "sin webgl2")).not.toBeNull();
  });
});
