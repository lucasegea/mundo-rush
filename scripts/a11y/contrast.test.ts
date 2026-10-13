// F1.3 A4: el script de contraste sobre los tokens reales, con dientes (un token roto lo hace fallar).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { LABEL_CONTRAST_PAIRS, PALETTE } from "@lg/art";
import { AAA_PAIRS, checkContrast, checkPaletteSync, checkWorldLabels, contrastRatio, NON_TEXT_PAIRS, PALETTE_TOKENS, parseThemes, run, TEXT_MIN, TEXT_PAIRS, TOKENS_PATH } from "./contrast";

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
    const needed = new Set([...TEXT_PAIRS, ...NON_TEXT_PAIRS, ...AAA_PAIRS].flat());
    for (const t of needed) {
      expect(normal[t], `normal: ${t}`).toMatch(/^#[0-9a-f]{6}$/);
      expect(high[t], `alto contraste: ${t}`).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(high.ink).toBe("#000000");
  });

  test("todo par de texto ≥ 4,5:1 y todo par no textual ≥ 3:1, en los dos temas", () => {
    const results = checkContrast(css);
    expect(results).toHaveLength(2 * (TEXT_PAIRS.length + NON_TEXT_PAIRS.length + AAA_PAIRS.length));
    expect(results.filter((r) => !r.ok)).toEqual([]);
    expect(results.filter((r) => r.min === TEXT_MIN).every((r) => r.ratio >= 4.5)).toBe(true);
  });

  test("el CLI sale con 0 sobre los tokens reales", () => {
    expect(run(TOKENS_PATH, () => {})).toBe(0);
  });
});

describe("dientes", () => {
  test("una tinta clara sobre papel falla", () => {
    const broken = css.replace("--lg-color-ink-muted: #5b5664;", "--lg-color-ink-muted: #b0aea6;");
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

describe("M4 (estetica-c): HUD papel y tinta", () => {
  const ratio = (fg: string, bg: string): number => {
    const { normal } = parseThemes(css);
    return contrastRatio(normal[fg] ?? "", normal[bg] ?? "");
  };

  test("los pares de la propuesta C §6: tinta/papel y papel/tinta ≥ 7:1, tinta-suave/papel ≥ 4,5:1, chip/ámbar ≥ 7:1", () => {
    expect(ratio("ink", "paper")).toBeGreaterThanOrEqual(7);
    expect(ratio("paper", "ink")).toBeGreaterThanOrEqual(7);
    expect(ratio("ink-muted", "paper")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("on-amber", "amber")).toBeGreaterThanOrEqual(7);
    // Los cuatro están en las listas que corre el CLI, no solo en este test.
    expect(AAA_PAIRS).toEqual(expect.arrayContaining([["ink", "paper"], ["paper", "ink"], ["on-amber", "amber"]]));
    expect(TEXT_PAIRS).toEqual(expect.arrayContaining([["ink-muted", "paper"]]));
    const aaa = checkContrast(css).filter((r) => r.min === 7);
    expect(aaa).toHaveLength(2 * AAA_PAIRS.length);
    expect(aaa.every((r) => r.ok)).toBe(true);
  });

  test("dientes: la tinta cambiada a un gris claro hace fallar el script (AAA y CLI)", () => {
    const grey = css.replace("--lg-color-ink: #2a2a33;", "--lg-color-ink: #9a9a9a;");
    expect(grey).not.toBe(css);
    const bad = checkContrast(grey).filter((r) => !r.ok).map((r) => `${r.theme}:${r.fg}/${r.bg}:${r.min}`);
    expect(bad).toContain("normal:ink/paper:7");
    expect(bad).toContain("normal:paper/ink:7");
    const dir = mkdtempSync(join(tmpdir(), "lg-contrast-"));
    try {
      const file = join(dir, "tokens.css");
      writeFileSync(file, grey);
      expect(run(file, () => {})).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("dientes: el texto del chip aclarado sobre ámbar no llega a 7:1", () => {
    const light = css.replace("--lg-color-on-amber: #2a1a05;", "--lg-color-on-amber: #6b5a40;");
    expect(light).not.toBe(css);
    expect(checkContrast(light).some((r) => r.fg === "on-amber" && r.bg === "amber" && !r.ok)).toBe(true);
  });
});

describe("M4 (revisión de arquitectura M1 A14): una sola fuente de hex, papel, tinta y ámbar de tokens.css = @lg/art", () => {
  test("papel, tinta y ámbar (y los demás tokens de paleta del HUD) son iguales a PALETTE", () => {
    const { normal } = parseThemes(css);
    expect(normal.paper).toBe(PALETTE.papel.toLowerCase());
    expect(normal.ink).toBe(PALETTE.tinta.toLowerCase());
    expect(normal.amber).toBe(PALETTE["ámbar"].toLowerCase());
    const sync = checkPaletteSync(css);
    expect(sync).toHaveLength(Object.keys(PALETTE_TOKENS).length);
    expect(sync.filter((s) => !s.ok)).toEqual([]);
  });

  test("dientes: un ámbar de tokens.css distinto del de la paleta, o un token que falta, falla y hace salir 1", () => {
    const drift = css.replace("--lg-color-amber: #f2a93b;", "--lg-color-amber: #f2a93c;");
    expect(drift).not.toBe(css);
    expect(checkPaletteSync(drift).find((s) => s.token === "amber")?.ok).toBe(false);
    expect(checkPaletteSync(css, { ...PALETTE, papel: "#FFFFFF" }).find((s) => s.token === "paper")?.ok).toBe(false);
    expect(checkPaletteSync(css.replace("--lg-color-card-line: #e6dcc8;", "")).find((s) => s.token === "card-line")?.ok).toBe(false);
    const dir = mkdtempSync(join(tmpdir(), "lg-contrast-"));
    try {
      const file = join(dir, "tokens.css");
      writeFileSync(file, drift);
      expect(run(file, () => {})).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("M4 (estetica-c): tokens.css de la propuesta C §8", () => {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");

  test("todo en rem: solo bordes, contornos y radios en px (ningún tamaño de texto); la raíz escala con --lg-font-scale", () => {
    const withPx = code.split("\n").filter((l) => /\b\d+(?:\.\d+)?px\b/.test(l));
    expect(withPx.length).toBeGreaterThanOrEqual(1); // guardia: el radio de la tarjeta está
    expect(withPx.filter((l) => !/^\s*(--lg-radius-[\w-]+|outline|outline-offset|border[\w-]*):/.test(l))).toEqual([]);
    // Dientes: un tamaño de texto en px se caza.
    expect("  font-size: 22px;".match(/^\s*(--lg-radius-[\w-]+|outline|outline-offset|border[\w-]*):/)).toBeNull();
    expect(code).toMatch(/--lg-radius-card: 14px;/);
    expect(code).toMatch(/font-size: calc\(100% \* var\(--lg-font-scale\)\)/);
  });

  test("tipografía: la pila redondeada del sistema, sin fuentes descargadas (plan §9 pregunta 5)", () => {
    expect(code).toContain(`--lg-font-sans: ui-rounded, "Segoe UI Rounded", Nunito, "Segoe UI", sans-serif;`);
    expect(code).not.toMatch(/@font-face|fonts\.googleapis|url\(/);
  });

  test("el punto que late se frena por CSS con el ajuste y con la preferencia del sistema", () => {
    expect(code).toMatch(/\.lg-pulse \{\s*animation: lg-pulse/);
    expect(code).toMatch(/:root\[data-reduce-motion="true"\] \*,[\s\S]*animation-duration: 0s !important/);
    expect(code).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.lg-pulse \{ animation: none; \}/);
  });
});
