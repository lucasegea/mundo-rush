// @vitest-environment jsdom
// Open-world-3d T7b, LK3 enmendado (D-840): el esqueleto se elige en el punto de uso. Se monta Character (sin canvas:
// useFrame no corre y la carga de cuerpos se espía) y se mira qué esqueleto pide cargar. Con un look de prueba KayKit
// sobre el muelle (relieve) y las reglas de distancia de NPC del mundo abierto encendidas, carga RIGS.kaykit: el
// esqueleto sale del look, nunca de distanceRules, del relieve ni del mundo abierto.
import { DEFAULT_LOOK, PAINTED_LOOK, type LookId, type WorldLook } from "@lg/art";
import { prepareDiorama, type DioramaLayout } from "@lg/core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Character } from "../src/world/actors/Character";
import type { CharacterLook } from "../src/world/actors/looks";
import { RIGS, type RigSpec } from "../src/world/actors/rigs";
import { buildDioramaScene } from "../src/world/dioramas/scene";
import { compiledUniverseClientContent } from "./helpers";

const loads = vi.hoisted(() => [] as RigSpec[]);
vi.mock("@react-three/fiber", () => ({ useFrame: () => {} }));
vi.mock("../src/world/actors/characterAssets", () => ({
  loadCharacterAssets: (_body: unknown, _lod: unknown, rig: RigSpec) => {
    loads.push(rig);
    return new Promise(() => {}); // nunca llega: queda el cuerpo de cápsulas
  },
}));

const PERSON: CharacterLook = { body: "tunica", shirt: "casa-1", pants: "pantalon", skin: "piel", hair: "pelo", hairStyle: "casquete", hat: "gorra", scarf: "bufanda", scale: 1 };
/** Un look de prueba (no del catálogo): DEFAULT_LOOK con el esqueleto KayKit. */
const KAYKIT_TEST_LOOK: WorldLook = { ...DEFAULT_LOOK, id: "prueba-kaykit" as LookId, characters: { ...DEFAULT_LOOK.characters, rig: "kaykit" } };

const mount = (cast: WorldLook["characters"] | null, distanceRules: boolean): RigSpec | undefined => {
  loads.length = 0;
  render(<Character id="npc-prueba" look={PERSON} pose={() => ({ x: 0, z: 0, speed: 0, yaw: null })} cut={false} cast={cast} distanceRules={distanceRules} />);
  cleanup();
  expect(loads).toHaveLength(1);
  return loads[0];
};

beforeEach(() => {
  // react-dom no conoce <primitive> (es de R3F) y avisa por console.error: es ruido del montaje sin canvas.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("LK3: Character carga el esqueleto del look (cast), no el de distanceRules ni del relieve", () => {
  test("look de prueba KayKit sobre el muelle (relieve) con reglas de NPC del mundo abierto: carga RIGS.kaykit", () => {
    const muelle = (compiledUniverseClientContent("U-GALEANO")["dioramas.json"] as DioramaLayout[]).find((d) => d.id === "muelle") as DioramaLayout;
    const scene = buildDioramaScene(prepareDiorama(muelle), "reduced", "low", KAYKIT_TEST_LOOK);
    expect(scene.picker).not.toBeNull(); // relieve: sí
    const cast = scene.look.characters;
    scene.dispose();
    expect(mount(cast, true)).toBe(RIGS.kaykit);
    expect(mount(cast, false)).toBe(RIGS.kaykit);
  });

  test("DEFAULT_LOOK carga quaternius con o sin reglas de distancia; el pintado y sin cast, KayKit", () => {
    for (const rules of [true, false]) {
      expect(mount(DEFAULT_LOOK.characters, rules)).toBe(RIGS.quaternius);
      expect(mount(PAINTED_LOOK.characters, rules)).toBe(RIGS.kaykit);
      expect(mount(null, rules)).toBe(RIGS.kaykit);
    }
  });
});
