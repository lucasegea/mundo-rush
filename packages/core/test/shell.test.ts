// App phase and panel stack (session and ui slices).
import { describe, expect, test } from "vitest";
import { APP_PHASES, canEnterWorld, phaseAfterBoot, popPanel, pushPanel, type Panel } from "../src/index";

describe("fase de la app", () => {
  test("las fases de 03 §3.3", () => {
    expect([...APP_PHASES]).toEqual(["boot", "onboarding", "world", "scene", "notebook", "dialogOnly"]);
  });
  test("A3: sin WebGL el arranque termina en solo-diálogo", () => {
    expect(phaseAfterBoot("dialog-only")).toBe("dialogOnly");
    expect(phaseAfterBoot("low")).toBe("world");
    expect(canEnterWorld("dialog-only")).toBe(false);
    expect(canEnterWorld("medium")).toBe(true);
  });
});

describe("pila de paneles", () => {
  const menu: Panel = { kind: "mainMenu" };
  test("push y pop sin mutar la entrada", () => {
    const start = Object.freeze([menu]) as readonly Panel[];
    const opened = pushPanel(start, { kind: "settings" });
    expect(opened).toEqual([menu, { kind: "settings" }]);
    expect(popPanel(opened)).toEqual([menu]);
    expect(start).toEqual([menu]);
  });
  test("no duplica el panel de arriba; escenas de NPCs distintos sí se apilan", () => {
    expect(pushPanel([menu], { kind: "mainMenu" })).toEqual([menu]);
    const a = pushPanel([], { kind: "scene", npcId: "NPC-INES" });
    expect(pushPanel(a, { kind: "scene", npcId: "NPC-INES" })).toHaveLength(1);
    expect(pushPanel(a, { kind: "scene", npcId: "NPC-MAYA" })).toHaveLength(2);
    expect(popPanel([])).toEqual([]);
  });
});
