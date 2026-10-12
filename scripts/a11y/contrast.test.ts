// F1.3 A4: el script de contraste sobre los tokens reales, con dientes (un token roto lo hace fallar).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { LABEL_CONTRAST_PAIRS, PALETTE } from "../../apps/web/src/world/materials/palette.ts";
import { checkContrast, checkWorldLabels, contrastRatio, NON_TEXT_PAIRS, parseThemes, run, TEXT_MIN, TEXT_PAIRS, TOKENS_PATH } from "./contrast";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const css = readFileSync(TOKENS_PATH, "utf8");

describe("contrastRatio (fórmula WCAG)", () => {
  test("valores conocidos", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
});

describe("A4: tokens reales", () => {
  test("se leen los dos temas con todos los tokens de los pares (guardia contra 0 medido)", () => {
    const { normal, high } = parseThemes(css);
    const needed = new Set([...TEXT_PAIRS, ...NON_TEXT_PAIRS].flat());
    for (const t of needed) {
      expect(normal[t], `normal: ${t}`).toMatch(/^#[0-9a-f]{6}$/);
      expect(high[t], `alto contraste: ${t}`).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(high.ink).toBe("#000000");
  });

  test("todo par de texto ≥ 4,5:1 y todo par no textual ≥ 3:1, en los dos temas", () => {
    const results = checkContrast(css);
    expect(results).toHaveLength(2 * (TEXT_PAIRS.length + NON_TEXT_PAIRS.length));
    expect(results.filter((r) => !r.ok)).toEqual([]);
    expect(results.filter((r) => r.min === TEXT_MIN).every((r) => r.ratio >= 4.5)).toBe(true);
  });

  test("el CLI sale con 0 sobre los tokens reales", () => {
    expect(run(TOKENS_PATH, () => {})).toBe(0);
  });
});

describe("dientes", () => {
  test("una tinta clara sobre papel falla", () => {
    const broken = css.replace("--lg-color-ink-muted: #55545f;", "--lg-color-ink-muted: #b0aea6;");
    expect(broken).not.toBe(css);
    const bad = checkContrast(broken).filter((r) => !r.ok);
    expect(bad.map((r) => `${r.theme}:${r.fg}/${r.bg}`)).toContain("normal:ink-muted/paper");
  });

  test("un token que falta es un fallo, no un par salteado", () => {
    const missing = css.replace("--lg-color-danger: #a12a1c;", "");
    expect(checkContrast(missing).some((r) => r.fg === "danger" && !r.ok)).toBe(true);
  });
});

test("D-030: todo color de los retratos SVG es un token definido en tokens.css", () => {
  const portrait = readFileSync(resolve(ROOT, "apps/web/src/ui/dialog-only/Portrait.tsx"), "utf8");
  const lists = [...portrait.matchAll(/const (?:BACKGROUNDS|CLOTHES|HAIR) = \[([^\]]+)\]/g)].map((m) => m[1] ?? "");
  const names = [...lists.join(",").matchAll(/"([\w-]+)"/g), ...portrait.matchAll(/fill\("([\w-]+)"\)/g)].map((m) => m[1] ?? "");
  expect(names.length).toBeGreaterThan(10);
  for (const n of new Set(names)) expect(css, n).toContain(`--lg-color-${n}:`);
});

describe("A14 (estetica-c M1): etiquetas de nombre del mundo ≥ 7:1, leídas de palette.ts", () => {
  test("tinta sobre papel y el texto del chip sobre ámbar llegan a 7:1", () => {
    const r = checkWorldLabels();
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.ok && x.min === 7)).toBe(true);
    expect(LABEL_CONTRAST_PAIRS[0]).toMatchObject({ fg: PALETTE.tinta, bg: PALETTE.papel });
    expect(run(TOKENS_PATH, () => {})).toBe(0);
  });

  test("dientes: tinta-suave sobre ámbar (4,x:1) falla y hace salir 1 al CLI", () => {
    const weak = [{ name: "roto", fg: PALETTE["tinta-suave"], bg: PALETTE["ámbar"] }];
    expect(checkWorldLabels(weak)[0]?.ok).toBe(false);
    expect(run(TOKENS_PATH, () => {}, weak)).toBe(1);
    expect(checkWorldLabels([{ name: "sin hex", fg: "tinta", bg: "#ffffff" }])[0]?.ok).toBe(false);
  });
});
