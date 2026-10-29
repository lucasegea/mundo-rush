// Open-world-3d T4 (D-820, AC19): el arrastre de mirada usa Pointer Events, y los listeners de puntero siguen siendo de
// services/input/ (R10). Prueba con dientes (lección FD0): la sonda importa por alias (`@state/bridge`, archivo que existe,
// comprobado antes) y un listener de puntero escrito en world/ tiene que fallar con R10; el input.ts real pasa en su lugar.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, test } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SYNTAX = "no-restricted-syntax";
const PROBE_DIR = "apps/web/src/world/dioramas";
const REAL_INPUT = "apps/web/src/services/input/input.ts";

let eslint: ESLint;
beforeAll(() => {
  eslint = new ESLint({ cwd: ROOT });
});

const lint = async (file: string, code: string) => {
  const [result] = await eslint.lintText(code, { filePath: resolve(ROOT, file) });
  if (!result) throw new Error(`sin resultado para ${file}`);
  expect(result.messages.filter((m) => m.fatal)).toEqual([]);
  return result.messages;
};

describe("R10 con Pointer Events (D-820)", () => {
  test("guardia: la carpeta de la sonda, el destino del alias y el input real existen", () => {
    expect(existsSync(resolve(ROOT, PROBE_DIR))).toBe(true);
    expect(existsSync(resolve(ROOT, "apps/web/src/state/bridge.ts"))).toBe(true);
    expect(existsSync(resolve(ROOT, REAL_INPUT))).toBe(true);
  });

  test.each(["pointerdown", "pointermove", "pointerup"])("un listener de %s escrito en world/ falla con R10", async (event) => {
    const code = `import { LOOK_DRAG_PX } from "@state/bridge";\nexport const probe = () => window.addEventListener("${event}", () => LOOK_DRAG_PX);\n`;
    const msgs = await lint(`${PROBE_DIR}/__probe__.tsx`, code);
    expect(msgs.filter((m) => m.ruleId === SYNTAX && m.message.includes("R10")).length).toBeGreaterThan(0);
  });

  test("el input.ts real, con sus listeners de puntero, pasa en services/input y falla movido a world/", async () => {
    const code = readFileSync(resolve(ROOT, REAL_INPUT), "utf8");
    expect(code).toContain('"pointerdown"');
    expect((await lint(REAL_INPUT, code)).filter((m) => m.ruleId === SYNTAX)).toEqual([]);
    const moved = await lint(`${PROBE_DIR}/__probe__.ts`, code);
    expect(moved.filter((m) => m.ruleId === SYNTAX && m.message.includes("R10")).length).toBeGreaterThanOrEqual(4);
  });
});
