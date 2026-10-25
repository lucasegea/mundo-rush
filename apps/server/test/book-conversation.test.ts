// book-mode slice-1 M5 / AC11: la unidad de conversación estratégica de U-GALEANO (CONV-POTOSI = CONV-C1 "whose cow,
// whose milk?") se juega de punta a punta en modo texto SIN modelo en vivo. Las etiquetas de cada intercambio (lo que
// normalmente da el juez LLM) son un fixture; el motor puro de medidores (@lg/core/conversation) suma por reglas. Se
// afirma que la conversación llega a su estado terminal de deducción (deduccion_objetivo = SAB-VACA-LECHE).
import { expect, test } from "vitest";
import { compilarContenido, type FichaConversacion } from "@lg/content-schema";
import {
  applyExchange, encounterComplete, initialEncounterState,
  type EncounterDef, type EncounterState, type ExchangeLabels,
} from "@lg/core/conversation";
import { leerContenido } from "../../../scripts/content/build.ts";
import { encounterFromSheet } from "../src/conversation/sheet.ts";
import { must, REPO_ROOT } from "./helpers.ts";

/** La ficha real de CONV-POTOSI, compilada en memoria desde content/universes/U-GALEANO/ (sin escribir salida). */
function galeanoSheet(id: string): FichaConversacion {
  const r = compilarContenido(leerContenido(REPO_ROOT, "U-GALEANO"), "dev");
  if (!r.salida) throw new Error(`el universo U-GALEANO no compila:\n${r.errores.slice(0, 8).map((e) => JSON.stringify(e)).join("\n")}`);
  const conversaciones = r.salida.servidor["conversaciones.json"] as FichaConversacion[];
  return must(conversaciones.find((c) => c.id === id), id);
}

/** Un intercambio etiquetado (fixture del juez); por defecto L2 claro, sin actos ni hechos. */
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
  // Fase 1 (conocer al contador): el jugador aprende hechos de niveles crecientes y comparte lo suyo (reciprocidad),
  // hasta llenar el medidor de rapport. Fase 2 (deducir): cuenta qué vino a entender y formula la pregunta del libro
  // (¿a dónde fue a parar la plata?), que es la objeción que destraba la respuesta de la vaca y la leche.
  const script: ExchangeLabels[] = [
    labels({ acts: ["personal_question", "self_disclosure"], npcFacts: ["libros"], playerFacts: ["nombre"] }),
    labels({ acts: ["follow_up_question", "self_disclosure"], npcFacts: ["plata_sale", "espana_pobre"], playerFacts: ["origen"] }),
    labels({ acts: ["follow_up_question"], npcFacts: ["otros_cobran"] }),
    labels({ acts: ["states_errand"] }),
    labels({ objections: [{ id: "pregunta", quality: "yes" }] }),
  ];

  const state = drive(DEF, script);

  // Estado terminal: todos los medidores llenos (conocer + deducir). La deducción de la leche quedó alcanzada.
  expect(encounterComplete(DEF, state)).toBe(true);
  expect(state.meters.every((m) => m.full)).toBe(true);
  // El medidor objetivo (deducir) cumplió sus dos pasos obligatorios: contar y formular la pregunta del libro.
  const deducir = DEF.meters.findIndex((m) => m.id === "deducir");
  expect(state.meters[deducir]?.steps).toMatchObject({ contar: "yes", preguntar: "yes" });
});
