// docs/adr/ (F1.1b A5; A2 adds ADR-027; plan estetica-c M7 adds ADR-028, D-207): exactly 28 files ADR-001..ADR-028 with no gaps, with the status that
// 04/05 ask for (Accepted if there is a `decidida` row) and the "amended (P0)" mark from 03 §11's list.
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
  const estado = /^- \*\*Status:\*\* (.+)$/m.exec(text)?.[1] ?? "";
  return { name, num: m ? Number(m[1]) : Number.NaN, text, estado };
});
const byNum = (n: number) => adrs.find((a) => a.num === n);

// List of P0 amendments as 03 §11 writes it (if 03 changes, this test notices).
const arch = readFileSync(join(ROOT, "docs/03-architecture.md"), "utf8");
const amendParagraph = /\*\*P0 amendments[^\n]*/.exec(arch)?.[0] ?? "";
const AMENDED = [...new Set([...amendParagraph.matchAll(/ADR-(\d{3})/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);

// 04 F1.1b / 05 F1.1b: ADR-001/003 (D-086/D-136), 002 (D-087), 022 (D-139), 023 (D-092), 026 (D-187), 028 (D-207).
// ADR-022 stays Accepted as a record: ADR-028 replaces it and its status says so.
const ACCEPTED = [1, 2, 3, 22, 23, 26, 28];

describe("A5 docs/adr/", () => {
  test("exactamente 28 archivos, todos con la forma ADR-NNN-<slug>.md", () => {
    expect(files).toHaveLength(28);
    for (const name of files) expect(name, name).toMatch(FILE);
  });

  test("numerados 001-028 sin huecos ni repetidos", () => {
    expect(adrs.map((a) => a.num)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
  });

  test("cada archivo abre con su número y tiene estado, decisión, alternativas y qué se resigna", () => {
    for (const a of adrs) {
      const num = String(a.num).padStart(3, "0");
      // Since ADR-028 the header uses colons (new docs go without dashes); earlier ones are not rewritten.
      expect(a.text.startsWith(`# ADR-${num} — `) || a.text.startsWith(`# ADR-${num}: `), a.name).toBe(true);
      expect(a.estado, a.name).toMatch(/^(Accepted|Proposed) /);
      for (const h of ["## Decision", "## Rejected alternatives", "## Trade-offs"]) expect(a.text, `${a.name} ${h}`).toContain(h);
    }
  });

  test("Aceptado exactamente donde hay fila decidida", () => {
    const accepted = adrs.filter((a) => a.estado.startsWith("Accepted")).map((a) => a.num);
    expect(accepted).toEqual(ACCEPTED);
  });

  test("la marca enmendado (P0) está exactamente en los ADR que lista 03 §11 (D-196)", () => {
    expect(AMENDED.length).toBeGreaterThan(0);
    const marked = adrs.filter((a) => a.estado.includes("amended (P0)")).map((a) => a.num);
    expect(marked).toEqual(AMENDED);
    for (const n of AMENDED) expect(byNum(n)?.text, `ADR-${n}`).toMatch(/## Amended \(P0\)\n\n.+\n\n.+/);
  });

  test("ADR-008 ya dice observador multimodal (enmienda de texto de P0)", () => {
    expect(byNum(8)?.text).toMatch(/## Decision\n\nObserver \*\*multimodal\*\*/);
  });

  test("ADR-028 reemplaza a ADR-022 y enmienda a ADR-011 (D-207)", () => {
    expect(byNum(28)?.estado).toMatch(/supersedes ADR-022/);
    expect(byNum(22)?.estado).toMatch(/superseded by ADR-028/);
    expect(byNum(11)?.estado).toMatch(/amended 2026-10-13 by ADR-028/);
  });
});
