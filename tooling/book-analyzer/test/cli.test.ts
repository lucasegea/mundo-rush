// La CLI corre la cadena entera (INGEST→EXTRACT→DESIGN→LANG-FIT→EMIT) y sus guardas de argumentos.
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.ts";
import { ErrorIntermedio, parsearIntermedio } from "../src/intermediate.ts";

const AQUI = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE = join(AQUI, "..", "fixtures", "sample-intermediate.yaml");

interface Io {
  out: string[];
  err: string[];
}
const io = (): Io & { out: string[]; err: string[] } => ({ out: [], err: [] });
const sink = (o: Io) => ({ out: (l: string) => o.out.push(l), err: (l: string) => o.err.push(l) });

describe("book-analyzer CLI (M2)", () => {
  let outDir: string;
  beforeEach(() => (outDir = mkdtempSync(join(tmpdir(), "ba-cli-"))));
  afterEach(() => rmSync(outDir, { recursive: true, force: true }));

  it("corre la cadena entera y sale 0, escribiendo el universo", () => {
    const o = io();
    const code = runCli(["--book", FIXTURE, "--universe", "U-SAMPLE", "--out", outDir], sink(o));
    expect(code).toBe(0);
    expect(o.out.some((l) => l.includes("book-analyzer OK"))).toBe(true);
    expect(readdirSync(outDir).length).toBeGreaterThan(0);
  });

  it("falta --book o --universe → sale 1 con el uso", () => {
    const o = io();
    expect(runCli(["--universe", "U-SAMPLE"], sink(o))).toBe(1);
    expect(o.err.join("\n")).toContain("uso:");
  });

  it("--universe que no matchea U-XXX → sale 1", () => {
    const o = io();
    expect(runCli(["--book", FIXTURE, "--universe", "galeano", "--out", outDir], sink(o))).toBe(1);
    expect(o.err.join("\n")).toContain("--universe inválido");
  });
});

describe("intermedio: guarda de forma (INGEST stub)", () => {
  it("rechaza una clave desconocida (un typo no se traga un campo)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ba-shape-"));
    const ruta = join(dir, "roto.yaml");
    try {
      writeFileSync(ruta, "npsc: []\n"); // typo de "npcs"
      expect(() => parsearIntermedio("npsc: []\n")).toThrow(ErrorIntermedio);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("acepta JSON (es YAML válido) además de YAML", () => {
    const i = parsearIntermedio('{"manifiesto": {"id": "U-SAMPLE"}}');
    expect(i.manifiesto).toBeTruthy();
  });
});
