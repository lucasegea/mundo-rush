// F4.1: success criteria over the observer (A3: never an invented criterion) and mission effects / prologue
// order / introductions (A7), as pure core rules.
import { describe, expect, test } from "vitest";
import {
  advanceStory, applyCriteriaReports, applyWorldEffects, closesMission, criteriaSatisfied, dedupeEffects, emptyCriteria,
  emptyStoryProgress, emptyWorldProgress, metCriteriaIds, requirementMet, resolveScene, sceneCloseEffects,
  type CriterionDef, type MissionLike, type NpcLike, type StoryProgress,
} from "../src/index";

const DEFS: CriterionDef[] = [{ id: "C1", optional: false }, { id: "C2", optional: false }, { id: "C3", optional: true }];

describe("criterios", () => {
  test("solo cuentan ids de la escena, con cita; lo cumplido no se pierde", () => {
    let st = emptyCriteria();
    const a = applyCriteriaReports(DEFS, st, [
      { criterionId: "C1", met: true, quote: "Hello!" },
      { criterionId: "C9", met: true, quote: "inventado" },
      { criterionId: "C2", met: true, quote: "   " },
    ]);
    expect(a.newlyMet).toEqual(["C1"]);
    expect(a.unknown).toEqual(["C9"]);
    st = a.state;
    expect(criteriaSatisfied(DEFS, st)).toBe(false);
    const b = applyCriteriaReports(DEFS, st, [{ criterionId: "C1", met: false, quote: "" }, { criterionId: "C2", met: true, quote: "I'm Nico." }]);
    expect(b.state.met).toEqual({ C1: "Hello!", C2: "I'm Nico." });
    expect(criteriaSatisfied(DEFS, b.state)).toBe(true);
    expect(metCriteriaIds(DEFS, b.state)).toEqual(["C1", "C2"]);
    // With nothing new it returns the same state.
    expect(applyCriteriaReports(DEFS, b.state, []).state).toBe(b.state);
  });

  test("una escena sin criterios obligatorios no se da por cumplida sola", () => {
    expect(criteriaSatisfied([{ id: "C1", optional: true }], emptyCriteria())).toBe(false);
    expect(criteriaSatisfied([], emptyCriteria())).toBe(false);
  });
});

describe("efectos sobre el mundo (03 §6.4.8)", () => {
  test("flags, intros y fundaciones; una fundación nunca retrocede; sin cambios, mismo objeto", () => {
    const w0 = emptyWorldProgress();
    const w1 = applyWorldEffects(w0, [{ flag: "lamp_bunk_on" }, { intro: "NPC-MAYA" }, { fundacion: "SITIO-TABLERO", estado: "fundado" }]);
    expect(w1).toEqual({ flags: { lamp_bunk_on: true }, intros: ["NPC-MAYA"], foundations: { "SITIO-TABLERO": "fundado" } });
    const w2 = applyWorldEffects(w1, [{ fundacion: "SITIO-TABLERO", estado: "idea" }, { intro: "NPC-MAYA" }, { flag: "lamp_bunk_on" }]);
    expect(w2).toBe(w1);
    expect(applyWorldEffects(w1, [{ fundacion: "SITIO-TABLERO", estado: "crece" }]).foundations["SITIO-TABLERO"]).toBe("crece");
  });

  test("dedupeEffects conserva el primer orden", () => {
    expect(dedupeEffects([{ intro: "NPC-NELL" }, { flag: "a" }, { intro: "NPC-NELL" }, { fundacion: "SITIO-X", estado: "idea" }, { fundacion: "SITIO-X", estado: "idea" }]))
      .toEqual([{ intro: "NPC-NELL" }, { flag: "a" }, { fundacion: "SITIO-X", estado: "idea" }]);
  });
});

// Minimal prologue shaped like the real content (M0.1 → M0.2 → M0.3 → M1.1).
const scene = (id: string, npc: string | null, efectos: MissionLike["escenas"][number]["efectos"] = []) =>
  ({ escena_id: id, npc, efectos, criterios_exito: [{ id: "C1" }] });
