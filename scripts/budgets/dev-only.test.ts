// FD0 A1: el detector de check:dev-only encuentra lo que se siembra en un dist de fixture (sin falso verde).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEV_ONLY_MARKERS, run, scanDist } from "./dev-only.ts";

let dist: string;
const put = (file: string, text: string): void => {
  const abs = join(dist, file);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, text);
};

/** Un dist limpio con la forma del de apps/web. */
const cleanDist = (): void => {
  put("index.html", '<!doctype html><script type="module" src="/assets/index-abc.js"></script>\n');
  put("assets/index-abc.js", 'const a="lg:content:updated";import("./GameCanvas-x.js");export{a};\n');
  put("assets/GameCanvas-x.js", "export const g=1;\n");
  put(".vite/manifest.json", '{"index.html":{"file":"assets/index-abc.js","src":"src/boot/dev.ts"}}\n');
};

beforeEach(() => {
  dist = mkdtempSync(join(tmpdir(), "lg-devonly-"));
});
afterEach(() => rmSync(dist, { recursive: true, force: true }));

describe("check:dev-only (03 §6.5.1 punto 3)", () => {
  test("los marcadores son exactamente los de 03 §6.5.1", () => {
    expect([...DEV_ONLY_MARKERS]).toEqual(["__lg_director", "/__director/", "lg:director:", "DirectorPanel", "claude-agent-sdk", "LG_ANTHROPIC"]);
  });

  test("un dist limpio pasa", () => {
    put("index.html", "<!doctype html>\n");
    put("assets/index-abc.js", "export const a=1;\n");
    expect(scanDist(dist)).toEqual([]);
  });

  test.each(DEV_ONLY_MARKERS.map((m) => [m] as const))("encuentra el marcador %s sembrado en un chunk", (marker) => {
    cleanDist();
    expect(scanDist(dist)).toEqual([]);
    put("assets/index-abc.js", `const x=${JSON.stringify(`${marker}snapshot`)};export{x};\n`);
    expect(scanDist(dist)).toEqual([{ file: "assets/index-abc.js", reason: `marcador ${JSON.stringify(marker)}` }]);
  });

  test("encuentra un chunk cuyo nombre empieza con director (también en otra carpeta) aunque no tenga marcadores", () => {
    cleanDist();
    put("assets/director-Xy12.js", "export const d=1;\n");
    put("textures/director.png", "");
    const found = scanDist(dist).map((f) => f.file).sort();
    expect(found).toEqual(["assets/director-Xy12.js", "textures/director.png"]);
  });

  test("también busca en el manifiesto y los mapas de módulos (.vite/)", () => {
    cleanDist();
    put(".vite/chunk-modules.json", '{"assets/x.js":["apps/web/src/dev/director/index.ts","node_modules/@anthropic-ai/claude-agent-sdk/index.js"]}\n');
    expect(scanDist(dist)).toEqual([{ file: ".vite/chunk-modules.json", reason: 'marcador "claude-agent-sdk"' }]);
  });

  test("distingue mayúsculas: VITE_LG_DIRECTOR no es el marcador __lg_director", () => {
    put("assets/index-abc.js", 'const k="VITE_LG_DIRECTOR";export{k};\n');
    expect(scanDist(dist)).toEqual([]);
  });

  test("un dist vacío o inexistente es un error, no un verde", () => {
    expect(() => scanDist(dist)).toThrow(/vacío/);
    expect(() => scanDist(join(dist, "nada"))).toThrow(/no existe/);
  });

  test("run() sale con 1 si hay un marcador y con 0 si no (sin el build con la variable)", () => {
    const log: string[] = [];
    put("index.html", "<!doctype html>\n");
    expect(run(dist, false, (s) => log.push(s))).toBe(0);
    put("assets/a.js", 'fetch("/__director/state");\n');
    expect(run(dist, false, (s) => log.push(s))).toBe(1);
    expect(log.some((l) => l.startsWith("FAIL") && l.includes("/__director/"))).toBe(true);
  });
});
