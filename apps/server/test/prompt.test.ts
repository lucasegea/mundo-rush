// F4.1 A5: snapshots del prompt del NPC por NPC del prólogo (Inés en M0.1, Maya en M0.3; Kofi no tiene escena en
// el prólogo). Más las reglas que el constructor siempre agrega: honestidad (D-061), sin corrección explícita (D-070),
// rails de menores, ningún hueco `{{...}}` sin llenar y ningún dato personal.
import { describe, expect, test } from "vitest";
import { emptyWorldProgress } from "@lg/core/scene";
import { readCatalog } from "../src/scene-runtime/catalog.ts";
import { buildNpcPrompt, fillBase, MINOR_RAILS, PromptError } from "../src/scene-runtime/prompt.ts";
import { realContent } from "./helpers.ts";

const catalog = readCatalog(realContent());

function promptFor(npcId: string, missionId: string, sceneId: string, intros: string[] = []) {
  const npc = catalog.npc(npcId);
  const scene = catalog.scene(missionId, sceneId);
  if (!npc || !scene) throw new Error(`falta ${npcId} o ${sceneId} en el contenido`);
  return buildNpcPrompt({ catalog, npc, scene, world: { ...emptyWorldProgress(), intros }, introducedBy: null });
}

const PROLOGUE = [
  { npc: "NPC-INES", mission: "M0.1", scene: "M0.1-E1", intros: [] },
  { npc: "NPC-MAYA", mission: "M0.3", scene: "M0.3-E1", intros: ["NPC-MAYA"] },
] as const;

// Patrones de datos personales: emails, teléfonos, URLs con usuario.
const PERSONAL = [/[\w.+-]+@[\w-]+\.[\w.]+/, /\+?\d[\d\s().-]{7,}\d/];

describe("A5: prompt del NPC por NPC del prólogo", () => {
  test.each(PROLOGUE)("$npc en $scene: snapshot", ({ npc, mission, scene, intros }) => {
    const built = promptFor(npc, mission, scene, [...intros]);
    expect(built.system).toMatchSnapshot();
    expect(built.openingAsModelTurn).toMatchSnapshot();
  });

  test.each(PROLOGUE)("$npc: huecos llenos, reglas S6/L8 presentes, sin datos personales", ({ npc, mission, scene, intros }) => {
    const { system } = promptFor(npc, mission, scene, [...intros]);
    expect(system).not.toMatch(/\{\{[a-z_]+\}\}/);
    expect(system).toMatch(/whether you are real, human, or an AI, answer honestly/); // S6, D-061
    expect(system).toMatch(/This is your ONLY form of correction\. Never say "wrong", "incorrect"/); // L8, D-070
    for (const re of PERSONAL) expect(system).not.toMatch(re);
  });

  test("los rails de menores entran solo para NPCs menores (Maya sí, Inés no)", () => {
    expect(catalog.npc("NPC-MAYA")?.es_menor).toBe(true);
    expect(promptFor("NPC-MAYA", "M0.3", "M0.3-E1", ["NPC-MAYA"]).system).toContain(MINOR_RAILS);
    expect(promptFor("NPC-INES", "M0.1", "M0.1-E1").system).not.toContain(MINOR_RAILS);
  });

  test("Kofi no tiene escena en el prólogo (nada que snapshotear)", () => {
    const prologue = catalog.missions.filter((m) => m.id.startsWith("M0."));
    expect(prologue.flatMap((m) => m.escenas).some((e) => e.npc === "NPC-KOFI")).toBe(false);
  });

  test("un hueco sin valor en el prompt base es un error, nunca se manda `{{...}}` al modelo", () => {
    expect(() => fillBase("Hi {{nope}}", {})).toThrow(PromptError);
    expect(fillBase("Hi {{name}}", { name: "Ines" })).toBe("Hi Ines");
  });
});
