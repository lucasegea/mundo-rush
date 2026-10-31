// book-mode slice-1 M5 / AC11: the strategic conversation unit of U-GALEANO (CONV-POTOSI = CONV-C1 "whose cow,
// whose milk?") is played end to end in text mode WITHOUT a live model. The labels of each exchange (what the
// LLM judge normally gives) are a fixture; the pure meters engine (@lg/core/conversation) sums by rules. It
// asserts that the conversation reaches its terminal deduction state (deduccion_objetivo = SAB-VACA-LECHE).
import { expect, test } from "vitest";
import { compilarContenido, type FichaConversacion } from "@lg/content-schema";
import {
  applyExchange, encounterComplete, initialEncounterState,
  type EncounterDef, type EncounterState, type ExchangeLabels,
} from "@lg/core/conversation";
import { leerContenido } from "../../../scripts/content/build.ts";
import { encounterFromSheet } from "../src/conversation/sheet.ts";
import { must, REPO_ROOT } from "./helpers.ts";

/** The real CONV-POTOSI sheet, compiled in memory from content/universes/U-GALEANO/ (without writing output). */
function galeanoSheet(id: string): FichaConversacion {
  const r = compilarContenido(leerContenido(REPO_ROOT, "U-GALEANO"), "dev");
  if (!r.salida) throw new Error(`el universo U-GALEANO no compila:\n${r.errores.slice(0, 8).map((e) => JSON.stringify(e)).join("\n")}`);
  const conversaciones = r.salida.servidor["conversaciones.json"] as FichaConversacion[];
  return must(conversaciones.find((c) => c.id === id), id);
}

/** A labeled exchange (judge fixture); by default clear L2, no acts or facts. */
const labels = (over: Partial<ExchangeLabels> = {}): ExchangeLabels => ({
  language: "L2", comprehensible: 2, acts: [], npcFacts: [], playerFacts: [], objections: [], safety: "none", ...over,
});

const drive = (def: EncounterDef, script: readonly ExchangeLabels[]): EncounterState =>
  script.reduce((state, l) => applyExchange(def, state, l).state, initialEncounterState(def));

const SHEET = galeanoSheet("CONV-POTOSI");
const DEF = encounterFromSheet(SHEET);

test("CONV-POTOSI apunta su deducción a SAB-VACA-LECHE (AC11, D-803)", () => {
  expect(SHEET.deduccion_objetivo).toBe("SAB-VACA-LECHE");
});

test("CONV-POTOSI llega a su estado terminal de deducción con turnos guionados, sin modelo (AC11)", () => {
  // Phase 1 (getting to know the accountant): the player learns facts of increasing levels and shares their own (reciprocity),
  // until the rapport meter fills. Phase 2 (deduce): tells what they came to understand and formulates the book's question
  // (where did the money end up?), which is the objection that unlocks the answer about the cow and the milk.
  const script: ExchangeLabels[] = [
    labels({ acts: ["personal_question", "self_disclosure"], npcFacts: ["libros"], playerFacts: ["nombre"] }),
    labels({ acts: ["follow_up_question", "self_disclosure"], npcFacts: ["plata_sale", "espana_pobre"], playerFacts: ["origen"] }),
    labels({ acts: ["follow_up_question"], npcFacts: ["otros_cobran"] }),
    labels({ acts: ["states_errand"] }),
    labels({ objections: [{ id: "pregunta", quality: "yes" }] }),
  ];

  const state = drive(DEF, script);

  // Terminal state: all meters full (get to know + deduce). The milk deduction was reached.
  expect(encounterComplete(DEF, state)).toBe(true);
  expect(state.meters.every((m) => m.full)).toBe(true);
  // The goal meter (deduce) fulfilled its two mandatory steps: telling and formulating the book's question.
  const deducir = DEF.meters.findIndex((m) => m.id === "deducir");
  expect(state.meters[deducir]?.steps).toMatchObject({ contar: "yes", preguntar: "yes" });
});
