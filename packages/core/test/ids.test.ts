import { describe, expect, test } from "vitest";
import { InvalidIdError, parseId, toId, type MissionId, type NpcId } from "../src/index";

describe("ids de dominio", () => {
  test("toId acepta un string no vacío sin espacios y conserva el valor", () => {
    const id: MissionId = toId("mission", "M1.1");
    expect(id).toBe("M1.1");
  });

  test("toId rechaza vacío y espacios nombrando la clase", () => {
    expect(() => toId("npc", "")).toThrow(InvalidIdError);
    expect(() => toId("npc", "NPC MAYA")).toThrow(/"npc"/);
    try {
      toId("npc", " ");
    } catch (err) {
      expect((err as InvalidIdError).kind).toBe("npc");
    }
  });

  test("el mensaje recorta valores largos", () => {
    const long = `a ${"x".repeat(100)}`;
    expect(() => toId("scene", long)).toThrow(/…/);
  });

  test("parseId devuelve null en vez de lanzar", () => {
    const ok: NpcId | null = parseId("npc", "NPC-MAYA");
    expect(ok).toBe("NPC-MAYA");
    expect(parseId("npc", "con espacio")).toBeNull();
  });
});