const MISSIONS: MissionLike[] = [
  { id: "M0.1", requiere: [], efectos: [], red: { nombra: ["NPC-MAYA"], presenta: [] }, escenas: [scene("M0.1-E1", "NPC-INES", [{ flag: "lamp_bunk_on" }])] },
  { id: "M0.2", requiere: ["M0.1"], efectos: [], escenas: [scene("M0.2-E1", null, [{ flag: "path_lights_crossing" }])] },
  { id: "M0.3", requiere: ["M0.2"], efectos: [], red: { nombra: [], presenta: [{ npc: "NPC-NELL" }] }, escenas: [scene("M0.3-E1", "NPC-MAYA", [{ intro: "NPC-NELL" }])] },
  { id: "M1.1", requiere: ["M0.3", "intro:NPC-NELL"], efectos: [], escenas: [scene("M1.1-E1", "NPC-NELL")] },
  { id: "M1.2", requiere: ["M1.1"], efectos: [{ flag: "mision" }], escenas: [scene("M1.2-E1", "NPC-MAYA"), scene("M1.2-E2", "NPC-OLLIE", [{ intro: "NPC-CALEB" }])] },
];
const NPC: Record<string, NpcLike> = {
  ines: { id: "NPC-INES", requiere_presentacion: false },
  maya: { id: "NPC-MAYA", requiere_presentacion: false },
  nell: { id: "NPC-NELL", requiere_presentacion: true },
  ollie: { id: "NPC-OLLIE", requiere_presentacion: true },
};
const mission = (id: string): MissionLike => MISSIONS.find((m) => m.id === id) as MissionLike;
const close = (p: StoryProgress, missionId: string, sceneId: string): StoryProgress =>
  advanceStory(p, mission(missionId), sceneId, sceneCloseEffects(mission(missionId), sceneId, p));

describe("orden del prólogo y presentaciones (D-168)", () => {
  test("requirementMet: misiones y presentaciones", () => {
    const p: StoryProgress = { completedMissions: ["M0.1"], completedScenes: [], intros: ["NPC-NELL"] };
    expect(requirementMet("M0.1", p)).toBe(true);
    expect(requirementMet("M0.2", p)).toBe(false);
    expect(requirementMet("intro:NPC-NELL", p)).toBe(true);
    expect(requirementMet("intro:NPC-OLLIE", p)).toBe(false);
  });

  test("M0.1 → M0.2 → M0.3 → M1.1, y Nell pide presentación hasta M0.3", () => {
    let p = emptyStoryProgress();
    expect(resolveScene(MISSIONS, NPC.ines ?? null, p)).toEqual({ kind: "scene", missionId: "M0.1", sceneId: "M0.1-E1" });
    expect(resolveScene(MISSIONS, NPC.maya ?? null, p)).toEqual({ kind: "none" });
    expect(resolveScene(MISSIONS, null, p)).toEqual({ kind: "none" });
    expect(resolveScene(MISSIONS, NPC.nell ?? null, p)).toEqual({ kind: "notIntroduced", npcId: "NPC-NELL" });

    expect(sceneCloseEffects(mission("M0.1"), "M0.1-E1", p)).toEqual([{ flag: "lamp_bunk_on" }, { intro: "NPC-MAYA" }]);
    p = close(p, "M0.1", "M0.1-E1");
    expect(p).toEqual({ completedMissions: ["M0.1"], completedScenes: ["M0.1-E1"], intros: ["NPC-MAYA"] });
    expect(resolveScene(MISSIONS, NPC.ines ?? null, p)).toEqual({ kind: "none" });
    expect(resolveScene(MISSIONS, null, p)).toEqual({ kind: "scene", missionId: "M0.2", sceneId: "M0.2-E1" });
    p = close(p, "M0.2", "M0.2-E1");
    expect(resolveScene(MISSIONS, NPC.maya ?? null, p)).toEqual({ kind: "scene", missionId: "M0.3", sceneId: "M0.3-E1" });
    expect(sceneCloseEffects(mission("M0.3"), "M0.3-E1", p)).toEqual([{ intro: "NPC-NELL" }]);
    p = close(p, "M0.3", "M0.3-E1");
    expect(resolveScene(MISSIONS, NPC.nell ?? null, p)).toEqual({ kind: "scene", missionId: "M1.1", sceneId: "M1.1-E1" });
  });

  test("misión de dos escenas: los efectos de la misión salen al cerrar la última", () => {
    let p: StoryProgress = { completedMissions: ["M0.1", "M0.2", "M0.3", "M1.1"], completedScenes: [], intros: ["NPC-NELL", "NPC-OLLIE"] };
    const m = mission("M1.2");
    expect(resolveScene(MISSIONS, NPC.ollie ?? null, p)).toEqual({ kind: "none" }); // Maya's scene first
    expect(closesMission(m, "M1.2-E1", p)).toBe(false);
    expect(sceneCloseEffects(m, "M1.2-E1", p)).toEqual([]);
    p = close(p, "M1.2", "M1.2-E1");
    expect(p.completedMissions).not.toContain("M1.2");
    expect(resolveScene(MISSIONS, NPC.ollie ?? null, p)).toEqual({ kind: "scene", missionId: "M1.2", sceneId: "M1.2-E2" });
    expect(sceneCloseEffects(m, "M1.2-E2", p)).toEqual([{ intro: "NPC-CALEB" }, { flag: "mision" }]);
    p = close(p, "M1.2", "M1.2-E2");
    expect(p.completedMissions).toContain("M1.2");
    expect(p.intros).toContain("NPC-CALEB");
    expect(sceneCloseEffects(m, "M9.9-E1", p)).toEqual([]);
  });
});
