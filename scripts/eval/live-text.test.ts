// F4.1: la eval en vivo (D-027) no llama a nada sin las dos llaves, y no está en verify ni en ningún script de npm.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { AUTHORIZE_FLAG, EVAL_SCENES, KEY_VAR, liveEvalGate } from "./live-text.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("eval en vivo de texto (opt-in, D-027)", () => {
  test("sin --authorize no corre, aunque haya clave", () => {
    expect(liveEvalGate([], { [KEY_VAR]: "x" })).toMatchObject({ ok: false });
  });
  test("con --authorize y sin clave no corre (y no imprime ningún valor)", () => {
    const gate = liveEvalGate([AUTHORIZE_FLAG], {});
    expect(gate).toMatchObject({ ok: false });
    expect(gate.ok ? "" : gate.reason).toContain("presente: no");
  });
  test("con las dos llaves, corre", () => {
    expect(liveEvalGate([AUTHORIZE_FLAG], { [KEY_VAR]: "x" })).toEqual({ ok: true });
  });
  test("son 5 escenas y ningún script de npm la llama (fuera de verify)", () => {
    expect(EVAL_SCENES).toHaveLength(5);
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(Object.values(pkg.scripts).some((s) => s.includes("live-text"))).toBe(false);
  });
});
