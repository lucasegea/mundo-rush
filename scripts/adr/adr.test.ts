// docs/adr/ (F1.1b A5): exactamente 26 archivos ADR-001..ADR-026 sin huecos, con el estado que
// piden 04/05 (Aceptado si hay fila `decidida`) y la marca "enmendado (P0)" de la lista de 03 §11.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ADR_DIR = join(ROOT, "docs/adr");
const FILE = /^ADR-(\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

const files = readdirSync(ADR_DIR).sort();
const adrs = files.map((name) => {
  const m = FILE.exec(name);
  const text = readFileSync(join(ADR_DIR, name), "utf8");
  const estado = /^- \*\*Estado:\*\* (.+)$/m.exec(text)?.[1] ?? "";
  return { name, num: m ? Number(m[1]) : Number.NaN, text, estado };
});
const byNum = (n: number) => adrs.find((a) => a.num === n);

// Lista de enmiendas de P0 tal como la escribe 03 §11 (si 03 cambia, este test lo nota).
const arch = readFileSync(join(ROOT, "docs/03-arquitectura.md"), "utf8");
const amendParagraph = /\*\*Enmiendas de P0[^\n]*/.exec(arch)?.[0] ?? "";
const AMENDED = [...new Set([...amendParagraph.matchAll(/ADR-(\d{3})/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);

// 04 F1.1b / 05 F1.1b: ADR-001/003 (D-086/D-136), 002 (D-087), 022 (D-139), 023 (D-092), 026 (D-187).
const ACCEPTED = [1, 2, 3, 22, 23, 26];

describe("A5 docs/adr/", () => {
  test("exactamente 26 archivos, todos con la forma ADR-NNN-<slug>.md", () => {
    expect(files).toHaveLength(26);
    for (const name of files) expect(name, name).toMatch(FILE);
  });

  test("numerados 001-026 sin huecos ni repetidos", () => {
    expect(adrs.map((a) => a.num)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
  });

  test("cada archivo abre con su número y tiene estado, decisión, alternativas y qué se resigna", () => {
    for (const a of adrs) {
      const num = String(a.num).padStart(3, "0");
      expect(a.text.startsWith(`# ADR-${num} — `), a.name).toBe(true);
      expect(a.estado, a.name).toMatch(/^(Aceptado|Propuesto) /);
      for (const h of ["## Decisión", "## Alternativas descartadas", "## Qué se resigna"]) expect(a.text, `${a.name} ${h}`).toContain(h);
    }
  });

  test("Aceptado exactamente donde hay fila decidida", () => {
    const accepted = adrs.filter((a) => a.estado.startsWith("Aceptado")).map((a) => a.num);
    expect(accepted).toEqual(ACCEPTED);
  });

  test("la marca enmendado (P0) está exactamente en los ADR que lista 03 §11 (D-196)", () => {
    expect(AMENDED.length).toBeGreaterThan(0);
    const marked = adrs.filter((a) => a.estado.includes("enmendado (P0)")).map((a) => a.num);
    expect(marked).toEqual(AMENDED);
    for (const n of AMENDED) expect(byNum(n)?.text, `ADR-${n}`).toMatch(/## Enmendado \(P0\)\n\n.+\n\n.+/);
  });

  test("ADR-008 ya dice observador multimodal (enmienda de texto de P0)", () => {
    expect(byNum(8)?.text).toMatch(/## Decisión\n\nObservador \*\*multimodal\*\*/);
  });
});
