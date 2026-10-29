// open-world-3d T2(b) (AC6): react y react-dom fijos con ~19.3.0 y una guarda sobre lo instalado.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { installedStackVersions, stackPinProblems } from "./stack-pins.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const webPkg = JSON.parse(readFileSync(join(ROOT, "apps/web/package.json"), "utf8")) as { dependencies: Record<string, string> };

describe("AC6: pines de react y three", () => {
  test("apps/web fija react y react-dom con ~19.3.0 (three ya iba con ~0.186)", () => {
    expect(webPkg.dependencies.react).toBe("~19.3.0");
    expect(webPkg.dependencies["react-dom"]).toBe("~19.3.0");
    expect(webPkg.dependencies.three).toMatch(/^~0\.186\./);
  });

  test("las dependencias de apps/web son las de siempre (ninguna nueva)", () => {
    expect(Object.keys(webPkg.dependencies).sort()).toEqual([
      "@react-three/drei", "@react-three/fiber", "@react-three/postprocessing", "postprocessing", "react", "react-dom", "three", "zustand",
    ]);
  });

  test("lo instalado pasa la guarda", () => {
    expect(stackPinProblems(installedStackVersions(ROOT))).toEqual([]);
  });

  test("la guarda acepta 19.3.x y 0.186.x y rechaza 19.4.0 y 0.187.0 (versiones inyectadas)", () => {
    expect(stackPinProblems({ react: "19.3.0", three: "0.186.1" })).toEqual([]);
    expect(stackPinProblems({ react: "19.3.7", three: "0.186.9" })).toEqual([]);
    const react194 = stackPinProblems({ react: "19.4.0", three: "0.186.1" });
    expect(react194).toHaveLength(1);
    expect(react194[0]).toContain("react 19.4.0");
    const three187 = stackPinProblems({ react: "19.3.0", three: "0.187.0" });
    expect(three187).toHaveLength(1);
    expect(three187[0]).toContain("three 0.187.0");
    expect(stackPinProblems({ react: "20.0.0", three: "1.0.0" })).toHaveLength(2);
  });
});
