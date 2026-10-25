// AC4: EMIT escribe al menos un archivo por campo del contrato bajo los subpaths canónicos.
// AC5: cada archivo que EMIT escribe parsea y valida contra su esquema de @lg/content-schema (cero errores).
// Teeth: con un ítem inválido, EMIT no escribe NADA (deja el universo intacto).
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  ArchivoGlosario, ArchivoPresentaciones, ArchivoLugares, Diorama, FichaConversacion, Mision, Npc, Saber, Universo,
} from "@lg/content-schema";
import type { z } from "zod";
import { emit, planearEmit } from "../src/stages/emit.ts";
import { parsearIntermedio } from "../src/intermediate.ts";
import type { Intermedio } from "../src/intermediate.ts";

const AQUI = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE = join(AQUI, "..", "fixtures", "sample-intermediate.yaml");

/** subpath canónico escrito por EMIT → esquema con el que el compilador lo valida (conjunto.ts). */
const ESQUEMA_DE: [RegExp, z.ZodType][] = [
  [/^manifiesto\.yaml$/, Universo],
  [/^world\/places\.yaml$/, ArchivoLugares],
  [/^dioramas\/[^/]+\.yaml$/, Diorama],
  [/^npcs\/[^/]+\.yaml$/, Npc],
  [/^red\/presentaciones\.yaml$/, ArchivoPresentaciones],
  [/^missions\/[^/]+\.yaml$/, Mision],
  [/^conversaciones\/[^/]+\.yaml$/, FichaConversacion],
  [/^saberes\/[^/]+\.yaml$/, Saber],
  [/^glossary\/en\.es-AR\.yaml$/, ArchivoGlosario],
];

const esquemaDe = (subpath: string): z.ZodType => {
  const m = ESQUEMA_DE.find(([re]) => re.test(subpath.split("\\").join("/")));
  if (!m) throw new Error(`sin esquema para el subpath emitido: ${subpath}`);
  return m[1];
};

describe("book-analyzer EMIT (M2)", () => {
  let intermedio: Intermedio;
  let outDir: string;

  beforeAll(() => {
    intermedio = parsearIntermedio(readFileSync(FIXTURE, "utf8"));
    outDir = mkdtempSync(join(tmpdir(), "ba-emit-"));
  });
  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  it("AC4: produce al menos un archivo por campo del contrato en su subpath canónico", () => {
    const { archivos, errores } = planearEmit(intermedio);
    expect(errores).toEqual([]);
    const subpaths = archivos.map((a) => a.subpath);
    // Un archivo por campo en scope (manifiesto, diorama, npc, mission, conversacion, saber, glossary) + mundo y red.
    expect(subpaths).toContain("manifiesto.yaml");
    expect(subpaths).toContain("world/places.yaml");
    expect(subpaths.some((s) => /^dioramas\/.+\.yaml$/.test(s))).toBe(true);
    expect(subpaths.some((s) => /^npcs\/.+\.yaml$/.test(s))).toBe(true);
    expect(subpaths).toContain("red/presentaciones.yaml");
    expect(subpaths.some((s) => /^missions\/.+\.yaml$/.test(s))).toBe(true);
    expect(subpaths.some((s) => /^conversaciones\/.+\.yaml$/.test(s))).toBe(true);
    expect(subpaths.some((s) => /^saberes\/.+\.yaml$/.test(s))).toBe(true);
    expect(subpaths).toContain("glossary/en.es-AR.yaml");
  });

  it("AC4: la CLI/emit escribe los archivos bajo content/universes/<id>/ (en el outDir dado)", () => {
    const { escritos, errores } = emit(intermedio, outDir);
    expect(errores).toEqual([]);
    expect(escritos.length).toBe(9);
    // El id nombra el archivo de los tipos "uno por archivo" (así el compilador de M3 pasa id↔nombre).
    expect(escritos).toContain("missions/M1.1.yaml");
    expect(escritos).toContain("npcs/NPC-SAMPLE.yaml");
    expect(escritos).toContain("saberes/SAB-SAMPLE.yaml");
    expect(escritos).toContain("conversaciones/CONV-SAMPLE.yaml");
  });

  it("AC5: cada archivo emitido parsea y valida contra su esquema de content-schema (cero errores)", () => {
    emit(intermedio, outDir);
    const subpaths = planearEmit(intermedio).archivos.map((a) => a.subpath);
    for (const subpath of subpaths) {
      const texto = readFileSync(join(outDir, subpath), "utf8");
      const r = esquemaDe(subpath).safeParse(parse(texto));
      expect(r.success, `${subpath}: ${r.success ? "" : JSON.stringify(r.error.issues)}`).toBe(true);
    }
  });

  it("AC5: el saber emitido conserva clasificacion (D-802) y la conversación deduccion_objetivo (D-803)", () => {
    emit(intermedio, outDir);
    const saber = Saber.parse(parse(readFileSync(join(outDir, "saberes/SAB-SAMPLE.yaml"), "utf8")));
    expect(saber.clasificacion).toBe("book_thesis");
    const conv = FichaConversacion.parse(parse(readFileSync(join(outDir, "conversaciones/CONV-SAMPLE.yaml"), "utf8")));
    expect(conv.deduccion_objetivo).toBe("SAB-SAMPLE");
  });

  it("teeth: con un saber inválido EMIT reporta error y no escribe NADA", () => {
    const roto: Intermedio = {
      ...intermedio,
      saberes: [{ ...(intermedio.saberes?.[0] as object), clasificacion: "no_es_enum" }],
    };
    const dirRoto = mkdtempSync(join(tmpdir(), "ba-emit-roto-"));
    try {
      const { escritos, errores } = emit(roto, dirRoto);
      expect(escritos).toEqual([]);
      expect(errores.length).toBeGreaterThan(0);
      expect(readdirSync(dirRoto)).toEqual([]);
    } finally {
      rmSync(dirRoto, { recursive: true, force: true });
    }
  });
});
